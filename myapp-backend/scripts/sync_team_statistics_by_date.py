from __future__ import annotations

import argparse
import os
from datetime import date

from api_football.client import ApiFootballClient
from api_football.live.team_statistics_sync import sync_team_statistics_for_fixture
from api_football.storage import db_connection


def fixture_ids_for_date(conn, target_date: date) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT api_id
            FROM matches
            WHERE api_id IS NOT NULL
              AND DATE(COALESCE(kickoff_at, match_date)) = %s
            ORDER BY COALESCE(kickoff_at, match_date), id
            """,
            (target_date,),
        )
        return [int(row[0]) for row in cur.fetchall()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Force API-Football team statistics sync for one local match date.")
    parser.add_argument("date", type=date.fromisoformat, help="Match date in YYYY-MM-DD format.")
    parser.add_argument("--ignore-budget", action="store_true", help="Bypass the local request budget file.")
    args = parser.parse_args()

    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    client = ApiFootballClient()
    results = []
    with db_connection() as conn:
        fixture_ids = fixture_ids_for_date(conn, args.date)
        print({"date": args.date.isoformat(), "fixtures": len(fixture_ids)}, flush=True)
        for fixture_id in fixture_ids:
            result = sync_team_statistics_for_fixture(client, conn, fixture_id)
            results.append({"fixture_api_id": fixture_id, "result": result})
            print(results[-1], flush=True)

    print({"processed": len(results)}, flush=True)


if __name__ == "__main__":
    main()
