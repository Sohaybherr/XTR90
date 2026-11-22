BEGIN;

ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS country_name_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS is_national BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS logo_path TEXT,
    ADD COLUMN IF NOT EXISTS api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'logo'
    ) THEN
        UPDATE teams
        SET logo_path = COALESCE(logo_path, logo)
        WHERE logo_path IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'national'
    ) THEN
        UPDATE teams
        SET is_national = COALESCE(is_national, national, FALSE);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'synced_at'
    ) THEN
        UPDATE teams
        SET api_synced_at = COALESCE(api_synced_at, synced_at)
        WHERE api_synced_at IS NULL;
    END IF;
END $$;

UPDATE teams t
SET country_name_snapshot = COALESCE(t.country_name_snapshot, c.name)
FROM countries c
WHERE c.id = t.country_id
  AND t.country_name_snapshot IS NULL;

UPDATE teams
SET logo_path = '/assets/teams/team_' || api_id || '.png'
WHERE api_id IS NOT NULL
  AND (logo_path IS NULL OR logo_path ~ '^https?://' OR logo_path LIKE 'C:%' OR logo_path LIKE '%localhost%');

UPDATE teams
SET api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
    api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP),
    is_national = COALESCE(is_national, FALSE);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teams'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE teams
            ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teams'
          AND column_name = 'updated_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE teams
            ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
    END IF;
END $$;

ALTER TABLE team_squad_players
    ADD COLUMN IF NOT EXISTS joined_at DATE,
    ADD COLUMN IF NOT EXISTS left_at DATE;

CREATE TABLE IF NOT EXISTS team_venues (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    venue_id BIGINT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    season INTEGER,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE,
    valid_to DATE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS team_venues_unique_season
    ON team_venues (team_id, venue_id, season)
    WHERE season IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS team_venues_unique_default
    ON team_venues (team_id, venue_id)
    WHERE season IS NULL;

CREATE TABLE IF NOT EXISTS team_competition_seasons (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_season_id BIGINT NOT NULL REFERENCES competition_seasons(id) ON DELETE RESTRICT,
    group_name TEXT,
    stage TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, competition_season_id)
);

CREATE TABLE IF NOT EXISTS team_season_statistics (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_season_id BIGINT NOT NULL REFERENCES competition_seasons(id) ON DELETE RESTRICT,
    form VARCHAR(80),
    fixtures_played_home INTEGER,
    fixtures_played_away INTEGER,
    fixtures_played_total INTEGER,
    wins_home INTEGER,
    wins_away INTEGER,
    wins_total INTEGER,
    draws_home INTEGER,
    draws_away INTEGER,
    draws_total INTEGER,
    losses_home INTEGER,
    losses_away INTEGER,
    losses_total INTEGER,
    goals_for_home INTEGER,
    goals_for_away INTEGER,
    goals_for_total INTEGER,
    goals_against_home INTEGER,
    goals_against_away INTEGER,
    goals_against_total INTEGER,
    goals_for_average_home NUMERIC(8,3),
    goals_for_average_away NUMERIC(8,3),
    goals_for_average_total NUMERIC(8,3),
    goals_against_average_home NUMERIC(8,3),
    goals_against_average_away NUMERIC(8,3),
    goals_against_average_total NUMERIC(8,3),
    biggest_win_home VARCHAR(30),
    biggest_win_away VARCHAR(30),
    biggest_loss_home VARCHAR(30),
    biggest_loss_away VARCHAR(30),
    biggest_goals_for_home INTEGER,
    biggest_goals_for_away INTEGER,
    biggest_goals_against_home INTEGER,
    biggest_goals_against_away INTEGER,
    clean_sheets_home INTEGER,
    clean_sheets_away INTEGER,
    clean_sheets_total INTEGER,
    failed_to_score_home INTEGER,
    failed_to_score_away INTEGER,
    failed_to_score_total INTEGER,
    penalties_scored INTEGER,
    penalties_missed INTEGER,
    penalties_total INTEGER,
    penalties_percentage NUMERIC(5,2),
    lineups_count INTEGER,
    extra_statistics JSONB DEFAULT '{}'::jsonb,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    api_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, competition_season_id)
);

CREATE TABLE IF NOT EXISTS team_goal_statistics (
    id BIGSERIAL PRIMARY KEY,
    team_season_statistics_id BIGINT NOT NULL REFERENCES team_season_statistics(id) ON DELETE CASCADE,
    goal_direction VARCHAR(20) NOT NULL,
    minute_from INTEGER,
    minute_to INTEGER,
    total INTEGER,
    percentage NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_season_statistics_id, goal_direction, minute_from, minute_to)
);

CREATE TABLE IF NOT EXISTS team_lineup_statistics (
    id BIGSERIAL PRIMARY KEY,
    team_season_statistics_id BIGINT NOT NULL REFERENCES team_season_statistics(id) ON DELETE CASCADE,
    formation VARCHAR(40) NOT NULL,
    played INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_season_statistics_id, formation)
);

CREATE TABLE IF NOT EXISTS team_coaches (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    coach_id BIGINT NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    season INTEGER,
    started_at DATE,
    ended_at DATE,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS team_coaches_unique_period
    ON team_coaches (team_id, coach_id, COALESCE(season, -1), COALESCE(started_at, DATE '0001-01-01'));

CREATE TABLE IF NOT EXISTS team_trophies (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS team_trophies_unique_result
    ON team_trophies (
        team_id,
        COALESCE(competition_name, ''),
        COALESCE(season, ''),
        COALESCE(place, '')
    );

CREATE TABLE IF NOT EXISTS team_form_snapshots (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_season_id BIGINT NOT NULL REFERENCES competition_seasons(id) ON DELETE RESTRICT,
    form TEXT,
    matches_count INTEGER,
    snapshot_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, competition_season_id, snapshot_at)
);

CREATE TABLE IF NOT EXISTS team_standing_snapshots (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_season_id BIGINT NOT NULL REFERENCES competition_seasons(id) ON DELETE RESTRICT,
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
    snapshot_at TIMESTAMPTZ NOT NULL,
    api_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, competition_season_id, snapshot_at)
);

INSERT INTO venues (name, country, api_synced_at, created_at, updated_at)
SELECT DISTINCT btrim(t.stadium), t.country_name_snapshot, COALESCE(t.api_synced_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM teams t
WHERE t.stadium IS NOT NULL
  AND btrim(t.stadium) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM venues v
      WHERE lower(COALESCE(v.name, '')) = lower(btrim(t.stadium))
        AND lower(COALESCE(v.country, '')) = lower(COALESCE(t.country_name_snapshot, ''))
  );

INSERT INTO team_venues (team_id, venue_id, season, is_primary, api_synced_at)
SELECT t.id, v.id, NULL, TRUE, COALESCE(t.api_synced_at, CURRENT_TIMESTAMP)
FROM teams t
JOIN venues v
  ON lower(COALESCE(v.name, '')) = lower(btrim(t.stadium))
 AND lower(COALESCE(v.country, '')) = lower(COALESCE(t.country_name_snapshot, ''))
WHERE t.stadium IS NOT NULL
  AND btrim(t.stadium) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO team_competition_seasons (team_id, competition_season_id, is_active, api_synced_at)
SELECT tc.team_id, cs.id, TRUE, CURRENT_TIMESTAMP
FROM team_competitions tc
JOIN seasons s ON s.id = tc.season_id
JOIN competition_seasons cs
  ON cs.competition_id = tc.competition_id
 AND cs.season_year = NULLIF(s.name, '')::INTEGER
ON CONFLICT (team_id, competition_season_id) DO UPDATE
SET is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO team_standing_snapshots (
    team_id,
    competition_season_id,
    rank,
    points,
    played,
    wins,
    draws,
    losses,
    goals_for,
    goals_against,
    goal_difference,
    form,
    description,
    snapshot_at,
    api_synced_at
)
SELECT
    team_id,
    competition_season_id,
    rank,
    points,
    played,
    wins,
    draws,
    losses,
    goals_for,
    goals_against,
    goal_difference,
    form,
    description,
    COALESCE(api_synced_at, updated_at, created_at, CURRENT_TIMESTAMP),
    COALESCE(api_synced_at, CURRENT_TIMESTAMP)
FROM standings
ON CONFLICT (team_id, competition_season_id, snapshot_at) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_teams_name ON teams (name);
CREATE INDEX IF NOT EXISTS idx_teams_code ON teams (code);
CREATE INDEX IF NOT EXISTS idx_teams_is_national ON teams (is_national);
CREATE INDEX IF NOT EXISTS idx_teams_logo_path ON teams (logo_path);
CREATE INDEX IF NOT EXISTS idx_venues_api_id ON venues (api_id);
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues (name);
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues (city);
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues (country);
CREATE INDEX IF NOT EXISTS idx_team_venues_team_id ON team_venues (team_id);
CREATE INDEX IF NOT EXISTS idx_team_venues_venue_id ON team_venues (venue_id);
CREATE INDEX IF NOT EXISTS idx_team_competition_seasons_team_id ON team_competition_seasons (team_id);
CREATE INDEX IF NOT EXISTS idx_team_competition_seasons_competition_season_id ON team_competition_seasons (competition_season_id);
CREATE INDEX IF NOT EXISTS idx_team_squad_players_current ON team_squad_players (team_id, is_current);
CREATE INDEX IF NOT EXISTS idx_team_squad_players_player_id ON team_squad_players (player_id);
CREATE INDEX IF NOT EXISTS idx_team_season_statistics_competition_season_id ON team_season_statistics (competition_season_id);
CREATE INDEX IF NOT EXISTS idx_team_goal_statistics_parent ON team_goal_statistics (team_season_statistics_id);
CREATE INDEX IF NOT EXISTS idx_team_lineup_statistics_parent ON team_lineup_statistics (team_season_statistics_id);
CREATE INDEX IF NOT EXISTS idx_team_coaches_team_current ON team_coaches (team_id, is_current);
CREATE INDEX IF NOT EXISTS idx_team_coaches_coach_id ON team_coaches (coach_id);
CREATE INDEX IF NOT EXISTS idx_team_trophies_team_season ON team_trophies (team_id, season);
CREATE INDEX IF NOT EXISTS idx_player_transfers_from_team_id ON player_transfers (from_team_id);
CREATE INDEX IF NOT EXISTS idx_player_transfers_to_team_id ON player_transfers (to_team_id);
CREATE INDEX IF NOT EXISTS idx_player_transfers_transfer_date ON player_transfers (transfer_date);
CREATE INDEX IF NOT EXISTS idx_team_form_snapshots_team_season ON team_form_snapshots (team_id, competition_season_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_standing_snapshots_team_season ON team_standing_snapshots (team_id, competition_season_id, snapshot_at DESC);

COMMIT;
