function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateUsername(username) {
  return typeof username === "string" && /^[a-zA-Z0-9_]{3,30}$/.test(username.trim());
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function validateName(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length <= 80);
}

function validateAvatar(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length <= 255);
}

function validateLanguage(value) {
  return value === undefined || value === null || ["en", "fr", "ar", "de", "es"].includes(String(value).trim().toLowerCase());
}

function validateUpdateProfilePayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Request body must be an object"];
  }

  if (body.first_name !== undefined && !validateName(body.first_name)) {
    errors.push("first_name must be a string with at most 80 characters");
  }

  if (body.firstName !== undefined && !validateName(body.firstName)) {
    errors.push("firstName must be a string with at most 80 characters");
  }

  if (body.last_name !== undefined && !validateName(body.last_name)) {
    errors.push("last_name must be a string with at most 80 characters");
  }

  if (body.lastName !== undefined && !validateName(body.lastName)) {
    errors.push("lastName must be a string with at most 80 characters");
  }

  if (body.avatar !== undefined && !validateAvatar(body.avatar)) {
    errors.push("avatar must be a string with at most 255 characters");
  }

  if (body.avatar_path !== undefined && !validateAvatar(body.avatar_path)) {
    errors.push("avatar_path must be a string with at most 255 characters");
  }

  if (body.profilePicture !== undefined && !validateAvatar(body.profilePicture)) {
    errors.push("profilePicture must be a string with at most 255 characters");
  }

  if (body.preferredLanguage !== undefined && !validateLanguage(body.preferredLanguage)) {
    errors.push("preferredLanguage must be one of en, fr, ar, de, es");
  }

  if (body.preferred_language !== undefined && !validateLanguage(body.preferred_language)) {
    errors.push("preferred_language must be one of en, fr, ar, de, es");
  }

  if (body.showOdds !== undefined && typeof body.showOdds !== "boolean") {
    errors.push("showOdds must be a boolean");
  }

  if (body.show_odds !== undefined && typeof body.show_odds !== "boolean") {
    errors.push("show_odds must be a boolean");
  }

  return errors;
}

function validateChangePasswordPayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Request body must be an object"];
  }

  if (!body.currentPassword && !body.current_password) {
    errors.push("current password is required");
  }

  const newPassword = body.newPassword || body.new_password;
  const confirmPassword = body.confirmPassword || body.confirm_password;

  if (!validatePassword(newPassword)) {
    errors.push("new password must be at least 8 characters");
  }

  if (newPassword !== confirmPassword) {
    errors.push("confirm password must match new password");
  }

  return errors;
}

module.exports = {
  validateEmail,
  validateUsername,
  validatePassword,
  validateUpdateProfilePayload,
  validateChangePasswordPayload
};
