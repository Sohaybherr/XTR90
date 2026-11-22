const repository = require("./rankings.repository");
const { toAssetPath } = require("../../utils/assets");

function rowDto(row) {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    team: row.team_name || row.team_name_snapshot || "Unknown",
    logo: toAssetPath(row.logo_path) || "",
    source: row.source || "unknown",
    type: row.ranking_type || "unknown",
    rankingDate: row.ranking_date || "",
    rank: Number(row.rank || 0),
    points: Number(row.points || 0),
    countryCode: row.country_code || "",
    movement: Number(row.movement || 0),
    national: Boolean(row.is_national),
    classification: {
      tier: row.classification_tier || "unclassified",
      score: Number(row.classification_score || 0),
      source: row.classification_source || "none"
    },
    sourceUrl: row.source_url || "",
    syncedAt: row.api_synced_at || ""
  };
}

async function listRankings(input = {}) {
  const rows = await repository.listRankings(input.type);
  const data = rows.map(rowDto);
  return {
    fifaMen: data.filter((row) => row.type === "fifa_men"),
    uefaClub: data.filter((row) => row.type === "uefa_club"),
    data
  };
}

module.exports = {
  listRankings
};
