import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const before = await db.execute(sql`
    SELECT COUNT(*)::int AS msgs
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.type = 'world'
  `);
  const beforeCount = (before.rows[0] as any)?.msgs ?? 0;
  console.log(`[WipeWorldChat] World chat messages before: ${beforeCount}`);

  if (dryRun) {
    console.log(`[WipeWorldChat] --dry-run: not executing.`);
    return;
  }

  await db.execute(sql`
    DELETE FROM message_reactions
    WHERE message_id IN (
      SELECT m.id FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.type = 'world'
    )
  `);
  await db.execute(sql`
    DELETE FROM messages
    WHERE conversation_id IN (SELECT id FROM conversations WHERE type = 'world')
  `);
  await db.execute(sql`
    UPDATE conversations
    SET last_message_at = NULL, last_message_preview = NULL
    WHERE type = 'world'
  `);

  const after = await db.execute(sql`
    SELECT COUNT(*)::int AS msgs
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.type = 'world'
  `);
  console.log(`[WipeWorldChat] World chat messages after: ${(after.rows[0] as any)?.msgs ?? 0}`);
  console.log(`[WipeWorldChat] Done.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[WipeWorldChat] FATAL:", err);
    process.exit(1);
  });
