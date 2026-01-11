import { seedGlowLevelingOS } from "./glow-leveling-os";

async function main() {
  try {
    await seedGlowLevelingOS();
    console.log("Done!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
