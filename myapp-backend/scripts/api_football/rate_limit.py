from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


class RequestBudgetExceeded(RuntimeError):
    pass


@dataclass
class RequestBudget:
    path: Path
    daily_limit: int = 100
    safety_reserve: int = 7

    @property
    def usable_limit(self) -> int:
        return self.daily_limit - self.safety_reserve

    def load(self) -> dict:
        today = date.today().isoformat()
        if not self.path.exists():
            return self._new_day(today)

        raw = self.path.read_text(encoding="utf-8")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            decoder = json.JSONDecoder()
            data, _ = decoder.raw_decode(raw)
            self.save(data)
        if data.get("date") != today:
            return self._new_day(today)
        data.setdefault("used", 0)
        data["daily_limit"] = self.daily_limit
        data["safety_reserve"] = self.safety_reserve
        data["usable_limit"] = int(data["daily_limit"]) - int(data["safety_reserve"])
        data.setdefault("requests", [])
        return data

    def _new_day(self, today: str) -> dict:
        return {
            "date": today,
            "daily_limit": self.daily_limit,
            "safety_reserve": self.safety_reserve,
            "usable_limit": self.usable_limit,
            "used": 0,
            "requests": [],
        }

    def save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=self.path.parent, delete=False) as handle:
            handle.write(json.dumps(data, indent=2))
            temp_path = Path(handle.name)
        temp_path.replace(self.path)

    def remaining(self) -> int:
        if os.getenv("API_FOOTBALL_IGNORE_BUDGET") == "1":
            return 10**12
        data = self.load()
        return int(data["usable_limit"]) - int(data["used"])

    def assert_available(self, request_count: int = 1) -> None:
        if os.getenv("API_FOOTBALL_IGNORE_BUDGET") == "1":
            return
        data = self.load()
        if int(data["used"]) + request_count > int(data["usable_limit"]):
            raise RequestBudgetExceeded(
                f"API-Football usable request budget exceeded: {data['used']}/{data['usable_limit']} used"
            )

    def consume(
        self,
        request_count: int = 1,
        *,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        status: int | str = "unknown",
        success: bool,
        error: str | None = None,
    ) -> dict:
        if os.getenv("API_FOOTBALL_IGNORE_BUDGET") == "1":
            return {
                "date": date.today().isoformat(),
                "daily_limit": self.daily_limit,
                "safety_reserve": self.safety_reserve,
                "usable_limit": self.usable_limit,
                "used": 0,
                "requests": [],
            }
        self.assert_available(request_count)
        data = self.load()
        data["used"] = int(data["used"]) + request_count
        data["requests"].append(
            {
                "endpoint": endpoint,
                "params": params or {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": status,
                "success": success,
                "error": error,
            }
        )
        self.save(data)
        return data
