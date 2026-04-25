// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

// Task #1082 — Removed `eslint-plugin-prettier/recommended`.
//
// The plugin was crashing inside Prettier itself with
//   "Comment "::(_)" was not printed. Please report this error!"
// (a known internal Prettier bug exposed via synckit's worker bridge),
// which made `npm run lint` exit non-zero before any rule was actually
// evaluated. With lint silently broken, the no-undef guardrail added in
// Task #1016 stopped firing, and Task #1082 (missing MATCH_CARD_WIDTH)
// shipped to prod the same way Task #1015 (missing SectionHeader) did.
//
// Prettier's own integration guide recommends running prettier as a
// separate gate (it's already wired up via `npm run check:format`)
// rather than through eslint-plugin-prettier — see
// https://prettier.io/docs/en/integrating-with-linters.html — so we
// follow that here and keep ESLint focused on real correctness rules.

module.exports = defineConfig([
  expoConfig,
  {
    // Exclude build output and any caches lint shouldn't traverse.
    // Without `.cache/**` here, expo lint walks into bun's
    // node_modules cache and chokes on third-party flow syntax.
    ignores: [
      "dist/**",
      ".cache/**",
      "node_modules/**",
      "server_dist/**",
      "scripts/fixtures/**",
      // Task #1313 — `static-build/` holds the generated Hermes bundles
      // produced by `expo:static:build`. Linting auto-generated minified
      // bundle.js was producing 2 hard parse errors with no actionable
      // signal, so skip the whole tree.
      "static-build/**",
      // Task #1313 — `.local/` is agent/skills metadata (skill scaffolds,
      // backups, task notes). It is not shipped with the app and contains
      // sample TS files that pull in packages we don't install
      // (`@mastra/core`, `inngest`, ...), producing ~388 spurious
      // import/no-unresolved errors that drown out real signal.
      ".local/**",
      // Task #1313 — `artifacts/` is the standalone mockup sandbox
      // (Vite + shadcn) and one-off prev_*.tsx snapshots. It has its own
      // tsconfig and dependency tree (`@/components/ui/...` aliases) that
      // our root ESLint resolver can't follow, producing another
      // ~100 import/no-unresolved errors. Lint the sandbox separately if
      // it ever ships, not from the app's main lint pass.
      "artifacts/**",
    ],
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
    languageOptions: {
      // Task #1082 — Declare the Node + browser/RN globals that are
      // legitimately available at runtime so `no-undef` only fires on
      // *actually* undeclared identifiers (the bug class we care about).
      // Per replit.md "Lint guardrail" rule: declare globals here, never
      // disable the rule. Without these, `Buffer`, `NodeJS`, `Express`,
      // `BodyInit`, `setTimeout`, etc. all flag as no-undef errors and
      // bury real missing-import bugs in the noise.
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
        // express namespace types referenced as `Express.Multer.File` etc.
        Express: "readonly",
        // RN-specific
        __DEV__: "readonly",
        // Task #1313 — TS DOM/Node ambient types not in the `globals` npm
        // package. Without these, real code that types `RequestInit`,
        // `BodyInit`, or `NodeJS.Timeout` flags as no-undef and drowns out
        // genuine missing-import bugs.
        RequestInit: "readonly",
        RequestInfo: "readonly",
        BodyInit: "readonly",
        HeadersInit: "readonly",
        ResponseInit: "readonly",
        NodeJS: "readonly",
      },
    },
    rules: {
      "react/jsx-no-undef": ["error", { allowGlobals: false }],
      "no-undef": "error",
    },
  },
  // Task #1313 — `.cjs` helper scripts are CommonJS modules and legitimately
  // use `__dirname`, `module`, `require`. Declare those globals so lint
  // doesn't flag them as undefined.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
]);
