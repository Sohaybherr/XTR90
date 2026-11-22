from __future__ import annotations

from typing import Any, Dict


def map_competition(payload: Dict[str, Any], country_id: int | None = None) -> Dict[str, Any]:
    league = payload.get("league", payload)
    country = payload.get("country", {})
    return {
        "api_id": league.get("id"),
        "country_id": country_id,
        "name": league.get("name"),
        "type": league.get("type") or "League",
        "logo": league.get("logo"),
        "country_name": country.get("name"),
    }
