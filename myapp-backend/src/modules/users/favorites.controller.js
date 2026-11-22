const favoritesService = require("./favorites.service");

function sendFavoriteError(error, res) {
  if (error instanceof favoritesService.FavoriteError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error("Favorites error:", error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function getFavoriteKeys(req, res) {
  try {
    const favorites = await favoritesService.getFavoriteKeys(req.user.id);
    res.json({ favorites });
  } catch (error) {
    sendFavoriteError(error, res);
  }
}

async function getFavorites(req, res) {
  try {
    const favorites = await favoritesService.getFavorites(req.user.id);
    res.json({ favorites });
  } catch (error) {
    sendFavoriteError(error, res);
  }
}

async function getFavoriteMatchesFeed(req, res) {
  try {
    const countries = await favoritesService.getFavoriteMatchesFeed(req.user.id);
    res.json(countries);
  } catch (error) {
    sendFavoriteError(error, res);
  }
}

async function addFavorite(req, res) {
  try {
    const favorite = await favoritesService.addFavorite(req.user.id, req.params.type, req.params.id);
    res.status(201).json({ favorite });
  } catch (error) {
    sendFavoriteError(error, res);
  }
}

async function removeFavorite(req, res) {
  try {
    const favorite = await favoritesService.removeFavorite(req.user.id, req.params.type, req.params.id);
    res.json({ favorite });
  } catch (error) {
    sendFavoriteError(error, res);
  }
}

module.exports = {
  getFavoriteKeys,
  getFavorites,
  getFavoriteMatchesFeed,
  addFavorite,
  removeFavorite
};
