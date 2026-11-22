from __future__ import annotations

from typing import Any, Dict, List

from ..client import ApiFootballClient
from ..mappers.standing_mapper import map_standing
from ..storage import find_id_by_api_id, upsert_standing


def sync_standings(
    client: ApiFootballClient,
    conn,
    league_api_id: int,
    season_year: int,
    competition_season_id: int | None,
) -> List[Dict[str, Any]]:
    if not competition_season_id:
        return []
    payload = client.get("/standings", {"league": league_api_id, "season": season_year})
    leagues = payload.get("response") or []
    standings = (((leagues[0] if leagues else {}).get("league") or {}).get("standings") or [])
    rows = standings[0] if standings else []
    synced = []
    for item in rows:
        team_api_id = ((item.get("team") or {}).get("id"))
        team_id = find_id_by_api_id(conn, "teams", int(team_api_id)) if team_api_id else None
        if not team_id:
            continue
        standing_id = upsert_standing(conn, map_standing(item, competition_season_id, team_id))
        synced.append({"standing_id": standing_id, "team_api_id": team_api_id})
    return synced
