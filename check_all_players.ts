import { db } from './server/db';
import { players, creditTransactions, sessionPlayers, sessions } from './shared/schema';
import { eq, and, ilike, desc, or } from 'drizzle-orm';

async function searchPlayers() {
  // Search for kthbers variations
  console.log("=== Searching for 'kth' ===");
  const kthResults = await db.select({
    id: players.id,
    name: players.name,
    email: players.email,
  })
  .from(players)
  .where(or(
    ilike(players.name, '%kth%'),
    ilike(players.email, '%kth%'),
    ilike(players.displayName, '%kth%')
  ))
  .limit(10);
  
  console.log(kthResults);
  
  // Also search for "kat" or "kathbers"
  console.log("\n=== Searching for 'kat' ===");
  const katResults = await db.select({
    id: players.id,
    name: players.name,
    email: players.email,
  })
  .from(players)
  .where(or(
    ilike(players.name, '%kat%'),
    ilike(players.email, '%kat%')
  ))
  .limit(10);
  
  console.log(katResults);
  
  // Search for "bert" or "bers"
  console.log("\n=== Searching for 'bers' ===");
  const bersResults = await db.select({
    id: players.id,
    name: players.name,
    email: players.email,
  })
  .from(players)
  .where(or(
    ilike(players.name, '%bers%'),
    ilike(players.email, '%bers%')
  ))
  .limit(10);
  
  console.log(bersResults);
}

searchPlayers().then(() => process.exit(0));
