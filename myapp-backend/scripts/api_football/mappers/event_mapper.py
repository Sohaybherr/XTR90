from __future__ import annotations

import hashlib
from typing import Any, Dict, Iterable, List

from .common import parse_int


def build_event_key(values: Dict[str, Any]) -> str:
    raw = "|".join(
        str(values.get(key) or "")
        for key in (
            "team_api_id",
            "player_api_id",
            "assist_player_api_id",
            "elapsed",
            "extra",
            "event_type",
            "event_detail",
            "comments",
        )
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def map_events(payload: Dict[str, Any] | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    events = payload.get("events", []) if isinstance(payload, dict) else payload
    mapped: List[Dict[str, Any]] = []
    for index, event in enumerate(events or []):
        time = event.get("time") or {}
        team = event.get("team") or {}
        player = event.get("player") or {}
        assist = event.get("assist") or {}
        values = {
            "team_api_id": team.get("id"),
            "player_api_id": player.get("id"),
            "assist_player_api_id": assist.get("id"),
            "elapsed": parse_int(time.get("elapsed")),
            "extra": parse_int(time.get("extra")),
            "event_type": event.get("type"),
            "event_detail": event.get("detail"),
            "comments": event.get("comments"),
            "event_order": index,
        }
        values["event_key"] = build_event_key(values)
        mapped.append(values)
    return mapped
