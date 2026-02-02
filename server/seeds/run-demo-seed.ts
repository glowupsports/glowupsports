import { seedDemoDataForTheLaw } from "./demo-data-seed";

async function main() {
  console.log("Running demo data seed for TheLaw...");
  const result = await seedDemoDataForTheLaw();
  console.log("Result:", JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
