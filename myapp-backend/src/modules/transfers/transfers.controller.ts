const service = require("./transfers.service.ts");
const validators = require("./transfers.validators.ts");

function handleError(res, error, label) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details });
  }

  console.error(label, error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function getLatestTransfers(req, res) {
  try {
    const input = validators.latest(req.query);
    const result = await service.getLatestTransfers(input);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching latest transfers:");
  }
}

async function getTeamTransfers(req, res) {
  try {
    const input = validators.team(req.params);
    const result = await service.getTeamTransfers(input);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching team transfers:");
  }
}

async function getPlayerTransferHistory(req, res) {
  try {
    const input = validators.player(req.params);
    const result = await service.getPlayerTransferHistory(input);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching player transfer history:");
  }
}

async function searchTransfers(req, res) {
  try {
    const input = validators.search(req.query);
    const result = await service.searchTransfers(input);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error searching transfers:");
  }
}

async function getTransferWindow(req, res) {
  try {
    const result = await service.getTransferWindow();
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching transfer window:");
  }
}

async function getTransferSummary(req, res) {
  try {
    const input = validators.summary(req.query);
    const result = await service.getTransferSummary(input);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error fetching transfer summary:");
  }
}

async function syncTransfers(req, res) {
  try {
    const input = validators.sync(req.query);
    const result = await service.syncTransfers(input);
    res.json(result);
  } catch (error) {
    handleError(res, error, "Error synchronizing transfers:");
  }
}

module.exports = {
  getLatestTransfers,
  getPlayerTransferHistory,
  getTeamTransfers,
  getTransferSummary,
  getTransferWindow,
  searchTransfers,
  syncTransfers
};
