const matchesModel = require("./matches.model");
const { emitMatchUpdate } = require("../../realtime/socket");
const { execFile } = require("child_process");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function getAllMatches(req, res) {
  try {
    const matches = await matchesModel.getAllMatches();
    res.json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getMatchById(req, res) {
  const { id } = req.params;

  try {
    const match = await matchesModel.getMatchById(id);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    res.json(match);
  } catch (error) {
    console.error("Error fetching match:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getMatchesByCompetitionAndSeason(req, res) {
  const { competitionId, seasonId } = req.params;

  try {
    const matches = await matchesModel.getMatchesByCompetitionAndSeason(competitionId, seasonId);
    res.json(matches);
  } catch (error) {
    console.error("Error fetching matches by competition and season:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getMatchesByTeamAndSeasonAndCompetition(req, res) {
  const { teamId, seasonId, competitionId } = req.params;

  try {
    const matches = await matchesModel.getMatchesByTeamAndSeasonAndCompetition(
      teamId,
      seasonId,
      competitionId
    );
    res.json(matches);
  } catch (error) {
    console.error("Error fetching matches by team, season, and competition:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getMatchesByDateRangeAndCompetition(req, res) {
  const { competitionId } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }

  try {
    const matches = await matchesModel.getMatchesByDateRangeAndCompetition(
      startDate,
      endDate,
      competitionId
    );
    res.json(matches);
  } catch (error) {
    console.error("Error fetching matches by date range and competition:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getMatchDetails(req, res) {
  const { id } = req.params;

  try {
    const details = await matchesModel.getFullMatchDetails(id);

    if (!details) {
      return res.status(404).json({ error: "Match not found" });
    }

    res.json(details);
  } catch (error) {
    console.error("Error fetching match details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function syncMatchDetails(req, res) {
  const { id } = req.params;
  const backendRoot = path.resolve(__dirname, "../../..");
  const scriptPath = path.join(backendRoot, "scripts", "sync_match_details.py");
  const pythonCommand = process.env.PYTHON || "python";

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonCommand,
      [scriptPath, String(id), "--ignore-budget"],
      {
        cwd: backendRoot,
        env: { ...process.env, API_FOOTBALL_IGNORE_BUDGET: "1" },
        timeout: 240000,
        maxBuffer: 1024 * 1024,
      }
    );

    const details = await matchesModel.getFullMatchDetails(id);

    if (!details) {
      return res.status(404).json({ error: "Match not found" });
    }

    res.json({
      sync: {
        ok: true,
        output: stdout ? stdout.trim().split(/\r?\n/).slice(-1)[0] : "",
        warnings: stderr ? stderr.trim() : "",
      },
      details,
    });
  } catch (error) {
    console.error("Error syncing match details:", error);
    res.status(500).json({
      error: "Unable to sync match details.",
      detail: error.stderr || error.message,
    });
  }
}

async function getLiveMatches(req, res) {
  try {
    const matches = await matchesModel.getLiveMatches();
    res.json(matches);
  } catch (error) {
    console.error("Error fetching live matches:", error);
    res.status(500).json({ error: "Unable to load live matches." });
  }
}

async function getMatchEvents(req, res) {
  const { id } = req.params;

  try {
    const events = await matchesModel.getMatchEventsDto(id);
    res.json(events);
  } catch (error) {
    console.error("Error fetching match events:", error);
    res.status(500).json({ error: "Unable to load match events." });
  }
}

async function getMatchStatistics(req, res) {
  const { id } = req.params;

  try {
    const statistics = await matchesModel.getMatchTeamStatisticsDto(id);
    res.json(statistics);
  } catch (error) {
    console.error("Error fetching match statistics:", error);
    res.status(500).json({ error: "Unable to load match statistics." });
  }
}

async function getMatchLineups(req, res) {
  const { id } = req.params;

  try {
    const lineups = await matchesModel.getMatchLineupsDto(id);
    if (!lineups) {
      return res.status(404).json({ error: "Match not found" });
    }
    res.json(lineups);
  } catch (error) {
    console.error("Error fetching match lineups:", error);
    res.status(500).json({ error: "Unable to load match lineups." });
  }
}

async function getMatchPlayerStatistics(req, res) {
  const { id } = req.params;

  try {
    const statistics = await matchesModel.getMatchPlayerStatisticsDto(id);
    if (!statistics) {
      return res.status(404).json({ error: "Match not found" });
    }
    res.json(statistics);
  } catch (error) {
    console.error("Error fetching match player statistics:", error);
    res.status(500).json({ error: "Unable to load match player statistics." });
  }
}

async function publishLiveEvent(req, res) {
  const expectedToken = process.env.LIVE_EVENT_TOKEN;
  if (expectedToken && req.get("x-live-event-token") !== expectedToken) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { event, matchId, payload } = req.body || {};
  if (!event || !matchId || !payload) {
    return res.status(400).json({ error: "event, matchId and payload are required" });
  }

  emitMatchUpdate(event, matchId, payload);
  res.status(202).json({ ok: true });
}

module.exports = {
  getAllMatches,
  getMatchById,
  getMatchesByCompetitionAndSeason,
  getMatchesByTeamAndSeasonAndCompetition,
  getMatchesByDateRangeAndCompetition,
  getMatchDetails,
  syncMatchDetails,
  getLiveMatches,
  getMatchEvents,
  getMatchStatistics,
  getMatchLineups,
  getMatchPlayerStatistics,
  publishLiveEvent
};
