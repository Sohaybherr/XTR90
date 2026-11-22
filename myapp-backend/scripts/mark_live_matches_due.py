from __future__ import annotations

import argparse
from datetime import date

from api_football.storage import db_connection


LIVE_STATUSES = ("1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mark live matches for one date as immediately due for sync.")
    parser.add_argument("date", type=date.fromisoformat, help="Match date in YYYY-MM-DD format.")
    args = parser.parse_args()

    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE matches
                SET next_sync_at = NOW(),
                    updated_at = CURRENT_TIMESTAMP
                WHERE DATE(COALESCE(kickoff_at, match_date)) = %s
                  AND COALESCE(fully_synced, FALSE) = FALSE
                  AND status_short = ANY(%s)
                """,
                (args.date, list(LIVE_STATUSES)),
            )
            print({"updated": cur.rowcount}, flush=True)


if __name__ == "__main__":
    main()
