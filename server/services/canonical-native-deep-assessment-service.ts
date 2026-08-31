/**
 * Canonical-native Deep Assessment capture boundary.
 *
 * This path is intentionally separate from legacy Deep Assessment records:
 * clients submit explicit frozen canonical identifiers, while this service
 * validates and snapshots their exact Ability-bearing binding server-side.
 */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  canonicalBenchmarkComponents,
  canonicalBenchmarkDefinitions,
  canonicalNativeDeepAssessmentObservations,
  canonicalSkillDefinitions,
  coaches,
  evidenceConfigVersions,
  playerCanonicalProgression,
  players,
  type CanonicalNativeDeepAssessmentObservation,
} from "@shared/schema";
import { DeepAssessmentPersistenceError } from "./deep-assessment-trusted-observation-service";
import { getFrozenCanonicalProgressionVersions } from "./canonical-progression-frozen-config";

export const CANONICAL_NATIVE_DEEP_ASSESSMENT_SOURCE_SYSTEM = "canonical_native_deep_assessment";
// Quality remains wholly governed by the already-frozen Phase 2 protocol
// vocabulary. Canonical-native provenance is expressed by sourceSystem/table,
// not by widening the frozen sourceType configuration.
export const CANONICAL_NATIVE_DEEP_ASSESSMENT_SOURCE_TYPE = "COACH_DEEP_ASSESSMENT";
const OBSERVATION_PREFIX = "canonical_native_deep_assessment_observation:";

export function canonicalNativeDeepAssessmentObservationReference(id: string): string {
  return `${OBSERVATION_PREFIX}${id}`;
}

export type CanonicalNativeDeepAssessmentScope = {
  academyId: string;
  playerId: string;
  coachId: string | null | undefined;
};

type ResolvedCanonicalNativeDeepAssessmentScope =
  Omit<CanonicalNativeDeepAssessmentScope, "coachId"> & { coachId: string };

type CanonicalNativeCapture = {
  captureId: string;
  benchmarkId: string;
  canonicalSkillId: string;
  componentKey: string;
  underlyingEventOrSessionId: string;
  observationWindow: string;
  observedRequiredObservations: number;
  requiredObservations: number;
  occurredAt: Date;
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function assertString(value: unknown, label: string, maxLength = 300): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_CANONICAL_NATIVE_CAPTURE",
      `${label} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value;
}

function normalizeCapture(raw: unknown): CanonicalNativeCapture {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DeepAssessmentPersistenceError("INVALID_CANONICAL_NATIVE_CAPTURE", "Capture must be an object");
  }
  const input = raw as Record<string, unknown>;
  const forbidden = [
    "academyId", "playerId", "coachId", "verifiedObserverIds", "sourceSystem",
    "sourceType", "benchmarkDefinitionId", "taxonomyConfigVersion",
    "benchmarkConfigVersion", "evidenceConfigVersion", "strengthModelVersion",
    "glowConfigVersion", "benchmarkRelevance",
  ];
  if (forbidden.some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
    throw new DeepAssessmentPersistenceError(
      "CLIENT_SCOPE_FIELDS_FORBIDDEN",
      "Canonical-native capture cannot supply scope, observer, source, frozen-version, or server binding fields",
    );
  }
  const occurredAt = new Date(String(input.occurredAt ?? ""));
  if (
    !Number.isInteger(input.observedRequiredObservations)
    || !Number.isInteger(input.requiredObservations)
    || (input.requiredObservations as number) <= 0
    || (input.observedRequiredObservations as number) < (input.requiredObservations as number)
    || Number.isNaN(occurredAt.getTime())
    || occurredAt.getTime() > Date.now() + 60_000
  ) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_CANONICAL_NATIVE_OBSERVATION",
      "Capture requires a non-future timestamp and complete positive observation counts",
    );
  }
  return {
    captureId: assertString(input.captureId, "captureId", 128),
    benchmarkId: assertString(input.benchmarkId, "benchmarkId"),
    canonicalSkillId: assertString(input.canonicalSkillId, "canonicalSkillId"),
    componentKey: assertString(input.componentKey, "componentKey"),
    underlyingEventOrSessionId: assertString(input.underlyingEventOrSessionId, "underlyingEventOrSessionId"),
    observationWindow: assertString(input.observationWindow, "observationWindow"),
    observedRequiredObservations: input.observedRequiredObservations as number,
    requiredObservations: input.requiredObservations as number,
    occurredAt,
  };
}

async function assertScope(tx: any, scope: ResolvedCanonicalNativeDeepAssessmentScope) {
  const [[player], [coach]] = await Promise.all([
    tx.select({ academyId: players.academyId }).from(players).where(eq(players.id, scope.playerId)).limit(1),
    tx.select({ academyId: coaches.academyId }).from(coaches).where(eq(coaches.id, scope.coachId)).limit(1),
  ]);
  if (!player || !coach || player.academyId !== scope.academyId || coach.academyId !== scope.academyId) {
    throw new DeepAssessmentPersistenceError(
      "CANONICAL_NATIVE_CAPTURE_SCOPE_FORBIDDEN",
      "Canonical-native capture actor and player must both belong to the authenticated academy",
      403,
    );
  }
}

async function resolveActiveAbilityBinding(
  tx: any,
  value: Pick<CanonicalNativeCapture, "benchmarkId" | "canonicalSkillId" | "componentKey">,
) {
  const versions = getFrozenCanonicalProgressionVersions();
  const [binding] = await tx.select({
    benchmarkDefinitionId: canonicalBenchmarkDefinitions.id,
  }).from(canonicalBenchmarkDefinitions)
    .innerJoin(
      canonicalBenchmarkComponents,
      eq(canonicalBenchmarkComponents.benchmarkDefinitionId, canonicalBenchmarkDefinitions.id),
    )
    .innerJoin(
      canonicalSkillDefinitions,
      eq(canonicalSkillDefinitions.id, canonicalBenchmarkComponents.canonicalSkillId),
    )
    .where(and(
      eq(canonicalBenchmarkDefinitions.benchmarkId, value.benchmarkId),
      eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, versions.benchmarkConfigVersion),
      eq(canonicalBenchmarkDefinitions.taxonomyConfigVersion, versions.taxonomyConfigVersion),
      eq(canonicalBenchmarkDefinitions.classification, "ABILITY_BENCHMARK"),
      eq(canonicalBenchmarkComponents.canonicalSkillId, value.canonicalSkillId),
      eq(canonicalBenchmarkComponents.componentKey, value.componentKey),
      eq(canonicalBenchmarkComponents.isAbilityBearing, true),
      eq(canonicalSkillDefinitions.isAbilityBearing, true),
      eq(canonicalSkillDefinitions.taxonomyConfigVersion, versions.taxonomyConfigVersion),
    ))
    .limit(1);
  if (!binding) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_CANONICAL_NATIVE_ABILITY_BINDING",
      "Capture target must be one exact active frozen Ability-bearing benchmark component",
      422,
    );
  }
  return { binding, versions };
}

async function assertFrozenPlayerState(
  tx: any,
  scope: Pick<CanonicalNativeDeepAssessmentScope, "academyId" | "playerId">,
  versions: ReturnType<typeof getFrozenCanonicalProgressionVersions>,
) {
  const [[state], [activeEvidence]] = await Promise.all([
    tx.select({ playerId: playerCanonicalProgression.playerId }).from(playerCanonicalProgression)
      .where(and(
        eq(playerCanonicalProgression.playerId, scope.playerId),
        eq(playerCanonicalProgression.academyId, scope.academyId),
        eq(playerCanonicalProgression.taxonomyConfigVersion, versions.taxonomyConfigVersion),
        eq(playerCanonicalProgression.benchmarkConfigVersion, versions.benchmarkConfigVersion),
        eq(playerCanonicalProgression.evidenceConfigVersion, versions.evidenceConfigVersion),
        eq(playerCanonicalProgression.strengthModelVersion, versions.strengthModelVersion),
        eq(playerCanonicalProgression.glowConfigVersion, versions.glowConfigVersion),
      )).limit(1),
    tx.select({ version: evidenceConfigVersions.version }).from(evidenceConfigVersions)
      .where(and(
        eq(evidenceConfigVersions.version, versions.evidenceConfigVersion),
        eq(evidenceConfigVersions.isActive, true),
      )).limit(1),
  ]);
  if (!state || !activeEvidence) {
    throw new DeepAssessmentPersistenceError(
      "CANONICAL_NATIVE_FROZEN_STATE_REQUIRED",
      "Canonical-native capture requires the target's active frozen canonical configuration",
      409,
    );
  }
}

export async function persistCanonicalNativeDeepAssessment(
  scope: CanonicalNativeDeepAssessmentScope,
  rawCapture: unknown,
): Promise<CanonicalNativeDeepAssessmentObservation> {
  const coachId = scope.coachId;
  if (!coachId) {
    throw new DeepAssessmentPersistenceError(
      "AUTHENTICATED_COACH_REQUIRED",
      "Canonical-native capture requires an authenticated coach",
      403,
    );
  }
  const resolvedScope: ResolvedCanonicalNativeDeepAssessmentScope = { ...scope, coachId };
  const capture = normalizeCapture(rawCapture);
  const payloadHash = hash({
    version: 1,
    capture: { ...capture, occurredAt: capture.occurredAt.toISOString() },
  });
  const idempotencyKey = hash({
    version: 1,
    scope: [scope.academyId, scope.playerId, coachId],
    captureId: capture.captureId,
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
    const [existing] = await tx.select().from(canonicalNativeDeepAssessmentObservations)
      .where(and(
        eq(canonicalNativeDeepAssessmentObservations.academyId, scope.academyId),
        eq(canonicalNativeDeepAssessmentObservations.playerId, scope.playerId),
        eq(canonicalNativeDeepAssessmentObservations.coachId, coachId),
        eq(canonicalNativeDeepAssessmentObservations.captureId, capture.captureId),
      )).limit(1);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new DeepAssessmentPersistenceError(
          "CAPTURE_ID_REUSE_CONFLICT",
          "captureId was already used for a different canonical-native capture",
          409,
        );
      }
      return existing;
    }

    await assertScope(tx, resolvedScope);
    const { binding, versions } = await resolveActiveAbilityBinding(tx, capture);
    await assertFrozenPlayerState(tx, scope, versions);
    const [saved] = await tx.insert(canonicalNativeDeepAssessmentObservations).values({
      idempotencyKey,
      academyId: scope.academyId,
      playerId: scope.playerId,
      coachId,
      captureId: capture.captureId,
      payloadHash,
      benchmarkDefinitionId: binding.benchmarkDefinitionId,
      benchmarkId: capture.benchmarkId,
      canonicalSkillId: capture.canonicalSkillId,
      componentKey: capture.componentKey,
      ...versions,
      sourceSystem: CANONICAL_NATIVE_DEEP_ASSESSMENT_SOURCE_SYSTEM,
      underlyingEventOrSessionId: capture.underlyingEventOrSessionId,
      observationWindow: capture.observationWindow,
      sourceType: CANONICAL_NATIVE_DEEP_ASSESSMENT_SOURCE_TYPE,
      observedRequiredObservations: capture.observedRequiredObservations,
      requiredObservations: capture.requiredObservations,
      occurredAt: capture.occurredAt,
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
      verifiedObserverIds: [coachId],
    }).returning();
    if (!saved) {
      throw new DeepAssessmentPersistenceError("CANONICAL_NATIVE_CAPTURE_SAVE_FAILED", "Unable to save canonical-native capture", 500);
    }
    return saved;
  });
}

/**
 * Historical native snapshots are eligible only while every frozen binding,
 * target owner, observer, source field, and active-version invariant still
 * holds. Invalid rows are ignored by Phase 3A and rejected by Phase 2.
 */
export async function getRevalidatedCanonicalNativeObservationIds(
  tx: any,
  observations: CanonicalNativeDeepAssessmentObservation[],
): Promise<Set<string>> {
  if (!observations.length) return new Set<string>();
  const versions = getFrozenCanonicalProgressionVersions();
  const [activeEvidence] = await tx.select({ version: evidenceConfigVersions.version })
    .from(evidenceConfigVersions)
    .where(and(
      eq(evidenceConfigVersions.version, versions.evidenceConfigVersion),
      eq(evidenceConfigVersions.isActive, true),
    )).limit(1);
  if (!activeEvidence) return new Set<string>();

  const eligible = new Set<string>();
  for (const observation of observations) {
    if (
      observation.sourceSystem !== CANONICAL_NATIVE_DEEP_ASSESSMENT_SOURCE_SYSTEM
      || observation.sourceType !== CANONICAL_NATIVE_DEEP_ASSESSMENT_SOURCE_TYPE
      || observation.benchmarkRelevance !== "EXACT_BENCHMARK_COMPONENT"
      || observation.observedRequiredObservations < observation.requiredObservations
      || observation.requiredObservations <= 0
      || !observation.verifiedObserverIds?.includes(observation.coachId)
      || observation.taxonomyConfigVersion !== versions.taxonomyConfigVersion
      || observation.benchmarkConfigVersion !== versions.benchmarkConfigVersion
      || observation.evidenceConfigVersion !== versions.evidenceConfigVersion
      || observation.strengthModelVersion !== versions.strengthModelVersion
      || observation.glowConfigVersion !== versions.glowConfigVersion
    ) continue;
    const [[player], [coach], [state], [binding]] = await Promise.all([
      tx.select({ academyId: players.academyId }).from(players).where(eq(players.id, observation.playerId)).limit(1),
      tx.select({ academyId: coaches.academyId }).from(coaches).where(eq(coaches.id, observation.coachId)).limit(1),
      tx.select({ playerId: playerCanonicalProgression.playerId }).from(playerCanonicalProgression).where(and(
        eq(playerCanonicalProgression.playerId, observation.playerId),
        eq(playerCanonicalProgression.academyId, observation.academyId),
        eq(playerCanonicalProgression.taxonomyConfigVersion, versions.taxonomyConfigVersion),
        eq(playerCanonicalProgression.benchmarkConfigVersion, versions.benchmarkConfigVersion),
        eq(playerCanonicalProgression.evidenceConfigVersion, versions.evidenceConfigVersion),
        eq(playerCanonicalProgression.strengthModelVersion, versions.strengthModelVersion),
        eq(playerCanonicalProgression.glowConfigVersion, versions.glowConfigVersion),
      )).limit(1),
      tx.select({ id: canonicalBenchmarkDefinitions.id }).from(canonicalBenchmarkDefinitions)
        .innerJoin(canonicalBenchmarkComponents, eq(canonicalBenchmarkComponents.benchmarkDefinitionId, canonicalBenchmarkDefinitions.id))
        .innerJoin(canonicalSkillDefinitions, eq(canonicalSkillDefinitions.id, canonicalBenchmarkComponents.canonicalSkillId))
        .where(and(
          eq(canonicalBenchmarkDefinitions.id, observation.benchmarkDefinitionId),
          eq(canonicalBenchmarkDefinitions.benchmarkId, observation.benchmarkId),
          eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, versions.benchmarkConfigVersion),
          eq(canonicalBenchmarkDefinitions.taxonomyConfigVersion, versions.taxonomyConfigVersion),
          eq(canonicalBenchmarkDefinitions.classification, "ABILITY_BENCHMARK"),
          eq(canonicalBenchmarkComponents.canonicalSkillId, observation.canonicalSkillId),
          eq(canonicalBenchmarkComponents.componentKey, observation.componentKey),
          eq(canonicalBenchmarkComponents.isAbilityBearing, true),
          eq(canonicalSkillDefinitions.isAbilityBearing, true),
          eq(canonicalSkillDefinitions.taxonomyConfigVersion, versions.taxonomyConfigVersion),
        )).limit(1),
    ]);
    if (player?.academyId === observation.academyId && coach?.academyId === observation.academyId && state && binding) {
      eligible.add(observation.id);
    }
  }
  return eligible;
}