from __future__ import annotations

from typing import Any, Dict

from .common import parse_int


def map_coach(payload: Dict[str, Any]) -> Dict[str, Any]:
    coach = payload.get("coach", payload) or {}
    birth = coach.get("birth") or {}
    return {
        "api_id": coach.get("id"),
        "name": coach.get("name"),
        "firstname": coach.get("firstname"),
        "lastname": coach.get("lastname"),
        "age": parse_int(coach.get("age")),
        "birth_date": birth.get("date"),
        "birth_place": birth.get("place"),
        "birth_country": birth.get("country"),
        "nationality": coach.get("nationality"),
        "height": coach.get("height"),
        "weight": coach.get("weight"),
        "photo_path": coach.get("photo"),
    }
