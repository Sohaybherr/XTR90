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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"
DEFAULT_BASE_URL = "https://transfermarkt-api.fly.dev"
DEFAULT_RESOURCES = ("market_value", "transfers")
RESOURCE_PATHS = {
    "profile": "/players/{id}/profile",
    "market_value": "/players/{id}/market_value",
    "transfers": "/players/{id}/transfers",
    "injuries": "/players/{id}/injuries",
    "achievements": "/players/{id}/achievements",
    "stats": "/players/{id}/stats",
    "jersey_numbers": "/players/{id}/jersey_numbers",
}


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
    return " ".join("".join(char if char.isalnum() else " " for char in text).split())


def score_match(player: dict[str, Any], result: dict[str, Any]) -> int:
    player_names = [normalize(candidate) for candidate in build_search_queries(player)]
    result_name = normalize(result.get("name"))
    score = 0

    if result_name in player_names:
        score += 100
    if any(candidate and (candidate in result_name or result_name in candidate) for candidate in player_names):
        score += 30

    nationality = normalize(player.get("nationality"))
    nationalities = [normalize(item) for item in result.get("nationalities") or []]
    if nationality and nationality in nationalities:
        score += 10

    position = normalize(player.get("position") or player.get("squad_position"))
    if position and position in normalize(result.get("position")):
        score += 5

    return score


def first_name_token(value: Any) -> str:
    return str(value or "").split()[0] if str(value or "").split() else ""


def short_lastname(value: Any) -> str:
    parts = str(value or "").split()
    if not parts:
        return ""

    particles = {"da", "de", "del", "di", "dos", "van", "von"}
    if len(parts) >= 2 and parts[0].lower() in particles:
        return " ".join(parts[:2])
    return parts[0]


def last_name_token(value: Any) -> str:
    parts = str(value or "").split()
    return parts[-1] if parts else ""


def build_search_queries(player: dict[str, Any]) -> list[str]:
    raw_candidates = [
        player.get("name"),
        f"{player.get('firstname') or ''} {player.get('lastname') or ''}".strip(),
        f"{first_name_token(player.get('firstname'))} {short_lastname(player.get('lastname'))}".strip(),
        f"{first_name_token(player.get('firstname'))} {last_name_token(player.get('lastname'))}".strip(),
    ]
    seen = set()
    candidates = []
    for candidate in raw_candidates:
        normalized = normalize(candidate)
        if normalized and normalized not in seen:
            candidates.append(str(candidate).strip())
            seen.add(normalized)
    return candidates


def request_json(path: str, params: dict[str, Any] | None = None, timeout: int = 25) -> dict[str, Any]:
    url = f"{base_url()}{path}"
    if params:
        query = urllib.parse.urlencode({key: value for key, value in params.items() if value is not None})
        if query:
            url = f"{url}?{query}"

    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "375scores-sync/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


def check_api_available(timeout: int = 5) -> None:
    request_json("/openapi.json", timeout=timeout)


def search_player(player: dict[str, Any]) -> dict[str, Any] | None:
    best_match = None
    best_score = -1

    for query in build_search_queries(player):
        encoded_name = urllib.parse.quote(query)
        payload = request_json(f"/players/search/{encoded_name}", {"page_number": 1})
        results = payload.get("results") or []
        if not results:
            continue

        candidate = max(results, key=lambda result: score_match(player, result))
        candidate_score = score_match(player, candidate)
        if candidate_score > best_score:
            best_match = candidate
            best_score = candidate_score

        if candidate_score >= 100:
            break

    return best_match if best_score >= 30 else None


def select_player_columns() -> str:
    return """
        SELECT
            p.id,
            p.name,
            p.firstname,
            p.lastname,
            p.nationality,
            p.position,
            p.transfermarkt_id,
            p.transfermarkt_url,
            p.transfermarkt_match_status,
            tsp.position AS squad_position
        FROM players p
        LEFT JOIN LATERAL (
            SELECT position
            FROM team_squad_players
            WHERE player_id = p.id AND is_current = TRUE
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
        ) tsp ON TRUE
    """


def resource_missing_clause(resources: list[str]) -> str:
    placeholders = ", ".join(["%s"] * len(resources))
    return f"""
        (
            p.transfermarkt_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM unnest(ARRAY[{placeholders}]::text[]) AS requested(resource)
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM transfermarkt_cache c
                    WHERE c.entity_type = 'player'
                      AND c.transfermarkt_id = p.transfermarkt_id
                      AND c.resource = requested.resource
                      AND c.expires_at > CURRENT_TIMESTAMP
                )
            )
        )
    """


def get_players(
    conn,
    limit: int,
    player_id: int | None,
    name: str | None,
    force: bool,
    resources: list[str],
    retry_not_found: bool,
) -> list[dict[str, Any]]:
    clauses = ["p.name IS NOT NULL", "p.name <> ''"]
    params: list[Any] = []

    if player_id is not None:
        params.append(player_id)
        clauses.append("p.id = %s")
    elif name:
        params.append(f"%{name}%")
        clauses.append("p.name ILIKE %s")
    elif not force:
        if not retry_not_found:
            clauses.append("COALESCE(p.transfermarkt_match_status, '') <> 'not_found'")
        params.extend(resources)
        clauses.append(resource_missing_clause(resources))

    limit_sql = ""
    if limit > 0:
        params.append(limit)
        limit_sql = "LIMIT %s"
    query = f"""
        {select_player_columns()}
        WHERE {" AND ".join(clauses)}
        ORDER BY p.transfermarkt_id NULLS FIRST, p.name, p.id
        {limit_sql}
    """
    with conn.cursor() as cur:
        cur.execute(query, params)
        columns = [column.name for column in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def save_player_match(conn, player_id: int, match: dict[str, Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players
            SET transfermarkt_id = %s,
                transfermarkt_url = COALESCE(%s, transfermarkt_url),
                transfermarkt_synced_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (str(match["id"]), match.get("url"), player_id),
        )


def save_match_status(conn, player_id: int, status: str, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players
            SET transfermarkt_match_status = %s,
                transfermarkt_match_attempted_at = CURRENT_TIMESTAMP,
                transfermarkt_match_error = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (status, error, player_id),
        )


def get_cached_resources(conn, transfermarkt_id: str, resources: list[str]) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT resource
            FROM transfermarkt_cache
            WHERE entity_type = 'player'
              AND transfermarkt_id = %s
              AND resource = ANY(%s)
              AND expires_at > CURRENT_TIMESTAMP
            """,
            (str(transfermarkt_id), resources),
        )
        return {row[0] for row in cur.fetchall()}


def save_cache(
    conn,
    *,
    entity_id: int,
    transfermarkt_id: str,
    resource: str,
    payload: dict[str, Any],
    ttl_days: int,
) -> None:
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
            (entity_id, str(transfermarkt_id), resource, json.dumps(payload), expires_at),
        )


def fetch_resource(transfermarkt_id: str, resource: str) -> dict[str, Any]:
    if resource == "injuries":
        return fetch_paginated_resource(transfermarkt_id, resource, "injuries")

    path_template = RESOURCE_PATHS[resource]
    return request_json(path_template.format(id=urllib.parse.quote(str(transfermarkt_id))))


def fetch_paginated_resource(transfermarkt_id: str, resource: str, list_key: str) -> dict[str, Any]:
    path_template = RESOURCE_PATHS[resource]
    encoded_id = urllib.parse.quote(str(transfermarkt_id))
    page_number = 1
    merged_payload: dict[str, Any] | None = None
    merged_items: list[Any] = []

    while True:
        payload = request_json(path_template.format(id=encoded_id), {"page_number": page_number})
        if merged_payload is None:
            merged_payload = dict(payload)
        merged_items.extend(payload.get(list_key) or [])

        last_page = int(payload.get("lastPageNumber") or page_number)
        if page_number >= last_page:
            break
        page_number += 1

    if merged_payload is None:
        return {}

    merged_payload[list_key] = merged_items
    merged_payload["pageNumber"] = 1
    merged_payload["lastPageNumber"] = 1
    return merged_payload


def parse_resources(value: str) -> list[str]:
    if value == "all":
        return list(RESOURCE_PATHS)

    resources = [item.strip() for item in value.split(",") if item.strip()]
    unknown = sorted(set(resources) - set(RESOURCE_PATHS))
    if unknown:
        raise argparse.ArgumentTypeError(f"Unknown resource(s): {', '.join(unknown)}")
    return resources


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sync Transfermarkt player enrichment into local cache.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum players to process. Use 0 for no limit.")
    parser.add_argument("--player-id", type=int, help="Sync one local player id.")
    parser.add_argument("--name", help="Sync players whose local name matches this text.")
    parser.add_argument("--force", action="store_true", help="Resync even players that already have transfermarkt_id.")
    parser.add_argument("--resources", type=parse_resources, default=list(DEFAULT_RESOURCES), help="Comma list or 'all'.")
    parser.add_argument("--retry-not-found", action="store_true", help="Retry players previously marked with no match.")
    parser.add_argument("--ttl-days", type=int, default=int(os.getenv("TRANSFERMARKT_CACHE_TTL_DAYS") or "7"))
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between players to avoid hammering the scraper.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    load_env()

    try:
        check_api_available()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Transfermarkt API is not reachable at {base_url()}: {exc}", file=sys.stderr)
        print("Start the local API first or run `npm run transfermarkt:resume`.", file=sys.stderr)
        return 2

    conn = connect()
    processed = 0
    matched = 0
    cached = 0

    try:
        players = get_players(conn, args.limit, args.player_id, args.name, args.force, args.resources, args.retry_not_found)
        if not players:
            print("No players selected for Transfermarkt sync.")
            return 0

        print(f"Transfermarkt API: {base_url()}")
        print(f"Selected players: {len(players)}")
        print(f"Resources: {', '.join(args.resources)}")

        for player in players:
            processed += 1
            try:
                match = None
                if player.get("transfermarkt_id") and not args.force:
                    match = {"id": player["transfermarkt_id"], "url": player.get("transfermarkt_url")}
                else:
                    match = search_player(player)
                    if not match or not match.get("id"):
                        save_match_status(conn, player["id"], "not_found", "No Transfermarkt match found")
                        print(f"[skip] {player['id']} {player['name']}: no Transfermarkt match")
                        conn.commit()
                        time.sleep(args.sleep)
                        continue
                    save_player_match(conn, player["id"], match)

                matched += 1
                save_match_status(conn, player["id"], "matched")
                print(f"[match] {player['id']} {player['name']} -> {match['id']} {match.get('name') or ''}".strip())

                cached_resources = set() if args.force else get_cached_resources(conn, str(match["id"]), args.resources)
                resources_to_fetch = [resource for resource in args.resources if resource not in cached_resources]

                if not resources_to_fetch:
                    print("  [cache] all requested resources already fresh")

                for resource in resources_to_fetch:
                    payload = fetch_resource(str(match["id"]), resource)
                    save_cache(
                        conn,
                        entity_id=player["id"],
                        transfermarkt_id=str(match["id"]),
                        resource=resource,
                        payload=payload,
                        ttl_days=args.ttl_days,
                    )
                    cached += 1
                    print(f"  [cache] {resource}")

                conn.commit()
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
                conn.rollback()
                try:
                    save_match_status(conn, player["id"], "error", str(exc))
                    conn.commit()
                except Exception:
                    conn.rollback()
                print(f"[error] {player['id']} {player['name']}: {exc}", file=sys.stderr)
            except Exception:
                conn.rollback()
                raise

            time.sleep(args.sleep)

        print(f"Done. processed={processed} matched={matched} cached={cached}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
