/**
 * Task #905 — Drift watchdog for the player merge / delete code paths.
 * Task #907 — Canonical list moved to `server/lib/player-cleanup.ts`; this
 * file now just runs the audit against the shared set.
 *
 * On boot, list every foreign key in the public schema that references
 * `players(id)` and diff that set against the canonical list of tables
 * the merge endpoint (`server/routes/admin-setup.ts`) and the delete
 * path (`storage.deletePlayer` in `server/storage.ts`) actually touch.
 *
 * Any unknown table is logged as a single WARN with a pointer to the
 * shared module that needs to be updated. The check is wrapped in
 * a Promise.race against a hard timeout (default 1500ms) and never
 * throws — boot must not depend on this audit. If the budget is blown
 * (e.g. busy startup, slow information_schema), the audit logs a
 * single "Skipped" WARN instead of stalling.
 */
import { pool } from "../db";
import { KNOWN_PLAYER_FK_TABLES } from "../lib/player-cleanup";

// Use pg_catalog directly — it joins on OIDs so we cannot accidentally
// match unrelated constraints that happen to share a name across schemas
// (a real risk with information_schema's name-only joins). We restrict to
// FKs in the public schema whose referenced column is public.players(id).
const FK_QUERY = `
  SELECT DISTINCT cls.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class cls            ON cls.oid = con.conrelid
    JOIN pg_namespace ns         ON ns.oid = cls.relnamespace
    JOIN pg_class ref_cls        ON ref_cls.oid = con.confrelid
    JOIN pg_namespace ref_ns     ON ref_ns.oid = ref_cls.relnamespace
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS rk(attnum, ord) ON TRUE
    JOIN pg_attribute ref_att
      ON ref_att.attrelid = ref_cls.oid
     AND ref_att.attnum   = rk.attnum
   WHERE con.contype   = 'f'
     AND ns.nspname    = 'public'
     AND ref_ns.nspname = 'public'
     AND ref_cls.relname = 'players'
     AND ref_att.attname = 'id'
`;

export async function auditPlayerForeignKeys(timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  try {
    const result = await Promise.race<
      { rows: { table_name: string }[] } | null
    >([
      pool.query<{ table_name: string }>(FK_QUERY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!result) {
      // Never fail boot — just note that the audit was skipped.
      console.warn(
        `[PlayerFKAudit] Skipped: information_schema query exceeded ${timeoutMs}ms budget`
      );
      return;
    }

    const unknown: string[] = [];
    for (const row of result.rows) {
      const name = row.table_name;
      if (!KNOWN_PLAYER_FK_TABLES.has(name)) unknown.push(name);
    }

    const elapsed = Date.now() - started;
    if (unknown.length === 0) {
      console.log(
        `[PlayerFKAudit] OK — ${result.rows.length} player FK tables, all known (${elapsed}ms)`
      );
      // Task #909 tripwire alias — this same list is the source of truth
      // for BOTH the merge path AND storage.deletePlayer. Emit a second
      // line so a grep for "[DeleteAudit]" surfaces the delete check too.
      console.log(
        `[DeleteAudit] OK — storage.deletePlayer covers all ${result.rows.length} player FK tables`
      );
      return;
    }

    console.warn(
      `[PlayerFKAudit] WARN — ${unknown.length} table(s) reference players(id) but are NOT handled by the merge/delete code: ${unknown.join(", ")}.\n` +
        `  → Add the table(s) to KNOWN_PLAYER_FK_TABLES in server/lib/player-cleanup.ts (canonical list)\n` +
        `  → If handling is a straight "DELETE FROM <table> WHERE player_id", add it to GUARDED_PLAYER_DELETE_STATEMENTS in the same file (picked up by storage.deletePlayer automatically)\n` +
        `  → Otherwise, mirror the transfer/delete logic in the merge endpoint (server/routes/admin-setup.ts PART A/B) and the typed batches in storage.deletePlayer (${elapsed}ms)`
    );
    // Task #909 — explicit [DeleteAudit] MISSING tripwire so a grep for the
    // delete path doesn't silently miss the warning emitted under the
    // [PlayerFKAudit] banner.
    console.warn(
      `[DeleteAudit] MISSING — storage.deletePlayer does not handle: ${unknown.join(", ")}`
    );
  } catch (err) {
    // Swallow — this watchdog must never fail boot.
    console.warn(
      `[PlayerFKAudit] Skipped due to error: ${(err as Error)?.message ?? String(err)}`
    );
  }
}
