const pool = require("../../config/db");

function newsColumns(languageExpression = "COALESCE(nt_requested.language_code, nt_en.language_code, n.language, 'en')") {
  return `
    n.id,
    n.external_id,
    n.source,
    COALESCE(nt_requested.title, nt_en.title, n.title) AS title,
    COALESCE(nt_requested.description, nt_en.description, n.description) AS description,
    n.url,
    n.published_at,
    ${languageExpression} AS language,
    n.language AS original_language,
    n.created_at,
    n.processing_status,
    n.processed_at,
    COALESCE(nt_requested.category, nt_en.category, n.category) AS category,
    n.importance,
    n.clubs,
    n.players,
    n.competitions,
    n.is_breaking,
    COALESCE(nt_requested.summary, nt_en.summary, n.summary) AS summary,
    n.published,
    n.notification_sent,
    n.ai_completed,
    n.image_url
  `;
}

const NEWS_TRANSLATION_JOINS = `
  LEFT JOIN news_translations nt_requested ON nt_requested.news_id = n.id AND nt_requested.language_code = $1
  LEFT JOIN news_translations nt_en ON nt_en.news_id = n.id AND nt_en.language_code = 'en'
`;

const VISIBLE_NEWS_WHERE = `
  (n.published = TRUE OR n.ai_completed = TRUE OR n.processing_status = 'completed')
`;

const SUPPORTED_LANGUAGES = new Set(["en", "fr", "ar", "de", "es"]);

function normalizeLanguage(language) {
  const code = String(language || "en").trim().toLowerCase().slice(0, 5);
  return SUPPORTED_LANGUAGES.has(code) ? code : "en";
}

function newsDto(row) {
  return {
    id: row.id,
    external_id: row.external_id,
    externalId: row.external_id,
    source: row.source,
    title: row.title,
    description: row.description,
    url: row.url,
    published_at: row.published_at,
    publishedAt: row.published_at,
    locale: row.language,
    language: row.language,
    original_language: row.original_language,
    originalLanguage: row.original_language,
    created_at: row.created_at,
    createdAt: row.created_at,
    processing_status: row.processing_status,
    processingStatus: row.processing_status,
    processed_at: row.processed_at,
    processedAt: row.processed_at,
    category: row.category,
    importance: row.importance,
    clubs: row.clubs || [],
    players: row.players || [],
    competitions: row.competitions || [],
    is_breaking: row.is_breaking,
    isBreaking: row.is_breaking,
    summary: row.summary,
    published: row.published,
    notification_sent: row.notification_sent,
    notificationSent: row.notification_sent,
    ai_completed: row.ai_completed,
    aiCompleted: row.ai_completed,
    image_url: row.image_url,
    imageUrl: row.image_url
  };
}

async function getAllNews(language = "en") {
  const result = await pool.query(`
    SELECT ${newsColumns("$1")}
    FROM news n
    ${NEWS_TRANSLATION_JOINS}
    WHERE ${VISIBLE_NEWS_WHERE}
    ORDER BY is_breaking DESC, published_at DESC NULLS LAST, created_at DESC, id DESC
  `, [normalizeLanguage(language)]);
  return result.rows.map(newsDto);
}

async function getLatestNews(limit = 10, language = "en") {
  const result = await pool.query(
    `
      SELECT ${newsColumns("$1")}
      FROM news n
      ${NEWS_TRANSLATION_JOINS}
      WHERE ${VISIBLE_NEWS_WHERE}
      ORDER BY is_breaking DESC, published_at DESC NULLS LAST, created_at DESC, id DESC
      LIMIT $2
    `,
    [normalizeLanguage(language), limit]
  );
  return result.rows.map(newsDto);
}

async function getNewsById(id, language = "en") {
  const result = await pool.query(
    `
      SELECT ${newsColumns("$1")}
      FROM news n
      ${NEWS_TRANSLATION_JOINS}
      WHERE n.id = $2 AND ${VISIBLE_NEWS_WHERE}
    `,
    [normalizeLanguage(language), id]
  );
  return result.rows[0] ? newsDto(result.rows[0]) : null;
}

async function createNews(news) {
  const {
    externalId,
    source,
    title,
    description,
    url,
    publishedAt,
    language,
    rawArticle,
    processingStatus,
    processedAt,
    category,
    importance,
    clubs,
    players,
    competitions,
    isBreaking,
    summary,
    published,
    notificationSent,
    aiCompleted,
    imageUrl
  } = news;
  const languageCode = normalizeLanguage(language);
  const query = `
    WITH inserted_news AS (
      INSERT INTO news (
        external_id,
        source,
        title,
        description,
        url,
        published_at,
        language,
        raw_article,
        processing_status,
        processed_at,
        category,
        importance,
        clubs,
        players,
        competitions,
        is_breaking,
        summary,
        published,
        notification_sent,
        ai_completed,
        image_url
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $22, $8,
        COALESCE($9, 'completed'),
        $10, $11, $12,
        COALESCE($13::jsonb, '[]'::jsonb),
        COALESCE($14::jsonb, '[]'::jsonb),
        COALESCE($15::jsonb, '[]'::jsonb),
        COALESCE($16, FALSE),
        $17,
        COALESCE($18, TRUE),
        COALESCE($19, FALSE),
        COALESCE($20, TRUE),
        $21
      )
      RETURNING *
    ),
    upserted_translation AS (
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
        $22,
        $3,
        $4,
        $17,
        $8,
        $11
      FROM inserted_news
      ON CONFLICT (news_id, language_code) DO UPDATE
      SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        summary = EXCLUDED.summary,
        raw_article = EXCLUDED.raw_article,
        category = EXCLUDED.category,
        updated_at = NOW()
      RETURNING *
    )
    SELECT ${newsColumns("$22")}
    FROM inserted_news n
    LEFT JOIN upserted_translation nt_requested ON nt_requested.news_id = n.id
    LEFT JOIN news_translations nt_en ON nt_en.news_id = n.id AND nt_en.language_code = 'en'
  `;
  const result = await pool.query(query, [
    externalId,
    source,
    title,
    description || null,
    url,
    publishedAt || null,
    language || null,
    rawArticle || null,
    processingStatus || null,
    processedAt || null,
    category || null,
    importance ?? null,
    JSON.stringify(clubs || []),
    JSON.stringify(players || []),
    JSON.stringify(competitions || []),
    isBreaking ?? false,
    summary || null,
    published ?? true,
    notificationSent ?? false,
    aiCompleted ?? true,
    imageUrl || null,
    languageCode
  ]);
  return newsDto(result.rows[0]);
}

async function updateNews(id, news) {
  const {
    externalId,
    source,
    title,
    description,
    url,
    publishedAt,
    language,
    rawArticle,
    processingStatus,
    processedAt,
    category,
    importance,
    clubs,
    players,
    competitions,
    isBreaking,
    summary,
    published,
    notificationSent,
    aiCompleted,
    imageUrl
  } = news;
  const languageCode = language ? normalizeLanguage(language) : null;
  const query = `
    WITH updated_news AS (
      UPDATE news
      SET
        external_id = COALESCE($1, external_id),
        source = COALESCE($2, source),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        url = COALESCE($5, url),
        published_at = COALESCE($6, published_at),
        language = COALESCE($23, language),
        raw_article = COALESCE($8, raw_article),
        processing_status = COALESCE($9, processing_status),
        processed_at = COALESCE($10, processed_at),
        category = COALESCE($11, category),
        importance = COALESCE($12, importance),
        clubs = COALESCE($13::jsonb, clubs),
        players = COALESCE($14::jsonb, players),
        competitions = COALESCE($15::jsonb, competitions),
        is_breaking = COALESCE($16, is_breaking),
        summary = COALESCE($17, summary),
        published = COALESCE($18, published),
        notification_sent = COALESCE($19, notification_sent),
        ai_completed = COALESCE($20, ai_completed),
        image_url = COALESCE($21, image_url)
      WHERE id = $22
      RETURNING *
    ),
    upserted_translation AS (
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
        COALESCE($23, NULLIF(language, ''), 'en'),
        title,
        description,
        summary,
        raw_article,
        category
      FROM updated_news
      ON CONFLICT (news_id, language_code) DO UPDATE
      SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        summary = EXCLUDED.summary,
        raw_article = EXCLUDED.raw_article,
        category = EXCLUDED.category,
        updated_at = NOW()
      RETURNING *
    )
    SELECT ${newsColumns("COALESCE($23, n.language, 'en')")}
    FROM updated_news n
    LEFT JOIN upserted_translation nt_requested ON nt_requested.news_id = n.id
    LEFT JOIN news_translations nt_en ON nt_en.news_id = n.id AND nt_en.language_code = 'en'
  `;
  const result = await pool.query(query, [
    externalId,
    source,
    title,
    description,
    url,
    publishedAt,
    language,
    rawArticle,
    processingStatus,
    processedAt,
    category,
    importance,
    clubs ? JSON.stringify(clubs) : null,
    players ? JSON.stringify(players) : null,
    competitions ? JSON.stringify(competitions) : null,
    isBreaking,
    summary,
    published,
    notificationSent,
    aiCompleted,
    imageUrl,
    id,
    languageCode
  ]);
  return result.rows[0] ? newsDto(result.rows[0]) : null;
}

async function deleteNews(id) {
  const result = await pool.query("DELETE FROM news WHERE id = $1 RETURNING *", [id]);
  return result.rows[0];
}

module.exports = {
  getAllNews,
  getLatestNews,
  getNewsById,
  createNews,
  updateNews,
  deleteNews
};
