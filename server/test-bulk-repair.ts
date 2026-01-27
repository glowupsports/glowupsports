import { repairAllPlayerCredits } from "./storage";

async function main() {
  console.log("[Test] Starting bulk repair test...");
  
  try {
    const result = await repairAllPlayerCredits();
    console.log("\n=== BULK REPAIR RESULTS ===");
    console.log(`Total processed: ${result.processed}`);
    console.log(`Credits consumed: ${result.consumed}`);
    console.log(`Debts created: ${result.debts}`);
    console.log(`Already processed: ${result.alreadyProcessed}`);
    console.log(`Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    }
    
    console.log("\n=== TEST COMPLETE ===");
  } catch (error) {
    console.error("Bulk repair failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
