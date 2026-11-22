const pool = require("../../config/db");

const COMPLETED_MATCH_WHERE = `
  COALESCE(m.status_short, m.status, '') IN ('FT', 'AET', 'PEN')
  AND COALESCE(m.home_goals, m.home_score) IS NOT NULL
  AND COALESCE(m.away_goals, m.away_score) IS NOT NULL
`;

function addMatchFilters(parts, values, filters) {
  if (filters.competitionId) {
    values.push(filters.competitionId);
    parts.push(`m.competition_id = $${values.length}`);
  }

  if (filters.seasonId) {
    values.push(filters.seasonId);
    parts.push(`(
      m.season_id = $${values.length}
      OR m.competition_season_id = $${values.length}
      OR EXISTS (
        SELECT 1
        FROM competition_seasons cs_filter
        WHERE cs_filter.id = m.competition_season_id
          AND cs_filter.season_year::text = $${values.length}::text
      )
    )`);
  }
}

async function getTeamById(teamId) {
  const { rows } = await pool.query("SELECT id, name, logo_path FROM teams WHERE id = $1", [teamId]);
  return rows[0] || null;
}

async function getPlayerById(playerId) {
  const { rows } = await pool.query("SELECT id, name, photo_path FROM players WHERE id = $1", [playerId]);
  return rows[0] || null;
}

async function getTeamCompletedMatches(filters) {
  const values = [filters.teamId];
  const where = [`(${COMPLETED_MATCH_WHERE})`];

  if (filters.venue === "home") {
    where.push("m.home_team_id = $1");
  } else if (filters.venue === "away") {
    where.push("m.away_team_id = $1");
  } else {
    where.push("(m.home_team_id = $1 OR m.away_team_id = $1)");
  }

  addMatchFilters(where, values, filters);

  let limitClause = "";
  if (filters.limit) {
    values.push(filters.limit);
    limitClause = `LIMIT $${values.length}`;
  }

  const { rows } = await pool.query(`
    SELECT
      m.id,
      m.competition_id,
      m.season_id,
      m.competition_season_id,
      m.home_team_id,
      m.away_team_id,
      COALESCE(m.kickoff_at, m.match_date) AS kickoff_at,
      COALESCE(m.status_short, m.status) AS status_short,
      COALESCE(m.home_goals, m.home_score)::integer AS home_goals,
      COALESCE(m.away_goals, m.away_score)::integer AS away_goals,
      c.name AS competition_name,
      ht.name AS home_team_name,
      at.name AS away_team_name,
      COALESCE(team_stats.total_shots, 0)::integer AS team_total_shots,
      COALESCE(team_stats.shots_on_goal, 0)::integer AS team_shots_on_goal,
      COALESCE(team_stats.corner_kicks, 0)::integer AS team_corner_kicks,
      COALESCE(team_stats.fouls, 0)::integer AS team_fouls,
      COALESCE(team_stats.yellow_cards, 0)::integer AS team_yellow_cards,
      COALESCE(team_stats.red_cards, 0)::integer AS team_red_cards,
      COALESCE(team_stats.goalkeeper_saves, 0)::integer AS team_goalkeeper_saves,
      COALESCE(team_stats.ball_possession, 0)::numeric AS team_ball_possession,
      COALESCE(team_stats.expected_goals, 0)::numeric AS team_expected_goals,
      COALESCE(opponent_stats.total_shots, 0)::integer AS opponent_total_shots,
      COALESCE(opponent_stats.shots_on_goal, 0)::integer AS opponent_shots_on_goal,
      COALESCE(opponent_stats.corner_kicks, 0)::integer AS opponent_corner_kicks,
      COALESCE(opponent_stats.fouls, 0)::integer AS opponent_fouls,
      COALESCE(opponent_stats.yellow_cards, 0)::integer AS opponent_yellow_cards,
      COALESCE(opponent_stats.red_cards, 0)::integer AS opponent_red_cards,
      COALESCE(opponent_stats.goalkeeper_saves, 0)::integer AS opponent_goalkeeper_saves,
      COALESCE(opponent_stats.ball_possession, 0)::numeric AS opponent_ball_possession,
      COALESCE(opponent_stats.expected_goals, 0)::numeric AS opponent_expected_goals
    FROM matches m
    LEFT JOIN competitions c ON c.id = m.competition_id
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN match_team_statistics team_stats
      ON team_stats.match_id = m.id
     AND team_stats.team_id = $1
    LEFT JOIN match_team_statistics opponent_stats
      ON opponent_stats.match_id = m.id
     AND opponent_stats.team_id = CASE WHEN m.home_team_id = $1 THEN m.away_team_id ELSE m.home_team_id END
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(m.kickoff_at, m.match_date) DESC, m.id DESC
    ${limitClause}
  `, values);

  return rows;
}

async function getHeadToHeadMatches(filters) {
  const values = [filters.teamAId, filters.teamBId];
  const where = [
    `(${COMPLETED_MATCH_WHERE})`,
    "((m.home_team_id = $1 AND m.away_team_id = $2) OR (m.home_team_id = $2 AND m.away_team_id = $1))"
  ];

  if (filters.competitionId) {
    values.push(filters.competitionId);
    where.push(`m.competition_id = $${values.length}`);
  }

  values.push(filters.last);

  const { rows } = await pool.query(`
    SELECT
      m.id,
      m.competition_id,
      m.home_team_id,
      m.away_team_id,
      COALESCE(m.kickoff_at, m.match_date) AS kickoff_at,
      COALESCE(m.status_short, m.status) AS status_short,
      COALESCE(m.home_goals, m.home_score)::integer AS home_goals,
      COALESCE(m.away_goals, m.away_score)::integer AS away_goals,
      c.name AS competition_name,
      ht.name AS home_team_name,
      at.name AS away_team_name,
      COALESCE(home_stats.total_shots, 0)::integer AS home_total_shots,
      COALESCE(home_stats.shots_on_goal, 0)::integer AS home_shots_on_goal,
      COALESCE(home_stats.corner_kicks, 0)::integer AS home_corner_kicks,
      COALESCE(home_stats.expected_goals, 0)::numeric AS home_expected_goals,
      COALESCE(away_stats.total_shots, 0)::integer AS away_total_shots,
      COALESCE(away_stats.shots_on_goal, 0)::integer AS away_shots_on_goal,
      COALESCE(away_stats.corner_kicks, 0)::integer AS away_corner_kicks,
      COALESCE(away_stats.expected_goals, 0)::numeric AS away_expected_goals
    FROM matches m
    LEFT JOIN competitions c ON c.id = m.competition_id
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN match_team_statistics home_stats
      ON home_stats.match_id = m.id
     AND home_stats.team_id = m.home_team_id
    LEFT JOIN match_team_statistics away_stats
      ON away_stats.match_id = m.id
     AND away_stats.team_id = m.away_team_id
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(m.kickoff_at, m.match_date) DESC, m.id DESC
    LIMIT $${values.length}
  `, values);

  return rows;
}

async function getPlayerMatchStatistics(filters) {
  const values = [filters.playerId];
  const where = [`ps.player_id = $1`, `(${COMPLETED_MATCH_WHERE})`];
  addMatchFilters(where, values, filters);

  let limitClause = "";
  if (filters.last) {
    values.push(filters.last);
    limitClause = `LIMIT $${values.length}`;
  }

  const { rows } = await pool.query(`
    SELECT
      ps.match_id,
      ps.team_id,
      ps.player_id,
      ps.position,
      ps.substitute,
      COALESCE(ps.minutes, 0)::integer AS minutes,
      COALESCE(ps.shots_total, 0)::integer AS shots_total,
      COALESCE(ps.shots_on, 0)::integer AS shots_on,
      COALESCE(ps.goals_total, 0)::integer AS goals_total,
      COALESCE(ps.goals_conceded, 0)::integer AS goals_conceded,
      COALESCE(ps.goals_assists, 0)::integer AS goals_assists,
      COALESCE(ps.goalkeeper_saves, 0)::integer AS goalkeeper_saves,
      COALESCE(ps.cards_yellow, 0)::integer AS cards_yellow,
      COALESCE(ps.cards_yellow_red, 0)::integer AS cards_yellow_red,
      COALESCE(ps.cards_red, 0)::integer AS cards_red,
      COALESCE(m.kickoff_at, m.match_date) AS played_at,
      t.name AS team_name,
      p.name AS player_name
    FROM match_player_statistics ps
    INNER JOIN matches m ON m.id = ps.match_id
    LEFT JOIN teams t ON t.id = ps.team_id
    LEFT JOIN players p ON p.id = ps.player_id
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(m.kickoff_at, m.match_date) DESC, ps.match_id DESC
    ${limitClause}
  `, values);

  return rows;
}

async function getCompetitionStandings(filters) {
  const values = [filters.competitionId];
  const where = ["cs.competition_id = $1"];

  if (filters.seasonId) {
    values.push(filters.seasonId);
    where.push("(s.competition_season_id = $2 OR cs.season_year::text = $2::text)");
  }

  const { rows } = await pool.query(`
    SELECT
      s.rank,
      s.team_id,
      t.name AS team_name,
      t.logo_path AS team_logo,
      COALESCE(s.points, 0)::integer AS points,
      COALESCE(s.played, 0)::integer AS played,
      COALESCE(s.wins, 0)::integer AS wins,
      COALESCE(s.draws, 0)::integer AS draws,
      COALESCE(s.losses, 0)::integer AS losses,
      COALESCE(s.goals_for, 0)::integer AS goals_for,
      COALESCE(s.goals_against, 0)::integer AS goals_against,
      COALESCE(s.goal_difference, 0)::integer AS goal_difference,
      s.form,
      s.description,
      cs.id AS competition_season_id,
      cs.season_year
    FROM standings s
    INNER JOIN competition_seasons cs ON cs.id = s.competition_season_id
    INNER JOIN teams t ON t.id = s.team_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.rank ASC NULLS LAST, s.points DESC, s.goal_difference DESC, s.goals_for DESC, t.name ASC
  `, values);

  return rows;
}

async function getCompetitionCompletedMatches(filters) {
  const values = [filters.competitionId];
  const where = [`(${COMPLETED_MATCH_WHERE})`, "m.competition_id = $1"];
  if (filters.seasonId) {
    values.push(filters.seasonId);
    where.push(`(
      m.season_id = $${values.length}
      OR m.competition_season_id = $${values.length}
      OR EXISTS (
        SELECT 1
        FROM competition_seasons cs_filter
        WHERE cs_filter.id = m.competition_season_id
          AND cs_filter.season_year::text = $${values.length}::text
      )
    )`);
  }

  const { rows } = await pool.query(`
    SELECT
      m.id,
      m.home_team_id,
      m.away_team_id,
      COALESCE(m.home_goals, m.home_score)::integer AS home_goals,
      COALESCE(m.away_goals, m.away_score)::integer AS away_goals,
      ht.name AS home_team_name,
      at.name AS away_team_name
    FROM matches m
    INNER JOIN teams ht ON ht.id = m.home_team_id
    INNER JOIN teams at ON at.id = m.away_team_id
    WHERE ${where.join(" AND ")}
  `, values);

  return rows;
}

module.exports = {
  COMPLETED_MATCH_WHERE,
  getCompetitionCompletedMatches,
  getCompetitionStandings,
  getHeadToHeadMatches,
  getPlayerById,
  getPlayerMatchStatistics,
  getTeamById,
  getTeamCompletedMatches
};
