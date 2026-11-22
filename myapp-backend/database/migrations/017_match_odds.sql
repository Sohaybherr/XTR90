BEGIN;

CREATE TABLE IF NOT EXISTS match_odds (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'api-football',
    scope TEXT NOT NULL DEFAULT 'prematch',
    bookmaker_api_id BIGINT,
    bookmaker_name TEXT NOT NULL,
    bet_api_id BIGINT,
    bet_name TEXT NOT NULL,
    value_name TEXT NOT NULL,
    odd NUMERIC(10,3),
    is_main BOOLEAN,
    is_suspended BOOLEAN,
    api_updated_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT match_odds_scope_check CHECK (scope IN ('prematch', 'live')),
    CONSTRAINT match_odds_unique UNIQUE (
        match_id,
        source,
        scope,
        bookmaker_api_id,
        bet_api_id,
        value_name
    )
);

CREATE INDEX IF NOT EXISTS match_odds_match_scope_idx
    ON match_odds (match_id, scope, bet_name, bookmaker_name);

CREATE INDEX IF NOT EXISTS match_odds_fetched_at_idx
    ON match_odds (fetched_at DESC);

COMMIT;
