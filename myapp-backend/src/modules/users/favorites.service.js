const favoritesModel = require("./favorites.model");

class FavoriteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "FavoriteError";
    this.statusCode = statusCode;
  }
}

function normalizeId(id) {
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function throwIfModelError(result) {
  if (result?.error) {
    throw new FavoriteError(result.error, result.statusCode);
  }
}

async function getFavoriteKeys(userId) {
  return favoritesModel.getFavoriteKeys(userId);
}

async function getFavorites(userId) {
  return favoritesModel.getFavorites(userId);
}

async function getFavoriteMatchesFeed(userId) {
  return favoritesModel.getFavoriteMatchesFeed(userId);
}

async function addFavorite(userId, type, entityId) {
  const id = normalizeId(entityId);

  if (!id) {
    throw new FavoriteError("Invalid favorite id", 400);
  }

  const result = await favoritesModel.addFavorite(userId, type, id);
  throwIfModelError(result);
  return result;
}

async function removeFavorite(userId, type, entityId) {
  const id = normalizeId(entityId);

  if (!id) {
    throw new FavoriteError("Invalid favorite id", 400);
  }

  const result = await favoritesModel.removeFavorite(userId, type, id);
  throwIfModelError(result);
  return result;
}

module.exports = {
  FavoriteError,
  getFavoriteKeys,
  getFavorites,
  getFavoriteMatchesFeed,
  addFavorite,
  removeFavorite
};
