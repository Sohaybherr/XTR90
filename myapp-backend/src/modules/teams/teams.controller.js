const teamsModel = require("./teams.model");
async function getAllTeams(req, res) {
  try {
    const teams = await teamsModel.getAllTeams();
    res.json(teams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamById(req, res) {
  const { id } = req.params;

  try {
    const team = await teamsModel.getTeamById(id);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.json(team);
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamByApiId(req, res) {
  const { apiId } = req.params;

  try {
    const team = await teamsModel.getTeamByApiId(apiId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.json(team);
  } catch (error) {
    console.error("Error fetching team by api id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamsByCountry(req, res) {
  const { countryId } = req.params;

  try {
    const teams = await teamsModel.getTeamsByCountry(countryId);
    res.json(teams);
  } catch (error) {
    console.error("Error fetching teams by country:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamsByName(req, res) {
  const { name } = req.params;

  try {
    const teams = await teamsModel.getTeamsByName(name);
    res.json(teams);
  } catch (error) {
    console.error("Error fetching teams by name:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamsByCompetitionAndSeason(req, res) {
  const { competitionId, seasonId } = req.params;

  try {
    const teams = await teamsModel.getTeamsByCompetitionAndSeason(competitionId, seasonId);
    res.json(teams);
  } catch (error) {
    console.error("Error fetching teams by competition and season:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCompetitionsByTeamAndSeason(req, res) {
  const { teamId, seasonId } = req.params;

  try {
    const competitions = await teamsModel.getCompetitionsByTeamAndSeason(teamId, seasonId);
    res.json(competitions);
  } catch (error) {
    console.error("Error fetching competitions by team and season:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamDetails(req, res) {
  const { id } = req.params;

  try {
    const details = await teamsModel.getFullTeamDetails(id);

    if (!details) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.json(details);
  } catch (error) {
    console.error("Error fetching team details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getTeamCompetitionDetails(req, res) {
  const { teamId, competitionSeasonId } = req.params;

  try {
    const details = await teamsModel.getTeamCompetitionDetails(teamId, competitionSeasonId);

    if (!details) {
      return res.status(404).json({ error: "Team competition season not found" });
    }

    res.json(details);
  } catch (error) {
    console.error("Error fetching team competition details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getAllTeams,
  getTeamById,
  getTeamByApiId,
  getTeamsByCountry,
  getTeamsByName,
  getTeamsByCompetitionAndSeason,
  getCompetitionsByTeamAndSeason,
  getTeamDetails,
  getTeamCompetitionDetails
};
