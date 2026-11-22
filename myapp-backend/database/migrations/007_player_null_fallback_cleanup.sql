BEGIN;

UPDATE players
SET firstname = COALESCE(NULLIF(TRIM(firstname), ''), split_part(name, ' ', 1), 'Unknown'),
    lastname = COALESCE(NULLIF(TRIM(lastname), ''), 'Unknown'),
    birth_date = COALESCE(birth_date, DATE '1900-01-01'),
    birth_place = COALESCE(NULLIF(TRIM(birth_place), ''), 'Unknown'),
    birth_country = COALESCE(NULLIF(TRIM(birth_country), ''), 'Unknown'),
    nationality = COALESCE(NULLIF(TRIM(nationality), ''), 'Unknown'),
    height = COALESCE(NULLIF(TRIM(height), ''), 'Unknown'),
    weight = COALESCE(NULLIF(TRIM(weight), ''), 'Unknown'),
    position = COALESCE(NULLIF(TRIM(position), ''), 'Unknown'),
    photo_path = COALESCE(NULLIF(TRIM(photo_path), ''), '/assets/players/player_' || api_id || '.png'),
    api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
    api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE api_id IS NOT NULL;

UPDATE team_squad_players tsp
SET shirt_number = COALESCE(tsp.shirt_number, 0),
    position = COALESCE(NULLIF(TRIM(tsp.position), ''), p.position, 'Unknown'),
    joined_at = COALESCE(tsp.joined_at, DATE '1900-01-01'),
    left_at = COALESCE(tsp.left_at, DATE '9999-12-31'),
    api_synced_at = COALESCE(tsp.api_synced_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
FROM players p
WHERE p.id = tsp.player_id;

UPDATE player_team_seasons pts
SET shirt_number = COALESCE(pts.shirt_number, 0),
    position = COALESCE(NULLIF(TRIM(pts.position), ''), p.position, 'Unknown'),
    joined_at = COALESCE(pts.joined_at, DATE '1900-01-01'),
    left_at = COALESCE(pts.left_at, DATE '9999-12-31'),
    api_synced_at = COALESCE(pts.api_synced_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
FROM players p
WHERE p.id = pts.player_id;

UPDATE player_season_statistics
SET appearances = COALESCE(appearances, 0),
    lineups = COALESCE(lineups, 0),
    minutes = COALESCE(minutes, 0),
    number = COALESCE(number, 0),
    position = COALESCE(NULLIF(TRIM(position), ''), 'Unknown'),
    rating = COALESCE(rating, 0),
    captain = COALESCE(captain, FALSE),
    goals_total = COALESCE(goals_total, 0),
    goals_conceded = COALESCE(goals_conceded, 0),
    goals_assists = COALESCE(goals_assists, 0),
    goals_saves = COALESCE(goals_saves, 0),
    shots_total = COALESCE(shots_total, 0),
    shots_on = COALESCE(shots_on, 0),
    passes_total = COALESCE(passes_total, 0),
    passes_key = COALESCE(passes_key, 0),
    passes_accuracy = COALESCE(passes_accuracy, 0),
    tackles_total = COALESCE(tackles_total, 0),
    tackles_blocks = COALESCE(tackles_blocks, 0),
    tackles_interceptions = COALESCE(tackles_interceptions, 0),
    duels_total = COALESCE(duels_total, 0),
    duels_won = COALESCE(duels_won, 0),
    dribbles_attempts = COALESCE(dribbles_attempts, 0),
    dribbles_success = COALESCE(dribbles_success, 0),
    dribbles_past = COALESCE(dribbles_past, 0),
    fouls_drawn = COALESCE(fouls_drawn, 0),
    fouls_committed = COALESCE(fouls_committed, 0),
    cards_yellow = COALESCE(cards_yellow, 0),
    cards_yellow_red = COALESCE(cards_yellow_red, 0),
    cards_red = COALESCE(cards_red, 0),
    penalties_won = COALESCE(penalties_won, 0),
    penalties_committed = COALESCE(penalties_committed, 0),
    penalties_scored = COALESCE(penalties_scored, 0),
    penalties_missed = COALESCE(penalties_missed, 0),
    penalties_saved = COALESCE(penalties_saved, 0),
    goalkeeper_saves = COALESCE(goalkeeper_saves, 0),
    extra_statistics = COALESCE(extra_statistics, '{}'::jsonb),
    api_synced_at = COALESCE(api_synced_at, CURRENT_TIMESTAMP),
    api_updated_at = COALESCE(api_updated_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP;

UPDATE match_player_statistics
SET goals_conceded = COALESCE(goals_conceded, 0),
    dribbles_past = COALESCE(dribbles_past, 0),
    cards_yellow_red = COALESCE(cards_yellow_red, 0),
    penalties_won = COALESCE(penalties_won, 0),
    penalties_committed = COALESCE(penalties_committed, 0),
    penalties_missed = COALESCE(penalties_missed, 0),
    penalties_saved = COALESCE(penalties_saved, 0),
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
