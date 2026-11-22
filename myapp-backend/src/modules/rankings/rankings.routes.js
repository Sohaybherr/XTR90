const express = require("express");
const rankingsController = require("./rankings.controller");

const router = express.Router();

router.get("/", rankingsController.getRankings);

module.exports = router;
