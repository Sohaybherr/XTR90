const { toAssetPath } = require("../../utils/assets");

function toUserDto(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    avatar: toAssetPath(user.avatar_path || user.profile_picture),
    role: user.role,
    status: user.status,
    preferredLanguage: user.preferred_language || "en",
    showOdds: user.show_odds !== false,
    authAccounts: Array.isArray(user.auth_accounts) ? user.auth_accounts : [],
    emailVerified: Boolean(user.email_verified_at),
    createdAt: user.created_at
  };
}

module.exports = {
  toUserDto
};
