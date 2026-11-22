BEGIN;

ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS fifa_rank INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fifa_points NUMERIC(10, 3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS uefa_rank INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS uefa_points NUMERIC(10, 3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS classification_tier VARCHAR(32) NOT NULL DEFAULT 'unclassified',
    ADD COLUMN IF NOT EXISTS classification_score NUMERIC(10, 3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS classification_source VARCHAR(32) NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS classification_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS team_rankings (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    source VARCHAR(32) NOT NULL,
    ranking_type VARCHAR(32) NOT NULL,
    ranking_date DATE NOT NULL,
    rank INTEGER NOT NULL,
    points NUMERIC(10, 3) NOT NULL DEFAULT 0,
    country_code VARCHAR(8) NOT NULL DEFAULT '',
    movement INTEGER NOT NULL DEFAULT 0,
    team_name_snapshot TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    raw JSONB NOT NULL DEFAULT '{}'::jsonb,
    api_synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, ranking_type, ranking_date, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_rankings_team_type_date
    ON team_rankings (team_id, ranking_type, ranking_date DESC);

CREATE INDEX IF NOT EXISTS idx_team_rankings_type_rank
    ON team_rankings (ranking_type, rank);

UPDATE teams
SET fifa_rank = COALESCE(fifa_rank, 0),
    fifa_points = COALESCE(fifa_points, 0),
    uefa_rank = COALESCE(uefa_rank, 0),
    uefa_points = COALESCE(uefa_points, 0),
    classification_tier = COALESCE(NULLIF(classification_tier, ''), 'unclassified'),
    classification_score = COALESCE(classification_score, 0),
    classification_source = COALESCE(NULLIF(classification_source, ''), 'none'),
    classification_updated_at = COALESCE(classification_updated_at, CURRENT_TIMESTAMP);

COMMIT;
