from __future__ import annotations

from ..client import ApiFootballClient
from ..sync.sync_fixtures import sync_fixtures
from ..sync.sync_standings import sync_standings


def sync_competition_after_match(client: ApiFootballClient, conn, match_id: int) -> dict[str, object]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                c.api_id AS league_api_id,
                m.competition_id,
                m.season_id,
                cs.season_year,
                m.competition_season_id
            FROM matches m
            JOIN competitions c ON c.id = m.competition_id
            LEFT JOIN competition_seasons cs ON cs.id = m.competition_season_id
            WHERE m.id = %s
            LIMIT 1
            """,
            (match_id,),
        )
        row = cur.fetchone()

    if not row:
        return {"skipped": True, "reason": "match_not_found"}

    league_api_id, competition_id, season_id, season_year, competition_season_id = row
    if not league_api_id or not competition_id or not season_id or not season_year or not competition_season_id:
        return {
            "skipped": True,
            "reason": "missing_competition_season_context",
            "league_api_id": league_api_id,
            "competition_id": competition_id,
            "season_id": season_id,
            "season_year": season_year,
            "competition_season_id": competition_season_id,
        }

    fixtures = sync_fixtures(
        client,
        conn,
        int(league_api_id),
        int(season_year),
        int(competition_id),
        int(season_id),
        int(competition_season_id),
    )
    standings = sync_standings(
        client,
        conn,
        int(league_api_id),
        int(season_year),
        int(competition_season_id),
    )
    return {
        "skipped": False,
        "league_api_id": int(league_api_id),
        "competition_id": int(competition_id),
        "season_id": int(season_id),
        "season_year": int(season_year),
        "competition_season_id": int(competition_season_id),
        "fixtures": len(fixtures),
        "standings": len(standings),
    }
