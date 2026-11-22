CREATE INDEX IF NOT EXISTS idx_matches_kickoff_at
ON matches (kickoff_at);

CREATE INDEX IF NOT EXISTS idx_matches_match_date_without_kickoff
ON matches (match_date)
WHERE kickoff_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_live_status_short
ON matches (status_short)
WHERE status_short IN ('1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP');

CREATE INDEX IF NOT EXISTS idx_matches_unsynced_kickoff_at
ON matches (kickoff_at)
WHERE COALESCE(fully_synced, FALSE) = FALSE;
