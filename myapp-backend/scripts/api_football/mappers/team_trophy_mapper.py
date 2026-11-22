from __future__ import annotations

from typing import Any, Dict, List


def map_team_trophies(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = payload.get("response", payload if isinstance(payload, list) else []) or []
    mapped: List[Dict[str, Any]] = []
    for row in rows:
        league = row.get("league") or row.get("competition") or {}
        competition_name = league.get("name") if isinstance(league, dict) else league
        mapped.append(
            {
                "competition_name": competition_name,
                "country": row.get("country"),
                "season": str(row.get("season")) if row.get("season") is not None else None,
                "place": row.get("place"),
            }
        )
    return mapped
