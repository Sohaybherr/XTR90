#!/usr/bin/env python
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.config import load_config
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection, table_exists
from api_football.sync.backfill_big5_2015_2026 import (
    LeagueSeason,
    key,
    load_checkpoint,
    load_league_seasons,
    save_checkpoint,
    should_stop,
    sync_match_details_for_league_season,
    sync_players_for_league_season,
    sync_team_season_statistics,
)
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_leagues import fetch_target_leagues
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams


CHAMPIONS_LEAGUE_ID = 2
CHAMPIONS_LEAGUE = {CHAMPIONS_LEAGUE_ID: "UEFA Champions League"}
SEASONS = list(range(2026, 2014, -1))


def checkpoint_path(config) -> Path:
    return config.report_file.parent / "api_football_champions_league_2015_2026_checkpoint.json"


def report_path(config) -> Path:
    return config.report_file.parent / "api_football_champions_league_2015_2026_report.md"


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
    lines = [
        "# Champions League Backfill Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "Scope: UEFA Champions League seasons 2015 through 2026.",
        "",
    ]
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


def selected_seasons(from_season: int, to_season: int) -> List[int]:
    return [season for season in SEASONS if from_season <= season <= to_season]


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
    league_ids = list(CHAMPIONS_LEAGUE.keys())
    seasons = selected_seasons(args.from_season, args.to_season)

    if not seasons:
        raise SystemExit("No seasons selected. Use a range between 2015 and 2026.")

    if not args.execute:
        estimated_core = 1 + 1 + len(league_ids) * len(seasons) * 4
        print("Dry run only. Use --execute to write data.")
        print(f"Competition: {CHAMPIONS_LEAGUE}")
        print(f"Seasons: {min(seasons)}-{max(seasons)} ({len(seasons)})")
        print(f"Core estimate before player pagination/match details: {estimated_core} requests")
        print("Full match details require roughly one extra request per fixture and may need multiple API budget windows.")
        return

    with db_connection() as conn:
        if not checkpoint["completed"]["countries"]:
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            checkpoint["completed"]["countries"] = True
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"countries: {len(countries)}")

        league_payloads = fetch_target_leagues(client, league_ids)
        payload_by_id = {int((row.get("league") or {}).get("id")): row for row in league_payloads}

        for season in seasons:
            for league_id in league_ids:
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

        league_seasons: List[LeagueSeason] = load_league_seasons(conn, league_ids, seasons)
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
    parser = argparse.ArgumentParser(
        description="Backfill UEFA Champions League from API-Football for seasons 2015-2026."
    )
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
        if args.request_delay:
            time.sleep(args.request_delay)


if __name__ == "__main__":
    main()
