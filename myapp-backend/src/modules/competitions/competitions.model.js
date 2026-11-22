const pool = require('../../config/db');
const { toAssetPath } = require("../../utils/assets");

async function getAllCompetitions() {
  const query = "SELECT * FROM competitions ORDER BY name";
  const result = await pool.query(query);
  return result.rows;
}

async function getCompetitionById(id) {
  const query = 'SELECT * FROM competitions WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function getCompetitionByCountry(country) {
  const query = `
    SELECT competitions.*
    FROM competitions
    INNER JOIN countries ON countries.id = competitions.country_id
    WHERE countries.name = $1 OR countries.code = $1
  `;
  const result = await pool.query(query, [country]);
  return result.rows;
}

async function getCompetitionType(id) {
  const query = 'SELECT type FROM competitions WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function getCompetitionSeasons(competitionId) {
  const query = `
    WITH rows AS (
      SELECT DISTINCT
        cs.id,
        cs.season_year::varchar AS name,
        cs.season_year,
        cs.start_date,
        cs.end_date,
        cs.current AS is_current,
        cs.logo_url,
        cs.logo_path,
        cs.created_at,
        cs.updated_at,
        0 AS source_rank
      FROM competition_seasons cs
      WHERE cs.competition_id = $1

      UNION ALL

      SELECT DISTINCT
        s.id,
        s.name,
        NULLIF(substring(s.name from '((19|20)[0-9]{2})'), '')::integer AS season_year,
        s.start_date,
        s.end_date,
        s.is_current,
        NULL::text AS logo_url,
        NULL::text AS logo_path,
        s.created_at,
        s.updated_at,
        1 AS source_rank
      FROM seasons s
      INNER JOIN team_competitions
        ON team_competitions.season_id = s.id
      WHERE team_competitions.competition_id = $1
    ),
    ranked AS (
      SELECT
        rows.*,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(rows.season_year::text, lower(trim(rows.name)), rows.id::text)
          ORDER BY rows.source_rank ASC, rows.is_current DESC NULLS LAST, rows.updated_at DESC NULLS LAST, rows.id DESC
        ) AS row_rank
      FROM rows
    )
    SELECT id, name, season_year, start_date, end_date, is_current, logo_url, logo_path, created_at, updated_at
    FROM ranked
    WHERE row_rank = 1
    ORDER BY is_current DESC, season_year DESC NULLS LAST, id DESC
  `;
  const result = await pool.query(query, [competitionId]);
  return result.rows;
}

async function getCompetitionStandings(competitionId, seasonId) {
  const query = `
    SELECT
      s.*,
      t.name AS team_name,
      t.short_name AS team_short_name,
      t.code AS team_code,
      t.logo_path AS team_logo
    FROM standings s
    JOIN competition_seasons cs ON cs.id = s.competition_season_id
    JOIN teams t ON t.id = s.team_id
    WHERE cs.competition_id = $1
      AND (cs.id = $2 OR cs.season_year::text = $2::text)
    ORDER BY s.rank NULLS LAST, s.points DESC NULLS LAST, s.goal_difference DESC NULLS LAST, t.name
  `;
  const result = await pool.query(query, [competitionId, seasonId]);
  return result.rows.map((row) => ({
    id: row.id,
    rank: row.rank,
    points: row.points,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goals_for,
    goalsAgainst: row.goals_against,
    goalDifference: row.goal_difference,
    form: row.form,
    description: row.description,
    team: {
      id: row.team_id,
      name: row.team_name,
      shortName: row.team_short_name,
      code: row.team_code,
      logo: toAssetPath(row.team_logo)
    }
  }));
}

function playerLeaderDto(row, valueKey) {
  return {
    id: row.player_id,
    player: {
      id: row.player_id,
      name: row.player_name,
      photo: toAssetPath(row.player_photo),
      nationality: row.nationality
    },
    team: {
      id: row.team_id,
      name: row.team_name,
      logo: toAssetPath(row.team_logo)
    },
    value: Number(row[valueKey] || 0)
  };
}

function teamLeaderDto(row, valueKey) {
  return {
    id: row.team_id,
    team: {
      id: row.team_id,
      name: row.team_name,
      logo: toAssetPath(row.team_logo)
    },
    value: Number(row[valueKey] || 0)
  };
}

async function getCompetitionStats(competitionId, seasonId, options = {}) {
  const params = [competitionId, seasonId];
  const roundFilter = options.excludeQualificationRounds
    ? "AND NOT (m.round ILIKE '%Qualifying%' OR LOWER(COALESCE(m.round, '')) = 'play-offs')"
    : "";
  const matchScope = `
    SELECT m.id, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals, m.home_score, m.away_score
    FROM matches m
    LEFT JOIN competition_seasons cs ON cs.id = m.competition_season_id
    WHERE m.competition_id = $1
      AND (
        m.competition_season_id = $2
        OR m.season_id = $2
        OR cs.season_year::text = $2::text
      )
      ${roundFilter}
  `;

  const playerBase = `
    scoped_matches AS (${matchScope}),
    base AS (
      SELECT
        ps.player_id,
        p.name AS player_name,
        p.photo_path AS player_photo,
        p.nationality,
        ps.team_id,
        t.name AS team_name,
        t.logo_path AS team_logo,
        SUM(COALESCE(ps.goals_total, 0)) AS goals,
        SUM(COALESCE(ps.goals_assists, 0)) AS assists,
        SUM(COALESCE(ps.cards_yellow, 0) + COALESCE(ps.cards_yellow_red, 0) + COALESCE(ps.cards_red, 0)) AS cards,
        SUM(COALESCE(ps.cards_yellow, 0)) AS yellow_cards,
        SUM(COALESCE(ps.cards_red, 0)) AS red_cards,
        SUM(COALESCE(ps.goalkeeper_saves, 0)) AS saves,
        SUM(COALESCE(ps.shots_total, 0)) AS shots,
        SUM(COALESCE(ps.shots_on, 0)) AS shots_on,
        ROUND(AVG(NULLIF(ps.rating, 0))::numeric, 2) AS rating
      FROM match_player_statistics ps
      JOIN scoped_matches sm ON sm.id = ps.match_id
      JOIN players p ON p.id = ps.player_id
      LEFT JOIN teams t ON t.id = ps.team_id
      GROUP BY ps.player_id, p.name, p.photo_path, p.nationality, ps.team_id, t.name, t.logo_path
    )
  `;

  const playerSeasonBase = `
    base AS (
      SELECT
        ps.player_id,
        p.name AS player_name,
        p.photo_path AS player_photo,
        p.nationality,
        ps.team_id,
        t.name AS team_name,
        t.logo_path AS team_logo,
        SUM(COALESCE(ps.goals_total, 0)) AS goals,
        SUM(COALESCE(ps.goals_assists, 0)) AS assists,
        SUM(COALESCE(ps.cards_yellow, 0) + COALESCE(ps.cards_yellow_red, 0) + COALESCE(ps.cards_red, 0)) AS cards,
        SUM(COALESCE(ps.cards_yellow, 0)) AS yellow_cards,
        SUM(COALESCE(ps.cards_red, 0)) AS red_cards,
        SUM(COALESCE(ps.goalkeeper_saves, ps.goals_saves, 0)) AS saves,
        SUM(COALESCE(ps.shots_total, 0)) AS shots,
        SUM(COALESCE(ps.shots_on, 0)) AS shots_on,
        ROUND(AVG(NULLIF(ps.rating, 0))::numeric, 2) AS rating
      FROM player_season_statistics ps
      JOIN competition_seasons cs ON cs.id = ps.competition_season_id
      JOIN players p ON p.id = ps.player_id
      LEFT JOIN teams t ON t.id = ps.team_id
      WHERE cs.competition_id = $1
        AND (cs.id = $2 OR cs.season_year::text = $2::text)
      GROUP BY ps.player_id, p.name, p.photo_path, p.nationality, ps.team_id, t.name, t.logo_path
    )
  `;

  const teamMatchBase = `
    scoped_matches AS (${matchScope}),
    rows AS (
      SELECT home_team_id AS team_id, COALESCE(home_goals, home_score, 0) AS goals_for, COALESCE(away_goals, away_score, 0) AS goals_against
      FROM scoped_matches
      WHERE home_team_id IS NOT NULL
      UNION ALL
      SELECT away_team_id AS team_id, COALESCE(away_goals, away_score, 0) AS goals_for, COALESCE(home_goals, home_score, 0) AS goals_against
      FROM scoped_matches
      WHERE away_team_id IS NOT NULL
    ),
    base AS (
      SELECT
        r.team_id,
        t.name AS team_name,
        t.logo_path AS team_logo,
        SUM(r.goals_for) AS goals_for,
        SUM(r.goals_against) AS goals_against,
        SUM(r.goals_for - r.goals_against) AS goal_difference
      FROM rows r
      JOIN teams t ON t.id = r.team_id
      GROUP BY r.team_id, t.name, t.logo_path
    )
  `;

  const teamStatsBase = `
    scoped_matches AS (${matchScope}),
    base AS (
      SELECT
        ts.team_id,
        t.name AS team_name,
        t.logo_path AS team_logo,
        SUM(COALESCE(ts.yellow_cards, 0) + COALESCE(ts.red_cards, 0)) AS cards,
        SUM(COALESCE(ts.yellow_cards, 0)) AS yellow_cards,
        SUM(COALESCE(ts.red_cards, 0)) AS red_cards,
        SUM(COALESCE(ts.total_shots, 0)) AS shots,
        SUM(COALESCE(ts.shots_on_goal, 0)) AS shots_on_goal,
        SUM(COALESCE(ts.corner_kicks, 0)) AS corners,
        ROUND(AVG(NULLIF(ts.ball_possession, 0))::numeric, 1) AS possession,
        ROUND(AVG(NULLIF(ts.expected_goals, 0))::numeric, 2) AS expected_goals,
        ROUND(MAX(NULLIF(ts.expected_goals, 0))::numeric, 2) AS max_expected_goals
      FROM match_team_statistics ts
      JOIN scoped_matches sm ON sm.id = ts.match_id
      JOIN teams t ON t.id = ts.team_id
      GROUP BY ts.team_id, t.name, t.logo_path
    )
  `;

  const teamSeasonBase = `
    base AS (
      SELECT
        ts.team_id,
        t.name AS team_name,
        t.logo_path AS team_logo,
        SUM(COALESCE(ts.goals_for_total, 0)) AS goals_for,
        SUM(COALESCE(ts.goals_against_total, 0)) AS goals_against,
        SUM(COALESCE(ts.goals_for_total, 0) - COALESCE(ts.goals_against_total, 0)) AS goal_difference
      FROM team_season_statistics ts
      JOIN competition_seasons cs ON cs.id = ts.competition_season_id
      JOIN teams t ON t.id = ts.team_id
      WHERE cs.competition_id = $1
        AND (cs.id = $2 OR cs.season_year::text = $2::text)
      GROUP BY ts.team_id, t.name, t.logo_path
    )
  `;

  const [
    topScorers,
    topScorersSeason,
    topAssists,
    topAssistsSeason,
    topCards,
    topCardsSeason,
    topYellowCards,
    topYellowCardsSeason,
    topRedCards,
    topRedCardsSeason,
    topRatings,
    topRatingsSeason,
    topSaves,
    topSavesSeason,
    teamGoals,
    teamGoalsSeason,
    teamCards,
    teamYellowCards,
    teamRedCards,
    teamShots,
    teamXg,
    teamMaxXg,
    teamPossession
  ] = await Promise.all([
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE goals > 0 ORDER BY goals DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE goals > 0 ORDER BY goals DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE assists > 0 ORDER BY assists DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE assists > 0 ORDER BY assists DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE cards > 0 ORDER BY cards DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE cards > 0 ORDER BY cards DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE yellow_cards > 0 ORDER BY yellow_cards DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE yellow_cards > 0 ORDER BY yellow_cards DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE red_cards > 0 ORDER BY red_cards DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE red_cards > 0 ORDER BY red_cards DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE rating IS NOT NULL ORDER BY rating DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE rating IS NOT NULL ORDER BY rating DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerBase} SELECT * FROM base WHERE saves > 0 ORDER BY saves DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${playerSeasonBase} SELECT * FROM base WHERE saves > 0 ORDER BY saves DESC, player_name LIMIT 10`, params),
    pool.query(`WITH ${teamMatchBase} SELECT * FROM base WHERE goals_for > 0 ORDER BY goals_for DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamSeasonBase} SELECT * FROM base WHERE goals_for > 0 ORDER BY goals_for DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE cards > 0 ORDER BY cards DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE yellow_cards > 0 ORDER BY yellow_cards DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE red_cards > 0 ORDER BY red_cards DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE shots > 0 ORDER BY shots DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE expected_goals > 0 ORDER BY expected_goals DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE max_expected_goals > 0 ORDER BY max_expected_goals DESC, team_name LIMIT 10`, params),
    pool.query(`WITH ${teamStatsBase} SELECT * FROM base WHERE possession IS NOT NULL ORDER BY possession DESC, team_name LIMIT 10`, params)
  ]);

  function preferredRows(primary, fallback) {
    return primary.rows.length ? primary.rows : fallback.rows;
  }

  return {
    players: {
      goals: preferredRows(topScorers, topScorersSeason).map((row) => playerLeaderDto(row, "goals")),
      assists: preferredRows(topAssists, topAssistsSeason).map((row) => playerLeaderDto(row, "assists")),
      cards: preferredRows(topCards, topCardsSeason).map((row) => playerLeaderDto(row, "cards")),
      yellowCards: preferredRows(topYellowCards, topYellowCardsSeason).map((row) => playerLeaderDto(row, "yellow_cards")),
      redCards: preferredRows(topRedCards, topRedCardsSeason).map((row) => playerLeaderDto(row, "red_cards")),
      ratings: preferredRows(topRatings, topRatingsSeason).map((row) => playerLeaderDto(row, "rating")),
      saves: preferredRows(topSaves, topSavesSeason).map((row) => playerLeaderDto(row, "saves"))
    },
    teams: {
      goals: preferredRows(teamGoals, teamGoalsSeason).map((row) => teamLeaderDto(row, "goals_for")),
      cards: teamCards.rows.map((row) => teamLeaderDto(row, "cards")),
      yellowCards: teamYellowCards.rows.map((row) => teamLeaderDto(row, "yellow_cards")),
      redCards: teamRedCards.rows.map((row) => teamLeaderDto(row, "red_cards")),
      shots: teamShots.rows.map((row) => teamLeaderDto(row, "shots")),
      expectedGoals: teamXg.rows.map((row) => teamLeaderDto(row, "expected_goals")),
      maxExpectedGoals: teamMaxXg.rows.map((row) => teamLeaderDto(row, "max_expected_goals")),
      possession: teamPossession.rows.map((row) => teamLeaderDto(row, "possession"))
    }
  };
}

module.exports = {
  getAllCompetitions,
  getCompetitionById,
  getCompetitionByCountry,
  getCompetitionType,
  getCompetitionSeasons,
  getCompetitionStandings,
  getCompetitionStats
};
