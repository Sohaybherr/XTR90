from __future__ import annotations

from typing import Any, Dict, List

from ..client import ApiFootballClient
from ..mappers.fixture_mapper import map_fixture
from ..mappers.venue_mapper import map_venue
from ..storage import find_id_by_api_id, upsert_match, upsert_venue


def sync_fixtures(
    client: ApiFootballClient,
    conn,
    league_api_id: int,
    season_year: int,
    competition_id: int,
    season_id: int,
    competition_season_id: int | None = None,
) -> List[Dict[str, Any]]:
    payload = client.get("/fixtures", {"league": league_api_id, "season": season_year})
    rows = payload.get("response") or []
    synced = []
    for item in rows:
        teams = item.get("teams") or {}
        home_api_id = ((teams.get("home") or {}).get("id"))
        away_api_id = ((teams.get("away") or {}).get("id"))
        home_team_id = find_id_by_api_id(conn, "teams", int(home_api_id)) if home_api_id else None
        away_team_id = find_id_by_api_id(conn, "teams", int(away_api_id)) if away_api_id else None
        if not home_team_id or not away_team_id:
            continue
        values = map_fixture(item, competition_id, season_id, home_team_id, away_team_id)
        values["competition_season_id"] = competition_season_id
        venue_id = upsert_venue(conn, map_venue((item.get("fixture") or {}).get("venue") or {}))
        values["venue_id"] = venue_id
        match_id = upsert_match(conn, values)
        synced.append({"match_id": match_id, "fixture_api_id": values.get("api_id")})
    return synced
