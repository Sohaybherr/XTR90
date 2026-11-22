const pool = require("../../config/db");

const publicUserFields = `
  id,
  username,
  email,
  first_name,
  last_name,
  avatar_path,
  role,
  status,
  preferred_language,
  show_odds,
  email_verified_at,
  last_login_at,
  created_at,
  updated_at,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'provider', uaa.provider,
      'providerEmail', uaa.provider_email,
      'emailVerified', uaa.provider_email_verified,
      'linkedAt', uaa.created_at
    ) ORDER BY uaa.provider), '[]'::json)
    FROM user_auth_accounts uaa
    WHERE uaa.user_id = users.id
  ) AS auth_accounts
`;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function getAllUsers() {
  const result = await pool.query(`SELECT ${publicUserFields} FROM users`);
  return result.rows;
}

async function getAllUsersForAdmin() {
  const result = await pool.query(`
    SELECT ${publicUserFields}
    FROM users
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows;
}

async function getUserById(id) {
  const result = await pool.query(`SELECT ${publicUserFields} FROM users WHERE id = $1`, [id]);
  return result.rows[0];
}

async function getUserByUsername(username) {
  const result = await pool.query(`SELECT ${publicUserFields} FROM users WHERE username = $1`, [username]);
  return result.rows[0];
}

async function getUserByEmail(email) {
  const result = await pool.query(`SELECT ${publicUserFields} FROM users WHERE email = $1`, [normalizeEmail(email)]);
  return result.rows[0];
}

async function getUserByEmailWithPassword(email) {
  const result = await pool.query(
    `SELECT ${publicUserFields}, password_hash FROM users WHERE email = $1`,
    [normalizeEmail(email)]
  );
  return result.rows[0];
}

async function getUserByIdWithPassword(id) {
  const result = await pool.query(
    `SELECT ${publicUserFields}, password_hash FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function createUser(user) {
  const { username, email, passwordHash, firstName, lastName, profilePicture, avatar } = user;
  const query = `
    INSERT INTO users (username, email, password_hash, first_name, last_name, avatar_path, role, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'USER', 'ACTIVE')
    RETURNING ${publicUserFields}
  `;
  const result = await pool.query(query, [
    String(username || "").trim(),
    normalizeEmail(email),
    passwordHash,
    firstName || null,
    lastName || null,
    avatar || profilePicture || null
  ]);
  return result.rows[0];
}

async function updateUser(id, user) {
  const { username, email, passwordHash, firstName, lastName, profilePicture, avatar } = user;
  const query = `
    UPDATE users
    SET
      username = COALESCE($1, username),
      email = COALESCE($2, email),
      password_hash = COALESCE($3, password_hash),
      first_name = COALESCE($4, first_name),
      last_name = COALESCE($5, last_name),
      avatar_path = COALESCE($6, avatar_path),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7
    RETURNING ${publicUserFields}
  `;
  const result = await pool.query(query, [
    username,
    email ? normalizeEmail(email) : null,
    passwordHash,
    firstName,
    lastName,
    avatar || profilePicture,
    id
  ]);
  return result.rows[0];
}

async function updateCurrentUserProfile(id, user) {
  const { firstName, lastName, avatar, preferredLanguage, showOdds } = user;
  const result = await pool.query(
    `
      UPDATE users
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          avatar_path = COALESCE($3, avatar_path),
          preferred_language = COALESCE($4, preferred_language),
          show_odds = COALESCE($5, show_odds),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING ${publicUserFields}
    `,
    [firstName, lastName, avatar, preferredLanguage, showOdds, id]
  );
  return result.rows[0];
}

async function updatePasswordHash(id, passwordHash) {
  const result = await pool.query(
    `
      UPDATE users
      SET password_hash = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING ${publicUserFields}
    `,
    [passwordHash, id]
  );
  return result.rows[0];
}

async function updateUserRole(id, role) {
  const result = await pool.query(
    `
      UPDATE users
      SET role = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING ${publicUserFields}
    `,
    [role, id]
  );
  return result.rows[0];
}

async function updateUserStatus(id, status) {
  const result = await pool.query(
    `
      UPDATE users
      SET status = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING ${publicUserFields}
    `,
    [status, id]
  );
  return result.rows[0];
}

async function softDeleteUser(id) {
  return updateUserStatus(id, "DELETED");
}

async function deleteUser(id) {
  const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING ${publicUserFields}`, [id]);
  return result.rows[0];
}

module.exports = {
  getAllUsers,
  getAllUsersForAdmin,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  getUserByEmailWithPassword,
  getUserByIdWithPassword,
  createUser,
  updateUser,
  updateCurrentUserProfile,
  updatePasswordHash,
  updateUserRole,
  updateUserStatus,
  softDeleteUser,
  deleteUser
};
