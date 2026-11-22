const test = require("node:test");
const assert = require("node:assert/strict");

const { teamDto } = require("../src/modules/teams/teams.model");

test("teamDto exposes final team shape with local logo path", () => {
  const dto = teamDto({
    id: 1,
    api_id: 33,
    name: "Manchester United",
    code: "MUN",
    country_id: 10,
    country_name: "England",
    country_code: "GB",
    founded: 1878,
    is_national: false,
    logo_path: "/assets/teams/team_33.png",
  });

  assert.equal(dto.apiId, 33);
  assert.equal(dto.logo, "/assets/teams/team_33.png");
  assert.equal(dto.national, false);
  assert.deepEqual(dto.country, { id: 10, name: "England", code: "GB", flag: undefined });
});
