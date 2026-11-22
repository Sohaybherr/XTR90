const teamsModel = require("../teams/teams.model");
const competitionsModel = require("../competitions/competitions.model");
const pool = require("../../config/db");
const { marketValueDto } = require("../../utils/marketValue");

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactSearch(value) {
  return normalizeSearch(value).replace(/\s+/g, "");
}

function teamSearchScore(team, query) {
  const name = normalizeSearch(team.name);
  const shortName = normalizeSearch(team.short_name);
  const code = normalizeSearch(team.code);
  const compactName = compactSearch(team.name);
  const compactQuery = compactSearch(query);

  if (name === query) return 0;
  if (shortName === query || code === query) return 1;
  if (name.startsWith(query)) return 2;
  if (compactName.startsWith(compactQuery)) return 3;
  if (name.includes(query)) return 4;
  if (compactName.includes(compactQuery)) return 5;
  return 99;
}

function genericSearchScore(value, query) {
  const name = normalizeSearch(value);
  const compactName = compactSearch(value);
  const compactQuery = compactSearch(query);

  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (compactName.startsWith(compactQuery)) return 2;
  if (name.includes(query)) return 3;
  if (compactName.includes(compactQuery)) return 4;
  return 99;
}

function rankClubResults(teams, query) {
  const normalizedQuery = normalizeSearch(query);

  return teams
    .filter((team) => !team.is_national && !team.national)
    .map((team) => ({ team, score: teamSearchScore(team, normalizedQuery) }))
    .filter((entry) => entry.score < 99)
    .sort((a, b) =>
      Number(b.team.marketValue || 0) - Number(a.team.marketValue || 0) ||
      a.score - b.score ||
      String(a.team.name).localeCompare(String(b.team.name))
    )
    .slice(0, 10)
    .map((entry) => entry.team);
}

function isCompletePlayerNameMatch(player, query) {
  const compactQuery = compactSearch(query);
  const names = [
    player.name,
    `${player.firstname || ""} ${player.lastname || ""}`,
    `${player.lastname || ""} ${player.firstname || ""}`,
  ];

  return names.some((name) => compactSearch(name) === compactQuery);
}

async function getWorldCupPlayersByName(query) {
  const result = await pool.query(
    `
      WITH player_values AS (
        SELECT
          transfermarkt_id,
          MAX((payload->>'marketValue')::numeric) AS market_value
        FROM transfermarkt_cache
        WHERE entity_type = 'player'
          AND resource = 'market_value'
          AND payload ? 'marketValue'
        GROUP BY transfermarkt_id
      )
      SELECT DISTINCT
        p.*,
        tsp.team_id AS current_team_id,
        tsp.shirt_number,
        tsp.position AS squad_position,
        COALESCE(pv.market_value, 0) AS market_value
      FROM players p
      JOIN team_squad_players tsp ON tsp.player_id = p.id
      JOIN team_competition_seasons tcs ON tcs.team_id = tsp.team_id
      JOIN competition_seasons cs ON cs.id = tcs.competition_season_id
      JOIN competitions c ON c.id = cs.competition_id
      LEFT JOIN player_values pv ON pv.transfermarkt_id = p.transfermarkt_id
      WHERE c.api_id::text = '1'
        AND cs.season_year = 2026
        AND p.name ILIKE $1
      ORDER BY COALESCE(pv.market_value, 0) DESC, p.name
      LIMIT 50
    `,
    [`%${query}%`]
  );

  return result.rows;
}

async function getExactPlayersByName(query) {
  const result = await pool.query(
    `
      WITH player_values AS (
        SELECT
          transfermarkt_id,
          MAX((payload->>'marketValue')::numeric) AS market_value
        FROM transfermarkt_cache
        WHERE entity_type = 'player'
          AND resource = 'market_value'
          AND payload ? 'marketValue'
        GROUP BY transfermarkt_id
      )
      SELECT
        p.*,
        tsp.team_id AS current_team_id,
        tsp.shirt_number,
        tsp.position AS squad_position,
        COALESCE(pv.market_value, 0) AS market_value
      FROM players p
      LEFT JOIN team_squad_players tsp
        ON tsp.player_id = p.id AND tsp.is_current = TRUE
      LEFT JOIN player_values pv ON pv.transfermarkt_id = p.transfermarkt_id
      WHERE p.name ILIKE $1
         OR trim(coalesce(p.firstname, '') || ' ' || coalesce(p.lastname, '')) ILIKE $1
      ORDER BY COALESCE(pv.market_value, 0) DESC, p.name
      LIMIT 50
    `,
    [`%${query}%`]
  );

  return result.rows.filter((player) => isCompletePlayerNameMatch(player, query));
}

function uniquePlayers(players) {
  const seen = new Set();

  return players.filter((player) => {
    const key = String(player.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function enrichPlayers(players) {
  return uniquePlayers(players)
    .map((player) => ({
      ...player,
      ...marketValueDto(player.market_value, "player"),
    }))
    .sort((a, b) =>
      Number(b.marketValue || 0) - Number(a.marketValue || 0) ||
      String(a.name).localeCompare(String(b.name))
    )
    .slice(0, 10);
}

async function getTeamMarketValues(teamIds) {
  if (!teamIds.length) return new Map();

  const result = await pool.query(
    `
      SELECT
        tsp.team_id,
        COALESCE(SUM((tc.payload->>'marketValue')::numeric), 0) AS market_value,
        COUNT(*) FILTER (WHERE (tc.payload->>'marketValue')::numeric > 0) AS valued_players
      FROM team_squad_players tsp
      JOIN players p ON p.id = tsp.player_id
      JOIN transfermarkt_cache tc
        ON tc.transfermarkt_id = p.transfermarkt_id
       AND tc.entity_type = 'player'
       AND tc.resource = 'market_value'
       AND tc.payload ? 'marketValue'
      WHERE tsp.is_current = TRUE
        AND tsp.team_id = ANY($1::bigint[])
      GROUP BY tsp.team_id
    `,
    [teamIds]
  );

  return new Map(result.rows.map((row) => [
    String(row.team_id),
    {
      marketValue: Number(row.market_value || 0),
      valuedPlayers: Number(row.valued_players || 0),
    },
  ]));
}

async function enrichTeams(teams) {
  const valueByTeam = await getTeamMarketValues(teams.map((team) => team.id));

  return teams.map((team) => {
    const value = valueByTeam.get(String(team.id)) || { marketValue: 0, valuedPlayers: 0 };

    return {
      ...team,
      ...marketValueDto(value.marketValue, "team"),
      valuedPlayers: value.valuedPlayers,
      valueBasis: "current_squad_sum",
    };
  });
}

async function getCompetitionMarketValues(competitionIds) {
  if (!competitionIds.length) return new Map();

  const result = await pool.query(
    `
      WITH selected_seasons AS (
        SELECT DISTINCT ON (cs.competition_id)
          cs.id,
          cs.competition_id
        FROM competition_seasons cs
        WHERE cs.competition_id = ANY($1::bigint[])
        ORDER BY cs.competition_id, cs.current DESC NULLS LAST, cs.season_year DESC NULLS LAST, cs.id DESC
      ),
      competition_players AS (
        SELECT DISTINCT
          ss.competition_id,
          tsp.player_id
        FROM selected_seasons ss
        JOIN team_competition_seasons tcs
          ON tcs.competition_season_id = ss.id
         AND COALESCE(tcs.is_active, TRUE) = TRUE
        JOIN team_squad_players tsp
          ON tsp.team_id = tcs.team_id
         AND tsp.is_current = TRUE
      )
      SELECT
        cp.competition_id,
        COALESCE(SUM((tc.payload->>'marketValue')::numeric), 0) AS market_value,
        COUNT(*) FILTER (WHERE (tc.payload->>'marketValue')::numeric > 0) AS valued_players
      FROM competition_players cp
      JOIN players p ON p.id = cp.player_id
      JOIN transfermarkt_cache tc
        ON tc.transfermarkt_id = p.transfermarkt_id
       AND tc.entity_type = 'player'
       AND tc.resource = 'market_value'
       AND tc.payload ? 'marketValue'
      GROUP BY cp.competition_id
    `,
    [competitionIds]
  );

  return new Map(result.rows.map((row) => [
    String(row.competition_id),
    {
      marketValue: Number(row.market_value || 0),
      valuedPlayers: Number(row.valued_players || 0),
    },
  ]));
}

async function rankCompetitions(competitions, query) {
  const normalizedQuery = normalizeSearch(query);
  const filtered = competitions
    .map((competition) => ({
      competition,
      score: genericSearchScore(competition.name, normalizedQuery),
    }))
    .filter((entry) => entry.score < 99);
  const valueByCompetition = await getCompetitionMarketValues(filtered.map((entry) => entry.competition.id));

  return filtered
    .map((entry) => {
      const value = valueByCompetition.get(String(entry.competition.id)) || { marketValue: 0, valuedPlayers: 0 };

      return {
        ...entry,
        competition: {
          ...entry.competition,
          ...marketValueDto(value.marketValue, "competition"),
          valuedPlayers: value.valuedPlayers,
          valueBasis: "active_competition_squad_sum",
        },
      };
    })
    .sort((a, b) =>
      a.score - b.score ||
      Number(b.competition.marketValue || 0) - Number(a.competition.marketValue || 0) ||
      String(a.competition.name).localeCompare(String(b.competition.name))
    )
    .slice(0, 10)
    .map((entry) => entry.competition);
}

async function search(req, res) {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "q is required" });
  }

  try {
    const [teams, worldCupPlayers, exactPlayers, competitions] = await Promise.all([
      teamsModel.getTeamsByName(q),
      getWorldCupPlayersByName(q),
      getExactPlayersByName(q),
      competitionsModel.getAllCompetitions()
    ]);

    const enrichedTeams = await enrichTeams(teams);

    res.json({
      teams: rankClubResults(enrichedTeams, q),
      players: enrichPlayers([...worldCupPlayers, ...exactPlayers]),
      competitions: await rankCompetitions(competitions, q)
    });
  } catch (error) {
    console.error("Error searching:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  search
};
