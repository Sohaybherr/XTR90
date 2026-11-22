from __future__ import annotations

from typing import Any, Dict


def split_player_name(name: str | None) -> tuple[str | None, str | None]:
    if not name:
        return None, None
    parts = str(name).strip().split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def map_player(payload: Dict[str, Any]) -> Dict[str, Any]:
    player = payload.get("player", payload)
    birth = player.get("birth") or {}
    api_id = player.get("id")
    name = str(player.get("name") or "").strip() or (f"Player {api_id}" if api_id else "Unknown Player")
    first_name, last_name = split_player_name(name)
    photo_url = player.get("photo")
    photo_path = f"/assets/players/player_{api_id}.png" if api_id and photo_url else None
    return {
        "api_id": api_id,
        "name": name,
        "firstname": player.get("firstname") or first_name,
        "lastname": player.get("lastname") or last_name,
        "birth_date": birth.get("date"),
        "birth_place": birth.get("place"),
        "birth_country": birth.get("country"),
        "nationality": player.get("nationality"),
        "height": player.get("height"),
        "weight": player.get("weight"),
        "position": player.get("position"),
        "photo_path": photo_path,
        "photo_url": photo_url,
        "shirt_number": player.get("number"),
    }
