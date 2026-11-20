// Extends app.json. For the GitHub Pages build the site lives under /space-conquistador,
// so the web export gets a base URL from EXPO_BASE_URL (empty for local dev and native builds).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
