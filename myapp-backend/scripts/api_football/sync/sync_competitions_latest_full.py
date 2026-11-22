from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.live.lineup_sync import sync_lineups_for_fixture
from api_football.live.live_db import update_match_live_schedule
from api_football.live.live_fixture_sync import sync_fixture_by_api_id
from api_football.live.live_status_rules import is_final_status, utcnow
from api_football.live.player_statistics_sync import sync_player_statistics_for_fixture
from api_football.live.team_statistics_sync import sync_team_statistics_for_fixture
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_squads import sync_squad
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams
from sync_odds import fetch_prematch_odds, persist_odds_response


@dataclass(frozen=True)
class CompetitionSeason:
    competition_id: int
    competition_season_id: int
    season_id: int
    league_api_id: int
    season_year: int
    competition_name: str
    country_name: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync every current/latest API-Football competition season with teams, fixtures, standings, squads, and match details."
    )
    parser.add_argument("--competition-api-id", type=int, help="Only sync one API-Football league/competition id.")
    parser.add_argument("--competition-id", type=int, help="Only sync one local competitions.id.")
    parser.add_argument("--season", type=int, help="Only sync this season year.")
    parser.add_argument("--limit", type=int, default=0, help="Limit competitions. 0 means no limit.")
    parser.add_argument("--match-limit", type=int, default=0, help="Limit detail sync matches per competition. 0 means no limit.")
    parser.add_argument("--team-limit", type=int, default=0, help="Limit squad sync teams per competition. 0 means no limit.")
    parser.add_argument("--request-delay", type=float, default=0.2, help="Sleep between expensive API calls.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download team/player images.")
    parser.add_argument("--skip-squads", action="store_true", help="Skip /players/squads.")
    parser.add_argument("--skip-details", action="store_true", help="Skip per-fixture details.")
    parser.add_argument("--odds", action="store_true", help="Also sync prematch odds for each fixture.")
    parser.add_argument("--only-missing-details", action="store_true", help="Only sync fixture details where detail flags are missing.")
    parser.add_argument("--max-requests", type=int, default=0, help="Stop after this many API requests. 0 means no limit.")
    parser.add_argument("--dry-run", action="store_true", help="Run API/mapping flow but rollback DB writes after each competition.")
    parser.add_argument("--ignore-budget", action="store_true", help="Disable local API-Football request-budget enforcement.")
    parser.add_argument("--output", default="data/api-football-competitions-latest-full-report.json", help="JSON report path.")
    return parser.parse_args()


def safe_print(message: str, *, file=sys.stdout) -> None:
    try:
        print(message, file=file, flush=True)
    except UnicodeEncodeError:
        encoding = file.encoding or "utf-8"
        print(message.encode(encoding, errors="replace").decode(encoding), file=file, flush=True)


def json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def should_stop(client: ApiFootballClient, start_used: int, max_requests: int) -> bool:
    if max_requests <= 0:
        return False
    return int(client.budget.load().get("used", 0)) - start_used >= max_requests


def load_current_competition_seasons(conn, args: argparse.Namespace) -> list[CompetitionSeason]:
    filters = ["c.api_id IS NOT NULL", "cs.current = TRUE"]
    params: list[Any] = []
    if args.competition_api_id:
        filters.append("c.api_id = %s")
        params.append(args.competition_api_id)
    if args.competition_id:
        filters.append("c.id = %s")
        params.append(args.competition_id)
    if args.season:
        filters.append("cs.season_year = %s")
        params.append(args.season)

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT
              c.id,
              cs.id,
              COALESCE(m.season_id, s.id) AS season_id,
              c.api_id,
              cs.season_year,
              c.name,
              countries.name AS country_name
            FROM competition_seasons cs
            JOIN competitions c ON c.id = cs.competition_id
            LEFT JOIN countries ON countries.id = c.country_id
            LEFT JOIN seasons s ON s.name = cs.season_year::text
            LEFT JOIN LATERAL (
              SELECT season_id
              FROM matches
              WHERE competition_season_id = cs.id
                AND season_id IS NOT NULL
              LIMIT 1
            ) m ON TRUE
            WHERE {" AND ".join(filters)}
              AND COALESCE(m.season_id, s.id) IS NOT NULL
            ORDER BY COALESCE(countries.name, 'World'), c.name, cs.season_year DESC
            """,
            params,
        )
        rows = [
            CompetitionSeason(
                competition_id=int(row[0]),
                competition_season_id=int(row[1]),
                season_id=int(row[2]),
                league_api_id=int(row[3]),
                season_year=int(row[4]),
                competition_name=str(row[5]),
                country_name=row[6],
            )
            for row in cur.fetchall()
        ]
    return rows[: args.limit] if args.limit > 0 else rows


def load_competition_matches(conn, season: CompetitionSeason, args: argparse.Namespace) -> list[dict[str, Any]]:
    filters = ["m.competition_season_id = %s", "m.api_id IS NOT NULL"]
    params: list[Any] = [season.competition_season_id]
    if args.only_missing_details:
        filters.append(
            """
            (
              COALESCE(m.has_events, FALSE) = FALSE
              OR COALESCE(m.has_lineups, FALSE) = FALSE
              OR COALESCE(m.has_team_statistics, FALSE) = FALSE
              OR COALESCE(m.has_player_statistics, FALSE) = FALSE
            )
            """
        )

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT
              m.id,
              m.api_id,
              m.status_short,
              COALESCE(m.kickoff_at, m.match_date) AS kickoff_at
            FROM matches m
            WHERE {" AND ".join(filters)}
            ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
            """,
            params,
        )
        rows = [
            {"match_id": int(row[0]), "fixture_api_id": int(row[1]), "status_short": row[2], "kickoff_at": row[3]}
            for row in cur.fetchall()
        ]
    return rows[: args.match_limit] if args.match_limit > 0 else rows


def mark_detail_attempt(conn, match_id: int, status_short: str | None, detail: dict[str, Any]) -> None:
    flags = {
        "has_events": bool(((detail.get("fixture") or {}).get("has_events"))),
        "has_lineups": bool(((detail.get("lineups") or {}).get("lineups"))),
        "has_team_statistics": bool(((detail.get("team_statistics") or {}).get("statistics"))),
        "has_player_statistics": bool(((detail.get("player_statistics") or {}).get("statistics"))),
    }
    fully_synced = is_final_status(str(status_short or "")) and (
        flags["has_events"] or flags["has_lineups"] or flags["has_team_statistics"] or flags["has_player_statistics"]
    )
    update_match_live_schedule(
        conn,
        match_id,
        fully_synced=fully_synced,
        final_sync_stage="verified" if fully_synced else None,
        next_sync_at=None,
        last_live_sync_at=utcnow(),
        attempts_increment=True,
        flags=flags,
    )


def sync_match_details(client: ApiFootballClient, conn, match: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    fixture_api_id = int(match["fixture_api_id"])
    fixture = sync_fixture_by_api_id(client, conn, fixture_api_id)
    lineups = sync_lineups_for_fixture(client, conn, fixture_api_id)
    team_statistics = sync_team_statistics_for_fixture(client, conn, fixture_api_id)
    player_statistics = sync_player_statistics_for_fixture(client, conn, fixture_api_id)
    odds_rows = 0
    if args.odds:
        payload = fetch_prematch_odds(client, fixture_api_id)
        odds_rows = persist_odds_response(conn, match_id=int(match["match_id"]), scope="prematch", payload=payload)

    result = {
        "match_id": int(match["match_id"]),
        "fixture_api_id": fixture_api_id,
        "fixture": fixture,
        "lineups": lineups,
        "team_statistics": team_statistics,
        "player_statistics": player_statistics,
        "odds_rows": odds_rows,
    }
    mark_detail_attempt(conn, int(match["match_id"]), (fixture or {}).get("status") or match.get("status_short"), result)
    return result


def finish_unit(conn, args: argparse.Namespace) -> None:
    if not args.dry_run:
        conn.commit()


def sync_one_competition(client: ApiFootballClient, conn, season: CompetitionSeason, args: argparse.Namespace) -> dict[str, Any]:
    safe_print(f"[competition] {season.country_name or 'World'} / {season.competition_name} {season.season_year}")
    result: dict[str, Any] = {
        "competitionId": season.competition_id,
        "competitionSeasonId": season.competition_season_id,
        "leagueApiId": season.league_api_id,
        "season": season.season_year,
        "competition": season.competition_name,
        "country": season.country_name,
        "teams": 0,
        "fixtures": 0,
        "standings": 0,
        "squads": 0,
        "squadPlayers": 0,
        "detailMatches": 0,
        "oddsRows": 0,
        "errors": [],
    }

    teams = sync_teams(
        client,
        conn,
        season.league_api_id,
        season.season_year,
        season.competition_id,
        season.season_id,
        season.competition_season_id,
        skip_images=args.skip_images,
    )
    result["teams"] = len(teams)
    finish_unit(conn, args)

    fixtures = sync_fixtures(
        client,
        conn,
        season.league_api_id,
        season.season_year,
        season.competition_id,
        season.season_id,
        season.competition_season_id,
    )
    result["fixtures"] = len(fixtures)
    finish_unit(conn, args)

    standings = sync_standings(client, conn, season.league_api_id, season.season_year, season.competition_season_id)
    result["standings"] = len(standings)
    finish_unit(conn, args)

    if not args.skip_squads:
        squad_teams = teams[: args.team_limit] if args.team_limit > 0 else teams
        for team in squad_teams:
            try:
                players = sync_squad(client, conn, int(team["team_api_id"]), int(team["team_id"]), skip_images=args.skip_images)
                result["squads"] += 1
                result["squadPlayers"] += len(players)
                finish_unit(conn, args)
            except Exception as exc:
                conn.rollback()
                result["errors"].append({"phase": "squad", "teamApiId": team.get("team_api_id"), "team": team.get("name"), "error": str(exc)})
            if args.request_delay:
                time.sleep(args.request_delay)

    if not args.skip_details:
        matches = load_competition_matches(conn, season, args)
        for match in matches:
            try:
                detail = sync_match_details(client, conn, match, args)
                result["detailMatches"] += 1
                result["oddsRows"] += int(detail.get("odds_rows") or 0)
                finish_unit(conn, args)
            except Exception as exc:
                conn.rollback()
                result["errors"].append({"phase": "match_details", "fixtureApiId": match.get("fixture_api_id"), "error": str(exc)})
            if args.request_delay:
                time.sleep(args.request_delay)

    safe_print(
        f"[ok] {season.competition_name}: teams={result['teams']} fixtures={result['fixtures']} "
        f"standings={result['standings']} squads={result['squads']} details={result['detailMatches']} errors={len(result['errors'])}"
    )
    return result


def main() -> int:
    args = parse_args()
    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    client = ApiFootballClient()
    start_used = int(client.budget.load().get("used", 0))
    report: dict[str, Any] = {
        "stats": {
            "competitions": 0,
            "teams": 0,
            "fixtures": 0,
            "standings": 0,
            "squads": 0,
            "squadPlayers": 0,
            "detailMatches": 0,
            "oddsRows": 0,
            "errors": 0,
            "apiRequestsUsed": 0,
        },
        "competitions": [],
    }

    try:
        with db_connection() as conn:
            seasons = load_current_competition_seasons(conn, args)
            report["stats"]["competitions"] = len(seasons)
            safe_print(f"Selected competition seasons: {len(seasons)}")

            for season in seasons:
                if should_stop(client, start_used, args.max_requests):
                    safe_print("Stopped on --max-requests.")
                    break
                try:
                    competition_result = sync_one_competition(client, conn, season, args)
                    if args.dry_run:
                        conn.rollback()
                except (ApiFootballRateLimit, RequestBudgetExceeded):
                    raise
                except Exception as exc:
                    conn.rollback()
                    competition_result = {
                        "competitionId": season.competition_id,
                        "competitionSeasonId": season.competition_season_id,
                        "leagueApiId": season.league_api_id,
                        "season": season.season_year,
                        "competition": season.competition_name,
                        "country": season.country_name,
                        "errors": [{"phase": "competition", "error": str(exc)}],
                    }
                    safe_print(f"[error] {season.competition_name}: {exc}", file=sys.stderr)

                report["competitions"].append(competition_result)
                for key in ("teams", "fixtures", "standings", "squads", "squadPlayers", "detailMatches", "oddsRows"):
                    report["stats"][key] += int(competition_result.get(key) or 0)
                report["stats"]["errors"] += len(competition_result.get("errors") or [])
    except (ApiFootballRateLimit, RequestBudgetExceeded) as exc:
        report["stopped"] = str(exc)
        safe_print(f"Stopped safely: {exc}", file=sys.stderr)

    report["stats"]["apiRequestsUsed"] = int(client.budget.load().get("used", 0)) - start_used
    text = json.dumps(report, ensure_ascii=False, indent=2, default=json_default)
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(text, encoding="utf-8")
    safe_print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
