BEGIN;

UPDATE teams
SET country_name_snapshot = 'England',
    updated_at = CURRENT_TIMESTAMP
WHERE api_id IN (39, 41, 46, 48)
  AND country_id IS NULL
  AND country_name_snapshot IS NULL;

UPDATE players
SET photo_path = '/assets/players/player_' || api_id || '.png',
    updated_at = CURRENT_TIMESTAMP
WHERE photo_path IS NULL
  AND api_id IS NOT NULL;

COMMIT;
