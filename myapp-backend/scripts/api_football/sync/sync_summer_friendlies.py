#!/usr/bin/env python
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient
from api_football.config import load_config
from api_football.mappers.fixture_mapper import map_fixture
from api_football.mappers.team_mapper import map_team
from api_football.mappers.venue_mapper import map_venue
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import (
    db_connection,
    ensure_legacy_season,
    find_country_id,
    find_id_by_api_id,
    upsert_match,
    upsert_team,
    upsert_team_competition,
    upsert_team_competition_season,
    upsert_venue,
)
from api_football.sync.sync_competitions import sync_competitions


FRIENDLY_LEAGUES = {
    667: "Friendlies Clubs",
    10: "Friendlies",
}


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def default_start() -> date:
    today = date.today()
    return today - timedelta(days=3)


def default_end() -> date:
    today = date.today()
    return today + timedelta(days=21)


def fetch_league_payloads(client: ApiFootballClient, league_ids: list[int]) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    for league_id in league_ids:
        payload = client.get("/leagues", {"id": league_id})
        payloads.extend(payload.get("response") or [])
    return payloads


def upsert_fixture_team(conn, team_payload: dict[str, Any], competition_id: int, season_id: int | None, competition_season_id: int | None) -> int | None:
    team_api_id = team_payload.get("id")
    if not team_api_id:
        return None

    existing_id = find_id_by_api_id(conn, "teams", int(team_api_id))
    if existing_id:
        team_id = existing_id
    else:
        country_id = find_country_id(conn, name=team_payload.get("country"))
        values = map_team(team_payload, country_id=country_id)
        # Do not point the UI at a local logo file unless a downloader has actually created it.
        values["logo_path"] = None
        team_id = upsert_team(conn, values)

    if team_id and season_id:
        upsert_team_competition(conn, team_id, competition_id, season_id)
    if team_id and competition_season_id:
        upsert_team_competition_season(
            conn,
            team_id=team_id,
            competition_season_id=competition_season_id,
            is_active=True,
        )
    return team_id


def sync_friendlies(args: argparse.Namespace) -> None:
    config = load_config()
    client = ApiFootballClient(config)
    league_ids = args.league or list(FRIENDLY_LEAGUES)
    start = parse_date(args.from_date) if args.from_date else default_start()
    end = parse_date(args.to_date) if args.to_date else default_end()
    season_year = args.season or date.today().year

    with db_connection() as conn:
        league_payloads = fetch_league_payloads(client, league_ids)
        competition_rows = sync_competitions(
            client,
            league_payloads,
            conn,
            skip_images=args.skip_images,
            season_year=season_year,
        )
        conn.commit()

        total_synced = 0
        for competition in competition_rows:
            league_api_id = int(competition["league_api_id"])
            if not competition.get("competition_id"):
                continue

            season_id = competition.get("season_id") or ensure_legacy_season(conn, season_year, None, None, True)
            payload = client.get(
                "/fixtures",
                {
                    "league": league_api_id,
                    "season": season_year,
                    "from": start.isoformat(),
                    "to": end.isoformat(),
                },
            )

            synced = 0
            for item in payload.get("response") or []:
                teams = item.get("teams") or {}
                home_team_id = upsert_fixture_team(
                    conn,
                    teams.get("home") or {},
                    int(competition["competition_id"]),
                    season_id,
                    competition.get("competition_season_id"),
                )
                away_team_id = upsert_fixture_team(
                    conn,
                    teams.get("away") or {},
                    int(competition["competition_id"]),
                    season_id,
                    competition.get("competition_season_id"),
                )
                if not home_team_id or not away_team_id or not season_id:
                    continue

                values = map_fixture(
                    item,
                    int(competition["competition_id"]),
                    int(season_id),
                    int(home_team_id),
                    int(away_team_id),
                )
                values["competition_season_id"] = competition.get("competition_season_id")
                values["venue_id"] = upsert_venue(conn, map_venue((item.get("fixture") or {}).get("venue") or {}))
                if upsert_match(conn, values):
                    synced += 1

            conn.commit()
            total_synced += synced
            print(f"Synced {synced} fixtures for {competition.get('name') or FRIENDLY_LEAGUES.get(league_api_id, league_api_id)}")

        print(f"Synced {total_synced} friendly fixtures from {start.isoformat()} to {end.isoformat()}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync summer friendly matches from API-Football.")
    parser.add_argument("--league", type=int, action="append", choices=sorted(FRIENDLY_LEAGUES), help="Friendly league id to sync. Repeatable.")
    parser.add_argument("--season", type=int, help="API-Football season year. Defaults to the current year.")
    parser.add_argument("--from-date", help="Start date in YYYY-MM-DD. Defaults to three days ago.")
    parser.add_argument("--to-date", help="End date in YYYY-MM-DD. Defaults to 21 days ahead.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download competition logos.")
    args = parser.parse_args()

    try:
        sync_friendlies(args)
    except RequestBudgetExceeded as err:
        print(f"Stopped safely: {err}")


if __name__ == "__main__":
    main()
