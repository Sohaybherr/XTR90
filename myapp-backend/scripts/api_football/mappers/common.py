from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


def nested_get(payload: dict[str, Any], *keys: str) -> Any:
    current: Any = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return int(value)
    try:
        return int(str(value).strip().replace("%", ""))
    except (TypeError, ValueError):
        return None


def parse_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value).strip().replace("%", ""))
    except (InvalidOperation, ValueError):
        return None


def parse_percentage(value: Any) -> Decimal | None:
    return parse_decimal(value)


def split_grid(grid: Any) -> tuple[int | None, int | None]:
    if not grid:
        return None, None
    parts = str(grid).split(":", 1)
    if len(parts) != 2:
        return None, None
    return parse_int(parts[0]), parse_int(parts[1])
