const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("./auth.controller");
const {
  validate,
  validateEmailOtpPayload,
  validateLoginPayload,
  validateRegisterPayload,
  validateResendEmailOtpPayload
} = require("./auth.validation");
const { passport, isProviderConfigured } = require("./passport");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts" }
});

function requireConfiguredProvider(provider) {
  return (req, res, next) => {
    if (!isProviderConfigured(provider)) {
      return res.status(503).json({ error: `${provider} authentication is not configured` });
    }

    next();
  };
}

router.post("/register", authLimiter, validate(validateRegisterPayload), authController.register);
router.post("/verify-email-otp", authLimiter, validate(validateEmailOtpPayload), authController.verifyEmailOtp);
router.post("/resend-email-otp", authLimiter, validate(validateResendEmailOtpPayload), authController.resendEmailOtp);
router.post("/login", authLimiter, validate(validateLoginPayload), authController.login);
router.post("/logout", authController.logout);
router.get("/me", authController.me);

router.get(
  "/google",
  requireConfiguredProvider("google"),
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: true,
    session: false
  })
);

router.get(
  "/google/callback",
  requireConfiguredProvider("google"),
  passport.authenticate("google", {
    failureRedirect: "/api/auth/social/failure",
    session: false
  }),
  authController.socialCallback
);

router.get(
  "/facebook",
  requireConfiguredProvider("facebook"),
  passport.authenticate("facebook", {
    state: true,
    session: false
  })
);

router.get(
  "/facebook/callback",
  requireConfiguredProvider("facebook"),
  passport.authenticate("facebook", {
    failureRedirect: "/api/auth/social/failure",
    session: false
  }),
  authController.socialCallback
);

router.get("/social/failure", authController.socialFailure);

module.exports = router;
