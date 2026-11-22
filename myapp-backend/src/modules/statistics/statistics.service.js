const repository = require("./statistics.repository");
require("./statistics.types");

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percentage(part, total) {
  return total > 0 ? round((part / total) * 100, 2) : 0;
}

function per90(value, minutes) {
  return minutes > 0 ? round((value / minutes) * 90, 2) : 0;
}

function resultForTeam(match, teamId) {
  const isHome = Number(match.home_team_id) === Number(teamId);
  const goalsFor = isHome ? numeric(match.home_goals) : numeric(match.away_goals);
  const goalsAgainst = isHome ? numeric(match.away_goals) : numeric(match.home_goals);
  const venue = isHome ? "home" : "away";
  let result = "D";

  if (goalsFor > goalsAgainst) result = "W";
  if (goalsFor < goalsAgainst) result = "L";

  return { goalsFor, goalsAgainst, result, venue };
}

function currentStreak(form) {
  if (!form.length) return { type: null, count: 0 };
  const type = form[form.length - 1];
  let count = 0;
  for (let index = form.length - 1; index >= 0 && form[index] === type; index -= 1) {
    count += 1;
  }
  return { type, count };
}

function summarizeTeamMatches(matches, teamId) {
  const summary = {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    pointsPerGame: 0,
    winRate: 0,
    cleanSheets: 0,
    cleanSheetRate: 0,
    bothTeamsScored: 0,
    bothTeamsScoredRate: 0,
    scored: 0,
    scoredRate: 0,
    conceded: 0,
    concededRate: 0,
    failedToScore: 0,
    failedToScoreRate: 0,
    over05: 0,
    over05Rate: 0,
    over15: 0,
    over15Rate: 0,
    over25: 0,
    over25Rate: 0,
    over35: 0,
    over35Rate: 0,
    averageGoalsFor: 0,
    averageGoalsAgainst: 0,
    averageTotalGoals: 0,
    shotStats: {
      shotsFor: 0,
      shotsAgainst: 0,
      shotsOnTargetFor: 0,
      shotsOnTargetAgainst: 0,
      cornersFor: 0,
      cornersAgainst: 0,
      foulsFor: 0,
      foulsAgainst: 0,
      yellowCards: 0,
      redCards: 0,
      saves: 0,
      expectedGoalsFor: 0,
      expectedGoalsAgainst: 0,
      possessionTotal: 0,
      possessionSamples: 0,
      averageShotsFor: 0,
      averageShotsAgainst: 0,
      averageShotsOnTargetFor: 0,
      averageShotsOnTargetAgainst: 0,
      averageCornersFor: 0,
      averageCornersAgainst: 0,
      averagePossession: 0,
      averageExpectedGoalsFor: 0,
      averageExpectedGoalsAgainst: 0
    },
    form: []
  };

  matches.forEach((match) => {
    const teamResult = resultForTeam(match, teamId);
    summary.played += 1;
    summary.goalsFor += teamResult.goalsFor;
    summary.goalsAgainst += teamResult.goalsAgainst;
    summary.form.push(teamResult.result);

    if (teamResult.result === "W") summary.wins += 1;
    if (teamResult.result === "D") summary.draws += 1;
    if (teamResult.result === "L") summary.losses += 1;
    if (teamResult.goalsAgainst === 0) summary.cleanSheets += 1;
    if (teamResult.goalsFor > 0) summary.scored += 1;
    if (teamResult.goalsAgainst > 0) summary.conceded += 1;
    if (teamResult.goalsFor === 0) summary.failedToScore += 1;
    if (teamResult.goalsFor > 0 && teamResult.goalsAgainst > 0) summary.bothTeamsScored += 1;
    if (teamResult.goalsFor + teamResult.goalsAgainst > 0.5) summary.over05 += 1;
    if (teamResult.goalsFor + teamResult.goalsAgainst > 1.5) summary.over15 += 1;
    if (teamResult.goalsFor + teamResult.goalsAgainst > 2.5) summary.over25 += 1;
    if (teamResult.goalsFor + teamResult.goalsAgainst > 3.5) summary.over35 += 1;

    summary.shotStats.shotsFor += numeric(match.team_total_shots);
    summary.shotStats.shotsAgainst += numeric(match.opponent_total_shots);
    summary.shotStats.shotsOnTargetFor += numeric(match.team_shots_on_goal);
    summary.shotStats.shotsOnTargetAgainst += numeric(match.opponent_shots_on_goal);
    summary.shotStats.cornersFor += numeric(match.team_corner_kicks);
    summary.shotStats.cornersAgainst += numeric(match.opponent_corner_kicks);
    summary.shotStats.foulsFor += numeric(match.team_fouls);
    summary.shotStats.foulsAgainst += numeric(match.opponent_fouls);
    summary.shotStats.yellowCards += numeric(match.team_yellow_cards);
    summary.shotStats.redCards += numeric(match.team_red_cards);
    summary.shotStats.saves += numeric(match.team_goalkeeper_saves);
    summary.shotStats.expectedGoalsFor += numeric(match.team_expected_goals);
    summary.shotStats.expectedGoalsAgainst += numeric(match.opponent_expected_goals);
    if (numeric(match.team_ball_possession) > 0) {
      summary.shotStats.possessionTotal += numeric(match.team_ball_possession);
      summary.shotStats.possessionSamples += 1;
    }
  });

  summary.points = summary.wins * 3 + summary.draws;
  summary.goalDifference = summary.goalsFor - summary.goalsAgainst;
  summary.pointsPerGame = summary.played > 0 ? round(summary.points / summary.played, 2) : 0;
  summary.winRate = percentage(summary.wins, summary.played);
  summary.cleanSheetRate = percentage(summary.cleanSheets, summary.played);
  summary.scoredRate = percentage(summary.scored, summary.played);
  summary.concededRate = percentage(summary.conceded, summary.played);
  summary.failedToScoreRate = percentage(summary.failedToScore, summary.played);
  summary.bothTeamsScoredRate = percentage(summary.bothTeamsScored, summary.played);
  summary.over05Rate = percentage(summary.over05, summary.played);
  summary.over15Rate = percentage(summary.over15, summary.played);
  summary.over25Rate = percentage(summary.over25, summary.played);
  summary.over35Rate = percentage(summary.over35, summary.played);
  summary.averageGoalsFor = summary.played > 0 ? round(summary.goalsFor / summary.played, 2) : 0;
  summary.averageGoalsAgainst = summary.played > 0 ? round(summary.goalsAgainst / summary.played, 2) : 0;
  summary.averageTotalGoals = summary.played > 0 ? round((summary.goalsFor + summary.goalsAgainst) / summary.played, 2) : 0;
  summary.shotStats.averageShotsFor = summary.played > 0 ? round(summary.shotStats.shotsFor / summary.played, 2) : 0;
  summary.shotStats.averageShotsAgainst = summary.played > 0 ? round(summary.shotStats.shotsAgainst / summary.played, 2) : 0;
  summary.shotStats.averageShotsOnTargetFor = summary.played > 0 ? round(summary.shotStats.shotsOnTargetFor / summary.played, 2) : 0;
  summary.shotStats.averageShotsOnTargetAgainst = summary.played > 0 ? round(summary.shotStats.shotsOnTargetAgainst / summary.played, 2) : 0;
  summary.shotStats.averageCornersFor = summary.played > 0 ? round(summary.shotStats.cornersFor / summary.played, 2) : 0;
  summary.shotStats.averageCornersAgainst = summary.played > 0 ? round(summary.shotStats.cornersAgainst / summary.played, 2) : 0;
  summary.shotStats.averageExpectedGoalsFor = summary.played > 0 ? round(summary.shotStats.expectedGoalsFor / summary.played, 2) : 0;
  summary.shotStats.averageExpectedGoalsAgainst = summary.played > 0 ? round(summary.shotStats.expectedGoalsAgainst / summary.played, 2) : 0;
  summary.shotStats.averagePossession = summary.shotStats.possessionSamples > 0
    ? round(summary.shotStats.possessionTotal / summary.shotStats.possessionSamples, 2)
    : 0;

  return summary;
}

function matchDto(match, teamId) {
  const teamResult = teamId ? resultForTeam(match, teamId) : null;
  return {
    id: Number(match.id),
    kickoffAt: match.kickoff_at,
    competition: match.competition_name || null,
    homeTeam: { id: Number(match.home_team_id), name: match.home_team_name || null },
    awayTeam: { id: Number(match.away_team_id), name: match.away_team_name || null },
    score: { home: numeric(match.home_goals), away: numeric(match.away_goals) },
    status: match.status_short || null,
    venue: teamResult ? teamResult.venue : undefined,
    result: teamResult ? teamResult.result : undefined,
    teamStats: teamId ? {
      shots: numeric(match.team_total_shots),
      shotsOnTarget: numeric(match.team_shots_on_goal),
      corners: numeric(match.team_corner_kicks),
      fouls: numeric(match.team_fouls),
      yellowCards: numeric(match.team_yellow_cards),
      redCards: numeric(match.team_red_cards),
      saves: numeric(match.team_goalkeeper_saves),
      possession: numeric(match.team_ball_possession),
      expectedGoals: numeric(match.team_expected_goals)
    } : undefined,
    opponentStats: teamId ? {
      shots: numeric(match.opponent_total_shots),
      shotsOnTarget: numeric(match.opponent_shots_on_goal),
      corners: numeric(match.opponent_corner_kicks),
      fouls: numeric(match.opponent_fouls),
      yellowCards: numeric(match.opponent_yellow_cards),
      redCards: numeric(match.opponent_red_cards),
      saves: numeric(match.opponent_goalkeeper_saves),
      possession: numeric(match.opponent_ball_possession),
      expectedGoals: numeric(match.opponent_expected_goals)
    } : undefined
  };
}

async function getTeamForm(filters) {
  const team = await repository.getTeamById(filters.teamId);
  const rows = await repository.getTeamCompletedMatches({ ...filters, limit: filters.last });
  const chronologicalRows = rows.slice().reverse();
  const summary = summarizeTeamMatches(chronologicalRows, filters.teamId);

  return {
    team: team ? { id: Number(team.id), name: team.name, logo: team.logo_path || null } : { id: filters.teamId },
    filters,
    matchesPlayed: summary.played,
    form: summary.form,
    currentStreak: currentStreak(summary.form),
    record: summary,
    goals: {
      for: summary.goalsFor,
      against: summary.goalsAgainst,
      difference: summary.goalDifference
    },
    rates: {
      win: summary.winRate,
      cleanSheet: summary.cleanSheetRate,
      scored: summary.scoredRate,
      conceded: summary.concededRate,
      failedToScore: summary.failedToScoreRate,
      bothTeamsScored: summary.bothTeamsScoredRate,
      over05: summary.over05Rate,
      over15: summary.over15Rate,
      over25: summary.over25Rate,
      over35: summary.over35Rate
    },
    matches: chronologicalRows.map((match) => matchDto(match, filters.teamId))
  };
}

async function getTeamSummary(filters) {
  const team = await repository.getTeamById(filters.teamId);
  const rows = await repository.getTeamCompletedMatches(filters);
  const chronologicalRows = rows.slice().reverse();
  const homeRows = chronologicalRows.filter((match) => Number(match.home_team_id) === filters.teamId);
  const awayRows = chronologicalRows.filter((match) => Number(match.away_team_id) === filters.teamId);

  return {
    team: team ? { id: Number(team.id), name: team.name, logo: team.logo_path || null } : { id: filters.teamId },
    filters,
    overall: summarizeTeamMatches(chronologicalRows, filters.teamId),
    home: summarizeTeamMatches(homeRows, filters.teamId),
    away: summarizeTeamMatches(awayRows, filters.teamId)
  };
}

async function getHeadToHead(filters) {
  const rows = await repository.getHeadToHeadMatches(filters);
  const chronologicalRows = rows.slice().reverse();
  const teamA = await repository.getTeamById(filters.teamAId);
  const teamB = await repository.getTeamById(filters.teamBId);
  const summaryA = summarizeTeamMatches(chronologicalRows, filters.teamAId);
  const summaryB = summarizeTeamMatches(chronologicalRows, filters.teamBId);
  const draws = chronologicalRows.filter((match) => numeric(match.home_goals) === numeric(match.away_goals)).length;

  return {
    filters,
    teams: {
      teamA: teamA ? { id: Number(teamA.id), name: teamA.name, logo: teamA.logo_path || null } : { id: filters.teamAId },
      teamB: teamB ? { id: Number(teamB.id), name: teamB.name, logo: teamB.logo_path || null } : { id: filters.teamBId }
    },
    played: chronologicalRows.length,
    record: {
      teamAWins: summaryA.wins,
      teamBWins: summaryB.wins,
      draws
    },
    goals: {
      teamA: summaryA.goalsFor,
      teamB: summaryB.goalsFor,
      total: summaryA.goalsFor + summaryA.goalsAgainst,
      averagePerMatch: chronologicalRows.length ? round((summaryA.goalsFor + summaryA.goalsAgainst) / chronologicalRows.length, 2) : 0
    },
    rates: {
      bothTeamsScored: summaryA.bothTeamsScoredRate,
      over25: summaryA.over25Rate
    },
    meetings: rows.map((match) => matchDto(match))
  };
}

function isGoalkeeperRow(row) {
  const position = String(row.position || "").toLowerCase();
  return position === "g" || position === "gk" || position.includes("goalkeeper") || numeric(row.goalkeeper_saves) > 0;
}

async function getPlayerSummary(filters) {
  const player = await repository.getPlayerById(filters.playerId);
  const rows = await repository.getPlayerMatchStatistics(filters);
  const totals = rows.reduce((acc, row) => {
    const minutes = numeric(row.minutes);
    acc.appearances += minutes > 0 ? 1 : 0;
    acc.starts += row.substitute === false ? 1 : 0;
    acc.minutes += minutes;
    acc.goals += numeric(row.goals_total);
    acc.assists += numeric(row.goals_assists);
    acc.shots += numeric(row.shots_total);
    acc.shotsOnTarget += numeric(row.shots_on);
    acc.yellowCards += numeric(row.cards_yellow) + numeric(row.cards_yellow_red);
    acc.redCards += numeric(row.cards_red) + numeric(row.cards_yellow_red);
    acc.saves += numeric(row.goalkeeper_saves);
    if (minutes > 0 && isGoalkeeperRow(row) && numeric(row.goals_conceded) === 0) {
      acc.cleanSheets += 1;
    }
    return acc;
  }, {
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    cleanSheets: 0
  });

  return {
    player: player ? { id: Number(player.id), name: player.name, photo: player.photo_path || null } : { id: filters.playerId },
    filters,
    totals,
    rates: {
      goalsPer90: per90(totals.goals, totals.minutes),
      assistsPer90: per90(totals.assists, totals.minutes),
      shotsPer90: per90(totals.shots, totals.minutes),
      shotAccuracy: percentage(totals.shotsOnTarget, totals.shots)
    }
  };
}

function computedCompetitionTable(matches) {
  const table = new Map();

  function ensureTeam(id, name) {
    const teamId = Number(id);
    if (!table.has(teamId)) {
      table.set(teamId, {
        teamId,
        teamName: name || null,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        pointsPerGame: 0,
        form: []
      });
    }
    return table.get(teamId);
  }

  matches.forEach((match) => {
    const home = ensureTeam(match.home_team_id, match.home_team_name);
    const away = ensureTeam(match.away_team_id, match.away_team_name);
    const homeGoals = numeric(match.home_goals);
    const awayGoals = numeric(match.away_goals);

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      home.wins += 1;
      home.points += 3;
      home.form.push("W");
      away.losses += 1;
      away.form.push("L");
    } else if (homeGoals < awayGoals) {
      away.wins += 1;
      away.points += 3;
      away.form.push("W");
      home.losses += 1;
      home.form.push("L");
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
      home.form.push("D");
      away.form.push("D");
    }
  });

  return Array.from(table.values())
    .map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
      pointsPerGame: row.played > 0 ? round(row.points / row.played, 2) : 0,
      form: row.form.slice(-5).join("")
    }))
    .sort((a, b) => (
      b.points - a.points
      || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      || String(a.teamName || "").localeCompare(String(b.teamName || ""))
    ))
    .map((row, index) => ({ rank: index + 1, ...row }));
}

async function getCompetitionTable(filters) {
  const standings = await repository.getCompetitionStandings(filters);
  if (standings.length) {
    return {
      filters,
      source: "standings",
      table: standings.map((row) => ({
        rank: numeric(row.rank),
        teamId: Number(row.team_id),
        teamName: row.team_name,
        teamLogo: row.team_logo || null,
        played: numeric(row.played),
        wins: numeric(row.wins),
        draws: numeric(row.draws),
        losses: numeric(row.losses),
        goalsFor: numeric(row.goals_for),
        goalsAgainst: numeric(row.goals_against),
        goalDifference: numeric(row.goal_difference),
        points: numeric(row.points),
        pointsPerGame: numeric(row.played) > 0 ? round(numeric(row.points) / numeric(row.played), 2) : 0,
        form: row.form || "",
        description: row.description || null,
        competitionSeasonId: Number(row.competition_season_id),
        seasonYear: row.season_year
      }))
    };
  }

  const matches = await repository.getCompetitionCompletedMatches(filters);
  return {
    filters,
    source: "matches",
    table: computedCompetitionTable(matches)
  };
}

module.exports = {
  getCompetitionTable,
  getHeadToHead,
  getPlayerSummary,
  getTeamForm,
  getTeamSummary,
  _helpers: {
    computedCompetitionTable,
    currentStreak,
    percentage,
    per90,
    resultForTeam,
    round,
    summarizeTeamMatches
  }
};
