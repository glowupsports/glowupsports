# Glow Up Sports

[![CI](https://github.com/glowupsports/glowupsports/actions/workflows/ci.yml/badge.svg)](https://github.com/glowupsports/glowupsports/actions/workflows/ci.yml)

Multi-academy SaaS platform for tennis academy administration, coaching, and player engagement. The full product overview lives in [`replit.md`](./replit.md).

## Continuous integration

Every push to any branch and every pull request triggers a GitHub Actions pipeline (`.github/workflows/ci.yml`) with three parallel jobs:

| Job          | Command                                                                                        | What it checks                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Lint**     | `npm run lint`                                                                                 | ESLint rules via `expo lint` across the whole repo                      |
| **Typecheck**| `npm run check:types`                                                                          | TypeScript `tsc --noEmit` over client, server, and shared code          |
| **Test**     | `npx vitest run --config vitest.config.ts` then `npx vitest run --config vitest.client.config.ts` | Server + shared vitest suite, then the client vitest suite              |

Each job pins Node.js 20 and uses `actions/setup-node@v4` with `cache: 'npm'` so warm reruns are fast. A job fails if its command exits non-zero — none of them are marked `continue-on-error`, so red checks must be fixed (or the underlying code change rolled back) before merge.

### Reading the result

In the GitHub PR UI each job appears as a check at the bottom of the PR:

- **Green check** — that command passed.
- **Red X** — the command failed; click it to see the log and find the failing file/line.
- **Yellow dot** — the job is still running.

The badge at the top of this README reflects the latest run on the default branch.

### Required GitHub secrets

The **Test** job hits Supabase (server vitest suite reads the real schema). For it to pass on CI, set these under **Repo Settings → Secrets and variables → Actions**:

| Secret                  | Used by                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `SUPABASE_DATABASE_URL` | Server tests — Drizzle/Postgres connection                 |
| `SESSION_SECRET`        | Server tests — Express session middleware                  |

Lint and Typecheck don't need any secrets.

### Running the same checks locally

```bash
npm run lint                                 # Lint job
npm run check:types                          # Typecheck job
npx vitest run --config vitest.config.ts     # Test job — server + shared suite
npx vitest run --config vitest.client.config.ts  # Test job — client suite
```

If any of these fail locally, they will fail in CI too.
