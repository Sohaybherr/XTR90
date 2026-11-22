from __future__ import annotations

from datetime import timedelta

from ..client import ApiFootballClient
from ..mappers.team_statistics_mapper import map_team_statistics
from ..storage import upsert_match_team_statistics
from .live_db import find_match_by_api_id, update_match_live_schedule
from .live_status_rules import is_live_status, utcnow


def _next_statistics_sync(match: dict) -> object:
    status = str(match.get("status_short") or match.get("status") or "").upper()
    if is_live_status(status):
        return utcnow() + timedelta(seconds=3)
    return utcnow() + timedelta(minutes=2)


def sync_team_statistics_for_fixture(client: ApiFootballClient, conn, fixture_api_id: int) -> dict[str, int | bool] | None:
    match = find_match_by_api_id(conn, fixture_api_id)
    if not match:
        return None
    if match.get("team_statistics_unavailable"):
        return {"match_id": match["id"], "statistics": 0, "skipped": True}

    payload = client.get("/fixtures/statistics", {"fixture": fixture_api_id, "half": "true"})
    rows = map_team_statistics(payload.get("response") or [])
    if not rows:
        update_match_live_schedule(
            conn,
            match["id"],
            next_sync_at=_next_statistics_sync(match),
            attempts_increment=True,
        )
        return {"match_id": match["id"], "statistics": 0, "skipped": False}

    ids = upsert_match_team_statistics(conn, match["id"], rows)
    update_match_live_schedule(
        conn,
        match["id"],
        next_sync_at=_next_statistics_sync(match),
        attempts_increment=True,
        flags={"has_team_statistics": bool(ids)},
    )
    return {"match_id": match["id"], "statistics": len(ids), "skipped": False}
