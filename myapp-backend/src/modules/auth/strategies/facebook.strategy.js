const { Strategy: FacebookStrategy } = require("passport-facebook");
const authService = require("../auth.service");

function isVerified(value) {
  return value === true || value === "true";
}

function mapFacebookProfile(profile) {
  const emailEntry = Array.isArray(profile.emails) ? profile.emails[0] : null;
  const photoEntry = Array.isArray(profile.photos) ? profile.photos[0] : null;

  return {
    providerUserId: profile.id,
    email: emailEntry?.value,
    emailVerified: isVerified(profile._json?.verified) || isVerified(emailEntry?.verified),
    firstName: profile.name?.givenName,
    lastName: profile.name?.familyName,
    avatarUrl: photoEntry?.value
  };
}

function registerFacebookStrategy(passport) {
  const clientID = process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET;
  const callbackURL = process.env.FACEBOOK_CALLBACK_URL || "http://localhost:3000/api/auth/facebook/callback";

  if (!clientID || !clientSecret) {
    return false;
  }

  passport.use(new FacebookStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      passReqToCallback: true,
      profileFields: ["id", "name", "picture.type(large)"]
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const mappedProfile = mapFacebookProfile(profile);
        const linkUserId = req.session?.linkProvider === "facebook" ? req.session.linkProviderUserId : null;
        const user = linkUserId
          ? await authService.linkProvider(linkUserId, "facebook", mappedProfile)
          : await authService.loginWithFacebook(mappedProfile);
        done(null, user);
      } catch (error) {
        if (error instanceof authService.AuthError) {
          return done(null, false, { message: error.message });
        }

        done(error);
      }
    }
  ));

  return true;
}

module.exports = {
  registerFacebookStrategy
};
