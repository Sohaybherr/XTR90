const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/config/db");
const { getFavorites, normalizeEntityType } = require("../src/modules/users/favorites.model");

test("normalizeEntityType accepts supported favorite entity types", () => {
  assert.equal(normalizeEntityType("competition"), "competition");
  assert.equal(normalizeEntityType("team"), "team");
  assert.equal(normalizeEntityType("player"), "player");
  assert.equal(normalizeEntityType("match"), "match");
  assert.equal(normalizeEntityType("news"), "news");
  assert.equal(normalizeEntityType(" TEAM "), "team");
});

test("normalizeEntityType rejects unsupported favorite entity types", () => {
  assert.equal(normalizeEntityType("coach"), null);
  assert.equal(normalizeEntityType(""), null);
  assert.equal(normalizeEntityType(null), null);
});

test("getFavorites returns a favorite player once when squad rows would duplicate it", async (t) => {
  const originalQuery = pool.query;
  const playerRows = [
    {
      id: 7,
      name: "Alex Example",
      firstname: "Alex",
      lastname: "Example",
      photo_path: "/players/7.png",
      nationality: "MA",
      position: "Forward",
      current_team_id: 10,
      squad_position: "Forward",
      favorited_at: "2026-07-23T10:00:00.000Z"
    },
    {
      id: 7,
      name: "Alex Example",
      firstname: "Alex",
      lastname: "Example",
      photo_path: "/players/7.png",
      nationality: "MA",
      position: "Forward",
      current_team_id: 11,
      squad_position: "Forward",
      favorited_at: "2026-07-23T10:00:00.000Z"
    }
  ];

  t.after(() => {
    pool.query = originalQuery;
  });

  pool.query = async (query) => {
    if (query.includes("JOIN players p")) {
      assert.match(query, /LEFT JOIN LATERAL/);
      return { rows: playerRows };
    }

    return { rows: [] };
  };

  const favorites = await getFavorites(1);

  assert.equal(favorites.players.length, 1);
  assert.equal(favorites.players[0].id, 7);
  assert.equal(favorites.players[0].currentTeamId, 10);
});
