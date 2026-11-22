#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.config import load_config
from api_football.mappers.event_mapper import map_events
from api_football.mappers.fixture_mapper import map_fixture
from api_football.mappers.lineup_mapper import map_lineups
from api_football.mappers.player_match_statistics_mapper import map_player_match_statistics
from api_football.mappers.team_statistics_mapper import map_team_season_statistics, map_team_statistics
from api_football.mappers.venue_mapper import map_venue
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import (
    db_connection,
    find_id_by_api_id,
    table_exists,
    upsert_match,
    upsert_match_events,
    upsert_match_lineup,
    upsert_match_lineup_players,
    upsert_match_player_statistics,
    upsert_match_team_statistics,
    upsert_team_goal_statistics,
    upsert_team_lineup_statistics,
    upsert_team_season_statistics,
    upsert_venue,
)
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_leagues import fetch_target_leagues
from api_football.sync.sync_player_profiles import TeamSeason, fetch_players_for_team_season, sync_player_profile_row
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams


BIG5_LEAGUES = {
    39: "Premier League",
    140: "La Liga",
    135: "Serie A",
    78: "Bundesliga",
    61: "Ligue 1",
}
SEASONS = list(range(2026, 2014, -1))


@dataclass(frozen=True)
class LeagueSeason:
    league_api_id: int
    competition_id: int
    competition_season_id: int
    season_id: int
    season_year: int
    name: str


def checkpoint_path(config) -> Path:
    return config.report_file.parent / "api_football_big5_2015_2026_checkpoint.json"


def report_path(config) -> Path:
    return config.report_file.parent / "api_football_big5_2015_2026_report.md"


def load_checkpoint(path: Path) -> Dict[str, Any]:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {"completed": {}}
    completed = data.setdefault("completed", {})
    for key in ["countries", "competitions", "teams", "fixtures", "standings", "team_stats", "players", "match_details"]:
        completed.setdefault(key, [] if key != "countries" else False)
    return data


def save_checkpoint(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def key(league_id: int, season: int) -> str:
    return f"{league_id}:{season}"


def should_stop(client: ApiFootballClient, start_used: int, max_requests: int | None) -> bool:
    if client.budget.remaining() <= 0:
        return True
    if max_requests is None:
        return False
    return int(client.budget.load().get("used", 0)) - start_used >= max_requests


def load_league_seasons(conn, leagues: Iterable[int], seasons: Iterable[int]) -> List[LeagueSeason]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.api_id, c.id, cs.id, s.id, cs.season_year, c.name
            FROM competitions c
            JOIN competition_seasons cs ON cs.competition_id = c.id
            JOIN seasons s ON s.name = cs.season_year::text
            WHERE c.api_id = ANY(%s)
              AND cs.season_year = ANY(%s)
            ORDER BY cs.season_year DESC, c.api_id
            """,
            (list(leagues), list(seasons)),
        )
        return [
            LeagueSeason(
                league_api_id=int(row[0]),
                competition_id=int(row[1]),
                competition_season_id=int(row[2]),
                season_id=int(row[3]),
                season_year=int(row[4]),
                name=row[5],
            )
            for row in cur.fetchall()
        ]


def load_team_seasons(conn, league_season: LeagueSeason) -> List[TeamSeason]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, t.api_id, t.name
            FROM team_competition_seasons tcs
            JOIN teams t ON t.id = tcs.team_id
            WHERE tcs.competition_season_id = %s
              AND t.api_id IS NOT NULL
            ORDER BY t.name
            """,
            (league_season.competition_season_id,),
        )
        return [
            TeamSeason(
                team_id=int(row[0]),
                team_api_id=int(row[1]),
                team_name=row[2],
                competition_season_id=league_season.competition_season_id,
                competition_api_id=league_season.league_api_id,
                competition_name=league_season.name,
                season_year=league_season.season_year,
                is_current=league_season.season_year == 2026,
            )
            for row in cur.fetchall()
        ]


def load_matches(conn, league_season: LeagueSeason, allowed_rounds: set[str] | None = None) -> List[Dict[str, Any]]:
    normalized_rounds = {round_name.lower() for round_name in allowed_rounds or set()}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, api_id, home_team_id, away_team_id, round
            FROM matches
            WHERE competition_season_id = %s
              AND api_id IS NOT NULL
              AND COALESCE(status_short, status, '') IN ('FT', 'AET', 'PEN')
            ORDER BY COALESCE(kickoff_at, match_date), id
            """,
            (league_season.competition_season_id,),
        )
        rows = cur.fetchall()

    matches = [
        {"match_id": row[0], "fixture_api_id": row[1], "home_team_id": row[2], "away_team_id": row[3], "round": row[4]}
        for row in rows
    ]
    if not normalized_rounds:
        return matches

    return [match for match in matches if str(match.get("round") or "").strip().lower() in normalized_rounds]


def sync_team_season_statistics(client: ApiFootballClient, conn, league_season: LeagueSeason) -> int:
    count = 0
    for row in load_team_seasons(conn, league_season):
        payload = client.get(
            "/teams/statistics",
            {"league": league_season.league_api_id, "season": league_season.season_year, "team": row.team_api_id},
        )
        mapped = map_team_season_statistics(payload)
        stat_id = upsert_team_season_statistics(
            conn,
            {
                **mapped,
                "team_id": row.team_id,
                "competition_season_id": league_season.competition_season_id,
            },
        )
        if stat_id:
            upsert_team_goal_statistics(conn, stat_id, mapped.get("goal_timings") or [])
            upsert_team_lineup_statistics(conn, stat_id, mapped.get("lineups") or [])
            count += 1
    return count


def sync_players_for_league_season(client: ApiFootballClient, conn, league_season: LeagueSeason) -> int:
    count = 0
    for row in load_team_seasons(conn, league_season):
        for player_row in fetch_players_for_team_season(client, row):
            if sync_player_profile_row(conn, row, player_row):
                count += 1
    return count


def sync_fixture_detail(client: ApiFootballClient, conn, league_season: LeagueSeason, match: Dict[str, Any]) -> Dict[str, int]:
    fixture_api_id = int(match["fixture_api_id"])
    payload = client.get("/fixtures", {"id": fixture_api_id})
    rows = payload.get("response") or []
    if not rows:
        return {"events": 0, "team_stats": 0, "lineups": 0, "lineup_players": 0, "player_stats": 0}
    item = rows[0]
    venue_id = upsert_venue(conn, map_venue((item.get("fixture") or {}).get("venue") or {}))
    values = map_fixture(item, league_season.competition_id, league_season.season_id, match["home_team_id"], match["away_team_id"])
    values["competition_season_id"] = league_season.competition_season_id
    values["venue_id"] = venue_id
    upsert_match(conn, values)

    detail_errors: list[str] = []

    def get_detail(endpoint: str, params: Dict[str, Any] | None = None) -> list[Dict[str, Any]]:
        try:
            payload = client.get(endpoint, {"fixture": fixture_api_id, **(params or {})})
            return payload.get("response") or []
        except (ApiFootballRateLimit, RequestBudgetExceeded):
            raise
        except Exception as err:
            detail_errors.append(f"{endpoint}: {err}")
            return []

    event_ids = upsert_match_events(conn, match["match_id"], map_events(get_detail("/fixtures/events")))
    team_stat_ids = upsert_match_team_statistics(
        conn,
        match["match_id"],
        map_team_statistics(get_detail("/fixtures/statistics", {"half": "true"})),
    )
    lineup_count = 0
    lineup_player_count = 0
    for lineup in map_lineups(get_detail("/fixtures/lineups")):
        lineup_id = upsert_match_lineup(conn, match["match_id"], lineup)
        team_id = find_id_by_api_id(conn, "teams", int(lineup["team_api_id"])) if lineup.get("team_api_id") else None
        if lineup_id and team_id:
            lineup_count += 1
            lineup_player_count += len(upsert_match_lineup_players(conn, lineup_id, match["match_id"], team_id, lineup.get("players") or []))
    player_stat_ids = upsert_match_player_statistics(
        conn,
        match["match_id"],
        map_player_match_statistics(get_detail("/fixtures/players")),
    )
    result = {
        "events": len(event_ids),
        "team_stats": len(team_stat_ids),
        "lineups": lineup_count,
        "lineup_players": lineup_player_count,
        "player_stats": len(player_stat_ids),
    }
    if detail_errors:
        result["detail_errors"] = len(detail_errors)
    return result


def has_synced_fixture_detail(stats: Dict[str, Any]) -> bool:
    return any(int(stats.get(key) or 0) > 0 for key in ("events", "team_stats", "lineups", "lineup_players", "player_stats"))


def sync_match_details_for_league_season(
    client: ApiFootballClient,
    conn,
    checkpoint: Dict[str, Any],
    checkpoint_file: Path,
    league_season: LeagueSeason,
    max_requests: int | None,
    start_used: int,
    request_delay: float,
    max_no_detail: int | None = None,
    allowed_rounds: set[str] | None = None,
) -> int:
    completed = checkpoint["completed"]["match_details"]
    count = 0
    no_detail_count = 0
    for match in load_matches(conn, league_season, allowed_rounds):
        match_key = str(match["fixture_api_id"])
        if match_key in completed:
            continue
        if max_no_detail and max_no_detail > 0 and no_detail_count >= max_no_detail:
            print(f"  season {league_season.league_api_id}:{league_season.season_year} [move-on]: {no_detail_count} fixtures had no detail")
            break
        if should_stop(client, start_used, max_requests):
            break
        try:
            stats = sync_fixture_detail(client, conn, league_season, match)
            if has_synced_fixture_detail(stats):
                completed.append(match_key)
                count += 1
                status = "done"
            else:
                no_detail_count += 1
                status = "no-detail"
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"  fixture {match_key} [{status}]: {stats}")
        except (ApiFootballRateLimit, RequestBudgetExceeded):
            raise
        except Exception as err:
            conn.rollback()
            print(f"  fixture {match_key} [error]: {err}", flush=True)
        if request_delay:
            time.sleep(request_delay)
    return count


def audit(conn, path: Path) -> None:
    tables = [
        "competitions",
        "competition_seasons",
        "teams",
        "team_competition_seasons",
        "team_season_statistics",
        "players",
        "team_squad_players",
        "player_team_seasons",
        "player_season_statistics",
        "matches",
        "match_events",
        "match_team_statistics",
        "match_lineups",
        "match_lineup_players",
        "match_player_statistics",
    ]
    lines = ["# Big 5 Backfill Report", "", f"Generated: {datetime.now(timezone.utc).isoformat()}", ""]
    with conn.cursor() as cur:
        lines.append("## Counts")
        for table in tables:
            if not table_exists(conn, table):
                continue
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            lines.append(f"- {table}: {cur.fetchone()[0]}")
        lines.extend(["", "## Missing Values"])
        for table in tables:
            if not table_exists(conn, table):
                continue
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                (table,),
            )
            columns = [row[0] for row in cur.fetchall()]
            missing = []
            for column in columns:
                cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE "{column}" IS NULL')
                nulls = int(cur.fetchone()[0])
                unknowns = 0
                cur.execute(
                    """
                    SELECT data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
                    """,
                    (table, column),
                )
                data_type = cur.fetchone()[0]
                if data_type in {"text", "character varying"}:
                    cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE LOWER("{column}") = %s', ("unknown",))
                    unknowns = int(cur.fetchone()[0])
                if nulls or unknowns:
                    missing.append(f"{column}: null={nulls}, unknown={unknowns}")
            lines.append(f"- {table}: " + ("; ".join(missing) if missing else "clean"))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(args) -> None:
    config = load_config()
    if args.execute and not config.api_key:
        raise SystemExit("API_FOOTBALL_KEY is required for --execute.")
    checkpoint_file = checkpoint_path(config)
    checkpoint = load_checkpoint(checkpoint_file)
    client = ApiFootballClient(config)

    if args.dashboard_remaining is not None and args.dashboard_used_percent is not None:
        raise SystemExit("Use only one of --dashboard-remaining or --dashboard-used-percent.")

    if args.dashboard_remaining is not None:
        budget_data = client.budget.load()
        budget_data["used"] = max(0, int(budget_data.get("daily_limit", 100)) - int(args.dashboard_remaining))
        budget_data["usable_limit"] = int(budget_data.get("daily_limit", 100)) - int(budget_data.get("safety_reserve", 7))
        client.budget.save(budget_data)
        print(
            f"Local budget adjusted from dashboard remaining: "
            f"{budget_data['used']}/{budget_data['usable_limit']} usable requests used"
        )

    if args.dashboard_used_percent is not None:
        budget_data = client.budget.load()
        daily_limit = int(budget_data.get("daily_limit", 100))
        budget_data["used"] = max(0, round(daily_limit * (float(args.dashboard_used_percent) / 100)))
        budget_data["usable_limit"] = daily_limit - int(budget_data.get("safety_reserve", 7))
        client.budget.save(budget_data)
        print(
            f"Local budget adjusted from dashboard percent: "
            f"{budget_data['used']}/{budget_data['usable_limit']} usable requests used"
        )

    start_used = int(client.budget.load().get("used", 0))
    selected_leagues = list(BIG5_LEAGUES.keys())
    selected_seasons = [season for season in SEASONS if args.from_season <= season <= args.to_season]

    if not args.execute:
        estimated_core = 1 + 1 + len(selected_leagues) * len(selected_seasons) * 4
        print("Dry run only. Use --execute to write data.")
        print(f"Leagues: {BIG5_LEAGUES}")
        print(f"Seasons: {min(selected_seasons)}-{max(selected_seasons)} ({len(selected_seasons)})")
        print(f"Core estimate before player pagination/match details: {estimated_core} requests")
        print("Full match details require roughly one extra request per fixture and will need multiple API budget days.")
        return

    with db_connection() as conn:
        if not checkpoint["completed"]["countries"]:
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            checkpoint["completed"]["countries"] = True
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"countries: {len(countries)}")

        league_payloads = fetch_target_leagues(client, selected_leagues)
        payload_by_id = {int((row.get("league") or {}).get("id")): row for row in league_payloads}

        for season in selected_seasons:
            for league_id in selected_leagues:
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
                item_key = key(league_id, season)
                payload = payload_by_id.get(league_id)
                if not payload:
                    continue
                if item_key not in checkpoint["completed"]["competitions"]:
                    rows = sync_competitions(client, [payload], conn, skip_images=args.skip_images, season_year=season)
                    if rows and rows[0].get("competition_season_id"):
                        checkpoint["completed"]["competitions"].append(item_key)
                    conn.commit()
                    save_checkpoint(checkpoint_file, checkpoint)
                    print(f"competition {item_key}: {rows[0].get('name') if rows else 'none'}")

        league_seasons = load_league_seasons(conn, selected_leagues, selected_seasons)
        by_key = {key(row.league_api_id, row.season_year): row for row in league_seasons}

        for item_key, row in by_key.items():
            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["teams"]:
                teams = sync_teams(
                    client,
                    conn,
                    row.league_api_id,
                    row.season_year,
                    row.competition_id,
                    row.season_id,
                    row.competition_season_id,
                    skip_images=args.skip_images,
                )
                checkpoint["completed"]["teams"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"teams {item_key}: {len(teams)}")

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["fixtures"]:
                fixtures = sync_fixtures(
                    client,
                    conn,
                    row.league_api_id,
                    row.season_year,
                    row.competition_id,
                    row.season_id,
                    row.competition_season_id,
                )
                checkpoint["completed"]["fixtures"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"fixtures {item_key}: {len(fixtures)}")

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["standings"]:
                standings = sync_standings(client, conn, row.league_api_id, row.season_year, row.competition_season_id)
                checkpoint["completed"]["standings"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"standings {item_key}: {len(standings)}")

            if args.phase in {"all", "team-stats"} and item_key not in checkpoint["completed"]["team_stats"]:
                count = sync_team_season_statistics(client, conn, row)
                checkpoint["completed"]["team_stats"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"team-stats {item_key}: {count}")

            if args.phase in {"all", "players"} and item_key not in checkpoint["completed"]["players"]:
                count = sync_players_for_league_season(client, conn, row)
                checkpoint["completed"]["players"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"players {item_key}: {count}")

            if args.phase in {"all", "match-details"}:
                count = sync_match_details_for_league_season(
                    client,
                    conn,
                    checkpoint,
                    checkpoint_file,
                    row,
                    args.max_requests,
                    start_used,
                    args.request_delay,
                )
                print(f"match-details {item_key}: {count}")

            if should_stop(client, start_used, args.max_requests):
                break

        audit(conn, report_path(config))
        print(f"report: {report_path(config)}")
        budget = client.budget.load()
        print(f"budget: {budget.get('used')}/{budget.get('usable_limit')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill Big 5 leagues from API-Football for seasons 2015-2026.")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--phase", choices=["all", "core", "team-stats", "players", "match-details"], default="all")
    parser.add_argument("--from-season", type=int, default=2015)
    parser.add_argument("--to-season", type=int, default=2026)
    parser.add_argument("--max-requests", type=int)
    parser.add_argument("--request-delay", type=float, default=0.0)
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument(
        "--dashboard-remaining",
        type=int,
        help="Reset the local budget from the API-Football dashboard remaining request count before running.",
    )
    parser.add_argument(
        "--dashboard-used-percent",
        type=float,
        help="Reset the local budget from the API-Football dashboard used percentage before running.",
    )
    args = parser.parse_args()
    try:
        run(args)
    except (RequestBudgetExceeded, ApiFootballRateLimit) as err:
        print(f"Stopped safely: {err}")


if __name__ == "__main__":
    main()
