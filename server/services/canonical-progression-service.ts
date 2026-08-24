/**
 * Phase 2 canonical progression core.
 *
 * This service is deliberately not wired to legacy writers or client UI. Future
 * adapters supply trusted observations; this is the sole canonical Ability
 * writer and owns validation, locking, calculation, history, and idempotency.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  academies,
  canonicalBenchmarkComponents,
  canonicalBenchmarkDefinitions,
  canonicalDecisionApplicationReceipts,
  canonicalDecisionSnapshots,
  canonicalEvidenceContributions,
  canonicalProgressionRejectedRequests,
  canonicalSkillDefinitions,
  deepAssessmentTrustedObservations,
  developmentDecisionEvidenceLinks,
  developmentDecisionExecutionAttempts,
  developmentDecisionValidations,
  developmentDecisions,
  evidenceConfigVersions,
  playerCanonicalProgression,
  playerCanonicalSkillHistory,
  playerCanonicalSkillStates,
  players,
  skillEvidence,
} from "@shared/schema";
import { canReviewEvidence, type ProgressionActor } from "../lib/progression-actor-policy";

const TAXONOMY_CONFIG_VERSION = "taxonomy-v1.0.0-final-freeze";
const STRENGTH_MODEL_VERSION = "strength-model-v1.0.1-final-freeze";
const GLOW_CONFIG_VERSION = "glow-config-v1.0.0-final-freeze";
const DEEP_ASSESSMENT_OBSERVATION_PREFIX = "deep_assessment_trusted_observation:";

export function deepAssessmentObservationReference(id: string): string {
  return `${DEEP_ASSESSMENT_OBSERVATION_PREFIX}${id}`;
}

async function resolveCanonicalEvidenceRefs(
  tx: any,
  evidenceRefs: string[],
  playerId: string,
  academyId: string,
) {
  const uniqueRefs = [...new Set(evidenceRefs)];
  const deepIds = uniqueRefs
    .filter((ref) => ref.startsWith(DEEP_ASSESSMENT_OBSERVATION_PREFIX))
    .map((ref) => ref.slice(DEEP_ASSESSMENT_OBSERVATION_PREFIX.length));
  const skillIds = uniqueRefs.filter((ref) => !ref.startsWith(DEEP_ASSESSMENT_OBSERVATION_PREFIX));
  const skillRows = skillIds.length ? await tx.select({
    id: skillEvidence.id,
    playerId: skillEvidence.playerId,
    academyId: players.academyId,
    eligible: skillEvidence.status,
  }).from(skillEvidence)
    .innerJoin(players, eq(players.id, skillEvidence.playerId))
    .where(inArray(skillEvidence.id, skillIds)) : [];
  const deepRows = deepIds.length ? await tx.select({
    id: deepAssessmentTrustedObservations.id,
    playerId: deepAssessmentTrustedObservations.playerId,
    academyId: deepAssessmentTrustedObservations.academyId,
  }).from(deepAssessmentTrustedObservations)
    .where(inArray(deepAssessmentTrustedObservations.id, deepIds)) : [];
  const resolved = [
    ...skillRows.map((row: any) => ({ ref: row.id, playerId: row.playerId, academyId: row.academyId, eligible: row.eligible === "approved" })),
    ...deepRows.map((row: any) => ({ ref: deepAssessmentObservationReference(row.id), playerId: row.playerId, academyId: row.academyId, eligible: true })),
  ];
  if (resolved.length !== uniqueRefs.length
    || resolved.some((row) => row.playerId !== playerId || row.academyId !== academyId)) {
    throw new CanonicalProgressionError("INVALID_EVIDENCE_OWNERSHIP", "Evidence must belong to the target player and academy", 403);
  }
  if (resolved.some((row) => !row.eligible)) {
    throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Only eligible evidence is valid for canonical progression", 422);
  }
}

type FreezeArtifact = {
  crosswalk: { version: string };
  evidence_config: any;
};

type CrosswalkArtifact = {
  version: string;
  canonical_atoms: Array<{ id: string; family: string; pillar: string }>;
  benchmarks: Array<{
    benchmark_id: string;
    qualified_source_key: string;
    source_skill_id: string;
    benchmark_classification: string;
    component_mapping_type: string;
    source: { pathway: string; level: string; pillar?: string; category?: string; name?: string };
    benchmark_components: Array<{
      canonical_atomic_skill_id: string;
      component_key: string;
      role: string;
      weight: number;
      abilityBearing: boolean;
      mapping_reason?: string;
    }>;
  }>;
};

export interface TrustedEvidenceObservation {
  evidenceIds: string[];
  sourceSystem: string;
  underlyingEventOrSessionId: string;
  observationWindow: string;
  sourceType: string;
  /** Observed attempts/fields, never successful attempts. */
  observedRequiredObservations: number;
  requiredObservations: number;
  /** Persisted validation snapshots deserialize this as an ISO string. */
  occurredAt: Date | string;
  benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT" | "EXPLICIT_ADJACENT_COMPONENT";
  verifiedObserverIds: string[];
}

export interface CanonicalDecisionInput {
  actor: ProgressionActor;
  academyId: string;
  playerId: string;
  benchmarkId: string;
  proposedBenchmarkMastery: number;
  confidence: number;
  evidenceRefs: string[];
  rationale?: string;
  observations: TrustedEvidenceObservation[];
  requestId?: string;
  idempotencyKey?: string;
}

export interface CanonicalCurrentDto {
  playerId: string;
  academyId: string;
  stateVersion: number;
  placementStatus: string;
  glowStatus: string;
  estimatedGlow: number | null;
  coverage: number;
  confidence: number;
  families: Record<string, { strength: number | null; coverage: number; confidence: number }>;
  pillars: Record<string, { strength: number | null; coverage: number; confidence: number }>;
  skills: Array<{
    canonicalSkillId: string;
    family: string;
    pillar: string;
    absoluteStrength: number | null;
    mastery: number | null;
    observationStatus: string;
    confidence: number;
    coverage: number;
    trend: string;
    lastEvidenceAt: Date | null;
  }>;
}

export interface CanonicalCurrentSnapshot {
  current: CanonicalCurrentDto;
  versions: {
    taxonomyConfigVersion: string;
    benchmarkConfigVersion: string;
    evidenceConfigVersion: string;
    strengthModelVersion: string;
    glowConfigVersion: string;
  };
  updatedAt: Date;
}

export class CanonicalProgressionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rejectedRequestFingerprint(input: CanonicalDecisionInput) {
  return sha256(JSON.stringify({
    academyId: input.academyId,
    playerId: input.playerId,
    benchmarkId: input.benchmarkId,
    proposedBenchmarkMastery: input.proposedBenchmarkMastery,
    confidence: input.confidence,
    evidenceRefs: [...input.evidenceRefs].sort(),
    observations: input.observations.map((observation) => ({
      evidenceIds: [...observation.evidenceIds].sort(),
      sourceSystem: observation.sourceSystem,
      underlyingEventOrSessionId: observation.underlyingEventOrSessionId,
      sourceType: observation.sourceType,
      observationWindow: observation.observationWindow,
    })),
  }));
}

async function auditUnresolvedTargetAndThrow(
  input: CanonicalDecisionInput,
  code: "TARGET_ACADEMY_NOT_RESOLVED" | "TARGET_PLAYER_NOT_RESOLVED" | "TARGET_SCOPE_NOT_RESOLVED",
  detail: string,
): Promise<never> {
  const fingerprint = rejectedRequestFingerprint(input);
  const suppliedRequestIdentity = input.idempotencyKey ?? input.requestId;
  const suppliedRequestIdentityHash = suppliedRequestIdentity ? sha256(suppliedRequestIdentity) : null;
  const requestIdentity = sha256([
    input.actor.userId,
    suppliedRequestIdentityHash ?? [input.academyId ?? "", input.playerId ?? "", fingerprint].join("|"),
  ].join("|"));
  await db.insert(canonicalProgressionRejectedRequests).values({
    requestIdentity,
    requestId: input.requestId ?? null,
    authenticatedActorId: input.actor.userId,
    authenticatedActorRole: input.actor.role ?? "unknown",
    submittedAcademyIdentifier: input.academyId ?? null,
    submittedPlayerIdentifier: input.playerId ?? null,
    submittedIdempotencyKeyHash: input.idempotencyKey ? sha256(input.idempotencyKey) : null,
    rejectionStage: "TARGET_RESOLUTION",
    stableRejectionCode: code,
    internalRejectionDetail: detail,
    requestPayloadHash: fingerprint,
  }).onConflictDoNothing();
  throw new CanonicalProgressionError("CANONICAL_TARGET_NOT_RESOLVED", "Canonical target cannot be resolved", 404);
}

async function resolveCanonicalTargetOrAudit(input: CanonicalDecisionInput): Promise<void> {
  const [academy] = await db.select({ id: academies.id }).from(academies)
    .where(eq(academies.id, input.academyId)).limit(1);
  if (!academy) return auditUnresolvedTargetAndThrow(input, "TARGET_ACADEMY_NOT_RESOLVED", "Submitted academy identifier did not resolve");
  const [player] = await db.select({ id: players.id, academyId: players.academyId }).from(players)
    .where(eq(players.id, input.playerId)).limit(1);
  if (!player) return auditUnresolvedTargetAndThrow(input, "TARGET_PLAYER_NOT_RESOLVED", "Submitted player identifier did not resolve");
  if (player.academyId !== input.academyId) {
    return auditUnresolvedTargetAndThrow(input, "TARGET_SCOPE_NOT_RESOLVED", "Submitted player is outside submitted academy scope");
  }
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function configPaths() {
  return {
    freeze: path.resolve(process.cwd(), "docs/specs/batch-4a-phase1-freeze-v1.json"),
    crosswalk: path.resolve(process.cwd(), "docs/specs/batch-4a-canonical-crosswalk-v1.json"),
  };
}

let cachedArtifacts: { freeze: FreezeArtifact; crosswalk: CrosswalkArtifact } | null = null;
let frozenConfigVerifiedInProcess = false;

function loadFrozenArtifacts() {
  if (cachedArtifacts) return cachedArtifacts;
  const paths = configPaths();
  cachedArtifacts = {
    freeze: JSON.parse(readFileSync(paths.freeze, "utf8")) as FreezeArtifact,
    crosswalk: JSON.parse(readFileSync(paths.crosswalk, "utf8")) as CrosswalkArtifact,
  };
  return cachedArtifacts;
}

function intervalForBenchmark(freeze: FreezeArtifact, level: string): [number, number] {
  const bands = {
    ...(freeze.evidence_config.benchmarkIntervals.juniorBands ?? {}),
    ...(freeze.evidence_config.benchmarkIntervals.adultBands ?? {}),
  } as Record<string, [number, number]>;
  const interval = bands[level];
  if (!interval) throw new CanonicalProgressionError("CONFIG_INVALID", `No frozen interval for level ${level}`, 500);
  return interval;
}

function qualityForObservation(
  config: any,
  observation: TrustedEvidenceObservation,
  level: string,
): {
  aggregationUnitId: string;
  sourceReliability: number;
  protocolQuality: number;
  observationCompleteness: number;
  benchmarkRelevanceDifficulty: number;
  recency: number;
  independentCorroboration: number;
  qUnit: number;
} {
  if (!observation.underlyingEventOrSessionId) {
    throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Stable underlying event/session identity is required", 422);
  }
  if (observation.requiredObservations <= 0 || observation.observedRequiredObservations < 0) {
    throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Observation completeness is required", 422);
  }

  const sourceReliability = asNumber(
    config.sourceReliability.find((entry: any) => entry.source_type === observation.sourceType)?.coefficient,
  );
  const protocolQuality = asNumber(config.protocolQuality?.factors?.[observation.sourceType]);
  const observationCompleteness = clamp(
    observation.observedRequiredObservations / observation.requiredObservations,
    0,
    1,
  );
  const levelFactor = asNumber(config.benchmarkRelevanceDifficulty?.pathwayLevelFactor?.[level]);
  const relevanceFactor = asNumber(config.benchmarkRelevanceDifficulty?.benchmarkRelevanceFactor?.[observation.benchmarkRelevance]);
  const benchmarkRelevanceDifficulty = clamp(levelFactor * relevanceFactor, 0, 1);
  const occurredAt = new Date(observation.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Evidence observation timestamp is invalid", 422);
  }
  const ageDays = Math.max(0, (Date.now() - occurredAt.getTime()) / 86_400_000);
  const halfLife = asNumber(config.recency?.half_life_days);
  const recency = halfLife > 0 ? Math.pow(0.5, ageDays / halfLife) : 0;
  const independentObservers = new Set(observation.verifiedObserverIds.filter(Boolean)).size;
  const independentCorroboration = clamp(0.9 + 0.05 * Math.min(Math.max(independentObservers - 1, 0), 2), 0, 1);
  const qUnit = clamp(
    sourceReliability
      * protocolQuality
      * observationCompleteness
      * benchmarkRelevanceDifficulty
      * recency
      * independentCorroboration,
    0,
    1,
  );

  return {
    aggregationUnitId: sha256([
      "player-bound-at-application",
      observation.sourceSystem,
      observation.underlyingEventOrSessionId,
      "skill-bound-at-application",
      observation.observationWindow,
    ].join("|")),
    sourceReliability,
    protocolQuality,
    observationCompleteness,
    benchmarkRelevanceDifficulty,
    recency,
    independentCorroboration,
    qUnit,
  };
}

function combinedQuality(units: Array<{ qUnit: number }>): number {
  return clamp(1 - units.reduce((product, unit) => product * (1 - unit.qUnit), 1), 0, 1);
}

function versions() {
  const { freeze, crosswalk } = loadFrozenArtifacts();
  return {
    taxonomyConfigVersion: TAXONOMY_CONFIG_VERSION,
    benchmarkConfigVersion: crosswalk.version,
    evidenceConfigVersion: freeze.evidence_config.version,
    strengthModelVersion: STRENGTH_MODEL_VERSION,
    glowConfigVersion: GLOW_CONFIG_VERSION,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertFrozenConfigMatch(identity: string, expected: unknown, actual: unknown) {
  if (stableJson(expected) !== stableJson(actual)) {
    throw new CanonicalProgressionError(
      "CONFIG_IMMUTABILITY_VIOLATION",
      `Frozen canonical configuration identity ${identity} already exists with different content`,
      409,
    );
  }
}

/**
 * Idempotently persists frozen taxonomy, crosswalk, components, and evidence
 * config. This only materializes checked-in configuration; it writes no player
 * progression state.
 */
export async function ensureCanonicalProgressionConfigPersisted() {
  const { freeze, crosswalk } = loadFrozenArtifacts();
  const v = versions();
  if (frozenConfigVerifiedInProcess) return v;
  const [persistedEvidenceConfig] = await db.select().from(evidenceConfigVersions)
    .where(eq(evidenceConfigVersions.version, v.evidenceConfigVersion))
    .limit(1);
  if (persistedEvidenceConfig) {
    assertFrozenConfigMatch(`evidence:${v.evidenceConfigVersion}`, {
      configJson: freeze.evidence_config,
      provenance: "PHASE_1_FINAL_FROZEN_SPECIFICATION",
      isActive: true,
    }, {
      configJson: persistedEvidenceConfig.configJson,
      provenance: persistedEvidenceConfig.provenance,
      isActive: persistedEvidenceConfig.isActive,
    });
    // A completed seed transaction materializes every related frozen row
    // atomically, and the DB guard prevents later mutation. Avoid thousands of
    // redundant per-row reads on every fresh application process.
    frozenConfigVerifiedInProcess = true;
    return v;
  }

  await db.transaction(async (tx) => {
    // Serialize first-time materialization of this immutable configuration.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('canonical-progression-config-v1'))`);
    const [existingEvidenceConfig] = await tx.select().from(evidenceConfigVersions)
      .where(eq(evidenceConfigVersions.version, v.evidenceConfigVersion))
      .limit(1);
    if (existingEvidenceConfig) {
      assertFrozenConfigMatch(`evidence:${v.evidenceConfigVersion}`, {
        configJson: freeze.evidence_config,
        provenance: "PHASE_1_FINAL_FROZEN_SPECIFICATION",
        isActive: true,
      }, {
        configJson: existingEvidenceConfig.configJson,
        provenance: existingEvidenceConfig.provenance,
        isActive: existingEvidenceConfig.isActive,
      });
    } else {
      await tx.insert(evidenceConfigVersions).values({
        version: v.evidenceConfigVersion,
        configJson: freeze.evidence_config,
        provenance: "PHASE_1_FINAL_FROZEN_SPECIFICATION",
        isActive: true,
      });
    }

    for (const atom of crosswalk.canonical_atoms) {
      const expected = {
        taxonomyConfigVersion: v.taxonomyConfigVersion,
        family: atom.family,
        pillar: atom.pillar,
        isAbilityBearing: atom.pillar !== "SOCIAL_CHARACTER" && atom.pillar !== "SOCIAL",
        definitionJson: atom,
      };
      const [existingAtom] = await tx.select().from(canonicalSkillDefinitions)
        .where(eq(canonicalSkillDefinitions.id, atom.id)).limit(1);
      if (existingAtom) {
        assertFrozenConfigMatch(`skill:${atom.id}`, expected, {
          taxonomyConfigVersion: existingAtom.taxonomyConfigVersion,
          family: existingAtom.family,
          pillar: existingAtom.pillar,
          isAbilityBearing: existingAtom.isAbilityBearing,
          definitionJson: existingAtom.definitionJson,
        });
      } else {
        await tx.insert(canonicalSkillDefinitions).values({ id: atom.id, ...expected });
      }
    }

    for (const benchmark of crosswalk.benchmarks) {
      const [lower, upper] = intervalForBenchmark(freeze, benchmark.source.level);
      const [existingBenchmark] = await tx.select()
        .from(canonicalBenchmarkDefinitions)
        .where(and(
          eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, v.benchmarkConfigVersion),
          eq(canonicalBenchmarkDefinitions.benchmarkId, benchmark.benchmark_id),
        ))
        .limit(1);
      const expectedBenchmark = {
        benchmarkConfigVersion: v.benchmarkConfigVersion,
        taxonomyConfigVersion: v.taxonomyConfigVersion,
        benchmarkId: benchmark.benchmark_id,
        qualifiedSourceKey: benchmark.qualified_source_key,
        sourceSkillId: benchmark.source_skill_id,
        classification: benchmark.benchmark_classification,
        componentMappingType: benchmark.component_mapping_type,
        pathway: benchmark.source.pathway,
        level: benchmark.source.level,
        sourcePillar: benchmark.source.pillar ?? null,
        sourceCategory: benchmark.source.category ?? null,
        sourceName: benchmark.source.name ?? null,
        intervalLower: String(lower),
        intervalUpper: String(upper),
        definitionJson: benchmark,
      };
      if (existingBenchmark) {
        assertFrozenConfigMatch(`benchmark:${v.benchmarkConfigVersion}:${benchmark.benchmark_id}`, expectedBenchmark, {
          taxonomyConfigVersion: existingBenchmark.taxonomyConfigVersion,
          benchmarkConfigVersion: existingBenchmark.benchmarkConfigVersion,
          benchmarkId: existingBenchmark.benchmarkId,
          qualifiedSourceKey: existingBenchmark.qualifiedSourceKey,
          sourceSkillId: existingBenchmark.sourceSkillId,
          classification: existingBenchmark.classification,
          componentMappingType: existingBenchmark.componentMappingType,
          pathway: existingBenchmark.pathway,
          level: existingBenchmark.level,
          sourcePillar: existingBenchmark.sourcePillar,
          sourceCategory: existingBenchmark.sourceCategory,
          sourceName: existingBenchmark.sourceName,
          intervalLower: String(Number(existingBenchmark.intervalLower)),
          intervalUpper: String(Number(existingBenchmark.intervalUpper)),
          definitionJson: existingBenchmark.definitionJson,
        });
      }
      const benchmarkDefinitionId = existingBenchmark?.id ?? (
        await tx.insert(canonicalBenchmarkDefinitions).values({
          ...expectedBenchmark,
        }).returning({ id: canonicalBenchmarkDefinitions.id })
      )[0].id;

      for (const component of benchmark.benchmark_components) {
        const expectedComponent = {
          canonicalSkillId: component.canonical_atomic_skill_id,
          componentKey: component.component_key,
          role: component.role,
          weight: String(component.weight),
          isAbilityBearing: component.abilityBearing,
          mappingReason: component.mapping_reason ?? null,
        };
        const [existingComponent] = await tx.select().from(canonicalBenchmarkComponents)
          .where(and(
            eq(canonicalBenchmarkComponents.benchmarkDefinitionId, benchmarkDefinitionId),
            eq(canonicalBenchmarkComponents.componentKey, component.component_key),
          )).limit(1);
        if (existingComponent) {
          assertFrozenConfigMatch(`component:${benchmarkDefinitionId}:${component.component_key}`, expectedComponent, {
            canonicalSkillId: existingComponent.canonicalSkillId,
            componentKey: existingComponent.componentKey,
            role: existingComponent.role,
            weight: String(Number(existingComponent.weight)),
            isAbilityBearing: existingComponent.isAbilityBearing,
            mappingReason: existingComponent.mappingReason,
          });
        } else {
          await tx.insert(canonicalBenchmarkComponents).values({
            benchmarkDefinitionId,
            ...expectedComponent,
          });
        }
      }
    }
  });

  frozenConfigVerifiedInProcess = true;
  return v;
}

async function verifyActorAndPlayer(actor: ProgressionActor, academyId: string, playerId: string) {
  if (!actor.userId || actor.academyId !== academyId) {
    throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", "Actor academy scope is invalid", 403);
  }
  if (actor.playerId === playerId) {
    throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", "A player cannot review their own canonical evidence", 403);
  }
  const policy = await canReviewEvidence(actor);
  if (!policy.allowed) throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", policy.reason ?? "Actor cannot review canonical evidence", 403);

  const [player] = await db.select({ id: players.id, academyId: players.academyId })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.academyId, academyId)))
    .limit(1);
  if (!player) throw new CanonicalProgressionError("PLAYER_NOT_FOUND", "Player is not in the actor academy", 404);
}

async function verifyActorAndPlayerInTransaction(
  tx: any,
  actor: ProgressionActor,
  academyId: string,
  playerId: string,
) {
  if (!actor?.userId || actor.academyId !== academyId) {
    throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", "Actor academy scope is invalid", 403);
  }
  if (actor.playerId === playerId) {
    throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", "A player cannot review their own canonical evidence", 403);
  }
  const policy = await canReviewEvidence(actor);
  if (!policy.allowed) throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", policy.reason ?? "Actor cannot review canonical evidence", 403);

  const [player] = await tx.select({ id: players.id, academyId: players.academyId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!player || player.academyId !== academyId) {
    throw new CanonicalProgressionError("PLAYER_NOT_FOUND", "Player is not in the actor academy", 404);
  }
}

async function ensureAggregateInTransaction(tx: any, academyId: string, playerId: string) {
  const v = versions();
  await tx.insert(playerCanonicalProgression).values({
    playerId,
    academyId,
    taxonomyConfigVersion: v.taxonomyConfigVersion,
    benchmarkConfigVersion: v.benchmarkConfigVersion,
    evidenceConfigVersion: v.evidenceConfigVersion,
    strengthModelVersion: v.strengthModelVersion,
    glowConfigVersion: v.glowConfigVersion,
  }).onConflictDoNothing();
}

async function ensureAggregate(academyId: string, playerId: string) {
  const v = versions();
  await db.insert(playerCanonicalProgression).values({
    playerId,
    academyId,
    taxonomyConfigVersion: v.taxonomyConfigVersion,
    benchmarkConfigVersion: v.benchmarkConfigVersion,
    evidenceConfigVersion: v.evidenceConfigVersion,
    strengthModelVersion: v.strengthModelVersion,
    glowConfigVersion: v.glowConfigVersion,
  }).onConflictDoNothing();
}

function validateDecisionShape(input: CanonicalDecisionInput) {
  if (!input || !Number.isFinite(input.proposedBenchmarkMastery) || input.proposedBenchmarkMastery < 0 || input.proposedBenchmarkMastery > 100) {
    throw new CanonicalProgressionError("INVALID_MASTERY", "Benchmark mastery must be between 0 and 100");
  }
  if (!Number.isFinite(input?.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new CanonicalProgressionError("INVALID_CONFIDENCE", "Confidence must be between 0 and 1");
  }
  if (!Array.isArray(input?.evidenceRefs) || !Array.isArray(input?.observations)
    || !input.evidenceRefs.length || !input.observations.length) {
    throw new CanonicalProgressionError("EVIDENCE_REQUIRED", "At least one trusted evidence observation is required");
  }
  const referenced = new Set(input.evidenceRefs);
  const observedEvidence = new Set<string>();
  for (const observation of input.observations) {
    if (!observation.evidenceIds.length || observation.evidenceIds.some((id) => !referenced.has(id))) {
      throw new CanonicalProgressionError("INVALID_EVIDENCE_REFERENCE", "Observation references evidence outside the decision");
    }
    observation.evidenceIds.forEach((id) => observedEvidence.add(id));
  }
  if (observedEvidence.size !== referenced.size || [...referenced].some((id) => !observedEvidence.has(id))) {
    throw new CanonicalProgressionError("INVALID_EVIDENCE_REFERENCE", "Every referenced evidence item must be represented in a trusted observation");
  }
}

function asCanonicalValidationError(error: unknown): CanonicalProgressionError {
  if (error instanceof CanonicalProgressionError) return error;
  return new CanonicalProgressionError("VALIDATION_FAILED", "Canonical decision validation failed", 422);
}

function validateTrustedObservations(
  observations: TrustedEvidenceObservation[],
  config: any,
  benchmarkLevel: string,
) {
  for (const observation of observations) {
    const source = config.sourceReliability.find((entry: any) => entry.source_type === observation.sourceType);
    const protocol = asNumber(config.protocolQuality?.factors?.[observation.sourceType]);
    const levelFactor = asNumber(config.benchmarkRelevanceDifficulty?.pathwayLevelFactor?.[benchmarkLevel]);
    const relevanceFactor = asNumber(config.benchmarkRelevanceDifficulty?.benchmarkRelevanceFactor?.[observation.benchmarkRelevance]);
    // Conditional sources (for example verified match events) require a
    // component-scoring adapter, which is intentionally outside this Phase 2
    // core. They must remain non-delta evidence until that adapter exists.
    if (source?.eligibility !== "DELTA_ELIGIBLE"
      || asNumber(source.coefficient) <= 0
      || protocol <= 0
      || levelFactor <= 0
      || relevanceFactor <= 0) {
      throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Observation source or relevance is not eligible for this frozen benchmark", 422);
    }
    qualityForObservation(config, observation, benchmarkLevel);
  }
}

/**
 * Transaction A. Once an authenticated actor enters this pipeline, every
 * validation outcome is committed as ACCEPTED or REJECTED with its audit row.
 */
export async function proposeAndValidateDevelopmentDecision(input: CanonicalDecisionInput) {
  if (!input?.actor?.userId) {
    throw new CanonicalProgressionError("AUTH_REVALIDATION_FAILED", "Authenticated actor identity is required", 401);
  }
  await resolveCanonicalTargetOrAudit(input);
  await ensureCanonicalProgressionConfigPersisted();
  const v = versions();
  const config = loadFrozenArtifacts().freeze.evidence_config;
  const candidate = input as any;

  const result = await db.transaction(async (tx) => {
    const [decision] = await tx.insert(developmentDecisions).values({
      academyId: String(candidate.academyId ?? ""),
      playerId: String(candidate.playerId ?? ""),
      actorUserId: input.actor.userId,
      actorCoachId: input.actor.coachId ?? null,
      status: "PROPOSED",
      benchmarkDefinitionId: null,
      benchmarkId: typeof candidate.benchmarkId === "string" ? candidate.benchmarkId : "",
      proposedBenchmarkMastery: String(Number.isFinite(candidate.proposedBenchmarkMastery) ? candidate.proposedBenchmarkMastery : 0),
      confidence: String(Number.isFinite(candidate.confidence) ? candidate.confidence : 0),
      evidenceRefs: Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs : [],
      rationale: typeof candidate.rationale === "string" ? candidate.rationale : null,
      expectedPlayerStateVersion: null,
      ...v,
    }).returning();

    try {
      await tx.update(developmentDecisions).set({ status: "VALIDATING", updatedAt: new Date() })
        .where(eq(developmentDecisions.id, decision.id));
      validateDecisionShape(input);
      await verifyActorAndPlayerInTransaction(tx, input.actor, input.academyId, input.playerId);
      if (input.confidence < asNumber(config.strengthUpdate.minimum_ai_confidence)) {
        throw new CanonicalProgressionError("INSUFFICIENT_CONFIDENCE", "Decision confidence is below the frozen acceptance threshold", 422);
      }

      const [benchmark] = await tx.select().from(canonicalBenchmarkDefinitions)
        .where(and(
          eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, v.benchmarkConfigVersion),
          eq(canonicalBenchmarkDefinitions.benchmarkId, input.benchmarkId),
        )).limit(1);
      if (!benchmark) throw new CanonicalProgressionError("INVALID_BENCHMARK", "Frozen benchmark does not exist", 404);

      await resolveCanonicalEvidenceRefs(tx, input.evidenceRefs, input.playerId, input.academyId);
      validateTrustedObservations(input.observations, config, benchmark.level);

      const components = await tx.select().from(canonicalBenchmarkComponents)
        .where(and(
          eq(canonicalBenchmarkComponents.benchmarkDefinitionId, benchmark.id),
          eq(canonicalBenchmarkComponents.isAbilityBearing, true),
        ));
      if (!components.length) {
        throw new CanonicalProgressionError("BENCHMARK_NOT_ABILITY_BEARING", "This benchmark cannot change canonical Ability", 422);
      }

      let hasNewEligibleContribution = false;
      for (const canonicalSkillId of new Set(components.map((component) => component.canonicalSkillId))) {
        const units = input.observations.map((observation) => {
          const quality = qualityForObservation(config, observation, benchmark.level);
          const aggregationUnitId = sha256([
            input.playerId, observation.sourceSystem, observation.underlyingEventOrSessionId,
            canonicalSkillId, observation.observationWindow,
          ].join("|"));
          return { ...quality, aggregationUnitId };
        });
        const keys = units.map((unit) => sha256([input.playerId, unit.aggregationUnitId, canonicalSkillId, "DEVELOPMENT"].join("|")));
        const existing = keys.length
          ? await tx.select({ idempotencyKey: canonicalEvidenceContributions.idempotencyKey })
            .from(canonicalEvidenceContributions)
            .where(inArray(canonicalEvidenceContributions.idempotencyKey, keys))
          : [];
        const existingKeys = new Set(existing.map((entry) => entry.idempotencyKey));
        const unseen = units.filter((unit) =>
          !existingKeys.has(sha256([input.playerId, unit.aggregationUnitId, canonicalSkillId, "DEVELOPMENT"].join("|"))),
        );
        if (combinedQuality(unseen) >= asNumber(config.evidenceAggregation.minimum_q_for_delta)) {
          hasNewEligibleContribution = true;
          break;
        }
      }
      if (!hasNewEligibleContribution) {
        throw new CanonicalProgressionError("NO_NEW_ELIGIBLE_EVIDENCE", "Every eligible evidence aggregation unit has already contributed", 409);
      }

      await ensureAggregateInTransaction(tx, input.academyId, input.playerId);
      const locked = await tx.execute(sql`
        SELECT state_version FROM player_canonical_progression
        WHERE player_id = ${input.playerId} FOR UPDATE
      `);
      const expectedVersion = Number((locked.rows[0] as any)?.state_version);
      if (!Number.isInteger(expectedVersion)) {
        throw new CanonicalProgressionError("STATE_ANCHOR_MISSING", "Canonical aggregate is unavailable", 500);
      }

      await tx.update(developmentDecisions).set({ benchmarkDefinitionId: benchmark.id })
        .where(eq(developmentDecisions.id, decision.id));
      for (const evidenceId of input.evidenceRefs) {
        await tx.insert(developmentDecisionEvidenceLinks).values({
          decisionId: decision.id, evidenceId, linkRole: "PRIMARY_DELTA",
        }).onConflictDoNothing();
      }
      await tx.insert(developmentDecisionValidations).values({
        decisionId: decision.id,
        outcome: "ACCEPTED",
        validationErrors: [],
        validatedByUserId: input.actor.userId,
        validatedEvidenceJson: input.observations,
      } as any);
      const [accepted] = await tx.update(developmentDecisions).set({
        status: "ACCEPTED",
        acceptedAt: new Date(),
        expectedPlayerStateVersion: expectedVersion,
        updatedAt: new Date(),
      }).where(eq(developmentDecisions.id, decision.id)).returning();
      return { decision: accepted, error: null as CanonicalProgressionError | null };
    } catch (error) {
      const validationError = asCanonicalValidationError(error);
      await tx.insert(developmentDecisionValidations).values({
        decisionId: decision.id,
        outcome: "REJECTED",
        validationErrors: [validationError.code],
        validatedByUserId: input.actor.userId,
        validatedEvidenceJson: Array.isArray(candidate.observations) ? candidate.observations : [],
      } as any);
      const [rejected] = await tx.update(developmentDecisions).set({
        status: "REJECTED",
        rejectedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(developmentDecisions.id, decision.id)).returning();
      // A deterministic replay is a valid proposal with a terminal decision
      // outcome, not a malformed request. Preserve the existing caller
      // contract by returning its rejected record.
      return {
        decision: rejected,
        error: validationError.code === "NO_NEW_ELIGIBLE_EVIDENCE" ? null : validationError,
      };
    }
  });

  if (result.error) throw result.error;
  return result.decision;
}

/**
 * Legacy pre-audit implementation retained temporarily for comparison during
 * this bounded closure pass. It is intentionally not exported or called.
 */
async function proposeAndValidateDevelopmentDecisionLegacy(input: CanonicalDecisionInput) {
  validateDecisionShape(input);
  await ensureCanonicalProgressionConfigPersisted();
  await verifyActorAndPlayer(input.actor, input.academyId, input.playerId);
  await ensureAggregate(input.academyId, input.playerId);
  const v = versions();
  const config = loadFrozenArtifacts().freeze.evidence_config;
  if (input.confidence < asNumber(config.strengthUpdate.minimum_ai_confidence)) {
    throw new CanonicalProgressionError("INSUFFICIENT_CONFIDENCE", "Decision confidence is below the frozen acceptance threshold", 422);
  }

  const [benchmark] = await db.select()
    .from(canonicalBenchmarkDefinitions)
    .where(and(
      eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, v.benchmarkConfigVersion),
      eq(canonicalBenchmarkDefinitions.benchmarkId, input.benchmarkId),
    ))
    .limit(1);
  if (!benchmark) throw new CanonicalProgressionError("INVALID_BENCHMARK", "Frozen benchmark does not exist", 404);

  const evidenceRows = await db.select({
    id: skillEvidence.id,
    playerId: skillEvidence.playerId,
    academyId: players.academyId,
    status: skillEvidence.status,
  }).from(skillEvidence)
    .innerJoin(players, eq(players.id, skillEvidence.playerId))
    .where(inArray(skillEvidence.id, input.evidenceRefs));
  if (evidenceRows.length !== new Set(input.evidenceRefs).size
    || evidenceRows.some((row) => row.playerId !== input.playerId || row.academyId !== input.academyId)) {
    throw new CanonicalProgressionError("INVALID_EVIDENCE_OWNERSHIP", "Evidence must belong to the target player and academy", 403);
  }
  if (evidenceRows.some((row) => row.status !== "approved")) {
    throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Only approved evidence is eligible for canonical progression", 422);
  }
  validateTrustedObservations(input.observations, config, benchmark.level);

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT state_version
      FROM player_canonical_progression
      WHERE player_id = ${input.playerId}
      FOR UPDATE
    `);
    const expectedVersion = Number((locked.rows[0] as any)?.state_version);
    if (!Number.isInteger(expectedVersion)) throw new CanonicalProgressionError("STATE_ANCHOR_MISSING", "Canonical aggregate is unavailable", 500);

    const [decision] = await tx.insert(developmentDecisions).values({
      academyId: input.academyId,
      playerId: input.playerId,
      actorUserId: input.actor.userId,
      actorCoachId: input.actor.coachId ?? null,
      status: "VALIDATING",
      benchmarkDefinitionId: benchmark.id,
      benchmarkId: input.benchmarkId,
      proposedBenchmarkMastery: String(input.proposedBenchmarkMastery),
      confidence: String(input.confidence),
      evidenceRefs: input.evidenceRefs,
      rationale: input.rationale ?? null,
      expectedPlayerStateVersion: expectedVersion,
      ...v,
    }).returning();

    for (const evidenceId of input.evidenceRefs) {
      await tx.insert(developmentDecisionEvidenceLinks).values({
        decisionId: decision.id,
        evidenceId,
        linkRole: "PRIMARY_DELTA",
      }).onConflictDoNothing();
    }

    // Validation owns idempotency. A decision is rejected before acceptance if
    // every eligible atomic aggregation unit has already contributed.
    const components = await tx.select().from(canonicalBenchmarkComponents)
      .where(and(
        eq(canonicalBenchmarkComponents.benchmarkDefinitionId, benchmark.id),
        eq(canonicalBenchmarkComponents.isAbilityBearing, true),
      ));
    let hasNewEligibleContribution = false;
    for (const canonicalSkillId of new Set(components.map((component) => component.canonicalSkillId))) {
      const units = input.observations.map((observation) => {
        const quality = qualityForObservation(config, observation, benchmark.level);
        const aggregationUnitId = sha256([
          input.playerId,
          observation.sourceSystem,
          observation.underlyingEventOrSessionId,
          canonicalSkillId,
          observation.observationWindow,
        ].join("|"));
        return { ...quality, aggregationUnitId };
      });
      const keys = units.map((unit) => sha256([input.playerId, unit.aggregationUnitId, canonicalSkillId, "DEVELOPMENT"].join("|")));
      const existing = keys.length
        ? await tx.select({ idempotencyKey: canonicalEvidenceContributions.idempotencyKey })
          .from(canonicalEvidenceContributions)
          .where(inArray(canonicalEvidenceContributions.idempotencyKey, keys))
        : [];
      const existingKeys = new Set(existing.map((entry) => entry.idempotencyKey));
      const newUnits = units.filter((unit) =>
        !existingKeys.has(sha256([input.playerId, unit.aggregationUnitId, canonicalSkillId, "DEVELOPMENT"].join("|"))),
      );
      if (combinedQuality(newUnits) >= asNumber(config.evidenceAggregation.minimum_q_for_delta)) {
        hasNewEligibleContribution = true;
        break;
      }
    }

    if (!hasNewEligibleContribution) {
      await tx.insert(developmentDecisionValidations).values({
        decisionId: decision.id,
        outcome: "REJECTED",
        validationErrors: ["NO_NEW_ELIGIBLE_EVIDENCE"],
        validatedByUserId: input.actor.userId,
        validatedEvidenceJson: input.observations,
      } as any);
      return (await tx.update(developmentDecisions)
        .set({ status: "REJECTED", rejectedAt: new Date(), updatedAt: new Date() })
        .where(eq(developmentDecisions.id, decision.id))
        .returning())[0];
    }

    await tx.insert(developmentDecisionValidations).values({
      decisionId: decision.id,
      outcome: "ACCEPTED",
      validationErrors: [],
      validatedByUserId: input.actor.userId,
      validatedEvidenceJson: input.observations,
    } as any);

    const [accepted] = await tx.update(developmentDecisions)
      .set({ status: "ACCEPTED", acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(developmentDecisions.id, decision.id))
      .returning();
    return accepted;
  });
}

function deriveAggregates(
  skills: Array<{
    canonicalSkillId: string;
    family: string;
    pillar: string;
    absoluteStrength: unknown;
    observationStatus: string;
    confidence: unknown;
  }>,
) {
  const abilityPillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "MATCH_PLAY"];
  const observed = skills.filter((skill) => skill.observationStatus !== "UNOBSERVED" && skill.absoluteStrength !== null);

  const aggregate = (items: typeof skills) => {
    const observedItems = items.filter((item) => item.observationStatus !== "UNOBSERVED" && item.absoluteStrength !== null);
    return {
      strength: observedItems.length ? observedItems.reduce((sum, item) => sum + asNumber(item.absoluteStrength), 0) / observedItems.length : null,
      coverage: items.length ? observedItems.length / items.length : 0,
      confidence: observedItems.length ? observedItems.reduce((sum, item) => sum + asNumber(item.confidence), 0) / observedItems.length : 0,
    };
  };

  const families: Record<string, ReturnType<typeof aggregate>> = {};
  const pillars: Record<string, ReturnType<typeof aggregate>> = {};
  for (const family of new Set(skills.map((skill) => skill.family))) {
    families[family] = aggregate(skills.filter((skill) => skill.family === family));
  }
  for (const pillar of abilityPillars) {
    pillars[pillar] = aggregate(skills.filter((skill) => skill.pillar === pillar));
  }

  const observedPillars = abilityPillars.filter((pillar) => pillars[pillar].strength !== null);
  const coverage = abilityPillars.reduce((sum, pillar) => sum + pillars[pillar].coverage, 0) / abilityPillars.length;
  const confidence = abilityPillars.reduce((sum, pillar) => sum + pillars[pillar].coverage * pillars[pillar].confidence, 0) / abilityPillars.length;
  const estimatedGlow = observedPillars.length
    ? observedPillars.reduce((sum, pillar) => sum + (pillars[pillar].strength ?? 0), 0) / observedPillars.length
    : null;

  const glowStatus = observedPillars.length < 2
    ? "ESTABLISHING"
    : observedPillars.length === 5
      && Object.values(pillars).every((pillar) => pillar.coverage >= 0.8 && pillar.confidence >= 0.7)
      && coverage >= 0.85
        ? "CONFIRMED"
        : "PROVISIONAL";

  return { families, pillars, coverage, confidence, estimatedGlow, glowStatus, observedCount: observed.length };
}

async function persistExecutionAttempt(
  decisionId: string,
  outcome: string,
  expectedStateVersion: number | null,
  observedStateVersion: number | null,
  stableErrorCode?: string,
  failureClass?: string,
) {
  const attempts = await db.select({ count: sql<number>`count(*)` })
    .from(developmentDecisionExecutionAttempts)
    .where(eq(developmentDecisionExecutionAttempts.decisionId, decisionId));
  await db.insert(developmentDecisionExecutionAttempts).values({
    decisionId,
    attemptNumber: Number(attempts[0]?.count ?? 0) + 1,
    outcome,
    expectedStateVersion,
    observedStateVersion,
    stableErrorCode: stableErrorCode ?? null,
    failureClass: failureClass ?? null,
  });
}

let applyFailureInjectorForTests: (() => void) | null = null;

/** Test-only hook used to prove Transaction B rollback and retry behavior. */
export function setCanonicalApplyFailureInjectorForTests(injector: (() => void) | null) {
  applyFailureInjectorForTests = injector;
}

/**
 * Transaction B: applies one already-accepted decision. A technical failure
 * rolls back this transaction and is persisted as a separate immutable attempt.
 */
export async function applyAcceptedDevelopmentDecision(
  decisionId: string,
  actor: ProgressionActor,
) {
  await ensureCanonicalProgressionConfigPersisted();

  try {
    const result = await db.transaction(async (tx) => {
      const [decision] = await tx.select().from(developmentDecisions)
        .where(eq(developmentDecisions.id, decisionId))
        .limit(1);
      if (!decision) throw new CanonicalProgressionError("DECISION_NOT_FOUND", "Decision was not found", 404);
      // Receipt/idempotency is never an authorization bypass.
      await verifyActorAndPlayer(actor, decision.academyId, decision.playerId);
      if (decision.status === "APPLIED") {
        const [receipt] = await tx.select().from(canonicalDecisionApplicationReceipts)
          .where(eq(canonicalDecisionApplicationReceipts.decisionId, decisionId)).limit(1);
        return {
          applied: true,
          alreadyApplied: true,
          stateVersion: receipt?.stateVersion ?? null,
          changedSkillCount: 0,
        };
      }
      if (decision.status !== "ACCEPTED") throw new CanonicalProgressionError("DECISION_NOT_ACCEPTED", "Decision is not accepted", 409);

      const locked = await tx.execute(sql`
        SELECT *
        FROM player_canonical_progression
        WHERE player_id = ${decision.playerId}
        FOR UPDATE
      `);
      const aggregate = locked.rows[0] as any;
      if (!aggregate) throw new CanonicalProgressionError("STATE_ANCHOR_MISSING", "Canonical aggregate is unavailable", 500);

      // The receipt check after the player lock is authoritative. It
      // distinguishes duplicate application of the same decision from a
      // competing decision that legitimately becomes stale.
      const [receiptAfterLock] = await tx.select().from(canonicalDecisionApplicationReceipts)
        .where(eq(canonicalDecisionApplicationReceipts.decisionId, decisionId))
        .limit(1);
      if (receiptAfterLock) {
        return {
          applied: true,
          alreadyApplied: true,
          stateVersion: receiptAfterLock.stateVersion,
          changedSkillCount: 0,
        };
      }

      const observedVersion = Number(aggregate.state_version);
      const expectedVersion = Number(decision.expectedPlayerStateVersion);
      if (observedVersion !== expectedVersion) {
        return { stale: true, expectedStateVersion: expectedVersion, observedStateVersion: observedVersion };
      }

      const [validation] = await tx.select().from(developmentDecisionValidations)
        .where(eq(developmentDecisionValidations.decisionId, decisionId)).limit(1);
      const observations = ((validation as any)?.validatedEvidenceJson ?? []) as TrustedEvidenceObservation[];
      if (!validation || validation.outcome !== "ACCEPTED" || !observations.length) {
        throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Accepted decision lacks validated evidence", 422);
      }

      const [benchmark] = await tx.select().from(canonicalBenchmarkDefinitions)
        .where(eq(canonicalBenchmarkDefinitions.id, decision.benchmarkDefinitionId!)).limit(1);
      if (!benchmark
        || benchmark.benchmarkConfigVersion !== decision.benchmarkConfigVersion
        || decision.evidenceConfigVersion !== versions().evidenceConfigVersion) {
        throw new CanonicalProgressionError("CONFIG_INVALID", "Frozen configuration is unavailable", 409);
      }
      const config = loadFrozenArtifacts().freeze.evidence_config;
      if (asNumber(decision.confidence) < asNumber(config.strengthUpdate.minimum_ai_confidence)) {
        throw new CanonicalProgressionError("INSUFFICIENT_CONFIDENCE", "Accepted decision is below the frozen confidence threshold", 422);
      }
      const decisionEvidenceRefs = (decision.evidenceRefs ?? []) as string[];
      const observationEvidenceRefs = new Set(observations.flatMap((observation) => observation.evidenceIds));
      if (observationEvidenceRefs.size !== new Set(decisionEvidenceRefs).size
        || decisionEvidenceRefs.some((id) => !observationEvidenceRefs.has(id))) {
        throw new CanonicalProgressionError("EVIDENCE_INELIGIBLE", "Accepted decision evidence snapshot is incomplete", 422);
      }
      await resolveCanonicalEvidenceRefs(tx, decisionEvidenceRefs, decision.playerId, decision.academyId);
      validateTrustedObservations(observations, config, benchmark.level);

      const components = await tx.select().from(canonicalBenchmarkComponents)
        .where(and(
          eq(canonicalBenchmarkComponents.benchmarkDefinitionId, benchmark.id),
          eq(canonicalBenchmarkComponents.isAbilityBearing, true),
        ));
      const nextStateVersion = observedVersion + 1;
      const stateChanges: any[] = [];

      for (const canonicalSkillId of new Set(components.map((component) => component.canonicalSkillId))) {
        const skillComponents = components.filter((component) => component.canonicalSkillId === canonicalSkillId);
        const componentWeight = skillComponents.reduce((sum, component) => sum + asNumber(component.weight), 0);
        const unitMap = new Map<string, ReturnType<typeof qualityForObservation>>();
        for (const observation of observations) {
          const unit = qualityForObservation(config, observation, benchmark.level);
          const unitId = sha256([
            decision.playerId,
            observation.sourceSystem,
            observation.underlyingEventOrSessionId,
            canonicalSkillId,
            observation.observationWindow,
          ].join("|"));
          unit.aggregationUnitId = unitId;
          unitMap.set(unitId, unit);
        }

        const existingContributions = unitMap.size
          ? await tx.select({ idempotencyKey: canonicalEvidenceContributions.idempotencyKey })
            .from(canonicalEvidenceContributions)
            .where(inArray(
              canonicalEvidenceContributions.idempotencyKey,
              [...unitMap.keys()].map((unitId) => sha256([decision.playerId, unitId, canonicalSkillId, "DEVELOPMENT"].join("|"))),
            ))
          : [];
        const existingKeys = new Set(existingContributions.map((entry) => entry.idempotencyKey));
        const eligibleUnits = [...unitMap.values()].filter((unit) =>
          !existingKeys.has(sha256([decision.playerId, unit.aggregationUnitId, canonicalSkillId, "DEVELOPMENT"].join("|"))),
        );
        const q = combinedQuality(eligibleUnits);
        if (q < asNumber(config.evidenceAggregation.minimum_q_for_delta)) continue;

        const [current] = await tx.select().from(playerCanonicalSkillStates)
          .where(and(
            eq(playerCanonicalSkillStates.playerId, decision.playerId),
            eq(playerCanonicalSkillStates.canonicalSkillId, canonicalSkillId),
          ))
          .limit(1);

        const previous = current?.absoluteStrength === null || current?.absoluteStrength === undefined
          ? null
          : asNumber(current.absoluteStrength);
        const lower = asNumber(benchmark.intervalLower);
        const upper = asNumber(benchmark.intervalUpper);
        const candidate = lower + (asNumber(decision.proposedBenchmarkMastery) / 100) * (upper - lower);
        const confidence = asNumber(decision.confidence);
        const maximumIncrease = asNumber(config.strengthUpdate.max_increase_absolute_units) * q * confidence * componentWeight;
        const maximumRegression = asNumber(config.strengthUpdate.max_regression_absolute_units) * q * confidence * componentWeight;
        const next = previous === null
          ? candidate
          : clamp(candidate, previous - maximumRegression, previous + maximumIncrease);
        const mastery = clamp(((next - lower) / Math.max(upper - lower, 1)) * 100, 0, 100);
        const lastEvidenceAt = observations.reduce<Date | null>((latest, observation) => {
          const occurredAt = new Date(observation.occurredAt);
          return !latest || occurredAt > latest ? occurredAt : latest;
        }, null);

        const stateValues = {
          academyId: decision.academyId,
          playerId: decision.playerId,
          canonicalSkillId,
          activeBenchmarkDefinitionId: benchmark.id,
          activeBenchmarkId: benchmark.benchmarkId,
          benchmarkConfigVersion: benchmark.benchmarkConfigVersion,
          absoluteStrength: String(next),
          stageRelativeMastery: String(mastery),
          observationStatus: "OBSERVED",
          confidence: String(q),
          coverage: "1",
          freshnessAt: lastEvidenceAt,
          lastEvidenceAt,
          trend: previous === null ? "ESTABLISHING" : next > previous ? "IMPROVING" : next < previous ? "REGRESSING" : "STABLE",
          stateVersion: nextStateVersion,
          lastDecisionId: decisionId,
          updatedAt: new Date(),
        };
        const persisted = current
          ? (await tx.update(playerCanonicalSkillStates).set(stateValues).where(eq(playerCanonicalSkillStates.id, current.id)).returning())[0]
          : (await tx.insert(playerCanonicalSkillStates).values(stateValues).returning())[0];
        stateChanges.push(persisted);

        await tx.insert(playerCanonicalSkillHistory).values({
          academyId: decision.academyId,
          playerId: decision.playerId,
          canonicalSkillId,
          eventType: "DEVELOPMENT",
          decisionId,
          priorAbsoluteStrength: previous === null ? null : String(previous),
          nextAbsoluteStrength: String(next),
          priorMastery: current?.stageRelativeMastery ?? null,
          nextMastery: String(mastery),
          stateVersion: nextStateVersion,
          stateJson: persisted,
        });

        for (const unit of eligibleUnits) {
          const idempotencyKey = sha256([decision.playerId, unit.aggregationUnitId, canonicalSkillId, "DEVELOPMENT"].join("|"));
          await tx.insert(canonicalEvidenceContributions).values({
            idempotencyKey,
            decisionId,
            aggregationUnitId: unit.aggregationUnitId,
            evidenceIds: observations.flatMap((observation) => observation.evidenceIds),
            academyId: decision.academyId,
            playerId: decision.playerId,
            canonicalSkillId,
            benchmarkId: benchmark.benchmarkId,
            componentKey: skillComponents.map((component) => component.componentKey).join(","),
            contributionRole: "DEVELOPMENT",
            priorStateVersion: observedVersion,
            resultingStateVersion: nextStateVersion,
            taxonomyConfigVersion: decision.taxonomyConfigVersion,
            benchmarkConfigVersion: decision.benchmarkConfigVersion,
            evidenceConfigVersion: decision.evidenceConfigVersion,
            strengthModelVersion: decision.strengthModelVersion,
            componentWeight: String(componentWeight),
            normalizedSourceReliability: String(unit.sourceReliability),
            normalizedProtocolQuality: String(unit.protocolQuality),
            normalizedObservationCompleteness: String(unit.observationCompleteness),
            normalizedBenchmarkRelevanceDifficulty: String(unit.benchmarkRelevanceDifficulty),
            normalizedRecency: String(unit.recency),
            normalizedIndependentCorroboration: String(unit.independentCorroboration),
            computedQ: String(q),
            absoluteDelta: String(next - (previous ?? next)),
          }).onConflictDoNothing();
        }
      }

      // This only runs in focused integration tests. A throw here occurs after
      // canonical writes and before commit, proving the transaction rolls back.
      applyFailureInjectorForTests?.();

      // Defensive backstop: acceptance validates idempotency, but a no-delta
      // application must never advance state/history if eligibility changes
      // between transactions.
      if (!stateChanges.length) {
        await tx.update(developmentDecisions).set({
          status: "NO_CHANGE",
          noChangeAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(developmentDecisions.id, decisionId));
        return { noChange: true, reason: "NO_NEW_ELIGIBLE_EVIDENCE" };
      }

      const allStateRows = await tx.select({
        canonicalSkillId: playerCanonicalSkillStates.canonicalSkillId,
        absoluteStrength: playerCanonicalSkillStates.absoluteStrength,
        observationStatus: playerCanonicalSkillStates.observationStatus,
        confidence: playerCanonicalSkillStates.confidence,
        family: canonicalSkillDefinitions.family,
        pillar: canonicalSkillDefinitions.pillar,
      }).from(playerCanonicalSkillStates)
        .innerJoin(canonicalSkillDefinitions, eq(canonicalSkillDefinitions.id, playerCanonicalSkillStates.canonicalSkillId))
        .where(eq(playerCanonicalSkillStates.playerId, decision.playerId));
      const aggregates = deriveAggregates(allStateRows);
      const placementStatus = aggregates.observedCount === 0 ? "UNASSESSED" : "PROVISIONAL";
      const aggregateJson = {
        stateVersion: nextStateVersion,
        placementStatus,
        glowStatus: aggregates.glowStatus,
        estimatedGlow: aggregates.estimatedGlow,
        coverage: aggregates.coverage,
        confidence: aggregates.confidence,
      };

      await tx.update(playerCanonicalProgression).set({
        stateVersion: nextStateVersion,
        placementStatus,
        glowStatus: aggregates.glowStatus,
        estimatedGlow: aggregates.estimatedGlow === null ? null : String(aggregates.estimatedGlow),
        glowCoverage: String(aggregates.coverage),
        glowConfidence: String(aggregates.confidence),
        lastDecisionId: decisionId,
        updatedAt: new Date(),
      }).where(eq(playerCanonicalProgression.playerId, decision.playerId));

      await tx.insert(canonicalDecisionSnapshots).values({
        decisionId,
        academyId: decision.academyId,
        playerId: decision.playerId,
        stateVersion: nextStateVersion,
        taxonomyConfigVersion: decision.taxonomyConfigVersion,
        benchmarkConfigVersion: decision.benchmarkConfigVersion,
        evidenceConfigVersion: decision.evidenceConfigVersion,
        strengthModelVersion: decision.strengthModelVersion,
        glowConfigVersion: decision.glowConfigVersion,
        aggregateJson,
        skillStatesJson: allStateRows,
        pillarJson: aggregates.pillars,
      });
      await tx.insert(canonicalDecisionApplicationReceipts).values({
        decisionId,
        playerId: decision.playerId,
        stateVersion: nextStateVersion,
      });
      await tx.update(developmentDecisions).set({
        status: "APPLIED",
        appliedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(developmentDecisions.id, decisionId));

      return { applied: true, stateVersion: nextStateVersion, changedSkillCount: stateChanges.length };
    });

    if ((result as any).stale) {
      await persistExecutionAttempt(
        decisionId,
        "STALE_STATE_VERSION",
        (result as any).expectedStateVersion,
        (result as any).observedStateVersion,
        "STALE_STATE_VERSION",
      );
      return { applied: false, stale: true, code: "STALE_STATE_VERSION" as const };
    }
    if ((result as any).noChange) {
      await persistExecutionAttempt(
        decisionId,
        "NO_CHANGE",
        null,
        null,
        "NO_NEW_ELIGIBLE_EVIDENCE",
        "IDEMPOTENCY_REVALIDATION",
      );
    } else if (!(result as any).alreadyApplied) {
      await persistExecutionAttempt(decisionId, "APPLIED", null, (result as any).stateVersion);
    }
    return result;
  } catch (error) {
    if (error instanceof CanonicalProgressionError) throw error;
    await persistExecutionAttempt(decisionId, "TECHNICAL_FAILURE", null, null, "TECHNICAL_FAILURE", "DATABASE_OR_APPLICATION");
    throw error;
  }
}

export async function readCanonicalCurrentSnapshot(
  executor: any,
  playerId: string,
  academyId: string,
): Promise<CanonicalCurrentSnapshot | null> {
  const [aggregate] = await executor.select().from(playerCanonicalProgression)
    .where(and(eq(playerCanonicalProgression.playerId, playerId), eq(playerCanonicalProgression.academyId, academyId)))
    .limit(1);
  if (!aggregate) return null;
  const skills = await executor.select({
    canonicalSkillId: playerCanonicalSkillStates.canonicalSkillId,
    absoluteStrength: playerCanonicalSkillStates.absoluteStrength,
    mastery: playerCanonicalSkillStates.stageRelativeMastery,
    observationStatus: playerCanonicalSkillStates.observationStatus,
    confidence: playerCanonicalSkillStates.confidence,
    coverage: playerCanonicalSkillStates.coverage,
    trend: playerCanonicalSkillStates.trend,
    lastEvidenceAt: playerCanonicalSkillStates.lastEvidenceAt,
    family: canonicalSkillDefinitions.family,
    pillar: canonicalSkillDefinitions.pillar,
  }).from(playerCanonicalSkillStates)
    .innerJoin(canonicalSkillDefinitions, eq(canonicalSkillDefinitions.id, playerCanonicalSkillStates.canonicalSkillId))
    .where(and(eq(playerCanonicalSkillStates.playerId, playerId), eq(playerCanonicalSkillStates.academyId, academyId)))
    .orderBy(asc(canonicalSkillDefinitions.family), asc(canonicalSkillDefinitions.id));
  const aggregateValues = deriveAggregates(skills);
  return {
    current: {
      playerId,
      academyId,
      stateVersion: aggregate.stateVersion,
      placementStatus: aggregate.placementStatus,
      glowStatus: aggregate.glowStatus,
      estimatedGlow: aggregate.estimatedGlow === null ? null : asNumber(aggregate.estimatedGlow),
      coverage: asNumber(aggregate.glowCoverage),
      confidence: asNumber(aggregate.glowConfidence),
      families: aggregateValues.families,
      pillars: aggregateValues.pillars,
      skills: skills.map((skill: {
        canonicalSkillId: string;
        absoluteStrength: unknown;
        mastery: unknown;
        observationStatus: string;
        confidence: unknown;
        coverage: unknown;
        trend: string;
        lastEvidenceAt: Date | null;
        family: string;
        pillar: string;
      }) => ({
        ...skill,
        absoluteStrength: skill.absoluteStrength === null ? null : asNumber(skill.absoluteStrength),
        mastery: skill.mastery === null ? null : asNumber(skill.mastery),
        confidence: asNumber(skill.confidence),
        coverage: asNumber(skill.coverage),
      })),
    },
    versions: {
      taxonomyConfigVersion: aggregate.taxonomyConfigVersion,
      benchmarkConfigVersion: aggregate.benchmarkConfigVersion,
      evidenceConfigVersion: aggregate.evidenceConfigVersion,
      strengthModelVersion: aggregate.strengthModelVersion,
      glowConfigVersion: aggregate.glowConfigVersion,
    },
    updatedAt: aggregate.updatedAt,
  };
}

/**
 * Read-only transactionally consistent canonical snapshot for downstream
 * evaluators. Unlike the Phase 2 public read helper, this never bootstraps
 * configuration or creates an aggregate row.
 */
export async function getCanonicalCurrentSnapshot(
  playerId: string,
  academyId: string,
): Promise<CanonicalCurrentSnapshot | null> {
  return db.transaction(
    (tx) => readCanonicalCurrentSnapshot(tx, playerId, academyId),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getCanonicalCurrent(playerId: string, academyId: string): Promise<CanonicalCurrentDto | null> {
  await ensureCanonicalProgressionConfigPersisted();
  const snapshot = await readCanonicalCurrentSnapshot(db, playerId, academyId);
  return snapshot?.current ?? null;
}

export async function getCanonicalHistory(playerId: string, academyId: string, limit = 50) {
  const safeLimit = clamp(Math.floor(limit), 1, 200);
  return db.select().from(playerCanonicalSkillHistory)
    .where(and(
      eq(playerCanonicalSkillHistory.playerId, playerId),
      eq(playerCanonicalSkillHistory.academyId, academyId),
    ))
    .orderBy(desc(playerCanonicalSkillHistory.createdAt))
    .limit(safeLimit);
}