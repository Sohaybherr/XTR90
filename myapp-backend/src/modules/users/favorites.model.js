const pool = require("../../config/db");
const { toAssetPath } = require("../../utils/assets");

const ENTITY_TYPES = new Set(["competition", "team", "player", "match", "news"]);

function normalizeEntityType(type) {
  const value = String(type || "").trim().toLowerCase();
  return ENTITY_TYPES.has(value) ? value : null;
}

function competitionDto(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    logo: toAssetPath(row.logo),
    country: row.country_name ? { id: row.country_id, name: row.country_name, code: row.country_code } : null,
    favoritedAt: row.favorited_at
  };
}

function teamDto(row) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    code: row.code,
    logo: toAssetPath(row.logo_path),
    country: row.country_name ? { id: row.country_id, name: row.country_name, code: row.country_code } : row.country_name_snapshot,
    favoritedAt: row.favorited_at
  };
}

function playerDto(row) {
  return {
    id: row.id,
    name: row.name,
    firstname: row.firstname,
    lastname: row.lastname,
    photo: toAssetPath(row.photo_path),
    nationality: row.nationality,
    position: row.squad_position || row.position,
    currentTeamId: row.current_team_id,
    favoritedAt: row.favorited_at
  };
}

function uniqueRowsById(rows) {
  const seen = new Set();

  return rows.filter((row) => {
    const key = String(row.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreLabel(row) {
  const home = row.home_goals ?? row.home_score;
  const away = row.away_goals ?? row.away_score;

  if (home === null || home === undefined || away === null || away === undefined) {
    return null;
  }

  return `${home} - ${away}`;
}

function matchDto(row) {
  return {
    id: row.id,
    time: row.kickoff_at || row.match_date,
    round: row.round,
    status: row.status_short || row.status || row.status_long,
    score: scoreLabel(row),
    competition: row.competition_name
      ? { id: row.competition_id, name: row.competition_name, logo: toAssetPath(row.competition_logo) }
      : null,
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      logo: toAssetPath(row.home_team_logo)
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      logo: toAssetPath(row.away_team_logo)
    },
    favoritedAt: row.favorited_at
  };
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
    language: row.language,
    category: row.category,
    importance: row.importance,
    clubs: row.clubs || [],
    players: row.players || [],
    competitions: row.competitions || [],
    is_breaking: row.is_breaking,
    isBreaking: row.is_breaking,
    summary: row.summary,
    published: row.published,
    ai_completed: row.ai_completed,
    aiCompleted: row.ai_completed,
    image_url: toAssetPath(row.image_url),
    imageUrl: toAssetPath(row.image_url),
    favoritedAt: row.favorited_at
  };
}

async function getFavoriteKeys(userId) {
  const result = await pool.query(
    `
      SELECT entity_type, entity_id
      FROM user_favorites
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    type: row.entity_type,
    id: row.entity_id
  }));
}

async function getFavorites(userId) {
  const [competitions, teams, players, matches, news] = await Promise.all([
    pool.query(
      `
        SELECT
          c.*,
          countries.name AS country_name,
          countries.code AS country_code,
          uf.created_at AS favorited_at
        FROM user_favorites uf
        JOIN competitions c ON c.id = uf.entity_id
        LEFT JOIN countries ON countries.id = c.country_id
        WHERE uf.user_id = $1 AND uf.entity_type = 'competition'
        ORDER BY uf.created_at DESC, uf.id DESC
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT t.*, countries.name AS country_name, countries.code AS country_code, uf.created_at AS favorited_at
        FROM user_favorites uf
        JOIN teams t ON t.id = uf.entity_id
        LEFT JOIN countries ON countries.id = t.country_id
        WHERE uf.user_id = $1 AND uf.entity_type = 'team'
        ORDER BY uf.created_at DESC, uf.id DESC
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT p.*, tsp.team_id AS current_team_id, tsp.position AS squad_position, uf.created_at AS favorited_at
        FROM user_favorites uf
        JOIN players p ON p.id = uf.entity_id
        LEFT JOIN LATERAL (
          SELECT team_id, position
          FROM team_squad_players
          WHERE player_id = p.id AND is_current = TRUE
          ORDER BY joined_at DESC NULLS LAST, team_id
          LIMIT 1
        ) tsp ON TRUE
        WHERE uf.user_id = $1 AND uf.entity_type = 'player'
        ORDER BY uf.created_at DESC, uf.id DESC
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT
          m.*,
          c.name AS competition_name,
          c.logo AS competition_logo,
          ht.name AS home_team_name,
          ht.logo_path AS home_team_logo,
          at.name AS away_team_name,
          at.logo_path AS away_team_logo,
          uf.created_at AS favorited_at
        FROM user_favorites uf
        JOIN matches m ON m.id = uf.entity_id
        LEFT JOIN competitions c ON c.id = m.competition_id
        LEFT JOIN teams ht ON ht.id = m.home_team_id
        LEFT JOIN teams at ON at.id = m.away_team_id
        WHERE uf.user_id = $1 AND uf.entity_type = 'match'
        ORDER BY uf.created_at DESC, uf.id DESC
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT n.*, uf.created_at AS favorited_at
        FROM user_favorites uf
        JOIN news n ON n.id = uf.entity_id
        WHERE uf.user_id = $1 AND uf.entity_type = 'news'
        ORDER BY uf.created_at DESC, uf.id DESC
      `,
      [userId]
    )
  ]);

  return {
    competitions: uniqueRowsById(competitions.rows).map(competitionDto),
    teams: uniqueRowsById(teams.rows).map(teamDto),
    players: uniqueRowsById(players.rows).map(playerDto),
    matches: uniqueRowsById(matches.rows).map(matchDto),
    news: uniqueRowsById(news.rows).map(newsDto)
  };
}

function matchFeedDto(row) {
  return {
    id: row.id,
    apiId: row.api_id,
    competitionSeasonId: row.competition_season_id,
    seasonId: row.season_id,
    round: row.round,
    time: row.kickoff_at || row.match_date,
    status: row.status_short || row.status,
    statusShort: row.status_short || row.status,
    statusLong: row.status_long,
    elapsed: row.elapsed,
    extra: row.elapsed_extra,
    updatedAt: row.last_live_sync_at || row.updated_at || row.api_synced_at,
    score: scoreLabel(row),
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name || "Home",
      logo: toAssetPath(row.home_team_logo)
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name || "Away",
      logo: toAssetPath(row.away_team_logo)
    }
  };
}

async function getFavoriteMatchesFeed(userId) {
  const result = await pool.query(
    `
      WITH favorite_teams AS (
        SELECT entity_id AS team_id
        FROM user_favorites
        WHERE user_id = $1 AND entity_type = 'team'
        UNION
        SELECT tsp.team_id
        FROM user_favorites uf
        JOIN team_squad_players tsp ON tsp.player_id = uf.entity_id AND tsp.is_current = TRUE
        WHERE uf.user_id = $1 AND uf.entity_type = 'player'
      ),
      favorite_competitions AS (
        SELECT entity_id AS competition_id
        FROM user_favorites
        WHERE user_id = $1 AND entity_type = 'competition'
      ),
      favorite_matches AS (
        SELECT entity_id AS match_id
        FROM user_favorites
        WHERE user_id = $1 AND entity_type = 'match'
      )
      SELECT
        m.*,
        c.id AS competition_id,
        c.api_id AS competition_api_id,
        c.name AS competition_name,
        c.type AS competition_type,
        c.logo AS competition_logo,
        countries.id AS country_id,
        countries.name AS country_name,
        countries.code AS country_code,
        countries.flag AS country_flag,
        ht.name AS home_team_name,
        ht.logo_path AS home_team_logo,
        at.name AS away_team_name,
        at.logo_path AS away_team_logo
      FROM matches m
      LEFT JOIN competitions c ON c.id = m.competition_id
      LEFT JOIN countries ON countries.id = c.country_id
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE
        COALESCE(m.kickoff_at, m.match_date) BETWEEN NOW() - INTERVAL '5 days' AND NOW() + INTERVAL '5 days'
        AND (
          EXISTS (SELECT 1 FROM favorite_matches fm WHERE fm.match_id = m.id)
          OR EXISTS (SELECT 1 FROM favorite_competitions fc WHERE fc.competition_id = m.competition_id)
          OR EXISTS (
            SELECT 1
            FROM favorite_teams ft
            WHERE ft.team_id = m.home_team_id OR ft.team_id = m.away_team_id
          )
        )
      ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
    `,
    [userId]
  );

  const countriesMap = new Map();
  const internationalKey = "__favorite_international__";

  function ensureCountry(row) {
    const countryId = row.country_id || internationalKey;
    const key = String(countryId);

    if (!countriesMap.has(key)) {
      countriesMap.set(key, {
        id: countryId,
        name: row.country_name || "My Matches",
        code: row.country_code || null,
        flag: toAssetPath(row.country_flag),
        competitions: [],
        competitionsMap: new Map()
      });
    }

    return countriesMap.get(key);
  }

  result.rows.forEach((row) => {
    const country = ensureCountry(row);
    const competitionId = row.competition_id || `favorite-${row.id}`;
    const competitionKey = String(competitionId);

    if (!country.competitionsMap.has(competitionKey)) {
      const competition = {
        id: competitionId,
        apiId: row.competition_api_id,
        name: row.competition_name || "Favorite matches",
        type: row.competition_type,
        logo: toAssetPath(row.competition_logo),
        matches: []
      };
      country.competitionsMap.set(competitionKey, competition);
      country.competitions.push(competition);
    }

    country.competitionsMap.get(competitionKey).matches.push(matchFeedDto(row));
  });

  return Array.from(countriesMap.values()).map(({ competitionsMap, ...country }) => country);
}

async function entityExists(type, id) {
  const tableByType = {
    competition: "competitions",
    team: "teams",
    player: "players",
    match: "matches",
    news: "news"
  };
  const result = await pool.query(`SELECT 1 FROM ${tableByType[type]} WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

async function addFavorite(userId, type, entityId) {
  const normalizedType = normalizeEntityType(type);

  if (!normalizedType) {
    return { error: "Unsupported favorite type", statusCode: 400 };
  }

  if (!(await entityExists(normalizedType, entityId))) {
    return { error: "Favorite target not found", statusCode: 404 };
  }

  await pool.query(
    `
      INSERT INTO user_favorites (user_id, entity_type, entity_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING
    `,
    [userId, normalizedType, entityId]
  );

  return { type: normalizedType, id: Number(entityId), favorite: true };
}

async function removeFavorite(userId, type, entityId) {
  const normalizedType = normalizeEntityType(type);

  if (!normalizedType) {
    return { error: "Unsupported favorite type", statusCode: 400 };
  }

  await pool.query(
    `
      DELETE FROM user_favorites
      WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3
    `,
    [userId, normalizedType, entityId]
  );

  return { type: normalizedType, id: Number(entityId), favorite: false };
}

module.exports = {
  getFavoriteKeys,
  getFavorites,
  getFavoriteMatchesFeed,
  addFavorite,
  removeFavorite,
  normalizeEntityType
};
