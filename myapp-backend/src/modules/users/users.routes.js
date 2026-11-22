const express = require("express");
const usersController = require("./users.controller");
const favoritesController = require("./favorites.controller");
const authenticate = require("../../middlewares/authenticate");
const { validate } = require("../auth/auth.validation");
const { validateChangePasswordPayload, validateUpdateProfilePayload } = require("./user.validation");
const { passport, isProviderConfigured } = require("../auth/passport");

const router = express.Router();

function requireConfiguredProvider(provider) {
  return (req, res, next) => {
    if (!isProviderConfigured(provider)) {
      return res.status(503).json({ error: `${provider} authentication is not configured` });
    }

    next();
  };
}

function prepareProviderLink(provider) {
  return (req, res, next) => {
    req.session.linkProvider = provider;
    req.session.linkProviderUserId = req.user.id;
    next();
  };
}

function setProvider(provider) {
  return (req, res, next) => {
    req.params.provider = provider;
    next();
  };
}

router.get("/me", authenticate, usersController.getCurrentUser);
router.patch("/me", authenticate, validate(validateUpdateProfilePayload), usersController.updateCurrentUser);
router.patch("/me/password", authenticate, validate(validateChangePasswordPayload), usersController.changeCurrentUserPassword);
router.get("/me/favorites/keys", authenticate, favoritesController.getFavoriteKeys);
router.get("/me/favorites/matches-feed", authenticate, favoritesController.getFavoriteMatchesFeed);
router.get("/me/favorites", authenticate, favoritesController.getFavorites);
router.post("/me/favorites/:type/:id", authenticate, favoritesController.addFavorite);
router.delete("/me/favorites/:type/:id", authenticate, favoritesController.removeFavorite);
router.post(
  "/me/auth-accounts/google/link",
  authenticate,
  requireConfiguredProvider("google"),
  prepareProviderLink("google"),
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: true,
    session: false
  })
);
router.delete("/me/auth-accounts/google", authenticate, setProvider("google"), usersController.unlinkCurrentUserProvider);
router.post(
  "/me/auth-accounts/facebook/link",
  authenticate,
  requireConfiguredProvider("facebook"),
  prepareProviderLink("facebook"),
  passport.authenticate("facebook", {
    state: true,
    session: false
  })
);
router.delete("/me/auth-accounts/facebook", authenticate, setProvider("facebook"), usersController.unlinkCurrentUserProvider);
router.get("/profile", authenticate, usersController.getCurrentUser);
router.get("/", usersController.getAllUsers);
router.post("/", usersController.createUser);
router.post("/login", usersController.loginUser);
router.get("/username/:username", usersController.getUserByUsername);
router.get("/email/:email", usersController.getUserByEmail);
router.get("/:id/profile", usersController.getUserProfile);
router.get("/:id", usersController.getUserById);
router.put("/:id", usersController.updateUser);
router.delete("/:id", usersController.deleteUser);

module.exports = router;
