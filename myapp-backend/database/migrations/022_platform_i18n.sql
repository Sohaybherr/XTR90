CREATE TABLE IF NOT EXISTS platform_languages (
    code VARCHAR(5) PRIMARY KEY,
    name TEXT NOT NULL,
    native_name TEXT NOT NULL,
    direction VARCHAR(3) NOT NULL DEFAULT 'ltr',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_languages (code, name, native_name, direction, enabled, is_default, sort_order)
VALUES
    ('en', 'English', 'English', 'ltr', TRUE, TRUE, 1),
    ('fr', 'French', 'Français', 'ltr', TRUE, FALSE, 2),
    ('ar', 'Arabic', 'العربية', 'rtl', TRUE, FALSE, 3),
    ('de', 'German', 'Deutsch', 'ltr', TRUE, FALSE, 4),
    ('es', 'Spanish', 'Español', 'ltr', TRUE, FALSE, 5)
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    native_name = EXCLUDED.native_name,
    direction = EXCLUDED.direction,
    enabled = EXCLUDED.enabled,
    is_default = EXCLUDED.is_default,
    sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS news_translations (
    id BIGSERIAL PRIMARY KEY,
    news_id BIGINT NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    language_code VARCHAR(5) NOT NULL REFERENCES platform_languages(code),
    title TEXT,
    description TEXT,
    summary TEXT,
    raw_article TEXT,
    category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE news_translations
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS raw_article TEXT,
    ADD COLUMN IF NOT EXISTS category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'news_translations_news_language_key'
            AND conrelid = 'news_translations'::regclass
    ) THEN
        ALTER TABLE news_translations
            ADD CONSTRAINT news_translations_news_language_key UNIQUE (news_id, language_code);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_news_translations_language_code ON news_translations(language_code);

INSERT INTO news_translations (
    news_id,
    language_code,
    title,
    description,
    summary,
    raw_article,
    category
)
SELECT
    id,
    'en',
    title,
    description,
    summary,
    raw_article,
    category
FROM news
WHERE ai_completed = TRUE
ON CONFLICT (news_id, language_code) DO UPDATE
SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    summary = EXCLUDED.summary,
    raw_article = EXCLUDED.raw_article,
    category = EXCLUDED.category,
    updated_at = NOW();

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) REFERENCES platform_languages(code) DEFAULT 'en';
