from __future__ import annotations

from typing import Any, Dict, Iterable, List

from .common import nested_get, parse_decimal, parse_int, parse_percentage


STAT_COLUMN_MAP = {
    "Shots on Goal": ("shots_on_goal", parse_int),
    "Shots off Goal": ("shots_off_goal", parse_int),
    "Total Shots": ("total_shots", parse_int),
    "Blocked Shots": ("blocked_shots", parse_int),
    "Shots insidebox": ("shots_inside_box", parse_int),
    "Shots outsidebox": ("shots_outside_box", parse_int),
    "Fouls": ("fouls", parse_int),
    "Corner Kicks": ("corner_kicks", parse_int),
    "Offsides": ("offsides", parse_int),
    "Ball Possession": ("ball_possession", parse_percentage),
    "Yellow Cards": ("yellow_cards", parse_int),
    "Red Cards": ("red_cards", parse_int),
    "Goalkeeper Saves": ("goalkeeper_saves", parse_int),
    "Total passes": ("total_passes", parse_int),
    "Passes accurate": ("passes_accurate", parse_int),
    "Passes %": ("passes_percentage", parse_percentage),
    "expected_goals": ("expected_goals", parse_decimal),
    "Expected Goals": ("expected_goals", parse_decimal),
}


def _map_stat_items(items: Iterable[Dict[str, Any]] | None) -> Dict[str, Any]:
    values: Dict[str, Any] = {"extra_statistics": {}}
    for stat in items or []:
        stat_type = stat.get("type")
        raw_value = stat.get("value")
        target = STAT_COLUMN_MAP.get(stat_type)
        if target:
            column, parser = target
            values[column] = parser(raw_value)
        elif stat_type:
            values["extra_statistics"][stat_type] = raw_value
    return values


def map_team_statistics(payload: Dict[str, Any] | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = payload.get("statistics", []) if isinstance(payload, dict) else payload
    mapped: List[Dict[str, Any]] = []
    for row in rows or []:
        team = row.get("team") or {}
        values: Dict[str, Any] = {
            "team_api_id": team.get("id"),
        }
        full_time = _map_stat_items(row.get("statistics"))
        values.update({key: value for key, value in full_time.items() if key != "extra_statistics"})
        values["extra_statistics"] = full_time.get("extra_statistics") or {}

        first_half = _map_stat_items(row.get("statistics_1h"))
        second_half = _map_stat_items(row.get("statistics_2h"))
        if row.get("statistics_1h"):
            values["extra_statistics"]["first_half"] = first_half
        if row.get("statistics_2h"):
            values["extra_statistics"]["second_half"] = second_half

        mapped.append(values)
    return mapped


def _flatten_triplet(values: Dict[str, Any], prefix: str, payload: Dict[str, Any]) -> None:
    values[f"{prefix}_home"] = parse_int(payload.get("home"))
    values[f"{prefix}_away"] = parse_int(payload.get("away"))
    values[f"{prefix}_total"] = parse_int(payload.get("total"))


def _flatten_average_triplet(values: Dict[str, Any], prefix: str, payload: Dict[str, Any]) -> None:
    values[f"{prefix}_home"] = parse_decimal(payload.get("home"))
    values[f"{prefix}_away"] = parse_decimal(payload.get("away"))
    values[f"{prefix}_total"] = parse_decimal(payload.get("total"))


def _parse_minute_range(label: str) -> tuple[int | None, int | None]:
    if not label:
        return None, None
    cleaned = str(label).replace("+", "").replace(" ", "")
    parts = cleaned.split("-")
    if len(parts) != 2:
        return None, None
    return parse_int(parts[0]), parse_int(parts[1])


def _goal_rows(direction: str, payload: Dict[str, Any] | None) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for label, values in (payload or {}).items():
        minute_from, minute_to = _parse_minute_range(label)
        rows.append(
            {
                "goal_direction": direction,
                "minute_from": minute_from,
                "minute_to": minute_to,
                "total": parse_int((values or {}).get("total")),
                "percentage": parse_percentage((values or {}).get("percentage")),
            }
        )
    return rows


def map_team_season_statistics(payload: Dict[str, Any]) -> Dict[str, Any]:
    response = payload.get("response", payload) or {}
    fixtures = response.get("fixtures") or {}
    goals = response.get("goals") or {}
    biggest = response.get("biggest") or {}
    clean_sheet = response.get("clean_sheet") or {}
    failed_to_score = response.get("failed_to_score") or {}
    penalty = response.get("penalty") or {}

    values: Dict[str, Any] = {
        "form": response.get("form"),
        "extra_statistics": {},
    }
    _flatten_triplet(values, "fixtures_played", fixtures.get("played") or {})
    _flatten_triplet(values, "wins", fixtures.get("wins") or {})
    _flatten_triplet(values, "draws", fixtures.get("draws") or {})
    _flatten_triplet(values, "losses", fixtures.get("loses") or fixtures.get("losses") or {})
    _flatten_triplet(values, "goals_for", nested_get(goals, "for", "total") or {})
    _flatten_triplet(values, "goals_against", nested_get(goals, "against", "total") or {})
    _flatten_average_triplet(values, "goals_for_average", nested_get(goals, "for", "average") or {})
    _flatten_average_triplet(values, "goals_against_average", nested_get(goals, "against", "average") or {})
    values.update(
        {
            "biggest_win_home": nested_get(biggest, "wins", "home"),
            "biggest_win_away": nested_get(biggest, "wins", "away"),
            "biggest_loss_home": nested_get(biggest, "loses", "home") or nested_get(biggest, "losses", "home"),
            "biggest_loss_away": nested_get(biggest, "loses", "away") or nested_get(biggest, "losses", "away"),
            "biggest_goals_for_home": parse_int(nested_get(biggest, "goals", "for", "home")),
            "biggest_goals_for_away": parse_int(nested_get(biggest, "goals", "for", "away")),
            "biggest_goals_against_home": parse_int(nested_get(biggest, "goals", "against", "home")),
            "biggest_goals_against_away": parse_int(nested_get(biggest, "goals", "against", "away")),
        }
    )
    _flatten_triplet(values, "clean_sheets", clean_sheet)
    _flatten_triplet(values, "failed_to_score", failed_to_score)
    values["penalties_scored"] = parse_int(nested_get(penalty, "scored", "total"))
    values["penalties_missed"] = parse_int(nested_get(penalty, "missed", "total"))
    values["penalties_total"] = parse_int(penalty.get("total"))
    values["penalties_percentage"] = parse_percentage(nested_get(penalty, "scored", "percentage"))

    lineups = [
        {"formation": row.get("formation"), "played": parse_int(row.get("played"))}
        for row in response.get("lineups") or []
        if row.get("formation")
    ]
    values["lineups_count"] = len(lineups)
    values["goal_timings"] = _goal_rows("FOR", nested_get(goals, "for", "minute")) + _goal_rows(
        "AGAINST", nested_get(goals, "against", "minute")
    )
    values["lineups"] = lineups

    known = {
        "league",
        "team",
        "form",
        "fixtures",
        "goals",
        "biggest",
        "clean_sheet",
        "failed_to_score",
        "penalty",
        "lineups",
    }
    values["extra_statistics"] = {key: value for key, value in response.items() if key not in known}
    return values
