const bcrypt = require("bcrypt");
const crypto = require("crypto");
const authModel = require("./auth.model");
const { downloadUserAvatar } = require("./avatar.service");

const PASSWORD_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const SUPPORTED_PROVIDERS = new Set(["google", "facebook"]);
const OTP_TTL_MINUTES = Number(process.env.EMAIL_OTP_TTL_MINUTES || 10);

class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

function isUniqueViolation(error) {
  return error && error.code === "23505";
}

function assertSupportedProvider(provider) {
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new AuthError("Unsupported authentication provider", 400);
  }
}

function createSocialUsername(provider, providerUserId) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${provider}:${providerUserId}`)
    .digest("hex")
    .slice(0, 16);
  return `${provider}_${fingerprint}`.slice(0, 30);
}

function createProviderFallbackEmail(provider, providerUserId) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${provider}:${providerUserId}`)
    .digest("hex")
    .slice(0, 24);
  return `${provider}_${fingerprint}@social.local`;
}

function createOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function issueEmailVerificationOtp(user) {
  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await authModel.setEmailVerificationOtp(user.id, hashOtpCode(code), expiresAt);

  // SMTP is not configured in this project; expose the code in development logs.
  console.info(`Email verification OTP for ${user.email}: ${code}`);

  return {
    email: user.email,
    expiresAt,
    ...(process.env.NODE_ENV === "production" ? {} : { otp: code })
  };
}

function normalizeProviderProfile(provider, profile) {
  assertSupportedProvider(provider);

  const providerUserId = String(profile.providerUserId || profile.id || "").trim();

  if (!providerUserId) {
    throw new AuthError("Provider profile is missing an id", 400);
  }

  const providerEmail = authModel.normalizeEmail(profile.email);
  const email = providerEmail || (provider === "facebook" ? createProviderFallbackEmail(provider, providerUserId) : "");

  if (!email) {
    throw new AuthError("Provider profile is missing an email address", 400);
  }

  const firstName = profile.firstName || profile.given_name || null;
  const lastName = profile.lastName || profile.family_name || null;

  return {
    provider,
    providerUserId,
    email,
    providerEmail: providerEmail || null,
    username: createSocialUsername(provider, providerUserId),
    firstName,
    lastName,
    avatarUrl: profile.avatarUrl || profile.avatar || null,
    emailVerified: Boolean(providerEmail && profile.emailVerified)
  };
}

async function register(payload) {
  const passwordHash = await bcrypt.hash(payload.password, PASSWORD_SALT_ROUNDS);

  try {
    const user = await authModel.createUser({
      email: payload.email,
      username: payload.username,
      passwordHash,
      firstName: payload.firstName || payload.first_name,
      lastName: payload.lastName || payload.last_name,
      avatar: payload.avatar || payload.avatar_path
    });

    const verification = await issueEmailVerificationOtp(user);
    return { user, verification };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AuthError("Email or username already exists", 409);
    }

    throw error;
  }
}

async function login(payload) {
  const user = await authModel.findByEmail(payload.email);

  if (!user || user.status !== "ACTIVE") {
    throw new AuthError("Invalid email or password", 401);
  }

  const passwordMatches = await bcrypt.compare(payload.password, user.password_hash || "");

  if (!passwordMatches) {
    throw new AuthError("Invalid email or password", 401);
  }

  if (!user.email_verified_at) {
    throw new AuthError("Verify your email before signing in", 403);
  }

  return authModel.updateLastLoginAt(user.id);
}

async function verifyEmailOtp(payload) {
  const email = authModel.normalizeEmail(payload.email);
  const code = String(payload.code || payload.otp || "").trim();

  if (!email || !code) {
    throw new AuthError("Email and verification code are required", 400);
  }

  const user = await authModel.findByEmail(email);

  if (!user || user.status !== "ACTIVE") {
    throw new AuthError("Invalid verification code", 400);
  }

  if (user.email_verified_at) {
    return authModel.updateLastLoginAt(user.id);
  }

  const otp = await authModel.findActiveEmailVerificationOtp(user.id);

  if (!otp || otp.code_hash !== hashOtpCode(code)) {
    throw new AuthError("Invalid or expired verification code", 400);
  }

  const verifiedUser = await authModel.consumeEmailVerificationOtp(otp.id, user.id);
  return authModel.updateLastLoginAt(verifiedUser.id);
}

async function resendEmailOtp(payload) {
  const email = authModel.normalizeEmail(payload.email);

  if (!email) {
    throw new AuthError("Email is required", 400);
  }

  const user = await authModel.findByEmail(email);

  if (!user || user.status !== "ACTIVE") {
    throw new AuthError("User not found", 404);
  }

  if (user.email_verified_at) {
    throw new AuthError("Email is already verified", 400);
  }

  return issueEmailVerificationOtp(user);
}

async function getCurrentUser(userId) {
  if (!userId) {
    throw new AuthError("Authentication required", 401);
  }

  const user = await authModel.findActiveById(userId);

  if (!user) {
    throw new AuthError("Authentication required", 401);
  }

  return user;
}

async function loginWithProvider(provider, providerProfile) {
  const profile = normalizeProviderProfile(provider, providerProfile);
  const avatarPath = await downloadUserAvatar(profile.avatarUrl, profile.provider, profile.providerUserId);
  let user;

  try {
    user = await authModel.findOrCreateProviderUser({
      ...profile,
      avatar: avatarPath
    });
  } catch (error) {
    if (isUniqueViolation(error) && !profile.emailVerified) {
      throw new AuthError("Verified provider email is required to link existing account", 409);
    }

    throw error;
  }

  if (avatarPath && !user.avatar_path) {
    return authModel.updateUserAvatar(user.id, avatarPath);
  }

  return user;
}

async function loginWithGoogle(profile) {
  return loginWithProvider("google", profile);
}

async function loginWithFacebook(profile) {
  return loginWithProvider("facebook", profile);
}

async function linkProvider(userId, provider, providerProfile) {
  if (!userId) {
    throw new AuthError("Authentication required", 401);
  }

  const profile = normalizeProviderProfile(provider, providerProfile);
  const avatarPath = await downloadUserAvatar(profile.avatarUrl, profile.provider, profile.providerUserId);

  try {
    const user = await authModel.linkProviderAccount(userId, {
      ...profile,
      avatar: avatarPath
    });

    if (!user) {
      throw new AuthError("Authentication required", 401);
    }

    return user;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AuthError("Provider account is already linked", 409);
    }

    throw error;
  }
}

async function unlinkProvider(userId, provider) {
  if (!userId) {
    throw new AuthError("Authentication required", 401);
  }

  assertSupportedProvider(provider);
  const deleted = await authModel.unlinkProviderAccount(userId, provider);

  if (deleted?.error) {
    throw new AuthError(deleted.error, deleted.statusCode);
  }

  if (!deleted) {
    throw new AuthError("Provider account is not linked", 404);
  }
}

module.exports = {
  AuthError,
  register,
  login,
  verifyEmailOtp,
  resendEmailOtp,
  getCurrentUser,
  loginWithProvider,
  loginWithGoogle,
  loginWithFacebook,
  linkProvider,
  unlinkProvider
};
