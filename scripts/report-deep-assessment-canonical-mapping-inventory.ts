/**
 * Emits a complete, stable Deep Assessment-to-canonical inventory.
 *
 * This is a report, not a mapping authoring tool. It only compares active
 * runtime source keys against exact source_skill_id bindings in the frozen
 * canonical configuration.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../server/db";
import {
  getDeepAssessmentCanonicalMappingInventory,
  type DeepAssessmentMappingStatus,
} from "../server/services/deep-assessment-canonical-mapping-service";
import { getFrozenCanonicalProgressionVersions } from "../server/services/canonical-progression-service";

function readOutputPath(args: string[]) {
  const flagIndex = args.indexOf("--output");
  if (flagIndex === -1) return null;
  const output = args[flagIndex + 1];
  if (!output || output.startsWith("--")) {
    throw new Error("--output requires a relative file path");
  }
  const resolved = path.resolve(process.cwd(), output);
  if (!resolved.startsWith(`${process.cwd()}${path.sep}`)) {
    throw new Error("--output must remain inside the workspace");
  }
  return resolved;
}

async function run() {
  const entries = await getDeepAssessmentCanonicalMappingInventory();
  const groups = (status: DeepAssessmentMappingStatus) =>
    entries.filter((entry) => entry.status === status);
  const report = {
    formatVersion: "phase-3c-deep-assessment-canonical-inventory.v1",
    canonicalBenchmarkConfigVersion: getFrozenCanonicalProgressionVersions().benchmarkConfigVersion,
    summary: {
      activeKeys: entries.length,
      provenMappings: groups("PROVEN").length,
      ambiguousMappings: groups("AMBIGUOUS").length,
      unmappedKeys: groups("UNMAPPED").length,
    },
    provenMappings: groups("PROVEN"),
    ambiguousMappings: groups("AMBIGUOUS"),
    unmappedKeys: groups("UNMAPPED"),
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = readOutputPath(process.argv.slice(2));
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, "utf8");
    console.log(`[deep-assessment-inventory] wrote ${path.relative(process.cwd(), outputPath)}`);
  } else {
    process.stdout.write(json);
  }
}

run()
  .catch((error) => {
    console.error("[deep-assessment-inventory] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });