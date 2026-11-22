const pool = require("../../config/db");
const { toAssetPath } = require("../../utils/assets");

async function getAllMatches() {
  const query = "SELECT * FROM matches";
  const result = await pool.query(query);
  return result.rows;
}

async function getMatchById(id) {
  const query = "SELECT * FROM matches WHERE id = $1";
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function getMatchesByCompetitionAndSeason(competitionId, seasonId) {
  const query = `
    SELECT
      m.*,
      ht.name AS home_team_name,
      ht.logo_path AS home_team_logo,
      at.name AS away_team_name,
      at.logo_path AS away_team_logo
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    WHERE m.competition_id = $1
      AND (
        m.season_id = $2
        OR m.competition_season_id = $2
        OR m.competition_season_id IN (
          SELECT id
          FROM competition_seasons
          WHERE competition_id = $1
            AND season_year::text = $2::text
        )
      )
    ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
  `;
  const result = await pool.query(query, [competitionId, seasonId]);
  return result.rows;
}

async function getMatchesByTeamAndSeasonAndCompetition(teamId, seasonId, competitionId) {
  const query =
    "SELECT * FROM matches WHERE (home_team_id = $1 OR away_team_id = $1) AND season_id = $2 AND competition_id = $3";
  const result = await pool.query(query, [teamId, seasonId, competitionId]);
  return result.rows;
}

async function getMatchesByDateRangeAndCompetition(startDate, endDate, competitionId) {
  const query = "SELECT * FROM matches WHERE match_date BETWEEN $1 AND $2 AND competition_id = $3";
  const result = await pool.query(query, [startDate, endDate, competitionId]);
  return result.rows;
}

async function getMatchEvents(matchId) {
  const query = `
    WITH ranked_events AS (
      SELECT
        e.*,
        t.name AS team_name,
        p.name AS player_name,
        ap.name AS assist_player_name,
        ROW_NUMBER() OVER (
          PARTITION BY
            e.match_id,
            e.elapsed,
            e.extra,
            e.team_id,
            e.event_type,
            e.event_detail,
            COALESCE(e.player_id, -1),
            COALESCE(e.assist_player_id, -1),
            COALESCE(e.comments, '')
          ORDER BY
            (
              CASE WHEN e.player_id IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN e.assist_player_id IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN e.comments IS NOT NULL THEN 1 ELSE 0 END
            ) DESC,
            e.event_order NULLS LAST,
            e.id DESC
        ) AS row_rank
      FROM match_events e
      LEFT JOIN teams t ON t.id = e.team_id
      LEFT JOIN players p ON p.id = e.player_id
      LEFT JOIN players ap ON ap.id = e.assist_player_id
      WHERE e.match_id = $1
    )
    SELECT
      *
    FROM ranked_events
    WHERE row_rank = 1
    ORDER BY elapsed NULLS LAST, extra NULLS LAST, event_order NULLS LAST, id
  `;
  const result = await pool.query(query, [matchId]);
  return result.rows;
}

async function getMatchTeamStatistics(matchId) {
  const query = `
    SELECT s.*, t.name AS team_name
    FROM match_team_statistics s
    JOIN teams t ON t.id = s.team_id
    WHERE s.match_id = $1
    ORDER BY s.team_id
  `;
  const result = await pool.query(query, [matchId]);
  return result.rows;
}

async function getMatchLineups(matchId) {
  const query = `
    SELECT l.*, c.name AS coach_name, c.photo_path AS coach_photo_path
    FROM match_lineups l
    LEFT JOIN coaches c ON c.id = l.coach_id
    WHERE l.match_id = $1
    ORDER BY l.team_id
  `;
  const result = await pool.query(query, [matchId]);
  return result.rows;
}

async function getMatchLineupPlayers(matchId) {
  const query = `
    SELECT lp.*, p.name AS player_full_name, p.photo_path AS player_photo
    FROM match_lineup_players lp
    LEFT JOIN players p ON p.id = lp.player_id
    WHERE lp.match_id = $1
    ORDER BY lp.lineup_id, lp.lineup_type, lp.display_order NULLS LAST, lp.id
  `;
  const result = await pool.query(query, [matchId]);
  return result.rows;
}

async function getMatchPlayerStatistics(matchId) {
  const query = `
    SELECT ps.*, p.name AS player_name, p.photo_path AS player_photo
    FROM match_player_statistics ps
    LEFT JOIN players p ON p.id = ps.player_id
    WHERE ps.match_id = $1
    ORDER BY
      ps.team_id,
      ps.rating DESC NULLS LAST,
      ps.substitute,
      ps.shirt_number NULLS LAST,
      ps.id
  `;
  const result = await pool.query(query, [matchId]);
  return result.rows;
}

async function getMatchOdds(matchId) {
  const query = `
    SELECT *
    FROM match_odds
    WHERE match_id = $1
    ORDER BY
      CASE scope WHEN 'live' THEN 0 ELSE 1 END,
      bookmaker_name,
      bet_name,
      value_name
  `;
  const result = await pool.query(query, [matchId]);
  return result.rows;
}

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
    logo: toAssetPath(team.logo_path || team.logo),
    national: team.is_national ?? team.national
  });
}

function scoreDto(match) {
  return {
    home: match.home_goals ?? match.home_score ?? null,
    away: match.away_goals ?? match.away_score ?? null,
    halftime: { home: match.halftime_home ?? null, away: match.halftime_away ?? null },
    fulltime: { home: match.fulltime_home ?? null, away: match.fulltime_away ?? null },
    extratime: { home: match.extratime_home ?? null, away: match.extratime_away ?? null },
    penalty: { home: match.penalty_home ?? null, away: match.penalty_away ?? null }
  };
}

function eventDto(event) {
  return {
    id: event.id,
    eventKey: event.event_key,
    order: event.event_order,
    team: event.team_id ? { id: event.team_id, name: event.team_name } : null,
    player: event.player_id ? { id: event.player_id, name: event.player_name } : null,
    assistPlayer: event.assist_player_id ? { id: event.assist_player_id, name: event.assist_player_name } : null,
    elapsed: event.elapsed,
    extra: event.extra,
    type: event.event_type,
    detail: event.event_detail,
    comments: event.comments
  };
}

function statisticsDto(row) {
  if (!row) return null;
  return {
    shotsOnGoal: row.shots_on_goal,
    shotsOffGoal: row.shots_off_goal,
    totalShots: row.total_shots,
    blockedShots: row.blocked_shots,
    shotsInsideBox: row.shots_inside_box,
    shotsOutsideBox: row.shots_outside_box,
    fouls: row.fouls,
    cornerKicks: row.corner_kicks,
    offsides: row.offsides,
    ballPossession: row.ball_possession,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    goalkeeperSaves: row.goalkeeper_saves,
    totalPasses: row.total_passes,
    passesAccurate: row.passes_accurate,
    passesPercentage: row.passes_percentage,
    expectedGoals: row.expected_goals,
    extra: row.extra_statistics || {}
  };
}

function lineupPlayerDto(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.player_full_name || row.player_name_snapshot,
    photo: toAssetPath(row.player_photo),
    shirtNumber: row.shirt_number,
    position: row.position,
    lineupType: row.lineup_type,
    grid: row.grid,
    gridRow: row.grid_row,
    gridColumn: row.grid_column,
    displayOrder: row.display_order
  };
}

function playerStatisticsDto(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.player_name,
    photo: toAssetPath(row.player_photo),
    shirtNumber: row.shirt_number,
    position: row.position,
    rating: row.rating,
    captain: row.captain,
    substitute: row.substitute,
    minutes: row.minutes,
    offsides: row.offsides,
    shots: { total: row.shots_total, on: row.shots_on },
    goals: {
      total: row.goals_total,
      conceded: row.goals_conceded,
      assists: row.goals_assists,
      saves: row.goalkeeper_saves
    },
    passes: { total: row.passes_total, key: row.passes_key, accuracy: row.passes_accuracy },
    tackles: {
      total: row.tackles_total,
      blocks: row.tackles_blocks,
      interceptions: row.tackles_interceptions
    },
    duels: { total: row.duels_total, won: row.duels_won },
    dribbles: {
      attempts: row.dribbles_attempts,
      success: row.dribbles_success,
      past: row.dribbles_past
    },
    fouls: { drawn: row.fouls_drawn, committed: row.fouls_committed },
    cards: { yellow: row.cards_yellow, yellowRed: row.cards_yellow_red, red: row.cards_red },
    penalties: {
      won: row.penalties_won,
      committed: row.penalties_committed,
      scored: row.penalties_scored,
      missed: row.penalties_missed,
      saved: row.penalties_saved
    },
    extra: row.extra_statistics || {}
  };
}

function oddsValueDto(row) {
  const odd = row.odd == null ? null : Number(row.odd);
  const previousOdd = row.previous_odd == null ? null : Number(row.previous_odd);
  const movement =
    odd != null && previousOdd != null
      ? odd > previousOdd
        ? "up"
        : odd < previousOdd
          ? "down"
          : "same"
      : "same";

  return {
    id: row.id,
    name: row.value_name,
    odd,
    previousOdd,
    movement,
    changedAt: row.odd_changed_at,
    main: row.is_main,
    suspended: row.is_suspended
  };
}

function isMatchWinnerBet(name) {
  const value = String(name || "").toLowerCase();
  return value === "match winner" || value === "winner" || value === "1x2" || value.includes("match winner");
}

function classifyWinnerValue(valueName, teams) {
  const value = String(valueName || "").trim().toLowerCase();
  const home = String(teams?.home?.name || "").trim().toLowerCase();
  const away = String(teams?.away?.name || "").trim().toLowerCase();

  if (["home", "1"].includes(value) || (home && value === home)) return "home";
  if (["draw", "x"].includes(value)) return "draw";
  if (["away", "2"].includes(value) || (away && value === away)) return "away";
  return "";
}

function oddsDto(rows, teams) {
  const byScope = new Map();
  const summary = { prematch: null, live: null };
  const best = { prematch: null, live: null };

  rows.forEach((row) => {
    const scope = row.scope || "prematch";
    const scopeGroup = byScope.get(scope) || new Map();
    const bookmakerKey = `${row.bookmaker_api_id || row.bookmaker_name}`;
    const bookmaker = scopeGroup.get(bookmakerKey) || {
      id: row.bookmaker_api_id,
      name: row.bookmaker_name,
      bets: new Map()
    };
    const betKey = `${row.bet_api_id || row.bet_name}`;
    const bet = bookmaker.bets.get(betKey) || {
      id: row.bet_api_id,
      name: row.bet_name,
      values: []
    };

    bet.values.push(oddsValueDto(row));
    bookmaker.bets.set(betKey, bet);
    scopeGroup.set(bookmakerKey, bookmaker);
    byScope.set(scope, scopeGroup);

    if (!summary[scope] && isMatchWinnerBet(row.bet_name)) {
      summary[scope] = {
        bookmaker: { id: row.bookmaker_api_id, name: row.bookmaker_name },
        updatedAt: row.api_updated_at || row.fetched_at,
        values: { home: null, draw: null, away: null }
      };
    }

    if (summary[scope] && isMatchWinnerBet(row.bet_name)) {
      const slot = classifyWinnerValue(row.value_name, teams);
      if (slot && summary[scope].values[slot] == null) {
        summary[scope].values[slot] = oddsValueDto(row);
      }

      if (slot && row.odd != null) {
        const currentBest = best[scope]?.values?.[slot];
        const currentOdd = currentBest?.odd == null ? -Infinity : Number(currentBest.odd);
        const candidate = oddsValueDto(row);
        if (!best[scope]) {
          best[scope] = {
            updatedAt: row.api_updated_at || row.fetched_at,
            values: { home: null, draw: null, away: null }
          };
        }
        if (Number(candidate.odd) > currentOdd) {
          best[scope].values[slot] = {
            ...candidate,
            bookmaker: { id: row.bookmaker_api_id, name: row.bookmaker_name }
          };
        }
      }
    }
  });

  const groups = Object.fromEntries(
    Array.from(byScope.entries()).map(([scope, bookmakers]) => [
      scope,
      Array.from(bookmakers.values()).map((bookmaker) => ({
        id: bookmaker.id,
        name: bookmaker.name,
        bets: Array.from(bookmaker.bets.values())
      }))
    ])
  );

  return {
    summary,
    best,
    groups,
    updatedAt: rows[0]?.api_updated_at || rows[0]?.fetched_at || null
  };
}

function finishedMatchWhereClause(alias = "m") {
  return `
    COALESCE(${alias}.status_short, ${alias}.status, '') IN ('FT', 'AET', 'PEN')
    AND COALESCE(${alias}.home_goals, ${alias}.home_score) IS NOT NULL
    AND COALESCE(${alias}.away_goals, ${alias}.away_score) IS NOT NULL
  `;
}

function matchResultForTeam(row, teamId) {
  const isHome = String(row.home_team_id) === String(teamId);
  const goalsFor = isHome ? row.home_goals : row.away_goals;
  const goalsAgainst = isHome ? row.away_goals : row.home_goals;
  if (goalsFor > goalsAgainst) return "win";
  if (goalsFor < goalsAgainst) return "loss";
  return "draw";
}

function firstGoalTeamId(events) {
  const goal = [...events]
    .filter((event) => String(event.event_type || "").toLowerCase().includes("goal"))
    .filter((event) => !String(event.event_detail || "").toLowerCase().includes("missed"))
    .sort((a, b) => (a.elapsed ?? 999) - (b.elapsed ?? 999) || (a.extra ?? 0) - (b.extra ?? 0) || (a.event_order ?? 999) - (b.event_order ?? 999))[0];

  return goal?.team_id || null;
}

function emptyTeamTrend(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
    failedToScore: 0,
    bothTeamsScored: 0,
    over25Goals: 0,
    scoredFirst: 0,
    form: [],
    averages: { goalsFor: 0, goalsAgainst: 0 },
    rates: { win: 0, loss: 0, bothTeamsScored: 0, over25Goals: 0, cleanSheet: 0, scoredFirst: 0 }
  };
}

function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function buildTeamTrend(team, teamId, rows, eventsByMatch) {
  const trend = emptyTeamTrend(team);

  rows.forEach((row) => {
    const isHome = String(row.home_team_id) === String(teamId);
    const goalsFor = Number(isHome ? row.home_goals : row.away_goals);
    const goalsAgainst = Number(isHome ? row.away_goals : row.home_goals);
    const result = matchResultForTeam(row, teamId);
    const matchEvents = eventsByMatch.get(String(row.id)) || [];
    const firstTeamId = firstGoalTeamId(matchEvents);

    trend.played += 1;
    trend.goalsFor += goalsFor;
    trend.goalsAgainst += goalsAgainst;
    if (result === "win") trend.wins += 1;
    if (result === "draw") trend.draws += 1;
    if (result === "loss") trend.losses += 1;
    if (goalsAgainst === 0) trend.cleanSheets += 1;
    if (goalsFor === 0) trend.failedToScore += 1;
    if (goalsFor > 0 && goalsAgainst > 0) trend.bothTeamsScored += 1;
    if (goalsFor + goalsAgainst > 2) trend.over25Goals += 1;
    if (firstTeamId && String(firstTeamId) === String(teamId)) trend.scoredFirst += 1;
    trend.form.push(result.charAt(0).toUpperCase());
  });

  trend.averages = {
    goalsFor: trend.played ? Number((trend.goalsFor / trend.played).toFixed(2)) : 0,
    goalsAgainst: trend.played ? Number((trend.goalsAgainst / trend.played).toFixed(2)) : 0
  };
  trend.rates = {
    win: percent(trend.wins, trend.played),
    loss: percent(trend.losses, trend.played),
    bothTeamsScored: percent(trend.bothTeamsScored, trend.played),
    over25Goals: percent(trend.over25Goals, trend.played),
    cleanSheet: percent(trend.cleanSheets, trend.played),
    scoredFirst: percent(trend.scoredFirst, trend.played)
  };

  return trend;
}

function h2hMatchDto(row, homeTeamId, awayTeamId) {
  const homeIsTeamA = String(row.home_team_id) === String(homeTeamId);
  return {
    id: row.id,
    kickoffAt: row.kickoff_at || row.match_date,
    competition: row.competition_name ? { id: row.competition_id, name: row.competition_name } : null,
    home: {
      id: row.home_team_id,
      name: row.home_team_name,
      goals: row.home_goals
    },
    away: {
      id: row.away_team_id,
      name: row.away_team_name,
      goals: row.away_goals
    },
    perspective: {
      teamAHome: homeIsTeamA,
      teamAGoals: homeIsTeamA ? row.home_goals : row.away_goals,
      teamBGoals: homeIsTeamA ? row.away_goals : row.home_goals
    }
  };
}

function buildH2hTrend(homeTeamId, awayTeamId, rows, eventsByMatch) {
  const trend = {
    played: 0,
    teamAWins: 0,
    draws: 0,
    teamBWins: 0,
    teamAGoals: 0,
    teamBGoals: 0,
    bothTeamsScored: 0,
    over25Goals: 0,
    teamAScoredFirst: 0,
    teamBScoredFirst: 0,
    recentMatches: [],
    rates: { teamAWin: 0, draw: 0, teamBWin: 0, bothTeamsScored: 0, over25Goals: 0 }
  };

  rows.forEach((row) => {
    const homeIsTeamA = String(row.home_team_id) === String(homeTeamId);
    const teamAGoals = Number(homeIsTeamA ? row.home_goals : row.away_goals);
    const teamBGoals = Number(homeIsTeamA ? row.away_goals : row.home_goals);
    const matchEvents = eventsByMatch.get(String(row.id)) || [];
    const firstTeamId = firstGoalTeamId(matchEvents);

    trend.played += 1;
    trend.teamAGoals += teamAGoals;
    trend.teamBGoals += teamBGoals;
    if (teamAGoals > teamBGoals) trend.teamAWins += 1;
    else if (teamAGoals < teamBGoals) trend.teamBWins += 1;
    else trend.draws += 1;
    if (teamAGoals > 0 && teamBGoals > 0) trend.bothTeamsScored += 1;
    if (teamAGoals + teamBGoals > 2) trend.over25Goals += 1;
    if (firstTeamId && String(firstTeamId) === String(homeTeamId)) trend.teamAScoredFirst += 1;
    if (firstTeamId && String(firstTeamId) === String(awayTeamId)) trend.teamBScoredFirst += 1;
  });

  trend.rates = {
    teamAWin: percent(trend.teamAWins, trend.played),
    draw: percent(trend.draws, trend.played),
    teamBWin: percent(trend.teamBWins, trend.played),
    bothTeamsScored: percent(trend.bothTeamsScored, trend.played),
    over25Goals: percent(trend.over25Goals, trend.played)
  };
  trend.recentMatches = rows.slice(0, 5).map((row) => h2hMatchDto(row, homeTeamId, awayTeamId));
  return trend;
}

async function getPreMatchStats(matchId) {
  const baseResult = await pool.query(
    `
      SELECT
        m.id,
        m.home_team_id,
        m.away_team_id,
        COALESCE(m.kickoff_at, m.match_date) AS kickoff_at,
        row_to_json(ht) AS home_team,
        row_to_json(at) AS away_team
      FROM matches m
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE m.id = $1
    `,
    [matchId]
  );
  const base = baseResult.rows[0];
  if (!base?.home_team_id || !base?.away_team_id) return null;

  const cutoff = base.kickoff_at || new Date();
  const completedWhere = finishedMatchWhereClause("m");
  const [homeRowsResult, awayRowsResult, h2hRowsResult] = await Promise.all([
    pool.query(
      `
        SELECT
          m.*,
          COALESCE(m.home_goals, m.home_score) AS home_goals,
          COALESCE(m.away_goals, m.away_score) AS away_goals
        FROM matches m
        WHERE m.id <> $1
          AND (m.home_team_id = $2 OR m.away_team_id = $2)
          AND COALESCE(m.kickoff_at, m.match_date) < $3
          AND ${completedWhere}
        ORDER BY COALESCE(m.kickoff_at, m.match_date) DESC, m.id DESC
        LIMIT 10
      `,
      [matchId, base.home_team_id, cutoff]
    ),
    pool.query(
      `
        SELECT
          m.*,
          COALESCE(m.home_goals, m.home_score) AS home_goals,
          COALESCE(m.away_goals, m.away_score) AS away_goals
        FROM matches m
        WHERE m.id <> $1
          AND (m.home_team_id = $2 OR m.away_team_id = $2)
          AND COALESCE(m.kickoff_at, m.match_date) < $3
          AND ${completedWhere}
        ORDER BY COALESCE(m.kickoff_at, m.match_date) DESC, m.id DESC
        LIMIT 10
      `,
      [matchId, base.away_team_id, cutoff]
    ),
    pool.query(
      `
        SELECT
          m.*,
          COALESCE(m.home_goals, m.home_score) AS home_goals,
          COALESCE(m.away_goals, m.away_score) AS away_goals,
          c.name AS competition_name,
          ht.name AS home_team_name,
          at.name AS away_team_name
        FROM matches m
        LEFT JOIN competitions c ON c.id = m.competition_id
        LEFT JOIN teams ht ON ht.id = m.home_team_id
        LEFT JOIN teams at ON at.id = m.away_team_id
        WHERE m.id <> $1
          AND (
            (m.home_team_id = $2 AND m.away_team_id = $3)
            OR (m.home_team_id = $3 AND m.away_team_id = $2)
          )
          AND COALESCE(m.kickoff_at, m.match_date) < $4
          AND ${completedWhere}
        ORDER BY COALESCE(m.kickoff_at, m.match_date) DESC, m.id DESC
        LIMIT 10
      `,
      [matchId, base.home_team_id, base.away_team_id, cutoff]
    )
  ]);

  const matchIds = [
    ...homeRowsResult.rows,
    ...awayRowsResult.rows,
    ...h2hRowsResult.rows
  ].map((row) => row.id);
  const uniqueMatchIds = [...new Set(matchIds)];
  const eventsByMatch = new Map();

  if (uniqueMatchIds.length) {
    const eventsResult = await pool.query(
      `
        SELECT match_id, team_id, elapsed, extra, event_type, event_detail, event_order
        FROM match_events
        WHERE match_id = ANY($1)
          AND event_type ILIKE '%Goal%'
        ORDER BY match_id, elapsed NULLS LAST, extra NULLS LAST, event_order NULLS LAST, id
      `,
      [uniqueMatchIds]
    );

    eventsResult.rows.forEach((event) => {
      const key = String(event.match_id);
      const current = eventsByMatch.get(key) || [];
      current.push(event);
      eventsByMatch.set(key, current);
    });
  }

  return {
    sampleSize: {
      team: 10,
      headToHead: 10
    },
    home: buildTeamTrend(teamDto(base.home_team), base.home_team_id, homeRowsResult.rows, eventsByMatch),
    away: buildTeamTrend(teamDto(base.away_team), base.away_team_id, awayRowsResult.rows, eventsByMatch),
    headToHead: buildH2hTrend(base.home_team_id, base.away_team_id, h2hRowsResult.rows, eventsByMatch)
  };
}

function liveMatchDto(row) {
  const homeGoals = row.home_goals ?? row.home_score ?? null;
  const awayGoals = row.away_goals ?? row.away_score ?? null;

  return {
    id: row.id,
    apiId: row.api_id,
    round: row.round,
    time: row.kickoff_at || row.match_date,
    status: {
      short: row.status_short || row.status,
      long: row.status_long,
      elapsed: row.elapsed,
      extra: row.elapsed_extra,
      updatedAt: row.last_live_sync_at || row.api_synced_at || row.updated_at
    },
    competition: row.competition_id
      ? {
          id: row.competition_id,
          name: row.competition_name,
          logo: toAssetPath(row.competition_logo)
        }
      : null,
    teams: {
      home: {
        id: row.home_team_id,
        name: row.home_team_name || "Home",
        logo: toAssetPath(row.home_team_logo),
        redCards: row.home_red_cards ?? null
      },
      away: {
        id: row.away_team_id,
        name: row.away_team_name || "Away",
        logo: toAssetPath(row.away_team_logo),
        redCards: row.away_red_cards ?? null
      }
    },
    score: {
      home: homeGoals,
      away: awayGoals
    },
    lastEvent: row.last_event_id
      ? {
          id: row.last_event_id,
          elapsed: row.last_event_elapsed,
          extra: row.last_event_extra,
          type: row.last_event_type,
          detail: row.last_event_detail,
          player: row.last_event_player_name ? { name: row.last_event_player_name } : null
        }
      : null,
    updatedAt: row.last_live_sync_at || row.api_synced_at || row.updated_at
  };
}

async function getLiveMatches() {
  const query = `
    WITH candidate_matches AS (
      SELECT *
      FROM matches
      WHERE (
        status_short IN ('1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP')
        OR (
          kickoff_at BETWEEN NOW() - INTERVAL '3 hours' AND NOW() + INTERVAL '3 hours'
          AND COALESCE(fully_synced, FALSE) = FALSE
          AND COALESCE(status_short, '') NOT IN ('1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP')
          AND COALESCE(status_short, '') NOT IN ('FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD', 'AWD', 'WO')
        )
      )
    ),
    ranked_events AS (
      SELECT
        e.*,
        ROW_NUMBER() OVER (
          PARTITION BY
            e.match_id,
            e.elapsed,
            e.extra,
            e.team_id,
            e.event_type,
            e.event_detail,
            COALESCE(e.player_id, -1),
            COALESCE(e.assist_player_id, -1),
            COALESCE(e.comments, '')
          ORDER BY
            (
              CASE WHEN e.player_id IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN e.assist_player_id IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN e.comments IS NOT NULL THEN 1 ELSE 0 END
            ) DESC,
            e.event_order NULLS LAST,
            e.id DESC
        ) AS row_rank
      FROM match_events e
      JOIN candidate_matches cm ON cm.id = e.match_id
    ),
    deduped_events AS (
      SELECT *
      FROM ranked_events
      WHERE row_rank = 1
    ),
    last_events AS (
      SELECT DISTINCT ON (e.match_id)
        e.match_id,
        e.id,
        e.elapsed,
        e.extra,
        e.event_type,
        e.event_detail,
        p.name AS player_name
      FROM deduped_events e
      LEFT JOIN players p ON p.id = e.player_id
      ORDER BY e.match_id, e.elapsed DESC NULLS LAST, e.extra DESC NULLS LAST, e.event_order DESC NULLS LAST, e.id DESC
    ),
    cards AS (
      SELECT
        e.match_id,
        SUM(CASE WHEN e.team_id = m.home_team_id AND e.event_detail ILIKE '%Red%' THEN 1 ELSE 0 END) AS home_red_cards,
        SUM(CASE WHEN e.team_id = m.away_team_id AND e.event_detail ILIKE '%Red%' THEN 1 ELSE 0 END) AS away_red_cards
      FROM deduped_events e
      JOIN matches m ON m.id = e.match_id
      WHERE e.event_type ILIKE '%Card%'
      GROUP BY e.match_id
    )
    SELECT
      m.*,
      c.name AS competition_name,
      c.logo AS competition_logo,
      ht.name AS home_team_name,
      ht.logo_path AS home_team_logo,
      at.name AS away_team_name,
      at.logo_path AS away_team_logo,
      le.id AS last_event_id,
      le.elapsed AS last_event_elapsed,
      le.extra AS last_event_extra,
      le.event_type AS last_event_type,
      le.event_detail AS last_event_detail,
      le.player_name AS last_event_player_name,
      cards.home_red_cards,
      cards.away_red_cards
    FROM candidate_matches m
    LEFT JOIN competitions c ON c.id = m.competition_id
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN last_events le ON le.match_id = m.id
    LEFT JOIN cards ON cards.match_id = m.id
    ORDER BY COALESCE(m.kickoff_at, m.match_date), m.id
  `;
  const result = await pool.query(query);
  return result.rows.map(liveMatchDto);
}

async function getMatchEventsDto(matchId) {
  const events = await getMatchEvents(matchId);
  return events.map(eventDto);
}

async function getMatchTeamStatisticsDto(matchId) {
  const rows = await getMatchTeamStatistics(matchId);
  return rows.map((row) => ({
    team: { id: row.team_id, name: row.team_name },
    statistics: statisticsDto(row)
  }));
}

async function getMatchLineupsDto(matchId) {
  const baseResult = await pool.query("SELECT home_team_id, away_team_id FROM matches WHERE id = $1", [matchId]);
  const base = baseResult.rows[0];
  if (!base) return null;
  const lineups = await getMatchLineups(matchId);
  const players = await getMatchLineupPlayers(matchId);
  const playersByLineup = new Map();
  players.forEach((player) => {
    const lineupId = String(player.lineup_id);
    const current = playersByLineup.get(lineupId) || [];
    current.push(lineupPlayerDto(player));
    playersByLineup.set(lineupId, current);
  });
  const lineupByTeam = new Map(lineups.map((lineup) => [String(lineup.team_id), lineup]));
  const build = (teamId) => {
    const lineup = lineupByTeam.get(String(teamId));
    if (!lineup) return { formation: null, coach: null, startingXI: [], substitutes: [] };
    const items = playersByLineup.get(String(lineup.id)) || [];
    return {
      formation: lineup.formation,
      coach: lineup.coach_id ? { id: lineup.coach_id, name: lineup.coach_name, photo: toAssetPath(lineup.coach_photo_path) } : null,
      confirmed: lineup.confirmed,
      startingXI: items.filter((player) => player.lineupType === "STARTING_XI"),
      substitutes: items.filter((player) => player.lineupType === "SUBSTITUTE")
    };
  };
  return {
    home: build(base.home_team_id),
    away: build(base.away_team_id)
  };
}

async function getMatchPlayerStatisticsDto(matchId) {
  const baseResult = await pool.query("SELECT home_team_id, away_team_id FROM matches WHERE id = $1", [matchId]);
  const base = baseResult.rows[0];
  if (!base) return null;
  const rows = await getMatchPlayerStatistics(matchId);
  const byTeam = new Map();
  rows.forEach((row) => {
    const teamId = String(row.team_id);
    const current = byTeam.get(teamId) || [];
    current.push(playerStatisticsDto(row));
    byTeam.set(teamId, current);
  });
  return {
    home: byTeam.get(String(base.home_team_id)) || [],
    away: byTeam.get(String(base.away_team_id)) || []
  };
}

function buildFullMatchDetails({ base, events, statistics, lineups, lineupPlayers, playerStatistics, odds, preMatchStats }) {
  const match = base.match;
  const homeTeamId = String(match.home_team_id);
  const awayTeamId = String(match.away_team_id);
  const statByTeam = new Map(statistics.map((row) => [String(row.team_id), row]));
  const lineupPlayersByLineup = new Map();
  for (const player of lineupPlayers) {
    const lineupId = String(player.lineup_id);
    const current = lineupPlayersByLineup.get(lineupId) || [];
    current.push(player);
    lineupPlayersByLineup.set(lineupId, current);
  }
  const lineupByTeam = new Map(lineups.map((lineup) => [String(lineup.team_id), lineup]));
  const playerStatsByTeam = new Map();
  for (const row of playerStatistics) {
    const teamId = String(row.team_id);
    const current = playerStatsByTeam.get(teamId) || [];
    current.push(playerStatisticsDto(row));
    playerStatsByTeam.set(teamId, current);
  }

  const lineupDto = (teamId) => {
    const lineup = lineupByTeam.get(teamId);
    if (!lineup) {
      return { formation: null, coach: null, startingXI: [], substitutes: [] };
    }
    const players = (lineupPlayersByLineup.get(String(lineup.id)) || []).map(lineupPlayerDto);
    return {
      formation: lineup.formation,
      coach: lineup.coach_id ? { id: lineup.coach_id, name: lineup.coach_name, photo: toAssetPath(lineup.coach_photo_path) } : null,
      confirmed: lineup.confirmed,
      colors: {
        player: {
          primary: lineup.player_primary_color,
          number: lineup.player_number_color,
          border: lineup.player_border_color
        },
        goalkeeper: {
          primary: lineup.goalkeeper_primary_color,
          number: lineup.goalkeeper_number_color,
          border: lineup.goalkeeper_border_color
        }
      },
      startingXI: players.filter((player) => player.lineupType === "STARTING_XI"),
      substitutes: players.filter((player) => player.lineupType === "SUBSTITUTE")
    };
  };

  const teamsDto = {
    home: teamDto(base.home_team),
    away: teamDto(base.away_team)
  };

  return {
    match: {
      id: match.id,
      apiId: match.api_id,
      round: match.round,
      kickoffAt: match.kickoff_at || match.match_date,
      apiTimestamp: match.api_timestamp || match.fixture_timestamp,
      timezone: match.timezone,
      status: {
        long: match.status_long,
        short: match.status_short || match.status,
        elapsed: match.elapsed,
        extra: match.elapsed_extra,
        updatedAt: match.last_live_sync_at || match.api_synced_at || match.updated_at
      },
      refereeName: match.referee_name || match.referee,
      hasEvents: Boolean(match.has_events),
      hasLineups: Boolean(match.has_lineups),
      hasTeamStatistics: Boolean(match.has_team_statistics),
      hasPlayerStatistics: Boolean(match.has_player_statistics)
    },
    competition: base.competition
      ? {
          id: base.competition.id,
          apiId: base.competition.api_id,
          name: base.competition.name,
          type: base.competition.type,
          logo: toAssetPath(base.competition.logo),
          season: base.competition_season_id
            ? {
                id: base.competition_season_id,
                year: base.season_year,
                startDate: base.season_start_date,
                endDate: base.season_end_date,
                current: base.season_current
              }
            : null
        }
      : null,
    venue: base.venue
      ? {
          id: base.venue.id,
          apiId: base.venue.api_id,
          name: base.venue.name || match.stadium,
          address: base.venue.address,
          city: base.venue.city,
          country: base.venue.country,
          capacity: base.venue.capacity,
          surface: base.venue.surface,
          imagePath: toAssetPath(base.venue.image_path)
        }
      : match.stadium
        ? { id: null, apiId: null, name: match.stadium }
        : null,
    teams: teamsDto,
    score: scoreDto(match),
    odds: oddsDto(odds || [], teamsDto),
    events: events.map(eventDto),
    statistics: {
      home: statisticsDto(statByTeam.get(homeTeamId)),
      away: statisticsDto(statByTeam.get(awayTeamId))
    },
    lineups: {
      home: lineupDto(homeTeamId),
      away: lineupDto(awayTeamId)
    },
    playerStatistics: {
      home: playerStatsByTeam.get(homeTeamId) || [],
      away: playerStatsByTeam.get(awayTeamId) || []
    },
    preMatchStats: preMatchStats || null
  };
}

async function getFullMatchDetails(id) {
  const baseQuery = `
    SELECT
      row_to_json(m) AS match,
      row_to_json(c) AS competition,
      row_to_json(ht) AS home_team,
      row_to_json(at) AS away_team,
      row_to_json(v) AS venue,
      cs.id AS competition_season_id,
      cs.season_year,
      cs.start_date AS season_start_date,
      cs.end_date AS season_end_date,
      cs.current AS season_current
    FROM matches m
    LEFT JOIN competitions c ON c.id = m.competition_id
    LEFT JOIN competition_seasons cs ON cs.id = m.competition_season_id
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN venues v ON v.id = m.venue_id
    WHERE m.id = $1
  `;
  const baseResult = await pool.query(baseQuery, [id]);
  const base = baseResult.rows[0];
  if (!base) return null;

  const [events, statistics, lineups, lineupPlayers, playerStatistics, odds, preMatchStats] = await Promise.all([
    getMatchEvents(id),
    getMatchTeamStatistics(id),
    getMatchLineups(id),
    getMatchLineupPlayers(id),
    getMatchPlayerStatistics(id),
    getMatchOdds(id),
    getPreMatchStats(id)
  ]);

  return buildFullMatchDetails({ base, events, statistics, lineups, lineupPlayers, playerStatistics, odds, preMatchStats });
}

module.exports = {
  getAllMatches,
  getMatchById,
  getMatchesByCompetitionAndSeason,
  getMatchesByTeamAndSeasonAndCompetition,
  getMatchesByDateRangeAndCompetition,
  getMatchEvents,
  getMatchTeamStatistics,
  getMatchLineups,
  getMatchLineupPlayers,
  getMatchPlayerStatistics,
  getMatchOdds,
  getPreMatchStats,
  getFullMatchDetails,
  buildFullMatchDetails,
  getLiveMatches,
  getMatchEventsDto,
  getMatchTeamStatisticsDto,
  getMatchLineupsDto,
  getMatchPlayerStatisticsDto
};
