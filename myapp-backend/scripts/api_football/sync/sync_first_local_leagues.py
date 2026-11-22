#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import unicodedata
from dataclasses import asdict
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection, table_columns, table_exists
from api_football.sync.sync_competitions import sync_competitions
from api_football.sync.sync_competitions_latest_full import CompetitionSeason, sync_one_competition
from api_football.sync.sync_countries import sync_countries


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import the first local national league for every country, including its latest played season details."
    )
    parser.add_argument("--execute", action="store_true", help="Run real API-Football and database writes.")
    parser.add_argument("--limit", type=int, default=0, help="Limit countries/leagues. 0 means no limit.")
    parser.add_argument("--country", help="Only sync one country name or 2-letter code.")
    parser.add_argument("--max-fifa-rank", type=int, default=70, help="Only include countries ranked at or above this FIFA rank.")
    parser.add_argument("--skip-countries", action="store_true", help="Do not refresh /countries first.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download league/team/player images.")
    parser.add_argument("--skip-squads", action="store_true", help="Skip /players/squads.")
    parser.add_argument("--skip-details", action="store_true", help="Skip per-fixture events, lineups, and statistics.")
    parser.add_argument("--only-missing-details", action="store_true", help="Only sync match details whose flags are missing.")
    parser.add_argument("--match-limit", type=int, default=0, help="Limit detail matches per league. 0 means no limit.")
    parser.add_argument("--team-limit", type=int, default=0, help="Limit squad teams per league. 0 means no limit.")
    parser.add_argument("--request-delay", type=float, default=0.2, help="Sleep between expensive API calls.")
    parser.add_argument("--max-requests", type=int, default=0, help="Stop after this many API requests. 0 means no limit.")
    parser.add_argument("--dry-run", action="store_true", help="Rollback database writes after each league.")
    parser.add_argument("--allow-partial", action="store_true", help="Allow skip/limit flags that do not import every detail.")
    parser.add_argument("--ignore-budget", action="store_true", help="Disable local API-Football request-budget enforcement.")
    parser.add_argument(
        "--output",
        default="data/api-football-first-local-leagues-report.json",
        help="JSON report path.",
    )
    return parser.parse_args()


def safe_print(message: str, *, file=sys.stdout) -> None:
    try:
        print(message, file=file, flush=True)
    except UnicodeEncodeError:
        encoding = file.encoding or "utf-8"
        print(message.encode(encoding, errors="replace").decode(encoding), file=file, flush=True)


def is_local_league(payload: dict[str, Any]) -> bool:
    league = payload.get("league") or {}
    country = payload.get("country") or {}
    country_name = str(country.get("name") or "").strip()
    if not country_name or country_name.lower() in {"world", "international"}:
        return False
    if str(league.get("type") or "").strip().lower() != "league":
        return False
    return bool(league.get("id") and league.get("name"))


def country_key(payload: dict[str, Any]) -> str:
    country = payload.get("country") or {}
    code = str(country.get("code") or "").strip().upper()
    return code or str(country.get("name") or "").strip().lower()


def normalized_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", errors="ignore").decode("ascii").lower()
    return "".join(char for char in text if char.isalnum())


def country_rank_keys(payload: dict[str, Any]) -> set[str]:
    country = payload.get("country") or {}
    return {
        normalized_key(country.get("name")),
        normalized_key(country.get("code")),
    }


def load_top_ranked_country_keys(conn, max_rank: int) -> tuple[set[str], list[dict[str, Any]]]:
    if max_rank <= 0:
        return set(), []
    if not table_exists(conn, "team_rankings"):
        raise RuntimeError("team_rankings table is missing. Run the team ranking sync first.")

    with conn.cursor() as cur:
        cur.execute(
            """
            WITH latest AS (
              SELECT MAX(ranking_date) AS ranking_date
              FROM team_rankings
              WHERE ranking_type = 'fifa_men'
            )
            SELECT tr.rank, tr.team_name_snapshot, tr.country_code
            FROM team_rankings tr
            JOIN latest ON latest.ranking_date = tr.ranking_date
            WHERE tr.ranking_type = 'fifa_men'
              AND tr.rank BETWEEN 1 AND %s
            ORDER BY tr.rank
            """,
            (max_rank,),
        )
        rows = [
            {"rank": int(row[0]), "team": row[1], "countryCode": row[2]}
            for row in cur.fetchall()
        ]

    keys: set[str] = set()
    for row in rows:
        keys.add(normalized_key(row["team"]))
        keys.add(normalized_key(row["countryCode"]))
    return keys, rows


def top_division_score(payload: dict[str, Any]) -> tuple[int, str]:
    name = str((payload.get("league") or {}).get("name") or "").strip().lower()
    penalties = (
        " 2",
        " ii",
        "second",
        "segunda",
        "serie b",
        "ligue 2",
        "liga 2",
        "division 2",
        "championship",
        "national 1",
        "reserve",
        "u21",
        "u20",
        "u19",
        "women",
    )
    bonuses = (
        "premier",
        "super",
        "first",
        "primera",
        "serie a",
        "ligue 1",
        "liga 1",
        "division 1",
        "bundesliga",
        "eredivisie",
        "allsvenskan",
    )
    score = 0
    if any(token in name for token in bonuses):
        score -= 100
    if any(token in name for token in penalties):
        score += 100
    return (score, name)


def choose_first_local_leagues(
    rows: list[dict[str, Any]],
    country_filter: str | None,
    limit: int,
    allowed_country_keys: set[str] | None = None,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    wanted = str(country_filter or "").strip().lower()

    for payload in rows:
        if not is_local_league(payload):
            continue
        country = payload.get("country") or {}
        name = str(country.get("name") or "").strip()
        code = str(country.get("code") or "").strip().lower()
        if wanted and wanted not in {name.lower(), code}:
            continue
        if allowed_country_keys is not None and not (country_rank_keys(payload) & allowed_country_keys):
            continue
        key = country_key(payload)
        if key:
            grouped.setdefault(key, []).append(payload)

    selected = [sorted(items, key=top_division_score)[0] for items in grouped.values()]
    return selected[:limit] if limit > 0 else selected


def competition_season_exists(conn, payload: dict[str, Any], season_year: int) -> bool:
    league_id = (payload.get("league") or {}).get("id")
    if not league_id or "api_id" not in table_columns(conn, "competitions"):
        return False
    if not table_exists(conn, "competition_seasons"):
        return False
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM competitions c
            JOIN competition_seasons cs ON cs.competition_id = c.id
            WHERE c.api_id = %s
              AND cs.season_year = %s
            LIMIT 1
            """,
            (int(league_id), int(season_year)),
        )
        return cur.fetchone() is not None


def select_last_played_season(seasons: list[dict[str, Any]], today: date | None = None) -> dict[str, Any] | None:
    if not seasons:
        return None
    today = today or date.today()
    completed: list[dict[str, Any]] = []
    for season in seasons:
        end = season.get("end")
        if not end:
            continue
        try:
            if date.fromisoformat(str(end)) <= today:
                completed.append(season)
        except ValueError:
            continue
    candidates = completed or [season for season in seasons if not season.get("current")] or seasons
    return sorted(candidates, key=lambda item: int(item.get("year") or 0), reverse=True)[0]


def unique_country_league_name(payload: dict[str, Any], raw_name: str | None) -> str | None:
    if not raw_name:
        return raw_name
    country = (payload.get("country") or {}).get("name")
    if not country:
        return raw_name
    suffix = f" ({country})"
    return raw_name if raw_name.endswith(suffix) else f"{raw_name}{suffix}"


def sync_args(args: argparse.Namespace) -> SimpleNamespace:
    return SimpleNamespace(
        skip_images=args.skip_images,
        skip_squads=args.skip_squads,
        skip_details=args.skip_details,
        odds=False,
        only_missing_details=args.only_missing_details,
        match_limit=args.match_limit,
        team_limit=args.team_limit,
        request_delay=args.request_delay,
        dry_run=args.dry_run,
    )


def validate_all_details_args(args: argparse.Namespace) -> None:
    if not args.execute or args.allow_partial:
        return
    partial_options = []
    if args.skip_squads:
        partial_options.append("--skip-squads")
    if args.skip_details:
        partial_options.append("--skip-details")
    if args.only_missing_details:
        partial_options.append("--only-missing-details")
    if args.match_limit > 0:
        partial_options.append("--match-limit")
    if args.team_limit > 0:
        partial_options.append("--team-limit")
    if partial_options:
        raise SystemExit(
            "This script imports the last played season with all details by default. "
            f"Remove partial option(s): {', '.join(partial_options)}. "
            "Use --allow-partial only when you intentionally want an incomplete sync."
        )


def should_stop(client: ApiFootballClient, start_used: int, max_requests: int) -> bool:
    if max_requests <= 0:
        return False
    return int(client.budget.load().get("used", 0)) - start_used >= max_requests


def run(args: argparse.Namespace) -> dict[str, Any]:
    validate_all_details_args(args)
    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    client = ApiFootballClient()
    start_used = int(client.budget.load().get("used", 0))
    report: dict[str, Any] = {
        "stats": {
            "countries": 0,
            "selectedLeagues": 0,
            "syncedLeagues": 0,
            "teams": 0,
            "fixtures": 0,
            "standings": 0,
            "squads": 0,
            "squadPlayers": 0,
            "detailMatches": 0,
            "errors": 0,
            "apiRequestsUsed": 0,
        },
        "leagues": [],
        "skipped": [],
    }

    with db_connection() as conn:
        if not args.skip_countries:
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            report["stats"]["countries"] = len(countries)
            conn.commit()
            safe_print(f"Synced countries: {len(countries)}")

        payload = client.get("/leagues")
        ranked_country_keys, ranked_rows = load_top_ranked_country_keys(conn, args.max_fifa_rank)
        report["stats"]["rankedCountries"] = len(ranked_rows)
        candidates = choose_first_local_leagues(payload.get("response") or [], args.country, 0, ranked_country_keys)
        selected: list[dict[str, Any]] = []
        for item in candidates:
            selected_season = select_last_played_season(item.get("seasons") or [])
            if not selected_season:
                report["skipped"].append(
                    {
                        "leagueApiId": (item.get("league") or {}).get("id"),
                        "name": unique_country_league_name(item, (item.get("league") or {}).get("name")),
                        "country": (item.get("country") or {}).get("name"),
                        "reason": "No seasons returned by API-Football.",
                    }
                )
                continue
            item["_selected_last_played_season"] = selected_season
            exists = competition_season_exists(conn, item, int(selected_season["year"]))
            if exists:
                report["skipped"].append(
                    {
                        "leagueApiId": (item.get("league") or {}).get("id"),
                        "name": unique_country_league_name(item, (item.get("league") or {}).get("name")),
                        "country": (item.get("country") or {}).get("name"),
                        "season": selected_season.get("year"),
                        "reason": "Top local league last played season already exists locally.",
                    }
                )
                continue
            selected.append(item)
            if args.limit > 0 and len(selected) >= args.limit:
                break
        report["stats"]["selectedLeagues"] = len(selected)
        safe_print(f"Selected missing first local country leagues: {len(selected)}")

        if not args.execute:
            report["dryRunOnly"] = True
            report["leagues"] = [
                {
                    "leagueApiId": (item.get("league") or {}).get("id"),
                    "name": unique_country_league_name(item, (item.get("league") or {}).get("name")),
                    "country": (item.get("country") or {}).get("name"),
                    "lastPlayedSeason": (item.get("_selected_last_played_season") or {}).get("year"),
                }
                for item in selected
            ]
            conn.rollback()
            return report

        for item in selected:
            if should_stop(client, start_used, args.max_requests):
                report["stopped"] = "Stopped on --max-requests."
                break

            selected_season = item.get("_selected_last_played_season") or select_last_played_season(item.get("seasons") or [])

            safe_print(
                f"[season] {(item.get('country') or {}).get('name')} / "
                f"{(item.get('league') or {}).get('name')} last played season="
                f"{selected_season.get('year')} end={selected_season.get('end')}"
            )

            try:
                competition_rows = sync_competitions(
                    client,
                    [item],
                    conn,
                    skip_images=args.skip_images,
                    season_year=int(selected_season["year"]),
                    name_formatter=unique_country_league_name,
                )
                conn.commit()
                comp = competition_rows[0]
                if not comp.get("competition_id") or not comp.get("competition_season_id") or not comp.get("season_id"):
                    raise RuntimeError("Competition or season could not be persisted.")

                season = CompetitionSeason(
                    competition_id=int(comp["competition_id"]),
                    competition_season_id=int(comp["competition_season_id"]),
                    season_id=int(comp["season_id"]),
                    league_api_id=int(comp["league_api_id"]),
                    season_year=int(comp["season_year"]),
                    competition_name=str(comp["name"]),
                    country_name=(item.get("country") or {}).get("name"),
                )
                result = sync_one_competition(client, conn, season, sync_args(args))
                result["selectedSeason"] = {
                    "year": selected_season.get("year"),
                    "start": selected_season.get("start"),
                    "end": selected_season.get("end"),
                    "current": selected_season.get("current"),
                }
                if args.dry_run:
                    conn.rollback()
                report["stats"]["syncedLeagues"] += 1
            except (ApiFootballRateLimit, RequestBudgetExceeded):
                raise
            except Exception as exc:
                conn.rollback()
                result = {
                    "leagueApiId": (item.get("league") or {}).get("id"),
                    "competition": (item.get("league") or {}).get("name"),
                    "country": (item.get("country") or {}).get("name"),
                    "season": selected_season.get("year"),
                    "errors": [{"phase": "league", "error": str(exc)}],
                }
                safe_print(f"[error] {result['country']} / {result['competition']}: {exc}", file=sys.stderr)

            report["leagues"].append(result)
            for key in ("teams", "fixtures", "standings", "squads", "squadPlayers", "detailMatches"):
                report["stats"][key] += int(result.get(key) or 0)
            report["stats"]["errors"] += len(result.get("errors") or [])
            if args.request_delay:
                time.sleep(args.request_delay)

    report["stats"]["apiRequestsUsed"] = int(client.budget.load().get("used", 0)) - start_used
    return report


def main() -> int:
    args = parse_args()
    try:
        report = run(args)
    except (ApiFootballRateLimit, RequestBudgetExceeded) as exc:
        report = {"stopped": str(exc), "stats": {}}
        safe_print(f"Stopped safely: {exc}", file=sys.stderr)

    text = json.dumps(report, ensure_ascii=False, indent=2, default=lambda value: asdict(value) if hasattr(value, "__dataclass_fields__") else str(value))
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    safe_print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
