BEGIN;

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS firstname TEXT,
    ADD COLUMN IF NOT EXISTS lastname TEXT,
    ADD COLUMN IF NOT EXISTS birth_place TEXT,
    ADD COLUMN IF NOT EXISTS birth_country TEXT,
    ADD COLUMN IF NOT EXISTS nationality TEXT,
    ADD COLUMN IF NOT EXISTS photo_path TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'full_name'
    ) THEN
        UPDATE players
        SET name = COALESCE(name, full_name)
        WHERE name IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'first_name'
    ) THEN
        UPDATE players
        SET firstname = COALESCE(firstname, first_name)
        WHERE firstname IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'last_name'
    ) THEN
        UPDATE players
        SET lastname = COALESCE(lastname, last_name)
        WHERE lastname IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'photo'
    ) THEN
        UPDATE players
        SET photo_path = COALESCE(photo_path, photo)
        WHERE photo_path IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'synced_at'
    ) THEN
        UPDATE players
        SET api_synced_at = COALESCE(api_synced_at, synced_at)
        WHERE api_synced_at IS NULL;
    END IF;
END $$;

UPDATE players
SET photo_path = '/assets/players/player_' || api_id || '.png'
WHERE api_id IS NOT NULL
  AND (photo_path IS NULL OR photo_path ~ '^https?://');

UPDATE players
SET api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
    api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP);

ALTER TABLE players
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN height TYPE TEXT USING NULLIF(TRIM(height::TEXT), ''),
    ALTER COLUMN weight TYPE TEXT USING NULLIF(TRIM(weight::TEXT), ''),
    ALTER COLUMN api_synced_at SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'players'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE players
            ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'players'
          AND column_name = 'updated_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE players
            ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS team_squad_players (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    shirt_number INTEGER,
    position VARCHAR(40),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_team_seasons (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    position VARCHAR(40),
    shirt_number INTEGER,
    joined_at DATE,
    left_at DATE,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (player_id, team_id, season)
);

CREATE TABLE IF NOT EXISTS player_season_statistics (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_season_id BIGINT NOT NULL REFERENCES competition_seasons(id) ON DELETE CASCADE,
    appearances INTEGER,
    lineups INTEGER,
    minutes INTEGER,
    number INTEGER,
    position VARCHAR(40),
    rating NUMERIC(4,2),
    captain BOOLEAN,
    goals_total INTEGER,
    goals_conceded INTEGER,
    goals_assists INTEGER,
    goals_saves INTEGER,
    shots_total INTEGER,
    shots_on INTEGER,
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
    goalkeeper_saves INTEGER,
    extra_statistics JSONB DEFAULT '{}'::jsonb,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (player_id, team_id, competition_season_id)
);

ALTER TABLE player_transfers
    ADD COLUMN IF NOT EXISTS api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS api_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS player_trophies (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    competition_id BIGINT REFERENCES competitions(id) ON DELETE SET NULL,
    competition_name TEXT,
    country TEXT,
    season TEXT,
    place TEXT,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_sidelined (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    sidelined_type TEXT,
    start_date DATE,
    end_date DATE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_injuries (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    match_id BIGINT REFERENCES matches(id) ON DELETE SET NULL,
    competition_season_id BIGINT REFERENCES competition_seasons(id) ON DELETE SET NULL,
    injury_type TEXT,
    injury_reason TEXT,
    fixture_date DATE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
    backfill_season INTEGER;
BEGIN
    SELECT season_year
    INTO backfill_season
    FROM competition_seasons
    WHERE current = TRUE
    ORDER BY season_year DESC
    LIMIT 1;

    backfill_season := COALESCE(backfill_season, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'current_team_id'
    ) THEN
        INSERT INTO team_squad_players (team_id, player_id, shirt_number, position, is_current, api_synced_at)
        SELECT current_team_id, id, number, position, TRUE, COALESCE(api_synced_at, CURRENT_TIMESTAMP)
        FROM players
        WHERE current_team_id IS NOT NULL
        ON CONFLICT (team_id, player_id) DO UPDATE
        SET shirt_number = COALESCE(EXCLUDED.shirt_number, team_squad_players.shirt_number),
            position = COALESCE(EXCLUDED.position, team_squad_players.position),
            is_current = TRUE,
            api_synced_at = COALESCE(EXCLUDED.api_synced_at, team_squad_players.api_synced_at),
            updated_at = CURRENT_TIMESTAMP;

        INSERT INTO player_team_seasons (player_id, team_id, season, position, shirt_number, is_current, api_synced_at)
        SELECT id, current_team_id, backfill_season, position, number, TRUE, COALESCE(api_synced_at, CURRENT_TIMESTAMP)
        FROM players
        WHERE current_team_id IS NOT NULL
        ON CONFLICT (player_id, team_id, season) DO UPDATE
        SET position = COALESCE(EXCLUDED.position, player_team_seasons.position),
            shirt_number = COALESCE(EXCLUDED.shirt_number, player_team_seasons.shirt_number),
            is_current = TRUE,
            api_synced_at = COALESCE(EXCLUDED.api_synced_at, player_team_seasons.api_synced_at),
            updated_at = CURRENT_TIMESTAMP;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_players_name ON players (name);
CREATE INDEX IF NOT EXISTS idx_players_nationality ON players (nationality);
CREATE INDEX IF NOT EXISTS idx_team_squad_players_player_id ON team_squad_players (player_id);
CREATE INDEX IF NOT EXISTS idx_team_squad_players_current_team ON team_squad_players (team_id, is_current);
CREATE INDEX IF NOT EXISTS idx_player_team_seasons_team_season ON player_team_seasons (team_id, season);
CREATE INDEX IF NOT EXISTS idx_player_team_seasons_player_current ON player_team_seasons (player_id, is_current);
CREATE INDEX IF NOT EXISTS idx_player_season_statistics_competition_season_id ON player_season_statistics (competition_season_id);
CREATE INDEX IF NOT EXISTS idx_player_season_statistics_team_id ON player_season_statistics (team_id);
CREATE INDEX IF NOT EXISTS idx_player_transfers_player_date ON player_transfers (player_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_player_trophies_player_season ON player_trophies (player_id, season);
CREATE INDEX IF NOT EXISTS idx_player_sidelined_player_dates ON player_sidelined (player_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_player_injuries_player_date ON player_injuries (player_id, fixture_date);
CREATE INDEX IF NOT EXISTS idx_player_injuries_match_id ON player_injuries (match_id);
CREATE INDEX IF NOT EXISTS idx_player_injuries_competition_season_id ON player_injuries (competition_season_id);

DROP INDEX IF EXISTS idx_players_current_team_id;

ALTER TABLE players
    DROP CONSTRAINT IF EXISTS players_country_id_fkey,
    DROP CONSTRAINT IF EXISTS players_current_team_id_fkey;

ALTER TABLE players
    DROP COLUMN IF EXISTS country_id,
    DROP COLUMN IF EXISTS current_team_id,
    DROP COLUMN IF EXISTS first_name,
    DROP COLUMN IF EXISTS last_name,
    DROP COLUMN IF EXISTS full_name,
    DROP COLUMN IF EXISTS photo,
    DROP COLUMN IF EXISTS age,
    DROP COLUMN IF EXISTS number,
    DROP COLUMN IF EXISTS synced_at;

COMMIT;
