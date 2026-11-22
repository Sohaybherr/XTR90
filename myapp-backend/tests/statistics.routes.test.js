const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const repositoryPath = require.resolve("../src/modules/statistics/statistics.repository");
require.cache[repositoryPath] = {
  id: repositoryPath,
  filename: repositoryPath,
  loaded: true,
  exports: {
    getTeamById: async (teamId) => ({ id: teamId, name: "XTRA90 FC", logo_path: "/assets/xtra90.png" }),
    getTeamCompletedMatches: async () => [
      {
        id: 2,
        home_team_id: 1,
        away_team_id: 3,
        home_goals: 1,
        away_goals: 1,
        status_short: "FT",
        kickoff_at: "2026-07-20T20:00:00.000Z",
        competition_name: "League",
        home_team_name: "XTRA90 FC",
        away_team_name: "Away"
      },
      {
        id: 1,
        home_team_id: 2,
        away_team_id: 1,
        home_goals: 0,
        away_goals: 2,
        status_short: "FT",
        kickoff_at: "2026-07-10T20:00:00.000Z",
        competition_name: "League",
        home_team_name: "Home",
        away_team_name: "XTRA90 FC"
      }
    ]
  }
};

const app = require("../src/app");

function request(path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      http.get({ hostname: "127.0.0.1", port, path }, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          server.close(() => {
            resolve({ statusCode: response.statusCode, body: JSON.parse(body) });
          });
        });
      }).on("error", (error) => {
        server.close(() => reject(error));
      });
    });
  });
}

test("GET /api/statistics/teams/:teamId/form returns team form summary", async () => {
  const response = await request("/api/statistics/teams/1/form?last=2");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.team.name, "XTRA90 FC");
  assert.equal(response.body.matchesPlayed, 2);
  assert.deepEqual(response.body.form, ["W", "D"]);
  assert.equal(response.body.record.points, 4);
  assert.equal(response.body.goals.for, 3);
});
