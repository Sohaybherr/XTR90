BEGIN;

INSERT INTO teams (api_id, name, short_name, code, is_national, national, api_synced_at, api_updated_at)
VALUES
    (-900001, 'Without Club', 'Without Club', 'NCL', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (-900002, 'Unknown Club', 'Unknown Club', 'UNK', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (api_id) DO UPDATE
SET name = EXCLUDED.name,
    short_name = EXCLUDED.short_name,
    code = EXCLUDED.code,
    updated_at = CURRENT_TIMESTAMP,
    api_updated_at = CURRENT_TIMESTAMP;

UPDATE player_transfers
SET transfer_fee = 0
WHERE transfer_fee IS NULL;

UPDATE player_transfers
SET transfer_type = 'unknown'
WHERE transfer_type IS NULL;

UPDATE player_transfers
SET transfer_date = DATE '1900-01-01'
WHERE transfer_date IS NULL;

UPDATE player_transfers
SET from_team_id = (SELECT id FROM teams WHERE api_id = -900002)
WHERE from_team_id IS NULL;

UPDATE player_transfers
SET to_team_id = (SELECT id FROM teams WHERE api_id = -900002)
WHERE to_team_id IS NULL;

ALTER TABLE player_transfers
    ALTER COLUMN transfer_fee SET DEFAULT 0,
    ALTER COLUMN transfer_fee SET NOT NULL,
    ALTER COLUMN transfer_type SET DEFAULT 'unknown',
    ALTER COLUMN transfer_type SET NOT NULL,
    ALTER COLUMN transfer_date SET NOT NULL,
    ALTER COLUMN from_team_id SET NOT NULL,
    ALTER COLUMN to_team_id SET NOT NULL;

COMMIT;
