const bcrypt = require("bcrypt");
const usersModel = require("./users.model");
const userService = require("./user.service");
const { toUserDto } = require("./user.dto");

const PASSWORD_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

function handleUniqueViolation(error, res) {
  if (error.code !== "23505") {
    return false;
  }

  if (error.constraint && error.constraint.includes("username")) {
    res.status(409).json({ error: "Username already exists" });
    return true;
  }

  if (error.constraint && error.constraint.includes("email")) {
    res.status(409).json({ error: "Email already exists" });
    return true;
  }

  res.status(409).json({ error: "User already exists" });
  return true;
}

async function getAllUsers(req, res) {
  try {
    const users = await usersModel.getAllUsers();
    res.json(users.map(toUserDto));
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getUserById(req, res) {
  const { id } = req.params;

  try {
    const user = await usersModel.getUserById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(toUserDto(user));
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getUserByUsername(req, res) {
  const { username } = req.params;

  try {
    const user = await usersModel.getUserByUsername(username);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(toUserDto(user));
  } catch (error) {
    console.error("Error fetching user by username:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getUserByEmail(req, res) {
  const { email } = req.params;

  try {
    const user = await usersModel.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(toUserDto(user));
  } catch (error) {
    console.error("Error fetching user by email:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function createUser(req, res) {
  const { username, email, password, firstName, first_name, lastName, last_name, profilePicture, avatar } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email, and password are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await usersModel.createUser({
      username,
      email,
      passwordHash,
      firstName: firstName || first_name,
      lastName: lastName || last_name,
      profilePicture,
      avatar
    });
    res.status(201).json(toUserDto(user));
  } catch (error) {
    if (handleUniqueViolation(error, res)) {
      return;
    }

    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function loginUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const user = await usersModel.getUserByEmailWithPassword(email);

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash || "");

    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    delete user.password_hash;
    res.json(toUserDto(user));
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { username, email, password, firstName, first_name, lastName, last_name, profilePicture, avatar } = req.body;

  try {
    const passwordHash = password ? await bcrypt.hash(password, PASSWORD_SALT_ROUNDS) : null;
    const user = await usersModel.updateUser(id, {
      username,
      email,
      passwordHash,
      firstName: firstName || first_name,
      lastName: lastName || last_name,
      profilePicture,
      avatar
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(toUserDto(user));
  } catch (error) {
    if (handleUniqueViolation(error, res)) {
      return;
    }

    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function deleteUser(req, res) {
  const { id } = req.params;

  try {
    const user = await usersModel.deleteUser(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(toUserDto(user));
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getUserProfile(req, res) {
  const { id } = req.params;

  try {
    const profile = await usersModel.getUserById(id);

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      profile: toUserDto(profile),
      favoriteTeams: [],
      favoritePlayers: [],
      favoriteCompetitions: []
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

function sendUserServiceError(error, res) {
  if (error instanceof userService.UserError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error("User service error:", error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function getCurrentUser(req, res) {
  try {
    const user = await userService.getCurrentProfile(req.user.id);
    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendUserServiceError(error, res);
  }
}

async function updateCurrentUser(req, res) {
  try {
    const user = await userService.updateCurrentProfile(req.user.id, req.body);
    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendUserServiceError(error, res);
  }
}

async function changeCurrentUserPassword(req, res) {
  try {
    await userService.changeCurrentPassword(req.user.id, req.body);
    res.status(204).send();
  } catch (error) {
    sendUserServiceError(error, res);
  }
}

async function unlinkCurrentUserProvider(req, res) {
  try {
    await userService.unlinkCurrentProvider(req.user.id, req.params.provider);
    res.status(204).send();
  } catch (error) {
    sendUserServiceError(error, res);
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  createUser,
  loginUser,
  updateUser,
  deleteUser,
  getUserProfile,
  getCurrentUser,
  updateCurrentUser,
  changeCurrentUserPassword,
  unlinkCurrentUserProvider
};
