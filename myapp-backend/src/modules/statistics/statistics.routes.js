const express = require("express");
const statisticsController = require("./statistics.controller");

const router = express.Router();

router.get("/teams/:teamId/form", statisticsController.getTeamForm);
router.get("/teams/:teamId/summary", statisticsController.getTeamSummary);
router.get("/head-to-head", statisticsController.getHeadToHead);
router.get("/players/:playerId/summary", statisticsController.getPlayerSummary);
router.get("/competitions/:competitionId/table", statisticsController.getCompetitionTable);

module.exports = router;
