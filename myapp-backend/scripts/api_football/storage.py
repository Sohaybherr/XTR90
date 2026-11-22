from __future__ import annotations

import os
import json
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import psycopg2
from dotenv import load_dotenv
from psycopg2.extensions import connection as PgConnection, quote_ident


BACKEND_DIR = Path(__file__).resolve().parents[2]


@contextmanager
def db_connection():
    load_dotenv(BACKEND_DIR / ".env")
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST") or os.getenv("PGHOST") or "localhost",
        port=int(os.getenv("DB_PORT") or os.getenv("PGPORT") or "5432"),
        dbname=os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
        user=os.getenv("DB_USER") or os.getenv("PGUSER"),
        password=os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def record_sync_run(conn, resource_type: str, endpoint: str, parameters: dict, status: str = "started") -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO api_sync_runs (resource_type, endpoint, parameters, status)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (resource_type, endpoint, parameters, status),
        )
        return cur.fetchone()[0]


def table_exists(conn: PgConnection, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = %s
            )
            """,
            (table,),
        )
        return bool(cur.fetchone()[0])


def table_columns(conn: PgConnection, table: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table,),
        )
        return {row[0] for row in cur.fetchall()}


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _json(value: Any) -> Any:
    return json.dumps(value, default=_json_default) if isinstance(value, (dict, list)) else value


def upsert_by_api_id(conn: PgConnection, table: str, values: Dict[str, Any]) -> Optional[int]:
    if "api_id" not in values or values["api_id"] is None:
        raise ValueError(f"{table} upsert requires api_id")
    columns = table_columns(conn, table)
    filtered = {key: _json(value) for key, value in values.items() if key in columns and key != "id"}
    filtered["api_id"] = values["api_id"]
    if "synced_at" in columns and "synced_at" not in filtered:
        filtered["synced_at"] = "CURRENT_TIMESTAMP"
    if "api_synced_at" in columns and "api_synced_at" not in filtered:
        filtered["api_synced_at"] = "CURRENT_TIMESTAMP"
    if "api_updated_at" in columns and "api_updated_at" not in filtered:
        filtered["api_updated_at"] = "CURRENT_TIMESTAMP"

    names = list(filtered.keys())
    insert_cols = ", ".join(quote_ident(name, conn) for name in names)
    placeholders = []
    params = []
    for name in names:
        if filtered[name] == "CURRENT_TIMESTAMP":
            placeholders.append("CURRENT_TIMESTAMP")
        else:
            placeholders.append("%s")
            params.append(filtered[name])

    update_cols = [name for name in names if name not in {"id", "api_id"}]
    update_sql = ", ".join(
        f"{quote_ident(name, conn)} = COALESCE(EXCLUDED.{quote_ident(name, conn)}, {quote_ident(table, conn)}.{quote_ident(name, conn)})"
        for name in update_cols
    )
    if not update_sql:
        update_sql = f"api_id = EXCLUDED.{quote_ident('api_id', conn)}"

    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {quote_ident(table, conn)} ({insert_cols})
            VALUES ({", ".join(placeholders)})
            ON CONFLICT (api_id) DO UPDATE SET {update_sql}
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_country(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    columns = table_columns(conn, "countries")
    filtered = {key: value for key, value in values.items() if key in columns}
    if filtered.get("code") is not None:
        code = str(filtered["code"]).strip().upper()
        if len(code) != 2 or not code.isalpha():
            filtered.pop("code", None)
        else:
            filtered["code"] = code
    if "api_synced_at" in columns and "api_synced_at" not in filtered:
        filtered["api_synced_at"] = "CURRENT_TIMESTAMP"
    if "api_updated_at" in columns and "api_updated_at" not in filtered:
        filtered["api_updated_at"] = "CURRENT_TIMESTAMP"
    if not filtered.get("code") and not filtered.get("name") and not filtered.get("api_id"):
        return None

    with conn.cursor() as cur:
        existing_id = None
        if "api_id" in columns and filtered.get("api_id") is not None:
            cur.execute("SELECT id FROM countries WHERE api_id = %s LIMIT 1", (filtered["api_id"],))
            row = cur.fetchone()
            existing_id = row[0] if row else None
        if existing_id is None and filtered.get("code"):
            cur.execute("SELECT id FROM countries WHERE LOWER(TRIM(code)) = LOWER(TRIM(%s)) LIMIT 1", (filtered["code"],))
            row = cur.fetchone()
            existing_id = row[0] if row else None
        if existing_id is None and filtered.get("name"):
            cur.execute("SELECT id FROM countries WHERE LOWER(name) = LOWER(%s) LIMIT 1", (filtered["name"],))
            row = cur.fetchone()
            existing_id = row[0] if row else None

        if existing_id is not None:
            update_names = [name for name, value in filtered.items() if name != "id" and value is not None]
            for unique_name in ("api_id", "code", "name"):
                if unique_name not in update_names:
                    continue
                cur.execute(
                    f"""
                    SELECT id
                    FROM countries
                    WHERE {quote_ident(unique_name, conn)} = %s
                      AND id <> %s
                    LIMIT 1
                    """,
                    (filtered[unique_name], existing_id),
                )
                if cur.fetchone():
                    update_names.remove(unique_name)
            if not update_names:
                return existing_id
            assignments = ", ".join(
                f"{quote_ident(name, conn)} = CURRENT_TIMESTAMP"
                if filtered[name] == "CURRENT_TIMESTAMP"
                else f"{quote_ident(name, conn)} = %s"
                for name in update_names
            )
            update_values = [filtered[name] for name in update_names if filtered[name] != "CURRENT_TIMESTAMP"]
            cur.execute(
                f"UPDATE countries SET {assignments} WHERE id = %s RETURNING id",
                update_values + [existing_id],
            )
            return cur.fetchone()[0]

        if "code" in columns and "code" not in filtered:
            return None
        names = [name for name, value in filtered.items() if name != "id" and value is not None]
        for unique_name in ("api_id", "code", "name"):
            if unique_name not in names:
                continue
            cur.execute(
                f"SELECT id FROM countries WHERE {quote_ident(unique_name, conn)} = %s LIMIT 1",
                (filtered[unique_name],),
            )
            row = cur.fetchone()
            if row:
                return row[0]
        if not names:
            return None
        placeholders = [
            "CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s"
            for name in names
        ]
        cur.execute(
            f"""
            INSERT INTO countries ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
            """,
            [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"],
        )
        return cur.fetchone()[0]


def find_id_by_api_id(conn: PgConnection, table: str, api_id: int) -> Optional[int]:
    if not table_exists(conn, table) or "api_id" not in table_columns(conn, table):
        return None
    with conn.cursor() as cur:
        cur.execute(f"SELECT id FROM {quote_ident(table, conn)} WHERE api_id = %s LIMIT 1", (api_id,))
        row = cur.fetchone()
        return row[0] if row else None


def find_country_id(conn: PgConnection, *, name: str | None = None, code: str | None = None) -> Optional[int]:
    with conn.cursor() as cur:
        if code:
            cur.execute("SELECT id FROM countries WHERE LOWER(TRIM(code)) = LOWER(TRIM(%s)) LIMIT 1", (code,))
            row = cur.fetchone()
            if row:
                return row[0]
        if name:
            cur.execute("SELECT id FROM countries WHERE LOWER(name) = LOWER(%s) LIMIT 1", (name,))
            row = cur.fetchone()
            if row:
                return row[0]
    return None


def upsert_competition_season(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "competition_seasons"):
        return None
    columns = table_columns(conn, "competition_seasons")
    filtered = {key: _json(value) for key, value in values.items() if key in columns}
    if not {"competition_id", "season_year"}.issubset(filtered):
        return None
    names = list(filtered.keys())
    update_cols = [name for name in names if name not in {"id", "competition_id", "season_year"}]
    update_sql = ", ".join(
        f"{quote_ident(name, conn)} = EXCLUDED.{quote_ident(name, conn)}" for name in update_cols
    ) or "competition_id = EXCLUDED.competition_id"
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO competition_seasons ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(["%s"] * len(names))})
            ON CONFLICT (competition_id, season_year) DO UPDATE SET {update_sql}
            RETURNING id
            """,
            [filtered[name] for name in names],
        )
        return cur.fetchone()[0]


def upsert_team_competition(conn: PgConnection, team_id: int, competition_id: int, season_id: int) -> None:
    if not table_exists(conn, "team_competitions"):
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO team_competitions (team_id, competition_id, season_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (team_id, competition_id, season_id) DO NOTHING
            """,
            (team_id, competition_id, season_id),
        )


def current_player_season(conn: PgConnection) -> int:
    if table_exists(conn, "competition_seasons"):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT season_year
                FROM competition_seasons
                WHERE current = TRUE
                ORDER BY season_year DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if row and row[0]:
                return int(row[0])
    return 0


def upsert_team_squad_player(
    conn: PgConnection,
    *,
    team_id: int | None,
    player_id: int | None,
    shirt_number: int | None = None,
    position: str | None = None,
    is_current: bool = True,
) -> Optional[int]:
    if not team_id or not player_id or not table_exists(conn, "team_squad_players"):
        return None
    return _upsert_by_columns(
        conn,
        "team_squad_players",
        {
            "team_id": team_id,
            "player_id": player_id,
            "shirt_number": shirt_number,
            "position": position,
            "is_current": is_current,
        },
        ["team_id", "player_id"],
    )


def upsert_player_team_season(
    conn: PgConnection,
    *,
    player_id: int | None,
    team_id: int | None,
    season: int | None,
    position: str | None = None,
    shirt_number: int | None = None,
    joined_at: str | None = None,
    left_at: str | None = None,
    is_current: bool = False,
) -> Optional[int]:
    if not player_id or not team_id or not table_exists(conn, "player_team_seasons"):
        return None
    season = season if season is not None else current_player_season(conn)
    if not season:
        return None
    return _upsert_by_columns(
        conn,
        "player_team_seasons",
        {
            "player_id": player_id,
            "team_id": team_id,
            "season": season,
            "position": position,
            "shirt_number": shirt_number,
            "joined_at": joined_at,
            "left_at": left_at,
            "is_current": is_current,
        },
        ["player_id", "team_id", "season"],
    )


def upsert_player_season_statistics(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "player_season_statistics"):
        return None
    return _upsert_by_columns(
        conn,
        "player_season_statistics",
        values,
        ["player_id", "team_id", "competition_season_id"],
    )


def ensure_legacy_season(conn: PgConnection, season_year: int, start_date: str | None, end_date: str | None, current: bool) -> Optional[int]:
    if not table_exists(conn, "seasons"):
        return None
    name = str(season_year)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM seasons WHERE name = %s LIMIT 1", (name,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            """
            INSERT INTO seasons (name, start_date, end_date, is_current)
            VALUES (%s, COALESCE(%s::date, make_date(%s, 1, 1)), COALESCE(%s::date, make_date(%s, 12, 31)), %s)
            RETURNING id
            """,
            (name, start_date, season_year, end_date, season_year, current),
        )
        return cur.fetchone()[0]


def upsert_standing(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "standings"):
        return None
    columns = table_columns(conn, "standings")
    filtered = {key: _json(value) for key, value in values.items() if key in columns}
    if not {"competition_season_id", "team_id"}.issubset(filtered):
        return None
    names = list(filtered.keys())
    update_cols = [name for name in names if name not in {"id", "competition_season_id", "team_id"}]
    update_sql = ", ".join(
        f"{quote_ident(name, conn)} = EXCLUDED.{quote_ident(name, conn)}" for name in update_cols
    ) or "team_id = EXCLUDED.team_id"
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO standings ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(["%s"] * len(names))})
            ON CONFLICT (competition_season_id, team_id) DO UPDATE SET {update_sql}
            RETURNING id
            """,
            [filtered[name] for name in names],
        )
        return cur.fetchone()[0]


def _filtered_values(conn: PgConnection, table: str, values: Dict[str, Any]) -> Dict[str, Any]:
    columns = table_columns(conn, table)
    filtered = {key: _json(value) for key, value in values.items() if key in columns and value is not None}
    if "api_synced_at" in columns and "api_synced_at" not in filtered:
        filtered["api_synced_at"] = "CURRENT_TIMESTAMP"
    if "updated_at" in columns and "updated_at" not in filtered:
        filtered["updated_at"] = "CURRENT_TIMESTAMP"
    return filtered


def _upsert_by_columns(conn: PgConnection, table: str, values: Dict[str, Any], conflict_columns: Iterable[str]) -> Optional[int]:
    filtered = _filtered_values(conn, table, values)
    conflict = list(conflict_columns)
    if not all(column in filtered for column in conflict):
        return None
    names = list(filtered.keys())
    update_cols = [name for name in names if name not in {"id", *conflict}]
    update_sql = ", ".join(
        f"{quote_ident(name, conn)} = EXCLUDED.{quote_ident(name, conn)}" for name in update_cols
    ) or f"{quote_ident(conflict[0], conn)} = EXCLUDED.{quote_ident(conflict[0], conn)}"
    placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
    params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {quote_ident(table, conn)} ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            ON CONFLICT ({", ".join(quote_ident(name, conn) for name in conflict)}) DO UPDATE SET {update_sql}
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def _upsert_by_key_index(conn: PgConnection, table: str, values: Dict[str, Any], key_column: str) -> Optional[int]:
    filtered = _filtered_values(conn, table, values)
    if not filtered.get(key_column):
        return None
    names = list(filtered.keys())
    update_cols = [name for name in names if name not in {"id", key_column}]
    update_sql = ", ".join(
        f"{quote_ident(name, conn)} = EXCLUDED.{quote_ident(name, conn)}" for name in update_cols
    ) or f"{quote_ident(key_column, conn)} = EXCLUDED.{quote_ident(key_column, conn)}"
    placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
    params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {quote_ident(table, conn)} ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            ON CONFLICT ({quote_ident(key_column, conn)}) DO UPDATE SET {update_sql}
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_venue(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "venues"):
        return None
    api_id = values.get("api_id")
    with conn.cursor() as cur:
        existing_id = None
        if api_id is not None:
            cur.execute("SELECT id FROM venues WHERE api_id = %s LIMIT 1", (api_id,))
            row = cur.fetchone()
            existing_id = row[0] if row else None
        if existing_id is None and values.get("name"):
            cur.execute(
                """
                SELECT id FROM venues
                WHERE LOWER(COALESCE(name, '')) = LOWER(COALESCE(%s, ''))
                  AND LOWER(COALESCE(city, '')) = LOWER(COALESCE(%s, ''))
                  AND LOWER(COALESCE(country, '')) = LOWER(COALESCE(%s, ''))
                LIMIT 1
                """,
                (values.get("name"), values.get("city"), values.get("country")),
            )
            row = cur.fetchone()
            existing_id = row[0] if row else None
        filtered = _filtered_values(conn, "venues", values)
        if existing_id:
            names = [name for name in filtered if name != "id"]
            if not names:
                return existing_id
            assignments = ", ".join(
                f"{quote_ident(name, conn)} = CURRENT_TIMESTAMP"
                if filtered[name] == "CURRENT_TIMESTAMP"
                else f"{quote_ident(name, conn)} = %s"
                for name in names
            )
            params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
            cur.execute(f"UPDATE venues SET {assignments} WHERE id = %s RETURNING id", params + [existing_id])
            return cur.fetchone()[0]
        if not filtered.get("api_id") and not filtered.get("name"):
            return None
        names = list(filtered.keys())
        placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
        params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
        cur.execute(
            f"""
            INSERT INTO venues ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_coach(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "coaches"):
        return None
    if values.get("id") is not None:
        values = {**values}
        values["api_id"] = values.get("api_id") or values.get("id")
        values.pop("id", None)
    if values.get("api_id") is not None:
        return upsert_by_api_id(conn, "coaches", values)
    filtered = _filtered_values(conn, "coaches", values)
    if not filtered.get("name"):
        return None
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM coaches WHERE LOWER(name) = LOWER(%s) LIMIT 1", (filtered["name"],))
        row = cur.fetchone()
        if row:
            return row[0]
        names = list(filtered.keys())
        placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
        params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
        cur.execute(
            f"""
            INSERT INTO coaches ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_match(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    return upsert_by_api_id(conn, "matches", values)


def upsert_team(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    return upsert_by_api_id(conn, "teams", values)


def upsert_team_venue(
    conn: PgConnection,
    *,
    team_id: int | None,
    venue_id: int | None,
    season: int | None = None,
    is_primary: bool = True,
    valid_from: str | None = None,
    valid_to: str | None = None,
) -> Optional[int]:
    if not team_id or not venue_id or not table_exists(conn, "team_venues"):
        return None
    filtered = _filtered_values(
        conn,
        "team_venues",
        {
            "team_id": team_id,
            "venue_id": venue_id,
            "season": season,
            "is_primary": is_primary,
            "valid_from": valid_from,
            "valid_to": valid_to,
        },
    )
    with conn.cursor() as cur:
        if season is None:
            cur.execute(
                """
                SELECT id FROM team_venues
                WHERE team_id = %s AND venue_id = %s AND season IS NULL
                LIMIT 1
                """,
                (team_id, venue_id),
            )
        else:
            cur.execute(
                """
                SELECT id FROM team_venues
                WHERE team_id = %s AND venue_id = %s AND season = %s
                LIMIT 1
                """,
                (team_id, venue_id, season),
            )
        row = cur.fetchone()
        if row:
            names = [name for name in filtered if name != "id"]
            assignments = ", ".join(
                f"{quote_ident(name, conn)} = CURRENT_TIMESTAMP"
                if filtered[name] == "CURRENT_TIMESTAMP"
                else f"{quote_ident(name, conn)} = %s"
                for name in names
            )
            params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
            cur.execute(f"UPDATE team_venues SET {assignments} WHERE id = %s RETURNING id", params + [row[0]])
            return cur.fetchone()[0]
        names = list(filtered.keys())
        placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
        params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
        cur.execute(
            f"""
            INSERT INTO team_venues ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_team_competition_season(
    conn: PgConnection,
    *,
    team_id: int | None,
    competition_season_id: int | None,
    group_name: str | None = None,
    stage: str | None = None,
    is_active: bool = True,
) -> Optional[int]:
    if not team_id or not competition_season_id or not table_exists(conn, "team_competition_seasons"):
        return None
    return _upsert_by_columns(
        conn,
        "team_competition_seasons",
        {
            "team_id": team_id,
            "competition_season_id": competition_season_id,
            "group_name": group_name,
            "stage": stage,
            "is_active": is_active,
        },
        ["team_id", "competition_season_id"],
    )


def upsert_team_season_statistics(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "team_season_statistics"):
        return None
    return _upsert_by_columns(conn, "team_season_statistics", values, ["team_id", "competition_season_id"])


def upsert_team_goal_statistics(conn: PgConnection, team_season_statistics_id: int, rows: Iterable[Dict[str, Any]]) -> list[int]:
    ids: list[int] = []
    for row in rows:
        row_id = _upsert_by_columns(
            conn,
            "team_goal_statistics",
            {**row, "team_season_statistics_id": team_season_statistics_id},
            ["team_season_statistics_id", "goal_direction", "minute_from", "minute_to"],
        )
        if row_id:
            ids.append(row_id)
    return ids


def upsert_team_lineup_statistics(conn: PgConnection, team_season_statistics_id: int, rows: Iterable[Dict[str, Any]]) -> list[int]:
    ids: list[int] = []
    for row in rows:
        row_id = _upsert_by_columns(
            conn,
            "team_lineup_statistics",
            {**row, "team_season_statistics_id": team_season_statistics_id},
            ["team_season_statistics_id", "formation"],
        )
        if row_id:
            ids.append(row_id)
    return ids


def upsert_team_coach(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "team_coaches"):
        return None
    filtered = _filtered_values(conn, "team_coaches", values)
    if not filtered.get("team_id") or not filtered.get("coach_id"):
        return None
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM team_coaches
            WHERE team_id = %s
              AND coach_id = %s
              AND COALESCE(season, -1) = COALESCE(%s, -1)
              AND COALESCE(started_at, DATE '0001-01-01') = COALESCE(%s, DATE '0001-01-01')
            LIMIT 1
            """,
            (filtered.get("team_id"), filtered.get("coach_id"), filtered.get("season"), filtered.get("started_at")),
        )
        row = cur.fetchone()
        if row:
            names = [name for name in filtered if name != "id"]
            assignments = ", ".join(
                f"{quote_ident(name, conn)} = CURRENT_TIMESTAMP"
                if filtered[name] == "CURRENT_TIMESTAMP"
                else f"{quote_ident(name, conn)} = %s"
                for name in names
            )
            params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
            cur.execute(f"UPDATE team_coaches SET {assignments} WHERE id = %s RETURNING id", params + [row[0]])
            return cur.fetchone()[0]
        names = list(filtered.keys())
        placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
        params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
        cur.execute(
            f"""
            INSERT INTO team_coaches ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_team_trophy(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "team_trophies"):
        return None
    filtered = _filtered_values(conn, "team_trophies", values)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM team_trophies
            WHERE team_id = %s
              AND COALESCE(competition_name, '') = COALESCE(%s, '')
              AND COALESCE(season, '') = COALESCE(%s, '')
              AND COALESCE(place, '') = COALESCE(%s, '')
            LIMIT 1
            """,
            (filtered.get("team_id"), filtered.get("competition_name"), filtered.get("season"), filtered.get("place")),
        )
        row = cur.fetchone()
        if row:
            names = [name for name in filtered if name != "id"]
            assignments = ", ".join(
                f"{quote_ident(name, conn)} = CURRENT_TIMESTAMP"
                if filtered[name] == "CURRENT_TIMESTAMP"
                else f"{quote_ident(name, conn)} = %s"
                for name in names
            )
            params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
            cur.execute(f"UPDATE team_trophies SET {assignments} WHERE id = %s RETURNING id", params + [row[0]])
            return cur.fetchone()[0]
        names = list(filtered.keys())
        placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
        params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
        cur.execute(
            f"""
            INSERT INTO team_trophies ({", ".join(quote_ident(name, conn) for name in names)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
            """,
            params,
        )
        return cur.fetchone()[0]


def upsert_team_form_snapshot(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "team_form_snapshots"):
        return None
    return _upsert_by_columns(conn, "team_form_snapshots", values, ["team_id", "competition_season_id", "snapshot_at"])


def upsert_team_standing_snapshot(conn: PgConnection, values: Dict[str, Any]) -> Optional[int]:
    if not table_exists(conn, "team_standing_snapshots"):
        return None
    return _upsert_by_columns(conn, "team_standing_snapshots", values, ["team_id", "competition_season_id", "snapshot_at"])


def upsert_match_events(conn: PgConnection, match_id: int, events: Iterable[Dict[str, Any]]) -> list[int]:
    ids: list[int] = []
    for event in events:
        team_id = find_id_by_api_id(conn, "teams", int(event["team_api_id"])) if event.get("team_api_id") else None
        player_id = find_id_by_api_id(conn, "players", int(event["player_api_id"])) if event.get("player_api_id") else None
        assist_player_id = (
            find_id_by_api_id(conn, "players", int(event["assist_player_api_id"]))
            if event.get("assist_player_api_id")
            else None
        )
        values = {
            **event,
            "match_id": match_id,
            "team_id": team_id,
            "player_id": player_id,
            "assist_player_id": assist_player_id,
        }
        row_id = _upsert_by_columns(conn, "match_events", values, ["match_id", "event_key"])
        if row_id:
            ids.append(row_id)
    return ids


def upsert_match_team_statistics(conn: PgConnection, match_id: int, statistics: Iterable[Dict[str, Any]]) -> list[int]:
    ids: list[int] = []
    for row in statistics:
        team_id = find_id_by_api_id(conn, "teams", int(row["team_api_id"])) if row.get("team_api_id") else None
        if not team_id:
            continue
        row_id = _upsert_by_columns(conn, "match_team_statistics", {**row, "match_id": match_id, "team_id": team_id}, ["match_id", "team_id"])
        if row_id:
            ids.append(row_id)
    return ids


def upsert_match_lineup(conn: PgConnection, match_id: int, values: Dict[str, Any]) -> Optional[int]:
    team_id = find_id_by_api_id(conn, "teams", int(values["team_api_id"])) if values.get("team_api_id") else None
    if not team_id:
        return None
    coach_id = upsert_coach(conn, values.get("coach") or {}) if values.get("coach") else None
    return _upsert_by_columns(
        conn,
        "match_lineups",
        {**values, "match_id": match_id, "team_id": team_id, "coach_id": coach_id},
        ["match_id", "team_id"],
    )


def upsert_match_lineup_players(
    conn: PgConnection,
    lineup_id: int,
    match_id: int,
    team_id: int,
    players: Iterable[Dict[str, Any]],
) -> list[int]:
    ids: list[int] = []
    for player in players:
        player_id = find_id_by_api_id(conn, "players", int(player["player_api_id"])) if player.get("player_api_id") else None
        values = {**player, "lineup_id": lineup_id, "match_id": match_id, "team_id": team_id, "player_id": player_id}
        row_id = _upsert_by_columns(conn, "match_lineup_players", values, ["lineup_id", "lineup_player_key"])
        if row_id:
            ids.append(row_id)
    return ids


def upsert_match_player_statistics(conn: PgConnection, match_id: int, statistics: Iterable[Dict[str, Any]]) -> list[int]:
    ids: list[int] = []
    for row in statistics:
        team_id = find_id_by_api_id(conn, "teams", int(row["team_api_id"])) if row.get("team_api_id") else None
        player_id = find_id_by_api_id(conn, "players", int(row["player_api_id"])) if row.get("player_api_id") else None
        if not team_id:
            continue
        values = {**row, "match_id": match_id, "team_id": team_id, "player_id": player_id}
        if player_id:
            row_id = _upsert_by_columns(conn, "match_player_statistics", values, ["match_id", "team_id", "player_id"])
        else:
            filtered = _filtered_values(conn, "match_player_statistics", values)
            if not filtered.get("shirt_number"):
                continue
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM match_player_statistics
                    WHERE match_id = %s
                      AND team_id = %s
                      AND player_id IS NULL
                      AND shirt_number = %s
                      AND COALESCE(position, '') = COALESCE(%s, '')
                    LIMIT 1
                    """,
                    (match_id, team_id, filtered.get("shirt_number"), filtered.get("position")),
                )
                existing = cur.fetchone()
                if existing:
                    names = [name for name in filtered if name != "id"]
                    assignments = ", ".join(
                        f"{quote_ident(name, conn)} = CURRENT_TIMESTAMP"
                        if filtered[name] == "CURRENT_TIMESTAMP"
                        else f"{quote_ident(name, conn)} = %s"
                        for name in names
                    )
                    params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
                    cur.execute(
                        f"UPDATE match_player_statistics SET {assignments} WHERE id = %s RETURNING id",
                        params + [existing[0]],
                    )
                    row_id = cur.fetchone()[0]
                else:
                    names = list(filtered.keys())
                    placeholders = ["CURRENT_TIMESTAMP" if filtered[name] == "CURRENT_TIMESTAMP" else "%s" for name in names]
                    params = [filtered[name] for name in names if filtered[name] != "CURRENT_TIMESTAMP"]
                    cur.execute(
                        f"""
                        INSERT INTO match_player_statistics ({", ".join(quote_ident(name, conn) for name in names)})
                        VALUES ({", ".join(placeholders)})
                        RETURNING id
                        """,
                        params,
                    )
                    row_id = cur.fetchone()[0]
        if row_id:
            ids.append(row_id)
    return ids
