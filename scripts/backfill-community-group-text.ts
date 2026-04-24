import { db } from "../server/db";
import { communityGroups, coachingSeries, academies } from "../shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { buildCommunityGroupTextForSeries } from "../server/utils/timezone";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const rows = await db
    .select({
      groupId: communityGroups.id,
      groupName: communityGroups.name,
      groupDescription: communityGroups.description,
      seriesId: coachingSeries.id,
      title: coachingSeries.title,
      sessionType: coachingSeries.sessionType,
      dayOfWeek: coachingSeries.dayOfWeek,
      startTime: coachingSeries.startTime,
      academyId: coachingSeries.academyId,
      timezone: academies.timezone,
    })
    .from(communityGroups)
    .innerJoin(coachingSeries, eq(coachingSeries.id, communityGroups.seriesId))
    .leftJoin(academies, eq(academies.id, coachingSeries.academyId))
    .where(isNotNull(communityGroups.seriesId));

  console.log(`Loaded ${rows.length} series-linked community groups`);

  let mismatches = 0;
  let updated = 0;

  for (const r of rows) {
    const tz = r.timezone || "Asia/Dubai";
    const expected = buildCommunityGroupTextForSeries(
      {
        title: r.title,
        sessionType: r.sessionType,
        dayOfWeek: r.dayOfWeek as number,
        startTime: r.startTime || "",
      },
      tz,
    );
    const nameMismatch = r.groupName !== expected.name;
    const descMismatch = (r.groupDescription || "") !== expected.description;
    if (!nameMismatch && !descMismatch) continue;
    mismatches++;
    console.log(
      `[mismatch] series=${r.seriesId} tz=${tz}\n  db.name        = ${JSON.stringify(r.groupName)}\n  expected.name  = ${JSON.stringify(expected.name)}\n  db.description = ${JSON.stringify(r.groupDescription)}\n  expected.desc  = ${JSON.stringify(expected.description)}`,
    );
    if (!dryRun) {
      await db
        .update(communityGroups)
        .set({
          name: expected.name,
          description: expected.description,
          updatedAt: new Date(),
        })
        .where(eq(communityGroups.id, r.groupId));
      updated++;
    }
  }

  console.log(
    `\nDone. mismatches=${mismatches} updated=${updated} dryRun=${dryRun}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
