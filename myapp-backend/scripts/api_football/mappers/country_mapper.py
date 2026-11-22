from __future__ import annotations

from typing import Any, Dict


def normalize_country_code(value: Any) -> str | None:
    if value is None:
        return None
    code = str(value).strip().upper()
    if len(code) != 2 or not code.isalpha():
        return None
    return code


def map_country(payload: Dict[str, Any]) -> Dict[str, Any]:
    code = normalize_country_code(payload.get("code"))
    return {
        "api_id": payload.get("id"),
        "name": payload.get("name"),
        "code": code,
        "flag": f"/assets/flags/flag_{str(code).lower()}.png" if code else None,
        "continent": payload.get("continent") or payload.get("region") or "Unknown",
    }
