from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from decimal import Decimal

from api_football.client import ApiFootballClient
from api_football.live.post_match_sync import sync_post_match_for_fixture
from api_football.storage import db_connection


def json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def fixture_api_id_for_match(conn, match_id: int) -> int | None:
    with conn.cursor() as cur:
        cur.execute("SELECT api_id FROM matches WHERE id = %s LIMIT 1", (match_id,))
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync full API-Football details for one local match.")
    parser.add_argument("match_id", type=int, help="Local matches.id value.")
    parser.add_argument("--ignore-budget", action="store_true", help="Bypass the local request budget file.")
    args = parser.parse_args()

    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    client = ApiFootballClient()
    with db_connection() as conn:
        fixture_api_id = fixture_api_id_for_match(conn, args.match_id)
        if not fixture_api_id:
            raise SystemExit(f"Match {args.match_id} has no API-Football fixture id.")

        result = sync_post_match_for_fixture(client, conn, fixture_api_id)
        print(json.dumps({"match_id": args.match_id, "fixture_api_id": fixture_api_id, "result": result}, default=json_default))


if __name__ == "__main__":
    main()
