const repository = require("./transfers.repository.ts");
require("./transfers.types.ts");

function parseTransferFee(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;

  const text = String(value).trim().toLowerCase();
  if (!text || text === "n/a" || text === "unknown" || text === "undisclosed") return 0;

  const amount = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (text.includes("bn") || text.includes("b")) return Math.trunc(amount * 1000000000);
  if (text.includes("m")) return Math.trunc(amount * 1000000);
  if (text.includes("k")) return Math.trunc(amount * 1000);
  return Math.trunc(amount);
}

function ageFromBirthDate(birthDate, atDate = new Date()) {
  if (!birthDate) return 0;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return 0;

  let age = atDate.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = atDate.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && atDate.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : 0;
}

function teamDto(id, name, logo) {
  return {
    id: id ? Number(id) : 0,
    name: name || "Unknown Club",
    logo: logo || ""
  };
}

function transferDto(row) {
  const transferDate = row.transfer_date || null;
  return {
    id: Number(row.id),
    player: row.player_name || "Unknown Player",
    playerId: Number(row.player_id),
    age: ageFromBirthDate(row.birth_date, transferDate ? new Date(transferDate) : new Date()),
    nationality: row.nationality || "Unknown",
    position: row.position || "Unknown",
    oldTeam: teamDto(row.from_team_id, row.old_team_name, row.old_team_logo),
    newTeam: teamDto(row.to_team_id, row.new_team_name, row.new_team_logo),
    transferType: row.transfer_type || "unknown",
    transferFee: Number(row.transfer_fee || 0),
    transferDate: transferDate || "1900-01-01",
    league: { id: row.league_id ? Number(row.league_id) : 0, name: row.league_name || "Unknown League" },
    season: row.season === null || row.season === undefined ? 0 : Number(row.season)
  };
}

function compactTransferDto(row) {
  return {
    player: row.player_name || "Unknown Player",
    playerId: Number(row.player_id),
    position: row.position || "Unknown",
    age: ageFromBirthDate(row.birth_date, row.transfer_date ? new Date(row.transfer_date) : new Date()),
    nationality: row.nationality || "Unknown",
    transferDate: row.transfer_date || "1900-01-01",
    transferType: row.transfer_type || "unknown",
    transferFee: Number(row.transfer_fee || 0)
  };
}

function historyDto(row) {
  return {
    id: Number(row.id),
    oldTeam: teamDto(row.from_team_id, row.old_team_name, row.old_team_logo),
    newTeam: teamDto(row.to_team_id, row.new_team_name, row.new_team_logo),
    season: row.season === null || row.season === undefined ? 0 : Number(row.season),
    transferDate: row.transfer_date || "1900-01-01",
    transferType: row.transfer_type || "unknown",
    transferFee: Number(row.transfer_fee || 0)
  };
}

function paginated(rows, pagination) {
  const total = rows.length ? Number(rows[0].total || 0) : 0;
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit),
    data: rows.map(transferDto)
  };
}

function mapTransferType(raw) {
  const value = String(raw || "").toLowerCase();
  if (value.includes("loan")) return "loan";
  if (value.includes("free") || value.includes("without club")) return "free";
  if (parseTransferFee(value) > 0) return "permanent";
  if (value.includes("permanent") || value.includes("transfer") || value.includes("fee")) return "permanent";
  return "unknown";
}

function providerSeasonToYear(season) {
  const text = String(season || "").trim();
  const match = text.match(/^(\d{2})\/\d{2}$/);
  if (!match) return null;
  const prefix = Number(match[1]);
  return prefix >= 70 ? 1900 + prefix : 2000 + prefix;
}

function normalizeTransfer(raw, playerId) {
  const fee = parseTransferFee(raw?.fee ?? raw?.transferFee ?? raw?.value);
  return {
    playerId: Number(playerId),
    oldTeamId: null,
    newTeamId: null,
    transferType: mapTransferType(raw?.type || raw?.transferType || (fee > 0 ? "fee" : "")),
    transferFee: fee,
    transferDate: raw?.date || raw?.transferDate || null,
    providerTransferId: raw?.id ? String(raw.id) : null,
    providerSeason: raw?.season || null,
    seasonYear: providerSeasonToYear(raw?.season),
    oldTeamProvider: raw?.clubFrom || raw?.from || raw?.oldTeam || null,
    newTeamProvider: raw?.clubTo || raw?.to || raw?.newTeam || null
  };
}

function normalizeApiFootballTransfer(raw, playerId) {
  const teams = raw?.teams || {};
  const transferFee = parseTransferFee(raw?.fee ?? raw?.transferFee ?? raw?.value ?? raw?.type);
  return {
    playerId: Number(playerId),
    oldTeamId: null,
    newTeamId: null,
    transferType: mapTransferType(raw?.type),
    transferFee,
    transferDate: raw?.date || null,
    providerTransferId: null,
    providerSeason: null,
    oldTeamProvider: teams.out || null,
    newTeamProvider: teams.in || null
  };
}

function groupIncomingOutgoing(rows, teamId) {
  return {
    incoming: rows
      .filter((row) => String(row.to_team_id) === String(teamId))
      .map(compactTransferDto),
    outgoing: rows
      .filter((row) => String(row.from_team_id) === String(teamId))
      .map(compactTransferDto)
  };
}

function countBy(rows, keyBuilder, limit = 10) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = keyBuilder(row);
    if (!key?.id && !key?.name) return;
    const mapKey = `${key.id || ""}:${key.name || ""}`;
    const current = counts.get(mapKey) || { ...key, count: 0 };
    current.count += 1;
    counts.set(mapKey, current);
  });

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, limit);
}

function calculateTransferSummary(rows) {
  const typeCounts = rows.reduce((acc, row) => {
    const type = row.transfer_type || "unknown";
    if (type === "loan") acc.loans += 1;
    else if (type === "permanent") acc.permanent += 1;
    else if (type === "free") acc.freeTransfers += 1;
    else acc.unknown += 1;
    return acc;
  }, { loans: 0, permanent: 0, freeTransfers: 0, unknown: 0 });

  return {
    totalTransfers: rows.length,
    ...typeCounts,
    mostActiveClubs: countBy(rows.flatMap((row) => [
      { id: row.from_team_id, name: row.old_team_name },
      { id: row.to_team_id, name: row.new_team_name }
    ]), (row) => ({ id: row.id ? Number(row.id) : null, name: row.name || null })),
    mostActiveLeagues: countBy(rows, (row) => ({ id: row.league_id ? Number(row.league_id) : null, name: row.league_name || null })),
    topTransferredPositions: countBy(rows, (row) => ({ name: row.position || "Unknown" })),
    transfersByNationality: countBy(rows, (row) => ({ name: row.nationality || "Unknown" }))
  };
}

async function getLatestTransfers(input) {
  const rows = await repository.listTransfers(input.filters, input.pagination);
  return paginated(rows, input.pagination);
}

async function getTeamTransfers(input) {
  const rows = await repository.getTeamTransfers(input.teamId);
  return {
    teamId: input.teamId,
    transfers: groupIncomingOutgoing(rows, input.teamId)
  };
}

async function getPlayerTransferHistory(input) {
  const rows = await repository.getPlayerTransferHistory(input.playerId);
  return {
    playerId: input.playerId,
    transfers: rows.map(historyDto)
  };
}

async function searchTransfers(input) {
  const rows = await repository.listTransfers(input.filters, input.pagination);
  return paginated(rows, input.pagination);
}

async function getTransferWindow() {
  const [today, last7Days, last30Days] = await Promise.all([
    repository.getWindowTransfers(0),
    repository.getWindowTransfers(7),
    repository.getWindowTransfers(30)
  ]);

  return {
    today: today.map(transferDto),
    last7Days: last7Days.map(transferDto),
    last30Days: last30Days.map(transferDto)
  };
}

async function getTransferSummary(input) {
  const rows = await repository.getSummaryRows(input.filters);
  return calculateTransferSummary(rows);
}

function extractProviderTransfers(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.transfers)) return payload.transfers;
  if (Array.isArray(payload?.data?.transfers)) return payload.data.transfers;
  return [];
}

function getApiFootballConfig() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    const error = new Error("API_FOOTBALL_KEY is not configured.");
    error.statusCode = 500;
    throw error;
  }
  return {
    apiKey,
    baseUrl: (process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/+$/, "")
  };
}

async function fetchApiFootballTransfers(target) {
  const { apiKey, baseUrl } = getApiFootballConfig();
  const url = new URL(`${baseUrl}/transfers`);
  url.searchParams.set(target.type, target.apiId);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`API-Football returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors && (Array.isArray(payload.errors) ? payload.errors.length : Object.keys(payload.errors).length)) {
    throw new Error(`API-Football errors: ${JSON.stringify(payload.errors)}`);
  }
  return Array.isArray(payload.response) ? payload.response : [];
}

async function syncTransfers(options = {}) {
  const targets = await repository.getApiFootballSyncTargets(options);
  const stats = {
    provider: "api-football",
    targetsScanned: targets.length,
    fetched: 0,
    normalized: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  for (const target of targets) {
    try {
      const responseItems = await fetchApiFootballTransfers(target);
      stats.fetched += 1;

      for (const item of responseItems) {
        const playerApiId = Number(item?.player?.id || 0);
        const player = playerApiId ? await repository.getPlayerByApiId(playerApiId) : null;
        const rawTransfers = extractProviderTransfers(item);

        for (const rawTransfer of rawTransfers) {
          if (!player) {
            stats.skipped += 1;
            continue;
          }

          const normalized = normalizeApiFootballTransfer(rawTransfer, player.id);
          stats.normalized += 1;

          const [oldTeam, newTeam] = await Promise.all([
            normalized.oldTeamProvider?.id ? repository.getTeamByApiId(normalized.oldTeamProvider.id) : null,
            normalized.newTeamProvider?.id ? repository.getTeamByApiId(normalized.newTeamProvider.id) : null
          ]);

          normalized.oldTeamId = oldTeam ? Number(oldTeam.id) : null;
          normalized.newTeamId = newTeam ? Number(newTeam.id) : null;

          if (!normalized.transferDate || (!normalized.oldTeamId && !normalized.newTeamId)) {
            stats.skipped += 1;
            continue;
          }

          const saved = await repository.upsertTransfer(normalized);
          if (saved.inserted) stats.inserted += 1;
          else stats.updated += 1;
        }
      }
    } catch (error) {
      stats.errors.push({
        targetType: target.type,
        apiId: target.apiId,
        error: error.message
      });
    }
  }

  console.log("Transfer sync finished", stats);
  return stats;
}

module.exports = {
  calculateTransferSummary,
  getLatestTransfers,
  getPlayerTransferHistory,
  getTeamTransfers,
  getTransferSummary,
  getTransferWindow,
  groupIncomingOutgoing,
  mapTransferType,
  normalizeTransfer,
  searchTransfers,
  syncTransfers,
  _helpers: {
    ageFromBirthDate,
    extractProviderTransfers,
    parseTransferFee,
    providerSeasonToYear,
    transferDto
  }
};
