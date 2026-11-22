#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCRIPT_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from api_football.client import ApiFootballClient, ApiFootballRateLimit
from api_football.config import load_config
from api_football.image_downloader import backend_asset_target, download_image, relative_asset_path
from api_football.rate_limit import RequestBudgetExceeded
from api_football.storage import db_connection, table_columns, table_exists
from api_football.sync.backfill_big5_2015_2026 import (
    LeagueSeason,
    sync_fixture_detail,
    sync_players_for_league_season,
    sync_team_season_statistics,
)
from api_football.sync.sync_player_profiles import (
    TeamSeason as PlayerTeamSeason,
    fetch_players_for_team_season,
    sync_player_profile_row,
    apply_player_null_cleanup,
)
from api_football.sync.sync_countries import sync_countries
from api_football.sync.sync_fixtures import sync_fixtures
from api_football.sync.sync_standings import sync_standings
from api_football.sync.sync_teams import sync_teams


CHECKPOINT_NAME = "api_football_missing_data_checkpoint.json"
REPORT_NAME = "api_football_missing_data_report.md"
MEDIA_BASE_URL = "https://media.api-sports.io/football"


@dataclass(frozen=True)
class CompetitionSeason:
    league_api_id: int
    competition_id: int
    competition_season_id: int
    season_id: int | None
    season_year: int
    name: str


def checkpoint_path(config) -> Path:
    return config.report_file.parent / CHECKPOINT_NAME


def report_path(config) -> Path:
    return config.report_file.parent / REPORT_NAME


def load_checkpoint(path: Path) -> dict[str, Any]:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {"completed": {}}
    completed = data.setdefault("completed", {})
    for key in ["countries", "images", "teams", "fixtures", "standings", "squads", "club_squads", "players", "team_stats", "match_details"]:
        completed.setdefault(key, [] if key != "countries" else False)
    return data


def save_checkpoint(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def should_stop(client: ApiFootballClient, start_used: int, max_requests: int | None) -> bool:
    if max_requests is None:
        return False
    return int(client.budget.load().get("used", 0)) - start_used >= max_requests


def season_key(row: CompetitionSeason | LeagueSeason) -> str:
    return f"{row.league_api_id}:{row.season_year}"


def local_asset_exists(assets_root: Path, relative_path: str | None) -> bool:
    if not relative_path or not relative_path.startswith("/assets/"):
        return False
    target = (assets_root / relative_path.removeprefix("/assets/")).resolve()
    try:
        return target.is_file() and target.stat().st_size > 0
    except OSError:
        return False


def asset_candidates(conn, table: str, id_column: str, path_column: str, category: str, url_category: str) -> list[dict[str, Any]]:
    if not table_exists(conn, table):
        return []
    columns = table_columns(conn, table)
    if id_column not in columns or path_column not in columns:
        return []
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, {id_column}, {path_column}
            FROM {table}
            WHERE {id_column} IS NOT NULL
            ORDER BY id
            """
        )
        rows = cur.fetchall()
    prefix = "competition" if table == "competitions" else table.rstrip("s")[:-1] if table == "countries" else table.rstrip("s")
    if table == "teams":
        prefix = "team"
    if table == "players":
        prefix = "player"
    if table == "venues":
        prefix = "venue"
    return [
        {
            "table": table,
            "row_id": int(row[0]),
            "api_id": int(row[1]),
            "path": row[2],
            "path_column": path_column,
            "category": category,
            "filename": f"{prefix}_{int(row[1])}.png",
            "url": f"{MEDIA_BASE_URL}/{url_category}/{int(row[1])}.png",
        }
        for row in rows
    ]


def missing_image_candidates(conn, assets_root: Path, limit: int | None = None) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    candidates.extend(asset_candidates(conn, "teams", "api_id", "logo_path", "teams", "teams"))
    candidates.extend(asset_candidates(conn, "players", "api_id", "photo_path", "players", "players"))
    candidates.extend(asset_candidates(conn, "venues", "api_id", "image_path", "venues", "venues"))
    candidates.extend(asset_candidates(conn, "competitions", "api_id", "logo", "competitions", "leagues"))
    missing = [row for row in candidates if not local_asset_exists(assets_root, row.get("path"))]
    return missing[:limit] if limit else missing


def sync_missing_images(conn, client: ApiFootballClient, *, limit: int | None = None, request_delay: float = 0.0) -> int:
    count = 0
    for row in missing_image_candidates(conn, client.config.assets_root, limit=limit):
        target = backend_asset_target(client.config.assets_root, row["category"], row["filename"])
        try:
            download_image(row["url"], target)
        except Exception as err:
            print(f"  image {row['table']}:{row['api_id']} [error]: {err}", flush=True)
            continue
        relative_path = relative_asset_path(row["category"], row["filename"])
        columns = table_columns(conn, row["table"])
        timestamp_sql = ", updated_at = CURRENT_TIMESTAMP" if "updated_at" in columns else ""
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {row['table']} SET {row['path_column']} = %s{timestamp_sql} WHERE id = %s",
                (relative_path, row["row_id"]),
            )
        count += 1
        print(f"  image {row['table']}:{row['api_id']} -> {relative_path}")
        if request_delay:
            time.sleep(request_delay)
    return count


def load_competition_seasons(conn, *, from_season: int | None = None, to_season: int | None = None) -> list[CompetitionSeason]:
    if not all(table_exists(conn, table) for table in ["competitions", "competition_seasons"]):
        return []
    params: list[Any] = []
    sql = """
        SELECT c.api_id, c.id, cs.id, s.id, cs.season_year, c.name
        FROM competitions c
        JOIN competition_seasons cs ON cs.competition_id = c.id
        LEFT JOIN seasons s ON s.name = cs.season_year::text
        WHERE c.api_id IS NOT NULL
    """
    if from_season is not None:
        sql += " AND cs.season_year >= %s"
        params.append(from_season)
    if to_season is not None:
        sql += " AND cs.season_year <= %s"
        params.append(to_season)
    sql += " ORDER BY cs.season_year DESC, c.api_id"
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [
            CompetitionSeason(
                league_api_id=int(row[0]),
                competition_id=int(row[1]),
                competition_season_id=int(row[2]),
                season_id=int(row[3]) if row[3] is not None else None,
                season_year=int(row[4]),
                name=row[5],
            )
            for row in cur.fetchall()
        ]


def needs_rows(conn, table: str, where_sql: str, params: Iterable[Any]) -> bool:
    if not table_exists(conn, table):
        return False
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {where_sql}", list(params))
        return int(cur.fetchone()[0]) == 0


def load_current_teams_missing_squads(conn, limit: int | None = None) -> list[dict[str, Any]]:
    if not all(table_exists(conn, table) for table in ["teams", "team_competition_seasons", "competition_seasons"]):
        return []
    sql = """
        SELECT DISTINCT t.id, t.api_id, t.name
        FROM teams t
        JOIN team_competition_seasons tcs ON tcs.team_id = t.id
        JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
        LEFT JOIN team_squad_players tsp ON tsp.team_id = t.id AND COALESCE(tsp.is_current, TRUE) = TRUE
        WHERE t.api_id IS NOT NULL
          AND COALESCE(cs.current, FALSE) = TRUE
          AND tsp.id IS NULL
        ORDER BY t.name
    """
    params: list[Any] = []
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [{"team_id": int(row[0]), "team_api_id": int(row[1]), "name": row[2]} for row in cur.fetchall()]


def load_club_team_seasons(conn, *, only_current: bool = True, limit: int | None = None) -> list[PlayerTeamSeason]:
    if not all(table_exists(conn, table) for table in ["teams", "competitions", "competition_seasons", "team_competition_seasons"]):
        return []
    team_columns = table_columns(conn, "teams")
    params: list[Any] = []
    sql = """
        SELECT DISTINCT
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
    if "is_national" in team_columns:
        sql += " AND COALESCE(t.is_national, FALSE) = FALSE"
    if only_current:
        sql += " AND COALESCE(cs.current, FALSE) = TRUE"
    sql += " ORDER BY cs.season_year DESC, c.api_id, t.name"
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [
            PlayerTeamSeason(
                team_id=int(row[0]),
                team_api_id=int(row[1]),
                team_name=row[2],
                competition_season_id=int(row[3]),
                competition_api_id=int(row[4]),
                competition_name=row[5],
                season_year=int(row[6]),
                is_current=bool(row[7]),
            )
            for row in cur.fetchall()
        ]


def sync_club_squads_with_player_data(
    client: ApiFootballClient,
    conn,
    checkpoint: dict[str, Any],
    checkpoint_file: Path,
    *,
    only_current: bool = True,
    force: bool = False,
    limit: int | None = None,
    skip_images: bool = False,
    request_delay: float = 0.0,
    start_used: int = 0,
    max_requests: int | None = None,
) -> dict[str, int]:
    from api_football.sync.sync_squads import sync_squad

    stats = {"team_seasons": 0, "squad_players": 0, "player_rows": 0}
    completed = checkpoint["completed"]["club_squads"]
    for row in load_club_team_seasons(conn, only_current=only_current, limit=limit):
        if should_stop(client, start_used, max_requests):
            raise RequestBudgetExceeded("Stopped at requested budget window.")
        item_key = f"{row.team_api_id}:{row.competition_api_id}:{row.season_year}"
        if not force and item_key in completed:
            continue

        squad_rows = sync_squad(client, conn, row.team_api_id, row.team_id, skip_images=skip_images)
        player_rows = 0
        for player_row in fetch_players_for_team_season(client, row):
            if sync_player_profile_row(conn, row, player_row):
                player_rows += 1

        if item_key not in completed:
            completed.append(item_key)
        conn.commit()
        save_checkpoint(checkpoint_file, checkpoint)
        stats["team_seasons"] += 1
        stats["squad_players"] += len(squad_rows)
        stats["player_rows"] += player_rows
        print(
            f"club-squad {item_key} {row.team_name}: "
            f"squad={len(squad_rows)} player_rows={player_rows}",
            flush=True,
        )
        if request_delay:
            time.sleep(request_delay)

    apply_player_null_cleanup(conn)
    conn.commit()
    return stats


def load_finished_matches_missing_details(conn, limit: int | None = None) -> list[dict[str, Any]]:
    if not table_exists(conn, "matches"):
        return []
    detail_checks = []
    for table in ["match_events", "match_team_statistics", "match_lineups", "match_player_statistics"]:
        if table_exists(conn, table):
            detail_checks.append(f"NOT EXISTS (SELECT 1 FROM {table} d WHERE d.match_id = m.id)")
    if not detail_checks:
        return []
    sql = f"""
        SELECT
            m.id,
            m.api_id,
            m.home_team_id,
            m.away_team_id,
            m.round,
            c.api_id,
            c.id,
            cs.id,
            s.id,
            cs.season_year,
            c.name
        FROM matches m
        JOIN competition_seasons cs ON cs.id = m.competition_season_id
        JOIN competitions c ON c.id = cs.competition_id
        LEFT JOIN seasons s ON s.name = cs.season_year::text
        WHERE m.api_id IS NOT NULL
          AND m.home_team_id IS NOT NULL
          AND m.away_team_id IS NOT NULL
          AND COALESCE(m.status_short, m.status, '') IN ('FT', 'AET', 'PEN')
          AND ({' OR '.join(detail_checks)})
        ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
    """
    params: list[Any] = []
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [
            {
                "match": {
                    "match_id": int(row[0]),
                    "fixture_api_id": int(row[1]),
                    "home_team_id": int(row[2]),
                    "away_team_id": int(row[3]),
                    "round": row[4],
                },
                "league_season": LeagueSeason(
                    league_api_id=int(row[5]),
                    competition_id=int(row[6]),
                    competition_season_id=int(row[7]),
                    season_id=int(row[8]) if row[8] is not None else 0,
                    season_year=int(row[9]),
                    name=row[10],
                ),
            }
            for row in cur.fetchall()
        ]


def audit(conn, config, path: Path) -> dict[str, int]:
    counts = {
        "missing_images": len(missing_image_candidates(conn, config.assets_root)),
        "competition_seasons": len(load_competition_seasons(conn)),
        "current_teams_missing_squads": len(load_current_teams_missing_squads(conn)),
        "finished_matches_missing_details": len(load_finished_matches_missing_details(conn)),
    }
    lines = ["# Missing Data Backfill Report", "", f"Generated: {datetime.now(timezone.utc).isoformat()}", ""]
    lines.append("## Audit")
    for name, value in counts.items():
        lines.append(f"- {name}: {value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return counts


def run(args) -> None:
    if args.ignore_budget:
        os.environ["API_FOOTBALL_IGNORE_BUDGET"] = "1"

    config = load_config()
    checkpoint_file = checkpoint_path(config)
    checkpoint = load_checkpoint(checkpoint_file)
    client = ApiFootballClient(config)
    start_used = int(client.budget.load().get("used", 0))

    if args.execute and not config.api_key and args.phase in {"all", "core", "squads", "club-squads", "players", "team-stats", "match-details"}:
        raise SystemExit("API_FOOTBALL_KEY is required for API sync phases.")

    with db_connection() as conn:
        counts = audit(conn, config, report_path(config))
        if not args.execute:
            print("Dry run only. Use --execute to download/write missing data.")
            print(json.dumps(counts, indent=2))
            print(f"report: {report_path(config)}")
            return

        if args.phase in {"all", "core"} and not checkpoint["completed"]["countries"]:
            countries = sync_countries(client, conn, skip_images=args.skip_images)
            checkpoint["completed"]["countries"] = True
            conn.commit()
            save_checkpoint(checkpoint_file, checkpoint)
            print(f"countries: {len(countries)}")

        if args.phase in {"all", "images"}:
            count = sync_missing_images(conn, client, limit=args.limit, request_delay=args.request_delay)
            conn.commit()
            print(f"images: {count}")

        competition_seasons = load_competition_seasons(conn, from_season=args.from_season, to_season=args.to_season)
        for row in competition_seasons:
            item_key = season_key(row)
            if should_stop(client, start_used, args.max_requests):
                raise RequestBudgetExceeded("Stopped at requested budget window.")

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["teams"]:
                if needs_rows(conn, "team_competition_seasons", "competition_season_id = %s", [row.competition_season_id]):
                    teams = sync_teams(
                        client,
                        conn,
                        row.league_api_id,
                        row.season_year,
                        row.competition_id,
                        row.season_id,
                        row.competition_season_id,
                        skip_images=args.skip_images,
                    )
                    print(f"teams {item_key}: {len(teams)}")
                checkpoint["completed"]["teams"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["fixtures"]:
                if needs_rows(conn, "matches", "competition_season_id = %s", [row.competition_season_id]):
                    fixtures = sync_fixtures(
                        client,
                        conn,
                        row.league_api_id,
                        row.season_year,
                        row.competition_id,
                        row.season_id or 0,
                        row.competition_season_id,
                    )
                    print(f"fixtures {item_key}: {len(fixtures)}")
                checkpoint["completed"]["fixtures"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)

            if args.phase in {"all", "core"} and item_key not in checkpoint["completed"]["standings"]:
                if needs_rows(conn, "standings", "competition_season_id = %s", [row.competition_season_id]):
                    standings = sync_standings(client, conn, row.league_api_id, row.season_year, row.competition_season_id)
                    print(f"standings {item_key}: {len(standings)}")
                checkpoint["completed"]["standings"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)

            league_season = LeagueSeason(
                league_api_id=row.league_api_id,
                competition_id=row.competition_id,
                competition_season_id=row.competition_season_id,
                season_id=row.season_id or 0,
                season_year=row.season_year,
                name=row.name,
            )

            if args.phase in {"all", "team-stats"} and item_key not in checkpoint["completed"]["team_stats"]:
                if needs_rows(conn, "team_season_statistics", "competition_season_id = %s", [row.competition_season_id]):
                    count = sync_team_season_statistics(client, conn, league_season)
                    print(f"team-stats {item_key}: {count}")
                checkpoint["completed"]["team_stats"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)

            if args.phase in {"all", "players"} and item_key not in checkpoint["completed"]["players"]:
                if needs_rows(conn, "player_season_statistics", "competition_season_id = %s", [row.competition_season_id]):
                    count = sync_players_for_league_season(client, conn, league_season)
                    print(f"players {item_key}: {count}")
                checkpoint["completed"]["players"].append(item_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)

        if args.phase in {"all", "squads"}:
            from api_football.sync.sync_squads import sync_squad

            for team in load_current_teams_missing_squads(conn, limit=args.limit):
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
                team_key = str(team["team_api_id"])
                if team_key in checkpoint["completed"]["squads"]:
                    continue
                rows = sync_squad(client, conn, team["team_api_id"], team["team_id"], skip_images=args.skip_images)
                checkpoint["completed"]["squads"].append(team_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"squad {team_key}: {len(rows)}")

        if args.phase in {"all", "club-squads"}:
            stats = sync_club_squads_with_player_data(
                client,
                conn,
                checkpoint,
                checkpoint_file,
                only_current=not args.all_seasons,
                force=args.force,
                limit=args.limit,
                skip_images=args.skip_images,
                request_delay=args.request_delay,
                start_used=start_used,
                max_requests=args.max_requests,
            )
            print(f"club-squads: {stats}")

        if args.phase in {"all", "match-details"}:
            for row in load_finished_matches_missing_details(conn, limit=args.limit):
                if should_stop(client, start_used, args.max_requests):
                    raise RequestBudgetExceeded("Stopped at requested budget window.")
                match_key = str(row["match"]["fixture_api_id"])
                if match_key in checkpoint["completed"]["match_details"]:
                    continue
                stats = sync_fixture_detail(client, conn, row["league_season"], row["match"])
                checkpoint["completed"]["match_details"].append(match_key)
                conn.commit()
                save_checkpoint(checkpoint_file, checkpoint)
                print(f"fixture {match_key}: {stats}")
                if args.request_delay:
                    time.sleep(args.request_delay)

        counts = audit(conn, config, report_path(config))
        print(json.dumps(counts, indent=2))
        print(f"checkpoint: {checkpoint_file}")
        print(f"report: {report_path(config)}")
        budget = client.budget.load()
        print(f"budget: {budget.get('used')}/{budget.get('usable_limit')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill missing API-Football images, teams, fixtures, squads, players, stats, and match details.")
    parser.add_argument("--execute", action="store_true", help="Perform downloads, API calls, and database writes.")
    parser.add_argument("--phase", choices=["all", "images", "core", "squads", "club-squads", "players", "team-stats", "match-details"], default="all")
    parser.add_argument("--from-season", type=int, help="Only process competition seasons from this year.")
    parser.add_argument("--to-season", type=int, help="Only process competition seasons through this year.")
    parser.add_argument("--max-requests", type=int, help="Stop after this many API-Football requests in this run.")
    parser.add_argument("--ignore-budget", action="store_true", help="Bypass the local API-Football request budget file.")
    parser.add_argument("--all-seasons", action="store_true", help="For club-squads, process every stored club season instead of current seasons only.")
    parser.add_argument("--force", action="store_true", help="For club-squads, resync rows even if checkpoint says they are complete.")
    parser.add_argument("--limit", type=int, help="Limit image, squad, or match-detail rows for a small run.")
    parser.add_argument("--request-delay", type=float, default=0.0, help="Sleep between image/detail rows.")
    parser.add_argument("--skip-images", action="store_true", help="Skip image downloads inside API sync helpers.")
    args = parser.parse_args()
    try:
        run(args)
    except (RequestBudgetExceeded, ApiFootballRateLimit) as err:
        print(f"Stopped safely: {err}")


if __name__ == "__main__":
    main()
