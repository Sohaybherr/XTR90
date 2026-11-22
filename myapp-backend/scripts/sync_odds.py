from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from api_football.client import ApiFootballClient
from api_football.storage import db_connection


LIVE_STATUSES = {"1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"}
FINAL_STATUSES = {"FT", "AET", "PEN", "CANC", "PST", "ABD", "AWD", "WO"}


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def decimal_or_none(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def selected_matches(conn, *, fixture: int | None, start: date | None, end: date | None, live_only: bool) -> list[dict[str, Any]]:
    params: list[Any] = []
    filters = ["m.api_id IS NOT NULL"]

    if fixture:
        filters.append("m.api_id = %s")
        params.append(fixture)
    else:
        if start:
            filters.append("DATE(COALESCE(m.kickoff_at, m.match_date)) >= %s")
            params.append(start)
        if end:
            filters.append("DATE(COALESCE(m.kickoff_at, m.match_date)) <= %s")
            params.append(end)
        if live_only:
            filters.append("m.status_short = ANY(%s)")
            params.append(list(LIVE_STATUSES))
        else:
            filters.append("COALESCE(m.status_short, '') <> ALL(%s)")
            params.append(list(FINAL_STATUSES))

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT m.id, m.api_id, m.status_short, COALESCE(m.kickoff_at, m.match_date) AS kickoff_at
            FROM matches m
            WHERE {' AND '.join(filters)}
            ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
            """,
            params,
        )
        return [
            {"id": row[0], "api_id": int(row[1]), "status_short": row[2], "kickoff_at": row[3]}
            for row in cur.fetchall()
        ]


def upsert_odd(
    conn,
    *,
    match_id: int,
    scope: str,
    bookmaker: dict[str, Any],
    bet: dict[str, Any],
    value: dict[str, Any],
    api_updated_at: datetime | None,
) -> None:
    bookmaker_api_id = bookmaker.get("id")
    bet_api_id = bet.get("id")
    odd = decimal_or_none(value.get("odd"))
    value_name = str(value.get("value") or value.get("name") or "").strip()
    bookmaker_name = str(bookmaker.get("name") or "Bookmaker").strip()
    bet_name = str(bet.get("name") or "Bet").strip()

    if not value_name or odd is None:
        return

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO match_odds (
                match_id,
                source,
                scope,
                bookmaker_api_id,
                bookmaker_name,
                bet_api_id,
                bet_name,
                value_name,
                odd,
                is_main,
                is_suspended,
                api_updated_at,
                fetched_at,
                raw_payload,
                updated_at
            )
            VALUES (%s, 'api-football', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (match_id, source, scope, bookmaker_api_id, bet_api_id, value_name)
            DO UPDATE SET
                bookmaker_name = EXCLUDED.bookmaker_name,
                bet_name = EXCLUDED.bet_name,
                previous_odd = CASE
                    WHEN match_odds.odd IS DISTINCT FROM EXCLUDED.odd THEN match_odds.odd
                    ELSE match_odds.previous_odd
                END,
                odd = EXCLUDED.odd,
                is_main = EXCLUDED.is_main,
                is_suspended = EXCLUDED.is_suspended,
                api_updated_at = EXCLUDED.api_updated_at,
                fetched_at = EXCLUDED.fetched_at,
                raw_payload = EXCLUDED.raw_payload,
                odd_changed_at = CASE
                    WHEN match_odds.odd IS DISTINCT FROM EXCLUDED.odd THEN CURRENT_TIMESTAMP
                    ELSE match_odds.odd_changed_at
                END,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                match_id,
                scope,
                bookmaker_api_id,
                bookmaker_name,
                bet_api_id,
                bet_name,
                value_name,
                odd,
                value.get("main"),
                value.get("suspended") or value.get("blocked"),
                api_updated_at,
                json.dumps(value),
            ),
        )


def bookmaker_rows(item: dict[str, Any]) -> list[dict[str, Any]]:
    bookmakers = item.get("bookmakers")
    if isinstance(bookmakers, list) and bookmakers:
        return bookmakers

    odds = item.get("odds")
    if isinstance(odds, list) and odds:
        return [{"id": 0, "name": "Live odds", "bets": odds}]

    return []


def persist_odds_response(conn, *, match_id: int, scope: str, payload: dict[str, Any]) -> int:
    count = 0
    for item in payload.get("response") or []:
        api_updated_at = parse_iso_datetime(item.get("update") or item.get("updated_at"))
        for bookmaker in bookmaker_rows(item):
            for bet in bookmaker.get("bets") or []:
                for value in bet.get("values") or []:
                    upsert_odd(
                        conn,
                        match_id=match_id,
                        scope=scope,
                        bookmaker=bookmaker,
                        bet=bet,
                        value=value,
                        api_updated_at=api_updated_at,
                    )
                    count += 1
    return count


def fetch_prematch_odds(client: ApiFootballClient, fixture_api_id: int) -> dict[str, Any]:
    merged: dict[str, Any] = {"response": []}
    page = 1
    while True:
        payload = client.get("odds", {"fixture": fixture_api_id, "page": page})
        merged["response"].extend(payload.get("response") or [])
        paging = payload.get("paging") or {}
        total = int(paging.get("total") or 1)
        if page >= total:
            return merged
        page += 1


def sync_once(args: argparse.Namespace) -> dict[str, int]:
    client = ApiFootballClient()
    stats = {"matches": 0, "prematch_rows": 0, "live_rows": 0, "errors": 0}

    with db_connection() as conn:
        matches = selected_matches(
            conn,
            fixture=args.fixture,
            start=args.date_from,
            end=args.date_to,
            live_only=args.live_only,
        )
        stats["matches"] = len(matches)

        for match in matches:
            try:
                if not args.live_only:
                    payload = fetch_prematch_odds(client, match["api_id"])
                    stats["prematch_rows"] += persist_odds_response(
                        conn,
                        match_id=match["id"],
                        scope="prematch",
                        payload=payload,
                    )

                if args.live or args.live_only or str(match.get("status_short") or "").upper() in LIVE_STATUSES:
                    payload = client.get("odds/live", {"fixture": match["api_id"]})
                    stats["live_rows"] += persist_odds_response(
                        conn,
                        match_id=match["id"],
                        scope="live",
                        payload=payload,
                    )
            except Exception as exc:
                stats["errors"] += 1
                print({"fixture_api_id": match["api_id"], "error": str(exc)}, flush=True)

    return stats


def main() -> None:
    today = datetime.now(timezone.utc).date()
    parser = argparse.ArgumentParser(description="Sync API-Football odds into match_odds.")
    parser.add_argument("--fixture", type=int, help="API-Football fixture id.")
    parser.add_argument("--from", dest="date_from", type=date.fromisoformat, default=today)
    parser.add_argument("--to", dest="date_to", type=date.fromisoformat, default=today + timedelta(days=3))
    parser.add_argument("--live", action="store_true", help="Also request live odds for live fixtures.")
    parser.add_argument("--live-only", action="store_true", help="Only request live odds for live fixtures.")
    parser.add_argument("--watch", action="store_true", help="Repeat forever.")
    parser.add_argument("--interval", type=int, default=int(os.getenv("ODDS_SYNC_INTERVAL_SECONDS", "10800")))
    parser.add_argument("--ignore-budget", action="store_true", help="Bypass the local request budget file.")
    args = parser.parse_args()

    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    while True:
        print(sync_once(args), flush=True)
        if not args.watch:
            return
        time.sleep(max(60, args.interval))


if __name__ == "__main__":
    main()
