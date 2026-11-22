from __future__ import annotations

from typing import Any, Dict, Iterable, List

from ..client import ApiFootballClient


def fetch_target_leagues(client: ApiFootballClient, target_league_ids: Iterable[int]) -> List[Dict[str, Any]]:
    target_ids = set(int(item) for item in target_league_ids)
    payload = client.get("/leagues")
    rows = payload.get("response") or []
    return [row for row in rows if int((row.get("league") or {}).get("id") or 0) in target_ids]
