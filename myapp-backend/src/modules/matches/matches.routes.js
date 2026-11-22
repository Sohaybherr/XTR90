const express = require("express");
const matchesController = require("./matches.controller");
const authenticate = require("../../middlewares/authenticate");
const authorize = require("../../middlewares/authorize");

const router = express.Router();

router.get("/", matchesController.getAllMatches);
router.get("/live", matchesController.getLiveMatches);
router.post("/internal/live-events", matchesController.publishLiveEvent);
router.get("/competition/:competitionId/season/:seasonId", matchesController.getMatchesByCompetitionAndSeason);
router.get("/competition/:competitionId/date-range", matchesController.getMatchesByDateRangeAndCompetition);
router.get(
  "/team/:teamId/season/:seasonId/competition/:competitionId",
  matchesController.getMatchesByTeamAndSeasonAndCompetition
);
router.get("/:id/details", matchesController.getMatchDetails);
router.post("/:id/sync-details", authenticate, authorize("ADMIN"), matchesController.syncMatchDetails);
router.get("/:id/events", matchesController.getMatchEvents);
router.get("/:id/statistics", matchesController.getMatchStatistics);
router.get("/:id/lineups", matchesController.getMatchLineups);
router.get("/:id/player-statistics", matchesController.getMatchPlayerStatistics);
router.get("/:id", matchesController.getMatchById);

module.exports = router;
