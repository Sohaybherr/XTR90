BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS show_odds BOOLEAN DEFAULT TRUE;

UPDATE users
SET preferred_language = COALESCE(preferred_language, 'en'),
    show_odds = COALESCE(show_odds, TRUE);

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS user_email_otps (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(40) NOT NULL DEFAULT 'email_verification',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_email_otps_purpose_check CHECK (purpose IN ('email_verification'))
);

CREATE INDEX IF NOT EXISTS idx_user_email_otps_user_purpose
    ON user_email_otps (user_id, purpose, expires_at DESC);

COMMIT;
