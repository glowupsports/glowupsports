/**
 * Credit System V3 Migration
 * 
 * This script:
 * 1. Clears all credit_transactions (corrupted data)
 * 2. Recalculates package remainingCredits based on actual attendance
 * 3. Creates clean debt records for attended sessions without credits
 */

import { db } from "./db";
import { 
  creditTransactions, 
  packages, 
  sessionPlayers, 
  sessions,
  players
} from "../shared/schema";
import { eq, and, inArray, isNotNull, sql } from "drizzle-orm";

interface MigrationResult {
  packagesProcessed: number;
  packagesUpdated: number;
  debtsCreated: number;
  transactionsCleared: number;
  errors: string[];
}

export async function migrateToV3(): Promise<MigrationResult> {
  const result: MigrationResult = {
    packagesProcessed: 0,
    packagesUpdated: 0,
    debtsCreated: 0,
    transactionsCleared: 0,
    errors: [],
  };

  console.log("\n========================================");
  console.log("CREDIT SYSTEM V3 MIGRATION");
  console.log("========================================\n");

  try {
    // Step 1: Count and clear all credit_transactions
    console.log("[V3] Step 1: Clearing all credit_transactions...");
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(creditTransactions);
    const totalTransactions = Number(countResult[0]?.count || 0);
    
    await db.delete(creditTransactions);
    result.transactionsCleared = totalTransactions;
    console.log(`[V3] Cleared ${totalTransactions} credit transactions`);

    // Step 2: Get all players with their attended sessions
    console.log("\n[V3] Step 2: Calculating attendance per player...");
    
    // Get all attended session_players using raw SQL to avoid enum issues
    const attendedSessionPlayers = await db.execute(sql`
      SELECT * FROM session_players WHERE attendance_status = 'present'
    `);
    
    const attendedRows = attendedSessionPlayers.rows as any[];
    console.log(`[V3] Found ${attendedRows.length} attended session_player records`);
    
    // Get session details for each
    const sessionIds = [...new Set(attendedRows.map(sp => sp.session_id).filter(Boolean))];
    const sessionsData = sessionIds.length > 0 
      ? await db.select().from(sessions).where(inArray(sessions.id, sessionIds as string[]))
      : [];
    
    const sessionMap = new Map(sessionsData.map(s => [s.id, s]));
    
    // Combine data
    const attendedSessions = attendedRows.map(sp => {
      const session = sessionMap.get(sp.session_id || "");
      return {
        playerId: sp.player_id,
        sessionId: sp.session_id,
        academyId: session?.academyId || "default-academy",
        sessionType: session?.sessionType || "group",
        creditType: session?.creditType || session?.sessionType || "group",
      };
    });

    console.log(`[V3] Found ${attendedSessions.length} attended session records`);

    // Group by player and credit type
    const playerAttendance: Record<string, Record<string, { count: number; academyId: string }>> = {};
    
    for (const record of attendedSessions) {
      if (!record.playerId) continue;
      
      // Determine credit type (use creditType if set, otherwise derive from sessionType)
      let creditType = record.creditType || record.sessionType || "group";
      // Normalize credit type
      if (creditType === "private_adjusted") creditType = "private";
      if (creditType === "semi_private_adjusted") creditType = "semi_private";
      
      if (!playerAttendance[record.playerId]) {
        playerAttendance[record.playerId] = {};
      }
      if (!playerAttendance[record.playerId][creditType]) {
        playerAttendance[record.playerId][creditType] = { count: 0, academyId: record.academyId || "default-academy" };
      }
      playerAttendance[record.playerId][creditType].count++;
    }

    console.log(`[V3] Calculated attendance for ${Object.keys(playerAttendance).length} players`);

    // Step 3: Get all active packages and recalculate remaining credits
    console.log("\n[V3] Step 3: Recalculating package remaining credits...");
    
    const allPackages = await db.select().from(packages).where(eq(packages.status, "active"));
    console.log(`[V3] Found ${allPackages.length} active packages`);

    // Group packages by player and credit type, sorted by purchase date (oldest first)
    const playerPackages: Record<string, Record<string, typeof allPackages>> = {};
    
    for (const pkg of allPackages) {
      if (!pkg.playerId) continue;
      const creditType = pkg.creditType || "group";
      
      if (!playerPackages[pkg.playerId]) {
        playerPackages[pkg.playerId] = {};
      }
      if (!playerPackages[pkg.playerId][creditType]) {
        playerPackages[pkg.playerId][creditType] = [];
      }
      playerPackages[pkg.playerId][creditType].push(pkg);
    }

    // Sort each player's packages by purchase date (oldest first)
    for (const playerId of Object.keys(playerPackages)) {
      for (const creditType of Object.keys(playerPackages[playerId])) {
        playerPackages[playerId][creditType].sort((a, b) => {
          const dateA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
          const dateB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
          return dateA - dateB;
        });
      }
    }

    // Step 4: For each player, deduct attendance from packages and create debts
    console.log("\n[V3] Step 4: Processing each player...");
    
    for (const playerId of Object.keys(playerAttendance)) {
      for (const creditType of Object.keys(playerAttendance[playerId])) {
        const attendance = playerAttendance[playerId][creditType];
        let sessionsToDeduct = attendance.count;
        
        // Get packages for this player and credit type
        const pkgs = playerPackages[playerId]?.[creditType] || [];
        
        // Deduct from packages (oldest first)
        for (const pkg of pkgs) {
          if (sessionsToDeduct <= 0) break;
          
          const available = pkg.totalCredits; // Reset to total, we'll calculate remaining
          const toDeduct = Math.min(sessionsToDeduct, available);
          const newRemaining = pkg.totalCredits - toDeduct;
          
          // Update package
          await db.update(packages)
            .set({ 
              remainingCredits: newRemaining,
              status: newRemaining <= 0 ? "depleted" : "active",
            })
            .where(eq(packages.id, pkg.id));
          
          result.packagesUpdated++;
          sessionsToDeduct -= toDeduct;
          
          console.log(`[V3] Package ${pkg.id.slice(0, 8)}: ${pkg.totalCredits} -> ${newRemaining} remaining (deducted ${toDeduct})`);
        }
        
        // If still sessions left to deduct, create debt
        if (sessionsToDeduct > 0) {
          // Create ONE debt transaction for all remaining
          await db.insert(creditTransactions).values({
            id: crypto.randomUUID(),
            playerId,
            academyId: attendance.academyId,
            packageId: null,
            type: "debit",
            creditType,
            amount: -sessionsToDeduct,
            reason: "session_debt",
            balance: -sessionsToDeduct,
            metadata: {
              migratedFromV3: true,
              attendedWithoutCredits: sessionsToDeduct,
              migratedAt: new Date().toISOString(),
            },
            createdAt: new Date(),
          });
          
          result.debtsCreated++;
          console.log(`[V3] Created debt for player ${playerId.slice(0, 8)}: ${sessionsToDeduct} ${creditType} sessions without credits`);
        }
      }
      result.packagesProcessed++;
    }

    // Step 5: Reset session_players creditDeductedAt to mark them as processed
    console.log("\n[V3] Step 5: Marking all attended sessions as credit-processed...");
    
    await db.execute(sql`
      UPDATE session_players 
      SET credit_deducted_at = NOW(), credit_transaction_id = 'v3-migration'
      WHERE attendance_status = 'present'
    `);

    console.log("\n========================================");
    console.log("MIGRATION COMPLETE");
    console.log("========================================");
    console.log(`Transactions cleared: ${result.transactionsCleared}`);
    console.log(`Players processed: ${result.packagesProcessed}`);
    console.log(`Packages updated: ${result.packagesUpdated}`);
    console.log(`Debts created: ${result.debtsCreated}`);
    console.log("========================================\n");

  } catch (error: any) {
    console.error("[V3] Migration error:", error);
    result.errors.push(error.message);
  }

  return result;
}

// Run if executed directly
if (require.main === module) {
  migrateToV3()
    .then(result => {
      console.log("Final result:", JSON.stringify(result, null, 2));
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
