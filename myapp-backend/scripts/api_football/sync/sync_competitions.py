from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List

from ..client import ApiFootballClient
from ..image_downloader import api_image_filename, backend_asset_target, download_image, relative_asset_path
from ..mappers.competition_mapper import map_competition
from ..mappers.season_mapper import map_season
from ..storage import (
    ensure_legacy_season,
    find_country_id,
    upsert_by_api_id,
    upsert_competition_season,
)


def sync_competitions(
    client: ApiFootballClient,
    league_payloads: Iterable[Dict[str, Any]],
    conn,
    *,
    skip_images: bool = False,
    season_year: int | None = None,
    name_formatter: Callable[[Dict[str, Any], str | None], str | None] | None = None,
) -> List[Dict[str, Any]]:
    synced: List[Dict[str, Any]] = []
    for payload in league_payloads:
        country = payload.get("country") or {}
        country_id = find_country_id(conn, name=country.get("name"), code=country.get("code"))
        values = map_competition(payload, country_id=country_id)
        if name_formatter:
            formatted_name = name_formatter(payload, values.get("name"))
            if formatted_name:
                values["name"] = formatted_name
        logo_url = values.get("logo")
        api_id = values.get("api_id")
        if logo_url and api_id and not skip_images:
            filename = api_image_filename("competition", int(api_id), logo_url)
            try:
                download_image(logo_url, backend_asset_target(client.config.assets_root, "competitions", filename))
                values["logo"] = relative_asset_path("competitions", filename)
            except Exception as err:
                print(f"Warning: competition image failed for {api_id}: {err}")
        competition_id = upsert_by_api_id(conn, "competitions", values)

        selected_season = select_season(payload.get("seasons") or [], preferred_year=season_year)
        season_id = None
        competition_season_id = None
        if selected_season and competition_id:
            mapped_season = map_season(selected_season)
            season_year = mapped_season.get("season_year")
            season_id = ensure_legacy_season(
                conn,
                int(season_year),
                mapped_season.get("start_date"),
                mapped_season.get("end_date"),
                bool(mapped_season.get("is_current")),
            )
            competition_season_id = upsert_competition_season(
                conn,
                {
                    "competition_id": competition_id,
                    "season_year": season_year,
                    "start_date": mapped_season.get("start_date"),
                    "end_date": mapped_season.get("end_date"),
                    "current": mapped_season.get("is_current"),
                    "coverage": selected_season.get("coverage"),
                },
            )

        synced.append(
            {
                "league_api_id": api_id,
                "competition_id": competition_id,
                "season_year": selected_season.get("year") if selected_season else None,
                "season_id": season_id,
                "competition_season_id": competition_season_id,
                "name": values.get("name"),
            }
        )
    return synced


def select_season(seasons: List[Dict[str, Any]], preferred_year: int | None = None) -> Dict[str, Any] | None:
    if not seasons:
        return None
    if preferred_year is not None:
        for season in seasons:
            if int(season.get("year") or 0) == preferred_year:
                return season
        return None
    current = [season for season in seasons if season.get("current")]
    candidates = current or seasons
    return sorted(candidates, key=lambda season: int(season.get("year") or 0), reverse=True)[0]
