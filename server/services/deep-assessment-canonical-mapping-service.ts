/**
 * Deterministic inventory and binding rules for Deep Assessment.
 *
 * The runtime Deep Assessment source key must exactly equal a source_skill_id
 * in the frozen canonical crosswalk. This module intentionally does not look
 * at display names, scores, notes, or legacy assessment data.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  canonicalBenchmarkComponents,
  canonicalBenchmarkDefinitions,
  canonicalSkillDefinitions,
  deepAssessmentSkills,
  playerDeepAssessments,
} from "@shared/schema";
import { getFrozenCanonicalBenchmarkConfigVersion } from "./canonical-progression-frozen-config";

export type DeepAssessmentMappingStatus = "PROVEN" | "AMBIGUOUS" | "UNMAPPED";

export type DeepAssessmentCanonicalCandidate = {
  benchmarkId: string;
  classification: string;
  componentKey: string | null;
  canonicalSkillId: string | null;
  componentAbilityBearing: boolean;
  canonicalSkillAbilityBearing: boolean;
  mappingReason: string | null;
};

export type ProvenDeepAssessmentBinding = {
  benchmarkId: string;
  canonicalSkillId: string;
};

export type DeepAssessmentMappingInventoryEntry = {
  deepAssessmentSkillId: string;
  skillKey: string;
  pillar: string;
  category: string;
  skillName: string;
  status: DeepAssessmentMappingStatus;
  reason:
    | "EXACT_UNIQUE_ABILITY_BINDING"
    | "MULTIPLE_ABILITY_BINDINGS"
    | "EXACT_SOURCE_KEY_NOT_IN_FROZEN_CROSSWALK"
    | "NO_ABILITY_BEARING_CANONICAL_BINDING";
  binding: ProvenDeepAssessmentBinding | null;
  candidates: DeepAssessmentCanonicalCandidate[];
};

type MappingRow = {
  deepAssessmentSkillId: string;
  skillKey: string;
  pillar: string;
  category: string;
  skillName: string;
  benchmarkId: string | null;
  classification: string | null;
  componentKey: string | null;
  canonicalSkillId: string | null;
  componentAbilityBearing: boolean | null;
  canonicalSkillAbilityBearing: boolean | null;
  mappingReason: string | null;
};

/**
 * Pure classifier used both by the persisted inventory and regression tests.
 * A mapping is proven only when one exact source key has one distinct
 * Ability-bearing benchmark/atomic-skill pair in the frozen crosswalk.
 */
export function classifyDeepAssessmentCanonicalMapping(
  source: Pick<DeepAssessmentMappingInventoryEntry, "deepAssessmentSkillId" | "skillKey" | "pillar" | "category" | "skillName">,
  rows: Array<Omit<MappingRow, keyof typeof source>>,
): DeepAssessmentMappingInventoryEntry {
  const candidates = rows
    .filter((row): row is Omit<MappingRow, keyof typeof source> & { benchmarkId: string } => Boolean(row.benchmarkId))
    .map((row) => ({
      benchmarkId: row.benchmarkId,
      classification: row.classification ?? "UNKNOWN",
      componentKey: row.componentKey,
      canonicalSkillId: row.canonicalSkillId,
      componentAbilityBearing: row.componentAbilityBearing === true,
      canonicalSkillAbilityBearing: row.canonicalSkillAbilityBearing === true,
      mappingReason: row.mappingReason,
    }));

  const eligibleBindings = [...new Map(
    candidates
      .filter((candidate) =>
        candidate.classification === "ABILITY_BENCHMARK"
        && candidate.componentAbilityBearing
        && candidate.canonicalSkillAbilityBearing
        && candidate.canonicalSkillId,
      )
      .map((candidate) => [
        `${candidate.benchmarkId}|${candidate.canonicalSkillId}`,
        { benchmarkId: candidate.benchmarkId, canonicalSkillId: candidate.canonicalSkillId! },
      ]),
  ).values()];

  if (eligibleBindings.length === 1) {
    return {
      ...source,
      status: "PROVEN",
      reason: "EXACT_UNIQUE_ABILITY_BINDING",
      binding: eligibleBindings[0],
      candidates,
    };
  }
  if (eligibleBindings.length > 1) {
    return {
      ...source,
      status: "AMBIGUOUS",
      reason: "MULTIPLE_ABILITY_BINDINGS",
      binding: null,
      candidates,
    };
  }
  return {
    ...source,
    status: "UNMAPPED",
    reason: candidates.length === 0
      ? "EXACT_SOURCE_KEY_NOT_IN_FROZEN_CROSSWALK"
      : "NO_ABILITY_BEARING_CANONICAL_BINDING",
    binding: null,
    candidates,
  };
}

/**
 * Returns one inventory row per currently active Deep Assessment definition.
 * Canonical candidates are limited to the checked-in frozen config version.
 */
export async function getDeepAssessmentCanonicalMappingInventory(tx: any = db) {
  const benchmarkConfigVersion = getFrozenCanonicalBenchmarkConfigVersion();
  const rows = await tx.select({
    deepAssessmentSkillId: deepAssessmentSkills.id,
    skillKey: deepAssessmentSkills.skillKey,
    pillar: deepAssessmentSkills.pillar,
    category: deepAssessmentSkills.category,
    skillName: deepAssessmentSkills.skillName,
    benchmarkId: canonicalBenchmarkDefinitions.benchmarkId,
    classification: canonicalBenchmarkDefinitions.classification,
    componentKey: canonicalBenchmarkComponents.componentKey,
    canonicalSkillId: canonicalBenchmarkComponents.canonicalSkillId,
    componentAbilityBearing: canonicalBenchmarkComponents.isAbilityBearing,
    canonicalSkillAbilityBearing: canonicalSkillDefinitions.isAbilityBearing,
    mappingReason: canonicalBenchmarkComponents.mappingReason,
  }).from(deepAssessmentSkills)
    .leftJoin(
      canonicalBenchmarkDefinitions,
      and(
        eq(canonicalBenchmarkDefinitions.sourceSkillId, deepAssessmentSkills.skillKey),
        eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, benchmarkConfigVersion),
      ),
    )
    .leftJoin(
      canonicalBenchmarkComponents,
      eq(canonicalBenchmarkComponents.benchmarkDefinitionId, canonicalBenchmarkDefinitions.id),
    )
    .leftJoin(
      canonicalSkillDefinitions,
      eq(canonicalSkillDefinitions.id, canonicalBenchmarkComponents.canonicalSkillId),
    )
    .where(eq(deepAssessmentSkills.isActive, true))
    .orderBy(
      asc(deepAssessmentSkills.skillKey),
      asc(canonicalBenchmarkDefinitions.benchmarkId),
      asc(canonicalBenchmarkComponents.componentKey),
    ) as MappingRow[];

  const grouped = new Map<string, MappingRow[]>();
  for (const row of rows) {
    const entries = grouped.get(row.deepAssessmentSkillId) ?? [];
    entries.push(row);
    grouped.set(row.deepAssessmentSkillId, entries);
  }

  return [...grouped.values()].map((sourceRows) => {
    const [source] = sourceRows;
    return classifyDeepAssessmentCanonicalMapping({
      deepAssessmentSkillId: source.deepAssessmentSkillId,
      skillKey: source.skillKey,
      pillar: source.pillar,
      category: source.category,
      skillName: source.skillName,
    }, sourceRows.map((row) => ({
      benchmarkId: row.benchmarkId,
      classification: row.classification,
      componentKey: row.componentKey,
      canonicalSkillId: row.canonicalSkillId,
      componentAbilityBearing: row.componentAbilityBearing,
      canonicalSkillAbilityBearing: row.canonicalSkillAbilityBearing,
      mappingReason: row.mappingReason,
    })));
  });
}

/**
 * Revalidates stored observations against their original active Deep
 * Assessment source. This is deliberately stronger than checking only whether
 * a stored benchmark/component pair exists: a row is eligible only when the
 * exact source key still has the same unique frozen Ability binding.
 */
export async function getRevalidatedTrustedObservationIds(
  tx: any,
  observations: Array<{
    id: string;
    deepAssessmentId: string;
    playerId: string;
    academyId: string;
    benchmarkId: string;
    canonicalSkillId: string;
  }>,
): Promise<Set<string>> {
  if (!observations.length) return new Set<string>();
  const inventory = await getDeepAssessmentCanonicalMappingInventory(tx);
  const mappingsBySkillId = new Map<string, DeepAssessmentMappingInventoryEntry>(
    inventory.map((mapping): [string, DeepAssessmentMappingInventoryEntry] => [
      mapping.deepAssessmentSkillId,
      mapping,
    ]),
  );
  const assessmentRows: Array<{ id: string; skillId: string; playerId: string; academyId: string }> = await tx.select({
    id: playerDeepAssessments.id,
    skillId: playerDeepAssessments.skillId,
    playerId: playerDeepAssessments.playerId,
    academyId: playerDeepAssessments.academyId,
  }).from(playerDeepAssessments)
    .where(inArray(
      playerDeepAssessments.id,
      [...new Set(observations.map((observation) => observation.deepAssessmentId))],
    ));
  const assessmentById = new Map<string, { skillId: string; playerId: string; academyId: string }>(
    assessmentRows.map((assessment) => [assessment.id, {
      skillId: assessment.skillId,
      playerId: assessment.playerId,
      academyId: assessment.academyId,
    }]),
  );
  return new Set(observations.flatMap((observation) => {
    const assessment = assessmentById.get(observation.deepAssessmentId);
    const mapping = mappingsBySkillId.get(assessment?.skillId ?? "");
    return mapping?.status === "PROVEN"
      && assessment?.playerId === observation.playerId
      && assessment?.academyId === observation.academyId
      && mapping.binding?.benchmarkId === observation.benchmarkId
      && mapping.binding.canonicalSkillId === observation.canonicalSkillId
      ? [observation.id]
      : [];
  }));
}