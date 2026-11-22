#!/usr/bin/env python
"""
Prepare the local football database and generated assets for API-Football data.

This script does not call API-Football. It supports dry-run and explicit execute
modes, derives delete order from PostgreSQL foreign keys, and writes an asset
cleanup manifest.
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple

import psycopg2
from dotenv import load_dotenv
from psycopg2.extensions import connection as PgConnection
from psycopg2.extensions import quote_ident


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"
BACKUP_DIR = BACKEND_DIR / "backups"
MANIFEST_PATH = BACKEND_DIR / "data" / "asset_cleanup_manifest.json"

DEFAULT_PRESERVED_FILENAMES = {
    ".gitkeep",
    "readme",
    "readme.md",
    "default-team.png",
    "default-player.png",
    "default-news.png",
    "default-competition.png",
    "placeholder.png",
}

BASE_CLEANUP_TABLES = {
    "player_transfers",
    "user_favorites",
    "matches",
    "players",
    "team_competitions",
    "teams",
    "competitions",
    "seasons",
    "news",
}

ASSET_SUBDIRS = {"teams", "players", "competitions", "news", "flags"}


def connect() -> PgConnection:
    load_dotenv(ENV_PATH)
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)

    return psycopg2.connect(
        host=os.getenv("DB_HOST") or os.getenv("PGHOST") or "localhost",
        port=int(os.getenv("DB_PORT") or os.getenv("PGPORT") or "5432"),
        dbname=os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
        user=os.getenv("DB_USER") or os.getenv("PGUSER"),
        password=os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
    )


def table_names(conn: PgConnection) -> Set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            """
        )
        return {row[0] for row in cur.fetchall()}


def row_counts(conn: PgConnection, tables: Iterable[str]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    with conn.cursor() as cur:
        for table in sorted(tables):
            cur.execute(f"SELECT COUNT(*) FROM {quote_ident(table, conn)}")
            counts[table] = int(cur.fetchone()[0])
    return counts


def foreign_keys(conn: PgConnection) -> List[Tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                tc.table_name AS child_table,
                ccu.table_name AS parent_table
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema = tc.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.constraint_type = 'FOREIGN KEY'
            """
        )
        return [(row[0], row[1]) for row in cur.fetchall()]


def cleanup_tables(conn: PgConnection, keep_countries: bool, keep_users: bool) -> Set[str]:
    existing = table_names(conn)
    selected = BASE_CLEANUP_TABLES & existing
    if not keep_countries and "countries" in existing:
        selected.add("countries")
    if not keep_users and "users" in existing:
        selected.add("users")
    return selected


def derive_child_first_order(conn: PgConnection, selected: Set[str]) -> List[str]:
    edges = [(child, parent) for child, parent in foreign_keys(conn) if child in selected and parent in selected]
    parents_by_child: Dict[str, Set[str]] = defaultdict(set)
    children_by_parent: Dict[str, Set[str]] = defaultdict(set)
    for child, parent in edges:
        parents_by_child[child].add(parent)
        children_by_parent[parent].add(child)

    child_count = {table: len(children_by_parent[table]) for table in selected}
    ready = deque(sorted(table for table in selected if child_count[table] == 0))
    order: List[str] = []

    while ready:
        child = ready.popleft()
        order.append(child)
        for parent in sorted(parents_by_child[child]):
            child_count[parent] -= 1
            if child_count[parent] == 0:
                ready.append(parent)

    if len(order) != len(selected):
        unresolved = sorted(selected - set(order))
        raise RuntimeError(f"Could not derive cleanup order because of FK cycle or metadata issue: {unresolved}")

    return order


def backups_exist() -> bool:
    return BACKUP_DIR.exists() and any(BACKUP_DIR.glob("football_db_*.sql"))


def discover_asset_roots() -> List[Path]:
    candidates = [
        PROJECT_DIR / "frontend" / "public" / "assets",
        BACKEND_DIR / "src" / "public" / "assets",
        BACKEND_DIR / "public" / "assets",
    ]
    env_root = os.getenv("ASSETS_ROOT")
    if env_root:
        candidates.insert(0, Path(env_root))
    roots: List[Path] = []
    seen: Set[str] = set()
    for path in candidates:
        if not path.exists() or not path.is_dir():
            continue
        resolved = path.resolve()
        key = str(resolved).lower()
        if key in seen:
            continue
        seen.add(key)
        roots.append(resolved)
    return roots


def is_inside(path: Path, roots: Sequence[Path]) -> bool:
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in roots)


def should_preserve(path: Path, keep_countries: bool) -> bool:
    lower = path.name.lower()
    if lower in DEFAULT_PRESERVED_FILENAMES:
        return True
    if lower.startswith("default-") or "placeholder" in lower:
        return True
    if keep_countries and path.parent.name.lower() == "flags":
        return True
    return False


def discover_generated_assets(roots: Sequence[Path], keep_countries: bool) -> Tuple[List[Path], List[Path], List[Path]]:
    delete_files: List[Path] = []
    preserve_files: List[Path] = []
    missing_dirs: List[Path] = []
    seen_delete: Set[str] = set()
    seen_preserve: Set[str] = set()

    for root in roots:
        for subdir in sorted(ASSET_SUBDIRS):
            directory = root / subdir
            if not directory.exists():
                missing_dirs.append(directory)
                continue
            for path in sorted(directory.rglob("*")):
                if not path.is_file():
                    continue
                if not is_inside(path, roots):
                    raise RuntimeError(f"Refusing to inspect file outside approved asset roots: {path}")
                if should_preserve(path, keep_countries):
                    key = str(path.resolve()).lower()
                    if key not in seen_preserve:
                        seen_preserve.add(key)
                        preserve_files.append(path)
                else:
                    key = str(path.resolve()).lower()
                    if key not in seen_delete:
                        seen_delete.add(key)
                        delete_files.append(path)

    return delete_files, preserve_files, missing_dirs


def clean_assets(dry_run: bool, keep_countries: bool) -> None:
    roots = discover_asset_roots()
    delete_files, preserve_files, missing_dirs = discover_generated_assets(roots, keep_countries)

    print("Asset roots:")
    for root in roots:
        print(f"  {root}")

    counts_by_dir: Dict[str, int] = defaultdict(int)
    for path in delete_files:
        counts_by_dir[str(path.parent)] += 1
    print("Generated asset candidates:")
    for directory, count in sorted(counts_by_dir.items()):
        print(f"  {directory}: {count} file(s)")

    deleted: List[str] = []
    already_missing: List[str] = []
    if not dry_run:
        for path in delete_files:
            if not is_inside(path, roots):
                raise RuntimeError(f"Refusing to delete file outside approved asset roots: {path}")
            try:
                path.unlink()
            except FileNotFoundError:
                already_missing.append(str(path))
                continue
            deleted.append(str(path))

    manifest = {
        "cleanup_timestamp": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "planned_delete_files": [str(path) for path in delete_files],
        "deleted_files": deleted,
        "already_missing_files": already_missing,
        "preserved_files": [str(path) for path in preserve_files],
        "missing_directories": [str(path) for path in missing_dirs],
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Asset cleanup manifest written: {MANIFEST_PATH}")


def reset_sequences(conn: PgConnection, tables: Iterable[str]) -> None:
    with conn.cursor() as cur:
        for table in sorted(tables):
            cur.execute(
                """
                SELECT pg_get_serial_sequence(%s, 'id')
                """,
                (table,),
            )
            sequence = cur.fetchone()[0]
            if sequence:
                cur.execute("SELECT setval(%s, 1, false)", (sequence,))


def delete_rows(conn: PgConnection, order: Sequence[str], dry_run: bool) -> None:
    if dry_run:
        return
    with conn.cursor() as cur:
        for table in order:
            cur.execute(f"DELETE FROM {quote_ident(table, conn)}")
    reset_sequences(conn, order)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare fake local football data for API-Football import.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Print planned cleanup without changing data.")
    mode.add_argument("--execute", action="store_true", help="Execute cleanup in a transaction.")
    parser.add_argument("--keep-countries", action="store_true", help="Preserve countries and flags. This is the default.")
    parser.add_argument("--keep-users", action="store_true", help="Preserve users. This is the default.")
    parser.add_argument("--clear-countries", action="store_true", help="Also clear countries and generated flags.")
    parser.add_argument("--clear-users", action="store_true", help="Also clear users.")
    parser.add_argument("--force", action="store_true", help="Allow --execute without a timestamped backup.")
    args = parser.parse_args()

    dry_run = bool(args.dry_run)
    keep_countries = not args.clear_countries
    keep_users = not args.clear_users

    if args.execute and not args.force and not backups_exist():
        raise SystemExit("Refusing destructive cleanup: create a backup first or pass --force.")

    conn = connect()
    try:
        selected = cleanup_tables(conn, keep_countries=keep_countries, keep_users=keep_users)
        order = derive_child_first_order(conn, selected)
        before = row_counts(conn, selected)

        print("Cleanup order:")
        for table in order:
            print(f"  {table}: {before.get(table, 0)} row(s)")

        if dry_run:
            clean_assets(dry_run=True, keep_countries=keep_countries)
            print("Dry-run complete. No database rows or asset files were deleted.")
            conn.rollback()
            return

        delete_rows(conn, order, dry_run=False)
        after = row_counts(conn, selected)
        conn.commit()
        clean_assets(dry_run=False, keep_countries=keep_countries)

        print("Final row counts:")
        for table in order:
            print(f"  {table}: {after.get(table, 0)} row(s)")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
