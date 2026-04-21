import { storage } from "../server/storage";

const id = "12465091-14b0-4a26-8b06-b77a32f783ee";
(async () => {
  try {
    const ok = await storage.deletePlayer(id, "default-academy");
    console.log("deletePlayer result:", ok);
  } catch (e: any) {
    console.error("FAILED:", e.message);
    console.error("constraint:", e.constraint);
    console.error("table:", e.table);
    console.error("detail:", e.detail);
    console.error("code:", e.code);
  }
  process.exit(0);
})();
