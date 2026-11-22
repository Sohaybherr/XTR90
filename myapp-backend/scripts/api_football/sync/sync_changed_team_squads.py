from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection
from api_football.sync.sync_squads import sync_squad


DEFAULT_REPORT = Path("data/transfermarkt-transfer-sync-report.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync API-Football squads for teams changed by transfer sync.")
    parser.add_argument(
        "--report",
        default=str(DEFAULT_REPORT),
        help="Transfer sync JSON report containing changedTeams. Default: data/transfermarkt-transfer-sync-report.json",
    )
    parser.add_argument("--team-id", action="append", type=int, help="Local team id to sync. Repeatable.")
    parser.add_argument("--team-api-id", action="append", type=int, help="API-Football team id to sync. Repeatable.")
    parser.add_argument("--limit", type=int, default=0, help="Limit teams. 0 means no limit.")
    parser.add_argument("--sleep", type=float, default=0.4, help="Delay between teams.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download player images.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and compare, then rollback DB changes.")
    parser.add_argument("--ignore-budget", action="store_true", help="Disable local API-Football request-budget enforcement.")
    return parser.parse_args()


def changed_team_ids_from_report(path: Path) -> list[int]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    teams = data.get("changedTeams") if isinstance(data, dict) else []
    ids = []
    for team in teams or []:
        try:
            ids.append(int(team.get("teamId")))
        except (TypeError, ValueError, AttributeError):
            continue
    return ids


def unique(values: list[int]) -> list[int]:
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def load_targets(conn, *, team_ids: list[int], team_api_ids: list[int], limit: int) -> list[dict[str, Any]]:
    where = []
    params: list[Any] = []

    if team_ids:
        params.append(team_ids)
        where.append("id = ANY(%s)")
    if team_api_ids:
        params.append(team_api_ids)
        where.append("api_id = ANY(%s)")

    if not where:
        return []

    limit_sql = ""
    if limit > 0:
        params.append(limit)
        limit_sql = "LIMIT %s"

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, api_id, name
            FROM teams
            WHERE api_id IS NOT NULL
              AND ({" OR ".join(where)})
            ORDER BY name, id
            {limit_sql}
            """,
            params,
        )
        return [{"team_id": int(row[0]), "team_api_id": int(row[1]), "name": row[2]} for row in cur.fetchall()]


def current_squad_player_ids(conn, team_id: int) -> set[int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT player_id
            FROM team_squad_players
            WHERE team_id = %s
              AND COALESCE(is_current, TRUE) = TRUE
            """,
            (team_id,),
        )
        return {int(row[0]) for row in cur.fetchall()}


def mark_removed_players(conn, team_id: int, synced_player_ids: set[int]) -> int:
    if not synced_player_ids:
        return 0
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE team_squad_players
            SET is_current = FALSE,
                left_at = COALESCE(left_at, CURRENT_DATE),
                updated_at = CURRENT_TIMESTAMP
            WHERE team_id = %s
              AND COALESCE(is_current, TRUE) = TRUE
              AND NOT (player_id = ANY(%s))
            """,
            (team_id, list(synced_player_ids)),
        )
        return cur.rowcount


def sync_target(conn, client: ApiFootballClient, target: dict[str, Any], *, skip_images: bool) -> dict[str, Any]:
    before = current_squad_player_ids(conn, target["team_id"])
    synced = sync_squad(
        client,
        conn,
        target["team_api_id"],
        target["team_id"],
        skip_images=skip_images,
    )
    synced_ids = {int(row["player_id"]) for row in synced if row.get("player_id")}
    removed = mark_removed_players(conn, target["team_id"], synced_ids)
    added = len(synced_ids - before)
    kept = len(synced_ids & before)

    return {
        "teamId": target["team_id"],
        "teamApiId": target["team_api_id"],
        "team": target["name"],
        "squadPlayers": len(synced_ids),
        "added": added,
        "kept": kept,
        "removed": removed,
    }


def main() -> int:
    args = parse_args()
    if args.ignore_budget:
        import os

        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    report_team_ids = changed_team_ids_from_report(Path(args.report)) if not args.team_id and not args.team_api_id else []
    team_ids = unique([*(args.team_id or []), *report_team_ids])
    team_api_ids = unique(args.team_api_id or [])

    stats = {
        "requestedTeams": len(team_ids) + len(team_api_ids),
        "syncedTeams": 0,
        "squadPlayers": 0,
        "added": 0,
        "kept": 0,
        "removed": 0,
        "errors": [],
    }
    results = []

    with db_connection() as conn:
        targets = load_targets(conn, team_ids=team_ids, team_api_ids=team_api_ids, limit=args.limit)
        client = ApiFootballClient()

        print(f"Selected teams: {len(targets)}")
        if not targets:
            print("No teams selected. Pass --team-id/--team-api-id or provide a report with changedTeams.")
            return 0

        for target in targets:
            try:
                result = sync_target(conn, client, target, skip_images=args.skip_images)
                results.append(result)
                stats["syncedTeams"] += 1
                stats["squadPlayers"] += result["squadPlayers"]
                stats["added"] += result["added"]
                stats["kept"] += result["kept"]
                stats["removed"] += result["removed"]
                if args.dry_run:
                    conn.rollback()
                else:
                    conn.commit()
                print(
                    f"[ok] {result['team']} squad={result['squadPlayers']} "
                    f"added={result['added']} removed={result['removed']}"
                )
            except (ApiFootballRateLimit, RequestBudgetExceeded):
                raise
            except Exception as exc:
                conn.rollback()
                stats["errors"].append({"teamId": target["team_id"], "team": target["name"], "error": str(exc)})
                print(f"[error] {target['name']}: {exc}", file=sys.stderr)

            if args.sleep:
                time.sleep(args.sleep)

    output = {"stats": stats, "teams": results}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if not stats["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
