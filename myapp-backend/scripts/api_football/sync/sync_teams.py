from __future__ import annotations

from typing import Any, Dict, List

from ..client import ApiFootballClient
from ..image_downloader import api_image_filename, backend_asset_target, download_image, relative_asset_path
from ..mappers.team_mapper import map_team
from ..mappers.venue_mapper import map_venue
from ..storage import (
    find_country_id,
    upsert_team,
    upsert_team_competition,
    upsert_team_competition_season,
    upsert_team_venue,
    upsert_venue,
)


def sync_teams(
    client: ApiFootballClient,
    conn,
    league_api_id: int,
    season_year: int,
    competition_id: int,
    season_id: int | None,
    competition_season_id: int | None = None,
    *,
    skip_images: bool = False,
) -> List[Dict[str, Any]]:
    payload = client.get("/teams", {"league": league_api_id, "season": season_year})
    rows = payload.get("response") or []
    if not rows:
        errors = payload.get("errors")
        print(f"Warning: /teams returned 0 rows for league={league_api_id} season={season_year}; errors={errors}")
    synced = []
    for item in rows:
        team = item.get("team") or {}
        country_id = find_country_id(conn, name=team.get("country"))
        values = map_team(item, country_id=country_id)
        logo_url = values.pop("logo_url", None)
        api_id = values.get("api_id")
        if logo_url and api_id and not skip_images:
            filename = api_image_filename("team", int(api_id), logo_url)
            try:
                download_image(logo_url, backend_asset_target(client.config.assets_root, "teams", filename))
                values["logo_path"] = relative_asset_path("teams", filename)
            except Exception as err:
                print(f"Warning: team image failed for {api_id}: {err}")
        team_id = upsert_team(conn, values)
        venue_values = map_venue(item)
        venue_image_url = venue_values.pop("image_url", None)
        venue_api_id = venue_values.get("api_id")
        if venue_image_url and venue_api_id and not skip_images:
            filename = api_image_filename("venue", int(venue_api_id), venue_image_url)
            try:
                download_image(venue_image_url, backend_asset_target(client.config.assets_root, "venues", filename))
                venue_values["image_path"] = relative_asset_path("venues", filename)
            except Exception as err:
                print(f"Warning: venue image failed for {venue_api_id}: {err}")
        venue_id = upsert_venue(conn, venue_values) if venue_values.get("api_id") or venue_values.get("name") else None
        if team_id and venue_id:
            upsert_team_venue(conn, team_id=team_id, venue_id=venue_id, season=season_year, is_primary=True)
        if team_id and season_id:
            upsert_team_competition(conn, team_id, competition_id, season_id)
        if team_id and competition_season_id:
            upsert_team_competition_season(
                conn,
                team_id=team_id,
                competition_season_id=competition_season_id,
                is_active=True,
            )
        synced.append({"team_id": team_id, "team_api_id": api_id, "name": values.get("name")})
    return synced
