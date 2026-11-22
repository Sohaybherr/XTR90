const test = require("node:test");
const assert = require("node:assert/strict");

const authorize = require("../src/middlewares/authorize");

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("authorize allows matching roles", () => {
  const middleware = authorize("ADMIN", "EDITOR");
  const req = { user: { role: "ADMIN" } };
  const res = createResponse();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, null);
});

test("authorize blocks missing or mismatched roles", () => {
  const adminOnly = authorize("ADMIN");
  const forbidden = createResponse();
  const unauthenticated = createResponse();

  adminOnly({ user: { role: "USER" } }, forbidden, () => {});
  adminOnly({}, unauthenticated, () => {});

  assert.equal(forbidden.statusCode, 403);
  assert.equal(unauthenticated.statusCode, 401);
});
