from __future__ import annotations

import hashlib
from typing import Any, Dict, Iterable, List

from .common import parse_int, split_grid


def _colors(lineup: Dict[str, Any], group: str, field: str) -> Any:
    return (((lineup.get("colors") or {}).get(group) or {}).get(field))


def _player_key(values: Dict[str, Any]) -> str:
    raw = "|".join(
        str(values.get(key) or "")
        for key in ("player_api_id", "player_name_snapshot", "shirt_number", "lineup_type", "grid", "display_order")
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _map_players(items: Iterable[Dict[str, Any]], lineup_type: str) -> List[Dict[str, Any]]:
    players: List[Dict[str, Any]] = []
    for index, item in enumerate(items or []):
        player = item.get("player") or item
        grid = player.get("grid")
        grid_row, grid_column = split_grid(grid)
        values = {
            "player_api_id": player.get("id"),
            "player_name_snapshot": player.get("name"),
            "shirt_number": parse_int(player.get("number")),
            "position": player.get("pos"),
            "lineup_type": lineup_type,
            "grid": grid,
            "grid_row": grid_row,
            "grid_column": grid_column,
            "display_order": index,
        }
        values["lineup_player_key"] = _player_key(values)
        players.append(values)
    return players


def map_lineups(payload: Dict[str, Any] | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = payload.get("lineups", []) if isinstance(payload, dict) else payload
    mapped: List[Dict[str, Any]] = []
    for lineup in rows or []:
        team = lineup.get("team") or {}
        coach = lineup.get("coach") or {}
        mapped.append(
            {
                "team_api_id": team.get("id"),
                "coach_api_id": coach.get("id"),
                "coach": coach,
                "formation": lineup.get("formation"),
                "player_primary_color": _colors(lineup, "player", "primary"),
                "player_number_color": _colors(lineup, "player", "number"),
                "player_border_color": _colors(lineup, "player", "border"),
                "goalkeeper_primary_color": _colors(lineup, "goalkeeper", "primary"),
                "goalkeeper_number_color": _colors(lineup, "goalkeeper", "number"),
                "goalkeeper_border_color": _colors(lineup, "goalkeeper", "border"),
                "confirmed": bool(lineup.get("formation")),
                "players": _map_players(lineup.get("startXI") or [], "STARTING_XI")
                + _map_players(lineup.get("substitutes") or [], "SUBSTITUTE"),
            }
        )
    return mapped
