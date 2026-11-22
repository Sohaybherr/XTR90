const pool = require("../../config/db");

const userFields = `
  id,
  email,
  username,
  password_hash,
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

async function findById(id) {
  const result = await pool.query(`SELECT ${userFields} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function findActiveById(id) {
  const result = await pool.query(`SELECT ${userFields} FROM users WHERE id = $1 AND status = 'ACTIVE'`, [id]);
  return result.rows[0] || null;
}

async function findByEmail(email) {
  const result = await pool.query(`SELECT ${userFields} FROM users WHERE email = $1`, [normalizeEmail(email)]);
  return result.rows[0] || null;
}

async function findByUsername(username) {
  const result = await pool.query(`SELECT ${userFields} FROM users WHERE username = $1`, [String(username || "").trim()]);
  return result.rows[0] || null;
}

async function createUser(user) {
  const query = `
    INSERT INTO users (
      email,
      username,
      password,
      password_hash,
      first_name,
      last_name,
      avatar_path,
      role,
      status
    )
    VALUES ($1, $2, $3, $3, $4, $5, $6, 'USER', 'ACTIVE')
    RETURNING ${userFields}
  `;
  const result = await pool.query(query, [
    normalizeEmail(user.email),
    String(user.username || "").trim(),
    user.passwordHash,
    user.firstName || user.first_name || null,
    user.lastName || user.last_name || null,
    user.avatar || user.avatar_path || null
  ]);
  return result.rows[0];
}

async function setEmailVerificationOtp(userId, codeHash, expiresAt) {
  await pool.query(
    `
      UPDATE user_email_otps
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND purpose = 'email_verification' AND consumed_at IS NULL
    `,
    [userId]
  );

  const result = await pool.query(
    `
      INSERT INTO user_email_otps (user_id, code_hash, purpose, expires_at)
      VALUES ($1, $2, 'email_verification', $3)
      RETURNING *
    `,
    [userId, codeHash, expiresAt]
  );
  return result.rows[0];
}

async function findActiveEmailVerificationOtp(userId) {
  const result = await pool.query(
    `
      SELECT *
      FROM user_email_otps
      WHERE user_id = $1
        AND purpose = 'email_verification'
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function consumeEmailVerificationOtp(otpId, userId) {
  const result = await pool.query(
    `
      WITH consumed AS (
        UPDATE user_email_otps
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL
        RETURNING user_id
      )
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT user_id FROM consumed)
      RETURNING ${userFields}
    `,
    [otpId, userId]
  );
  return result.rows[0] || null;
}

async function createSocialUser(client, user) {
  const query = `
    INSERT INTO users (
      email,
      username,
      password,
      password_hash,
      first_name,
      last_name,
      avatar_path,
      role,
      status,
      email_verified_at
    )
    VALUES ($1, $2, NULL, NULL, $3, $4, $5, 'USER', 'ACTIVE', $6)
    RETURNING ${userFields}
  `;
  const result = await client.query(query, [
    normalizeEmail(user.email),
    String(user.username || "").trim(),
    user.firstName || null,
    user.lastName || null,
    user.avatar || null,
    user.emailVerified ? new Date() : null
  ]);
  return result.rows[0];
}

async function updateLastLoginAt(id) {
  const result = await pool.query(
    `
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${userFields}
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function updateUserAvatar(id, avatarPath) {
  if (!avatarPath) {
    return findById(id);
  }

  const result = await pool.query(
    `
      UPDATE users
      SET avatar_path = COALESCE(avatar_path, $1),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING ${userFields}
    `,
    [avatarPath, id]
  );
  return result.rows[0] || null;
}

async function findProviderAccount(provider, providerUserId) {
  const result = await pool.query(
    `
      SELECT
        uaa.id,
        uaa.user_id,
        uaa.provider,
        uaa.provider_user_id,
        uaa.provider_email,
        uaa.provider_email_verified,
        uaa.created_at,
        uaa.updated_at,
        to_jsonb(u) AS user
      FROM user_auth_accounts uaa
      JOIN users u ON u.id = uaa.user_id
      WHERE uaa.provider = $1 AND uaa.provider_user_id = $2
    `,
    [provider, providerUserId]
  );
  return result.rows[0] || null;
}

async function createProviderAccount(client, account) {
  const result = await client.query(
    `
      INSERT INTO user_auth_accounts (
        user_id,
      provider,
      provider_user_id,
      provider_email,
      provider_email_verified
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      account.userId,
      account.provider,
      account.providerUserId,
      account.providerEmail ? normalizeEmail(account.providerEmail) : null,
      Boolean(account.providerEmailVerified)
    ]
  );
  return result.rows[0];
}

async function findOrCreateProviderUser(data) {
  const existingAccount = await findProviderAccount(data.provider, data.providerUserId);

  if (existingAccount) {
    return updateLastLoginAt(existingAccount.user_id);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let user = null;

    if (data.email && data.emailVerified) {
      const existingUser = await client.query(`SELECT ${userFields} FROM users WHERE email = $1 FOR UPDATE`, [
        normalizeEmail(data.email)
      ]);
      user = existingUser.rows[0] || null;
    }

    if (!user) {
      user = await createSocialUser(client, data);
    }

    await createProviderAccount(client, {
      userId: user.id,
      provider: data.provider,
      providerUserId: data.providerUserId,
      providerEmail: data.providerEmail,
      providerEmailVerified: data.emailVerified
    });

    await client.query("COMMIT");
    return updateLastLoginAt(user.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function linkProviderAccount(userId, account) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const userResult = await client.query(`SELECT ${userFields} FROM users WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`, [userId]);
    const user = userResult.rows[0] || null;

    if (!user) {
      await client.query("ROLLBACK");
      return null;
    }

    const existingAccount = await client.query(
      `
        SELECT *
        FROM user_auth_accounts
        WHERE provider = $1 AND provider_user_id = $2
        FOR UPDATE
      `,
      [account.provider, account.providerUserId]
    );

    if (existingAccount.rows[0]) {
      if (Number(existingAccount.rows[0].user_id) === Number(userId)) {
        await client.query("COMMIT");
        return findById(userId);
      }

      const error = new Error("Provider account is already linked to another user");
      error.code = "23505";
      throw error;
    }

    await createProviderAccount(client, {
      userId,
      provider: account.provider,
      providerUserId: account.providerUserId,
      providerEmail: account.providerEmail,
      providerEmailVerified: account.emailVerified
    });

    await client.query("COMMIT");
    return findById(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function unlinkProviderAccount(userId, provider) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT password_hash FROM users WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
      [userId]
    );
    const user = userResult.rows[0] || null;

    if (!user) {
      await client.query("ROLLBACK");
      return { error: "Authentication required", statusCode: 401 };
    }

    const accountsResult = await client.query(
      `SELECT provider FROM user_auth_accounts WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const hasPassword = Boolean(user.password_hash);

    if (!hasPassword && accountsResult.rowCount <= 1) {
      await client.query("ROLLBACK");
      return { error: "Add a password before unlinking your last connected account", statusCode: 400 };
    }

    const result = await client.query(
    `
      DELETE FROM user_auth_accounts
      WHERE user_id = $1 AND provider = $2
      RETURNING *
    `,
      [userId, provider]
    );

    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  normalizeEmail,
  findById,
  findActiveById,
  findByEmail,
  findByUsername,
  createUser,
  setEmailVerificationOtp,
  findActiveEmailVerificationOtp,
  consumeEmailVerificationOtp,
  updateLastLoginAt,
  updateUserAvatar,
  findProviderAccount,
  findOrCreateProviderUser,
  linkProviderAccount,
  unlinkProviderAccount
};
