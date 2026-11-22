const authService = require("./auth.service");
const { toUserDto } = require("./auth.dto");

const COOKIE_NAME = "sid";

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function sendServiceError(error, res) {
  if (error instanceof authService.AuthError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error("Authentication error:", error);
  return res.status(500).json({ error: "Internal Server Error" });
}

async function register(req, res) {
  try {
    const { user, verification } = await authService.register(req.body);

    res.status(201).json({ user: toUserDto(user), verificationRequired: true, verification });
  } catch (error) {
    sendServiceError(error, res);
  }
}

async function verifyEmailOtp(req, res) {
  try {
    const user = await authService.verifyEmailOtp(req.body);
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendServiceError(error, res);
  }
}

async function resendEmailOtp(req, res) {
  try {
    const verification = await authService.resendEmailOtp(req.body);
    res.json({ verificationRequired: true, verification });
  } catch (error) {
    sendServiceError(error, res);
  }
}

async function login(req, res) {
  try {
    const user = await authService.login(req.body);
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendServiceError(error, res);
  }
}

async function logout(req, res) {
  try {
    if (req.session) {
      await destroySession(req);
    }

    res.clearCookie(COOKIE_NAME);
    res.status(204).send();
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function me(req, res) {
  try {
    const user = await authService.getCurrentUser(req.session?.userId);
    res.json({ user: toUserDto(user) });
  } catch (error) {
    sendServiceError(error, res);
  }
}

async function socialCallback(req, res) {
  try {
    const wasLinking = Boolean(req.session?.linkProviderUserId);
    await regenerateSession(req);
    req.session.userId = req.user.id;
    await saveSession(req);

    const defaultSuccessUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
    const successUrl = wasLinking
      ? process.env.CLIENT_ACCOUNT_LINK_SUCCESS_URL || `${defaultSuccessUrl}/profile?accountLink=success`
      : process.env.CLIENT_AUTH_SUCCESS_URL || defaultSuccessUrl;

    res.redirect(successUrl);
  } catch (error) {
    sendServiceError(error, res);
  }
}

function socialFailure(req, res) {
  const defaultClientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  const wasLinking = Boolean(req.session?.linkProviderUserId);

  if (req.session) {
    delete req.session.linkProvider;
    delete req.session.linkProviderUserId;
  }

  const failureUrl = wasLinking
    ? process.env.CLIENT_ACCOUNT_LINK_FAILURE_URL || `${defaultClientUrl}/profile?accountLink=failed`
    : process.env.CLIENT_AUTH_FAILURE_URL || `${defaultClientUrl}/login`;
  res.redirect(failureUrl);
}

module.exports = {
  register,
  verifyEmailOtp,
  resendEmailOtp,
  login,
  logout,
  me,
  socialCallback,
  socialFailure
};
