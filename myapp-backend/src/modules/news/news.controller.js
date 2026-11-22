const newsModel = require("./news.model");

const PROCESSING_STATUSES = new Set([
  "pending",
  "fetched",
  "classified",
  "summarized",
  "processing",
  "completed",
  "failed"
]);
const SUPPORTED_LANGUAGES = new Set(["en", "fr", "ar", "de", "es"]);

function normalizeLanguage(value) {
  const code = String(value || "en").trim().toLowerCase().split(",")[0].split("-")[0];
  return SUPPORTED_LANGUAGES.has(code) ? code : "en";
}

function requestLanguage(req) {
  return normalizeLanguage(req.query.lang || req.query.locale || req.headers["accept-language"]);
}

function emptyToNull(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function parseArray(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseImportance(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(10, Math.max(1, parsed)) : undefined;
}

function normalizeNewsPayload(body) {
  return {
    externalId: emptyToNull(body.externalId || body.external_id),
    source: emptyToNull(body.source),
    title: emptyToNull(body.title),
    description: emptyToNull(body.description),
    url: emptyToNull(body.url),
    publishedAt: emptyToNull(body.publishedAt || body.published_at),
    language: emptyToNull(body.language),
    rawArticle: emptyToNull(body.rawArticle || body.raw_article),
    processingStatus: emptyToNull(body.processingStatus || body.processing_status),
    processedAt: emptyToNull(body.processedAt || body.processed_at),
    category: emptyToNull(body.category),
    importance: parseImportance(body.importance),
    clubs: parseArray(body.clubs),
    players: parseArray(body.players),
    competitions: parseArray(body.competitions),
    isBreaking: parseBoolean(body.isBreaking ?? body.is_breaking),
    summary: emptyToNull(body.summary),
    published: parseBoolean(body.published),
    notificationSent: parseBoolean(body.notificationSent ?? body.notification_sent),
    aiCompleted: parseBoolean(body.aiCompleted ?? body.ai_completed),
    imageUrl: emptyToNull(body.imageUrl || body.image_url)
  };
}

function validateNewsPayload(payload, { requireCoreFields = false } = {}) {
  if (requireCoreFields && (!payload.externalId || !payload.source || !payload.title || !payload.url)) {
    return "external_id, source, title, and url are required";
  }

  if (payload.url) {
    try {
      new URL(payload.url);
    } catch {
      return "url must be a valid URL";
    }
  }

  if (payload.imageUrl) {
    try {
      new URL(payload.imageUrl);
    } catch {
      return "image_url must be a valid URL";
    }
  }

  if (payload.language && payload.language.length > 5) {
    return "language must be 5 characters or fewer";
  }

  if (payload.processingStatus && !PROCESSING_STATUSES.has(payload.processingStatus)) {
    return "processing_status is not supported";
  }

  return null;
}

function handleWriteError(error, res) {
  if (error?.code === "23505") {
    return res.status(409).json({ error: "external_id already exists" });
  }

  console.error("Error writing news:", error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function getAllNews(req, res) {
  try {
    const news = await newsModel.getAllNews(requestLanguage(req));
    res.json(news);
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getLatestNews(req, res) {
  const limit = Number(req.query.limit) || 10;

  try {
    const news = await newsModel.getLatestNews(limit, requestLanguage(req));
    res.json(news);
  } catch (error) {
    console.error("Error fetching latest news:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getNewsById(req, res) {
  const { id } = req.params;

  try {
    const news = await newsModel.getNewsById(id, requestLanguage(req));

    if (!news) {
      return res.status(404).json({ error: "News not found" });
    }

    res.json(news);
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function createNews(req, res) {
  const newsPayload = normalizeNewsPayload(req.body);
  const validationError = validateNewsPayload(newsPayload, { requireCoreFields: true });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const news = await newsModel.createNews(newsPayload);
    res.status(201).json(news);
  } catch (error) {
    handleWriteError(error, res);
  }
}

async function updateNews(req, res) {
  const { id } = req.params;
  const newsPayload = normalizeNewsPayload(req.body);
  const validationError = validateNewsPayload(newsPayload);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const news = await newsModel.updateNews(id, newsPayload);

    if (!news) {
      return res.status(404).json({ error: "News not found" });
    }

    res.json(news);
  } catch (error) {
    handleWriteError(error, res);
  }
}

async function deleteNews(req, res) {
  const { id } = req.params;

  try {
    const news = await newsModel.deleteNews(id);

    if (!news) {
      return res.status(404).json({ error: "News not found" });
    }

    res.json(news);
  } catch (error) {
    console.error("Error deleting news:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getAllNews,
  getLatestNews,
  getNewsById,
  createNews,
  updateNews,
  deleteNews
};
