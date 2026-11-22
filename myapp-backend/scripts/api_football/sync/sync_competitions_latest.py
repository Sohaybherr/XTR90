from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient
from api_football.image_downloader import api_image_filename, backend_asset_target, download_image, relative_asset_path
from api_football.mappers.competition_mapper import map_competition
from api_football.mappers.season_mapper import map_season
from api_football.storage import (
    db_connection,
    ensure_legacy_season,
    find_country_id,
    upsert_by_api_id,
    upsert_competition_season,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync API-Football competitions and their latest playable season.")
    parser.add_argument("--all-provider", action="store_true", help="Sync every competition returned by API-Football.")
    parser.add_argument("--missing-only", action="store_true", help="Only sync competitions missing locally or missing a default/current season.")
    parser.add_argument("--season", type=int, help="Force one season year if the provider has it.")
    parser.add_argument("--limit", type=int, default=0, help="Limit competitions. 0 means no limit.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download competition logos.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and map, then rollback DB changes.")
    parser.add_argument("--ignore-budget", action="store_true", help="Disable local API-Football request-budget enforcement.")
    parser.add_argument("--output", help="Optional JSON report path.")
    return parser.parse_args()


def safe_print(message: str, *, file=sys.stdout) -> None:
    try:
        print(message, file=file)
    except UnicodeEncodeError:
        print(message.encode(file.encoding or "utf-8", errors="replace").decode(file.encoding or "utf-8"), file=file)


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def select_latest_played_season(seasons: list[dict[str, Any]], preferred_year: int | None = None) -> dict[str, Any] | None:
    if not seasons:
        return None
    if preferred_year is not None:
        return next((season for season in seasons if int(season.get("year") or 0) == preferred_year), None)

    today = date.today()
    current = [season for season in seasons if season.get("current") and (parse_date(season.get("start")) or today) <= today]
    if current:
        return sorted(current, key=lambda season: int(season.get("year") or 0), reverse=True)[0]

    playable = [
        season
        for season in seasons
        if int(season.get("year") or 0) > 0 and (parse_date(season.get("start")) or today) <= today
    ]
    candidates = playable or [season for season in seasons if int(season.get("year") or 0) > 0]
    return sorted(candidates, key=lambda season: int(season.get("year") or 0), reverse=True)[0] if candidates else None


def local_competition_status(conn) -> dict[int, dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              c.api_id,
              c.id,
              EXISTS (
                SELECT 1
                FROM competition_seasons cs
                WHERE cs.competition_id = c.id
              ) AS has_season,
              EXISTS (
                SELECT 1
                FROM competition_seasons cs
                WHERE cs.competition_id = c.id
                  AND cs.current = TRUE
              ) AS has_current
            FROM competitions c
            WHERE c.api_id IS NOT NULL
            """
        )
        return {
            int(row[0]): {
                "competitionId": int(row[1]),
                "hasSeason": bool(row[2]),
                "hasCurrent": bool(row[3]),
            }
            for row in cur.fetchall()
        }


def should_sync(payload: dict[str, Any], local_status: dict[int, dict[str, Any]], args: argparse.Namespace) -> bool:
    league = payload.get("league") or {}
    api_id = league.get("id")
    if api_id is None:
        return False
    if args.all_provider:
        return True
    status = local_status.get(int(api_id))
    return status is None or not status["hasSeason"] or not status["hasCurrent"]


def clear_competition_current(conn, competition_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE competition_seasons
            SET current = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE competition_id = %s
              AND current = TRUE
            """,
            (competition_id,),
        )


def sync_one(conn, client: ApiFootballClient, payload: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    country = payload.get("country") or {}
    country_id = find_country_id(conn, name=country.get("name"), code=country.get("code"))
    values = map_competition(payload, country_id=country_id)
    logo_url = values.get("logo")
    api_id = values.get("api_id")

    if logo_url and api_id and not args.skip_images:
        filename = api_image_filename("competition", int(api_id), logo_url)
        try:
            download_image(logo_url, backend_asset_target(client.config.assets_root, "competitions", filename))
            values["logo"] = relative_asset_path("competitions", filename)
        except Exception as err:
            safe_print(f"Warning: competition image failed for {api_id}: {err}")

    competition_id = upsert_by_api_id(conn, "competitions", values)
    selected = select_latest_played_season(payload.get("seasons") or [], args.season)
    season_id = None
    competition_season_id = None
    season_year = None

    if competition_id and selected:
        mapped = map_season(selected)
        season_year = int(mapped["season_year"])
        season_id = ensure_legacy_season(
            conn,
            season_year,
            mapped.get("start_date"),
            mapped.get("end_date"),
            True,
        )
        clear_competition_current(conn, int(competition_id))
        competition_season_id = upsert_competition_season(
            conn,
            {
                "competition_id": competition_id,
                "season_year": season_year,
                "start_date": mapped.get("start_date"),
                "end_date": mapped.get("end_date"),
                "current": True,
                "coverage": selected.get("coverage"),
                "logo_url": logo_url,
                "logo_path": values.get("logo"),
            },
        )

    return {
        "leagueApiId": int(api_id) if api_id is not None else None,
        "competitionId": int(competition_id) if competition_id else None,
        "competition": values.get("name"),
        "country": country.get("name"),
        "seasonYear": season_year,
        "seasonId": int(season_id) if season_id else None,
        "competitionSeasonId": int(competition_season_id) if competition_season_id else None,
    }


def main() -> int:
    args = parse_args()
    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"
    if not args.all_provider and not args.missing_only:
        args.missing_only = True

    client = ApiFootballClient()
    payload = client.get("/leagues")
    leagues = payload.get("response") or []

    stats = {
        "providerCompetitions": len(leagues),
        "selectedCompetitions": 0,
        "syncedCompetitions": 0,
        "errors": [],
    }
    synced = []

    with db_connection() as conn:
        local_status = local_competition_status(conn)
        selected_payloads = [row for row in leagues if should_sync(row, local_status, args)]
        if args.limit > 0:
            selected_payloads = selected_payloads[: args.limit]
        stats["selectedCompetitions"] = len(selected_payloads)
        safe_print(f"Provider competitions: {len(leagues)}")
        safe_print(f"Selected competitions: {len(selected_payloads)}")

        for row in selected_payloads:
            league = row.get("league") or {}
            try:
                result = sync_one(conn, client, row, args)
                synced.append(result)
                stats["syncedCompetitions"] += 1
                if args.dry_run:
                    conn.rollback()
                else:
                    conn.commit()
                safe_print(f"[ok] {result['competition']} season={result['seasonYear']}")
            except Exception as exc:
                conn.rollback()
                stats["errors"].append({"leagueApiId": league.get("id"), "competition": league.get("name"), "error": str(exc)})
                safe_print(f"[error] {league.get('name')}: {exc}", file=sys.stderr)

    report = {"stats": stats, "competitions": synced}
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    safe_print(text)
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
