#!/usr/bin/env python
from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"


def connect():
    load_dotenv(ENV_PATH)
    return psycopg2.connect(
        host=os.getenv("DB_HOST") or os.getenv("PGHOST") or "localhost",
        port=int(os.getenv("DB_PORT") or os.getenv("PGPORT") or "5432"),
        dbname=os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
        user=os.getenv("DB_USER") or os.getenv("PGUSER"),
        password=os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
    )


def main() -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """
            )
            tables = [row[0] for row in cur.fetchall()]

            print("Row counts:")
            for table in tables:
                cur.execute(f'SELECT COUNT(*) FROM "{table}"')
                print(f"  {table}: {cur.fetchone()[0]}")

            print("Foreign-key orphan checks:")
            cur.execute(
                """
                SELECT
                    tc.table_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_name = tc.constraint_name
                 AND ccu.table_schema = tc.table_schema
                WHERE tc.table_schema = 'public'
                  AND tc.constraint_type = 'FOREIGN KEY'
                ORDER BY tc.table_name, kcu.column_name
                """
            )
            for table, column, foreign_table, foreign_column in cur.fetchall():
                query = (
                    f'SELECT COUNT(*) FROM "{table}" child '
                    f'LEFT JOIN "{foreign_table}" parent '
                    f'ON child."{column}" = parent."{foreign_column}" '
                    f'WHERE child."{column}" IS NOT NULL AND parent."{foreign_column}" IS NULL'
                )
                cur.execute(query)
                print(f"  {table}.{column} -> {foreign_table}.{foreign_column}: {cur.fetchone()[0]} orphan(s)")

            required_columns = {
                "competitions": ["api_id", "api_updated_at", "synced_at"],
                "teams": ["api_id", "name", "country_id", "country_name_snapshot", "is_national", "logo_path", "api_updated_at", "api_synced_at"],
                "team_venues": ["team_id", "venue_id", "season", "is_primary"],
                "team_competition_seasons": ["team_id", "competition_season_id", "is_active"],
                "team_season_statistics": ["team_id", "competition_season_id", "extra_statistics"],
                "team_goal_statistics": ["team_season_statistics_id", "goal_direction", "minute_from", "minute_to"],
                "team_lineup_statistics": ["team_season_statistics_id", "formation", "played"],
                "team_coaches": ["team_id", "coach_id", "season", "is_current"],
                "team_trophies": ["team_id", "competition_id", "competition_name", "season", "place"],
                "team_form_snapshots": ["team_id", "competition_season_id", "form", "snapshot_at"],
                "team_standing_snapshots": ["team_id", "competition_season_id", "rank", "points", "snapshot_at"],
                "players": ["api_id", "name", "firstname", "lastname", "photo_path", "api_updated_at", "api_synced_at"],
                "team_squad_players": ["team_id", "player_id", "shirt_number", "position", "is_current", "api_synced_at"],
                "player_team_seasons": ["player_id", "team_id", "season", "position", "shirt_number", "is_current"],
                "player_season_statistics": ["player_id", "team_id", "competition_season_id", "extra_statistics"],
                "player_trophies": ["player_id", "competition_id", "competition_name", "country", "season", "place"],
                "player_sidelined": ["player_id", "sidelined_type", "start_date", "end_date"],
                "player_injuries": ["player_id", "team_id", "match_id", "competition_season_id", "injury_type", "fixture_date"],
                "matches": ["api_id", "api_updated_at", "synced_at"],
                "api_sync_runs": ["resource_type", "endpoint", "request_count", "started_at", "status"],
            }
            print("Required column checks:")
            for table, columns in required_columns.items():
                cur.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s
                    """,
                    (table,),
                )
                found = {row[0] for row in cur.fetchall()}
                missing = [column for column in columns if column not in found]
                print(f"  {table}: {'OK' if not missing else 'missing ' + ', '.join(missing)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
