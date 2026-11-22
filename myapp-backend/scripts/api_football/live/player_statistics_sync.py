from __future__ import annotations

from datetime import timedelta

from ..client import ApiFootballClient
from ..mappers.player_match_statistics_mapper import map_player_match_statistics
from ..storage import upsert_match_player_statistics
from .live_db import find_match_by_api_id, update_match_live_schedule
from .live_status_rules import utcnow


def sync_player_statistics_for_fixture(client: ApiFootballClient, conn, fixture_api_id: int) -> dict[str, int | bool] | None:
    match = find_match_by_api_id(conn, fixture_api_id)
    if not match:
        return None
    if match.get("player_statistics_unavailable"):
        return {"match_id": match["id"], "statistics": 0, "skipped": True}

    payload = client.get("/fixtures/players", {"fixture": fixture_api_id})
    rows = map_player_match_statistics(payload.get("response") or [])
    if not rows:
        update_match_live_schedule(
            conn,
            match["id"],
            next_sync_at=utcnow() + timedelta(minutes=5),
            attempts_increment=True,
        )
        return {"match_id": match["id"], "statistics": 0, "skipped": False}

    ids = upsert_match_player_statistics(conn, match["id"], rows)
    update_match_live_schedule(
        conn,
        match["id"],
        next_sync_at=utcnow() + timedelta(minutes=5),
        attempts_increment=True,
        flags={"has_player_statistics": bool(ids)},
    )
    return {"match_id": match["id"], "statistics": len(ids), "skipped": False}
