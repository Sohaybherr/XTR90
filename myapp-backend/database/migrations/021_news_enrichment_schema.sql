ALTER TABLE news
    ADD COLUMN IF NOT EXISTS raw_article TEXT,
    ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS importance SMALLINT,
    ADD COLUMN IF NOT EXISTS clubs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS competitions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS is_breaking BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_completed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS image_url TEXT;

UPDATE news
SET
    processing_status = COALESCE(processing_status, 'pending'),
    clubs = COALESCE(clubs, '[]'::jsonb),
    players = COALESCE(players, '[]'::jsonb),
    competitions = COALESCE(competitions, '[]'::jsonb),
    is_breaking = COALESCE(is_breaking, FALSE),
    published = COALESCE(published, FALSE),
    notification_sent = COALESCE(notification_sent, FALSE),
    ai_completed = COALESCE(ai_completed, FALSE);
