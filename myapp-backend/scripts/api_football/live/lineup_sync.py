from __future__ import annotations

from datetime import timedelta

from ..client import ApiFootballClient
from ..mappers.lineup_mapper import map_lineups
from ..storage import upsert_match_lineup, upsert_match_lineup_players
from .live_db import find_match_by_api_id, update_match_live_schedule
from .live_status_rules import utcnow


def sync_lineups_for_fixture(client: ApiFootballClient, conn, fixture_api_id: int) -> dict[str, int | bool] | None:
    match = find_match_by_api_id(conn, fixture_api_id)
    if not match:
        return None
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM match_lineups WHERE match_id = %s", (match["id"],))
        existing_lineups = int(cur.fetchone()[0])
    if existing_lineups >= 2 or match.get("lineups_unavailable"):
        return {"match_id": match["id"], "lineups": 0, "players": 0, "skipped": True}

    payload = client.get("/fixtures/lineups", {"fixture": fixture_api_id})
    rows = map_lineups(payload.get("response") or [])
    if not rows:
        update_match_live_schedule(
            conn,
            match["id"],
            next_sync_at=utcnow() + timedelta(minutes=10),
            attempts_increment=True,
            flags={"lineups_unavailable": True} if match.get("live_sync_attempts", 0) >= 4 else None,
        )
        return {"match_id": match["id"], "lineups": 0, "players": 0, "skipped": False}

    lineup_count = 0
    player_count = 0
    for lineup in rows:
        lineup_id = upsert_match_lineup(conn, match["id"], lineup)
        if not lineup_id:
            continue
        lineup_count += 1
        team_id = None
        with conn.cursor() as cur:
            cur.execute("SELECT team_id FROM match_lineups WHERE id = %s", (lineup_id,))
            row = cur.fetchone()
            team_id = row[0] if row else None
        if team_id:
            player_count += len(upsert_match_lineup_players(conn, lineup_id, match["id"], team_id, lineup.get("players") or []))

    update_match_live_schedule(
        conn,
        match["id"],
        next_sync_at=utcnow() + timedelta(seconds=3),
        attempts_increment=True,
        flags={"has_lineups": lineup_count >= 2},
    )
    return {"match_id": match["id"], "lineups": lineup_count, "players": player_count, "skipped": False}
