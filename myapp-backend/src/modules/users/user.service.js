const bcrypt = require("bcrypt");
const usersModel = require("./users.model");
const authService = require("../auth/auth.service");

const PASSWORD_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

class UserError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "UserError";
    this.statusCode = statusCode;
  }
}

async function getCurrentProfile(userId) {
  const user = await usersModel.getUserById(userId);

  if (!user || user.status !== "ACTIVE") {
    throw new UserError("Authentication required", 401);
  }

  return user;
}

async function updateCurrentProfile(userId, payload) {
  const user = await usersModel.updateCurrentUserProfile(userId, {
    firstName: payload.firstName || payload.first_name,
    lastName: payload.lastName || payload.last_name,
    avatar: payload.avatar || payload.avatar_path || payload.profilePicture,
    preferredLanguage: payload.preferredLanguage || payload.preferred_language,
    showOdds: payload.showOdds ?? payload.show_odds
  });

  if (!user) {
    throw new UserError("User not found", 404);
  }

  return user;
}

async function changeCurrentPassword(userId, payload) {
  const currentPassword = payload.currentPassword || payload.current_password;
  const newPassword = payload.newPassword || payload.new_password;
  const user = await usersModel.getUserByIdWithPassword(userId);

  if (!user || user.status !== "ACTIVE") {
    throw new UserError("Authentication required", 401);
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash || "");

  if (!passwordMatches) {
    throw new UserError("Current password is incorrect", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
  await usersModel.updatePasswordHash(userId, passwordHash);
}

async function unlinkCurrentProvider(userId, provider) {
  await authService.unlinkProvider(userId, provider);
}

module.exports = {
  UserError,
  getCurrentProfile,
  updateCurrentProfile,
  changeCurrentPassword,
  unlinkCurrentProvider
};
