from __future__ import annotations

from typing import Any, Dict


def map_standing(payload: Dict[str, Any], competition_season_id: int, team_id: int) -> Dict[str, Any]:
    all_stats = payload.get("all") or {}
    goals = all_stats.get("goals") or {}
    return {
        "competition_season_id": competition_season_id,
        "team_id": team_id,
        "rank": payload.get("rank"),
        "points": payload.get("points"),
        "played": all_stats.get("played"),
        "wins": all_stats.get("win"),
        "draws": all_stats.get("draw"),
        "losses": all_stats.get("lose"),
        "goals_for": goals.get("for"),
        "goals_against": goals.get("against"),
        "goal_difference": payload.get("goalsDiff"),
        "form": payload.get("form"),
        "description": payload.get("description"),
    }
