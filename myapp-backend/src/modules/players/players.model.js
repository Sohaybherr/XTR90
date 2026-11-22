const pool = require("../../config/db");
const { toAssetPath } = require("../../utils/assets");

const playerSelect = `
  SELECT
    p.*,
    tsp.team_id AS current_team_id,
    tsp.shirt_number,
    tsp.position AS squad_position
  FROM players p
  LEFT JOIN team_squad_players tsp
    ON tsp.player_id = p.id AND tsp.is_current = TRUE
`;

function playerDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    apiId: row.api_id,
    name: row.name,
    firstname: row.firstname,
    lastname: row.lastname,
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    birthCountry: row.birth_country,
    nationality: row.nationality,
    height: row.height,
    weight: row.weight,
    position: row.squad_position || row.position,
    photo: toAssetPath(row.photo_path),
    currentTeamId: row.current_team_id,
    shirtNumber: row.shirt_number,
    transfermarktId: row.transfermarkt_id,
    transfermarktUrl: row.transfermarkt_url,
    transfermarktSyncedAt: row.transfermarkt_synced_at,
    apiSyncedAt: row.api_synced_at,
    apiUpdatedAt: row.api_updated_at
  };
}

async function getAllPlayers() {
  const result = await pool.query(`${playerSelect} ORDER BY p.name`);
  return result.rows;
}

async function getPlayerById(id) {
  const result = await pool.query(`${playerSelect} WHERE p.id = $1`, [id]);
  return result.rows[0];
}

async function getPlayerByApiId(apiId) {
  const result = await pool.query(`${playerSelect} WHERE p.api_id = $1`, [apiId]);
  return result.rows[0];
}

async function getPlayersByCountry(countryId) {
  const result = await pool.query(
    `
      ${playerSelect}
      LEFT JOIN countries c ON c.id = $1
      WHERE c.id IS NOT NULL
        AND (
          p.nationality ILIKE c.name
          OR p.birth_country ILIKE c.name
          OR p.nationality ILIKE c.code
          OR p.birth_country ILIKE c.code
        )
      ORDER BY p.name
    `,
    [countryId]
  );
  return result.rows;
}

async function getPlayersByTeam(teamId) {
  const result = await pool.query(
    `
      ${playerSelect}
      WHERE tsp.team_id = $1
      ORDER BY tsp.position NULLS LAST, tsp.shirt_number NULLS LAST, p.name
    `,
    [teamId]
  );
  return result.rows;
}

async function getPlayersByPosition(position) {
  const result = await pool.query(`${playerSelect} WHERE p.position ILIKE $1 ORDER BY p.name`, [position]);
  return result.rows;
}

async function getPlayersByName(name) {
  const result = await pool.query(`${playerSelect} WHERE p.name ILIKE $1 ORDER BY p.name`, [`%${name}%`]);
  return result.rows;
}

async function getPlayerCurrentTeam(playerId) {
  const result = await pool.query(
    `
      SELECT t.*
      FROM team_squad_players tsp
      JOIN teams t ON t.id = tsp.team_id
      WHERE tsp.player_id = $1
        AND tsp.is_current = TRUE
      ORDER BY tsp.updated_at DESC, tsp.id DESC
      LIMIT 1
    `,
    [playerId]
  );
  return result.rows[0] || null;
}

async function getPlayerSeasonStatistics(playerId) {
  const result = await pool.query(
    `
      SELECT
        pss.*,
        t.name AS team_name,
        t.logo_path AS team_logo,
        c.name AS competition_name,
        c.logo AS competition_logo,
        cs.season_year
      FROM player_season_statistics pss
      JOIN teams t ON t.id = pss.team_id
      JOIN competition_seasons cs ON cs.id = pss.competition_season_id
      JOIN competitions c ON c.id = cs.competition_id
      WHERE pss.player_id = $1
      ORDER BY cs.season_year DESC, c.name, t.name
    `,
    [playerId]
  );
  return result.rows;
}

async function getPlayerTeamSeasons(playerId) {
  const result = await pool.query(
    `
      SELECT pts.*, t.name AS team_name, t.logo_path AS team_logo
      FROM player_team_seasons pts
      JOIN teams t ON t.id = pts.team_id
      WHERE pts.player_id = $1
      ORDER BY pts.season DESC, pts.is_current DESC, t.name
    `,
    [playerId]
  );
  return result.rows;
}

async function getPlayerTransfers(playerId) {
  const result = await pool.query(
    `
      SELECT
        pt.*,
        ft.name AS from_team_name,
        ft.logo_path AS from_team_logo,
        tt.name AS to_team_name,
        tt.logo_path AS to_team_logo
      FROM player_transfers pt
      LEFT JOIN teams ft ON ft.id = pt.from_team_id
      LEFT JOIN teams tt ON tt.id = pt.to_team_id
      WHERE pt.player_id = $1
      ORDER BY pt.transfer_date DESC, pt.id DESC
    `,
    [playerId]
  );
  return result.rows;
}

async function setPlayerTransfermarktMatch(playerId, match) {
  const result = await pool.query(
    `
      UPDATE players
      SET transfermarkt_id = $2,
          transfermarkt_url = COALESCE($3, transfermarkt_url),
          transfermarkt_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `,
    [playerId, match.id, match.url || null]
  );
  return result.rows[0];
}

async function getTransfermarktCache(entityType, transfermarktId, resource) {
  const result = await pool.query(
    `
      SELECT payload, fetched_at, expires_at
      FROM transfermarkt_cache
      WHERE entity_type = $1
        AND transfermarkt_id = $2
        AND resource = $3
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `,
    [entityType, String(transfermarktId), resource]
  );
  return result.rows[0] || null;
}

async function getTransfermarktCacheAny(entityType, transfermarktId, resource) {
  const result = await pool.query(
    `
      SELECT payload, fetched_at, expires_at
      FROM transfermarkt_cache
      WHERE entity_type = $1
        AND transfermarkt_id = $2
        AND resource = $3
      ORDER BY fetched_at DESC
      LIMIT 1
    `,
    [entityType, String(transfermarktId), resource]
  );
  return result.rows[0] || null;
}

async function getTransfermarktCaches(entityType, transfermarktId, resources) {
  const result = await pool.query(
    `
      SELECT resource, payload, fetched_at, expires_at
      FROM transfermarkt_cache
      WHERE entity_type = $1
        AND transfermarkt_id = $2
        AND resource = ANY($3)
        AND expires_at > CURRENT_TIMESTAMP
    `,
    [entityType, String(transfermarktId), resources]
  );
  return result.rows;
}

async function saveTransfermarktCache({ entityType, entityId, transfermarktId, resource, payload, ttlDays }) {
  const result = await pool.query(
    `
      INSERT INTO transfermarkt_cache (
        entity_type,
        entity_id,
        transfermarkt_id,
        resource,
        payload,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP + ($6::text || ' days')::interval)
      ON CONFLICT (entity_type, transfermarkt_id, resource) DO UPDATE
      SET entity_id = COALESCE(EXCLUDED.entity_id, transfermarkt_cache.entity_id),
          payload = EXCLUDED.payload,
          fetched_at = CURRENT_TIMESTAMP,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      RETURNING payload, fetched_at, expires_at
    `,
    [
      entityType,
      entityId || null,
      String(transfermarktId),
      resource,
      JSON.stringify(payload),
      ttlDays
    ]
  );
  return result.rows[0];
}

module.exports = {
  getAllPlayers,
  getPlayerById,
  getPlayerByApiId,
  getPlayersByCountry,
  getPlayersByTeam,
  getPlayersByPosition,
  getPlayersByName,
  getPlayerCurrentTeam,
  getPlayerSeasonStatistics,
  getPlayerTeamSeasons,
  getPlayerTransfers,
  setPlayerTransfermarktMatch,
  getTransfermarktCache,
  getTransfermarktCacheAny,
  getTransfermarktCaches,
  saveTransfermarktCache,
  playerDto
};
