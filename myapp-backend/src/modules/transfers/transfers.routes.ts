const express = require("express");
const transfersController = require("./transfers.controller.ts");

const router = express.Router();

/**
 * OpenAPI paths for installations that scan route comments:
 *
 * GET /api/transfers/latest
 * GET /api/transfers/team/{teamId}
 * GET /api/transfers/player/{playerId}
 * GET /api/transfers/search
 * GET /api/transfers/window
 * GET /api/transfers/summary
 * POST /api/transfers/sync
 */
router.get("/latest", transfersController.getLatestTransfers);
router.get("/team/:teamId", transfersController.getTeamTransfers);
router.get("/player/:playerId", transfersController.getPlayerTransferHistory);
router.get("/search", transfersController.searchTransfers);
router.get("/window", transfersController.getTransferWindow);
router.get("/summary", transfersController.getTransferSummary);
router.post("/sync", transfersController.syncTransfers);

module.exports = router;
