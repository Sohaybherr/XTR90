const usersModel = require("../users/users.model");

const VALID_ROLES = new Set(["USER", "EDITOR", "ADMIN"]);
const VALID_STATUSES = new Set(["ACTIVE", "SUSPENDED", "DELETED"]);

class AdminError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AdminError";
    this.statusCode = statusCode;
  }
}

async function listUsers() {
  return usersModel.getAllUsersForAdmin();
}

async function updateUserRole(actorId, targetUserId, role) {
  if (!VALID_ROLES.has(role)) {
    throw new AdminError("Invalid role", 400);
  }

  const user = await usersModel.updateUserRole(targetUserId, role);

  if (!user) {
    throw new AdminError("User not found", 404);
  }

  return user;
}

async function updateUserStatus(actorId, targetUserId, status) {
  if (!VALID_STATUSES.has(status)) {
    throw new AdminError("Invalid status", 400);
  }

  if (String(actorId) === String(targetUserId) && status !== "ACTIVE") {
    throw new AdminError("Admins cannot disable their own account", 400);
  }

  const user = await usersModel.updateUserStatus(targetUserId, status);

  if (!user) {
    throw new AdminError("User not found", 404);
  }

  return user;
}

async function deleteUser(actorId, targetUserId) {
  if (String(actorId) === String(targetUserId)) {
    throw new AdminError("Admins cannot delete their own account", 400);
  }

  const user = await usersModel.softDeleteUser(targetUserId);

  if (!user) {
    throw new AdminError("User not found", 404);
  }

  return user;
}

module.exports = {
  AdminError,
  listUsers,
  updateUserRole,
  updateUserStatus,
  deleteUser
};
