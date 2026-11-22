BEGIN;

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS transfermarkt_match_status TEXT,
    ADD COLUMN IF NOT EXISTS transfermarkt_match_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transfermarkt_match_error TEXT;

UPDATE players
SET transfermarkt_match_status = COALESCE(transfermarkt_match_status, 'matched'),
    transfermarkt_match_attempted_at = COALESCE(transfermarkt_match_attempted_at, transfermarkt_synced_at, CURRENT_TIMESTAMP)
WHERE transfermarkt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_transfermarkt_match_status
    ON players (transfermarkt_match_status);

COMMIT;
