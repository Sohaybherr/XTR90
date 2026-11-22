const test = require("node:test");
const assert = require("node:assert/strict");

const { validateLoginPayload, validateRegisterPayload } = require("../src/modules/auth/auth.validation");
const { validateChangePasswordPayload, validateUpdateProfilePayload } = require("../src/modules/users/user.validation");

test("register validation accepts a valid payload", () => {
  const errors = validateRegisterPayload({
    email: "USER@example.com",
    username: "valid_user",
    password: "password123",
    confirmPassword: "password123"
  });

  assert.deepEqual(errors, []);
});

test("register validation rejects invalid data", () => {
  const errors = validateRegisterPayload({
    email: "bad",
    username: "x",
    password: "short",
    confirmPassword: "different"
  });

  assert.equal(errors.length, 4);
});

test("login validation requires generic email and password shape", () => {
  assert.deepEqual(validateLoginPayload({ email: "user@example.com", password: "password123" }), []);
  assert.equal(validateLoginPayload({ email: "bad" }).length, 2);
});

test("profile validation allows supported profile fields", () => {
  assert.deepEqual(validateUpdateProfilePayload({
    first_name: "First",
    last_name: "Last",
    avatar: "/assets/users/avatar.png"
  }), []);
});

test("change password validation checks current and confirmed new password", () => {
  assert.deepEqual(validateChangePasswordPayload({
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "new-password"
  }), []);

  assert.equal(validateChangePasswordPayload({
    newPassword: "short",
    confirmPassword: "different"
  }).length, 3);
});
