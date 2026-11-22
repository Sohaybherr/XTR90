const authModel = require("../modules/auth/auth.model");

async function authenticate(req, res, next) {
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const user = await authModel.findActiveById(userId);

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = authenticate;
