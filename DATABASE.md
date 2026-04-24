# DATABASE.md — READ ME FIRST BEFORE TOUCHING DATA

> **The only real database for Glow Up Sports is Supabase PostgreSQL.**
> Everything you see, write, migrate, or fix in production lives in Supabase.
> Anything else is a sandbox and will lie to you.

---

## TL;DR

Use this command. Always.

```bash
psql "$SUPABASE_DATABASE_URL" -c "select count(*) from users"
```

Or the helper wrapper:

```bash
bash scripts/db-query.sh -c "select count(*) from users"
```

That's it. If you're about to do anything else, stop and re-read this file.

---

## Why this file exists

Agents keep running queries against the local Replit sandbox database instead
of Supabase, even though the rule already exists in `replit.md`. The result is:

- "There are 0 rows in `users`" — but actually there are thousands in Supabase.
- "I fixed the data" — but the fix landed in the sandbox, never seen by the app.
- "The migration ran" — but only against the sandbox, prod is still broken.

This file is the single source of truth on which database to use and how.

---

## WRONG vs RIGHT

### WRONG — queries the LOCAL sandbox DB, not Supabase

```js
// `executeSql` in code_execution → LOCAL sandbox, NOT Supabase.
await executeSql({ sqlQuery: "select count(*) from users" });
```

```bash
# Plain psql with no URL → falls back to local Postgres.
psql -c "select count(*) from users"

# `$DATABASE_URL` is the LOCAL sandbox URL on Replit, not Supabase.
psql "$DATABASE_URL" -c "select count(*) from users"

# drizzle-kit / migrations against $DATABASE_URL → migrates the sandbox.
npx drizzle-kit push
```

### RIGHT — queries the REAL Supabase DB

```bash
# Direct
psql "$SUPABASE_DATABASE_URL" -c "select count(*) from users"

# Via the helper (same thing, with a friendly error if the env var is missing)
bash scripts/db-query.sh -c "select count(*) from users"

# For schema sync / migrations, use the existing wrapper which overrides
# DATABASE_URL with SUPABASE_DATABASE_URL before invoking drizzle-kit:
bash scripts/sync-to-supabase.sh
```

---

## Common mistakes to avoid

1. **Using the `executeSql` / `code_execution` SQL tool.**
   It points at the local sandbox Postgres, not Supabase. Do not use it for
   any real data inspection, debugging, or fix. Use `scripts/db-query.sh` (or
   `psql "$SUPABASE_DATABASE_URL"`) instead.

2. **Using `$DATABASE_URL` directly.**
   On Replit, `DATABASE_URL` resolves to the local sandbox database. Always
   use `$SUPABASE_DATABASE_URL` for queries you actually want to land.

3. **Running `npx drizzle-kit push` directly.**
   Drizzle reads `$DATABASE_URL`, so this migrates the sandbox. Use
   `bash scripts/sync-to-supabase.sh` (which overrides `DATABASE_URL` with
   `$SUPABASE_DATABASE_URL`) for any schema change you want in production.

4. **Writing one-off "fix" SQL via the local tool.**
   If a user reports bad data and you want to repair it, the repair must run
   against Supabase. Otherwise the bug is still there for everyone.

5. **Trusting row counts from the sandbox.**
   The sandbox is essentially empty / out of date. If a count looks suspicious
   ("0 users", "no sessions today"), it's almost certainly because you queried
   the wrong DB. Re-run via `scripts/db-query.sh` before drawing conclusions.

---

## Where the connection string lives

- Env var name: `SUPABASE_DATABASE_URL`
- Set in: Replit Secrets (do not hardcode, do not log, do not echo to stdout).
- Same value is used by `scripts/sync-to-supabase.sh` and `scripts/db-sync.ts`.

If `SUPABASE_DATABASE_URL` is missing in your environment, `scripts/db-query.sh`
will exit with a clear error explaining what to set.

---

## Migrations and one-off fixes — same rule

Migrations and one-off data fixes are NOT exceptions. They must hit Supabase
or they are pointless.

- Schema migrations → `bash scripts/sync-to-supabase.sh`
- One-off SQL fixes → `bash scripts/db-query.sh -f path/to/fix.sql`
- Ad-hoc inspection → `bash scripts/db-query.sh -c "..."`

If you find yourself reaching for the local SQL execution tool to "just check
real quick", stop. Use the wrapper. It's the same number of keystrokes and it
gives the right answer.
