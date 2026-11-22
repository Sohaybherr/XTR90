const pool = require("../../config/db");
const { toAssetPath } = require("../../utils/assets");

const teamColumns = `
  t.id,
  t.api_id,
  t.name,
  t.short_name,
  t.code,
  t.country_id,
  t.country_name_snapshot,
  t.founded,
  t.is_national,
  t.logo_path,
  t.api_synced_at,
  t.api_updated_at,
  t.created_at,
  t.updated_at,
  t.logo_path AS logo,
  t.is_national AS national,
  t.stadium,
  t.fifa_rank,
  t.fifa_points,
  t.uefa_rank,
  t.uefa_points,
  t.classification_tier,
  t.classification_score,
  t.classification_source,
  t.classification_updated_at
`;

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function teamDto(team) {
  if (!team) return null;
  return compactObject({
    id: team.id,
    apiId: team.api_id,
    name: team.name,
    shortName: team.short_name,
    code: team.code,
    country: team.country_id
      ? {
          id: team.country_id,
          name: team.country_name || team.country_name_snapshot,
          code: team.country_code,
          flag: toAssetPath(team.country_flag)
        }
      : team.country_name_snapshot
        ? { id: null, name: team.country_name_snapshot }
        : null,
    founded: team.founded,
    national: Boolean(team.is_national),
    logo: toAssetPath(team.logo_path),
    apiSyncedAt: team.api_synced_at,
    apiUpdatedAt: team.api_updated_at,
    classification: {
      tier: team.classification_tier || "unclassified",
      score: Number(team.classification_score || 0),
      source: team.classification_source || "none",
      fifa: {
        rank: Number(team.fifa_rank || 0),
        points: Number(team.fifa_points || 0)
      },
      uefa: {
        rank: Number(team.uefa_rank || 0),
        points: Number(team.uefa_points || 0)
      },
      updatedAt: team.classification_updated_at || ""
    }
  });
}

function venueDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    apiId: row.api_id,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    capacity: row.capacity,
    surface: row.surface,
    imagePath: toAssetPath(row.image_path),
    season: row.season,
    isPrimary: row.is_primary
  };
}

function competitionDto(row) {
  if (!row) return null;
  return {
    id: row.competition_id,
    apiId: row.competition_api_id,
    name: row.competition_name,
    type: row.competition_type,
    logo: toAssetPath(row.competition_logo),
    season: {
      id: row.competition_season_id,
      year: row.season_year,
      startDate: row.start_date,
      endDate: row.end_date,
      current: row.current
    },
    groupName: row.group_name,
    stage: row.stage,
    active: row.is_active
  };
}

function playerDto(row) {
  return {
    id: row.player_id,
    apiId: row.player_api_id,
    name: row.player_name,
    firstname: row.firstname,
    lastname: row.lastname,
    photo: toAssetPath(row.photo_path),
    nationality: row.nationality,
    shirtNumber: row.shirt_number,
    position: row.squad_position,
    joinedAt: row.joined_at,
    leftAt: row.left_at
  };
}

function matchDto(row) {
  return {
    id: row.id,
    apiId: row.api_id,
    round: row.round,
    kickoffAt: row.kickoff_at || row.match_date,
    status: row.status_short || row.status,
    competitionId: row.competition_id,
    competitionSeasonId: row.competition_season_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
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
    homeGoals: row.home_goals ?? row.home_score,
    awayGoals: row.away_goals ?? row.away_score
  };
}

function standingDto(row) {
  if (!row) return null;
  return {
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
    description: row.description
  };
}

function playerCompetitionStatDto(row) {
  return {
    id: row.player_id,
    apiId: row.player_api_id,
    name: row.player_name,
    photo: toAssetPath(row.photo_path),
    nationality: row.nationality,
    shirtNumber: row.number ?? row.shirt_number,
    position: row.position,
    appearances: row.appearances,
    lineups: row.lineups,
    minutes: row.minutes,
    rating: row.rating,
    goals: row.goals_total,
    assists: row.goals_assists,
    yellowCards: row.cards_yellow,
    redCards: row.cards_red
  };
}

async function getAllTeams() {
  const result = await pool.query(`
    SELECT ${teamColumns}, c.name AS country_name, c.code AS country_code, c.flag AS country_flag
    FROM teams t
    LEFT JOIN countries c ON c.id = t.country_id
    ORDER BY t.name
  `);
  return result.rows;
}

async function getTeamById(id) {
  const result = await pool.query(
    `
      SELECT ${teamColumns}, c.name AS country_name, c.code AS country_code, c.flag AS country_flag
      FROM teams t
      LEFT JOIN countries c ON c.id = t.country_id
      WHERE t.id = $1
    `,
    [id]
  );
  return result.rows[0];
}

async function getTeamByApiId(apiId) {
  const result = await pool.query(
    `
      SELECT ${teamColumns}, c.name AS country_name, c.code AS country_code, c.flag AS country_flag
      FROM teams t
      LEFT JOIN countries c ON c.id = t.country_id
      WHERE t.api_id = $1
    `,
    [apiId]
  );
  return result.rows[0];
}

async function getTeamsByCountry(countryId) {
  const result = await pool.query(
    `
      SELECT ${teamColumns}, c.name AS country_name, c.code AS country_code, c.flag AS country_flag
      FROM teams t
      LEFT JOIN countries c ON c.id = t.country_id
      WHERE t.country_id = $1
      ORDER BY t.name
    `,
    [countryId]
  );
  return result.rows;
}

async function getTeamsByName(name) {
  const result = await pool.query(
    `
      SELECT ${teamColumns}, c.name AS country_name, c.code AS country_code, c.flag AS country_flag
      FROM teams t
      LEFT JOIN countries c ON c.id = t.country_id
      WHERE t.name ILIKE $1
      ORDER BY t.name
    `,
    [`%${name}%`]
  );
  return result.rows;
}

async function getTeamsByCompetitionAndSeason(competitionId, seasonId) {
  const query = `
    SELECT DISTINCT ${teamColumns}, ctry.name AS country_name, ctry.code AS country_code, ctry.flag AS country_flag
    FROM teams t
    LEFT JOIN countries ctry ON ctry.id = t.country_id
    LEFT JOIN team_competition_seasons tcs ON tcs.team_id = t.id
    LEFT JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
    LEFT JOIN team_competitions tc
      ON tc.team_id = t.id
     AND tc.competition_id = $1
     AND tc.season_id = $2
    LEFT JOIN matches m
      ON (m.home_team_id = t.id OR m.away_team_id = t.id)
     AND m.competition_id = $1
     AND (m.season_id = $2 OR m.competition_season_id = $2 OR cs.id = $2)
    WHERE (cs.competition_id = $1 AND (cs.id = $2 OR cs.season_year::text = $2::text))
       OR tc.id IS NOT NULL
       OR m.id IS NOT NULL
    ORDER BY t.name
  `;
  const result = await pool.query(query, [competitionId, seasonId]);
  return result.rows;
}

async function getCompetitionsByTeamAndSeason(teamId, seasonId) {
  const query = `
    SELECT
      c.id AS competition_id,
      c.api_id AS competition_api_id,
      c.name AS competition_name,
      c.type AS competition_type,
      c.logo AS competition_logo,
      cs.id AS competition_season_id,
      cs.season_year,
      cs.start_date,
      cs.end_date,
      cs.current,
      tcs.group_name,
      tcs.stage,
      tcs.is_active
    FROM team_competition_seasons tcs
    JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE tcs.team_id = $1
      AND (cs.id = $2 OR cs.season_year::text = $2::text)
    ORDER BY cs.current DESC, cs.season_year DESC, c.name
  `;
  const result = await pool.query(query, [teamId, seasonId]);
  return result.rows;
}

async function getTeamVenue(teamId) {
  const result = await pool.query(
    `
      SELECT v.*, tv.season, tv.is_primary
      FROM team_venues tv
      JOIN venues v ON v.id = tv.venue_id
      WHERE tv.team_id = $1
      ORDER BY tv.is_primary DESC, tv.season DESC NULLS FIRST, tv.id DESC
      LIMIT 1
    `,
    [teamId]
  );
  return result.rows[0];
}

async function getTeamCompetitions(teamId) {
  const result = await pool.query(
    `
      SELECT
        c.id AS competition_id,
        c.api_id AS competition_api_id,
        c.name AS competition_name,
        c.type AS competition_type,
        c.logo AS competition_logo,
        cs.id AS competition_season_id,
        cs.season_year,
        cs.start_date,
        cs.end_date,
        cs.current,
        tcs.group_name,
        tcs.stage,
        tcs.is_active
      FROM team_competition_seasons tcs
      JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
      JOIN competitions c ON c.id = cs.competition_id
      WHERE tcs.team_id = $1
      ORDER BY cs.current DESC, cs.season_year DESC, c.name
    `,
    [teamId]
  );
  return result.rows;
}

async function getCurrentSquad(teamId) {
  const result = await pool.query(
    `
      SELECT
        tsp.player_id,
        tsp.shirt_number,
        tsp.position AS squad_position,
        tsp.joined_at,
        tsp.left_at,
        p.api_id AS player_api_id,
        p.name AS player_name,
        p.firstname,
        p.lastname,
        p.photo_path,
        p.nationality
      FROM team_squad_players tsp
      JOIN players p ON p.id = tsp.player_id
      WHERE tsp.team_id = $1
        AND tsp.is_current = TRUE
      ORDER BY tsp.position NULLS LAST, tsp.shirt_number NULLS LAST, p.name
    `,
    [teamId]
  );
  return result.rows;
}

async function getTeamSeasonStatistics(teamId, competitionSeasonId = null) {
  const params = [teamId];
  const seasonFilter = competitionSeasonId ? "AND tss.competition_season_id = $2" : "";
  if (competitionSeasonId) params.push(competitionSeasonId);
  const result = await pool.query(
    `
      SELECT tss.*
      FROM team_season_statistics tss
      WHERE tss.team_id = $1
      ${seasonFilter}
      ORDER BY tss.updated_at DESC, tss.id DESC
      LIMIT 1
    `,
    params
  );
  return result.rows[0] || null;
}

async function getTeamGoalStatistics(teamSeasonStatisticsId) {
  if (!teamSeasonStatisticsId) return [];
  const result = await pool.query(
    `
      SELECT *
      FROM team_goal_statistics
      WHERE team_season_statistics_id = $1
      ORDER BY goal_direction, minute_from NULLS LAST, minute_to NULLS LAST
    `,
    [teamSeasonStatisticsId]
  );
  return result.rows;
}

async function getTeamFormationStatistics(teamSeasonStatisticsId) {
  if (!teamSeasonStatisticsId) return [];
  const result = await pool.query(
    `
      SELECT *
      FROM team_lineup_statistics
      WHERE team_season_statistics_id = $1
      ORDER BY played DESC NULLS LAST, formation
    `,
    [teamSeasonStatisticsId]
  );
  return result.rows;
}

async function getTeamCompetitionContext(teamId, competitionSeasonId) {
  const result = await pool.query(
    `
      SELECT
        tcs.group_name,
        tcs.stage,
        tcs.is_active,
        c.id AS competition_id,
        c.api_id AS competition_api_id,
        c.name AS competition_name,
        c.type AS competition_type,
        c.logo AS competition_logo,
        cs.id AS competition_season_id,
        cs.season_year,
        cs.start_date,
        cs.end_date,
        cs.current
      FROM team_competition_seasons tcs
      JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
      JOIN competitions c ON c.id = cs.competition_id
      WHERE tcs.team_id = $1
        AND tcs.competition_season_id = $2
      LIMIT 1
    `,
    [teamId, competitionSeasonId]
  );
  return result.rows[0] || null;
}

async function getTeamCompetitionMatches(teamId, competitionSeasonId) {
  const result = await pool.query(
    `
      SELECT
        m.*,
        ht.name AS home_team_name,
        ht.logo_path AS home_team_logo,
        at.name AS away_team_name,
        at.logo_path AS away_team_logo
      FROM matches m
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE (m.home_team_id = $1 OR m.away_team_id = $1)
        AND m.competition_season_id = $2
      ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
    `,
    [teamId, competitionSeasonId]
  );
  return result.rows;
}

async function getTeamCompetitionStanding(teamId, competitionSeasonId) {
  const result = await pool.query(
    `
      SELECT *
      FROM standings
      WHERE team_id = $1
        AND competition_season_id = $2
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [teamId, competitionSeasonId]
  );
  return result.rows[0] || null;
}

async function getTeamCompetitionPlayerStatistics(teamId, competitionSeasonId) {
  const result = await pool.query(
    `
      SELECT
        pss.*,
        p.id AS player_id,
        p.api_id AS player_api_id,
        p.name AS player_name,
        p.photo_path,
        p.nationality
      FROM player_season_statistics pss
      JOIN players p ON p.id = pss.player_id
      WHERE pss.team_id = $1
        AND pss.competition_season_id = $2
      ORDER BY pss.appearances DESC NULLS LAST, pss.minutes DESC NULLS LAST, p.name
    `,
    [teamId, competitionSeasonId]
  );
  return result.rows;
}

async function getTeamCoaches(teamId) {
  const result = await pool.query(
    `
      SELECT tc.*, c.name, c.firstname, c.lastname, c.photo_path, c.nationality
      FROM team_coaches tc
      JOIN coaches c ON c.id = tc.coach_id
      WHERE tc.team_id = $1
      ORDER BY tc.is_current DESC, tc.started_at DESC NULLS LAST, tc.id DESC
    `,
    [teamId]
  );
  return result.rows;
}

async function getTeamTrophies(teamId) {
  const result = await pool.query(
    `
      SELECT tt.*, c.api_id AS competition_api_id
      FROM team_trophies tt
      LEFT JOIN competitions c ON c.id = tt.competition_id
      WHERE tt.team_id = $1
      ORDER BY tt.season DESC NULLS LAST, tt.competition_name, tt.place
    `,
    [teamId]
  );
  return result.rows;
}

async function getTeamTransfers(teamId) {
  const result = await pool.query(
    `
      SELECT
        pt.*,
        p.name AS player_name,
        p.api_id AS player_api_id,
        p.photo_path AS player_photo_path,
        ft.name AS from_team_name,
        tt.name AS to_team_name
      FROM player_transfers pt
      JOIN players p ON p.id = pt.player_id
      LEFT JOIN teams ft ON ft.id = pt.from_team_id
      LEFT JOIN teams tt ON tt.id = pt.to_team_id
      WHERE pt.from_team_id = $1 OR pt.to_team_id = $1
      ORDER BY pt.transfer_date DESC NULLS LAST, pt.id DESC
    `,
    [teamId]
  );
  return result.rows;
}

async function getTeamRecentMatches(teamId) {
  const result = await pool.query(
    `
      SELECT
        m.*,
        ht.name AS home_team_name,
        ht.logo_path AS home_team_logo,
        at.name AS away_team_name,
        at.logo_path AS away_team_logo
      FROM matches m
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE m.home_team_id = $1 OR m.away_team_id = $1
      ORDER BY COALESCE(kickoff_at, match_date) DESC
    `,
    [teamId]
  );
  return result.rows;
}

async function getTeamStandings(teamId) {
  const result = await pool.query(
    `
      SELECT s.*
      FROM standings s
      WHERE s.team_id = $1
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT 1
    `,
    [teamId]
  );
  return result.rows[0] || null;
}

async function getTeamStandingSnapshots(teamId) {
  const result = await pool.query(
    `
      SELECT *
      FROM team_standing_snapshots
      WHERE team_id = $1
      ORDER BY snapshot_at DESC
      LIMIT 20
    `,
    [teamId]
  );
  return result.rows;
}

async function getTeamFormSnapshots(teamId) {
  const result = await pool.query(
    `
      SELECT *
      FROM team_form_snapshots
      WHERE team_id = $1
      ORDER BY snapshot_at DESC
      LIMIT 20
    `,
    [teamId]
  );
  return result.rows;
}

async function getFullTeamDetails(teamId) {
  const team = await getTeamById(teamId);
  if (!team) return null;

  const [venue, competitions, squad, seasonStatistics, coaches, trophies, transfers, matches, standings, standingHistory, formHistory] =
    await Promise.all([
      getTeamVenue(teamId),
      getTeamCompetitions(teamId),
      getCurrentSquad(teamId),
      getTeamSeasonStatistics(teamId),
      getTeamCoaches(teamId),
      getTeamTrophies(teamId),
      getTeamTransfers(teamId),
      getTeamRecentMatches(teamId),
      getTeamStandings(teamId),
      getTeamStandingSnapshots(teamId),
      getTeamFormSnapshots(teamId)
    ]);

  const [goalTimings, formations] = await Promise.all([
    getTeamGoalStatistics(seasonStatistics?.id),
    getTeamFormationStatistics(seasonStatistics?.id)
  ]);

  const now = new Date();
  const previous = [];
  const next = [];
  for (const match of matches) {
    const date = match.kickoff_at || match.match_date;
    if (date && new Date(date) >= now) {
      next.push(matchDto(match));
    } else {
      previous.push(matchDto(match));
    }
  }

  const incoming = transfers.filter((row) => String(row.to_team_id) === String(teamId));
  const outgoing = transfers.filter((row) => String(row.from_team_id) === String(teamId));
  const currentCoach = coaches.find((coach) => coach.is_current) || null;

  return {
    team: teamDto(team),
    venue: venueDto(venue),
    currentCompetition: competitions.find((competition) => competition.current) ? competitionDto(competitions.find((competition) => competition.current)) : null,
    competitions: competitions.map(competitionDto),
    currentSquad: squad.map(playerDto),
    seasonStatistics,
    goalTimings: {
      for: goalTimings.filter((row) => row.goal_direction === "FOR"),
      against: goalTimings.filter((row) => row.goal_direction === "AGAINST")
    },
    formations,
    currentCoach: currentCoach
      ? {
          id: currentCoach.coach_id,
          name: currentCoach.name,
          firstname: currentCoach.firstname,
          lastname: currentCoach.lastname,
          photo: toAssetPath(currentCoach.photo_path),
          nationality: currentCoach.nationality
        }
      : null,
    coachHistory: coaches,
    standings,
    standingHistory,
    form: formHistory[0] || null,
    formHistory,
    trophies,
    transfers: {
      incoming,
      outgoing
    },
    matches: {
      previous: previous.slice(0, 5),
      next: next.reverse().slice(0, 5)
    }
  };
}

async function getTeamCompetitionDetails(teamId, competitionSeasonId) {
  const team = await getTeamById(teamId);
  if (!team) return null;

  const context = await getTeamCompetitionContext(teamId, competitionSeasonId);
  if (!context) return null;

  const [seasonStatistics, matches, standing, playerStatistics] = await Promise.all([
    getTeamSeasonStatistics(teamId, competitionSeasonId),
    getTeamCompetitionMatches(teamId, competitionSeasonId),
    getTeamCompetitionStanding(teamId, competitionSeasonId),
    getTeamCompetitionPlayerStatistics(teamId, competitionSeasonId)
  ]);

  const [goalTimings, formations] = await Promise.all([
    getTeamGoalStatistics(seasonStatistics?.id),
    getTeamFormationStatistics(seasonStatistics?.id)
  ]);

  const played = matches.filter((match) => match.home_goals != null || match.away_goals != null);
  const upcoming = matches.filter((match) => match.home_goals == null && match.away_goals == null);

  return {
    team: teamDto(team),
    competition: competitionDto(context),
    groupName: context.group_name,
    stage: context.stage,
    active: context.is_active,
    standing: standingDto(standing),
    seasonStatistics,
    goalTimings: {
      for: goalTimings.filter((row) => row.goal_direction === "FOR"),
      against: goalTimings.filter((row) => row.goal_direction === "AGAINST")
    },
    formations,
    playerStatistics: playerStatistics.map(playerCompetitionStatDto),
    matches: {
      all: matches.map(matchDto),
      played: played.map(matchDto),
      upcoming: upcoming.map(matchDto)
    }
  };
}

module.exports = {
  getAllTeams,
  getTeamById,
  getTeamByApiId,
  getTeamsByCountry,
  getTeamsByName,
  getTeamsByCompetitionAndSeason,
  getCompetitionsByTeamAndSeason,
  getTeamVenue,
  getTeamCompetitions,
  getCurrentSquad,
  getTeamSeasonStatistics,
  getTeamGoalStatistics,
  getTeamFormationStatistics,
  getTeamCoaches,
  getTeamTrophies,
  getTeamTransfers,
  getTeamRecentMatches,
  getTeamStandings,
  getFullTeamDetails,
  getTeamCompetitionDetails,
  teamDto
};
