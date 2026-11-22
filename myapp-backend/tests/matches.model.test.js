const test = require("node:test");
const assert = require("node:assert/strict");

const { buildFullMatchDetails } = require("../src/modules/matches/matches.model");

test("buildFullMatchDetails groups match details into frontend DTO", () => {
  const dto = buildFullMatchDetails({
    base: {
      match: {
        id: 1,
        api_id: 100,
        competition_id: 5,
        home_team_id: 10,
        away_team_id: 20,
        round: "Round 1",
        kickoff_at: "2026-07-11T20:00:00.000Z",
        status_short: "FT",
        elapsed: 90,
        home_goals: 2,
        away_goals: 1,
        halftime_home: 1,
        halftime_away: 0,
        has_events: true,
        has_lineups: true,
        has_team_statistics: true,
        has_player_statistics: true
      },
      competition: { id: 5, api_id: 39, name: "Premier League", type: "League", logo: "/logo.png" },
      home_team: { id: 10, api_id: 1, name: "Home", logo: "/home.png" },
      away_team: { id: 20, api_id: 2, name: "Away", logo: "/away.png" },
      venue: { id: 3, api_id: 4, name: "Stadium", city: "City" },
      competition_season_id: 9,
      season_year: 2026
    },
    events: [{ id: 1, team_id: 10, team_name: "Home", elapsed: 12, event_type: "Goal", event_detail: "Normal Goal" }],
    statistics: [{ match_id: 1, team_id: 10, ball_possession: "56.00", total_shots: 10 }],
    lineups: [{ id: 7, team_id: 10, formation: "4-3-3", confirmed: true }],
    lineupPlayers: [{ id: 8, lineup_id: 7, team_id: 10, lineup_type: "STARTING_XI", player_name_snapshot: "Player", grid: "2:1", grid_row: 2, grid_column: 1 }],
    playerStatistics: [{ id: 9, team_id: 10, player_name: "Player", rating: "7.2", substitute: false }],
    odds: [
      { id: 1, scope: "prematch", bookmaker_api_id: 1, bookmaker_name: "A", bet_api_id: 1, bet_name: "Match Winner", value_name: "Home", odd: "1.80", previous_odd: "1.70" },
      { id: 2, scope: "prematch", bookmaker_api_id: 2, bookmaker_name: "B", bet_api_id: 1, bet_name: "Match Winner", value_name: "Home", odd: "1.90", previous_odd: "2.00" }
    ],
    preMatchStats: { home: { played: 5 }, away: { played: 4 }, headToHead: { played: 2 } }
  });

  assert.equal(dto.match.id, 1);
  assert.equal(dto.score.home, 2);
  assert.equal(dto.teams.home.name, "Home");
  assert.equal(dto.events.length, 1);
  assert.equal(dto.statistics.home.totalShots, 10);
  assert.equal(dto.lineups.home.startingXI[0].gridRow, 2);
  assert.equal(dto.playerStatistics.home[0].rating, "7.2");
  assert.equal(dto.preMatchStats.home.played, 5);
  assert.equal(dto.odds.best.prematch.values.home.odd, 1.9);
  assert.equal(dto.odds.best.prematch.values.home.bookmaker.name, "B");
  assert.equal(dto.odds.best.prematch.values.home.movement, "down");
});
