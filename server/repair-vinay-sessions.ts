import { db } from "./db";
import { sessions, sessionPlayers, coachingSeries } from "@shared/schema";
import { eq } from "drizzle-orm";

async function rebuild() {
  console.log("=== REBUILD: Recreating Vinay's sessions ===\n");
  
  const vinayId = "e2544a8a-d66e-4035-ba15-9bc8e2645c30";
  const seriesKey = "e024fd1f-cb1b-48fd-b294-c9251402bd90";
  
  const seriesInfo = await db.select().from(coachingSeries).where(eq(coachingSeries.id, seriesKey));
  if (seriesInfo.length === 0) {
    console.log("Series not found!");
    process.exit(1);
  }
  const si = seriesInfo[0];
  console.log(`Series: ${si.title}`);
  console.log(`Coach: ${si.coachId} | Start: ${si.seriesStartDate} | End: ${si.seriesEndDate}`);
  console.log(`Day: ${si.dayOfWeek} | Time: ${si.startTime} | Duration: ${si.duration}min`);
  
  // Check existing sessions
  const existing = await db.select().from(sessions).where(eq(sessions.seriesId, seriesKey));
  console.log(`\nExisting sessions: ${existing.length}`);
  
  if (existing.length > 0) {
    console.log("Sessions already exist - skipping to avoid duplicates");
    process.exit(0);
  }
  
  // Generate Saturday dates
  const startDate = new Date(si.seriesStartDate!);
  const endDate = new Date(si.seriesEndDate!);
  
  const saturdays: string[] = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    if (d.getDay() === si.dayOfWeek!) {
      saturdays.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() + 1);
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  const pastDates = saturdays.filter(d => d < todayStr);
  const futureDates = saturdays.filter(d => d >= todayStr);
  
  console.log(`\nSaturdays to create: ${saturdays.length}`);
  console.log(`  Past (completed): ${pastDates.length}`);
  console.log(`  Future (scheduled): ${futureDates.length}`);
  
  if (!process.argv.includes("--fix")) {
    console.log("\nRun with --fix to create the sessions");
    process.exit(0);
  }
  
  console.log("\n=== CREATING SESSIONS ===");
  
  const timeStr = si.startTime!; // "12:00"
  const [hours, minutes] = timeStr.split(":").map(Number);
  const durationMin = si.duration || 60;
  
  let created = 0;
  for (const dateStr of saturdays) {
    const isPast = dateStr < todayStr;
    
    // Create start/end timestamps
    const startTs = new Date(`${dateStr}T${timeStr}:00.000Z`);
    const endTs = new Date(startTs.getTime() + durationMin * 60 * 1000);
    
    const [newSession] = await db.insert(sessions).values({
      seriesId: seriesKey,
      academyId: si.academyId,
      coachId: si.coachId,
      courtId: si.courtId,
      startTime: startTs,
      endTime: endTs,
      duration: durationMin,
      sessionType: si.sessionType!,
      ballLevel: si.ballLevel,
      maxPlayers: si.maxPlayers,
      xpReward: si.xpPerSession || 20,
      vibe: si.vibe,
      status: isPast ? "completed" : "scheduled",
    }).returning();
    
    await db.insert(sessionPlayers).values({
      sessionId: newSession.id,
      playerId: vinayId,
      attendanceStatus: isPast ? "present" : null,
      xpAwarded: isPast ? (si.xpPerSession || 20) : null,
    });
    
    created++;
  }
  
  console.log(`Sessions created: ${created}`);
  console.log(`Session player records created: ${created}`);
  
  // Verify
  const verifyCount = await db.select().from(sessions).where(eq(sessions.seriesId, seriesKey));
  console.log(`\nVerification - sessions in DB: ${verifyCount.length}`);
  
  console.log("\n=== REBUILD COMPLETE ===");
  process.exit(0);
}

rebuild().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
