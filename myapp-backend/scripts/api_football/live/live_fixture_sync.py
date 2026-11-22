from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import timedelta
from decimal import Decimal
from typing import Any

from ..client import ApiFootballClient
from ..mappers.event_mapper import map_events
from ..mappers.fixture_mapper import map_fixture
from ..mappers.player_match_statistics_mapper import map_player_match_statistics
from ..mappers.team_statistics_mapper import map_team_statistics
from ..mappers.venue_mapper import map_venue
from ..storage import upsert_match, upsert_match_events, upsert_match_player_statistics, upsert_match_team_statistics, upsert_venue
from .competition_sync import sync_competition_after_match
from .live_db import find_match_by_api_id, resolve_fixture_context, update_match_live_schedule
from .live_status_rules import decide_next_action, is_final_status, is_live_status, next_sync_at, utcnow


PLAYER_STATS_SYNC_INTERVAL_SECONDS = 3
TEAM_STATS_SYNC_INTERVAL_SECONDS = 3
_PLAYER_STATS_LAST_SYNC: dict[int, float] = {}
_TEAM_STATS_LAST_SYNC: dict[int, float] = {}


def _should_sync_player_statistics(fixture_api_id: int, values: dict[str, Any], existing: dict[str, Any] | None) -> bool:
    status = str(values.get("status_short") or values.get("status") or "").upper()

    if not is_live_status(status):
        return False

    if existing and existing.get("player_statistics_unavailable"):
        return False

    last_synced_at = _PLAYER_STATS_LAST_SYNC.get(fixture_api_id)

    if last_synced_at is None:
        return True

    return time.monotonic() - last_synced_at >= PLAYER_STATS_SYNC_INTERVAL_SECONDS


def _existing_event_keys(conn, match_id: int) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT event_key FROM match_events WHERE match_id = %s", (match_id,))
        return {row[0] for row in cur.fetchall() if row[0]}


def _event_payloads_by_ids(conn, event_ids: list[int]) -> list[dict[str, Any]]:
    if not event_ids:
        return []

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              e.id,
              e.event_key,
              e.event_order,
              e.team_id,
              t.name AS team_name,
              e.player_id,
              p.name AS player_name,
              e.assist_player_id,
              ap.name AS assist_player_name,
              e.elapsed,
              e.extra,
              e.event_type,
              e.event_detail,
              e.comments
            FROM match_events e
            LEFT JOIN teams t ON t.id = e.team_id
            LEFT JOIN players p ON p.id = e.player_id
            LEFT JOIN players ap ON ap.id = e.assist_player_id
            WHERE e.id = ANY(%s)
            ORDER BY e.elapsed NULLS LAST, e.extra NULLS LAST, e.event_order NULLS LAST, e.id
            """,
            (event_ids,),
        )
        columns = [description.name for description in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]

    return [
        {
            "id": row["id"],
            "eventKey": row.get("event_key"),
            "order": row.get("event_order"),
            "team": {"id": row["team_id"], "name": row["team_name"]} if row.get("team_id") else None,
            "player": {"id": row["player_id"], "name": row["player_name"]} if row.get("player_id") else None,
            "assistPlayer": (
                {"id": row["assist_player_id"], "name": row["assist_player_name"]}
                if row.get("assist_player_id")
                else None
            ),
            "elapsed": row.get("elapsed"),
            "extra": row.get("extra"),
            "type": row.get("event_type"),
            "detail": row.get("event_detail"),
            "comments": row.get("comments"),
        }
        for row in rows
    ]


def _event_payloads_for_match(conn, match_id: int) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked_events AS (
              SELECT
                e.id,
                e.event_key,
                e.event_order,
                e.team_id,
                t.name AS team_name,
                e.player_id,
                p.name AS player_name,
                e.assist_player_id,
                ap.name AS assist_player_name,
                e.elapsed,
                e.extra,
                e.event_type,
                e.event_detail,
                e.comments,
                ROW_NUMBER() OVER (
                  PARTITION BY
                    e.match_id,
                    e.elapsed,
                    e.extra,
                    e.team_id,
                    e.event_type,
                    e.event_detail,
                    COALESCE(e.player_id, -1),
                    COALESCE(e.assist_player_id, -1),
                    COALESCE(e.comments, '')
                  ORDER BY
                    (
                      CASE WHEN e.player_id IS NOT NULL THEN 1 ELSE 0 END +
                      CASE WHEN e.assist_player_id IS NOT NULL THEN 1 ELSE 0 END +
                      CASE WHEN e.comments IS NOT NULL THEN 1 ELSE 0 END
                    ) DESC,
                    e.event_order NULLS LAST,
                    e.id DESC
                ) AS row_rank
              FROM match_events e
              LEFT JOIN teams t ON t.id = e.team_id
              LEFT JOIN players p ON p.id = e.player_id
              LEFT JOIN players ap ON ap.id = e.assist_player_id
              WHERE e.match_id = %s
            )
            SELECT *
            FROM ranked_events
            WHERE row_rank = 1
            ORDER BY elapsed NULLS LAST, extra NULLS LAST, event_order NULLS LAST, id
            """,
            (match_id,),
        )
        columns = [description.name for description in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]

    return [
        {
            "id": row["id"],
            "eventKey": row.get("event_key"),
            "order": row.get("event_order"),
            "team": {"id": row["team_id"], "name": row["team_name"]} if row.get("team_id") else None,
            "player": {"id": row["player_id"], "name": row["player_name"]} if row.get("player_id") else None,
            "assistPlayer": (
                {"id": row["assist_player_id"], "name": row["assist_player_name"]}
                if row.get("assist_player_id")
                else None
            ),
            "elapsed": row.get("elapsed"),
            "extra": row.get("extra"),
            "type": row.get("event_type"),
            "detail": row.get("event_detail"),
            "comments": row.get("comments"),
        }
        for row in rows
    ]


def _publish_match_update(event_name: str, match_id: int, payload: dict[str, Any]) -> None:
    base_url = os.getenv("LIVE_EVENT_URL") or os.getenv("BACKEND_URL") or "http://localhost:3000"
    token = os.getenv("LIVE_EVENT_TOKEN")
    url = f"{base_url.rstrip('/')}/api/v1/matches/internal/live-events"
    body = json.dumps({"event": event_name, "matchId": match_id, "payload": payload}, default=_json_default).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})

    if token:
        request.add_header("x-live-event-token", token)

    try:
        urllib.request.urlopen(request, timeout=2).read()
    except (OSError, urllib.error.URLError):
        return


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _publish_live_event(match_id: int, event: dict[str, Any]) -> None:
    _publish_match_update("match:event", match_id, {"event": event})


def _publish_live_score(match_id: int, values: dict[str, Any]) -> None:
    _publish_match_update(
        "match:score",
        match_id,
        {
            "matchId": match_id,
            "status": values.get("status_short") or values.get("status"),
            "elapsed": values.get("elapsed"),
            "extra": values.get("elapsed_extra"),
            "score": {
                "home": values.get("home_score"),
                "away": values.get("away_score"),
            },
            "updatedAt": utcnow().isoformat(),
        },
    )


def _sync_live_player_statistics(client: ApiFootballClient, conn, fixture_api_id: int, match_id: int) -> int:
    _PLAYER_STATS_LAST_SYNC[fixture_api_id] = time.monotonic()
    try:
        payload = client.get("/fixtures/players", {"fixture": fixture_api_id})
    except Exception:
        return 0

    rows = map_player_match_statistics(payload.get("response") or [])

    if not rows:
        return 0

    return len(upsert_match_player_statistics(conn, match_id, rows))


def _team_statistics_payloads(conn, match_id: int) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.*, t.name AS team_name
            FROM match_team_statistics s
            JOIN teams t ON t.id = s.team_id
            WHERE s.match_id = %s
            ORDER BY s.team_id
            """,
            (match_id,),
        )
        columns = [description.name for description in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]

    return [
        {
            "team": {"id": row["team_id"], "name": row["team_name"]},
            "statistics": {
                "shotsOnGoal": row.get("shots_on_goal"),
                "shotsOffGoal": row.get("shots_off_goal"),
                "totalShots": row.get("total_shots"),
                "blockedShots": row.get("blocked_shots"),
                "shotsInsideBox": row.get("shots_inside_box"),
                "shotsOutsideBox": row.get("shots_outside_box"),
                "fouls": row.get("fouls"),
                "cornerKicks": row.get("corner_kicks"),
                "offsides": row.get("offsides"),
                "ballPossession": row.get("ball_possession"),
                "yellowCards": row.get("yellow_cards"),
                "redCards": row.get("red_cards"),
                "goalkeeperSaves": row.get("goalkeeper_saves"),
                "totalPasses": row.get("total_passes"),
                "passesAccurate": row.get("passes_accurate"),
                "passesPercentage": row.get("passes_percentage"),
                "expectedGoals": row.get("expected_goals"),
                "extra": row.get("extra_statistics") or {},
            },
        }
        for row in rows
    ]


def _sync_live_team_statistics(client: ApiFootballClient, conn, fixture_api_id: int, match_id: int, existing: dict[str, Any] | None) -> int:
    if existing and existing.get("team_statistics_unavailable"):
        return 0

    last_synced_at = _TEAM_STATS_LAST_SYNC.get(fixture_api_id)
    if last_synced_at is not None and time.monotonic() - last_synced_at < TEAM_STATS_SYNC_INTERVAL_SECONDS:
        return 0

    _TEAM_STATS_LAST_SYNC[fixture_api_id] = time.monotonic()
    try:
        payload = client.get("/fixtures/statistics", {"fixture": fixture_api_id, "half": "true"})
    except Exception:
        return 0

    rows = map_team_statistics(payload.get("response") or [])
    if not rows:
        return 0

    return len(upsert_match_team_statistics(conn, match_id, rows))


def _sync_fixture_payload(client: ApiFootballClient, conn, payload: dict[str, Any]) -> dict[str, Any] | None:
    context = resolve_fixture_context(conn, payload)
    if context is None:
        return None

    existing = find_match_by_api_id(conn, context["fixture_api_id"])
    competition_id = existing["competition_id"] if existing else context["competition_id"]
    season_id = existing["season_id"] if existing else context["season_id"]
    home_team_id = existing["home_team_id"] if existing else context["home_team_id"]
    away_team_id = existing["away_team_id"] if existing else context["away_team_id"]

    values = map_fixture(payload, competition_id, season_id, home_team_id, away_team_id)
    values["competition_season_id"] = existing["competition_season_id"] if existing else context["competition_season_id"]
    values["venue_id"] = upsert_venue(conn, map_venue((payload.get("fixture") or {}).get("venue") or {}))

    match_id = upsert_match(conn, values)
    if not match_id:
        return None

    existing_event_keys = _existing_event_keys(conn, match_id)
    event_rows = map_events(payload)
    new_event_keys = {row["event_key"] for row in event_rows if row.get("event_key") not in existing_event_keys}
    new_event_ids: list[int] = []
    player_statistics_count = 0
    team_statistics_count = 0

    if event_rows:
        event_ids = upsert_match_events(conn, match_id, event_rows)
        if new_event_keys:
            new_event_ids = [
                event_id
                for event_id, event_row in zip(event_ids, event_rows)
                if event_row.get("event_key") in new_event_keys
            ]

    if _should_sync_player_statistics(int(context["fixture_api_id"]), values, existing):
        player_statistics_count = _sync_live_player_statistics(client, conn, int(context["fixture_api_id"]), match_id)

    team_statistics_count = _sync_live_team_statistics(client, conn, int(context["fixture_api_id"]), match_id, existing)

    decision = decide_next_action({**(existing or {}), **values})
    competition_result = None
    update_match_live_schedule(
        conn,
        match_id,
        next_sync_at=next_sync_at(decision),
        last_live_sync_at=utcnow(),
        attempts_increment=True,
        flags={
            **({"has_player_statistics": True} if player_statistics_count else {}),
            **({"has_team_statistics": True} if team_statistics_count else {}),
        } or None,
    )

    _publish_live_score(match_id, values)

    if is_final_status(str(values.get("status_short") or values.get("status") or "")):
        competition_result = sync_competition_after_match(client, conn, match_id)

    for event in _event_payloads_by_ids(conn, new_event_ids):
        _publish_live_event(match_id, event)

    if event_rows:
        _publish_match_update(
            "match:events",
            match_id,
            {
                "matchId": match_id,
                "events": _event_payloads_for_match(conn, match_id),
                "updatedAt": utcnow().isoformat(),
            },
        )

    if team_statistics_count:
        _publish_match_update(
            "match:statistics",
            match_id,
            {
                "matchId": match_id,
                "statistics": _team_statistics_payloads(conn, match_id),
                "updatedAt": utcnow().isoformat(),
            },
        )

    return {
        "match_id": match_id,
        "fixture_api_id": values.get("api_id"),
        "status": values.get("status_short"),
        "has_events": bool(event_rows),
        "team_statistics": team_statistics_count,
        "player_statistics": player_statistics_count,
        "competition": competition_result,
        "next_action": decision.action,
    }


def sync_global_live_fixtures(client: ApiFootballClient, conn, *, league_api_ids: list[int] | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"live": "all"}
    if league_api_ids:
        params["league"] = "-".join(str(item) for item in league_api_ids)

    payload = client.get("/fixtures", params)
    rows = payload.get("response") or []
    synced: list[dict[str, Any]] = []

    for item in rows:
        result = _sync_fixture_payload(client, conn, item)
        if result:
            synced.append(result)

    return synced


def sync_fixture_by_api_id(client: ApiFootballClient, conn, fixture_api_id: int) -> dict[str, Any] | None:
    payload = client.get("/fixtures", {"id": fixture_api_id})
    rows = payload.get("response") or []
    if not rows:
        match = find_match_by_api_id(conn, fixture_api_id)
        if match:
            status = str(match.get("status_short") or match.get("status") or "").upper()
            retry_delay = timedelta(minutes=1) if is_live_status(status) else timedelta(hours=6)
            update_match_live_schedule(conn, match["id"], next_sync_at=utcnow() + retry_delay, attempts_increment=True)
        return None
    return _sync_fixture_payload(client, conn, rows[0])
