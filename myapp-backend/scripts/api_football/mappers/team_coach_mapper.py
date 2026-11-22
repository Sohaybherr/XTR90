from __future__ import annotations

from typing import Any, Dict, List

from .common import parse_int


def map_team_coaches(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = payload.get("response", payload if isinstance(payload, list) else []) or []
    mapped: List[Dict[str, Any]] = []
    for row in rows:
        career_rows = row.get("career") or [{}]
        for career in career_rows:
            mapped.append(
                {
                    "coach_api_id": row.get("id"),
                    "team_api_id": (career.get("team") or {}).get("id"),
                    "season": parse_int(career.get("season")),
                    "started_at": career.get("start"),
                    "ended_at": career.get("end"),
                    "is_current": not bool(career.get("end")),
                }
            )
    return mapped
