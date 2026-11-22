const test = require("node:test");
const assert = require("node:assert/strict");

const { toUserDto } = require("../src/modules/users/user.dto");

test("toUserDto hides password and maps public fields", () => {
  const dto = toUserDto({
    id: 1,
    email: "user@example.com",
    username: "user",
    password_hash: "secret",
    first_name: "First",
    last_name: "Last",
    avatar_path: "/assets/users/1.png",
    role: "USER",
    status: "ACTIVE",
    email_verified_at: null,
    created_at: "2026-07-12T00:00:00.000Z"
  });

  assert.equal(dto.id, 1);
  assert.equal(dto.firstName, "First");
  assert.equal(dto.lastName, "Last");
  assert.equal(dto.avatar, "/assets/users/1.png");
  assert.equal(dto.emailVerified, false);
  assert.equal(Object.hasOwn(dto, "password_hash"), false);
});
