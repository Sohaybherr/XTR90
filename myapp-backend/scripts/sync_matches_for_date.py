from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from typing import Any

from api_football.client import ApiFootballClient
from api_football.live.lineup_sync import sync_lineups_for_fixture
from api_football.live.live_db import update_match_live_schedule
from api_football.live.live_fixture_sync import sync_fixture_by_api_id
from api_football.live.live_status_rules import decide_next_action, next_sync_at, utcnow
from api_football.live.player_statistics_sync import sync_player_statistics_for_fixture
from api_football.live.team_statistics_sync import sync_team_statistics_for_fixture
from api_football.mappers.event_mapper import map_events
from api_football.mappers.fixture_mapper import map_fixture
from api_football.mappers.venue_mapper import map_venue
from api_football.storage import (
    db_connection,
    ensure_legacy_season,
    table_columns,
    upsert_by_api_id,
    upsert_competition_season,
    upsert_match,
    upsert_match_events,
    upsert_team,
    upsert_venue,
)
from sync_odds import LIVE_STATUSES, fetch_prematch_odds, persist_odds_response


def progress(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def compact_team_values(team: dict[str, Any]) -> dict[str, Any]:
    api_id = team.get("id")
    logo_url = team.get("logo")
    return {
        "api_id": api_id,
        "name": team.get("name"),
        "logo_url": logo_url,
        "logo_path": f"/assets/teams/team_{api_id}.png" if api_id and logo_url else None,
    }


def compact_competition_values(league: dict[str, Any]) -> dict[str, Any]:
    return {
        "api_id": league.get("id"),
        "name": league.get("name"),
        "type": "League",
        "logo": league.get("logo"),
        "country_name": league.get("country"),
    }


def ensure_fixture_context(conn, payload: dict[str, Any]) -> dict[str, int | None] | None:
    league = payload.get("league") or {}
    teams = payload.get("teams") or {}
    home_team = teams.get("home") or {}
    away_team = teams.get("away") or {}
    season_year = league.get("season")

    if not league.get("id") or not home_team.get("id") or not away_team.get("id") or not season_year:
        return None

    competition_id = upsert_by_api_id(conn, "competitions", compact_competition_values(league))
    season_id = ensure_legacy_season(conn, int(season_year), None, None, False)
    home_team_id = upsert_team(conn, compact_team_values(home_team))
    away_team_id = upsert_team(conn, compact_team_values(away_team))

    if not competition_id or not season_id or not home_team_id or not away_team_id:
        return None

    competition_season_id = upsert_competition_season(
        conn,
        {
            "competition_id": competition_id,
            "season_year": int(season_year),
            "name": str(season_year),
            "current": False,
        },
    )

    return {
        "competition_id": competition_id,
        "season_id": season_id,
        "competition_season_id": competition_season_id,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
    }


def sync_fixture_payload(conn, payload: dict[str, Any]) -> dict[str, Any]:
    fixture = payload.get("fixture") or {}
    fixture_api_id = fixture.get("id")
    context = ensure_fixture_context(conn, payload)
    if not fixture_api_id or not context:
        return {"fixture_api_id": fixture_api_id, "synced": False, "reason": "missing_context"}

    venue_id = upsert_venue(conn, map_venue(fixture.get("venue") or {}))
    values = map_fixture(
        payload,
        int(context["competition_id"]),
        int(context["season_id"]),
        int(context["home_team_id"]),
        int(context["away_team_id"]),
    )
    values["competition_season_id"] = context["competition_season_id"]
    values["venue_id"] = venue_id

    match_id = upsert_match(conn, values)
    event_count = 0
    if match_id:
        event_rows = map_events(payload)
        event_count = len(upsert_match_events(conn, match_id, event_rows)) if event_rows else 0

        match_columns = table_columns(conn, "matches")
        flags = {
            name: value
            for name, value in {
                "has_events": bool(event_rows),
                "has_lineups": bool(payload.get("lineups")),
                "has_team_statistics": bool(payload.get("statistics")),
                "has_player_statistics": bool(payload.get("players")),
            }.items()
            if name in match_columns
        }
        decision = decide_next_action(values)
        update_match_live_schedule(
            conn,
            match_id,
            next_sync_at=next_sync_at(decision),
            last_live_sync_at=utcnow(),
            attempts_increment=True,
            flags=flags or None,
        )

    return {
        "fixture_api_id": fixture_api_id,
        "match_id": match_id,
        "synced": bool(match_id),
        "status": values.get("status_short"),
        "events": event_count,
    }


def sync_fixture_details(
    client: ApiFootballClient,
    conn,
    *,
    fixture_api_id: int,
    match_id: int,
    status: str | None,
    include_odds: bool = True,
    include_live_odds: bool = True,
) -> dict[str, Any]:
    details: dict[str, Any] = {
        "fixture": None,
        "lineups": None,
        "team_statistics": None,
        "player_statistics": None,
        "odds": {"prematch_rows": 0, "live_rows": 0},
        "errors": [],
    }

    steps = [
        ("fixture", lambda: sync_fixture_by_api_id(client, conn, fixture_api_id)),
        ("lineups", lambda: sync_lineups_for_fixture(client, conn, fixture_api_id)),
        ("team_statistics", lambda: sync_team_statistics_for_fixture(client, conn, fixture_api_id)),
        ("player_statistics", lambda: sync_player_statistics_for_fixture(client, conn, fixture_api_id)),
    ]
    for name, action in steps:
        try:
            progress(f"[fixture {fixture_api_id}] syncing {name}...")
            details[name] = action()
            conn.commit()
            progress(f"[fixture {fixture_api_id}] synced {name}")
        except Exception as exc:
            conn.rollback()
            details["errors"].append({"phase": name, "error": str(exc)})
            progress(f"[fixture {fixture_api_id}] {name} failed: {exc}")

    if include_odds:
        try:
            progress(f"[fixture {fixture_api_id}] syncing prematch odds...")
            payload = fetch_prematch_odds(client, fixture_api_id)
            details["odds"]["prematch_rows"] = persist_odds_response(
                conn,
                match_id=match_id,
                scope="prematch",
                payload=payload,
            )
            conn.commit()
            progress(f"[fixture {fixture_api_id}] synced prematch odds: {details['odds']['prematch_rows']} rows")
        except Exception as exc:
            conn.rollback()
            details["errors"].append({"phase": "prematch_odds", "error": str(exc)})
            progress(f"[fixture {fixture_api_id}] prematch odds failed: {exc}")

    if include_live_odds and str(status or "").upper() in LIVE_STATUSES:
        try:
            progress(f"[fixture {fixture_api_id}] syncing live odds...")
            payload = client.get("odds/live", {"fixture": fixture_api_id})
            details["odds"]["live_rows"] = persist_odds_response(
                conn,
                match_id=match_id,
                scope="live",
                payload=payload,
            )
            conn.commit()
            progress(f"[fixture {fixture_api_id}] synced live odds: {details['odds']['live_rows']} rows")
        except Exception as exc:
            conn.rollback()
            details["errors"].append({"phase": "live_odds", "error": str(exc)})
            progress(f"[fixture {fixture_api_id}] live odds failed: {exc}")

    return details


def sync_matches_for_date(
    target_date: date,
    *,
    timezone: str | None = None,
    league_api_id: int | None = None,
    details: bool = True,
    odds: bool = True,
    live_odds: bool = True,
    ignore_budget: bool = False,
) -> dict[str, Any]:
    if ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    client = ApiFootballClient()
    params: dict[str, Any] = {"date": target_date.isoformat()}
    if timezone:
        params["timezone"] = timezone
    if league_api_id:
        params["league"] = league_api_id

    progress(f"Fetching fixtures for {target_date.isoformat()}...")
    payload = client.get("/fixtures", params)
    fixtures = payload.get("response") or []
    progress(f"Fetched {len(fixtures)} fixtures.")
    results: list[dict[str, Any]] = []

    with db_connection() as conn:
        for index, fixture_payload in enumerate(fixtures, start=1):
            fixture_api_id = ((fixture_payload.get("fixture") or {}).get("id"))
            progress(f"[{index}/{len(fixtures)}] syncing fixture {fixture_api_id}...")
            result = sync_fixture_payload(conn, fixture_payload)
            conn.commit()
            if result.get("synced"):
                progress(f"[{index}/{len(fixtures)}] synced fixture {fixture_api_id} as match {result.get('match_id')}")
            else:
                progress(f"[{index}/{len(fixtures)}] skipped fixture {fixture_api_id}: {result.get('reason')}")
            if details and result.get("synced") and result.get("fixture_api_id") and result.get("match_id"):
                result["details"] = sync_fixture_details(
                    client,
                    conn,
                    fixture_api_id=int(result["fixture_api_id"]),
                    match_id=int(result["match_id"]),
                    status=str(result.get("status") or ""),
                    include_odds=odds,
                    include_live_odds=live_odds,
                )
            results.append(result)

    progress("Sync complete. Printing JSON summary...")
    return {
        "date": target_date.isoformat(),
        "fetched": len(fixtures),
        "synced": sum(1 for item in results if item.get("synced")),
        "skipped": sum(1 for item in results if not item.get("synced")),
        "detailErrors": sum(len(((item.get("details") or {}).get("errors") or [])) for item in results),
        "prematchOddsRows": sum(int((((item.get("details") or {}).get("odds") or {}).get("prematch_rows") or 0)) for item in results),
        "liveOddsRows": sum(int((((item.get("details") or {}).get("odds") or {}).get("live_rows") or 0)) for item in results),
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch and sync API-Football matches for a specific date.")
    parser.add_argument("date", type=date.fromisoformat, help="Match date in YYYY-MM-DD format.")
    parser.add_argument("--timezone", help="API-Football timezone, for example Africa/Casablanca.")
    parser.add_argument("--league", type=int, help="Optional API-Football league id filter.")
    parser.add_argument("--post-match", action="store_true", help="Deprecated; details are synced by default.")
    parser.add_argument("--skip-details", action="store_true", help="Only sync fixture rows from the date endpoint.")
    parser.add_argument("--skip-odds", action="store_true", help="Do not sync prematch odds.")
    parser.add_argument("--skip-live-odds", action="store_true", help="Do not sync live odds for live fixtures.")
    parser.add_argument("--ignore-budget", action="store_true", help="Bypass the local request budget file.")
    args = parser.parse_args()

    result = sync_matches_for_date(
        args.date,
        timezone=args.timezone,
        league_api_id=args.league,
        details=not args.skip_details,
        odds=not args.skip_odds,
        live_odds=not args.skip_live_odds,
        ignore_budget=args.ignore_budget,
    )
    print(json.dumps(result, default=str, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
