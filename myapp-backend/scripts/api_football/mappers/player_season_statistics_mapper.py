from __future__ import annotations

from typing import Any, Dict

from .common import nested_get, parse_decimal, parse_int, parse_percentage


KNOWN_TOP_LEVEL = {
    "team",
    "league",
    "games",
    "substitutes",
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


def map_player_season_statistics(stats: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "appearances": parse_int(nested_get(stats, "games", "appearences")),
        "lineups": parse_int(nested_get(stats, "games", "lineups")),
        "minutes": parse_int(nested_get(stats, "games", "minutes")),
        "number": parse_int(nested_get(stats, "games", "number")),
        "position": nested_get(stats, "games", "position"),
        "rating": parse_decimal(nested_get(stats, "games", "rating")),
        "captain": nested_get(stats, "games", "captain"),
        "goals_total": parse_int(nested_get(stats, "goals", "total")),
        "goals_conceded": parse_int(nested_get(stats, "goals", "conceded")),
        "goals_assists": parse_int(nested_get(stats, "goals", "assists")),
        "goals_saves": parse_int(nested_get(stats, "goals", "saves")),
        "goalkeeper_saves": parse_int(nested_get(stats, "goals", "saves")),
        "shots_total": parse_int(nested_get(stats, "shots", "total")),
        "shots_on": parse_int(nested_get(stats, "shots", "on")),
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
