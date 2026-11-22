#!/usr/bin/env python
from __future__ import annotations

import json
import sys
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.config import load_config
from api_football.storage import db_connection, table_columns, table_exists


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair local metadata/checkpoint after a partial API-Football sync.")
    parser.add_argument("--reset-details", action="store_true", help="Reset teams/fixtures/standings/squads checkpoint sections.")
    parser.add_argument("--reset-squads", action="store_true", help="Reset squad checkpoint and rebuild pending teams from local teams.")
    args = parser.parse_args()

    config = load_config()

    with db_connection() as conn:
        with conn.cursor() as cur:
            if table_exists(conn, "countries"):
                cur.execute(
                    """
                    UPDATE countries
                    SET
                        api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
                        api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP)
                    WHERE flag LIKE '/assets/flags/%'
                    """
                )
                print(f"Updated country sync timestamps: {cur.rowcount}")

            if table_exists(conn, "competitions"):
                cur.execute(
                    """
                    UPDATE competitions
                    SET api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP)
                    WHERE api_id IS NOT NULL
                    """
                )
                print(f"Updated competition API timestamps: {cur.rowcount}")

            if table_exists(conn, "players"):
                player_columns = table_columns(conn, "players")
                if {"name", "firstname", "lastname"}.issubset(player_columns):
                    cur.execute(
                        """
                        UPDATE players
                        SET
                            firstname = COALESCE(
                                firstname,
                                CASE
                                    WHEN name IS NULL OR btrim(name) = '' THEN NULL
                                    ELSE split_part(btrim(name), ' ', 1)
                                END
                            ),
                            lastname = COALESCE(
                                lastname,
                                CASE
                                    WHEN name IS NULL OR btrim(name) = '' THEN NULL
                                    WHEN position(' ' in btrim(name)) = 0 THEN NULL
                                    ELSE substring(btrim(name) from position(' ' in btrim(name)) + 1)
                                END
                            )
                        WHERE name IS NOT NULL
                          AND (firstname IS NULL OR lastname IS NULL)
                        """
                    )
                    print(f"Backfilled player names from name: {cur.rowcount}")

    checkpoint_path = config.checkpoint_file
    if args.reset_details and checkpoint_path.exists():
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        completed = checkpoint.setdefault("completed", {})
        completed["teams"] = []
        completed["fixtures"] = []
        completed["standings"] = []
        completed["squads"] = []
        checkpoint["pending_team_ids"] = []
        checkpoint_path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
        print(f"Reset league-detail checkpoint flags: {checkpoint_path}")

    if args.reset_squads and checkpoint_path.exists():
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        completed = checkpoint.setdefault("completed", {})
        completed["squads"] = []
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, api_id, name
                    FROM teams
                    WHERE api_id IS NOT NULL
                    ORDER BY id
                    """
                )
                checkpoint["pending_team_ids"] = [
                    {"team_api_id": row[1], "team_id": row[0], "name": row[2]}
                    for row in cur.fetchall()
                ]
        checkpoint_path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
        print(f"Reset squad checkpoint for {len(checkpoint['pending_team_ids'])} local teams: {checkpoint_path}")


if __name__ == "__main__":
    main()
