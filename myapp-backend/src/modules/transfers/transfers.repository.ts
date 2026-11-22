const pool = require("../../config/db");

const TOP_FIVE_LEAGUE_API_IDS = [39, 140, 135, 78, 61];

function isTopFiveLeagueApiId(value) {
  return TOP_FIVE_LEAGUE_API_IDS.includes(Number(value));
}

function competitionMatchSql(columnPrefix, value, explicitApiId = false) {
  const numericValue = Number(value);
  if (explicitApiId || isTopFiveLeagueApiId(numericValue)) {
    return `${columnPrefix}.api_id = ${numericValue}`;
  }

  return `(
          ${columnPrefix}.id = ${numericValue}
          OR (
            ${columnPrefix}.api_id = ${numericValue}
            AND NOT EXISTS (SELECT 1 FROM competitions c_exists WHERE c_exists.id = ${numericValue})
          )
        )`;
}

function buildTransferSelect(contextFilter = {}) {
  const preferredLeagueWhere = contextFilter.leagueApiId
    ? `AND ${competitionMatchSql("preferred_competition", contextFilter.leagueApiId, true)}`
    : contextFilter.leagueId
      ? `AND ${competitionMatchSql("preferred_competition", contextFilter.leagueId)}`
      : "";

  return `
  SELECT
    pt.id,
    pt.player_id,
    pt.from_team_id,
    pt.to_team_id,
    pt.transfer_type,
    COALESCE(pt.transfer_fee, 0)::bigint AS transfer_fee,
    pt.transfer_date,
    pt.api_synced_at,
    pt.api_updated_at,
    p.name AS player_name,
    p.birth_date,
    p.nationality,
    p.position,
    p.photo_path,
    old_team.name AS old_team_name,
    old_team.logo_path AS old_team_logo,
    new_team.name AS new_team_name,
    new_team.logo_path AS new_team_logo,
    COALESCE(preferred_league_context.competition_id, league_context.competition_id) AS league_id,
    COALESCE(preferred_league_context.competition_name, league_context.competition_name) AS league_name,
    COALESCE(preferred_league_context.season_year, league_context.season_year) AS season
  FROM player_transfers pt
  JOIN players p ON p.id = pt.player_id
  LEFT JOIN teams old_team ON old_team.id = pt.from_team_id
  LEFT JOIN teams new_team ON new_team.id = pt.to_team_id
  LEFT JOIN LATERAL (
    SELECT preferred_competition.id AS competition_id, preferred_competition.name AS competition_name, preferred_season.season_year
    FROM team_competition_seasons preferred_tcs
    JOIN competition_seasons preferred_season ON preferred_season.id = preferred_tcs.competition_season_id
    JOIN competitions preferred_competition ON preferred_competition.id = preferred_season.competition_id
    WHERE preferred_tcs.team_id IN (pt.from_team_id, pt.to_team_id)
      ${preferredLeagueWhere}
      AND (
        pt.transfer_date IS NULL
        OR preferred_season.season_year = CASE
          WHEN EXTRACT(MONTH FROM pt.transfer_date) >= 7
            THEN EXTRACT(YEAR FROM pt.transfer_date)::integer
          ELSE EXTRACT(YEAR FROM pt.transfer_date)::integer - 1
        END
        OR preferred_season.current = TRUE
      )
    ORDER BY
      CASE
        WHEN pt.transfer_date IS NOT NULL
         AND preferred_season.season_year = CASE
          WHEN EXTRACT(MONTH FROM pt.transfer_date) >= 7
            THEN EXTRACT(YEAR FROM pt.transfer_date)::integer
          ELSE EXTRACT(YEAR FROM pt.transfer_date)::integer - 1
        END THEN 0
        WHEN preferred_season.current = TRUE THEN 1
        ELSE 2
      END,
      preferred_season.season_year DESC
    LIMIT 1
  ) preferred_league_context ON ${preferredLeagueWhere ? "TRUE" : "FALSE"}
  LEFT JOIN LATERAL (
    SELECT c.id AS competition_id, c.name AS competition_name, cs.season_year
    FROM team_competition_seasons tcs
    JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE tcs.team_id IN (pt.from_team_id, pt.to_team_id)
      AND (
        pt.transfer_date IS NULL
        OR cs.season_year = CASE
          WHEN EXTRACT(MONTH FROM pt.transfer_date) >= 7
            THEN EXTRACT(YEAR FROM pt.transfer_date)::integer
          ELSE EXTRACT(YEAR FROM pt.transfer_date)::integer - 1
        END
        OR cs.current = TRUE
      )
    ORDER BY
      CASE
        WHEN pt.transfer_date IS NOT NULL
         AND cs.season_year = CASE
          WHEN EXTRACT(MONTH FROM pt.transfer_date) >= 7
            THEN EXTRACT(YEAR FROM pt.transfer_date)::integer
          ELSE EXTRACT(YEAR FROM pt.transfer_date)::integer - 1
        END THEN 0
        WHEN cs.current = TRUE THEN 1
        ELSE 2
      END,
      CASE WHEN c.api_id = ANY(ARRAY[39, 140, 135, 78, 61]) THEN 0 ELSE 1 END,
      CASE WHEN lower(COALESCE(c.type, '')) = 'league' THEN 0 ELSE 1 END,
      cs.season_year DESC,
      c.name
    LIMIT 1
  ) league_context ON TRUE
`;
}

function addDateLeagueSeasonFilters(where, values, filters) {
  const transferSeasonSql = `CASE
        WHEN pt.transfer_date IS NULL THEN NULL
        WHEN EXTRACT(MONTH FROM pt.transfer_date) >= 7 THEN EXTRACT(YEAR FROM pt.transfer_date)::integer
        ELSE EXTRACT(YEAR FROM pt.transfer_date)::integer - 1
      END`;

  if (filters.leagueId || filters.leagueApiId) {
    values.push(filters.leagueId || filters.leagueApiId);
    const leagueClause = filters.leagueApiId
      ? `c_filter.api_id = $${values.length}`
      : isTopFiveLeagueApiId(filters.leagueId)
        ? `c_filter.api_id = $${values.length}`
        : `(
            cs_filter.competition_id = $${values.length}
            OR (
              c_filter.api_id = $${values.length}
              AND NOT EXISTS (SELECT 1 FROM competitions c_exists WHERE c_exists.id = $${values.length})
            )
          )`;
    where.push(`EXISTS (
      SELECT 1
      FROM team_competition_seasons tcs_filter
      JOIN competition_seasons cs_filter ON cs_filter.id = tcs_filter.competition_season_id
      JOIN competitions c_filter ON c_filter.id = cs_filter.competition_id
      WHERE tcs_filter.team_id IN (pt.from_team_id, pt.to_team_id)
        AND ${leagueClause}
        AND (pt.transfer_date IS NULL OR cs_filter.season_year = ${transferSeasonSql})
    )`);
  } else if (filters.topFiveOnly) {
    values.push(TOP_FIVE_LEAGUE_API_IDS);
    where.push(`EXISTS (
      SELECT 1
      FROM team_competition_seasons tcs_filter
      JOIN competition_seasons cs_filter ON cs_filter.id = tcs_filter.competition_season_id
      JOIN competitions c_filter ON c_filter.id = cs_filter.competition_id
      WHERE tcs_filter.team_id IN (pt.from_team_id, pt.to_team_id)
        AND c_filter.api_id = ANY($${values.length})
        AND (pt.transfer_date IS NULL OR cs_filter.season_year = ${transferSeasonSql})
    )`);
  }

  if (filters.season) {
    values.push(String(filters.season));
    where.push(`(
      ${transferSeasonSql}
    )::text = $${values.length}`);
  }

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`pt.transfer_date >= $${values.length}`);
  }

  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`pt.transfer_date <= $${values.length}`);
  }
}

function addSearchFilters(where, values, filters) {
  if (filters.player) {
    values.push(`%${filters.player}%`);
    where.push(`p.name ILIKE $${values.length}`);
  }

  if (filters.team) {
    values.push(`%${filters.team}%`);
    where.push(`(old_team.name ILIKE $${values.length} OR new_team.name ILIKE $${values.length})`);
  }

  if (filters.league) {
    values.push(`%${filters.league}%`);
    where.push(`EXISTS (
      SELECT 1
      FROM team_competition_seasons tcs_filter
      JOIN competition_seasons cs_filter ON cs_filter.id = tcs_filter.competition_season_id
      JOIN competitions c_filter ON c_filter.id = cs_filter.competition_id
      WHERE tcs_filter.team_id IN (pt.from_team_id, pt.to_team_id)
        AND c_filter.name ILIKE $${values.length}
    )`);
  }

  if (filters.nationality) {
    values.push(`%${filters.nationality}%`);
    where.push(`p.nationality ILIKE $${values.length}`);
  }

  if (filters.position) {
    values.push(`%${filters.position}%`);
    where.push(`p.position ILIKE $${values.length}`);
  }
}

async function listTransfers(filters, pagination) {
  const values = [];
  const where = [];
  addDateLeagueSeasonFilters(where, values, filters);
  addSearchFilters(where, values, filters);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const selectSql = buildTransferSelect(filters);
  values.push(pagination.limit, pagination.offset);

  const result = await pool.query(`
    WITH filtered AS (
      ${selectSql}
      ${whereSql}
    ),
    counted AS (
      SELECT COUNT(*)::integer AS total FROM filtered
    )
    SELECT filtered.*, counted.total
    FROM filtered
    CROSS JOIN counted
    ORDER BY COALESCE(filtered.transfer_fee, 0) DESC, filtered.transfer_date DESC NULLS LAST, filtered.id DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `, values);

  return result.rows;
}

async function getTeamTransfers(teamId) {
  const result = await pool.query(`
    ${buildTransferSelect()}
    WHERE pt.from_team_id = $1 OR pt.to_team_id = $1
    ORDER BY COALESCE(pt.transfer_fee, 0) DESC, pt.transfer_date DESC NULLS LAST, pt.id DESC
  `, [teamId]);
  return result.rows;
}

async function getPlayerTransferHistory(playerId) {
  const result = await pool.query(`
    ${buildTransferSelect()}
    WHERE pt.player_id = $1
    ORDER BY pt.transfer_date DESC NULLS LAST, pt.id DESC
  `, [playerId]);
  return result.rows;
}

async function getWindowTransfers(days) {
  const result = await pool.query(`
    ${buildTransferSelect()}
    WHERE pt.transfer_date >= CURRENT_DATE - ($1::text || ' days')::interval
      AND pt.transfer_date <= CURRENT_DATE
    ORDER BY COALESCE(pt.transfer_fee, 0) DESC, pt.transfer_date DESC NULLS LAST, pt.id DESC
  `, [days]);
  return result.rows;
}

async function getSummaryRows(filters) {
  const values = [];
  const where = [];
  addDateLeagueSeasonFilters(where, values, filters);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const selectSql = buildTransferSelect(filters);

  const result = await pool.query(`
    ${selectSql}
    ${whereSql}
    ORDER BY COALESCE(pt.transfer_fee, 0) DESC, pt.transfer_date DESC NULLS LAST, pt.id DESC
  `, values);
  return result.rows;
}

async function getSyncCandidates(options) {
  const values = [];
  const where = ["p.transfermarkt_id IS NOT NULL"];

  if (options.playerId) {
    values.push(options.playerId);
    where.push(`p.id = $${values.length}`);
  }

  if (!options.force) {
    where.push(`NOT EXISTS (
      SELECT 1
      FROM transfermarkt_cache tc
      WHERE tc.entity_type = 'player'
        AND tc.entity_id = p.id
        AND tc.transfermarkt_id = p.transfermarkt_id
        AND tc.resource = 'transfers'
        AND tc.fetched_at > CURRENT_TIMESTAMP - INTERVAL '1 day'
    )`);
  }

  let limitClause = "";
  if (options.limit) {
    values.push(options.limit);
    limitClause = `LIMIT $${values.length}`;
  }

  const result = await pool.query(`
    SELECT id, name, firstname, lastname, nationality, position, transfermarkt_id, transfermarkt_url
    FROM players p
    WHERE ${where.join(" AND ")}
    ORDER BY p.transfermarkt_synced_at NULLS FIRST, p.id
    ${limitClause}
  `, values);

  return result.rows;
}

async function getApiFootballSyncTargets(options) {
  if (options.playerId) {
    const result = await pool.query("SELECT id, api_id, name FROM players WHERE id = $1 AND api_id IS NOT NULL", [options.playerId]);
    return result.rows.map((row) => ({ type: "player", id: Number(row.id), apiId: Number(row.api_id), name: row.name }));
  }

  const values = [];
  const where = ["api_id IS NOT NULL"];

  if (options.teamId) {
    values.push(options.teamId);
    where.push(`id = $${values.length}`);
  }

  let limitClause = "";
  if (options.limit) {
    values.push(options.limit);
    limitClause = `LIMIT $${values.length}`;
  }

  const result = await pool.query(`
    SELECT id, api_id, name
    FROM teams
    WHERE ${where.join(" AND ")}
    ORDER BY api_synced_at NULLS FIRST, id
    ${limitClause}
  `, values);
  return result.rows.map((row) => ({ type: "team", id: Number(row.id), apiId: Number(row.api_id), name: row.name }));
}

async function getPlayerByApiId(apiId) {
  const result = await pool.query("SELECT id, api_id, name FROM players WHERE api_id = $1 LIMIT 1", [apiId]);
  return result.rows[0] || null;
}

async function getTeamByApiId(apiId) {
  const result = await pool.query("SELECT id, api_id, name FROM teams WHERE api_id = $1 LIMIT 1", [apiId]);
  return result.rows[0] || null;
}

async function findTeamByProviderClub(club) {
  if (!club?.name || /^without club$/i.test(club.name)) return null;
  const name = String(club.name).trim();
  const result = await pool.query(`
    SELECT id, name
    FROM teams
    WHERE lower(name) = lower($1)
       OR lower(short_name) = lower($1)
       OR lower(code) = lower($1)
       OR lower(name) = lower(regexp_replace($1, '\\s+(FC|CF|SC|AC)$', '', 'i'))
    ORDER BY
      CASE WHEN lower(name) = lower($1) THEN 0 ELSE 1 END,
      id
    LIMIT 1
  `, [name]);
  return result.rows[0] || null;
}

async function findExistingTransfer(transfer) {
  const result = await pool.query(`
    SELECT *
    FROM player_transfers
    WHERE player_id = $1
      AND COALESCE(from_team_id, -1) = COALESCE($2::bigint, -1)
      AND COALESCE(to_team_id, -1) = COALESCE($3::bigint, -1)
      AND COALESCE(transfer_date, DATE '0001-01-01') = COALESCE($4::date, DATE '0001-01-01')
    ORDER BY id
    LIMIT 1
  `, [transfer.playerId, transfer.oldTeamId, transfer.newTeamId, transfer.transferDate]);
  return result.rows[0] || null;
}

async function upsertTransfer(transfer) {
  const existing = await findExistingTransfer(transfer);
  if (existing) {
    const result = await pool.query(`
      UPDATE player_transfers
      SET transfer_type = COALESCE($2, transfer_type),
          transfer_fee = COALESCE($3, transfer_fee, 0),
          api_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *, false AS inserted
    `, [existing.id, transfer.transferType, transfer.transferFee]);
    return result.rows[0];
  }

  const result = await pool.query(`
    INSERT INTO player_transfers (
      player_id,
      from_team_id,
      to_team_id,
      transfer_type,
      transfer_fee,
      transfer_date,
      api_synced_at,
      api_updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *, true AS inserted
  `, [
    transfer.playerId,
    transfer.oldTeamId,
    transfer.newTeamId,
    transfer.transferType,
    transfer.transferFee || 0,
    transfer.transferDate
  ]);
  return result.rows[0];
}

async function saveProviderCache(player, payload, ttlDays) {
  await pool.query(`
    INSERT INTO transfermarkt_cache (
      entity_type,
      entity_id,
      transfermarkt_id,
      resource,
      payload,
      expires_at
    )
    VALUES ('player', $1, $2, 'transfers', $3::jsonb, CURRENT_TIMESTAMP + ($4::text || ' days')::interval)
    ON CONFLICT (entity_type, transfermarkt_id, resource) DO UPDATE
    SET entity_id = EXCLUDED.entity_id,
        payload = EXCLUDED.payload,
        fetched_at = CURRENT_TIMESTAMP,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
  `, [player.id, String(player.transfermarkt_id), JSON.stringify(payload), ttlDays]);
}

module.exports = {
  findTeamByProviderClub,
  getApiFootballSyncTargets,
  getPlayerTransferHistory,
  getPlayerByApiId,
  getSummaryRows,
  getSyncCandidates,
  getTeamByApiId,
  getTeamTransfers,
  getWindowTransfers,
  listTransfers,
  saveProviderCache,
  upsertTransfer
};
