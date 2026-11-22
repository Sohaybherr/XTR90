BEGIN;

ALTER TABLE countries
    ADD COLUMN IF NOT EXISTS api_id BIGINT,
    ADD COLUMN IF NOT EXISTS api_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS api_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS countries_api_id_unique
    ON countries (api_id)
    WHERE api_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS competition_seasons (
    id BIGSERIAL PRIMARY KEY,
    competition_id BIGINT NOT NULL REFERENCES competitions(id),
    season_year INTEGER NOT NULL,
    start_date DATE,
    end_date DATE,
    current BOOLEAN DEFAULT false,
    coverage JSONB,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (competition_id, season_year)
);

ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS national BOOLEAN;

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS age INTEGER,
    ADD COLUMN IF NOT EXISTS number INTEGER,
    ADD COLUMN IF NOT EXISTS api_synced_at TIMESTAMPTZ;

ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS competition_season_id BIGINT REFERENCES competition_seasons(id),
    ADD COLUMN IF NOT EXISTS fixture_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(80),
    ADD COLUMN IF NOT EXISTS elapsed INTEGER,
    ADD COLUMN IF NOT EXISTS referee TEXT,
    ADD COLUMN IF NOT EXISTS home_goals INTEGER,
    ADD COLUMN IF NOT EXISTS away_goals INTEGER,
    ADD COLUMN IF NOT EXISTS halftime_home INTEGER,
    ADD COLUMN IF NOT EXISTS halftime_away INTEGER,
    ADD COLUMN IF NOT EXISTS fulltime_home INTEGER,
    ADD COLUMN IF NOT EXISTS fulltime_away INTEGER,
    ADD COLUMN IF NOT EXISTS extratime_home INTEGER,
    ADD COLUMN IF NOT EXISTS extratime_away INTEGER,
    ADD COLUMN IF NOT EXISTS penalty_home INTEGER,
    ADD COLUMN IF NOT EXISTS penalty_away INTEGER,
    ADD COLUMN IF NOT EXISTS api_synced_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS standings (
    id BIGSERIAL PRIMARY KEY,
    competition_season_id BIGINT NOT NULL REFERENCES competition_seasons(id),
    team_id BIGINT NOT NULL REFERENCES teams(id),
    rank INTEGER,
    points INTEGER,
    played INTEGER,
    wins INTEGER,
    draws INTEGER,
    losses INTEGER,
    goals_for INTEGER,
    goals_against INTEGER,
    goal_difference INTEGER,
    form TEXT,
    description TEXT,
    api_updated_at TIMESTAMPTZ,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (competition_season_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_seasons_competition_id ON competition_seasons (competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_seasons_season_year ON competition_seasons (season_year);
CREATE INDEX IF NOT EXISTS idx_matches_competition_season_id ON matches (competition_season_id);
CREATE INDEX IF NOT EXISTS idx_standings_competition_season_id ON standings (competition_season_id);
CREATE INDEX IF NOT EXISTS idx_standings_team_id ON standings (team_id);

COMMIT;
