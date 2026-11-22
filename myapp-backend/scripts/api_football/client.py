from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

from .config import ApiFootballConfig, load_config
from .rate_limit import RequestBudget


class ApiFootballRateLimit(RuntimeError):
    pass


class ApiFootballClient:
    def __init__(self, config: Optional[ApiFootballConfig] = None) -> None:
        self.config = config or load_config()
        self.budget = RequestBudget(
            self.config.budget_file,
            daily_limit=self.config.daily_limit,
            safety_reserve=self.config.safety_reserve,
        )

    def build_url(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> str:
        clean_endpoint = endpoint.strip("/")
        query = urllib.parse.urlencode(params or {}, doseq=True)
        url = f"{self.config.base_url}/{clean_endpoint}"
        return f"{url}?{query}" if query else url

    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, *, retries: int = 2) -> Dict[str, Any]:
        if not self.config.api_key:
            raise RuntimeError("API_FOOTBALL_KEY is not configured.")

        self.budget.assert_available(1)
        clean_endpoint = endpoint.strip("/")
        last_error: Exception | None = None

        for attempt in range(retries + 1):
            request = urllib.request.Request(
                self.build_url(clean_endpoint, params),
                headers={"x-apisports-key": self.config.api_key},
            )
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                    errors = payload.get("errors")
                    if errors:
                        self.budget.consume(
                            1,
                            endpoint=f"/{clean_endpoint}",
                            params=params,
                            status=response.status,
                            success=False,
                            error=json.dumps(errors, ensure_ascii=True)[:500],
                        )
                        error_text = json.dumps(errors, ensure_ascii=True)
                        if "request" in error_text.lower() and "limit" in error_text.lower():
                            raise ApiFootballRateLimit(f"API-Football request limit for /{clean_endpoint}: {error_text}")
                        raise RuntimeError(f"API-Football errors for /{clean_endpoint}: {error_text}")
                    self.budget.consume(
                        1,
                        endpoint=f"/{clean_endpoint}",
                        params=params,
                        status=response.status,
                        success=True,
                    )
                    return payload
            except urllib.error.HTTPError as err:
                body = err.read().decode("utf-8", errors="replace")[:500]
                self.budget.consume(
                    1,
                    endpoint=f"/{clean_endpoint}",
                    params=params,
                    status=err.code,
                    success=False,
                    error=body,
                )
                if err.code == 429:
                    raise ApiFootballRateLimit(f"API-Football HTTP 429 for /{clean_endpoint}: {body}") from err
                if 400 <= err.code < 500:
                    raise RuntimeError(f"API-Football HTTP {err.code} for /{clean_endpoint}: {body}") from err
                last_error = err
            except (TimeoutError, urllib.error.URLError, json.JSONDecodeError) as err:
                last_error = err
                if attempt >= retries:
                    self.budget.consume(
                        1,
                        endpoint=f"/{clean_endpoint}",
                        params=params,
                        status="network_error",
                        success=False,
                        error=str(err),
                    )
                    raise RuntimeError(f"API-Football request failed for /{clean_endpoint}: {err}") from err

            time.sleep(min(2 ** attempt, 8))

        raise RuntimeError(f"API-Football request failed for /{clean_endpoint}: {last_error}")
