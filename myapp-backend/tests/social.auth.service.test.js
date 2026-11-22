const test = require("node:test");
const assert = require("node:assert/strict");

const authModel = require("../src/modules/auth/auth.model");
const authService = require("../src/modules/auth/auth.service");

const originals = {
  findOrCreateProviderUser: authModel.findOrCreateProviderUser,
  updateUserAvatar: authModel.updateUserAvatar
};

test.afterEach(() => {
  authModel.findOrCreateProviderUser = originals.findOrCreateProviderUser;
  authModel.updateUserAvatar = originals.updateUserAvatar;
});

test("loginWithGoogle maps provider identity without exposing tokens", async () => {
  let receivedProfile = null;

  authModel.findOrCreateProviderUser = async (profile) => {
    receivedProfile = profile;
    return {
      id: 1,
      email: "user@example.com",
      username: "google_user",
      first_name: "First",
      last_name: "Last",
      avatar_path: null,
      role: "USER",
      status: "ACTIVE"
    };
  };
  authModel.updateUserAvatar = async (id, avatarPath) => ({ id, avatar_path: avatarPath });

  const user = await authService.loginWithGoogle({
    providerUserId: "google-id-1",
    email: "USER@example.com",
    emailVerified: true,
    firstName: "First",
    lastName: "Last"
  });

  assert.equal(user.id, 1);
  assert.equal(receivedProfile.provider, "google");
  assert.equal(receivedProfile.providerUserId, "google-id-1");
  assert.equal(receivedProfile.email, "user@example.com");
  assert.equal(receivedProfile.emailVerified, true);
  assert.equal(Object.hasOwn(receivedProfile, "accessToken"), false);
  assert.equal(Object.hasOwn(receivedProfile, "refreshToken"), false);
});

test("loginWithFacebook accepts profiles without email using an isolated fallback email", async () => {
  let receivedProfile = null;

  authModel.findOrCreateProviderUser = async (profile) => {
    receivedProfile = profile;
    return {
      id: 2,
      email: profile.email,
      username: "facebook_user",
      avatar_path: null,
      role: "USER",
      status: "ACTIVE"
    };
  };

  const user = await authService.loginWithFacebook({
    providerUserId: "facebook-id-1",
    emailVerified: false
  });

  assert.equal(user.id, 2);
  assert.equal(receivedProfile.provider, "facebook");
  assert.equal(receivedProfile.providerEmail, null);
  assert.match(receivedProfile.email, /^facebook_[a-f0-9]{24}@social\.local$/);
  assert.equal(receivedProfile.emailVerified, false);
});

test("loginWithGoogle rejects provider profiles without email", async () => {
  await assert.rejects(
    () => authService.loginWithGoogle({
      providerUserId: "google-id-2",
      emailVerified: false
    }),
    /missing an email address/
  );
});

test("social login rejects unsupported providers", async () => {
  await assert.rejects(
    () => authService.loginWithProvider("github", {
      providerUserId: "github-id-1",
      email: "user@example.com"
    }),
    /Unsupported authentication provider/
  );
});
