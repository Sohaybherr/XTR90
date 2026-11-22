from __future__ import annotations

from ..client import ApiFootballClient


def sync_players(client: ApiFootballClient, team_api_id: int, season_year: int, *, execute: bool = False) -> None:
    raise NotImplementedError("Player sync structure is prepared, but API calls are intentionally disabled.")
