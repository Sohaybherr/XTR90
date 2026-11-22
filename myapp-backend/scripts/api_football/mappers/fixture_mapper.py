from __future__ import annotations

from typing import Any, Dict

from .common import nested_get


def map_fixture(
    payload: Dict[str, Any],
    competition_id: int,
    season_id: int,
    home_team_id: int,
    away_team_id: int,
) -> Dict[str, Any]:
    fixture = payload.get("fixture", payload)
    goals = payload.get("goals", {})
    status = fixture.get("status") or {}
    teams = payload.get("teams") or {}
    home_team = teams.get("home") or {}
    away_team = teams.get("away") or {}
    kickoff_at = fixture.get("date")
    api_timestamp = fixture.get("timestamp")
    referee_name = fixture.get("referee")
    status_short = status.get("short")
    status_long = status.get("long")
    return {
        "api_id": fixture.get("id"),
        "competition_id": competition_id,
        "season_id": season_id,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "venue_id": None,
        "stadium": (fixture.get("venue") or {}).get("name"),
        "round": (payload.get("league") or {}).get("round"),
        "match_date": kickoff_at,
        "kickoff_at": kickoff_at,
        "fixture_timestamp": api_timestamp,
        "api_timestamp": api_timestamp,
        "timezone": fixture.get("timezone"),
        "status": status_short or status_long,
        "status_short": status_short,
        "status_long": status_long,
        "elapsed": status.get("elapsed"),
        "elapsed_extra": status.get("extra"),
        "referee": referee_name,
        "referee_name": referee_name,
        "home_winner": home_team.get("winner"),
        "away_winner": away_team.get("winner"),
        "home_score": goals.get("home"),
        "away_score": goals.get("away"),
        "home_goals": goals.get("home"),
        "away_goals": goals.get("away"),
        "halftime_home": nested_get(payload, "score", "halftime", "home"),
        "halftime_away": nested_get(payload, "score", "halftime", "away"),
        "fulltime_home": nested_get(payload, "score", "fulltime", "home"),
        "fulltime_away": nested_get(payload, "score", "fulltime", "away"),
        "extratime_home": nested_get(payload, "score", "extratime", "home"),
        "extratime_away": nested_get(payload, "score", "extratime", "away"),
        "penalty_home": nested_get(payload, "score", "penalty", "home"),
        "penalty_away": nested_get(payload, "score", "penalty", "away"),
        "has_events": bool(payload.get("events")),
        "has_lineups": bool(payload.get("lineups")),
        "has_team_statistics": bool(payload.get("statistics")),
        "has_player_statistics": bool(payload.get("players")),
    }
