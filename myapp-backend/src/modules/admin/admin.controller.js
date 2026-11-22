const adminService = require("./admin.service");
const { toUserDto } = require("../users/user.dto");

function sendAdminError(error, res) {
  if (error instanceof adminService.AdminError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error("Admin error:", error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function listUsers(req, res) {
  try {
    const users = await adminService.listUsers();
    res.json({ users: users.map(toUserDto) });
  } catch (error) {
    sendAdminError(error, res);
  }
}

async function updateUserRole(req, res) {
  try {
    const user = await adminService.updateUserRole(req.user.id, req.params.id, req.body.role);
    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendAdminError(error, res);
  }
}

async function updateUserStatus(req, res) {
  try {
    const user = await adminService.updateUserStatus(req.user.id, req.params.id, req.body.status);
    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendAdminError(error, res);
  }
}

async function deleteUser(req, res) {
  try {
    const user = await adminService.deleteUser(req.user.id, req.params.id);
    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendAdminError(error, res);
  }
}

module.exports = {
  listUsers,
  updateUserRole,
  updateUserStatus,
  deleteUser
};
