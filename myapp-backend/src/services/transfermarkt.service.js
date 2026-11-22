const DEFAULT_BASE_URL = "https://transfermarkt-api.fly.dev";
const CACHE_TTL_DAYS = Number(process.env.TRANSFERMARKT_CACHE_TTL_DAYS || 7);

function getBaseUrl() {
  return (process.env.TRANSFERMARKT_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildUrl(pathname, params = {}) {
  const url = new URL(`${getBaseUrl()}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

async function requestJson(pathname, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TRANSFERMARKT_TIMEOUT_MS || 12000));

  try {
    const response = await fetch(buildUrl(pathname, params), {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Transfermarkt API returned ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scorePlayerSearchResult(player, result) {
  const playerNames = buildPlayerSearchQueries(player).map(normalizeText);
  const resultName = normalizeText(result.name);
  let score = 0;

  if (playerNames.includes(resultName)) score += 100;
  if (playerNames.some((name) => name && (resultName.includes(name) || name.includes(resultName)))) score += 30;
  if (player.nationality && result.nationalities?.some((country) => normalizeText(country) === normalizeText(player.nationality))) {
    score += 10;
  }
  if (player.position && normalizeText(result.position).includes(normalizeText(player.position))) {
    score += 5;
  }

  return score;
}

function firstNameToken(value) {
  return String(value || "").split(/\s+/).filter(Boolean)[0] || "";
}

function shortLastName(value) {
  const parts = String(value || "").split(/\s+/).filter(Boolean);
  const particles = new Set(["da", "de", "del", "di", "dos", "van", "von"]);

  if (!parts.length) return "";
  if (parts.length >= 2 && particles.has(parts[0].toLowerCase())) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
}

function lastNameToken(value) {
  const parts = String(value || "").split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function buildPlayerSearchQueries(player) {
  const candidates = [
    player.name,
    `${player.firstname || ""} ${player.lastname || ""}`.trim(),
    `${firstNameToken(player.firstname)} ${shortLastName(player.lastname)}`.trim(),
    `${firstNameToken(player.firstname)} ${lastNameToken(player.lastname)}`.trim()
  ];
  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = normalizeText(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchPlayer(player) {
  let bestMatch = null;
  let bestScore = -1;

  for (const query of buildPlayerSearchQueries(player)) {
    const search = await requestJson(`/players/search/${encodeURIComponent(query)}`, { page_number: 1 });
    const results = Array.isArray(search.results) ? search.results : [];
    if (!results.length) continue;

    const candidate = results
      .map((result) => ({ result, score: scorePlayerSearchResult(player, result) }))
      .sort((a, b) => b.score - a.score)[0];

    if (candidate.score > bestScore) {
      bestMatch = candidate.result;
      bestScore = candidate.score;
    }

    if (candidate.score >= 100) break;
  }

  return bestScore >= 30 ? bestMatch : null;
}

async function getPlayerMarketValue(transfermarktId) {
  return requestJson(`/players/${encodeURIComponent(transfermarktId)}/market_value`);
}

async function getPlayerTransfers(transfermarktId) {
  return requestJson(`/players/${encodeURIComponent(transfermarktId)}/transfers`);
}

async function getPlayerResource(transfermarktId, resource) {
  const paths = {
    achievements: `/players/${encodeURIComponent(transfermarktId)}/achievements`,
    injuries: `/players/${encodeURIComponent(transfermarktId)}/injuries`,
    jersey_numbers: `/players/${encodeURIComponent(transfermarktId)}/jersey_numbers`,
    profile: `/players/${encodeURIComponent(transfermarktId)}/profile`,
    stats: `/players/${encodeURIComponent(transfermarktId)}/stats`
  };

  if (!paths[resource]) {
    throw new Error(`Unsupported Transfermarkt resource: ${resource}`);
  }

  return requestJson(paths[resource]);
}

function ttlDays() {
  return Number.isFinite(CACHE_TTL_DAYS) && CACHE_TTL_DAYS > 0 ? CACHE_TTL_DAYS : 7;
}

module.exports = {
  getPlayerMarketValue,
  getPlayerResource,
  getPlayerTransfers,
  searchPlayer,
  ttlDays
};
