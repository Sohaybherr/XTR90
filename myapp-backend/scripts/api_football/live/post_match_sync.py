from __future__ import annotations

from datetime import timedelta

from ..client import ApiFootballClient
from .competition_sync import sync_competition_after_match
from .lineup_sync import sync_lineups_for_fixture
from .live_db import find_match_by_api_id, update_match_live_schedule
from .live_fixture_sync import sync_fixture_by_api_id
from .live_status_rules import utcnow
from .player_statistics_sync import sync_player_statistics_for_fixture
from .team_statistics_sync import sync_team_statistics_for_fixture


NEXT_STAGE = {
    None: "after_5m",
    "": "after_5m",
    "detected": "after_5m",
    "after_5m": "after_15m",
    "after_15m": "verified",
    "verified": "complete",
}

NEXT_DELAY = {
    "after_5m": timedelta(minutes=5),
    "after_15m": timedelta(minutes=10),
    "verified": timedelta(minutes=45),
    "complete": None,
}


def sync_post_match_for_fixture(client: ApiFootballClient, conn, fixture_api_id: int) -> dict[str, object] | None:
    match = find_match_by_api_id(conn, fixture_api_id)
    if not match:
        return None

    fixture_result = sync_fixture_by_api_id(client, conn, fixture_api_id)
    lineups = sync_lineups_for_fixture(client, conn, fixture_api_id)
    team_stats = sync_team_statistics_for_fixture(client, conn, fixture_api_id)
    player_stats = sync_player_statistics_for_fixture(client, conn, fixture_api_id)
    competition = sync_competition_after_match(client, conn, match["id"])

    current_stage = match.get("final_sync_stage")
    next_stage = NEXT_STAGE.get(current_stage, "after_5m")
    delay = NEXT_DELAY[next_stage]

    update_match_live_schedule(
        conn,
        match["id"],
        fully_synced=next_stage == "complete",
        final_sync_stage="verified" if next_stage == "complete" else next_stage,
        next_sync_at=None if delay is None else utcnow() + delay,
        attempts_increment=True,
    )

    return {
        "match_id": match["id"],
        "fixture": fixture_result,
        "lineups": lineups,
        "team_statistics": team_stats,
        "player_statistics": player_stats,
        "competition": competition,
        "stage": next_stage,
    }
