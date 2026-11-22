from __future__ import annotations

import argparse
import logging
import os
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

from ..client import ApiFootballClient, ApiFootballRateLimit
from ..storage import db_connection
from .lineup_sync import sync_lineups_for_fixture
from .live_db import update_match_live_schedule
from .live_fixture_sync import sync_fixture_by_api_id, sync_global_live_fixtures
from .live_status_rules import decide_next_action, next_sync_at, utcnow
from .player_statistics_sync import sync_player_statistics_for_fixture
from .post_match_sync import sync_post_match_for_fixture
from .team_statistics_sync import sync_team_statistics_for_fixture


LOG_PATH = Path(__file__).resolve().parents[3] / "logs" / "api_football_live.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)
SCHEDULER_LOCK_KEY = 375001


def acquire_scheduler_lock(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_xact_lock(%s)", (SCHEDULER_LOCK_KEY,))
        return bool(cur.fetchone()[0])


def fetch_due_matches(conn, limit: int) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                m.*,
                (
                    SELECT COUNT(*)::integer
                    FROM match_lineups ml
                    WHERE ml.match_id = m.id
                ) AS lineup_count
            FROM matches m
            WHERE COALESCE(m.fully_synced, FALSE) = FALSE
              AND m.next_sync_at IS NOT NULL
              AND m.next_sync_at <= NOW()
            ORDER BY m.next_sync_at ASC
            LIMIT %s
            FOR UPDATE OF m SKIP LOCKED
            """,
            (limit,),
        )
        columns = [description.name for description in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def fetch_match(conn, match_id: int) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                m.*,
                (
                    SELECT COUNT(*)::integer
                    FROM match_lineups ml
                    WHERE ml.match_id = m.id
                ) AS lineup_count
            FROM matches m
            WHERE m.id = %s
            LIMIT 1
            FOR UPDATE OF m
            """,
            (match_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        columns = [description.name for description in cur.description]
        return dict(zip(columns, row))


def schedule_initial_live_window(conn, *, hours_ahead: int = 24) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE matches
            SET next_sync_at = COALESCE(
                    next_sync_at,
                    CASE
                      WHEN kickoff_at <= NOW() + INTERVAL '3 hours' THEN NOW()
                      ELSE kickoff_at - INTERVAL '3 hours'
                    END
                ),
                fully_synced = COALESCE(fully_synced, FALSE),
                updated_at = CURRENT_TIMESTAMP
            WHERE kickoff_at BETWEEN NOW() - INTERVAL '3 hours' AND NOW() + (%s || ' hours')::interval
              AND COALESCE(fully_synced, FALSE) = FALSE
              AND next_sync_at IS NULL
            """,
            (hours_ahead,),
        )
        return cur.rowcount


def run_match_action(client: ApiFootballClient, conn, match: dict[str, Any]) -> dict[str, Any] | None:
    decision = decide_next_action(match)
    fixture_api_id = match.get("api_id")
    match_id = match["id"]

    logger.info("match=%s api_id=%s action=%s reason=%s", match_id, fixture_api_id, decision.action, decision.reason)

    if decision.action in {"stop", "stop_cancelled"}:
        update_match_live_schedule(conn, match_id, next_sync_at=None, fully_synced=decision.action == "stop")
        return {"match_id": match_id, "action": decision.action}

    if decision.action == "daily_only":
        update_match_live_schedule(conn, match_id, next_sync_at=None)
        return {"match_id": match_id, "action": decision.action}

    if not fixture_api_id:
        update_match_live_schedule(conn, match_id, next_sync_at=utcnow() + timedelta(hours=6), attempts_increment=True)
        return {"match_id": match_id, "action": "missing_api_id"}

    if decision.action in {"fixture_check", "live_global"}:
        if decision.action == "live_global":
            global_result = sync_global_live_fixtures(client, conn)
            return {"match_id": match_id, "action": decision.action, "global_matches": len(global_result)}
        return sync_fixture_by_api_id(client, conn, int(fixture_api_id))

    if decision.action == "lineups":
        return sync_lineups_for_fixture(client, conn, int(fixture_api_id))

    if decision.action == "team_statistics":
        return sync_team_statistics_for_fixture(client, conn, int(fixture_api_id))

    if decision.action == "player_statistics":
        return sync_player_statistics_for_fixture(client, conn, int(fixture_api_id))

    if decision.action.startswith("post_match") or decision.action == "mark_fully_synced":
        if decision.action == "mark_fully_synced":
            update_match_live_schedule(conn, match_id, next_sync_at=None, fully_synced=True, final_sync_stage="verified")
            return {"match_id": match_id, "action": decision.action}
        return sync_post_match_for_fixture(client, conn, int(fixture_api_id))

    update_match_live_schedule(conn, match_id, next_sync_at=next_sync_at(decision), attempts_increment=True)
    return {"match_id": match_id, "action": decision.action}


def run_once(limit: int = 50, schedule_window: bool = True, match_id: int | None = None) -> list[dict[str, Any]]:
    client = ApiFootballClient()
    results: list[dict[str, Any]] = []

    with db_connection() as conn:
        if not acquire_scheduler_lock(conn):
            logger.info("live_scheduler_skipped=lock_busy")
            return [{"action": "scheduler_locked"}]

        if schedule_window:
            scheduled = schedule_initial_live_window(conn)
            logger.info("scheduled_initial_live_window=%s", scheduled)

        matches = [fetch_match(conn, match_id)] if match_id else fetch_due_matches(conn, limit)
        live_global_matches: list[dict[str, Any]] = []

        for match in [item for item in matches if item]:
            try:
                decision = decide_next_action(match)
                if decision.action == "live_global" and match_id is None:
                    logger.info(
                        "match=%s api_id=%s action=%s reason=%s queued_global=true",
                        match["id"],
                        match.get("api_id"),
                        decision.action,
                        decision.reason,
                    )
                    live_global_matches.append(match)
                    continue

                result = run_match_action(client, conn, match)
                if result:
                    results.append(result)
            except Exception as error:
                logger.exception("live_scheduler_match_failed match=%s error=%s", match.get("id"), error)
                update_match_live_schedule(
                    conn,
                    match["id"],
                    next_sync_at=utcnow() + timedelta(minutes=10),
                    attempts_increment=True,
                )
                results.append({"match_id": match["id"], "action": "error_retry_later", "error": str(error)})

        if live_global_matches:
            try:
                global_result = sync_global_live_fixtures(client, conn)
                synced_fixture_ids = {
                    int(item["fixture_api_id"])
                    for item in global_result
                    if item.get("fixture_api_id") is not None
                }
                direct_results: list[dict[str, Any]] = []
                direct_attempts = 0
                for match in live_global_matches:
                    fixture_api_id = match.get("api_id")
                    if fixture_api_id is None or int(fixture_api_id) in synced_fixture_ids:
                        continue
                    direct_attempts += 1
                    direct_result = sync_fixture_by_api_id(client, conn, int(fixture_api_id))
                    if direct_result:
                        direct_results.append(direct_result)
                results.append(
                    {
                        "action": "live_global",
                        "queued_matches": len(live_global_matches),
                        "global_matches": len(global_result),
                        "direct_attempts": direct_attempts,
                        "direct_updates": len(direct_results),
                    }
                )
                results.extend(direct_results)
            except Exception as error:
                logger.exception("live_scheduler_global_failed error=%s", error)
                retry_delay = timedelta(hours=12) if isinstance(error, ApiFootballRateLimit) else timedelta(minutes=1)
                for match in live_global_matches:
                    update_match_live_schedule(
                        conn,
                        match["id"],
                        next_sync_at=utcnow() + retry_delay,
                        attempts_increment=True,
                    )
                results.append({"action": "live_global_error_retry_later", "error": str(error)})

    logger.info("live_scheduler_results=%s", results)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one API-Football live sync scheduler pass.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--match-id", type=int, help="Force one local match id through the scheduler, ignoring next_sync_at.")
    parser.add_argument("--no-schedule-window", action="store_true")
    parser.add_argument("--ignore-budget", action="store_true", help="Bypass the local request budget file for this run.")
    parser.add_argument("--watch", action="store_true", help="Keep running scheduler passes until stopped.")
    parser.add_argument("--interval", type=int, default=60, help="Seconds between scheduler passes in watch mode.")
    args = parser.parse_args()
    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    while True:
        results = run_once(limit=args.limit, schedule_window=not args.no_schedule_window, match_id=args.match_id)
        print({"processed": len(results), "results": results}, flush=True)
        if not args.watch:
            break
        time.sleep(max(args.interval, 1))


if __name__ == "__main__":
    main()
