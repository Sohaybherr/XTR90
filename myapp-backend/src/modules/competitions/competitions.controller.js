const competitionsModel = require("./competitions.model");
const matchesModel = require("../matches/matches.model");
const teamsModel = require("../teams/teams.model");

async function getAllCompetitions(req, res) {
  try {
    const competitions = await competitionsModel.getAllCompetitions();
    res.json(competitions);
  } catch (error) {
    console.error("Error fetching competitions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCompetitionById(req, res) {
  const { id } = req.params;

  try {
    const competition = await competitionsModel.getCompetitionById(id);

    if (!competition) {
      return res.status(404).json({ error: "Competition not found" });
    }

    res.json(competition);
  } catch (error) {
    console.error("Error fetching competition:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCompetitionsByCountry(req, res) {
  const { country } = req.params;

  try {
    const competitions = await competitionsModel.getCompetitionByCountry(country);
    res.json(competitions);
  } catch (error) {
    console.error("Error fetching competitions by country:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCompetitionType(req, res) {
  const { id } = req.params;

  try {
    const competition = await competitionsModel.getCompetitionType(id);

    if (!competition) {
      return res.status(404).json({ error: "Competition not found" });
    }

    res.json(competition);
  } catch (error) {
    console.error("Error fetching competition type:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCompetitionDetails(req, res) {
  const { id, seasonId: seasonIdParam } = req.params;
  const seasonIdQuery = req.query.seasonId;

  try {
    const competition = await competitionsModel.getCompetitionById(id);

    if (!competition) {
      return res.status(404).json({ error: "Competition not found" });
    }

    const seasons = await competitionsModel.getCompetitionSeasons(id);
    const selectedSeasonId = seasonIdParam || seasonIdQuery || seasons.find((season) => season.is_current)?.id || seasons[0]?.id || null;
    const selectedSeason = seasons.find((season) => (
      String(season.id) === String(selectedSeasonId) ||
      String(season.season_year) === String(selectedSeasonId) ||
      String(season.name) === String(selectedSeasonId)
    )) || null;
    const selectedSeasonYear = Number(selectedSeason?.season_year || selectedSeason?.name || selectedSeasonId);
    const excludeQualificationRounds = Number(competition.api_id) === 2 && selectedSeasonYear >= 2024;
    const [teams, fixtures, standings, stats] = selectedSeasonId
      ? await Promise.all([
          teamsModel.getTeamsByCompetitionAndSeason(id, selectedSeasonId),
          matchesModel.getMatchesByCompetitionAndSeason(id, selectedSeasonId),
          competitionsModel.getCompetitionStandings(id, selectedSeasonId),
          competitionsModel.getCompetitionStats(id, selectedSeasonId, { excludeQualificationRounds })
        ])
      : [[], [], [], { players: {}, teams: {} }];

    res.json({
      competition,
      seasons,
      currentSeason: selectedSeason,
      currentSeasonId: selectedSeason?.id || selectedSeasonId,
      standings,
      teams,
      fixtures,
      stats,
      topScorers: stats.players?.goals || []
    });
  } catch (error) {
    console.error("Error fetching competition details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getAllCompetitions,
  getCompetitionById,
  getCompetitionsByCountry,
  getCompetitionType,
  getCompetitionDetails
};
