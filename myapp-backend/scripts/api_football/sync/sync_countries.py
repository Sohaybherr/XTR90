from __future__ import annotations

from typing import Any, Dict, List

from ..client import ApiFootballClient
from ..image_downloader import backend_asset_target, download_image, relative_asset_path
from ..mappers.country_mapper import map_country
from ..storage import upsert_country


def sync_countries(client: ApiFootballClient, conn, *, skip_images: bool = False) -> List[Dict[str, Any]]:
    payload = client.get("/countries")
    rows = payload.get("response") or []
    synced = []
    for item in rows:
        values = map_country(item)
        code = values.get("code")
        if not code:
            print(f"Warning: skipped country with unsupported code for current schema: {item.get('name')}")
            continue
        flag_url = item.get("flag")
        if code and flag_url and not skip_images:
            filename = f"flag_{str(code).lower()}.png"
            try:
                download_image(flag_url, backend_asset_target(client.config.assets_root, "flags", filename))
                values["flag"] = relative_asset_path("flags", filename)
            except Exception as err:
                print(f"Warning: flag image failed for {code}: {err}")
        country_id = upsert_country(conn, values)
        synced.append({"country_id": country_id, "code": code, "name": values.get("name")})
    return synced
