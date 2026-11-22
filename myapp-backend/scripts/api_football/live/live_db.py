from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg2.extensions import connection as PgConnection

from ..storage import find_id_by_api_id, table_columns, table_exists

UNSET = object()


def find_competition_season_id(conn: PgConnection, competition_id: int | None, season_year: int | None) -> int | None:
    if not competition_id or not season_year or not table_exists(conn, "competition_seasons"):
        return None
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM competition_seasons
            WHERE competition_id = %s
              AND season_year::text = %s::text
            LIMIT 1
            """,
            (competition_id, season_year),
        )
        row = cur.fetchone()
        return row[0] if row else None


def find_match_by_api_id(conn: PgConnection, fixture_api_id: int) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM matches WHERE api_id = %s LIMIT 1", (fixture_api_id,))
        row = cur.fetchone()
        if not row:
            return None
        columns = [description.name for description in cur.description]
        return dict(zip(columns, row))


def resolve_fixture_context(conn: PgConnection, payload: dict[str, Any]) -> dict[str, Any] | None:
    fixture = payload.get("fixture") or payload
    league = payload.get("league") or {}
    teams = payload.get("teams") or {}
    home_team = teams.get("home") or {}
    away_team = teams.get("away") or {}

    fixture_api_id = fixture.get("id")
    competition_api_id = league.get("id")
    season_year = league.get("season")
    home_api_id = home_team.get("id")
    away_api_id = away_team.get("id")

    if not fixture_api_id or not competition_api_id or not home_api_id or not away_api_id:
        return None

    competition_id = find_id_by_api_id(conn, "competitions", int(competition_api_id))
    home_team_id = find_id_by_api_id(conn, "teams", int(home_api_id))
    away_team_id = find_id_by_api_id(conn, "teams", int(away_api_id))

    if not competition_id or not home_team_id or not away_team_id:
        return None

    competition_season_id = find_competition_season_id(conn, competition_id, season_year)

    return {
        "fixture_api_id": int(fixture_api_id),
        "competition_id": competition_id,
        "season_year": int(season_year) if season_year else None,
        "season_id": int(season_year) if season_year else None,
        "competition_season_id": competition_season_id,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
    }


def update_match_live_schedule(
    conn: PgConnection,
    match_id: int,
    *,
    next_sync_at: datetime | None | object = UNSET,
    last_live_sync_at: datetime | None | object = UNSET,
    fully_synced: bool | None | object = UNSET,
    final_sync_stage: str | None | object = UNSET,
    attempts_increment: bool = False,
    flags: dict[str, Any] | None = None,
) -> None:
    columns = table_columns(conn, "matches")
    assignments: list[str] = []
    params: list[Any] = []

    def add(name: str, value: Any) -> None:
        if name not in columns:
            return
        assignments.append(f"{name} = %s")
        params.append(value)

    if next_sync_at is not UNSET:
        add("next_sync_at", next_sync_at)
    if last_live_sync_at is not UNSET:
        add("last_live_sync_at", last_live_sync_at)
    if fully_synced is not UNSET:
        add("fully_synced", fully_synced)
    if final_sync_stage is not UNSET:
        add("final_sync_stage", final_sync_stage)

    for name, value in (flags or {}).items():
        add(name, value)

    if attempts_increment and "live_sync_attempts" in columns:
        assignments.append("live_sync_attempts = COALESCE(live_sync_attempts, 0) + 1")

    if "updated_at" in columns:
        assignments.append("updated_at = CURRENT_TIMESTAMP")

    if not assignments:
        return

    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE matches SET {', '.join(assignments)} WHERE id = %s",
            [*params, match_id],
        )
