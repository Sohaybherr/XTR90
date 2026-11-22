from __future__ import annotations

from typing import Any, Dict, List

from .common import parse_int


def map_team_standing_snapshots(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    response = payload.get("response", payload if isinstance(payload, list) else []) or []
    rows: List[Dict[str, Any]] = []
    for league_row in response:
        standings_groups = (league_row.get("league") or {}).get("standings") or []
        for group in standings_groups:
            for row in group:
                all_stats = row.get("all") or {}
                goals = all_stats.get("goals") or {}
                rows.append(
                    {
                        "team_api_id": (row.get("team") or {}).get("id"),
                        "rank": parse_int(row.get("rank")),
                        "points": parse_int(row.get("points")),
                        "played": parse_int(all_stats.get("played")),
                        "wins": parse_int(all_stats.get("win")),
                        "draws": parse_int(all_stats.get("draw")),
                        "losses": parse_int(all_stats.get("lose")),
                        "goals_for": parse_int(goals.get("for")),
                        "goals_against": parse_int(goals.get("against")),
                        "goal_difference": parse_int(row.get("goalsDiff")),
                        "form": row.get("form"),
                        "description": row.get("description"),
                    }
                )
    return rows
