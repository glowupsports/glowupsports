import { replayAcademy } from "./credit-replay";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { invalidateAcademyFlag } from "../server/services/credit-feature-flag";

(async () => {
  const academyId = "default-academy";
  const t0 = Date.now();
  console.log("[switch-v2] live replay starting...");
  const live = await replayAcademy(academyId, false);
  console.log(`[switch-v2] live stats (${Date.now() - t0}ms):`, JSON.stringify(live));
  if (live.errors > 0) {
    console.error("[switch-v2] errors > 0, aborting flag flip");
    process.exit(1);
  }
  await db.execute(sql`UPDATE academies SET use_new_credit_system = true WHERE id = ${academyId}`);
  invalidateAcademyFlag(academyId);
  console.log("[switch-v2] flag flipped to true");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
