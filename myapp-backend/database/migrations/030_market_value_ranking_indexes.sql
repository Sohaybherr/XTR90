CREATE INDEX IF NOT EXISTS idx_transfermarkt_cache_player_market_value
ON transfermarkt_cache (transfermarkt_id)
WHERE entity_type = 'player'
  AND resource = 'market_value';

CREATE INDEX IF NOT EXISTS idx_team_squad_players_current_team_player
ON team_squad_players (team_id, player_id)
WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_team_competition_seasons_active_competition
ON team_competition_seasons (competition_season_id, team_id)
WHERE COALESCE(is_active, TRUE) = TRUE;
