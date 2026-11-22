#!/usr/bin/env python
"""
Sync local team logo files into the backend public assets folder.

Usage:
    python sync_team_logos.py

Optional environment variables:
    TEAM_LOGO_SOURCE_DIR
    TEAM_LOGO_TARGET_DIR
"""

from __future__ import annotations

import filecmp
import os
import re
import shutil
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import psycopg2


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
ENV_PATH = BASE_DIR / ".env"

SOURCE_LOGO_DIR = Path(
    os.getenv("TEAM_LOGO_SOURCE_DIR", r"C:\Users\SOHAYB\Downloads\logo")
)
TARGET_LOGO_DIR = Path(
    os.getenv(
        "TEAM_LOGO_TARGET_DIR",
        str(BASE_DIR / "src" / "public" / "assets" / "teams"),
    )
)

COMMON_SUFFIXES = {
    "fc",
    "cf",
    "afc",
    "sc",
    "club",
    "football",
    "futbol",
    "soccer",
    "i",
    "ii",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
MIN_MATCH_SCORE = 0.74
TEAM_ALIASES = {
    "acmilan": ["milan"],
    "athleticclub": ["athletic"],
    "atleticomadrid": ["atletico"],
    "bayerleverkusen": ["leverkusen"],
    "bayernmunich": ["bayern"],
    "borussiadortmund": ["dortmund"],
    "borussiamonchengladbach": ["mgladbach", "monchengladbach", "gladbach"],
    "celtavigo": ["celta"],
    "eintrachtfrankfurt": ["frankfurt"],
    "hamburgersv": ["hsv"],
    "inter": ["internazionale"],
    "koln": ["koeln"],
    "manchestercity": ["mancity", "city"],
    "manchesterunited": ["manutd", "united"],
    "parissaintgermain": ["paris", "psg"],
    "rbleipzig": ["leipzig"],
    "realmadrid": ["madrid"],
    "realbetis": ["betis"],
    "rayovallecano": ["rayo"],
    "saintetienne": ["saintetienne"],
    "tottenhamhotspur": ["tottenham", "spurs"],
    "werderbremen": ["bremen"],
    "wolverhamptonwanderers": ["wolves", "wolverhampton"],
}


def load_env(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def connect():
    load_env()

    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)

    required = {
        "DB_USER or PGUSER": os.getenv("DB_USER") or os.getenv("PGUSER"),
        "DB_PASSWORD or PGPASSWORD": os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
        "DB_NAME or PGDATABASE": os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing database settings in .env: "
            + ", ".join(missing)
            + ". Add them to myapp-backend/.env or set DATABASE_URL."
        )

    return psycopg2.connect(
        host=os.getenv("DB_HOST") or os.getenv("PGHOST") or "localhost",
        port=int(os.getenv("DB_PORT") or os.getenv("PGPORT") or "5432"),
        user=os.getenv("DB_USER") or os.getenv("PGUSER"),
        password=os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
        dbname=os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
    )


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return normalized.encode("ascii", "ignore").decode("ascii")


def tokenize(value: str) -> List[str]:
    value = strip_accents(value).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return [part for part in value.split() if part and part not in COMMON_SUFFIXES]


def match_key(value: str) -> str:
    return "".join(tokenize(value))


def alias_keys(team_key: str) -> List[str]:
    return [match_key(alias) for alias in TEAM_ALIASES.get(team_key, [])]


def clean_filename(name: str, extension: str = ".png") -> str:
    words = tokenize(name)
    return f"{'_'.join(words) or 'team'}{extension.lower()}"


def iter_logo_files(source_dir: Path) -> Iterable[Path]:
    for path in source_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            yield path


def build_logo_index(source_dir: Path) -> Tuple[Dict[str, Path], List[Tuple[str, Path]]]:
    exact: Dict[str, Path] = {}
    fuzzy: List[Tuple[str, Path]] = []

    for path in iter_logo_files(source_dir):
        key = match_key(path.stem)
        if not key:
            continue
        exact.setdefault(key, path)
        fuzzy.append((key, path))

    return exact, fuzzy


def find_logo(team_name: str, exact: Dict[str, Path], fuzzy: List[Tuple[str, Path]]) -> Optional[Path]:
    team_key = match_key(team_name)
    if not team_key:
        return None

    keys = [team_key, *alias_keys(team_key)]

    for key in keys:
        if key in exact:
            return exact[key]

    best_path = None
    best_score = 0.0
    for logo_key, path in fuzzy:
        scores = [SequenceMatcher(None, key, logo_key).ratio() for key in keys]
        for key in keys:
            if key and (key in logo_key or logo_key in key):
                shorter = min(len(key), len(logo_key))
                longer = max(len(key), len(logo_key))
                scores.append(shorter / longer)
        score = max(scores)
        if score > best_score:
            best_score = score
            best_path = path

    if best_score >= MIN_MATCH_SCORE:
        return best_path

    return None


def fetch_teams(conn) -> List[Tuple[int, str]]:
    with conn.cursor() as cursor:
        cursor.execute("SELECT id, name FROM teams ORDER BY name")
        return cursor.fetchall()


def copy_logo(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)

    if target_path.exists() and filecmp.cmp(source_path, target_path, shallow=False):
        return

    shutil.copy2(source_path, target_path)


def update_team_logo(conn, team_id: int, logo_path: str) -> None:
    with conn.cursor() as cursor:
        cursor.execute("UPDATE teams SET logo = %s WHERE id = %s", (logo_path, team_id))


def sync_team_logos() -> None:
    if not SOURCE_LOGO_DIR.exists():
        raise RuntimeError(f"Source logo folder does not exist: {SOURCE_LOGO_DIR}")

    exact, fuzzy = build_logo_index(SOURCE_LOGO_DIR)
    if not fuzzy:
        raise RuntimeError(f"No image files found in source logo folder: {SOURCE_LOGO_DIR}")

    conn = connect()
    matched = 0
    missing = 0

    try:
        teams = fetch_teams(conn)
        total = len(teams)

        for index, (team_id, team_name) in enumerate(teams, start=1):
            source_logo = find_logo(team_name, exact, fuzzy)
            if not source_logo:
                missing += 1
                print(f"[{index}/{total}] Missing logo: {team_name}")
                continue

            target_filename = clean_filename(team_name, source_logo.suffix)
            target_path = TARGET_LOGO_DIR / target_filename
            public_logo_path = f"/assets/teams/{target_filename}"

            copy_logo(source_logo, target_path)
            update_team_logo(conn, team_id, public_logo_path)
            matched += 1
            print(f"[{index}/{total}] {team_name} OK")

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"Matched: {matched}")
    print(f"Missing: {missing}")


if __name__ == "__main__":
    sync_team_logos()
