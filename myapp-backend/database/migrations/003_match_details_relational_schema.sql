BEGIN;

CREATE TABLE IF NOT EXISTS venues (
    id BIGSERIAL PRIMARY KEY,
    api_id BIGINT,
    name TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    capacity INTEGER,
    surface TEXT,
    image_path TEXT,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS venues_api_id_unique
    ON venues (api_id);

CREATE TABLE IF NOT EXISTS coaches (
    id BIGSERIAL PRIMARY KEY,
    api_id BIGINT,
    name TEXT,
    firstname TEXT,
    lastname TEXT,
    age INTEGER,
    birth_date DATE,
    birth_place TEXT,
    birth_country TEXT,
    nationality TEXT,
    height TEXT,
    weight TEXT,
    photo_path TEXT,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS coaches_api_id_unique
    ON coaches (api_id);

ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS venue_id BIGINT,
    ADD COLUMN IF NOT EXISTS referee_name TEXT,
    ADD COLUMN IF NOT EXISTS kickoff_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS api_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS status_long VARCHAR(80),
    ADD COLUMN IF NOT EXISTS status_short VARCHAR(30),
    ADD COLUMN IF NOT EXISTS elapsed_extra INTEGER,
    ADD COLUMN IF NOT EXISTS home_winner BOOLEAN,
    ADD COLUMN IF NOT EXISTS away_winner BOOLEAN,
    ADD COLUMN IF NOT EXISTS has_events BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_lineups BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_team_statistics BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_player_statistics BOOLEAN DEFAULT FALSE;

UPDATE matches
SET
    kickoff_at = COALESCE(kickoff_at, match_date),
    api_timestamp = COALESCE(api_timestamp, fixture_timestamp),
    referee_name = COALESCE(referee_name, referee),
    status_short = COALESCE(status_short, status),
    has_events = COALESCE(has_events, FALSE),
    has_lineups = COALESCE(has_lineups, FALSE),
    has_team_statistics = COALESCE(has_team_statistics, FALSE),
    has_player_statistics = COALESCE(has_player_statistics, FALSE)
WHERE kickoff_at IS NULL
   OR api_timestamp IS NULL
   OR referee_name IS NULL
   OR status_short IS NULL
   OR has_events IS NULL
   OR has_lineups IS NULL
   OR has_team_statistics IS NULL
   OR has_player_statistics IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'matches_venue_id_fkey'
    ) THEN
        ALTER TABLE matches
            ADD CONSTRAINT matches_venue_id_fkey
            FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS match_events (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
    assist_player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
    elapsed INTEGER,
    extra INTEGER,
    event_type VARCHAR(80),
    event_detail VARCHAR(120),
    comments TEXT,
    event_order INTEGER,
    event_key TEXT,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS match_events_event_key_unique
    ON match_events (match_id, event_key);

CREATE TABLE IF NOT EXISTS match_team_statistics (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    shots_on_goal INTEGER,
    shots_off_goal INTEGER,
    total_shots INTEGER,
    blocked_shots INTEGER,
    shots_inside_box INTEGER,
    shots_outside_box INTEGER,
    fouls INTEGER,
    corner_kicks INTEGER,
    offsides INTEGER,
    ball_possession NUMERIC(5,2),
    yellow_cards INTEGER,
    red_cards INTEGER,
    goalkeeper_saves INTEGER,
    total_passes INTEGER,
    passes_accurate INTEGER,
    passes_percentage NUMERIC(5,2),
    expected_goals NUMERIC(6,3),
    extra_statistics JSONB DEFAULT '{}'::jsonb,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (match_id, team_id)
);

CREATE TABLE IF NOT EXISTS match_lineups (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    coach_id BIGINT REFERENCES coaches(id) ON DELETE SET NULL,
    formation VARCHAR(30),
    player_primary_color VARCHAR(30),
    player_number_color VARCHAR(30),
    player_border_color VARCHAR(30),
    goalkeeper_primary_color VARCHAR(30),
    goalkeeper_number_color VARCHAR(30),
    goalkeeper_border_color VARCHAR(30),
    confirmed BOOLEAN DEFAULT FALSE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (match_id, team_id)
);

CREATE TABLE IF NOT EXISTS match_lineup_players (
    id BIGSERIAL PRIMARY KEY,
    lineup_id BIGINT NOT NULL REFERENCES match_lineups(id) ON DELETE CASCADE,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
    player_name_snapshot TEXT,
    shirt_number INTEGER,
    position VARCHAR(30),
    lineup_type VARCHAR(40),
    grid VARCHAR(20),
    grid_row INTEGER,
    grid_column INTEGER,
    display_order INTEGER,
    lineup_player_key TEXT,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS match_lineup_players_key_unique
    ON match_lineup_players (lineup_id, lineup_player_key);

CREATE TABLE IF NOT EXISTS match_player_statistics (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
    shirt_number INTEGER,
    position VARCHAR(30),
    rating NUMERIC(3,1),
    captain BOOLEAN,
    substitute BOOLEAN,
    minutes INTEGER,
    offsides INTEGER,
    shots_total INTEGER,
    shots_on INTEGER,
    goals_total INTEGER,
    goals_conceded INTEGER,
    goals_assists INTEGER,
    goalkeeper_saves INTEGER,
    passes_total INTEGER,
    passes_key INTEGER,
    passes_accuracy NUMERIC(5,2),
    tackles_total INTEGER,
    tackles_blocks INTEGER,
    tackles_interceptions INTEGER,
    duels_total INTEGER,
    duels_won INTEGER,
    dribbles_attempts INTEGER,
    dribbles_success INTEGER,
    dribbles_past INTEGER,
    fouls_drawn INTEGER,
    fouls_committed INTEGER,
    cards_yellow INTEGER,
    cards_yellow_red INTEGER,
    cards_red INTEGER,
    penalties_won INTEGER,
    penalties_committed INTEGER,
    penalties_scored INTEGER,
    penalties_missed INTEGER,
    penalties_saved INTEGER,
    extra_statistics JSONB DEFAULT '{}'::jsonb,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS match_player_statistics_player_unique
    ON match_player_statistics (match_id, team_id, player_id);

CREATE UNIQUE INDEX IF NOT EXISTS match_player_statistics_snapshot_unique
    ON match_player_statistics (match_id, team_id, shirt_number, position)
    WHERE player_id IS NULL AND shirt_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_name_city_country ON venues (name, city, country);
CREATE INDEX IF NOT EXISTS idx_coaches_api_id ON coaches (api_id);
CREATE INDEX IF NOT EXISTS idx_matches_api_id ON matches (api_id);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff_at ON matches (kickoff_at);
CREATE INDEX IF NOT EXISTS idx_matches_status_short ON matches (status_short);
CREATE INDEX IF NOT EXISTS idx_matches_venue_id ON matches (venue_id);
CREATE INDEX IF NOT EXISTS idx_match_events_match_time ON match_events (match_id, elapsed, extra);
CREATE INDEX IF NOT EXISTS idx_match_events_team_id ON match_events (team_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON match_events (player_id);
CREATE INDEX IF NOT EXISTS idx_match_team_statistics_match_team ON match_team_statistics (match_id, team_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_match_team ON match_lineups (match_id, team_id);
CREATE INDEX IF NOT EXISTS idx_match_lineup_players_lineup_type ON match_lineup_players (lineup_id, lineup_type);
CREATE INDEX IF NOT EXISTS idx_match_lineup_players_match_team ON match_lineup_players (match_id, team_id);
CREATE INDEX IF NOT EXISTS idx_match_player_statistics_match_team ON match_player_statistics (match_id, team_id);
CREATE INDEX IF NOT EXISTS idx_match_player_statistics_player_id ON match_player_statistics (player_id);

COMMIT;
