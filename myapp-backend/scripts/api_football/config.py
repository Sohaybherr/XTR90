from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BACKEND_DIR / ".env"
DEFAULT_BASE_URL = "https://v3.football.api-sports.io"


@dataclass(frozen=True)
class ApiFootballConfig:
    api_key: str
    base_url: str
    budget_file: Path
    checkpoint_file: Path
    report_file: Path
    log_file: Path
    assets_root: Path
    daily_limit: int = 7500
    safety_reserve: int = 50


def load_config() -> ApiFootballConfig:
    load_dotenv(ENV_PATH)
    api_key = os.getenv("API_FOOTBALL_KEY", "")
    base_url = os.getenv("API_FOOTBALL_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    daily_limit = int(os.getenv("API_FOOTBALL_DAILY_LIMIT") or "7500")
    safety_reserve = int(os.getenv("API_FOOTBALL_SAFETY_RESERVE") or "50")
    budget_file = BACKEND_DIR / "data" / "api_football_request_budget.json"
    assets_root = Path(os.getenv("ASSETS_ROOT") or BACKEND_DIR / "src" / "public" / "assets")
    if not assets_root.is_absolute():
        assets_root = BACKEND_DIR / assets_root
    return ApiFootballConfig(
        api_key=api_key,
        base_url=base_url,
        budget_file=budget_file,
        checkpoint_file=BACKEND_DIR / "data" / "api_football_sync_checkpoint.json",
        report_file=BACKEND_DIR / "data" / "api_football_bootstrap_report.md",
        log_file=BACKEND_DIR / "logs" / "api_football_sync.log",
        assets_root=assets_root,
        daily_limit=daily_limit,
        safety_reserve=safety_reserve,
    )
