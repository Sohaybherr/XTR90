#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.config import load_config
from api_football.image_downloader import backend_asset_target, download_image, relative_asset_path
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection, table_columns, table_exists
from api_football.sync.backfill_big5_2015_2026 import (
    LeagueSeason,
    key,
    load_league_seasons,
    should_stop,
    sync_match_details_for_league_season,
)
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams


START_SEASON = 2014
END_SEASON = datetime.now(timezone.utc).year

TRANSFERMARKT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36"
)

TRANSFERMARKT_COMPETITIONS = {
    1: {
        "id": "FIWC",
        "url": "https://www.transfermarkt.com/world-cup/startseite/pokalwettbewerb/FIWC",
        "seasons": {2026},
    },
}

SENIOR_COMPETITION_KEYWORDS = (
    "africa cup of nations",
    "asian cup",
    "concacaf gold cup",
    "concacaf nations league",
    "confederations cup",
    "copa america",
    "euro championship",
    "european championship",
    "uefa nations league",
    "world cup",
)

LOWER_LEVEL_KEYWORDS = (
    "beach",
    "club",
    "clubs",
    "conference league",
    "copa libertadores",
    "copa sudamericana",
    "europa league",
    "futsal",
    "olympics",
    "super cup",
    "u17",
    "u18",
    "u19",
    "u20",
    "u21",
    "u22",
    "u23",
    "u-17",
    "u-18",
    "u-19",
    "u-20",
    "u-21",
    "u-22",
    "u-23",
    "under 17",
    "under 18",
    "under 19",
    "under 20",
    "under 21",
    "under 22",
    "under 23",
    "women",
    "women's",
    "womens",
    "youth",
)

QUALIFIER_KEYWORDS = (
    "qualification",
    "qualifiers",
    "qualifying",
)


def checkpoint_path(config) -> Path:
    return config.report_file.parent / "api_football_international_senior_2014_now_checkpoint.json"


def report_path(config) -> Path:
    return config.report_file.parent / "api_football_international_senior_2014_now_report.md"


def load_checkpoint(path: Path) -> Dict[str, Any]:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {"completed": {}, "errors": []}
    completed = data.setdefault("completed", {})
    for name in ["countries", "competitions", "teams", "fixtures", "standings", "match_details"]:
        completed.setdefault(name, False if name == "countries" else [])
    data.setdefault("errors", [])
    return data


def save_checkpoint(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def selected_seasons(from_season: int, to_season: int) -> List[int]:
    return list(range(to_season, from_season - 1, -1))


def text_contains_any(text: str, keywords: Iterable[str]) -> bool:
    lower = text.lower()
    return any(keyword in lower for keyword in keywords)


def classify_league(payload: Dict[str, Any], *, include_qualifiers: bool) -> str:
    league = payload.get("league") or {}
    country = payload.get("country") or {}
    name = str(league.get("name") or "")
    country_name = str(country.get("name") or "")
    league_type = str(league.get("type") or "").lower()
    haystack = f"{name} {country_name}"

    if league_type != "cup":
        return ""
    if text_contains_any(haystack, LOWER_LEVEL_KEYWORDS):
        return ""
    if text_contains_any(haystack, QUALIFIER_KEYWORDS) and not include_qualifiers:
        return ""
    if text_contains_any(haystack, SENIOR_COMPETITION_KEYWORDS):
        if "world cup" in haystack.lower():
            return "world"
        return "continental"
    return ""


def fetch_international_leagues(client: ApiFootballClient, *, include_qualifiers: bool) -> List[Dict[str, Any]]:
    payload = client.get("/leagues")
    rows = payload.get("response") or []
    selected = []
    for row in rows:
        scope = classify_league(row, include_qualifiers=include_qualifiers)
        if scope:
            row["_international_scope"] = scope
            selected.append(row)
    return sorted(selected, key=lambda item: (item["_international_scope"], (item.get("league") or {}).get("name") or ""))


def season_available(payload: Dict[str, Any], season: int) -> bool:
    return any(int(item.get("year") or 0) == season for item in payload.get("seasons") or [])


def league_id(payload: Dict[str, Any]) -> int:
    return int((payload.get("league") or {}).get("id") or 0)


def league_name(payload: Dict[str, Any]) -> str:
    return str((payload.get("league") or {}).get("name") or league_id(payload))


def season_logo_filename(league_api_id: int, season: int, source_url: str) -> str:
    suffix = Path(source_url.split("?", 1)[0]).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{2,5}", suffix or ""):
        suffix = ".png"
    return f"national_cup_season_{league_api_id}_{season}{suffix}"


def fetch_league_season_payload(client: ApiFootballClient, payload: Dict[str, Any], season: int) -> Dict[str, Any]:
    league_api_id = league_id(payload)
    response = client.get("/leagues", {"id": league_api_id, "season": season})
    rows = response.get("response") or []
    return rows[0] if rows else payload


def transfermarkt_logo_url(league_api_id: int, season: int) -> str | None:
    source = TRANSFERMARKT_COMPETITIONS.get(int(league_api_id))
    if not source or int(season) not in source.get("seasons", set()):
        return None

    request = urllib.request.Request(source["url"], headers={"User-Agent": TRANSFERMARKT_USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", errors="ignore")

    competition_id = re.escape(str(source["id"]).lower())
    patterns = [
        rf"https://tmssl\.akamaized\.net//images/logo/homepageWappen150x150/{competition_id}\.png\?lm=\d+",
        r"https://tmssl\.akamaized\.net//images/logo/[^\"']+\.(?:png|jpg|jpeg|webp)(?:\?lm=\d+)?",
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            return match.group(0).replace("&amp;", "&")
    return None


def preferred_edition_logo_url(edition_payload: Dict[str, Any], season: int) -> tuple[str | None, str]:
    api_id = league_id(edition_payload)
    try:
        logo_url = transfermarkt_logo_url(api_id, season)
        if logo_url:
            return logo_url, "transfermarkt"
    except (TimeoutError, urllib.error.URLError, RuntimeError) as err:
        print(f"Warning: Transfermarkt logo lookup failed for {api_id}: {err}", flush=True)
    return (edition_payload.get("league") or {}).get("logo"), "api-football"


def update_competition_season_logo(conn, competition_season_id: int | None, logo_url: str | None, logo_path: str | None) -> None:
    if not competition_season_id or not table_exists(conn, "competition_seasons"):
        return
    columns = table_columns(conn, "competition_seasons")
    updates = []
    params: list[Any] = []
    if "logo_url" in columns:
        updates.append("logo_url = %s")
        params.append(logo_url)
    if "logo_path" in columns:
        updates.append("logo_path = %s")
        params.append(logo_path)
    if not updates:
        return
    updates.append("updated_at = CURRENT_TIMESTAMP")
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE competition_seasons SET {', '.join(updates)} WHERE id = %s",
            params + [competition_season_id],
        )


def competition_season_logo_missing(conn, league_api_id: int, season: int) -> bool:
    if not table_exists(conn, "competition_seasons"):
        return False
    columns = table_columns(conn, "competition_seasons")
    if "logo_path" not in columns:
        return False
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT cs.logo_path
            FROM competition_seasons cs
            JOIN competitions c ON c.id = cs.competition_id
            WHERE c.api_id = %s
              AND cs.season_year = %s
            LIMIT 1
            """,
            (league_api_id, season),
        )
        row = cur.fetchone()
        return bool(row) and not row[0]


def competition_season_logo_needs_refresh(conn, league_api_id: int, season: int) -> bool:
    source = TRANSFERMARKT_COMPETITIONS.get(int(league_api_id))
    if source and int(season) in source.get("seasons", set()):
        return True
    return competition_season_logo_missing(conn, league_api_id, season)


def sync_international_competition_edition(
    client: ApiFootballClient,
    conn,
    payload: Dict[str, Any],
    season: int,
    *,
    skip_images: bool,
) -> List[Dict[str, Any]]:
    edition_payload = fetch_league_season_payload(client, payload, season)
    rows = sync_competitions(client, [edition_payload], conn, skip_images=skip_images, season_year=season)
    if not rows or not rows[0].get("competition_season_id"):
        return rows

    logo_path = None
    if skip_images:
        return rows

    source_logo_url, logo_source = preferred_edition_logo_url(edition_payload, season)
    logo_url = None
    if source_logo_url:
        filename = season_logo_filename(league_id(edition_payload), season, source_logo_url)
        target = None
        previous_content = None
        try:
            target = backend_asset_target(client.config.assets_root, "competition-seasons", filename)
            previous_content = target.read_bytes() if target.exists() else None
            if logo_source == "transfermarkt":
                if target.exists():
                    target.unlink()
            download_image(source_logo_url, target)
            logo_url = source_logo_url
            logo_path = relative_asset_path("competition-seasons", filename)
        except Exception as err:
            if logo_source == "transfermarkt" and target is not None and previous_content is not None:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(previous_content)
            print(f"Warning: national cup edition image failed for {league_id(edition_payload)}:{season}: {err}", flush=True)

    if logo_path:
        update_competition_season_logo(conn, rows[0].get("competition_season_id"), logo_url, logo_path)
    return rows


def repair_downloaded_edition_logo_paths(conn, assets_root: Path, league_ids: Iterable[int], seasons: Iterable[int]) -> int:
    assets_dir = assets_root / "competition-seasons"
    if not assets_dir.exists():
        return 0
    league_set = set(int(item) for item in league_ids)
    season_set = set(int(item) for item in seasons)
    count = 0
    with conn.cursor() as cur:
        for path in assets_dir.glob("national_cup_season_*_*.*"):
            parts = path.stem.split("_")
            if len(parts) != 5:
                continue
            try:
                league_api_id = int(parts[3])
                season = int(parts[4])
            except ValueError:
                continue
            if league_api_id not in league_set or season not in season_set:
                continue
            cur.execute(
                """
                UPDATE competition_seasons cs
                SET logo_path = COALESCE(cs.logo_path, %s),
                    updated_at = CURRENT_TIMESTAMP
                FROM competitions c
                WHERE c.id = cs.competition_id
                  AND c.api_id = %s
                  AND cs.season_year = %s
                """,
                (relative_asset_path("competition-seasons", path.name), league_api_id, season),
            )
            count += cur.rowcount
    return count


def audit(conn, path: Path, leagues: List[Dict[str, Any]], seasons: List[int], checkpoint: Dict[str, Any]) -> None:
    tables = [
        "countries",
        "competitions",
        "competition_seasons",
        "teams",
        "team_competition_seasons",
        "matches",
        "standings",
    ]
    lines = [
        "# International Backfill Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        f"Scope: international world/continental cups, seasons {min(seasons)} through {max(seasons)}.",
        f"Selected competitions: {len(leagues)}",
        "",
        "## Selected Competitions",
    ]
    for row in leagues:
        lines.append(f"- {league_id(row)} {league_name(row)} ({row.get('_international_scope')})")

    lines.extend(["", "## Counts"])
    with conn.cursor() as cur:
        for table in tables:
            if not table_exists(conn, table):
                continue
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            lines.append(f"- {table}: {cur.fetchone()[0]}")

    errors = checkpoint.get("errors") or []
    lines.extend(["", "## Errors"])
    if errors:
        lines.extend(f"- {item}" for item in errors[-100:])
    else:
        lines.append("- None")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def log_error(checkpoint: Dict[str, Any], message: str) -> None:
    checkpoint.setdefault("errors", []).append(message)
    print(f"warning: {message}", flush=True)


def run(args) -> None:
    config = load_config()
    checkpoint_file = checkpoint_path(config)
    checkpoint = load_checkpoint(checkpoint_file)
    client = ApiFootballClient(config)

    seasons = selected_seasons(args.from_season, args.to_season)
    if not seasons:
        raise SystemExit("No seasons selected.")

    if not args.execute:
        print("Dry run only. Use --execute to write data.")
        print(f"Seasons: {min(seasons)}-{max(seasons)} ({len(seasons)})")
        print("Will select API-Football league type Cup with world/continental national-team keywords.")
        print("Add --include-qualifiers to also include qualifiers.")
        return

    if not config.api_key:
        raise SystemExit("API_FOOTBALL_KEY is required for --execute.")

    start_used = int(client.budget.load().get("used", 0))

    with db_connection() as conn:
        if not checkpoint["completed"]["countries"]:
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            checkpoint["completed"]["countries"] = True
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"countries: {len(countries)}", flush=True)

        leagues = fetch_international_leagues(client, include_qualifiers=args.include_qualifiers)
        league_ids = [league_id(row) for row in leagues]
        print(f"selected competitions: {len(leagues)}", flush=True)
        repaired_logos = repair_downloaded_edition_logo_paths(conn, client.config.assets_root, league_ids, seasons)
        if repaired_logos:
            conn.commit()
            print(f"repaired national cup edition logos: {repaired_logos}", flush=True)

        payload_by_id = {league_id(row): row for row in leagues}
        for season in seasons:
            for payload in leagues:
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
                if not season_available(payload, season):
                    continue
                item_key = key(league_id(payload), season)
                if item_key in checkpoint["completed"]["competitions"]:
                    if (
                        args.refresh_edition_logos
                        and not args.skip_images
                        and competition_season_logo_needs_refresh(conn, league_id(payload), season)
                    ):
                        try:
                            rows = sync_international_competition_edition(
                                client,
                                conn,
                                payload,
                                season,
                                skip_images=args.skip_images,
                            )
                            conn.commit()
                            print(f"edition-logo {item_key}: {league_name(payload)} {bool(rows)}", flush=True)
                        except Exception as error:
                            conn.rollback()
                            log_error(checkpoint, f"edition-logo {item_key}: {error}")
                            save_checkpoint(checkpoint_file, checkpoint)
                    continue
                try:
                    rows = sync_international_competition_edition(
                        client,
                        conn,
                        payload,
                        season,
                        skip_images=args.skip_images,
                    )
                    if rows and rows[0].get("competition_season_id"):
                        checkpoint["completed"]["competitions"].append(item_key)
                    conn.commit()
                    print(f"competition {item_key}: {league_name(payload)}", flush=True)
                except Exception as error:
                    conn.rollback()
                    log_error(checkpoint, f"competition {item_key}: {error}")
                save_checkpoint(checkpoint_file, checkpoint)
                if args.request_delay:
                    time.sleep(args.request_delay)

        league_seasons: List[LeagueSeason] = load_league_seasons(conn, league_ids, seasons)
        league_seasons.sort(key=lambda row: (row.season_year, row.name), reverse=True)

        for row in league_seasons:
            item_key = key(row.league_api_id, row.season_year)
            payload = payload_by_id.get(row.league_api_id)
            display_name = payload and league_name(payload) or row.name

            if args.phase in {"core", "all"} and item_key not in checkpoint["completed"]["teams"]:
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
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
                    print(f"teams {item_key} {display_name}: {len(teams)}", flush=True)
                except Exception as error:
                    conn.rollback()
                    log_error(checkpoint, f"teams {item_key}: {error}")
                save_checkpoint(checkpoint_file, checkpoint)
                if args.request_delay:
                    time.sleep(args.request_delay)

            if args.phase in {"core", "all"} and item_key not in checkpoint["completed"]["fixtures"]:
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
                try:
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
                    print(f"fixtures {item_key} {display_name}: {len(fixtures)}", flush=True)
                except Exception as error:
                    conn.rollback()
                    log_error(checkpoint, f"fixtures {item_key}: {error}")
                save_checkpoint(checkpoint_file, checkpoint)
                if args.request_delay:
                    time.sleep(args.request_delay)

            if args.phase in {"core", "all"} and item_key not in checkpoint["completed"]["standings"]:
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
                try:
                    standings = sync_standings(client, conn, row.league_api_id, row.season_year, row.competition_season_id)
                    checkpoint["completed"]["standings"].append(item_key)
                    conn.commit()
                    print(f"standings {item_key} {display_name}: {len(standings)}", flush=True)
                except Exception as error:
                    conn.rollback()
                    checkpoint["completed"]["standings"].append(item_key)
                    log_error(checkpoint, f"standings {item_key}: {error}")
                save_checkpoint(checkpoint_file, checkpoint)
                if args.request_delay:
                    time.sleep(args.request_delay)

            if args.phase in {"match-details", "all"}:
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
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
                print(f"match-details {item_key} {display_name}: {count}", flush=True)

        audit(conn, report_path(config), leagues, seasons, checkpoint)
        budget = client.budget.load()
        print(f"report: {report_path(config)}", flush=True)
        print(f"budget: {budget.get('used')}/{budget.get('usable_limit')}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill international world/continental competitions from API-Football.")
    parser.add_argument("--execute", action="store_true", help="Run real API-Football sync.")
    parser.add_argument("--phase", choices=["core", "match-details", "all"], default="core")
    parser.add_argument("--from-season", type=int, default=START_SEASON)
    parser.add_argument("--to-season", type=int, default=END_SEASON)
    parser.add_argument("--max-requests", type=int, help="Stop after this many API requests in this run.")
    parser.add_argument("--request-delay", type=float, default=0.5)
    parser.add_argument("--skip-images", action="store_true", help="Do not download competition/team images.")
    parser.add_argument("--include-qualifiers", action="store_true", help="Include World Cup/continental qualifiers.")
    parser.add_argument(
        "--refresh-edition-logos",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Repair missing per-edition national cup season logos even when the competition season is checkpoint-complete.",
    )
    args = parser.parse_args()

    try:
        run(args)
    except (RequestBudgetExceeded, ApiFootballRateLimit) as error:
        print(f"Stopped safely: {error}")


if __name__ == "__main__":
    main()
