const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const authService = require("../auth.service");

function isVerified(value) {
  return value === true || value === "true";
}

function mapGoogleProfile(profile) {
  const emailEntry = Array.isArray(profile.emails) ? profile.emails[0] : null;
  const photoEntry = Array.isArray(profile.photos) ? profile.photos[0] : null;

  return {
    providerUserId: profile.id,
    email: emailEntry?.value,
    emailVerified: isVerified(profile._json?.email_verified) || isVerified(emailEntry?.verified),
    firstName: profile.name?.givenName,
    lastName: profile.name?.familyName,
    avatarUrl: photoEntry?.value
  };
}

function registerGoogleStrategy(passport) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/api/auth/google/callback";

  if (!clientID || !clientSecret) {
    return false;
  }

  passport.use(new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const mappedProfile = mapGoogleProfile(profile);
        const linkUserId = req.session?.linkProvider === "google" ? req.session.linkProviderUserId : null;
        const user = linkUserId
          ? await authService.linkProvider(linkUserId, "google", mappedProfile)
          : await authService.loginWithGoogle(mappedProfile);
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
  registerGoogleStrategy
};
