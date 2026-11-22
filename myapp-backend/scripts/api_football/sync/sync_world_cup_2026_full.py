#!/usr/bin/env python
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.config import load_config
from api_football.mappers.event_mapper import map_events
from api_football.mappers.fixture_mapper import map_fixture
from api_football.mappers.lineup_mapper import map_lineups
from api_football.mappers.player_match_statistics_mapper import map_player_match_statistics
from api_football.mappers.team_statistics_mapper import map_team_statistics
from api_football.mappers.venue_mapper import map_venue
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import (
    db_connection,
    find_id_by_api_id,
    upsert_match,
    upsert_match_events,
    upsert_match_lineup,
    upsert_match_lineup_players,
    upsert_match_player_statistics,
    upsert_match_team_statistics,
    upsert_venue,
)
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_leagues import fetch_target_leagues
from api_football.sync.sync_squads import sync_squad
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams


WORLD_CUP_LEAGUE_ID = 1
WORLD_CUP_SEASON = 2026


@dataclass(frozen=True)
class CompetitionSeason:
    league_api_id: int
    competition_id: int
    competition_season_id: int
    season_id: int
    season_year: int
    name: str


def load_matches(conn, competition_season_id: int) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, api_id, home_team_id, away_team_id
            FROM matches
            WHERE competition_season_id = %s
              AND api_id IS NOT NULL
            ORDER BY COALESCE(kickoff_at, match_date), id
            """,
            (competition_season_id,),
        )
        return [
            {
                "match_id": row[0],
                "fixture_api_id": row[1],
                "home_team_id": row[2],
                "away_team_id": row[3],
            }
            for row in cur.fetchall()
        ]


def sync_fixture_detail(client: ApiFootballClient, conn, season: CompetitionSeason, match: Dict[str, Any]) -> Dict[str, int]:
    payload = client.get("/fixtures", {"id": match["fixture_api_id"]})
    rows = payload.get("response") or []
    if not rows:
        return {"events": 0, "team_stats": 0, "lineups": 0, "lineup_players": 0, "player_stats": 0}

    item = rows[0]
    venue_id = upsert_venue(conn, map_venue((item.get("fixture") or {}).get("venue") or {}))
    values = map_fixture(item, season.competition_id, season.season_id, match["home_team_id"], match["away_team_id"])
    values["competition_season_id"] = season.competition_season_id
    values["venue_id"] = venue_id
    upsert_match(conn, values)

    event_ids = upsert_match_events(conn, match["match_id"], map_events(item))
    team_stat_ids = upsert_match_team_statistics(conn, match["match_id"], map_team_statistics(item))

    lineup_count = 0
    lineup_player_count = 0
    for lineup in map_lineups(item):
        lineup_id = upsert_match_lineup(conn, match["match_id"], lineup)
        team_id = find_id_by_api_id(conn, "teams", int(lineup["team_api_id"])) if lineup.get("team_api_id") else None
        if lineup_id and team_id:
            lineup_count += 1
            lineup_player_count += len(
                upsert_match_lineup_players(conn, lineup_id, match["match_id"], team_id, lineup.get("players") or [])
            )

    player_stat_ids = upsert_match_player_statistics(conn, match["match_id"], map_player_match_statistics(item))
    return {
        "events": len(event_ids),
        "team_stats": len(team_stat_ids),
        "lineups": lineup_count,
        "lineup_players": lineup_player_count,
        "player_stats": len(player_stat_ids),
    }


def run(args) -> None:
    config = load_config()
    if not config.api_key:
        raise SystemExit("API_FOOTBALL_KEY is required.")

    client = ApiFootballClient(config)
    start_used = int(client.budget.load().get("used", 0))

    with db_connection() as conn:
        if args.sync_countries:
            countries = sync_countries(client, conn, skip_images=False)
            conn.commit()
            print(f"countries: {len(countries)}")

        league_payloads = fetch_target_leagues(client, [WORLD_CUP_LEAGUE_ID])
        if not league_payloads:
            raise SystemExit("World Cup league id 1 was not returned by /leagues.")

        competition_rows = sync_competitions(
            client,
            league_payloads,
            conn,
            skip_images=False,
            season_year=WORLD_CUP_SEASON,
        )
        conn.commit()
        competition = competition_rows[0]
        season = CompetitionSeason(
            league_api_id=WORLD_CUP_LEAGUE_ID,
            competition_id=int(competition["competition_id"]),
            competition_season_id=int(competition["competition_season_id"]),
            season_id=int(competition["season_id"]),
            season_year=WORLD_CUP_SEASON,
            name=competition["name"],
        )
        print(f"competition: {season.name} {season.season_year}")

        teams = sync_teams(
            client,
            conn,
            season.league_api_id,
            season.season_year,
            season.competition_id,
            season.season_id,
            season.competition_season_id,
            skip_images=False,
        )
        conn.commit()
        print(f"teams: {len(teams)}")

        fixtures = sync_fixtures(
            client,
            conn,
            season.league_api_id,
            season.season_year,
            season.competition_id,
            season.season_id,
            season.competition_season_id,
        )
        conn.commit()
        print(f"fixtures: {len(fixtures)}")

        standings = sync_standings(client, conn, season.league_api_id, season.season_year, season.competition_season_id)
        conn.commit()
        print(f"standings: {len(standings)}")

        squad_count = 0
        player_count = 0
        for team in teams:
            if args.max_requests and int(client.budget.load().get("used", 0)) - start_used >= args.max_requests:
                break
            try:
                players = sync_squad(client, conn, int(team["team_api_id"]), int(team["team_id"]), skip_images=False)
            except ApiFootballRateLimit as err:
                print(f"Stopped on rate limit while syncing squad {team.get('name')}: {err}")
                break
            conn.commit()
            squad_count += 1
            player_count += len(players)
            print(f"squad {team.get('name')}: {len(players)} players")
            if args.request_delay:
                time.sleep(args.request_delay)
        print(f"squads: {squad_count}; squad players: {player_count}")

        detail_count = 0
        totals = {"events": 0, "team_stats": 0, "lineups": 0, "lineup_players": 0, "player_stats": 0}
        for match in load_matches(conn, season.competition_season_id):
            if args.max_requests and int(client.budget.load().get("used", 0)) - start_used >= args.max_requests:
                break
            stats = sync_fixture_detail(client, conn, season, match)
            conn.commit()
            detail_count += 1
            for name, value in stats.items():
                totals[name] += value
            print(f"fixture {match['fixture_api_id']}: {stats}")
            if args.request_delay:
                time.sleep(args.request_delay)

        budget = client.budget.load()
        print(f"match_details: {detail_count}")
        print(f"detail_totals: {totals}")
        print(f"budget: {budget.get('used')}/{budget.get('usable_limit')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fully sync FIFA World Cup 2026 from API-Football.")
    parser.add_argument("--request-delay", type=float, default=0.5)
    parser.add_argument("--max-requests", type=int)
    parser.add_argument("--sync-countries", action="store_true")
    args = parser.parse_args()
    try:
        run(args)
    except RequestBudgetExceeded as err:
        print(f"Stopped safely: {err}")


if __name__ == "__main__":
    main()
