#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.config import load_config
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection, table_exists
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_leagues import fetch_target_leagues
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_squads import sync_squad
from api_football.sync.sync_teams import sync_teams


TARGET_LEAGUES = {
    1: "World Cup",
    39: "Premier League",
    140: "La Liga",
    135: "Serie A",
    78: "Bundesliga",
}


def setup_logging(log_file: Path, *, file_logging: bool) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if file_logging:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        handlers.insert(0, logging.FileHandler(log_file, encoding="utf-8"))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=handlers)


def load_checkpoint(path: Path, resume: bool) -> Dict[str, Any]:
    today = date.today().isoformat()
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        if resume or data.get("date") == today:
            data.setdefault("date", today)
            data.setdefault("completed", {})
            data.setdefault("pending_team_ids", [])
            return data
    return {
        "date": today,
        "completed": {
            "status": False,
            "countries": False,
            "leagues": False,
            "teams": [],
            "fixtures": [],
            "standings": [],
            "squads": [],
        },
        "pending_team_ids": [],
    }


def save_checkpoint(path: Path, checkpoint: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")


def expected_plan(selected_leagues: List[int], usable_limit: int, max_requests: int | None = None, only: str | None = None) -> Dict[str, Any]:
    league_count = len(selected_leagues)
    fixed = 1 + 1 + 1 + league_count
    fixtures = 0 if only == "teams" else league_count
    standings = 0 if only == "teams" else league_count
    fixed += fixtures + standings
    squad_budget = 0 if only == "teams" else max(0, usable_limit - fixed)
    if max_requests is not None:
        squad_budget = max(0, min(squad_budget, max_requests - fixed))
    return {
        "status": 1,
        "countries": 1,
        "leagues": 1,
        "teams": league_count,
        "fixtures": fixtures,
        "standings": standings,
        "players_squads": squad_budget,
        "total": fixed + squad_budget,
    }


def checkpoint_key(league_id: int, season_year: int) -> str:
    return f"{league_id}:{season_year}"


def budget_label(client: ApiFootballClient) -> str:
    data = client.budget.load()
    return f"{data.get('used', 0)}/{data.get('usable_limit', 0)}"


def load_pending_teams_from_db(conn) -> List[Dict[str, Any]]:
    if not table_exists(conn, "teams"):
        return []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, api_id, name
            FROM teams
            WHERE api_id IS NOT NULL
            ORDER BY id
            """
        )
        return [
            {"team_api_id": row[1], "team_id": row[0], "name": row[2]}
            for row in cur.fetchall()
        ]


def validate_environment(config, conn, *, create_paths: bool) -> List[str]:
    warnings = []
    required_tables = ["countries", "competitions", "teams", "players", "matches", "users"]
    optional_tables = ["competition_seasons", "standings", "api_sync_runs"]
    for table in required_tables:
        if not table_exists(conn, table):
            warnings.append(f"Missing required table: {table}")
    for table in optional_tables:
        if not table_exists(conn, table):
            warnings.append(f"Missing optional bootstrap table: {table}; apply migration 002 before real sync.")
    for subdir in ["flags", "teams", "players", "competitions", "news"]:
        path = config.assets_root / subdir
        if create_paths:
            path.mkdir(parents=True, exist_ok=True)
        elif not path.exists():
            warnings.append(f"Missing backend asset directory: {path}")
    return warnings


def write_report(config, conn, budget_data: Dict[str, Any], checkpoint: Dict[str, Any], warnings: List[str]) -> None:
    counts = {}
    with conn.cursor() as cur:
        for table in ["countries", "competitions", "competition_seasons", "teams", "players", "matches", "standings"]:
            if table_exists(conn, table):
                cur.execute(f'SELECT COUNT(*) FROM "{table}"')
                counts[table] = cur.fetchone()[0]

    lines = [
        "# API-Football Bootstrap Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Counts",
    ]
    for table, count in counts.items():
        lines.append(f"- {table}: {count}")
    lines.extend(
        [
            "",
            "## Request Budget",
            f"- Used: {budget_data.get('used', 0)}",
            f"- Usable limit: {budget_data.get('usable_limit', 93)}",
            f"- Remaining: {int(budget_data.get('usable_limit', 93)) - int(budget_data.get('used', 0))}",
            "",
            "## Pending",
            f"- Pending team IDs: {checkpoint.get('pending_team_ids', [])}",
            "",
            "## Warnings",
        ]
    )
    lines.extend([f"- {warning}" for warning in warnings] or ["- None"])
    config.report_file.parent.mkdir(parents=True, exist_ok=True)
    config.report_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_dry_run(args, config) -> None:
    selected = [args.league] if args.league else list(TARGET_LEAGUES.keys())
    usable_limit = config.daily_limit - config.safety_reserve
    plan = expected_plan(selected, usable_limit, args.max_requests, args.only)
    print("Dry run only. No API calls, database writes, or image downloads will happen.")
    print(f"Target leagues: {', '.join(f'{league_id} {TARGET_LEAGUES.get(league_id, '')}' for league_id in selected)}")
    if args.season:
        print(f"Requested API-Football season: {args.season}")
        if selected == [1]:
            print("Note: World Cup season=2026 means the 2026 tournament.")
        else:
            print("Note: API-Football season=2026 usually means the 2026/27 club season.")
    if args.only:
        print(f"Only syncing: {args.only}")
    print(f"Expected requests: {plan['total']}/{usable_limit}")
    print(json.dumps(plan, indent=2))
    with db_connection() as conn:
        warnings = validate_environment(config, conn, create_paths=False)
        for warning in warnings:
            print(f"Warning: {warning}")
    print(f"Backend assets root: {config.assets_root}")
    print(f"Budget file: {config.budget_file}")
    print(f"Checkpoint file: {config.checkpoint_file}")


def run_execute(args, config) -> None:
    if not config.api_key:
        raise SystemExit("API_FOOTBALL_KEY is required for --execute.")

    selected = [args.league] if args.league else list(TARGET_LEAGUES.keys())
    client = ApiFootballClient(config)
    if args.dashboard_remaining is not None:
        if args.dashboard_remaining < 0:
            raise SystemExit("--dashboard-remaining cannot be negative.")
        budget_data = client.budget.load()
        budget_data["used"] = max(0, int(budget_data.get("daily_limit", 100)) - int(args.dashboard_remaining))
        budget_data["usable_limit"] = int(budget_data.get("daily_limit", 100)) - int(budget_data.get("safety_reserve", 7))
        client.budget.save(budget_data)
        print(
            f"Local budget adjusted from dashboard: {budget_data['used']}/{budget_data['usable_limit']} usable requests used"
        )
    run_start_used = int(client.budget.load().get("used", 0))
    checkpoint = load_checkpoint(config.checkpoint_file, args.resume)
    warnings: List[str] = []

    with db_connection() as conn:
        warnings.extend(validate_environment(config, conn, create_paths=True))

        if not checkpoint["completed"].get("status"):
            status = client.get("/status")
            logging.info("endpoint=/status entity=status api_id= message=status checked")
            checkpoint["completed"]["status"] = True
            save_checkpoint(config.checkpoint_file, checkpoint)
            print(f"[{budget_label(client)}] Checked API status")

        if not checkpoint["completed"].get("countries"):
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            checkpoint["completed"]["countries"] = True
            save_checkpoint(config.checkpoint_file, checkpoint)
            conn.commit()
            print(f"[{budget_label(client)}] Synced countries: {len(countries)}")

        if not checkpoint["completed"].get("leagues"):
            league_payloads = fetch_target_leagues(client, selected)
            checkpoint["league_payloads"] = league_payloads
            checkpoint["completed"]["leagues"] = True
            save_checkpoint(config.checkpoint_file, checkpoint)
        else:
            league_payloads = checkpoint.get("league_payloads", [])

        found_ids = {int((row.get("league") or {}).get("id")) for row in league_payloads}
        for league_id in selected:
            if league_id not in found_ids:
                warnings.append(f"League {league_id} was not available from /leagues and was skipped.")

        competition_rows = sync_competitions(
            client,
            league_payloads,
            conn,
            skip_images=args.skip_images,
            season_year=args.season,
        )
        conn.commit()

        all_teams: List[Dict[str, Any]] = []
        if args.only == "squads":
            pending = checkpoint.get("pending_team_ids") or load_pending_teams_from_db(conn)
            checkpoint["pending_team_ids"] = pending
            save_checkpoint(config.checkpoint_file, checkpoint)
        else:
            pending = []
        for comp in competition_rows:
            if args.only == "squads":
                continue
            league_id = int(comp["league_api_id"])
            if not comp.get("season_year"):
                wanted = f" {args.season}" if args.season else ""
                warnings.append(f"No usable season{wanted} for league {league_id}; skipped league details.")
                continue
            season_key = checkpoint_key(league_id, int(comp["season_year"]))
            if season_key not in checkpoint["completed"].get("teams", []):
                teams = sync_teams(
                    client,
                    conn,
                    league_id,
                    int(comp["season_year"]),
                    int(comp["competition_id"]),
                    comp.get("season_id"),
                    comp.get("competition_season_id"),
                    skip_images=args.skip_images,
                )
                if teams:
                    checkpoint["completed"]["teams"].append(season_key)
                else:
                    warnings.append(
                        f"No teams returned for league {league_id} season {comp['season_year']}; step left incomplete."
                    )
                save_checkpoint(config.checkpoint_file, checkpoint)
                conn.commit()
                print(f"[{budget_label(client)}] Synced teams for {comp['name']}: {len(teams)}")
            else:
                teams = []
            all_teams.extend(teams)

            if args.only == "teams":
                continue

            if season_key not in checkpoint["completed"].get("fixtures", []) and comp.get("season_id"):
                fixtures = sync_fixtures(
                    client,
                    conn,
                    league_id,
                    int(comp["season_year"]),
                    int(comp["competition_id"]),
                    int(comp["season_id"]),
                    comp.get("competition_season_id"),
                )
                if fixtures:
                    checkpoint["completed"]["fixtures"].append(season_key)
                else:
                    warnings.append(
                        f"No fixtures returned for league {league_id} season {comp['season_year']}; step left incomplete."
                    )
                save_checkpoint(config.checkpoint_file, checkpoint)
                conn.commit()
                print(f"[{budget_label(client)}] Synced fixtures for {comp['name']}: {len(fixtures)}")

            if season_key not in checkpoint["completed"].get("standings", []):
                standings = sync_standings(
                    client,
                    conn,
                    league_id,
                    int(comp["season_year"]),
                    comp.get("competition_season_id"),
                )
                if standings:
                    checkpoint["completed"]["standings"].append(season_key)
                else:
                    warnings.append(
                        f"No standings returned for league {league_id} season {comp['season_year']}; step left incomplete."
                    )
                save_checkpoint(config.checkpoint_file, checkpoint)
                conn.commit()
                print(f"[{budget_label(client)}] Synced standings for {comp['name']}: {len(standings)}")

        if args.only != "squads":
            pending = checkpoint.get("pending_team_ids") or [
                {"team_api_id": item["team_api_id"], "team_id": item["team_id"], "name": item["name"]}
                for item in all_teams
                if item.get("team_api_id") and item.get("team_id")
            ]
        checkpoint["pending_team_ids"] = pending

        if args.only == "teams":
            budget_data = client.budget.load()
            write_report(config, conn, budget_data, checkpoint, warnings)
            print(f"Report written: {config.report_file}")
            return

        last_squad_request_at: float | None = None
        while pending and client.budget.remaining() > 0:
            run_used = int(client.budget.load()["used"]) - run_start_used
            if args.max_requests is not None and run_used >= args.max_requests:
                break
            team = pending.pop(0)
            if team["team_api_id"] in checkpoint["completed"].get("squads", []):
                continue
            if last_squad_request_at is not None and args.request_delay > 0:
                elapsed = time.monotonic() - last_squad_request_at
                if elapsed < args.request_delay:
                    wait_seconds = args.request_delay - elapsed
                    print(f"Waiting {wait_seconds:.1f}s for API-Football per-minute limit...")
                    time.sleep(wait_seconds)
            try:
                players = sync_squad(
                    client,
                    conn,
                    int(team["team_api_id"]),
                    int(team["team_id"]),
                    skip_images=args.skip_images,
                )
                last_squad_request_at = time.monotonic()
            except ApiFootballRateLimit as err:
                pending.insert(0, team)
                checkpoint["pending_team_ids"] = pending
                save_checkpoint(config.checkpoint_file, checkpoint)
                conn.commit()
                warnings.append(f"Per-minute rate limit reached while syncing {team.get('name')}; resume after cooldown.")
                print(f"Stopped safely on API-Football per-minute limit: {err}")
                break
            if not players:
                checkpoint["completed"].setdefault("empty_squads", []).append(team["team_api_id"])
                checkpoint["pending_team_ids"] = pending
                save_checkpoint(config.checkpoint_file, checkpoint)
                conn.commit()
                warnings.append(
                    f"No players returned for team {team.get('name')} ({team['team_api_id']}); skipped."
                )
                print(
                    f"[{budget_label(client)}] Squad sync returned 0 players for {team.get('name')}; skipped."
                )
                continue
            checkpoint["completed"]["squads"].append(team["team_api_id"])
            checkpoint["pending_team_ids"] = pending
            save_checkpoint(config.checkpoint_file, checkpoint)
            conn.commit()
            print(f"[{budget_label(client)}] Synced squad for {team.get('name')}: {len(players)} players")

        if pending:
            print(f"Stopped safely with {len(pending)} squad(s) pending. Resume tomorrow or rerun with --resume.")

        budget_data = client.budget.load()
        write_report(config, conn, budget_data, checkpoint, warnings)
        print(f"Report written: {config.report_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap top leagues from API-Football.")
    parser.add_argument("--dry-run", action="store_true", help="Plan only. No API calls, writes, or image downloads.")
    parser.add_argument("--execute", action="store_true", help="Run real API-Football sync.")
    parser.add_argument("--max-requests", type=int, help="Stop after this many used requests.")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download images.")
    parser.add_argument("--league", type=int, choices=sorted(TARGET_LEAGUES), help="Sync only one target league API id.")
    parser.add_argument("--season", type=int, help="API-Football season start year, e.g. 2026 for 2026/27.")
    parser.add_argument("--only", choices=["teams", "squads"], help="Limit sync to a single resource group.")
    parser.add_argument(
        "--request-delay",
        type=float,
        default=7.0,
        help="Seconds to wait between squad API requests to avoid API-Football per-minute limits.",
    )
    parser.add_argument(
        "--dashboard-remaining",
        type=int,
        help="Reset the local budget from the API-Football dashboard remaining request count before running.",
    )
    args = parser.parse_args()

    config = load_config()
    setup_logging(config.log_file, file_logging=args.execute)

    if not args.execute:
        run_dry_run(args, config)
        return

    try:
        run_execute(args, config)
    except RequestBudgetExceeded as err:
        print(f"Stopped safely: {err}")


if __name__ == "__main__":
    main()
