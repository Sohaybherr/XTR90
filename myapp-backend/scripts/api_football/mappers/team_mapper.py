from __future__ import annotations

from typing import Any, Dict


def map_team(payload: Dict[str, Any], country_id: int | None = None) -> Dict[str, Any]:
    team = payload.get("team", payload)
    api_id = team.get("id")
    logo_url = team.get("logo")
    return {
        "api_id": api_id,
        "country_id": country_id,
        "country_name_snapshot": team.get("country"),
        "name": team.get("name"),
        "code": team.get("code"),
        "founded": team.get("founded"),
        "is_national": team.get("national"),
        "logo_path": f"/assets/teams/team_{api_id}.png" if api_id and logo_url else None,
        "logo_url": logo_url,
    }
