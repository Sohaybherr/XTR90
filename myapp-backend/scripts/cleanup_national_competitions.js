require("dotenv").config({ quiet: true });

const pool = require("../src/config/db");

const KEEP_NAME_PATTERN = [
  "africa cup of nations",
  "afcon",
  "copa america",
  "euro championship",
  "european championship",
  "nations league",
  "world cup",
];

const REMOVE_NAME_PATTERN = [
  "african nations championship",
  "asian cup",
  "gold cup",
  "championship",
  "confederations cup",
  "qualification",
  "qualifiers",
  "qualifying",
  "u17",
  "u18",
  "u19",
  "u20",
  "u21",
  "u22",
  "u23",
  "u-17",
  "u-18",
  "u-19",
  "u-20",
  "u-21",
  "u-22",
  "u-23",
  "under 17",
  "under 18",
  "under 19",
  "under 20",
  "under 21",
  "under 22",
  "under 23",
  "women",
  "women's",
  "womens",
  "youth",
  "olympic",
  "olympics",
];

function patternSql(patterns) {
  return patterns.map((item) => `%${item}%`);
}

async function main() {
  const dryRun = !process.argv.includes("--execute");
  const keepPatterns = patternSql(KEEP_NAME_PATTERN);
  const removePatterns = patternSql(REMOVE_NAME_PATTERN);

  const targetSql = `
    WITH candidates AS (
      SELECT c.id, c.api_id, c.name
      FROM competitions c
      LEFT JOIN countries co ON co.id = c.country_id
      WHERE c.type ILIKE 'Cup'
        AND (
          co.id IS NULL
          OR LOWER(COALESCE(co.name, '')) IN ('world', 'international')
          OR LOWER(c.name) LIKE ANY($1::text[])
          OR LOWER(c.name) LIKE ANY($2::text[])
        )
    )
    SELECT c.id, c.api_id, c.name, COUNT(m.id)::int AS matches
    FROM candidates c
    LEFT JOIN matches m ON m.competition_id = c.id
    WHERE LOWER(c.name) NOT LIKE ALL($1::text[])
      AND LOWER(c.name) LIKE ANY($2::text[])
    GROUP BY c.id, c.api_id, c.name
    ORDER BY c.name
  `;

  const targets = await pool.query(targetSql, [keepPatterns, removePatterns]);
  console.log(`Mode: ${dryRun ? "dry-run" : "execute"}`);
  console.log(`Competitions to remove: ${targets.rowCount}`);
  targets.rows.forEach((row) => {
    console.log(`${row.id}\t${row.api_id}\t${row.matches}\t${row.name}`);
  });

  if (dryRun || targets.rowCount === 0) {
    return;
  }

  const ids = targets.rows.map((row) => row.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM match_odds WHERE match_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM match_player_statistics WHERE match_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM match_lineup_players WHERE match_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM match_lineups WHERE match_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM match_team_statistics WHERE match_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM user_favorites WHERE entity_type = 'match' AND entity_id IN (SELECT id FROM matches WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM matches WHERE competition_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM standings WHERE competition_season_id IN (SELECT id FROM competition_seasons WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM team_competition_seasons WHERE competition_season_id IN (SELECT id FROM competition_seasons WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM team_goal_statistics WHERE team_season_statistics_id IN (SELECT id FROM team_season_statistics WHERE competition_season_id IN (SELECT id FROM competition_seasons WHERE competition_id = ANY($1::int[])))", [ids]);
    await client.query("DELETE FROM team_lineup_statistics WHERE team_season_statistics_id IN (SELECT id FROM team_season_statistics WHERE competition_season_id IN (SELECT id FROM competition_seasons WHERE competition_id = ANY($1::int[])))", [ids]);
    await client.query("DELETE FROM team_season_statistics WHERE competition_season_id IN (SELECT id FROM competition_seasons WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM player_season_statistics WHERE competition_season_id IN (SELECT id FROM competition_seasons WHERE competition_id = ANY($1::int[]))", [ids]);
    await client.query("DELETE FROM competition_seasons WHERE competition_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM team_competitions WHERE competition_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM user_favorites WHERE entity_type = 'competition' AND entity_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM competitions WHERE id = ANY($1::int[])", [ids]);
    await client.query("COMMIT");
    console.log("Deleted unwanted national competitions.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
