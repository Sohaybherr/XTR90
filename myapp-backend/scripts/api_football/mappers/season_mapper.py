from __future__ import annotations

from typing import Any, Dict


def map_season(payload: Dict[str, Any]) -> Dict[str, Any]:
    year = payload.get("year")
    return {
        "name": str(year) if year is not None else None,
        "start_date": payload.get("start"),
        "end_date": payload.get("end"),
        "is_current": payload.get("current", False),
        "season_year": year,
    }
