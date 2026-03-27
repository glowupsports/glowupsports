import { seedQuestTemplates } from "./quest-templates-seed";

async function main() {
  console.log("Running quest templates seed...");
  const result = await seedQuestTemplates();
  console.log("Result:", JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
