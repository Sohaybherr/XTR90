CREATE TABLE IF NOT EXISTS news (
    id BIGSERIAL PRIMARY KEY,
    external_id TEXT,
    source TEXT,
    title TEXT,
    description TEXT,
    url TEXT,
    published_at TIMESTAMPTZ,
    language VARCHAR(5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE news
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS url TEXT,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS language VARCHAR(5),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE news
SET
    external_id = COALESCE(NULLIF(external_id, ''), 'legacy-news-' || id::TEXT),
    source = COALESCE(NULLIF(source, ''), 'manual'),
    title = COALESCE(NULLIF(title, ''), 'Untitled news'),
    url = COALESCE(NULLIF(url, ''), '#'),
    created_at = COALESCE(created_at, NOW());

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'news'
            AND column_name = 'content'
    ) THEN
        UPDATE news
        SET description = COALESCE(description, content);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'news'
            AND column_name = 'published_at'
            AND data_type <> 'timestamp with time zone'
    ) THEN
        ALTER TABLE news
            ALTER COLUMN published_at TYPE TIMESTAMPTZ USING published_at AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'news'
            AND column_name = 'created_at'
            AND data_type <> 'timestamp with time zone'
    ) THEN
        ALTER TABLE news
            ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    END IF;
END $$;

WITH duplicate_external_ids AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY id) AS duplicate_number
    FROM news
    WHERE external_id IS NOT NULL
)
UPDATE news
SET external_id = news.external_id || '-' || news.id::TEXT
FROM duplicate_external_ids
WHERE news.id = duplicate_external_ids.id
    AND duplicate_external_ids.duplicate_number > 1;

ALTER TABLE news
    ALTER COLUMN external_id SET NOT NULL,
    ALTER COLUMN source SET NOT NULL,
    ALTER COLUMN title SET NOT NULL,
    ALTER COLUMN url SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE news
    DROP COLUMN IF EXISTS content,
    DROP COLUMN IF EXISTS image;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'news_external_id_key'
            AND conrelid = 'news'::regclass
    ) THEN
        ALTER TABLE news
            ADD CONSTRAINT news_external_id_key UNIQUE (external_id);
    END IF;
END $$;
