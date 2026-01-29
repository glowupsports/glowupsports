import { db } from './server/db';
import { players, creditTransactions, sessionPlayers, sessions, packages } from './shared/schema';
import { eq, and, ilike, desc } from 'drizzle-orm';

async function checkPlayer(searchName: string) {
  console.log(`\n=== Searching for "${searchName}" ===\n`);
  
  // Search for player
  const playerResults = await db.select({
    id: players.id,
    name: players.name,
    email: players.email,
  })
  .from(players)
  .where(ilike(players.name, `%${searchName}%`))
  .limit(5);
  
  if (playerResults.length === 0) {
    console.log("No players found");
    return;
  }
  
  for (const player of playerResults) {
    console.log(`\nPlayer: ${player.name} (${player.id})`);
    console.log(`Email: ${player.email}`);
    
    // Get credit transactions
    const transactions = await db.select()
      .from(creditTransactions)
      .where(eq(creditTransactions.playerId, player.id))
      .orderBy(desc(creditTransactions.createdAt));
    
    // Summarize by type
    const summary = { group: 0, semi_private: 0, private: 0, other: 0 };
    for (const tx of transactions) {
      const type = tx.creditType || 'other';
      if (type in summary) {
        summary[type as keyof typeof summary] += tx.amount;
      } else {
        summary.other += tx.amount;
      }
    }
    
    console.log(`\nCredit Balance by Type:`);
    console.log(`  Group: ${summary.group}`);
    console.log(`  Semi-Private: ${summary.semi_private}`);
    console.log(`  Private: ${summary.private}`);
    
    // Count attended sessions by type
    const attendedSessions = await db.select({
      sessionType: sessions.sessionType,
    })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
    .where(and(
      eq(sessionPlayers.playerId, player.id),
      eq(sessionPlayers.attendanceStatus, "present")
    ));
    
    const sessionsByType = { group: 0, semi_private: 0, private: 0 };
    for (const s of attendedSessions) {
      if (s.sessionType.includes("semi")) sessionsByType.semi_private++;
      else if (s.sessionType.includes("group")) sessionsByType.group++;
      else sessionsByType.private++;
    }
    
    console.log(`\nAttended Sessions by Type:`);
    console.log(`  Group: ${sessionsByType.group}`);
    console.log(`  Semi-Private: ${sessionsByType.semi_private}`);
    console.log(`  Private: ${sessionsByType.private}`);
    console.log(`  Total: ${attendedSessions.length}`);
    
    // Check for mismatch
    console.log(`\nMismatch Analysis:`);
    console.log(`  Semi-Private sessions: ${sessionsByType.semi_private}, balance: ${summary.semi_private}`);
    if (sessionsByType.semi_private > 0 && summary.semi_private >= 0) {
      console.log(`  ⚠️ MISMATCH: Player attended ${sessionsByType.semi_private} semi-private sessions but has ${summary.semi_private} balance (should be negative)`);
    }
    
    // Get packages
    const playerPkgs = await db.select()
      .from(packages)
      .where(eq(packages.playerId, player.id));
    
    console.log(`\nPackages: ${playerPkgs.length} total`);
    for (const pkg of playerPkgs) {
      console.log(`  - ${pkg.name || 'Unnamed'}: ${pkg.creditType}, ${pkg.remainingCredits}/${pkg.totalCredits} credits, status: ${pkg.status}`);
    }
  }
}

// Run
checkPlayer('aisha').then(() => checkPlayer('kthbers')).then(() => process.exit(0));
