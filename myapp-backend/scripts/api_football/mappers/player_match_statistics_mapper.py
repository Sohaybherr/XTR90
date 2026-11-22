from __future__ import annotations

from typing import Any, Dict, Iterable, List

from .common import nested_get, parse_decimal, parse_int, parse_percentage


KNOWN_TOP_LEVEL = {
    "games",
    "offsides",
    "shots",
    "goals",
    "passes",
    "tackles",
    "duels",
    "dribbles",
    "fouls",
    "cards",
    "penalty",
}


def map_player_match_statistics(payload: Dict[str, Any] | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    teams = payload.get("players", []) if isinstance(payload, dict) else payload
    mapped: List[Dict[str, Any]] = []
    for team_row in teams or []:
        team = team_row.get("team") or {}
        for player_row in team_row.get("players") or []:
            player = player_row.get("player") or {}
            stats = (player_row.get("statistics") or [{}])[0] or {}
            values: Dict[str, Any] = {
                "team_api_id": team.get("id"),
                "player_api_id": player.get("id"),
                "shirt_number": parse_int(nested_get(stats, "games", "number")),
                "position": nested_get(stats, "games", "position"),
                "rating": parse_decimal(nested_get(stats, "games", "rating")),
                "captain": nested_get(stats, "games", "captain"),
                "substitute": nested_get(stats, "games", "substitute"),
                "minutes": parse_int(nested_get(stats, "games", "minutes")),
                "offsides": parse_int(stats.get("offsides")),
                "shots_total": parse_int(nested_get(stats, "shots", "total")),
                "shots_on": parse_int(nested_get(stats, "shots", "on")),
                "goals_total": parse_int(nested_get(stats, "goals", "total")),
                "goals_conceded": parse_int(nested_get(stats, "goals", "conceded")),
                "goals_assists": parse_int(nested_get(stats, "goals", "assists")),
                "goalkeeper_saves": parse_int(nested_get(stats, "goals", "saves")),
                "passes_total": parse_int(nested_get(stats, "passes", "total")),
                "passes_key": parse_int(nested_get(stats, "passes", "key")),
                "passes_accuracy": parse_percentage(nested_get(stats, "passes", "accuracy")),
                "tackles_total": parse_int(nested_get(stats, "tackles", "total")),
                "tackles_blocks": parse_int(nested_get(stats, "tackles", "blocks")),
                "tackles_interceptions": parse_int(nested_get(stats, "tackles", "interceptions")),
                "duels_total": parse_int(nested_get(stats, "duels", "total")),
                "duels_won": parse_int(nested_get(stats, "duels", "won")),
                "dribbles_attempts": parse_int(nested_get(stats, "dribbles", "attempts")),
                "dribbles_success": parse_int(nested_get(stats, "dribbles", "success")),
                "dribbles_past": parse_int(nested_get(stats, "dribbles", "past")),
                "fouls_drawn": parse_int(nested_get(stats, "fouls", "drawn")),
                "fouls_committed": parse_int(nested_get(stats, "fouls", "committed")),
                "cards_yellow": parse_int(nested_get(stats, "cards", "yellow")),
                "cards_yellow_red": parse_int(nested_get(stats, "cards", "yellowred")),
                "cards_red": parse_int(nested_get(stats, "cards", "red")),
                "penalties_won": parse_int(nested_get(stats, "penalty", "won")),
                "penalties_committed": parse_int(nested_get(stats, "penalty", "commited")),
                "penalties_scored": parse_int(nested_get(stats, "penalty", "scored")),
                "penalties_missed": parse_int(nested_get(stats, "penalty", "missed")),
                "penalties_saved": parse_int(nested_get(stats, "penalty", "saved")),
                "extra_statistics": {key: value for key, value in stats.items() if key not in KNOWN_TOP_LEVEL},
            }
            mapped.append(values)
    return mapped
