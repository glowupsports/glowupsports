import { pool } from "../server/db";
import { storage } from "../server/storage";

const id = "12465091-14b0-4a26-8b06-b77a32f783ee";
(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
  } finally {
    client.release();
  }
  try {
    const ok = await storage.deletePlayer(id, "default-academy");
    console.log("deletePlayer returned:", ok);
    // verify
    const r = await pool.query("SELECT id, name FROM players WHERE id=$1", [id]);
    console.log("player row after delete:", r.rowCount);
  } catch (e: any) {
    console.error("FAILED:", e.message);
    console.error("constraint:", e.constraint);
    console.error("table:", e.table);
    console.error("detail:", e.detail);
  }
  process.exit(0);
})();
