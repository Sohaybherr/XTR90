const pool = require("../../config/db");

async function listRankings(type) {
  const values = [];
  const where = [];

  if (type) {
    values.push(type);
    where.push(`tr.ranking_type = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(`
    SELECT
      tr.id,
      tr.team_id,
      tr.source,
      tr.ranking_type,
      tr.ranking_date,
      tr.rank,
      tr.points,
      tr.country_code,
      tr.movement,
      tr.team_name_snapshot,
      tr.source_url,
      tr.api_synced_at,
      t.name AS team_name,
      t.logo_path,
      t.is_national,
      t.classification_tier,
      t.classification_score,
      t.classification_source
    FROM team_rankings tr
    JOIN teams t ON t.id = tr.team_id
    JOIN (
      SELECT ranking_type, MAX(ranking_date) AS ranking_date
      FROM team_rankings
      GROUP BY ranking_type
    ) latest
      ON latest.ranking_type = tr.ranking_type
     AND latest.ranking_date = tr.ranking_date
    ${whereSql}
    ORDER BY tr.ranking_type, tr.rank, tr.team_name_snapshot
  `, values);

  return result.rows;
}

module.exports = {
  listRankings
};
