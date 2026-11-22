const test = require("node:test");
const assert = require("node:assert/strict");

const { _helpers } = require("../src/modules/statistics/statistics.service");

test("statistics helpers protect against division by zero", () => {
  assert.equal(_helpers.percentage(3, 0), 0);
  assert.equal(_helpers.per90(5, 0), 0);
});

test("summarizeTeamMatches calculates form, record, rates, and goals", () => {
  const matches = [
    { home_team_id: 1, away_team_id: 2, home_goals: 2, away_goals: 0 },
    { home_team_id: 3, away_team_id: 1, home_goals: 1, away_goals: 1 },
    { home_team_id: 1, away_team_id: 4, home_goals: 0, away_goals: 3 }
  ];

  const summary = _helpers.summarizeTeamMatches(matches, 1);

  assert.equal(summary.played, 3);
  assert.equal(summary.wins, 1);
  assert.equal(summary.draws, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.goalsFor, 3);
  assert.equal(summary.goalsAgainst, 4);
  assert.equal(summary.goalDifference, -1);
  assert.equal(summary.points, 4);
  assert.equal(summary.pointsPerGame, 1.33);
  assert.deepEqual(summary.form, ["W", "D", "L"]);
  assert.equal(summary.cleanSheets, 1);
  assert.equal(summary.winRate, 33.33);
});

test("computedCompetitionTable sorts by points, goal difference, then goals for", () => {
  const table = _helpers.computedCompetitionTable([
    { home_team_id: 1, home_team_name: "A", away_team_id: 2, away_team_name: "B", home_goals: 2, away_goals: 0 },
    { home_team_id: 3, home_team_name: "C", away_team_id: 1, away_team_name: "A", home_goals: 1, away_goals: 1 },
    { home_team_id: 2, home_team_name: "B", away_team_id: 3, away_team_name: "C", home_goals: 4, away_goals: 1 }
  ]);

  assert.equal(table[0].teamId, 1);
  assert.equal(table[0].points, 4);
  assert.equal(table[1].teamId, 2);
  assert.equal(table[1].points, 3);
  assert.equal(table[1].goalDifference, 1);
});
