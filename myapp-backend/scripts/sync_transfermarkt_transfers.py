#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"
DEFAULT_BASE_URL = "https://transfermarkt-api.fly.dev"
DEFAULT_TTL_DAYS = int(os.getenv("TRANSFERMARKT_CACHE_TTL_DAYS") or "30")

RESOURCE_PATHS = {
    "profile": "/players/{id}/profile",
    "market_value": "/players/{id}/market_value",
    "transfers": "/players/{id}/transfers",
}
RESOURCE_STAT_KEYS = {
    "profile": "profileCachesUpdated",
    "market_value": "marketValueCachesUpdated",
    "transfers": "transferCachesUpdated",
}

TEAM_ALIASES = {
    "man utd": "manchester united",
    "man united": "manchester united",
    "man city": "manchester city",
    "inter": "inter milan",
    "inter milan": "inter",
    "barca": "barcelona",
    "fc barcelona": "barcelona",
    "atleti": "atletico madrid",
    "spurs": "tottenham",
    "tottenham hotspur": "tottenham",
    "psg": "paris saint germain",
    "paris sg": "paris saint germain",
}

WITHOUT_CLUB_NAMES = {"without", "without club", "retired", "career break", "unknown"}


@dataclass
class TeamMatch:
    id: int
    name: str


def load_env() -> None:
    load_dotenv(ENV_PATH)


def connect():
    load_env()
    return psycopg2.connect(
        host=os.getenv("DB_HOST") or os.getenv("PGHOST") or "localhost",
        port=int(os.getenv("DB_PORT") or os.getenv("PGPORT") or "5432"),
        dbname=os.getenv("DB_NAME") or os.getenv("PGDATABASE"),
        user=os.getenv("DB_USER") or os.getenv("PGUSER"),
        password=os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD"),
    )


def base_url() -> str:
    return (os.getenv("TRANSFERMARKT_API_URL") or DEFAULT_BASE_URL).rstrip("/")


def normalize(value: Any) -> str:
    text = str(value or "").lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = "".join(char if char.isalnum() else " " for char in text)
    words = [word for word in text.split() if word not in {"fc", "cf", "sc", "ac", "club", "the"}]
    return " ".join(words)


def request_json(path: str, timeout: int = 30) -> dict[str, Any]:
    url = f"{base_url()}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "375scores-transfer-sync/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


def fetch_resource(transfermarkt_id: str, resource: str) -> dict[str, Any]:
    return request_json(RESOURCE_PATHS[resource].format(id=urllib.parse.quote(str(transfermarkt_id))))


def get_cached_resource(conn, player: dict[str, Any], resource: str) -> dict[str, Any] | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT payload
            FROM transfermarkt_cache
            WHERE entity_type = 'player'
              AND transfermarkt_id = %s
              AND resource = %s
            ORDER BY fetched_at DESC NULLS LAST, updated_at DESC NULLS LAST
            LIMIT 1
            """,
            (str(player["transfermarkt_id"]), resource),
        )
        row = cur.fetchone()
        return dict(row["payload"]) if row and isinstance(row["payload"], dict) else None


def parse_fee(value: Any) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else 0

    text = str(value).strip().lower()
    if not text or text in {"-", "n/a", "unknown", "undisclosed", "free transfer", "free"}:
        return 0

    number = "".join(char for char in text if char.isdigit() or char == ".")
    if not number:
        return 0

    amount = float(number)
    if "bn" in text or text.endswith("b"):
        amount *= 1_000_000_000
    elif "m" in text:
        amount *= 1_000_000
    elif "k" in text:
        amount *= 1_000
    return int(amount) if amount > 0 else 0


def map_transfer_type(raw: dict[str, Any]) -> str:
    text = " ".join(str(raw.get(key) or "") for key in ("type", "fee", "transferType")).lower()
    if "loan" in text:
        return "loan"
    if "free" in text or "without club" in text:
        return "free"
    if parse_fee(raw.get("fee")) > 0 or parse_fee(raw.get("marketValue")) > 0:
        return "permanent"
    if any(token in text for token in ("transfer", "fee", "permanent")):
        return "permanent"
    if raw.get("clubFrom") and raw.get("clubTo"):
        return "permanent"
    return "unknown"


def parse_date(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)[:10]
    try:
        datetime.strptime(text, "%Y-%m-%d")
        return text
    except ValueError:
        return None


def default_transfer_date(season: Any) -> str:
    text = str(season or "").strip()
    match = None
    if "/" in text:
        left = text.split("/", 1)[0]
        if left.isdigit():
            year = int(left)
            match = 1900 + year if year >= 70 else 2000 + year
    return f"{match or datetime.now().year}-07-01"


def compact_profile_value(profile: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = profile.get(key)
        if value not in (None, ""):
            return value
    return None


def text_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in ("name", "value", "label", "url", "src"):
            nested = text_value(value.get(key))
            if nested:
                return nested
        return None
    if isinstance(value, list):
        for item in value:
            nested = text_value(item)
            if nested:
                return nested
        return None
    return str(value).strip() or None


def get_players(conn, args) -> list[dict[str, Any]]:
    params: list[Any] = []
    where = ["p.transfermarkt_id IS NOT NULL"]

    if args.player_id:
        params.append(args.player_id)
        where.append("p.id = %s")
    else:
        params.append(args.years)
        where.append(
            """
            EXISTS (
              SELECT 1
              FROM player_transfers pt_scope
              WHERE pt_scope.player_id = p.id
                AND pt_scope.transfer_date >= CURRENT_DATE - (%s::text || ' years')::interval
            )
            """
        )

    if args.only_dirty:
        where.append(
            """
            EXISTS (
              SELECT 1
              FROM player_transfers pt
              WHERE pt.player_id = p.id
                AND (
                  pt.transfer_type = 'unknown'
                  OR pt.transfer_fee = 0
                  OR pt.from_team_id IS NULL
                  OR pt.to_team_id IS NULL
                  OR pt.transfer_date IS NULL
                )
            )
            """
        )

    limit_sql = ""
    if args.limit > 0:
        params.append(args.limit)
        limit_sql = "LIMIT %s"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            f"""
            SELECT
              p.id,
              p.name,
              p.firstname,
              p.lastname,
              p.birth_date,
              p.height,
              p.weight,
              p.position,
              p.nationality,
              p.photo_path,
              p.transfermarkt_id,
              p.transfermarkt_url
            FROM players p
            WHERE {" AND ".join(where)}
            ORDER BY p.transfermarkt_synced_at NULLS FIRST, p.id
            {limit_sql}
            """,
            params,
        )
        return list(cur.fetchall())


def load_team_index(conn) -> tuple[dict[str, TeamMatch], TeamMatch | None]:
    index: dict[str, TeamMatch] = {}
    without_club = None
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name, short_name, code FROM teams")
        for row in cur.fetchall():
            team = TeamMatch(id=int(row["id"]), name=row["name"])
            if normalize(row["name"]) == "without":
                without_club = team
            for candidate in (row["name"], row.get("short_name"), row.get("code")):
                key = normalize(candidate)
                if key and key not in index:
                    index[key] = team
            alias = TEAM_ALIASES.get(normalize(row["name"]))
            if alias and alias not in index:
                index[alias] = team
    return index, without_club


def resolve_team(team_index: dict[str, TeamMatch], without_club: TeamMatch | None, club: dict[str, Any] | None) -> TeamMatch | None:
    name = (club or {}).get("name")
    key = normalize(name)
    if not key:
        return None
    if key in WITHOUT_CLUB_NAMES:
        return without_club

    candidates = [key, TEAM_ALIASES.get(key), key.replace(" united", ""), key.replace(" city", "")]
    for candidate in candidates:
        if candidate and candidate in team_index:
            return team_index[candidate]

    words = key.split()
    if len(words) >= 2:
        shorter = " ".join(words[:2])
        if shorter in team_index:
            return team_index[shorter]

    return None


def save_cache(conn, player: dict[str, Any], resource: str, payload: dict[str, Any], ttl_days: int) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO transfermarkt_cache (
              entity_type,
              entity_id,
              transfermarkt_id,
              resource,
              payload,
              expires_at
            )
            VALUES ('player', %s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (entity_type, transfermarkt_id, resource) DO UPDATE
            SET entity_id = EXCLUDED.entity_id,
                payload = EXCLUDED.payload,
                fetched_at = CURRENT_TIMESTAMP,
                expires_at = EXCLUDED.expires_at,
                updated_at = CURRENT_TIMESTAMP
            """,
            (player["id"], str(player["transfermarkt_id"]), resource, json.dumps(payload), expires_at),
        )


def update_player_from_profile(conn, player: dict[str, Any], profile: dict[str, Any]) -> bool:
    birth_date = parse_date(compact_profile_value(profile, "dateOfBirth", "birthDate"))
    height = text_value(compact_profile_value(profile, "height"))
    position = text_value(compact_profile_value(profile, "position", "mainPosition"))
    nationality = None
    nationalities = profile.get("nationalities")
    if isinstance(nationalities, list) and nationalities:
        nationality = text_value(nationalities[0])
    nationality = nationality or text_value(compact_profile_value(profile, "nationality"))
    photo = text_value(compact_profile_value(profile, "imageUrl", "photo", "photoUrl"))

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players
            SET birth_date = COALESCE(%s::date, birth_date),
                height = COALESCE(%s, height),
                position = COALESCE(NULLIF(%s, ''), position),
                nationality = COALESCE(NULLIF(%s, ''), nationality),
                photo_path = COALESCE(NULLIF(%s, ''), photo_path),
                transfermarkt_synced_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
              AND (
                (%s::date IS NOT NULL AND birth_date IS DISTINCT FROM %s::date)
                OR (%s IS NOT NULL AND height IS DISTINCT FROM %s)
                OR (NULLIF(%s, '') IS NOT NULL AND position IS DISTINCT FROM %s)
                OR (NULLIF(%s, '') IS NOT NULL AND nationality IS DISTINCT FROM %s)
                OR (NULLIF(%s, '') IS NOT NULL AND photo_path IS DISTINCT FROM %s)
              )
            """,
            (
                birth_date,
                height,
                position,
                nationality,
                photo,
                player["id"],
                birth_date,
                birth_date,
                height,
                height,
                position,
                position,
                nationality,
                nationality,
                photo,
                photo,
            ),
        )
        return cur.rowcount > 0


def find_existing_transfer(conn, player_id: int, transfer_date: str, from_team_id: int | None, to_team_id: int | None):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT *
            FROM player_transfers
            WHERE player_id = %s
              AND transfer_date = %s::date
              AND (
                (from_team_id = COALESCE(%s, from_team_id) AND to_team_id = COALESCE(%s, to_team_id))
                OR (
                  (transfer_type = 'unknown' OR transfer_fee = 0)
                  AND (%s IS NULL OR from_team_id = %s)
                  AND (%s IS NULL OR to_team_id = %s)
                )
              )
            ORDER BY
              CASE WHEN from_team_id = %s AND to_team_id = %s THEN 0 ELSE 1 END,
              id
            LIMIT 1
            """,
            (player_id, transfer_date, from_team_id, to_team_id, from_team_id, from_team_id, to_team_id, to_team_id, from_team_id, to_team_id),
        )
        return cur.fetchone()


def upsert_transfer(conn, player: dict[str, Any], raw: dict[str, Any], from_team: TeamMatch | None, to_team: TeamMatch | None) -> tuple[str, dict[str, Any] | None]:
    transfer_date = parse_date(raw.get("date")) or default_transfer_date(raw.get("season"))
    transfer_fee = parse_fee(raw.get("fee") or raw.get("transferFee") or raw.get("marketValue"))
    transfer_type = map_transfer_type(raw)
    from_team_id = from_team.id if from_team else None
    to_team_id = to_team.id if to_team else None

    existing = find_existing_transfer(conn, int(player["id"]), transfer_date, from_team_id, to_team_id)
    if existing:
        before = dict(existing)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE player_transfers
                SET from_team_id = COALESCE(%s, from_team_id),
                    to_team_id = COALESCE(%s, to_team_id),
                    transfer_type = CASE
                      WHEN %s <> 'unknown' THEN %s
                      ELSE transfer_type
                    END,
                    transfer_fee = GREATEST(COALESCE(transfer_fee, 0), COALESCE(%s, 0)),
                    transfer_date = %s::date,
                    api_updated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING *
                """,
                (from_team_id, to_team_id, transfer_type, transfer_type, transfer_fee, transfer_date, existing["id"]),
            )
            after = dict(cur.fetchone())
        return ("updated" if transfer_changed(before, after) else "unchanged", after)

    if not from_team_id or not to_team_id:
        return "unresolved", None

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            INSERT INTO player_transfers (
              player_id,
              from_team_id,
              to_team_id,
              transfer_type,
              transfer_fee,
              transfer_date,
              api_synced_at,
              api_updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
            """,
            (player["id"], from_team_id, to_team_id, transfer_type, transfer_fee, transfer_date),
        )
        return "inserted", dict(cur.fetchone())


def transfer_changed(before: dict[str, Any], after: dict[str, Any]) -> bool:
    for key in ("from_team_id", "to_team_id", "transfer_type", "transfer_fee", "transfer_date"):
        if str(before.get(key)) != str(after.get(key)):
            return True
    return False


def extract_transfers(payload: dict[str, Any]) -> list[dict[str, Any]]:
    transfers = payload.get("transfers")
    if isinstance(transfers, list):
        return transfers
    data = payload.get("data")
    if isinstance(data, dict) and isinstance(data.get("transfers"), list):
        return data["transfers"]
    return []


def changed_team_entry(team: TeamMatch, reason: str) -> dict[str, Any]:
    return {"teamId": team.id, "team": team.name, "reason": reason}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sync local transfer rows from Transfermarkt cached/provider data.")
    parser.add_argument("--limit", type=int, default=100, help="Players to process. Use 0 for no limit.")
    parser.add_argument("--player-id", type=int, help="Only sync one local player id.")
    parser.add_argument("--years", type=int, default=2, help="Only players with local transfers in the last N years.")
    parser.add_argument("--only-dirty", action="store_true", help="Only players with unknown/zero/incomplete local transfer rows.")
    parser.add_argument("--force-fetch", action="store_true", help="Always fetch Transfermarkt resources even if cache is fresh.")
    parser.add_argument("--no-cache-fallback", action="store_true", help="Fail instead of using cached Transfermarkt payloads when the API is unavailable.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and resolve, but do not write DB changes.")
    parser.add_argument("--sleep", type=float, default=0.4, help="Delay between players.")
    parser.add_argument("--ttl-days", type=int, default=DEFAULT_TTL_DAYS)
    parser.add_argument("--output", help="Optional path to write JSON result.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    conn = connect()
    conn.autocommit = False

    stats = {
        "processedPlayers": 0,
        "profileCachesUpdated": 0,
        "marketValueCachesUpdated": 0,
        "transferCachesUpdated": 0,
        "playerProfilesUpdated": 0,
        "transfersInserted": 0,
        "transfersUpdated": 0,
        "transfersUnchanged": 0,
        "transfersUnresolved": 0,
        "errors": [],
    }
    changed_teams: dict[int, dict[str, Any]] = {}
    unresolved_teams: dict[str, dict[str, Any]] = {}

    try:
        team_index, without_club = load_team_index(conn)
        players = get_players(conn, args)
        print(f"Transfermarkt API: {base_url()}")
        print(f"Selected players: {len(players)}")

        for player in players:
            stats["processedPlayers"] += 1
            try:
                resources: dict[str, dict[str, Any]] = {}
                for resource in ("profile", "market_value", "transfers"):
                    payload = None if args.force_fetch else get_cached_resource(conn, player, resource)
                    if payload is None:
                        try:
                            payload = fetch_resource(str(player["transfermarkt_id"]), resource)
                        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
                            if args.no_cache_fallback:
                                raise
                            payload = get_cached_resource(conn, player, resource)
                            if payload is None:
                                raise
                    resources[resource] = payload
                    if not args.dry_run:
                        save_cache(conn, player, resource, payload, args.ttl_days)
                    stats[RESOURCE_STAT_KEYS[resource]] += 1

                if not args.dry_run and update_player_from_profile(conn, player, resources["profile"]):
                    stats["playerProfilesUpdated"] += 1

                for raw in extract_transfers(resources["transfers"]):
                    from_club = raw.get("clubFrom") or raw.get("from") or raw.get("oldTeam")
                    to_club = raw.get("clubTo") or raw.get("to") or raw.get("newTeam")
                    from_team = resolve_team(team_index, without_club, from_club if isinstance(from_club, dict) else {"name": from_club})
                    to_team = resolve_team(team_index, without_club, to_club if isinstance(to_club, dict) else {"name": to_club})

                    for club, resolved in ((from_club, from_team), (to_club, to_team)):
                        club_name = (club or {}).get("name") if isinstance(club, dict) else club
                        key = normalize(club_name)
                        if key and key not in WITHOUT_CLUB_NAMES and not resolved:
                            unresolved_teams[key] = {"providerName": club_name, "count": unresolved_teams.get(key, {}).get("count", 0) + 1}

                    status, row = upsert_transfer(conn, player, raw, from_team, to_team)

                    if status == "inserted":
                        stats["transfersInserted"] += 1
                    elif status == "updated":
                        stats["transfersUpdated"] += 1
                    elif status == "unchanged":
                        stats["transfersUnchanged"] += 1
                    elif status == "unresolved":
                        stats["transfersUnresolved"] += 1

                    if status in {"inserted", "updated"}:
                        if from_team:
                            changed_teams[from_team.id] = changed_team_entry(from_team, "transfer_out")
                        if to_team:
                            changed_teams[to_team.id] = changed_team_entry(to_team, "transfer_in")

                if args.dry_run:
                    conn.rollback()
                else:
                    conn.commit()
                print(f"[ok] {player['id']} {player['name']}")
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, psycopg2.Error) as exc:
                conn.rollback()
                stats["errors"].append({"playerId": int(player["id"]), "player": player["name"], "error": str(exc)})
                print(f"[error] {player['id']} {player['name']}: {exc}", file=sys.stderr)

            time.sleep(args.sleep)

        result = {
            "stats": stats,
            "changedTeams": sorted(changed_teams.values(), key=lambda item: item["team"]),
            "unresolvedTeams": sorted(unresolved_teams.values(), key=lambda item: (-item["count"], str(item["providerName"]))),
        }
        text = json.dumps(result, ensure_ascii=False, indent=2)
        print(text)
        if args.output:
            Path(args.output).write_text(text, encoding="utf-8")
        return 0 if not stats["errors"] else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
