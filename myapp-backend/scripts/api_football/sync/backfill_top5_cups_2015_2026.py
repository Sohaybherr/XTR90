#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
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
from api_football.mappers.fixture_mapper import map_fixture
from api_football.mappers.team_mapper import map_team
from api_football.mappers.venue_mapper import map_venue
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import (
    db_connection,
    find_country_id,
    find_id_by_api_id,
    upsert_match,
    upsert_team,
    upsert_team_competition,
    upsert_team_competition_season,
    upsert_team_venue,
    upsert_venue,
)
from api_football.sync.backfill_big5_2015_2026 import (
    LeagueSeason,
    audit as audit_common,
    key,
    load_checkpoint,
    load_league_seasons,
    save_checkpoint,
    should_stop,
    sync_match_details_for_league_season,
)
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams


TOP5_DOMESTIC_CUPS = {
    45: "FA Cup",
    143: "Copa del Rey",
    137: "Coppa Italia",
    81: "DFB Pokal",
    66: "Coupe de France",
}
DOMESTIC_CUP_DETAIL_ROUNDS = {
    "16th Finals",
    "16th finals",
    "1/16-finals",
    "1/16 finals",
    "Round of 32",
    "8th Finals",
    "8th finals",
    "Eighth Finals",
    "1/8-finals",
    "1/8 finals",
    "Last 16",
    "Round of 16",
    "Quarter-finals",
    "Quarter finals",
    "Semi-finals",
    "Semi finals",
    "Final",
}
SEASONS = list(range(2026, 2014, -1))


def checkpoint_path(config) -> Path:
    return config.report_file.parent / "api_football_top5_cups_2015_2026_checkpoint.json"


def report_path(config) -> Path:
    return config.report_file.parent / "api_football_top5_cups_2015_2026_report.md"


def selected_seasons(from_season: int, to_season: int) -> List[int]:
    return [season for season in SEASONS if from_season <= season <= to_season]


def selected_cup_ids(cup: str | None) -> List[int]:
    if not cup:
        return list(TOP5_DOMESTIC_CUPS.keys())

    value = str(cup).strip().lower()
    aliases = {
        "england": 45,
        "fa": 45,
        "fa-cup": 45,
        "fa cup": 45,
        "spain": 143,
        "copa": 143,
        "copa-del-rey": 143,
        "copa del rey": 143,
        "italy": 137,
        "coppa": 137,
        "coppa-italia": 137,
        "coppa italia": 137,
        "germany": 81,
        "dfb": 81,
        "dfb-pokal": 81,
        "dfb pokal": 81,
        "france": 66,
        "coupe": 66,
        "coupe-de-france": 66,
        "coupe de france": 66,
    }
    if value.isdigit() and int(value) in TOP5_DOMESTIC_CUPS:
        return [int(value)]
    if value in aliases:
        return [aliases[value]]

    valid = ", ".join(f"{api_id}={name}" for api_id, name in TOP5_DOMESTIC_CUPS.items())
    raise SystemExit(f"Unknown cup '{cup}'. Use one of: {valid}")


def ensure_checkpoint_shape(checkpoint: Dict[str, Any]) -> Dict[str, Any]:
    completed = checkpoint.setdefault("completed", {})
    for item in ["countries", "competitions", "teams", "fixtures", "standings", "match_details"]:
        completed.setdefault(item, [] if item != "countries" else False)
    checkpoint.setdefault("errors", [])
    return checkpoint


def record_error(checkpoint: Dict[str, Any], message: str) -> None:
    checkpoint.setdefault("errors", []).append({"at": datetime.now(timezone.utc).isoformat(), "message": message})
    print({"error": message}, flush=True)


def fetch_cup_payload(client: ApiFootballClient, league_id: int, season: int) -> Dict[str, Any] | None:
    payload = client.get("/leagues", {"id": league_id, "season": season})
    rows = payload.get("response") or []
    if rows:
        return rows[0]

    fallback = client.get("/leagues", {"id": league_id})
    for row in fallback.get("response") or []:
        seasons = row.get("seasons") or []
        if any(int(item.get("year") or 0) == season for item in seasons):
            return row
    return None


def sync_cup_competition(client: ApiFootballClient, conn, league_id: int, season: int, *, skip_images: bool) -> Dict[str, Any] | None:
    payload = fetch_cup_payload(client, league_id, season)
    if not payload:
        return None
    rows = sync_competitions(client, [payload], conn, skip_images=skip_images, season_year=season)
    return rows[0] if rows else None


def sync_team_from_fixture(
    client: ApiFootballClient,
    conn,
    team_payload: Dict[str, Any],
    league_season: LeagueSeason,
    *,
    skip_images: bool,
) -> tuple[int | None, bool]:
    api_id = team_payload.get("id")
    if not api_id:
        return None, False

    existing = find_id_by_api_id(conn, "teams", int(api_id))
    if existing:
        upsert_team_competition_season(conn, team_id=existing, competition_season_id=league_season.competition_season_id)
        if league_season.season_id:
            upsert_team_competition(conn, existing, league_season.competition_id, league_season.season_id)
        return existing, False

    country_id = find_country_id(conn, name=team_payload.get("country"))
    values = map_team(team_payload, country_id=country_id)
    values.pop("logo_url", None)

    team_id = upsert_team(conn, values)
    if team_id and league_season.season_id:
        upsert_team_competition(conn, team_id, league_season.competition_id, league_season.season_id)
    if team_id:
        upsert_team_competition_season(conn, team_id=team_id, competition_season_id=league_season.competition_season_id, is_active=True)
    return team_id, bool(team_id)


def sync_cup_fixtures(client: ApiFootballClient, conn, league_season: LeagueSeason, *, skip_images: bool) -> Dict[str, int]:
    payload = client.get("/fixtures", {"league": league_season.league_api_id, "season": league_season.season_year})
    rows = payload.get("response") or []
    stats = {"fixtures": len(rows), "inserted": 0, "team_fallbacks": 0, "unresolved": 0}

    for item in rows:
        teams = item.get("teams") or {}
        home_team_id, home_created = sync_team_from_fixture(client, conn, teams.get("home") or {}, league_season, skip_images=skip_images)
        away_team_id, away_created = sync_team_from_fixture(client, conn, teams.get("away") or {}, league_season, skip_images=skip_images)

        if not home_team_id or not away_team_id:
            stats["unresolved"] += 1
            continue

        stats["team_fallbacks"] += int(home_created) + int(away_created)
        values = map_fixture(item, league_season.competition_id, league_season.season_id, home_team_id, away_team_id)
        values["competition_season_id"] = league_season.competition_season_id
        venue_id = upsert_venue(conn, map_venue((item.get("fixture") or {}).get("venue") or {}))
        if venue_id:
            values["venue_id"] = venue_id
            upsert_team_venue(conn, team_id=home_team_id, venue_id=venue_id, season=league_season.season_year, is_primary=False)
        if upsert_match(conn, values):
            stats["inserted"] += 1

    return stats


def count_matches_for_league_season(conn, league_season: LeagueSeason) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM matches
            WHERE competition_season_id = %s
              AND api_id IS NOT NULL
            """,
            (league_season.competition_season_id,),
        )
        return int(cur.fetchone()[0] or 0)


def count_scope_matches(conn, league_ids: Iterable[int], seasons: Iterable[int]) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM matches m
            JOIN competitions c ON c.id = m.competition_id
            LEFT JOIN competition_seasons cs ON cs.id = m.competition_season_id
            WHERE c.api_id = ANY(%s)
              AND COALESCE(cs.season_year, NULLIF(regexp_replace(m.season_id::text, '\\D', '', 'g'), '')::integer) = ANY(%s)
            """,
            (list(league_ids), list(seasons)),
        )
        return int(cur.fetchone()[0] or 0)


def ensure_competitions(
    client: ApiFootballClient,
    conn,
    checkpoint: Dict[str, Any],
    checkpoint_file: Path,
    league_ids: Iterable[int],
    seasons: Iterable[int],
    *,
    skip_images: bool,
    max_requests: int | None,
    start_used: int,
) -> None:
    for season in seasons:
        for league_id in league_ids:
            if should_stop(client, start_used, max_requests):
                raise RequestBudgetExceeded("Stopped at requested budget window.")
            item_key = key(league_id, season)
            if item_key in checkpoint["completed"]["competitions"]:
                continue
            try:
                row = sync_cup_competition(client, conn, league_id, season, skip_images=skip_images)
                if row and row.get("competition_season_id"):
                    checkpoint["completed"]["competitions"].append(item_key)
                    print(f"competition {item_key}: {row.get('name')}", flush=True)
                else:
                    record_error(checkpoint, f"competition unavailable {item_key}")
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
            except Exception as err:
                conn.rollback()
                record_error(checkpoint, f"competition {item_key}: {err}")
                save_checkpoint(checkpoint_file, checkpoint)


def ensure_fixtures(
    client: ApiFootballClient,
    conn,
    checkpoint: Dict[str, Any],
    checkpoint_file: Path,
    league_seasons: Iterable[LeagueSeason],
    *,
    skip_images: bool,
    max_requests: int | None,
    start_used: int,
    only_missing: bool,
) -> None:
    for row in league_seasons:
        if should_stop(client, start_used, max_requests):
            raise RequestBudgetExceeded("Stopped at requested budget window.")
        item_key = key(row.league_api_id, row.season_year)
        existing_matches = count_matches_for_league_season(conn, row)
        if only_missing and existing_matches > 0:
            continue
        if not only_missing and item_key in checkpoint["completed"]["fixtures"] and existing_matches > 0:
            continue
        try:
            stats = sync_cup_fixtures(client, conn, row, skip_images=skip_images)
            if item_key not in checkpoint["completed"]["fixtures"]:
                checkpoint["completed"]["fixtures"].append(item_key)
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"fixtures {item_key}: {stats}", flush=True)
        except Exception as err:
            conn.rollback()
            record_error(checkpoint, f"fixtures {item_key}: {err}")
            save_checkpoint(checkpoint_file, checkpoint)


def audit(conn, path: Path, league_ids: Iterable[int], seasons: Iterable[int]) -> None:
    audit_common(conn, path)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.api_id, c.name, cs.season_year, COUNT(m.id) AS fixtures
            FROM competitions c
            JOIN competition_seasons cs ON cs.competition_id = c.id
            LEFT JOIN matches m ON m.competition_season_id = cs.id
            WHERE c.api_id = ANY(%s)
              AND cs.season_year = ANY(%s)
            GROUP BY c.api_id, c.name, cs.season_year
            ORDER BY c.name, cs.season_year DESC
            """,
            (list(league_ids), list(seasons)),
        )
        lines = path.read_text(encoding="utf-8").rstrip().splitlines()
        lines.extend(["", "## Top 5 Domestic Cup Scope"])
        for league_id, name, season, fixtures in cur.fetchall():
            lines.append(f"- {name} ({league_id}) {season}: {fixtures} fixtures")
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(args) -> None:
    config = load_config()
    if args.execute and not config.api_key:
        raise SystemExit("API_FOOTBALL_KEY is required for --execute.")

    checkpoint_file = checkpoint_path(config)
    checkpoint = ensure_checkpoint_shape(load_checkpoint(checkpoint_file))
    client = ApiFootballClient(config)
    league_ids = selected_cup_ids(args.cup)
    seasons = selected_seasons(args.from_season, args.to_season)
    if not seasons:
        raise SystemExit("No seasons selected. Use a range between 2015 and 2026.")

    if not args.execute:
        print("Dry run only. Use --execute to write data.")
        print(f"Cups: {dict((cup_id, TOP5_DOMESTIC_CUPS[cup_id]) for cup_id in league_ids)}")
        print(f"Seasons: {min(seasons)}-{max(seasons)}")
        print("match-details will prepare missing competition seasons and fixtures before syncing fixture details.")
        return

    start_used = int(client.budget.load().get("used", 0))

    with db_connection() as conn:
        print(f"existing matches in selected scope: {count_scope_matches(conn, league_ids, seasons)}", flush=True)

        if not checkpoint["completed"]["countries"]:
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            checkpoint["completed"]["countries"] = True
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"countries: {len(countries)}", flush=True)

        if args.phase in {"all", "core"}:
            ensure_competitions(
                client,
                conn,
                checkpoint,
                checkpoint_file,
                league_ids,
                seasons,
                skip_images=args.skip_images,
                max_requests=args.max_requests,
                start_used=start_used,
            )

        league_seasons = load_league_seasons(conn, league_ids, seasons)

        if args.phase == "match-details":
            ensure_fixtures(
                client,
                conn,
                checkpoint,
                checkpoint_file,
                league_seasons,
                skip_images=args.skip_images,
                max_requests=args.max_requests,
                start_used=start_used,
                only_missing=True,
            )
            league_seasons = load_league_seasons(conn, league_ids, seasons)

        for row in league_seasons:
            item_key = key(row.league_api_id, row.season_year)
            if should_stop(client, start_used, args.max_requests):
                break

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["teams"]:
                try:
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
                    print(f"teams {item_key}: {len(teams)}", flush=True)
                except Exception as err:
                    conn.rollback()
                    record_error(checkpoint, f"teams {item_key}: {err}")
                    save_checkpoint(checkpoint_file, checkpoint)

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["fixtures"]:
                ensure_fixtures(
                    client,
                    conn,
                    checkpoint,
                    checkpoint_file,
                    [row],
                    skip_images=args.skip_images,
                    max_requests=args.max_requests,
                    start_used=start_used,
                    only_missing=False,
                )

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["standings"]:
                try:
                    standings = sync_standings(client, conn, row.league_api_id, row.season_year, row.competition_season_id)
                    checkpoint["completed"]["standings"].append(item_key)
                    conn.commit()
                    save_checkpoint(checkpoint_file, checkpoint)
                    print(f"standings {item_key}: {len(standings)}", flush=True)
                except Exception as err:
                    conn.rollback()
                    record_error(checkpoint, f"standings {item_key}: {err}")
                    save_checkpoint(checkpoint_file, checkpoint)

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
                    args.max_no_detail_per_season,
                    DOMESTIC_CUP_DETAIL_ROUNDS,
                )
                print(f"match-details {item_key}: {count}", flush=True)

            if args.request_delay:
                time.sleep(args.request_delay)

        audit(conn, report_path(config), league_ids, seasons)
        print(f"report: {report_path(config)}", flush=True)
        budget = client.budget.load()
        print(f"budget: {budget.get('used')}/{budget.get('usable_limit')}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync top 5 domestic cup competitions from API-Football.")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--phase", choices=["all", "core", "match-details"], default="all")
    parser.add_argument("--from-season", type=int, default=2015)
    parser.add_argument("--to-season", type=int, default=2026)
    parser.add_argument("--cup", help="Run one cup only. Accepts id or alias: fa-cup, copa-del-rey, coppa-italia, dfb-pokal, coupe-de-france.")
    parser.add_argument("--max-requests", type=int)
    parser.add_argument("--request-delay", type=float, default=0.0)
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument(
        "--max-no-detail-per-season",
        type=int,
        default=0,
        help="Move to the next season after this many finished fixtures return no detail. Disabled by default; use 0 to keep it disabled.",
    )
    args = parser.parse_args()
    try:
        run(args)
    except (RequestBudgetExceeded, ApiFootballRateLimit) as err:
        print(f"Stopped safely: {err}", flush=True)


if __name__ == "__main__":
    main()
