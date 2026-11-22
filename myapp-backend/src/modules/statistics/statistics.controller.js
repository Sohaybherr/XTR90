const statisticsService = require("./statistics.service");
const validators = require("./statistics.validators");

function handleError(res, error, label) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details });
  }

  console.error(label, error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function getTeamForm(req, res) {
  try {
    const filters = validators.teamForm(req.params, req.query);
    const result = await statisticsService.getTeamForm(filters);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching team form:");
  }
}

async function getTeamSummary(req, res) {
  try {
    const filters = validators.teamSummary(req.params, req.query);
    const result = await statisticsService.getTeamSummary(filters);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching team summary:");
  }
}

async function getHeadToHead(req, res) {
  try {
    const filters = validators.headToHead(req.query);
    const result = await statisticsService.getHeadToHead(filters);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching head-to-head statistics:");
  }
}

async function getPlayerSummary(req, res) {
  try {
    const filters = validators.playerSummary(req.params, req.query);
    const result = await statisticsService.getPlayerSummary(filters);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching player summary:");
  }
}

async function getCompetitionTable(req, res) {
  try {
    const filters = validators.competitionTable(req.params, req.query);
    const result = await statisticsService.getCompetitionTable(filters);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching competition table:");
  }
}

module.exports = {
  getCompetitionTable,
  getHeadToHead,
  getPlayerSummary,
  getTeamForm,
  getTeamSummary
};
