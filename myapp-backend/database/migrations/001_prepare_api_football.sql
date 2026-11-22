BEGIN;

ALTER TABLE competitions
    ALTER COLUMN api_id TYPE BIGINT,
    ADD COLUMN IF NOT EXISTS api_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE teams
    ALTER COLUMN api_id TYPE BIGINT,
    ADD COLUMN IF NOT EXISTS api_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE players
    ALTER COLUMN api_id TYPE BIGINT,
    ADD COLUMN IF NOT EXISTS api_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE matches
    ALTER COLUMN api_id TYPE BIGINT,
    ALTER COLUMN match_date TYPE TIMESTAMPTZ USING match_date AT TIME ZONE 'UTC',
    ADD COLUMN IF NOT EXISTS api_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS api_sync_runs (
    id BIGSERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL,
    endpoint TEXT NOT NULL,
    parameters JSONB,
    request_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    status VARCHAR(20),
    error_message TEXT
);

-- Existing schema already has UNIQUE constraints on:
-- competitions.api_id, teams.api_id, players.api_id, matches.api_id,
-- and team_competitions(team_id, competition_id, season_id).

CREATE INDEX IF NOT EXISTS idx_competitions_country_id ON competitions (country_id);
CREATE INDEX IF NOT EXISTS idx_teams_country_id ON teams (country_id);
CREATE INDEX IF NOT EXISTS idx_players_current_team_id ON players (current_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_competition_id ON matches (competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_season_id ON matches (season_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_team_id ON matches (home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team_id ON matches (away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_match_date ON matches (match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
CREATE INDEX IF NOT EXISTS idx_team_competitions_team_id ON team_competitions (team_id);
CREATE INDEX IF NOT EXISTS idx_team_competitions_competition_id ON team_competitions (competition_id);
CREATE INDEX IF NOT EXISTS idx_team_competitions_season_id ON team_competitions (season_id);
CREATE INDEX IF NOT EXISTS idx_api_sync_runs_resource_started ON api_sync_runs (resource_type, started_at DESC);

COMMIT;
