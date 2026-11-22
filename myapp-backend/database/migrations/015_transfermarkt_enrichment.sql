BEGIN;

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS transfermarkt_id TEXT,
    ADD COLUMN IF NOT EXISTS transfermarkt_url TEXT,
    ADD COLUMN IF NOT EXISTS transfermarkt_synced_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS transfermarkt_cache (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT,
    transfermarkt_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entity_type, transfermarkt_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_players_transfermarkt_id ON players (transfermarkt_id);
CREATE INDEX IF NOT EXISTS idx_transfermarkt_cache_lookup
    ON transfermarkt_cache (entity_type, transfermarkt_id, resource, expires_at);

COMMIT;
