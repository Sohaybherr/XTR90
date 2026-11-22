#!/usr/bin/env python
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient
from api_football.config import load_config
from api_football.mappers.common import parse_int
from api_football.mappers.player_mapper import map_player
from api_football.mappers.player_season_statistics_mapper import map_player_season_statistics
from api_football.storage import (
    db_connection,
    table_exists,
    upsert_by_api_id,
    upsert_player_season_statistics,
    upsert_player_team_season,
    upsert_team_squad_player,
)


@dataclass(frozen=True)
class TeamSeason:
    team_id: int
    team_api_id: int
    team_name: str
    competition_season_id: int
    competition_api_id: int
    competition_name: str
    season_year: int
    is_current: bool


def load_team_seasons(conn, *, only_current: bool = False, limit: int | None = None) -> List[TeamSeason]:
    if not all(table_exists(conn, table) for table in ["teams", "competitions", "competition_seasons", "team_competition_seasons"]):
        return []
    sql = """
        SELECT
            t.id,
            t.api_id,
            t.name,
            cs.id,
            c.api_id,
            c.name,
            cs.season_year,
            COALESCE(cs.current, FALSE)
        FROM team_competition_seasons tcs
        JOIN teams t ON t.id = tcs.team_id
        JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
        JOIN competitions c ON c.id = cs.competition_id
        WHERE t.api_id IS NOT NULL
          AND c.api_id IS NOT NULL
    """
    params: list[Any] = []
    if only_current:
        sql += " AND COALESCE(cs.current, FALSE) = TRUE"
    sql += " ORDER BY cs.season_year DESC, c.api_id, t.name"
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [
            TeamSeason(
                team_id=row[0],
                team_api_id=row[1],
                team_name=row[2],
                competition_season_id=row[3],
                competition_api_id=row[4],
                competition_name=row[5],
                season_year=row[6],
                is_current=row[7],
            )
            for row in cur.fetchall()
        ]


def fetch_players_for_team_season(client: ApiFootballClient, row: TeamSeason) -> Iterable[Dict[str, Any]]:
    page = 1
    while True:
        payload = client.get(
            "/players",
            {
                "team": row.team_api_id,
                "league": row.competition_api_id,
                "season": row.season_year,
                "page": page,
            },
        )
        errors = payload.get("errors")
        if errors:
            print(
                f"Warning: /players errors team={row.team_api_id} league={row.competition_api_id} "
                f"season={row.season_year}: {errors}"
            )
        for player_row in payload.get("response") or []:
            yield player_row
        paging = payload.get("paging") or {}
        total_pages = int(paging.get("total") or page)
        if page >= total_pages:
            break
        page += 1


def sync_player_profile_row(conn, row: TeamSeason, player_row: Dict[str, Any]) -> bool:
    values = map_player(player_row)
    values.pop("photo_url", None)
    shirt_number = parse_int(values.pop("shirt_number", None))
    player_id = upsert_by_api_id(conn, "players", values)
    if not player_id:
        return False

    mapped_stats = 0
    for stats in player_row.get("statistics") or []:
        league = stats.get("league") or {}
        team = stats.get("team") or {}
        if parse_int(league.get("id")) != row.competition_api_id:
            continue
        if parse_int(league.get("season")) != row.season_year:
            continue
        if parse_int(team.get("id")) and parse_int(team.get("id")) != row.team_api_id:
            continue

        stat_values = map_player_season_statistics(stats)
        shirt_number = shirt_number or parse_int(stat_values.get("number"))
        position = values.get("position") or stat_values.get("position")
        upsert_player_season_statistics(
            conn,
            {
                **stat_values,
                "player_id": player_id,
                "team_id": row.team_id,
                "competition_season_id": row.competition_season_id,
            },
        )
        upsert_player_team_season(
            conn,
            player_id=player_id,
            team_id=row.team_id,
            season=row.season_year,
            position=position,
            shirt_number=shirt_number,
            is_current=row.is_current,
        )
        if row.is_current:
            upsert_team_squad_player(
                conn,
                team_id=row.team_id,
                player_id=player_id,
                shirt_number=shirt_number,
                position=position,
                is_current=True,
            )
        mapped_stats += 1

    if not mapped_stats:
        upsert_player_team_season(
            conn,
            player_id=player_id,
            team_id=row.team_id,
            season=row.season_year,
            position=values.get("position"),
            shirt_number=shirt_number,
            is_current=row.is_current,
        )
    return True


def apply_player_null_cleanup(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players
            SET firstname = COALESCE(NULLIF(TRIM(firstname), ''), split_part(name, ' ', 1), 'Unknown'),
                lastname = COALESCE(NULLIF(TRIM(lastname), ''), 'Unknown'),
                birth_date = COALESCE(birth_date, DATE '1900-01-01'),
                birth_place = COALESCE(NULLIF(TRIM(birth_place), ''), 'Unknown'),
                birth_country = COALESCE(NULLIF(TRIM(birth_country), ''), 'Unknown'),
                nationality = COALESCE(NULLIF(TRIM(nationality), ''), 'Unknown'),
                height = COALESCE(NULLIF(TRIM(height), ''), 'Unknown'),
                weight = COALESCE(NULLIF(TRIM(weight), ''), 'Unknown'),
                position = COALESCE(NULLIF(TRIM(position), ''), 'Unknown'),
                photo_path = COALESCE(NULLIF(TRIM(photo_path), ''), '/assets/players/player_' || api_id || '.png'),
                api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
                api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            WHERE api_id IS NOT NULL
            """
        )
        cur.execute(
            """
            UPDATE team_squad_players tsp
            SET shirt_number = COALESCE(tsp.shirt_number, 0),
                position = COALESCE(NULLIF(TRIM(tsp.position), ''), p.position, 'Unknown'),
                joined_at = COALESCE(tsp.joined_at, DATE '1900-01-01'),
                left_at = COALESCE(tsp.left_at, DATE '9999-12-31'),
                api_synced_at = COALESCE(tsp.api_synced_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            FROM players p
            WHERE p.id = tsp.player_id
            """
        )
        cur.execute(
            """
            UPDATE player_team_seasons pts
            SET shirt_number = COALESCE(pts.shirt_number, 0),
                position = COALESCE(NULLIF(TRIM(pts.position), ''), p.position, 'Unknown'),
                joined_at = COALESCE(pts.joined_at, DATE '1900-01-01'),
                left_at = COALESCE(pts.left_at, DATE '9999-12-31'),
                api_synced_at = COALESCE(pts.api_synced_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            FROM players p
            WHERE p.id = pts.player_id
            """
        )
        cur.execute(
            """
            UPDATE player_season_statistics
            SET appearances = COALESCE(appearances, 0),
                lineups = COALESCE(lineups, 0),
                minutes = COALESCE(minutes, 0),
                number = COALESCE(number, 0),
                position = COALESCE(NULLIF(TRIM(position), ''), 'Unknown'),
                rating = COALESCE(rating, 0),
                captain = COALESCE(captain, FALSE),
                goals_total = COALESCE(goals_total, 0),
                goals_conceded = COALESCE(goals_conceded, 0),
                goals_assists = COALESCE(goals_assists, 0),
                goals_saves = COALESCE(goals_saves, 0),
                shots_total = COALESCE(shots_total, 0),
                shots_on = COALESCE(shots_on, 0),
                passes_total = COALESCE(passes_total, 0),
                passes_key = COALESCE(passes_key, 0),
                passes_accuracy = COALESCE(passes_accuracy, 0),
                tackles_total = COALESCE(tackles_total, 0),
                tackles_blocks = COALESCE(tackles_blocks, 0),
                tackles_interceptions = COALESCE(tackles_interceptions, 0),
                duels_total = COALESCE(duels_total, 0),
                duels_won = COALESCE(duels_won, 0),
                dribbles_attempts = COALESCE(dribbles_attempts, 0),
                dribbles_success = COALESCE(dribbles_success, 0),
                dribbles_past = COALESCE(dribbles_past, 0),
                fouls_drawn = COALESCE(fouls_drawn, 0),
                fouls_committed = COALESCE(fouls_committed, 0),
                cards_yellow = COALESCE(cards_yellow, 0),
                cards_yellow_red = COALESCE(cards_yellow_red, 0),
                cards_red = COALESCE(cards_red, 0),
                penalties_won = COALESCE(penalties_won, 0),
                penalties_committed = COALESCE(penalties_committed, 0),
                penalties_scored = COALESCE(penalties_scored, 0),
                penalties_missed = COALESCE(penalties_missed, 0),
                penalties_saved = COALESCE(penalties_saved, 0),
                goalkeeper_saves = COALESCE(goalkeeper_saves, 0),
                extra_statistics = COALESCE(extra_statistics, '{}'::jsonb),
                api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
                api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            """
        )
        cur.execute(
            """
            UPDATE match_player_statistics
            SET goals_conceded = COALESCE(goals_conceded, 0),
                dribbles_past = COALESCE(dribbles_past, 0),
                cards_yellow_red = COALESCE(cards_yellow_red, 0),
                penalties_won = COALESCE(penalties_won, 0),
                penalties_committed = COALESCE(penalties_committed, 0),
                penalties_missed = COALESCE(penalties_missed, 0),
                penalties_saved = COALESCE(penalties_saved, 0),
                updated_at = CURRENT_TIMESTAMP
            """
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync API-Football player profile and season statistics data.")
    parser.add_argument("--execute", action="store_true", help="Perform API calls and database writes.")
    parser.add_argument("--only-current", action="store_true", help="Only sync rows where competition_seasons.current = true.")
    parser.add_argument("--limit", type=int, help="Limit team-season rows for a small run.")
    parser.add_argument("--no-cleanup", action="store_true", help="Skip fallback value cleanup after sync.")
    args = parser.parse_args()

    if not args.execute:
        with db_connection() as conn:
            rows = load_team_seasons(conn, only_current=args.only_current, limit=args.limit)
        print("Dry run only. Use --execute to call API-Football and write player data.")
        print(f"Team-season rows to sync: {len(rows)}")
        return

    config = load_config()
    if not config.api_key:
        raise SystemExit("API_FOOTBALL_KEY is required for --execute.")
    client = ApiFootballClient(config)
    synced_players = 0
    with db_connection() as conn:
        rows = load_team_seasons(conn, only_current=args.only_current, limit=args.limit)
        print(f"Team-season rows to sync: {len(rows)}")
        for index, row in enumerate(rows, start=1):
            row_count = 0
            for player_row in fetch_players_for_team_season(client, row):
                if sync_player_profile_row(conn, row, player_row):
                    row_count += 1
            conn.commit()
            synced_players += row_count
            print(
                f"[{index}/{len(rows)}] {row.competition_name} {row.season_year} "
                f"{row.team_name}: {row_count} player rows"
            )
        if not args.no_cleanup:
            apply_player_null_cleanup(conn)
            conn.commit()
            print("Applied player null cleanup fallback values.")
    budget = client.budget.load()
    print(f"Synced player rows: {synced_players}")
    print(f"Request budget used: {budget.get('used', 0)}/{budget.get('usable_limit', 0)}")


if __name__ == "__main__":
    main()
