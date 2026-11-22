BEGIN;

UPDATE player_transfers
SET transfer_fee = 0
WHERE transfer_fee IS NULL;

ALTER TABLE player_transfers
    ALTER COLUMN transfer_fee SET DEFAULT 0;

ALTER TABLE player_transfers
    ALTER COLUMN transfer_fee SET NOT NULL;

COMMIT;
