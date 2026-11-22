const { validateEmail, validatePassword, validateUsername } = require("../users/user.validation");

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateRegisterPayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Request body must be an object"];
  }

  if (!validateEmail(body.email)) {
    errors.push("email must be valid");
  }

  if (!validateUsername(body.username)) {
    errors.push("username must be 3-30 characters and contain only letters, numbers, and underscores");
  }

  if (!validatePassword(body.password)) {
    errors.push("password must be at least 8 characters");
  }

  if (body.password !== body.confirmPassword && body.password !== body.confirm_password) {
    errors.push("confirm password must match password");
  }

  return errors;
}

function validateLoginPayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Request body must be an object"];
  }

  if (!validateEmail(body.email)) {
    errors.push("email must be valid");
  }

  if (!body.password || typeof body.password !== "string") {
    errors.push("password is required");
  }

  return errors;
}

function validateEmailOtpPayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Request body must be an object"];
  }

  if (!validateEmail(body.email)) {
    errors.push("email must be valid");
  }

  const code = String(body.code || body.otp || "").trim();
  if (!/^\d{6}$/.test(code)) {
    errors.push("verification code must be 6 digits");
  }

  return errors;
}

function validateResendEmailOtpPayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Request body must be an object"];
  }

  if (!validateEmail(body.email)) {
    errors.push("email must be valid");
  }

  return errors;
}

function validate(validationFn) {
  return (req, res, next) => {
    const errors = validationFn(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    next();
  };
}

module.exports = {
  validate,
  validateRegisterPayload,
  validateLoginPayload,
  validateEmailOtpPayload,
  validateResendEmailOtpPayload
};
