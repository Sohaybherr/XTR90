from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from datetime import date
from typing import Any

from scripts.api_football.client import ApiFootballClient
from scripts.api_football.storage import db_connection, find_id_by_api_id, upsert_by_api_id


TRANSFER_TYPE_MAP = {
    "loan": "loan",
    "end of loan": "loan",
    "free": "free",
    "free transfer": "free",
    "permanent": "permanent",
    "transfer": "permanent",
    "n/a": "unknown",
}

TOP_FIVE_LEAGUE_API_IDS = (39, 140, 135, 78, 61)
DEFAULT_FROM_YEAR = 2020
WITHOUT_CLUB_API_ID = -900001
UNKNOWN_CLUB_API_ID = -900002


@dataclass(frozen=True)
class TransferCandidate:
    player_id: int | None
    player_api_id: int | None
    player_name: str | None
    from_team_id: int | None
    from_team_api_id: int | None
    to_team_id: int | None
    to_team_api_id: int | None
    transfer_type: str
    transfer_date: str | None
    raw: dict[str, Any]
    transfer_fee: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synchronize player transfers from API-Football.")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--team-id", type=int, help="Sync one local team id.")
    scope.add_argument("--team-api-id", type=int, help="Sync one API-Football team id.")
    scope.add_argument("--player-id", type=int, help="Sync one local player id.")
    scope.add_argument("--player-api-id", type=int, help="Sync one API-Football player id.")
    parser.add_argument(
        "--league-api-id",
        action="append",
        type=int,
        help="Restrict default team scan to one API-Football league id. Repeatable. Defaults to the top 5 leagues.",
    )
    parser.add_argument("--all-teams", action="store_true", help="Scan every local API-Football team instead of top 5 league teams only.")
    parser.add_argument("--sleep", type=float, default=0.25, help="Delay between API requests. Default: 0.25 seconds.")
    parser.add_argument("--year", type=int, help="Only import transfers from this calendar year. Overrides --from-year and --to-year.")
    parser.add_argument("--from-year", type=int, default=DEFAULT_FROM_YEAR, help="Import transfers from this calendar year onward. Default: 2020.")
    parser.add_argument("--to-year", type=int, default=date.today().year, help="Import transfers up to this calendar year. Default: current year.")
    parser.add_argument("--all-years", action="store_true", help="Import every dated transfer returned by API-Football.")
    parser.add_argument("--update-existing", action="store_true", help="Update matching transfer rows. Default: skip existing transfers.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and map data without writing rows.")
    parser.add_argument("--ignore-budget", action="store_true", help="Disable local request-budget enforcement.")
    args = parser.parse_args()
    if args.year:
        args.from_year = args.year
        args.to_year = args.year
    if args.from_year > args.to_year:
        parser.error("--from-year must be less than or equal to --to-year")
    return args


def normalize_transfer_type(value: Any) -> str:
    text = str(value or "").strip().lower()
    if normalize_transfer_fee(text) > 0:
        return "permanent"
    return TRANSFER_TYPE_MAP.get(text, "unknown")


def normalize_transfer_fee(value: Any) -> int:
    if value in (None, "", "N/A"):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text = str(value).strip().lower()
    if text in ("unknown", "undisclosed", "n/a"):
        return 0
    numeric_text = "".join(character for character in text if character.isdigit() or character == ".")
    if not numeric_text:
        return 0
    amount = float(numeric_text)
    if "bn" in text or "b" in text:
        amount *= 1_000_000_000
    elif "m" in text:
        amount *= 1_000_000
    elif "k" in text:
        amount *= 1_000
    return max(0, int(amount))


def team_api_id(team: dict[str, Any] | None) -> int | None:
    value = team.get("id") if isinstance(team, dict) else None
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def player_api_id(player: dict[str, Any] | None) -> int | None:
    value = player.get("id") if isinstance(player, dict) else None
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def ensure_player(conn, player: dict[str, Any] | None) -> int | None:
    api_id = player_api_id(player)
    if not api_id:
        return None

    existing_id = find_id_by_api_id(conn, "players", api_id)
    if existing_id:
        return existing_id

    name = str((player or {}).get("name") or "").strip() or f"Player {api_id}"
    return upsert_by_api_id(
        conn,
        "players",
        {
            "api_id": api_id,
            "name": name,
            "photo_path": f"/assets/players/player_{api_id}.png" if (player or {}).get("photo") else None,
        },
    )


def ensure_team(conn, team: dict[str, Any] | None) -> int | None:
    api_id = team_api_id(team)
    if not api_id:
        return None

    existing_id = find_id_by_api_id(conn, "teams", api_id)
    if existing_id:
        return existing_id

    name = str((team or {}).get("name") or "").strip() or f"Team {api_id}"
    return upsert_by_api_id(
        conn,
        "teams",
        {
            "api_id": api_id,
            "name": name,
            "logo_path": f"/assets/teams/team_{api_id}.png" if (team or {}).get("logo") else None,
        },
    )


def ensure_placeholder_team(conn, api_id: int, name: str, code: str) -> int:
    existing_id = find_id_by_api_id(conn, "teams", api_id)
    if existing_id:
        return existing_id

    return upsert_by_api_id(
        conn,
        "teams",
        {
            "api_id": api_id,
            "name": name,
            "short_name": name,
            "code": code,
            "is_national": False,
            "national": False,
        },
    )


def normalize_response_item(conn, item: dict[str, Any]) -> list[TransferCandidate]:
    player = item.get("player") if isinstance(item.get("player"), dict) else {}
    player_api = player_api_id(player)
    local_player_id = ensure_player(conn, player)
    transfers = item.get("transfers") if isinstance(item.get("transfers"), list) else []
    rows: list[TransferCandidate] = []

    for transfer in transfers:
        if not isinstance(transfer, dict):
            continue
        teams = transfer.get("teams") if isinstance(transfer.get("teams"), dict) else {}
        from_team = teams.get("out") if isinstance(teams.get("out"), dict) else {}
        to_team = teams.get("in") if isinstance(teams.get("in"), dict) else {}
        from_api = team_api_id(from_team)
        to_api = team_api_id(to_team)
        from_team_id = ensure_team(conn, from_team)
        to_team_id = ensure_team(conn, to_team)

        if not from_team_id:
            from_team_name = str(from_team.get("name") or "").strip().lower()
            placeholder_name = "Without Club" if from_team_name == "without club" else "Unknown Club"
            placeholder_api_id = WITHOUT_CLUB_API_ID if placeholder_name == "Without Club" else UNKNOWN_CLUB_API_ID
            from_team_id = ensure_placeholder_team(conn, placeholder_api_id, placeholder_name, "NCL" if placeholder_name == "Without Club" else "UNK")
        if not to_team_id:
            to_team_name = str(to_team.get("name") or "").strip().lower()
            placeholder_name = "Without Club" if to_team_name == "without club" else "Unknown Club"
            placeholder_api_id = WITHOUT_CLUB_API_ID if placeholder_name == "Without Club" else UNKNOWN_CLUB_API_ID
            to_team_id = ensure_placeholder_team(conn, placeholder_api_id, placeholder_name, "NCL" if placeholder_name == "Without Club" else "UNK")

        rows.append(
            TransferCandidate(
                player_id=local_player_id,
                player_api_id=player_api,
                player_name=player.get("name"),
                from_team_id=from_team_id,
                from_team_api_id=from_api,
                to_team_id=to_team_id,
                to_team_api_id=to_api,
                transfer_type=normalize_transfer_type(transfer.get("type")),
                transfer_date=transfer.get("date"),
                raw=transfer,
                transfer_fee=normalize_transfer_fee(transfer.get("fee") or transfer.get("value") or transfer.get("type")),
            )
        )

    return rows


def transfer_matches_year_window(candidate: TransferCandidate, args: argparse.Namespace) -> bool:
    if args.all_years:
        return True
    if not candidate.transfer_date:
        return False
    try:
        transfer_year = int(str(candidate.transfer_date)[:4])
    except ValueError:
        return False
    return args.from_year <= transfer_year <= args.to_year


def get_sync_targets(conn, args: argparse.Namespace) -> list[tuple[str, int]]:
    with conn.cursor() as cur:
        if args.team_id:
            cur.execute("SELECT api_id FROM teams WHERE id = %s AND api_id IS NOT NULL", (args.team_id,))
            row = cur.fetchone()
            return [("team", int(row[0]))] if row else []
        if args.team_api_id:
            return [("team", args.team_api_id)]
        if args.player_id:
            cur.execute("SELECT api_id FROM players WHERE id = %s AND api_id IS NOT NULL", (args.player_id,))
            row = cur.fetchone()
            return [("player", int(row[0]))] if row else []
        if args.player_api_id:
            return [("player", args.player_api_id)]

        if args.all_teams:
            cur.execute(
                """
                SELECT api_id
                FROM teams
                WHERE api_id IS NOT NULL
                ORDER BY api_synced_at NULLS FIRST, id
                """
            )
        else:
            league_api_ids = tuple(args.league_api_id or TOP_FIVE_LEAGUE_API_IDS)
            cur.execute(
                """
                SELECT DISTINCT t.api_id, t.name
                FROM teams t
                JOIN team_competition_seasons tcs ON tcs.team_id = t.id
                JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
                JOIN competitions c ON c.id = cs.competition_id
                WHERE t.api_id IS NOT NULL
                  AND c.api_id = ANY(%s)
                ORDER BY t.name
                """,
                (list(league_api_ids),),
            )
        return [("team", int(row[0])) for row in cur.fetchall()]


def fetch_transfers(client: ApiFootballClient, target_type: str, api_id: int) -> list[dict[str, Any]]:
    payload = client.get("transfers", {target_type: api_id})
    response = payload.get("response")
    return response if isinstance(response, list) else []


def upsert_transfer(conn, candidate: TransferCandidate, update_existing: bool = False) -> str:
    if not candidate.player_id:
        return "skipped_missing_player"
    if not candidate.transfer_date:
        return "skipped_missing_date"
    if not candidate.from_team_id and not candidate.to_team_id:
        return "skipped_missing_teams"

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, transfer_fee
            FROM player_transfers
            WHERE player_id = %s
              AND COALESCE(from_team_id, -1) = COALESCE(%s, -1)
              AND COALESCE(to_team_id, -1) = COALESCE(%s, -1)
              AND COALESCE(transfer_date, DATE '0001-01-01') = COALESCE(%s::date, DATE '0001-01-01')
            LIMIT 1
            """,
            (candidate.player_id, candidate.from_team_id, candidate.to_team_id, candidate.transfer_date),
        )
        existing = cur.fetchone()
        if existing:
            if not update_existing:
                existing_fee = int(existing[1] or 0)
                if existing_fee <= 0 and candidate.transfer_fee > 0:
                    cur.execute(
                        """
                        UPDATE player_transfers
                        SET transfer_type = CASE
                                WHEN transfer_type IS NULL OR transfer_type = 'unknown' THEN %s
                                ELSE transfer_type
                            END,
                            transfer_fee = %s,
                            api_updated_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        """,
                        (candidate.transfer_type, candidate.transfer_fee, existing[0]),
                    )
                    return "fee_updated"
                return "skipped_existing"
            cur.execute(
                """
                UPDATE player_transfers
                SET transfer_type = COALESCE(%s, transfer_type),
                    transfer_fee = COALESCE(%s, transfer_fee, 0),
                    api_updated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (candidate.transfer_type, candidate.transfer_fee, existing[0]),
            )
            return "updated"

        cur.execute(
            """
            INSERT INTO player_transfers (
                player_id,
                from_team_id,
                to_team_id,
                transfer_type,
                transfer_fee,
                transfer_date,
                api_synced_at,
                api_updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            (
                candidate.player_id,
                candidate.from_team_id,
                candidate.to_team_id,
                candidate.transfer_type,
                candidate.transfer_fee,
                candidate.transfer_date,
            ),
        )
        return "inserted"


def sync_transfers(args: argparse.Namespace) -> dict[str, Any]:
    client = ApiFootballClient()
    if args.ignore_budget:
        client.budget.assert_available = lambda _count=1: None

    stats: dict[str, Any] = {
        "targets": 0,
        "scope": "all teams" if args.all_teams else f"top 5 leagues {list(args.league_api_id or TOP_FIVE_LEAGUE_API_IDS)}",
        "requests": 0,
        "providerRows": 0,
        "normalized": 0,
        "inserted": 0,
        "updated": 0,
        "feeUpdated": 0,
        "skippedExisting": 0,
        "years": "all" if args.all_years else f"{args.from_year}-{args.to_year}",
        "mode": "update existing transfers" if args.update_existing else "skip existing transfers",
        "skippedMissingPlayer": 0,
        "skippedMissingDate": 0,
        "skippedMissingTeams": 0,
        "skippedOutsideYear": 0,
        "dryRunCandidates": 0,
        "errors": [],
    }

    with db_connection() as conn:
        targets = get_sync_targets(conn, args)
        stats["targets"] = len(targets)

        for index, (target_type, api_id) in enumerate(targets, start=1):
            try:
                print(f"[{index}/{len(targets)}] Fetching transfers for {target_type} api_id={api_id}")
                response_items = fetch_transfers(client, target_type, api_id)
                stats["requests"] += 1
                stats["providerRows"] += len(response_items)

                candidates: list[TransferCandidate] = []
                for item in response_items:
                    candidates.extend(normalize_response_item(conn, item))
                stats["normalized"] += len(candidates)

                for candidate in candidates:
                    if not transfer_matches_year_window(candidate, args):
                        stats["skippedOutsideYear"] += 1
                        continue
                    if args.dry_run:
                        action = "dry_run"
                    else:
                        action = upsert_transfer(conn, candidate, update_existing=args.update_existing)
                    if action == "inserted":
                        stats["inserted"] += 1
                    elif action == "updated":
                        stats["updated"] += 1
                    elif action == "fee_updated":
                        stats["feeUpdated"] += 1
                    elif action == "skipped_existing":
                        stats["skippedExisting"] += 1
                    elif action == "dry_run":
                        stats["dryRunCandidates"] += 1
                    elif action == "skipped_missing_player":
                        stats["skippedMissingPlayer"] += 1
                    elif action == "skipped_missing_date":
                        stats["skippedMissingDate"] += 1
                    elif action == "skipped_missing_teams":
                        stats["skippedMissingTeams"] += 1

                if args.sleep > 0 and index < len(targets):
                    time.sleep(args.sleep)
            except Exception as error:  # noqa: BLE001 - this is a batch sync script.
                stats["errors"].append({"targetType": target_type, "apiId": api_id, "error": str(error)})
                print(f"Error for {target_type} api_id={api_id}: {error}")

    return stats


def main() -> None:
    args = parse_args()
    stats = sync_transfers(args)
    print("API-Football transfer sync complete.")
    print(json.dumps(stats, indent=2, ensure_ascii=True))
    if not stats["inserted"] and not stats["updated"] and not stats["feeUpdated"]:
        if stats["providerRows"] == 0:
            print("No transfers were written because API-Football returned no transfer rows for the selected targets.")
        elif stats["skippedOutsideYear"] >= stats["normalized"]:
            print(f"No transfers were written because all returned transfers were outside {stats['years']}. Use --from-year YYYY, --to-year YYYY, or --all-years if needed.")
        elif stats["skippedExisting"]:
            print("No transfers were written because matching transfer rows already exist.")
        else:
            print("No transfers were written. Check skippedMissingPlayer, skippedMissingTeams, skippedMissingDate, and errors above.")
    if stats["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
