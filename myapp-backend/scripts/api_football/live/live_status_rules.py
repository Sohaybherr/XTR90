from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


FINAL_STATUSES = {"FT", "AET", "PEN"}
STOP_STATUSES = {"CANC", "ABD", "AWD", "WO"}
POSTPONED_STATUSES = {"PST"}
LIVE_STATUSES = {"1H", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"}
HALFTIME_STATUSES = {"HT"}
EXTRA_TIME_STATUSES = {"ET", "BT", "P"}


@dataclass(frozen=True)
class SyncDecision:
    action: str
    next_sync_in: timedelta | None
    reason: str


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def status_short(match: dict[str, Any]) -> str:
    return str(match.get("status_short") or match.get("status") or "").upper()


def is_final_status(status: str) -> bool:
    return status.upper() in FINAL_STATUSES


def is_stop_status(status: str) -> bool:
    return status.upper() in STOP_STATUSES


def is_postponed_status(status: str) -> bool:
    return status.upper() in POSTPONED_STATUSES


def is_live_status(status: str) -> bool:
    return status.upper() in LIVE_STATUSES or status.upper() in HALFTIME_STATUSES


def next_sync_at(decision: SyncDecision, now: datetime | None = None) -> datetime | None:
    if decision.next_sync_in is None:
        return None
    return (now or utcnow()) + decision.next_sync_in


def decide_next_action(match: dict[str, Any], now: datetime | None = None) -> SyncDecision:
    now = now or utcnow()
    status = status_short(match)
    kickoff_at = parse_datetime(match.get("kickoff_at") or match.get("match_date"))
    final_stage = match.get("final_sync_stage")
    lineup_count = int(match.get("lineup_count") or 0)

    if match.get("fully_synced"):
        return SyncDecision("stop", None, "fully_synced")

    if is_stop_status(status):
        return SyncDecision("stop_cancelled", None, f"stop_status:{status}")

    if is_postponed_status(status):
        return SyncDecision("fixture_check", timedelta(hours=6), "postponed")

    if is_final_status(status):
        if final_stage in {None, "", "detected"}:
            return SyncDecision("post_match_now", timedelta(minutes=5), "final_detected")
        if final_stage == "after_5m":
            return SyncDecision("post_match_15m", timedelta(minutes=10), "final_after_5m")
        if final_stage == "after_15m":
            return SyncDecision("post_match_1h", timedelta(minutes=45), "final_after_15m")
        if final_stage == "verified":
            return SyncDecision("mark_fully_synced", None, "final_verified")
        return SyncDecision("post_match_now", timedelta(minutes=5), "final_unknown_stage")

    if status in HALFTIME_STATUSES:
        return SyncDecision("live_global", timedelta(seconds=3), "halftime")

    if status in LIVE_STATUSES or status in EXTRA_TIME_STATUSES:
        return SyncDecision("live_global", timedelta(seconds=3), "live")

    if kickoff_at is None:
        return SyncDecision("fixture_check", timedelta(hours=12), "missing_kickoff")

    minutes_to_kickoff = (kickoff_at - now).total_seconds() / 60

    if minutes_to_kickoff > 24 * 60:
        return SyncDecision("daily_only", None, "more_than_24h")

    if 170 <= minutes_to_kickoff <= 190:
        return SyncDecision("fixture_check", timedelta(hours=2), "t_minus_3h")

    if 55 <= minutes_to_kickoff <= 70:
        return SyncDecision("fixture_check", timedelta(minutes=15), "t_minus_1h")

    if 0 < minutes_to_kickoff <= 45 and lineup_count < 2 and not match.get("lineups_unavailable"):
        return SyncDecision("lineups", timedelta(minutes=10), "lineups_phase")

    if -5 <= minutes_to_kickoff <= 45:
        return SyncDecision("live_global", timedelta(seconds=3), "kickoff_window")

    if 0 < minutes_to_kickoff <= 180:
        return SyncDecision("fixture_check", timedelta(minutes=30), "pre_match")

    return SyncDecision("fixture_check", timedelta(hours=6), "default")
