BEGIN;

ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS fully_synced BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS last_live_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS live_sync_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS final_sync_stage VARCHAR(30),
    ADD COLUMN IF NOT EXISTS lineups_unavailable BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS team_statistics_unavailable BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS player_statistics_unavailable BOOLEAN DEFAULT FALSE;

UPDATE matches
SET
    fully_synced = COALESCE(fully_synced, FALSE),
    live_sync_attempts = COALESCE(live_sync_attempts, 0),
    lineups_unavailable = COALESCE(lineups_unavailable, FALSE),
    team_statistics_unavailable = COALESCE(team_statistics_unavailable, FALSE),
    player_statistics_unavailable = COALESCE(player_statistics_unavailable, FALSE)
WHERE fully_synced IS NULL
   OR live_sync_attempts IS NULL
   OR lineups_unavailable IS NULL
   OR team_statistics_unavailable IS NULL
   OR player_statistics_unavailable IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_next_sync_live
    ON matches (next_sync_at)
    WHERE fully_synced = FALSE;

CREATE INDEX IF NOT EXISTS idx_matches_live_status
    ON matches (status_short, kickoff_at)
    WHERE fully_synced = FALSE;

CREATE INDEX IF NOT EXISTS idx_matches_final_sync_stage
    ON matches (final_sync_stage)
    WHERE fully_synced = FALSE;

COMMIT;
