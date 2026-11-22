#!/usr/bin/env python
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from api_football.storage import db_connection, table_exists


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = BACKEND_DIR / "data" / "matches_schema_validation_report.md"


CHECKS = [
    (
        "duplicate match api_ids",
        """
        SELECT COUNT(*) FROM (
            SELECT api_id FROM matches
            WHERE api_id IS NOT NULL
            GROUP BY api_id
            HAVING COUNT(*) > 1
        ) duplicates
        """,
    ),
    (
        "orphan home_team_id",
        """
        SELECT COUNT(*)
        FROM matches m
        LEFT JOIN teams t ON t.id = m.home_team_id
        WHERE m.home_team_id IS NOT NULL AND t.id IS NULL
        """,
    ),
    (
        "orphan away_team_id",
        """
        SELECT COUNT(*)
        FROM matches m
        LEFT JOIN teams t ON t.id = m.away_team_id
        WHERE m.away_team_id IS NOT NULL AND t.id IS NULL
        """,
    ),
    (
        "orphan competition_season_id",
        """
        SELECT COUNT(*)
        FROM matches m
        LEFT JOIN competition_seasons cs ON cs.id = m.competition_season_id
        WHERE m.competition_season_id IS NOT NULL AND cs.id IS NULL
        """,
    ),
    (
        "orphan event match_ids",
        """
        SELECT COUNT(*)
        FROM match_events e
        LEFT JOIN matches m ON m.id = e.match_id
        WHERE m.id IS NULL
        """,
    ),
    (
        "orphan player ids",
        """
        SELECT
            (SELECT COUNT(*) FROM match_events e LEFT JOIN players p ON p.id = e.player_id WHERE e.player_id IS NOT NULL AND p.id IS NULL)
          + (SELECT COUNT(*) FROM match_events e LEFT JOIN players p ON p.id = e.assist_player_id WHERE e.assist_player_id IS NOT NULL AND p.id IS NULL)
          + (SELECT COUNT(*) FROM match_lineup_players lp LEFT JOIN players p ON p.id = lp.player_id WHERE lp.player_id IS NOT NULL AND p.id IS NULL)
          + (SELECT COUNT(*) FROM match_player_statistics ps LEFT JOIN players p ON p.id = ps.player_id WHERE ps.player_id IS NOT NULL AND p.id IS NULL)
        """,
    ),
    (
        "duplicate team stats",
        """
        SELECT COUNT(*) FROM (
            SELECT match_id, team_id
            FROM match_team_statistics
            GROUP BY match_id, team_id
            HAVING COUNT(*) > 1
        ) duplicates
        """,
    ),
    (
        "duplicate lineups",
        """
        SELECT COUNT(*) FROM (
            SELECT match_id, team_id
            FROM match_lineups
            GROUP BY match_id, team_id
            HAVING COUNT(*) > 1
        ) duplicates
        """,
    ),
    (
        "duplicate player stats",
        """
        SELECT COUNT(*) FROM (
            SELECT match_id, team_id, player_id
            FROM match_player_statistics
            WHERE player_id IS NOT NULL
            GROUP BY match_id, team_id, player_id
            HAVING COUNT(*) > 1
        ) duplicates
        """,
    ),
    (
        "invalid percentages",
        """
        SELECT
            (SELECT COUNT(*) FROM match_team_statistics WHERE ball_possession < 0 OR ball_possession > 100 OR passes_percentage < 0 OR passes_percentage > 100)
          + (SELECT COUNT(*) FROM match_player_statistics WHERE passes_accuracy < 0 OR passes_accuracy > 100)
        """,
    ),
    (
        "negative goals",
        """
        SELECT COUNT(*)
        FROM matches
        WHERE home_goals < 0 OR away_goals < 0
           OR halftime_home < 0 OR halftime_away < 0
           OR fulltime_home < 0 OR fulltime_away < 0
           OR extratime_home < 0 OR extratime_away < 0
           OR penalty_home < 0 OR penalty_away < 0
        """,
    ),
    (
        "home_team_id = away_team_id",
        "SELECT COUNT(*) FROM matches WHERE home_team_id = away_team_id",
    ),
    (
        "missing kickoff_at",
        "SELECT COUNT(*) FROM matches WHERE COALESCE(kickoff_at, match_date) IS NULL",
    ),
]


def existing_tables(conn, names: Iterable[str]) -> list[str]:
    return [name for name in names if table_exists(conn, name)]


def main() -> None:
    required = [
        "matches",
        "match_events",
        "match_team_statistics",
        "match_lineups",
        "match_lineup_players",
        "match_player_statistics",
        "venues",
        "coaches",
    ]
    rows = []
    with db_connection() as conn:
        present = existing_tables(conn, required)
        missing = sorted(set(required) - set(present))
        with conn.cursor() as cur:
            for label, sql in CHECKS:
                try:
                    cur.execute(sql)
                    count = int(cur.fetchone()[0])
                    rows.append((label, count, "PASS" if count == 0 else "WARN"))
                except Exception as exc:
                    conn.rollback()
                    rows.append((label, None, f"ERROR: {exc}"))

    lines = [
        "# Matches Schema Validation Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Required Tables",
    ]
    lines.extend([f"- {name}: present" for name in required if name not in missing])
    lines.extend([f"- {name}: missing" for name in missing])
    lines.extend(["", "## Checks", "", "| Check | Count | Status |", "| --- | ---: | --- |"])
    for label, count, status in rows:
        count_text = "" if count is None else str(count)
        lines.append(f"| {label} | {count_text} | {status} |")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Report written: {REPORT_PATH}")


if __name__ == "__main__":
    main()
