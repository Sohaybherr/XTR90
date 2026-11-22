const passport = require("passport");
const { registerGoogleStrategy } = require("./strategies/google.strategy");
const { registerFacebookStrategy } = require("./strategies/facebook.strategy");

const configuredStrategies = {
  google: registerGoogleStrategy(passport),
  facebook: registerFacebookStrategy(passport)
};

function isProviderConfigured(provider) {
  return Boolean(configuredStrategies[provider]);
}

module.exports = {
  passport,
  isProviderConfigured
};
