BEGIN;

ALTER TABLE competition_seasons
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS logo_path TEXT;

CREATE INDEX IF NOT EXISTS idx_competition_seasons_logo_path
    ON competition_seasons (logo_path);

COMMIT;
