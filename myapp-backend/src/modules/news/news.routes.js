const express = require("express");
const newsController = require("./news.controller");
const authenticate = require("../../middlewares/authenticate");
const authorize = require("../../middlewares/authorize");

const router = express.Router();

router.get("/", newsController.getAllNews);
router.post("/", authenticate, authorize("ADMIN"), newsController.createNews);
router.get("/latest", newsController.getLatestNews);
router.get("/:id", newsController.getNewsById);
router.put("/:id", authenticate, authorize("ADMIN"), newsController.updateNews);
router.delete("/:id", authenticate, authorize("ADMIN"), newsController.deleteNews);

module.exports = router;
