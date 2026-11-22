from __future__ import annotations

from typing import Any, Dict

from .common import parse_int


def map_venue(payload: Dict[str, Any]) -> Dict[str, Any]:
    venue = payload.get("venue", payload) or {}
    api_id = venue.get("id")
    image_url = venue.get("image")
    return {
        "api_id": api_id,
        "name": venue.get("name"),
        "address": venue.get("address"),
        "city": venue.get("city"),
        "country": venue.get("country"),
        "capacity": parse_int(venue.get("capacity")),
        "surface": venue.get("surface"),
        "image_path": f"/assets/venues/venue_{api_id}.png" if api_id and image_url else None,
        "image_url": image_url,
    }
