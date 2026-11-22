from __future__ import annotations

import re
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional


def api_image_filename(prefix: str, api_id: int, source_url: str) -> str:
    suffix = Path(source_url.split("?", 1)[0]).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{2,5}", suffix or ""):
        suffix = ".png"
    return f"{prefix}_{api_id}{suffix}"


def relative_asset_path(category: str, filename: str) -> str:
    return f"/assets/{category.strip('/')}/{filename}"


def backend_asset_target(assets_root: Path, category: str, filename: str) -> Path:
    root = assets_root.resolve()
    target = (root / category.strip("/") / filename).resolve()
    if root not in target.parents and target != root:
        raise RuntimeError(f"Refusing to save image outside backend assets root: {target}")
    return target


def download_image(source_url: str, target_path: Path, user_agent: Optional[str] = None, retries: int = 2) -> Path:
    if target_path.exists() and target_path.stat().st_size > 0:
        return target_path

    target_path.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(
                source_url,
                headers={"User-Agent": user_agent or "375scores-api-football-sync/1.0"},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                content_type = response.headers.get("Content-Type", "")
                if content_type and not content_type.startswith("image/"):
                    raise RuntimeError(f"Expected image content, got {content_type}")
                target_path.write_bytes(response.read())
            return target_path
        except (TimeoutError, urllib.error.URLError, RuntimeError) as err:
            last_error = err
            time.sleep(min(2 ** attempt, 4))
    raise RuntimeError(f"Image download failed for {source_url}: {last_error}")
