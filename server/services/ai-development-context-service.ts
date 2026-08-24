/**
 * Phase 3A — server-owned development context.
 *
 * This module deliberately stops before model invocation and before any
 * DevelopmentDecision or canonical state write. It only assembles a
 * transactionally consistent, versioned read context from authenticated
 * server state.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  academies,
  canonicalBenchmarkComponents,
  canonicalBenchmarkDefinitions,
  players,
  skillEvidence,
} from "@shared/schema";
import {
  readCanonicalCurrentSnapshot,
  type CanonicalCurrentSnapshot,
} from "./canonical-progression-service";
import {
  canEvaluateDevelopmentContext,
  type PolicyResult,
  type ProgressionActor,
} from "../lib/progression-actor-policy";

export const DEVELOPMENT_CONTEXT_CONTRACT_VERSION = "phase-3a-development-context.v1";
const CONSISTENT_READ_TRANSACTION = {
  isolationLevel: "repeatable read" as const,
  accessMode: "read only" as const,
};

export const developmentEvaluationTriggerSchema = z.enum([
  "COACH_REQUEST",
  "EVIDENCE_UPDATED",
  "REASSESSMENT",
]);
export type DevelopmentEvaluationTrigger = z.infer<typeof developmentEvaluationTriggerSchema>;

const isoDateSchema = z.string().datetime({ offset: true });
const aggregateDimensionSchema = z.object({
  strength: z.number().nullable(),
  coverage: z.number(),
  confidence: z.number(),
}).strict();

const canonicalCurrentSchema = z.object({
  playerId: z.string().min(1),
  academyId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  placementStatus: z.string(),
  glowStatus: z.string(),
  estimatedGlow: z.number().nullable(),
  coverage: z.number(),
  confidence: z.number(),
  families: z.record(z.string(), aggregateDimensionSchema),
  pillars: z.record(z.string(), aggregateDimensionSchema),
  skills: z.array(z.object({
    canonicalSkillId: z.string(),
    absoluteStrength: z.number().nullable(),
    mastery: z.number().nullable(),
    observationStatus: z.string(),
    confidence: z.number(),
    coverage: z.number(),
    trend: z.string(),
    lastEvidenceAt: isoDateSchema.nullable(),
    family: z.string(),
    pillar: z.string(),
  }).strict()),
}).strict();

const canonicalVersionsSchema = z.object({
  taxonomyConfigVersion: z.string().min(1),
  benchmarkConfigVersion: z.string().min(1),
  evidenceConfigVersion: z.string().min(1),
  strengthModelVersion: z.string().min(1),
  glowConfigVersion: z.string().min(1),
}).strict();

export const developmentContextEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  playerId: z.string().min(1),
  sourceSkillId: z.string().min(1),
  sessionId: z.string().nullable(),
  trialId: z.string().nullable(),
  captureType: z.string().min(1),
  status: z.literal("approved"),
  createdAt: isoDateSchema,
  reviewedAt: isoDateSchema.nullable(),
  reviewScore: z.number().int().min(0).max(2).nullable(),
  canonicalSkillIds: z.array(z.string().min(1)).min(1),
  benchmarkIds: z.array(z.string().min(1)).min(1),
  componentKeys: z.array(z.string().min(1)).min(1),
  relevance: z.enum(["EXACT_BENCHMARK_COMPONENT", "EXPLICIT_ADJACENT_COMPONENT"]),
  relevanceScore: z.number().finite(),
  deltaEligibility: z.enum(["DELTA_ELIGIBLE", "CONTEXT_ONLY"]),
  trustedObservation: z.object({
    evidenceIds: z.array(z.string().min(1)).min(1),
    sourceSystem: z.string().min(1),
    underlyingEventOrSessionId: z.string().min(1),
    observationWindow: z.string().min(1),
    sourceType: z.string().min(1),
    observedRequiredObservations: z.number().int().nonnegative(),
    requiredObservations: z.number().int().positive(),
    occurredAt: isoDateSchema,
    benchmarkRelevance: z.enum(["EXACT_BENCHMARK_COMPONENT", "EXPLICIT_ADJACENT_COMPONENT"]),
    verifiedObserverIds: z.array(z.string().min(1)),
  }).nullable(),
}).strict();
export type DevelopmentContextEvidence = z.infer<typeof developmentContextEvidenceSchema>;

export const developmentContextSchema = z.object({
  contractVersion: z.literal(DEVELOPMENT_CONTEXT_CONTRACT_VERSION),
  trigger: developmentEvaluationTriggerSchema,
  actor: z.object({
    userId: z.string().min(1),
    authority: z.string().min(1),
  }).strict(),
  target: z.object({
    playerId: z.string().min(1),
    academyId: z.string().min(1),
  }).strict(),
  canonical: z.object({
    current: canonicalCurrentSchema,
    stateVersion: z.number().int().nonnegative(),
    versions: canonicalVersionsSchema,
    capturedAt: isoDateSchema,
    updatedAt: isoDateSchema,
  }).strict(),
  evidence: z.array(developmentContextEvidenceSchema),
  retrieval: z.object({
    candidateCount: z.number().int().nonnegative(),
    deduplicatedCount: z.number().int().nonnegative(),
    relevantCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type DevelopmentContext = z.infer<typeof developmentContextSchema>;

export class DevelopmentContextError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "DevelopmentContextError";
  }
}

interface BenchmarkMapping {
  benchmarkId: string;
  canonicalSkillId: string;
  componentKey: string;
  isAbilityBearing: boolean;
  mappingReason: string | null;
}

export interface EvidenceAssemblyCandidate {
  evidenceId: string;
  playerId: string;
  academyId: string | null;
  sourceSkillId: string;
  sessionId: string | null;
  trialId: string | null;
  captureType: string;
  status: string;
  createdAt: Date | string | null;
  reviewedAt: Date | string | null;
  reviewScore: number | null;
  mappings: BenchmarkMapping[];
  /** Only populated by a source that already persists the complete trusted observation contract. */
  trustedObservation?: {
    evidenceIds: string[];
    sourceSystem: string;
    underlyingEventOrSessionId: string;
    observationWindow: string;
    sourceType: string;
    observedRequiredObservations: number;
    requiredObservations: number;
    occurredAt: Date | string;
    benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT" | "EXPLICIT_ADJACENT_COMPONENT";
    verifiedObserverIds: string[];
  } | null;
}

export interface EvidenceOwnership {
  playerId: string;
  academyId: string;
}

function toIso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function serializeCanonicalCurrent(snapshot: CanonicalCurrentSnapshot["current"]) {
  return {
    ...snapshot,
    skills: snapshot.skills.map((skill) => ({
      ...skill,
      lastEvidenceAt: toIso(skill.lastEvidenceAt),
    })),
  };
}

function mappingRelevance(mapping: BenchmarkMapping): "EXACT_BENCHMARK_COMPONENT" | "EXPLICIT_ADJACENT_COMPONENT" {
  return /adjacent/i.test(mapping.mappingReason ?? "")
    ? "EXPLICIT_ADJACENT_COMPONENT"
    : "EXACT_BENCHMARK_COMPONENT";
}

function compareNullableDatesDescending(a: Date | string | null, b: Date | string | null): number {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return bTime - aTime;
}

/**
 * Pure deterministic assembly step. DB rows are intentionally accepted as
 * input so this can be tested without a database and so duplicate join rows
 * cannot alter the returned context.
 */
export function assembleRelevantEvidence(
  candidates: EvidenceAssemblyCandidate[],
  expectedOwnership?: EvidenceOwnership,
): DevelopmentContextEvidence[] {
  const byId = new Map<string, EvidenceAssemblyCandidate>();
  for (const candidate of candidates) {
    if (
      candidate.status !== "approved" ||
      candidate.academyId === null ||
      candidate.createdAt === null ||
      candidate.playerId.length === 0 ||
      candidate.mappings.length === 0
    ) {
      continue;
    }
    if (
      expectedOwnership
      && (candidate.playerId !== expectedOwnership.playerId || candidate.academyId !== expectedOwnership.academyId)
    ) {
      continue;
    }
    const existing = byId.get(candidate.evidenceId);
    if (!existing) {
      byId.set(candidate.evidenceId, {
        ...candidate,
        mappings: [...candidate.mappings],
      });
    } else {
      const mappingKeys = new Set(existing.mappings.map((m) => `${m.benchmarkId}|${m.componentKey}|${m.canonicalSkillId}`));
      for (const mapping of candidate.mappings) {
        const key = `${mapping.benchmarkId}|${mapping.componentKey}|${mapping.canonicalSkillId}`;
        if (!mappingKeys.has(key)) {
          existing.mappings.push(mapping);
          mappingKeys.add(key);
        }
      }
    }
  }

  return [...byId.values()]
    .map((candidate) => {
      const mappings = [...candidate.mappings].sort((a, b) =>
        a.benchmarkId.localeCompare(b.benchmarkId)
        || a.componentKey.localeCompare(b.componentKey)
        || a.canonicalSkillId.localeCompare(b.canonicalSkillId),
      );
      const relevance: "EXACT_BENCHMARK_COMPONENT" | "EXPLICIT_ADJACENT_COMPONENT" = mappings.some((mapping) => mappingRelevance(mapping) === "EXACT_BENCHMARK_COMPONENT")
        ? "EXACT_BENCHMARK_COMPONENT"
        : "EXPLICIT_ADJACENT_COMPONENT";
      const canonicalSkillIds = [...new Set(mappings.map((mapping) => mapping.canonicalSkillId))].sort();
      const benchmarkIds = [...new Set(mappings.map((mapping) => mapping.benchmarkId))].sort();
      const componentKeys = [...new Set(mappings.map((mapping) => mapping.componentKey))].sort();
      const relevanceScore =
        (relevance === "EXACT_BENCHMARK_COMPONENT" ? 100 : 50)
        + mappings.filter((mapping) => mapping.isAbilityBearing).length;
      return {
        evidenceId: candidate.evidenceId,
        playerId: candidate.playerId,
        sourceSkillId: candidate.sourceSkillId,
        sessionId: candidate.sessionId,
        trialId: candidate.trialId,
        captureType: candidate.captureType,
        status: "approved" as const,
        createdAt: toIso(candidate.createdAt)!,
        reviewedAt: toIso(candidate.reviewedAt),
        reviewScore: candidate.reviewScore,
        canonicalSkillIds,
        benchmarkIds,
        componentKeys,
        relevance,
        relevanceScore,
        deltaEligibility: candidate.trustedObservation ? "DELTA_ELIGIBLE" as const : "CONTEXT_ONLY" as const,
        trustedObservation: candidate.trustedObservation
          ? {
              ...candidate.trustedObservation,
              occurredAt: new Date(candidate.trustedObservation.occurredAt).toISOString(),
            }
          : null,
      };
    })
    .sort((a, b) =>
      b.relevanceScore - a.relevanceScore
      || (b.reviewScore ?? -1) - (a.reviewScore ?? -1)
      || compareNullableDatesDescending(a.reviewedAt, b.reviewedAt)
      || compareNullableDatesDescending(a.createdAt, b.createdAt)
      || a.evidenceId.localeCompare(b.evidenceId),
    );
}

function asProgressionActor(user: {
  userId: string;
  coachId?: string | null;
  playerId?: string | null;
  academyId?: string | null;
  role?: string | null;
}): ProgressionActor {
  return {
    userId: user.userId,
    coachId: user.coachId ?? null,
    playerId: user.playerId ?? null,
    academyId: user.academyId ?? null,
    role: user.role ?? null,
  };
}

type TransactionExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getDevelopmentContext(
  user: {
    userId: string;
    coachId?: string | null;
    playerId?: string | null;
    role?: string | null;
    academyId?: string | null;
    currentAcademyId?: string | null;
  },
  targetPlayerId: string,
  trigger: DevelopmentEvaluationTrigger,
): Promise<DevelopmentContext> {
  const academyId = user.currentAcademyId ?? user.academyId ?? null;
  const actor = asProgressionActor({ ...user, academyId });
  const policy: PolicyResult = await canEvaluateDevelopmentContext(actor, targetPlayerId);
  if (!policy.allowed) {
    throw new DevelopmentContextError("ACTOR_NOT_AUTHORIZED", policy.reason ?? "Insufficient permissions", 403);
  }
  if (!academyId) {
    throw new DevelopmentContextError("ACADEMY_NOT_RESOLVED", "Academy context could not be resolved", 403);
  }
  if (!targetPlayerId) {
    throw new DevelopmentContextError("PLAYER_NOT_RESOLVED", "Target player is required", 400);
  }

  return db.transaction(
    async (tx) => buildDevelopmentContextInTransaction(
      tx,
      actor,
      policy.authority ?? "member",
      academyId,
      targetPlayerId,
      trigger,
    ),
    CONSISTENT_READ_TRANSACTION,
  );
}

async function buildDevelopmentContextInTransaction(
  tx: TransactionExecutor,
  actor: ProgressionActor,
  authority: string,
  academyId: string,
  targetPlayerId: string,
  trigger: DevelopmentEvaluationTrigger,
): Promise<DevelopmentContext> {
  const [academy] = await tx.select({ id: academies.id })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!academy) {
    throw new DevelopmentContextError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  const [target] = await tx.select({
    id: players.id,
    academyId: players.academyId,
  })
    .from(players)
    .where(and(eq(players.id, targetPlayerId), eq(players.academyId, academyId)))
    .limit(1);
  if (!target || target.academyId !== academyId) {
    throw new DevelopmentContextError("PLAYER_NOT_FOUND", "Player is not in the active academy", 404);
  }

  const snapshot: CanonicalCurrentSnapshot | null = await readCanonicalCurrentSnapshot(
    tx,
    targetPlayerId,
    academyId,
  );
  if (!snapshot) {
    throw new DevelopmentContextError(
      "CANONICAL_STATE_NOT_INITIALIZED",
      "Canonical progression has not been initialized for this player",
      404,
    );
  }

  const evidenceRows = await tx.select({
    id: skillEvidence.id,
    playerId: skillEvidence.playerId,
    academyId: players.academyId,
    skillId: skillEvidence.skillId,
    sessionId: skillEvidence.sessionId,
    trialId: skillEvidence.trialId,
    captureType: skillEvidence.captureType,
    status: skillEvidence.status,
    createdAt: skillEvidence.createdAt,
    reviewedAt: skillEvidence.reviewedAt,
    reviewScore: skillEvidence.reviewScore,
  })
    .from(skillEvidence)
    .innerJoin(players, eq(skillEvidence.playerId, players.id))
    .where(and(
      eq(skillEvidence.playerId, targetPlayerId),
      eq(players.academyId, academyId),
      eq(skillEvidence.status, "approved"),
    ))
    .orderBy(desc(skillEvidence.createdAt), asc(skillEvidence.id));

  // Evidence owns no academy column. The join above is the first ownership
  // check; this explicit filter is a second defensive check before assembly.
  const ownedEvidence = evidenceRows.filter((row) =>
    row.playerId === targetPlayerId && row.academyId === academyId && row.status === "approved",
  );
  const sourceSkillIds = [...new Set(ownedEvidence.map((row) => row.skillId))];
  const mappingRows = sourceSkillIds.length === 0
    ? []
    : await tx.select({
        sourceSkillId: canonicalBenchmarkDefinitions.sourceSkillId,
        benchmarkId: canonicalBenchmarkDefinitions.benchmarkId,
        canonicalSkillId: canonicalBenchmarkComponents.canonicalSkillId,
        componentKey: canonicalBenchmarkComponents.componentKey,
        isAbilityBearing: canonicalBenchmarkComponents.isAbilityBearing,
        mappingReason: canonicalBenchmarkComponents.mappingReason,
      })
        .from(canonicalBenchmarkComponents)
        .innerJoin(
          canonicalBenchmarkDefinitions,
          eq(canonicalBenchmarkComponents.benchmarkDefinitionId, canonicalBenchmarkDefinitions.id),
        )
        .where(and(
          eq(canonicalBenchmarkDefinitions.benchmarkConfigVersion, snapshot.versions.benchmarkConfigVersion),
          inArray(canonicalBenchmarkDefinitions.sourceSkillId, sourceSkillIds),
        ))
        .orderBy(
          asc(canonicalBenchmarkDefinitions.sourceSkillId),
          asc(canonicalBenchmarkDefinitions.benchmarkId),
          asc(canonicalBenchmarkComponents.componentKey),
        )
    ;

  const mappingsBySourceSkill = new Map<string, BenchmarkMapping[]>();
  for (const row of mappingRows) {
    const mapping: BenchmarkMapping = {
      benchmarkId: row.benchmarkId,
      canonicalSkillId: row.canonicalSkillId,
      componentKey: row.componentKey,
      isAbilityBearing: row.isAbilityBearing,
      mappingReason: row.mappingReason,
    };
    const mappings = mappingsBySourceSkill.get(row.sourceSkillId) ?? [];
    mappings.push(mapping);
    mappingsBySourceSkill.set(row.sourceSkillId, mappings);
  }

  const candidates: EvidenceAssemblyCandidate[] = ownedEvidence.map((row) => ({
    evidenceId: row.id,
    playerId: row.playerId,
    academyId: row.academyId,
    sourceSkillId: row.skillId,
    sessionId: row.sessionId,
    trialId: row.trialId,
    captureType: row.captureType,
    status: row.status,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    reviewScore: row.reviewScore,
    mappings: mappingsBySourceSkill.get(row.skillId) ?? [],
    // skill_evidence does not persist the complete Phase 2 observation
    // contract. Never infer it from captureType, timestamps, or review data.
    trustedObservation: null,
  }));
  const evidence = assembleRelevantEvidence(candidates, {
    playerId: targetPlayerId,
    academyId,
  });
  const capturedAt = new Date().toISOString();

  return developmentContextSchema.parse({
    contractVersion: DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
    trigger,
    actor: {
      userId: actor.userId,
      authority,
    },
    target: {
      playerId: targetPlayerId,
      academyId,
    },
    canonical: {
      current: serializeCanonicalCurrent(snapshot.current),
      stateVersion: snapshot.current.stateVersion,
      versions: snapshot.versions,
      capturedAt,
      updatedAt: snapshot.updatedAt.toISOString(),
    },
    evidence,
    retrieval: {
      candidateCount: ownedEvidence.length,
      deduplicatedCount: new Set(candidates.map((candidate) => candidate.evidenceId)).size,
      relevantCount: evidence.length,
    },
  });
}