from __future__ import annotations

from typing import Any, Dict, List

from ..client import ApiFootballClient
from ..image_downloader import api_image_filename, backend_asset_target, download_image, relative_asset_path
from ..mappers.player_mapper import map_player
from ..storage import upsert_by_api_id, upsert_player_team_season, upsert_team_squad_player


def sync_squad(
    client: ApiFootballClient,
    conn,
    team_api_id: int,
    team_id: int,
    *,
    skip_images: bool = False,
) -> List[Dict[str, Any]]:
    payload = client.get("/players/squads", {"team": team_api_id})
    errors = payload.get("errors")
    if errors:
        print(f"Warning: /players/squads returned errors for team={team_api_id}: {errors}")
    squads = payload.get("response") or []
    if not squads:
        print(f"Warning: /players/squads returned 0 squad rows for team={team_api_id}")
        return []
    players = (squads[0].get("players") if squads else []) or []
    if not players:
        print(f"Warning: /players/squads returned a squad with 0 players for team={team_api_id}")
        return []
    synced = []
    for player in players:
        values = map_player({"player": player})
        photo_url = values.pop("photo_url", None)
        shirt_number = values.pop("shirt_number", None)
        api_id = values.get("api_id")
        if photo_url and api_id and not skip_images:
            filename = api_image_filename("player", int(api_id), photo_url)
            try:
                download_image(photo_url, backend_asset_target(client.config.assets_root, "players", filename))
                values["photo_path"] = relative_asset_path("players", filename)
            except Exception as err:
                print(f"Warning: player image failed for {api_id}: {err}")
        player_id = upsert_by_api_id(conn, "players", values)
        upsert_team_squad_player(
            conn,
            team_id=team_id,
            player_id=player_id,
            shirt_number=shirt_number,
            position=values.get("position"),
            is_current=True,
        )
        upsert_player_team_season(
            conn,
            player_id=player_id,
            team_id=team_id,
            season=None,
            position=values.get("position"),
            shirt_number=shirt_number,
            is_current=True,
        )
        synced.append({"player_id": player_id, "player_api_id": api_id})
    return synced
