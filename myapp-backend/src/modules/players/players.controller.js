const playersModel = require("./players.model");
const teamsModel = require("../teams/teams.model");
const matchesModel = require("../matches/matches.model");
const transfermarktService = require("../../services/transfermarkt.service");
const { toAssetPath } = require("../../utils/assets");

const transfermarktPlayerResources = [
  ["profile", "profile"],
  ["marketValue", "market_value"],
  ["transfers", "transfers"],
  ["injuries", "injuries"],
  ["achievements", "achievements"],
  ["stats", "stats"],
  ["jerseyNumbers", "jersey_numbers"]
];

function matchDateValue(match) {
  return match.kickoff_at || match.match_date;
}

async function getAllPlayers(req, res) {
  try {
    const players = await playersModel.getAllPlayers();
    res.json(players.map(playersModel.playerDto));
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayerById(req, res) {
  const { id } = req.params;

  try {
    const player = await playersModel.getPlayerById(id);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json(playersModel.playerDto(player));
  } catch (error) {
    console.error("Error fetching player:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayerByApiId(req, res) {
  const { apiId } = req.params;

  try {
    const player = await playersModel.getPlayerByApiId(apiId);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json(playersModel.playerDto(player));
  } catch (error) {
    console.error("Error fetching player by api id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayersByCountry(req, res) {
  const { countryId } = req.params;

  try {
    const players = await playersModel.getPlayersByCountry(countryId);
    res.json(players.map(playersModel.playerDto));
  } catch (error) {
    console.error("Error fetching players by country:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayersByTeam(req, res) {
  const { teamId } = req.params;

  try {
    const players = await playersModel.getPlayersByTeam(teamId);
    res.json(players.map(playersModel.playerDto));
  } catch (error) {
    console.error("Error fetching players by team:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayersByPosition(req, res) {
  const { position } = req.params;

  try {
    const players = await playersModel.getPlayersByPosition(position);
    res.json(players.map(playersModel.playerDto));
  } catch (error) {
    console.error("Error fetching players by position:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayersByName(req, res) {
  const { name } = req.params;

  try {
    const players = await playersModel.getPlayersByName(name);
    res.json(players.map(playersModel.playerDto));
  } catch (error) {
    console.error("Error fetching players by name:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPlayerDetails(req, res) {
  const { id } = req.params;

  try {
    const player = await playersModel.getPlayerById(id);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const [currentTeamRaw, statistics, teamSeasons, transferHistory, matches] = await Promise.all([
      player.current_team_id ? teamsModel.getTeamById(player.current_team_id) : playersModel.getPlayerCurrentTeam(player.id),
      playersModel.getPlayerSeasonStatistics(player.id),
      playersModel.getPlayerTeamSeasons(player.id),
      playersModel.getPlayerTransfers(player.id),
      matchesModel.getAllMatches()
    ]);
    const currentTeam = teamsModel.teamDto(currentTeamRaw);

    const today = new Date();
    const currentTeamId = currentTeam?.id || player.current_team_id;
    const nextMatch = currentTeamId
      ? matches
          .filter((match) =>
            String(match.home_team_id) === String(currentTeamId) ||
            String(match.away_team_id) === String(currentTeamId)
          )
          .sort((a, b) => new Date(matchDateValue(a) || 0) - new Date(matchDateValue(b) || 0))
          .find((match) => matchDateValue(match) && new Date(matchDateValue(match)) >= today) || null
      : null;

    res.json({
      player: playersModel.playerDto(player),
      currentTeam,
      country: player.nationality ? { name: player.nationality } : null,
      statistics: statistics.map((row) => ({
        id: row.id,
        season: row.season_year,
        team: { id: row.team_id, name: row.team_name, logo: toAssetPath(row.team_logo) },
        competition: { id: row.competition_season_id, name: row.competition_name, logo: toAssetPath(row.competition_logo) },
        appearances: row.appearances,
        lineups: row.lineups,
        minutes: row.minutes,
        rating: row.rating,
        goals: row.goals_total,
        assists: row.goals_assists,
        shots: { total: row.shots_total, on: row.shots_on },
        passes: { total: row.passes_total, key: row.passes_key, accuracy: row.passes_accuracy },
        tackles: { total: row.tackles_total, blocks: row.tackles_blocks, interceptions: row.tackles_interceptions },
        duels: { total: row.duels_total, won: row.duels_won },
        dribbles: { attempts: row.dribbles_attempts, success: row.dribbles_success },
        cards: { yellow: row.cards_yellow, red: row.cards_red },
        penalties: { scored: row.penalties_scored, missed: row.penalties_missed, saved: row.penalties_saved }
      })),
      teamSeasons: teamSeasons.map((row) => ({
        id: row.id,
        season: row.season,
        team: { id: row.team_id, name: row.team_name, logo: toAssetPath(row.team_logo) },
        position: row.position,
        shirtNumber: row.shirt_number,
        joinedAt: row.joined_at,
        leftAt: row.left_at,
        current: row.is_current
      })),
      transferHistory,
      nextMatch
    });
  } catch (error) {
    console.error("Error fetching player details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function resolveTransfermarktPlayer(player) {
  if (player.transfermarkt_id) {
    return {
      id: player.transfermarkt_id,
      url: player.transfermarkt_url,
      source: "stored"
    };
  }

  const match = await transfermarktService.searchPlayer(player);
  if (!match?.id) return null;

  await playersModel.setPlayerTransfermarktMatch(player.id, match);
  return {
    id: match.id,
    url: match.url || null,
    name: match.name,
    position: match.position,
    club: match.club,
    source: "search"
  };
}

async function getCachedOrFetchTransfermarktMatch(player, match, resource, fetcher) {
  if (!match?.id) {
    return {
      match: null,
      payload: null,
      cache: null
    };
  }

  const cached = await playersModel.getTransfermarktCache("player", match.id, resource);
  if (cached) {
    return {
      match,
      payload: cached.payload,
      cache: {
        hit: true,
        fetchedAt: cached.fetched_at,
        expiresAt: cached.expires_at
      }
    };
  }

  let payload;
  try {
    payload = await fetcher(match.id);
  } catch (error) {
    const stale = await playersModel.getTransfermarktCacheAny("player", match.id, resource);
    if (stale) {
      return {
        match,
        payload: stale.payload,
        cache: {
          hit: true,
          stale: true,
          fetchedAt: stale.fetched_at,
          expiresAt: stale.expires_at,
          error: error.message
        }
      };
    }
    throw error;
  }

  const saved = await playersModel.saveTransfermarktCache({
    entityType: "player",
    entityId: player.id,
    transfermarktId: match.id,
    resource,
    payload,
    ttlDays: transfermarktService.ttlDays()
  });

  return {
    match,
    payload: saved.payload,
    cache: {
      hit: false,
      fetchedAt: saved.fetched_at,
      expiresAt: saved.expires_at
    }
  };
}

async function getCachedOrFetchTransfermarkt(player, resource, fetcher) {
  const match = await resolveTransfermarktPlayer(player);
  return getCachedOrFetchTransfermarktMatch(player, match, resource, fetcher);
}

function getTransfermarktFetcher(resource) {
  if (resource === "market_value") return transfermarktService.getPlayerMarketValue;
  if (resource === "transfers") return transfermarktService.getPlayerTransfers;
  return (transfermarktId) => transfermarktService.getPlayerResource(transfermarktId, resource);
}

async function getPlayerTransfermarkt(req, res) {
  const { id } = req.params;

  try {
    const player = await playersModel.getPlayerById(id);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const match = await resolveTransfermarktPlayer(player);

    if (!match?.id) {
      return res.status(404).json({ error: "No Transfermarkt match found for this player." });
    }

    player.transfermarkt_id = match.id;
    player.transfermarkt_url = match.url;

    const resourceResults = await Promise.allSettled(
      transfermarktPlayerResources.map(([responseKey, resource]) =>
        getCachedOrFetchTransfermarktMatch(player, match, resource, getTransfermarktFetcher(resource))
          .then((result) => [responseKey, result])
      )
    );

    const resources = {};
    const resourceErrors = {};
    resourceResults.forEach((settled, index) => {
      const [responseKey] = transfermarktPlayerResources[index];
      if (settled.status === "fulfilled") {
        resources[responseKey] = settled.value[1];
      } else {
        resources[responseKey] = {
          payload: null,
          cache: null
        };
        resourceErrors[responseKey] = settled.reason?.message || "Could not load resource.";
      }
    });

    res.json({
      transfermarkt: match,
      profile: resources.profile?.payload || null,
      marketValue: resources.marketValue?.payload || null,
      transfers: resources.transfers?.payload || null,
      injuries: resources.injuries?.payload || null,
      achievements: resources.achievements?.payload || null,
      stats: resources.stats?.payload || null,
      jerseyNumbers: resources.jerseyNumbers?.payload || null,
      cache: {
        profile: resources.profile?.cache || null,
        marketValue: resources.marketValue?.cache || null,
        transfers: resources.transfers?.cache || null,
        injuries: resources.injuries?.cache || null,
        achievements: resources.achievements?.cache || null,
        stats: resources.stats?.cache || null,
        jerseyNumbers: resources.jerseyNumbers?.cache || null
      },
      errors: Object.keys(resourceErrors).length ? resourceErrors : undefined
    });
  } catch (error) {
    console.error("Error fetching Transfermarkt player data:", error);
    res.status(502).json({ error: "Could not load Transfermarkt data." });
  }
}

async function getPlayerTransfermarktMarketValue(req, res) {
  const { id } = req.params;

  try {
    const player = await playersModel.getPlayerById(id);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const result = await getCachedOrFetchTransfermarkt(player, "market_value", transfermarktService.getPlayerMarketValue);

    if (!result.match) {
      return res.status(404).json({ error: "No Transfermarkt match found for this player." });
    }

    res.json({
      transfermarkt: result.match,
      marketValue: result.payload,
      cache: result.cache
    });
  } catch (error) {
    console.error("Error fetching Transfermarkt market value:", error);
    res.status(502).json({ error: "Could not load Transfermarkt market value." });
  }
}

async function getPlayerTransfermarktTransfers(req, res) {
  const { id } = req.params;

  try {
    const player = await playersModel.getPlayerById(id);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const result = await getCachedOrFetchTransfermarkt(player, "transfers", transfermarktService.getPlayerTransfers);

    if (!result.match) {
      return res.status(404).json({ error: "No Transfermarkt match found for this player." });
    }

    res.json({
      transfermarkt: result.match,
      transfers: result.payload,
      cache: result.cache
    });
  } catch (error) {
    console.error("Error fetching Transfermarkt transfers:", error);
    res.status(502).json({ error: "Could not load Transfermarkt transfers." });
  }
}

module.exports = {
  getAllPlayers,
  getPlayerById,
  getPlayerByApiId,
  getPlayersByCountry,
  getPlayersByTeam,
  getPlayersByPosition,
  getPlayersByName,
  getPlayerDetails,
  getPlayerTransfermarkt,
  getPlayerTransfermarktMarketValue,
  getPlayerTransfermarktTransfers
};
