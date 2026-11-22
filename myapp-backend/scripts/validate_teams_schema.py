#!/usr/bin/env python
from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = BACKEND_DIR / "data" / "teams_schema_validation_report.md"


def connect():
    load_dotenv(BACKEND_DIR / ".env")
    return psycopg2.connect(
        host=os.getenv("DB_HOST") or os.getenv("PGHOST") or "localhost",
        port=int(os.getenv("DB_PORT") or os.getenv("PGPORT") or "5432"),
        dbname=os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
        user=os.getenv("DB_USER") or os.getenv("PGUSER"),
        password=os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
    )


CHECKS = [
    (
        "duplicate team api_ids",
        "SELECT COUNT(*) FROM (SELECT api_id FROM teams WHERE api_id IS NOT NULL GROUP BY api_id HAVING COUNT(*) > 1) d",
    ),
    (
        "duplicate normalized team names",
        "SELECT COUNT(*) FROM (SELECT lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) FROM teams GROUP BY 1 HAVING COUNT(*) > 1) d",
    ),
    ("teams without country", "SELECT COUNT(*) FROM teams WHERE country_id IS NULL AND country_name_snapshot IS NULL"),
    (
        "teams with external logo paths",
        "SELECT COUNT(*) FROM teams WHERE logo_path ~ '^https?://' OR logo_path LIKE 'C:%' OR logo_path LIKE '%localhost%'",
    ),
    (
        "duplicate venues",
        "SELECT COUNT(*) FROM (SELECT lower(coalesce(name,'')), lower(coalesce(city,'')), lower(coalesce(country,'')) FROM venues GROUP BY 1,2,3 HAVING COUNT(*) > 1) d",
    ),
    (
        "orphan teams.country_id",
        "SELECT COUNT(*) FROM teams t LEFT JOIN countries c ON c.id=t.country_id WHERE t.country_id IS NOT NULL AND c.id IS NULL",
    ),
    (
        "orphan team_venues.venue_id",
        "SELECT COUNT(*) FROM team_venues tv LEFT JOIN venues v ON v.id=tv.venue_id WHERE v.id IS NULL",
    ),
    (
        "orphan team_squad_players.player_id",
        "SELECT COUNT(*) FROM team_squad_players tsp LEFT JOIN players p ON p.id=tsp.player_id WHERE p.id IS NULL",
    ),
    (
        "orphan team_coaches.coach_id",
        "SELECT COUNT(*) FROM team_coaches tc LEFT JOIN coaches c ON c.id=tc.coach_id WHERE c.id IS NULL",
    ),
    (
        "orphan team_competition_seasons.competition_season_id",
        "SELECT COUNT(*) FROM team_competition_seasons tcs LEFT JOIN competition_seasons cs ON cs.id=tcs.competition_season_id WHERE cs.id IS NULL",
    ),
    (
        "duplicate current squad records",
        "SELECT COUNT(*) FROM (SELECT team_id, player_id FROM team_squad_players GROUP BY team_id, player_id HAVING COUNT(*) > 1) d",
    ),
    (
        "duplicate season statistics",
        "SELECT COUNT(*) FROM (SELECT team_id, competition_season_id FROM team_season_statistics GROUP BY team_id, competition_season_id HAVING COUNT(*) > 1) d",
    ),
    (
        "invalid percentages",
        "SELECT COUNT(*) FROM team_season_statistics WHERE penalties_percentage < 0 OR penalties_percentage > 100",
    ),
    (
        "negative statistics",
        """
        SELECT COUNT(*) FROM team_season_statistics
        WHERE COALESCE(fixtures_played_home,0) < 0
           OR COALESCE(fixtures_played_away,0) < 0
           OR COALESCE(fixtures_played_total,0) < 0
           OR COALESCE(wins_total,0) < 0
           OR COALESCE(goals_for_total,0) < 0
           OR COALESCE(goals_against_total,0) < 0
        """,
    ),
    (
        "team linked to same default venue multiple times",
        "SELECT COUNT(*) FROM (SELECT team_id, venue_id FROM team_venues WHERE season IS NULL GROUP BY team_id, venue_id HAVING COUNT(*) > 1) d",
    ),
    (
        "matches with missing team references",
        """
        SELECT
          (SELECT COUNT(*) FROM matches m LEFT JOIN teams t ON t.id=m.home_team_id WHERE t.id IS NULL)
        + (SELECT COUNT(*) FROM matches m LEFT JOIN teams t ON t.id=m.away_team_id WHERE t.id IS NULL)
        """,
    ),
    (
        "player transfers with missing teams",
        """
        SELECT
          (SELECT COUNT(*) FROM player_transfers pt LEFT JOIN teams t ON t.id=pt.from_team_id WHERE pt.from_team_id IS NOT NULL AND t.id IS NULL)
        + (SELECT COUNT(*) FROM player_transfers pt LEFT JOIN teams t ON t.id=pt.to_team_id WHERE pt.to_team_id IS NOT NULL AND t.id IS NULL)
        """,
    ),
]


def main() -> None:
    lines = ["# Teams Schema Validation Report", ""]
    with connect() as conn:
        with conn.cursor() as cur:
            lines.extend(["## Row Counts", ""])
            for table in [
                "teams",
                "venues",
                "team_venues",
                "team_competition_seasons",
                "team_squad_players",
                "team_season_statistics",
                "team_goal_statistics",
                "team_lineup_statistics",
                "team_coaches",
                "team_trophies",
                "team_form_snapshots",
                "team_standing_snapshots",
            ]:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                lines.append(f"- {table}: {cur.fetchone()[0]}")

            lines.extend(["", "## Checks", ""])
            for label, query in CHECKS:
                cur.execute(query)
                value = cur.fetchone()[0]
                status = "OK" if int(value) == 0 else "WARN"
                lines.append(f"- {status}: {label}: {value}")

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Report written: {REPORT_PATH}")


if __name__ == "__main__":
    main()
