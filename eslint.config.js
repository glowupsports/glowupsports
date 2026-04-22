// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ["dist/*"],
  },
  // Task #1016 — Catch missing-import crashes before they ship.
  // Task #1015 was a one-line missing `import { SectionHeader }` that crashed
  // the new-account onboarding flow on prod Android. Static analysis would
  // have caught it. Force the relevant rules to ERROR for all production
  // client/server source so the next undeclared JSX component / undeclared
  // identifier fails `npm run lint` instead of failing on a real user's
  // device. Tests and scripts are intentionally excluded — they pull in
  // jest/node globals that would otherwise produce noisy false positives.
  {
    files: ["client/**/*.{ts,tsx,js,jsx}", "server/**/*.{ts,tsx,js,jsx}"],
    ignores: [
      "**/*.test.{ts,tsx,js,jsx}",
      "**/*.spec.{ts,tsx,js,jsx}",
      "**/__tests__/**",
      "**/__mocks__/**",
      "server/tests/**",
      "server/scripts/**",
    ],
    rules: {
      "react/jsx-no-undef": ["error", { allowGlobals: false }],
      "no-undef": "error",
    },
  },
]);
