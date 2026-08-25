/**
 * Trusted persistence boundary for Deep Assessment submissions.
 *
 * Scores remain part of the legacy assessment record. The immutable observation
 * documents the authenticated coach's assessment capture and is the only Deep
 * Assessment data that can later become delta-eligible evidence.
 */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  canonicalBenchmarkComponents,
  canonicalBenchmarkDefinitions,
  deepAssessmentSkills,
  deepAssessmentTrustedObservations,
  playerDeepAssessments,
  type PlayerDeepAssessment,
} from "@shared/schema";

const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);
const SERVER_CAPTURE_PREFIX = "deep-assessment-capture:";

export class DeepAssessmentPersistenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "DeepAssessmentPersistenceError";
  }
}

export type DeepAssessmentScope = {
  academyId: string;
  playerId: string;
  coachId: string | null | undefined;
};

type NormalizedAssessmentInput = {
  skillId: string;
  score: number | null;
  confidence: string;
  notes?: string | null;
  evidenceUrl?: string | null;
  sessionId?: string | null;
};

type TrustedObservationCapture = {
  underlyingEventOrSessionId: string;
  observationWindow: string;
  observedRequiredObservations: number;
  requiredObservations: number;
  occurredAt: Date;
  benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT" | "EXPLICIT_ADJACENT_COMPONENT";
};

type PreparedSubmission = {
  assessment: NormalizedAssessmentInput;
  observation: TrustedObservationCapture;
  idempotencyKey: string;
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function assertNonEmptyString(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_DEEP_ASSESSMENT_CAPTURE",
      `${label} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value;
}

function normalizeAssessmentInput(raw: unknown, rejectObservationFields: boolean): NormalizedAssessmentInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DeepAssessmentPersistenceError("INVALID_DEEP_ASSESSMENT", "Each assessment must be an object");
  }
  const item = raw as Record<string, unknown>;
  if (rejectObservationFields) {
    const forbidden = [
      "trustedObservation",
      "academyId",
      "playerId",
      "coachId",
      "benchmarkId",
      "canonicalSkillId",
      "verifiedObserverIds",
      "occurredAt",
      "observationWindow",
      "underlyingEventOrSessionId",
      "benchmarkRelevance",
      "requiredObservations",
      "observedRequiredObservations",
    ];
    if (forbidden.some((field) => Object.prototype.hasOwnProperty.call(item, field))) {
      throw new DeepAssessmentPersistenceError(
        "CLIENT_SCOPE_FIELDS_FORBIDDEN",
        "Bulk Deep Assessment submissions cannot supply trusted observation, scope, or canonical binding fields",
      );
    }
  }

  const skillId = assertNonEmptyString(item.skillId, "skillId");
  if (item.score !== null && (!Number.isInteger(item.score) || (item.score as number) < 0 || (item.score as number) > 3)) {
    throw new DeepAssessmentPersistenceError("INVALID_DEEP_ASSESSMENT_SCORE", "score must be null or an integer from 0 to 3");
  }
  const confidence = item.confidence === undefined ? "medium" : item.confidence;
  if (typeof confidence !== "string" || !CONFIDENCE_VALUES.has(confidence)) {
    throw new DeepAssessmentPersistenceError("INVALID_DEEP_ASSESSMENT_CONFIDENCE", "confidence must be low, medium, or high");
  }
  for (const field of ["notes", "evidenceUrl", "sessionId"] as const) {
    if (item[field] !== undefined && item[field] !== null && typeof item[field] !== "string") {
      throw new DeepAssessmentPersistenceError("INVALID_DEEP_ASSESSMENT", `${field} must be a string or null`);
    }
  }
  return {
    skillId,
    score: item.score as number | null,
    confidence,
    notes: item.notes as string | null | undefined,
    evidenceUrl: item.evidenceUrl as string | null | undefined,
    sessionId: item.sessionId as string | null | undefined,
  };
}

function normalizeExplicitObservation(raw: unknown): TrustedObservationCapture {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_TRUSTED_OBSERVATION",
      "A complete trusted observation is required",
    );
  }
  const observation = raw as Record<string, unknown>;
  const occurredAt = new Date(String(observation.occurredAt ?? ""));
  const benchmarkRelevance = observation.benchmarkRelevance;
  if (
    !Number.isInteger(observation.observedRequiredObservations)
    || (observation.observedRequiredObservations as number) < 0
    || !Number.isInteger(observation.requiredObservations)
    || (observation.requiredObservations as number) <= 0
    || Number.isNaN(occurredAt.getTime())
    || (benchmarkRelevance !== "EXACT_BENCHMARK_COMPONENT"
      && benchmarkRelevance !== "EXPLICIT_ADJACENT_COMPONENT")
  ) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_TRUSTED_OBSERVATION",
      "A complete trusted observation requires valid observation counts, occurredAt, and benchmark relevance",
    );
  }
  return {
    underlyingEventOrSessionId: assertNonEmptyString(
      observation.underlyingEventOrSessionId,
      "underlyingEventOrSessionId",
      300,
    ),
    observationWindow: assertNonEmptyString(observation.observationWindow, "observationWindow", 300),
    observedRequiredObservations: observation.observedRequiredObservations as number,
    requiredObservations: observation.requiredObservations as number,
    occurredAt,
    benchmarkRelevance,
  };
}

async function resolveUniqueAbilityBinding(tx: any, skillId: string) {
  const rows = await tx.select({
    benchmarkId: canonicalBenchmarkDefinitions.benchmarkId,
    canonicalSkillId: canonicalBenchmarkComponents.canonicalSkillId,
  }).from(deepAssessmentSkills)
    .innerJoin(
      canonicalBenchmarkDefinitions,
      eq(canonicalBenchmarkDefinitions.sourceSkillId, deepAssessmentSkills.skillKey),
    )
    .innerJoin(
      canonicalBenchmarkComponents,
      eq(canonicalBenchmarkComponents.benchmarkDefinitionId, canonicalBenchmarkDefinitions.id),
    )
    .where(and(
      eq(deepAssessmentSkills.id, skillId),
      eq(deepAssessmentSkills.isActive, true),
      eq(canonicalBenchmarkComponents.isAbilityBearing, true),
    ));
  const unique = [...new Map(
    rows.map((row: any) => [`${row.benchmarkId}|${row.canonicalSkillId}`, row]),
  ).values()];
  if (unique.length !== 1) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_CANONICAL_BINDING",
      "Deep Assessment skill has no unique Ability-bearing canonical binding",
    );
  }
  return unique[0] as { benchmarkId: string; canonicalSkillId: string };
}

async function upsertAssessment(tx: any, scope: DeepAssessmentScope, assessment: NormalizedAssessmentInput) {
  const [saved] = await tx.insert(playerDeepAssessments).values({
    playerId: scope.playerId,
    skillId: assessment.skillId,
    score: assessment.score,
    confidence: assessment.confidence,
    notes: assessment.notes,
    evidenceUrl: assessment.evidenceUrl,
    coachId: scope.coachId ?? null,
    academyId: scope.academyId,
    sessionId: assessment.sessionId,
    assessmentCount: 1,
  }).onConflictDoUpdate({
    target: [playerDeepAssessments.playerId, playerDeepAssessments.skillId],
    set: {
      score: assessment.score,
      confidence: assessment.confidence,
      notes: assessment.notes,
      evidenceUrl: assessment.evidenceUrl,
      coachId: scope.coachId ?? null,
      sessionId: assessment.sessionId,
      previousScore: sql`${playerDeepAssessments.score}`,
      assessmentCount: sql`COALESCE(${playerDeepAssessments.assessmentCount}, 0) + 1`,
      updatedAt: new Date(),
    },
  }).returning();
  if (!saved) {
    throw new DeepAssessmentPersistenceError("DEEP_ASSESSMENT_SAVE_FAILED", "Unable to save Deep Assessment", 500);
  }
  return saved;
}

async function persistTrustedSubmissions(
  scope: DeepAssessmentScope,
  submissions: PreparedSubmission[],
): Promise<PlayerDeepAssessment[]> {
  if (!scope.coachId) {
    throw new DeepAssessmentPersistenceError(
      "AUTHENTICATED_COACH_REQUIRED",
      "A complete trusted observation requires an authenticated coach",
    );
  }
  return db.transaction(async (tx) => {
    const prepared = await Promise.all(submissions.map(async (submission) => ({
      ...submission,
      binding: await resolveUniqueAbilityBinding(tx, submission.assessment.skillId),
    })));

    // Lock retry keys in a stable order. This prevents two concurrent retries
    // from both updating the assessment before one loses the unique insert.
    for (const submission of [...prepared].sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey))) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${submission.idempotencyKey}))`);
    }

    const saved: PlayerDeepAssessment[] = [];
    for (const submission of prepared) {
      const [existingObservation] = await tx.select({
        deepAssessmentId: deepAssessmentTrustedObservations.deepAssessmentId,
      }).from(deepAssessmentTrustedObservations)
        .where(eq(deepAssessmentTrustedObservations.idempotencyKey, submission.idempotencyKey))
        .limit(1);
      if (existingObservation) {
        const [existingAssessment] = await tx.select().from(playerDeepAssessments)
          .where(eq(playerDeepAssessments.id, existingObservation.deepAssessmentId))
          .limit(1);
        if (!existingAssessment) {
          throw new DeepAssessmentPersistenceError(
            "TRUSTED_OBSERVATION_INTEGRITY_ERROR",
            "Trusted observation points to a missing Deep Assessment",
            500,
          );
        }
        saved.push(existingAssessment);
        continue;
      }

      const assessment = await upsertAssessment(tx, scope, submission.assessment);
      await tx.insert(deepAssessmentTrustedObservations).values({
        deepAssessmentId: assessment.id,
        playerId: scope.playerId,
        academyId: scope.academyId,
        benchmarkId: submission.binding.benchmarkId,
        canonicalSkillId: submission.binding.canonicalSkillId,
        sourceSystem: "deep_assessment",
        underlyingEventOrSessionId: submission.observation.underlyingEventOrSessionId,
        observationWindow: submission.observation.observationWindow,
        sourceType: "COACH_DEEP_ASSESSMENT",
        observedRequiredObservations: submission.observation.observedRequiredObservations,
        requiredObservations: submission.observation.requiredObservations,
        occurredAt: submission.observation.occurredAt,
        benchmarkRelevance: submission.observation.benchmarkRelevance,
        verifiedObserverIds: [scope.coachId],
        idempotencyKey: submission.idempotencyKey,
      });
      saved.push(assessment);
    }
    return saved;
  });
}

/**
 * Saves the normal drawer's batch. The client can only provide a retry token;
 * all Phase 2 observation fields are bound at this server-side boundary.
 */
export async function persistBulkDeepAssessments(
  scope: DeepAssessmentScope,
  captureId: unknown,
  rawAssessments: unknown,
): Promise<PlayerDeepAssessment[]> {
  const normalizedCaptureId = assertNonEmptyString(captureId, "captureId", 128);
  if (!Array.isArray(rawAssessments) || rawAssessments.length === 0 || rawAssessments.length > 200) {
    throw new DeepAssessmentPersistenceError(
      "INVALID_DEEP_ASSESSMENT_BATCH",
      "assessments must contain between 1 and 200 entries",
    );
  }
  const assessments = rawAssessments.map((item) => normalizeAssessmentInput(item, true));
  if (new Set(assessments.map((assessment) => assessment.skillId)).size !== assessments.length) {
    throw new DeepAssessmentPersistenceError(
      "DUPLICATE_DEEP_ASSESSMENT_SKILL",
      "A batch may contain each Deep Assessment skill only once",
    );
  }
  const occurredAt = new Date();
  return persistTrustedSubmissions(scope, assessments.map((assessment) => ({
    assessment,
    observation: {
      underlyingEventOrSessionId: `${SERVER_CAPTURE_PREFIX}${normalizedCaptureId}`,
      observationWindow: `${SERVER_CAPTURE_PREFIX}${normalizedCaptureId}`,
      observedRequiredObservations: 1,
      requiredObservations: 1,
      occurredAt,
      benchmarkRelevance: "EXACT_BENCHMARK_COMPONENT",
    },
    // The retry key includes the complete mutable legacy payload. A changed
    // score is a new submission, never silently treated as a retry.
    idempotencyKey: hash({ version: 1, scope: [scope.academyId, scope.playerId], captureId: normalizedCaptureId, assessment }),
  })));
}

/**
 * Preserves the existing explicit single-capture API while routing its binding,
 * append-only persistence, transaction, and retry behavior through the same
 * trusted boundary as bulk.
 */
export async function persistSingleDeepAssessment(
  scope: DeepAssessmentScope,
  rawAssessment: unknown,
  rawTrustedObservation: unknown | undefined,
): Promise<PlayerDeepAssessment> {
  const assessment = normalizeAssessmentInput(rawAssessment, false);
  if (rawTrustedObservation === undefined) {
    return db.transaction((tx) => upsertAssessment(tx, scope, assessment));
  }
  const observation = normalizeExplicitObservation(rawTrustedObservation);
  const [saved] = await persistTrustedSubmissions(scope, [{
    assessment,
    observation,
    idempotencyKey: hash({
      version: 1,
      scope: [scope.academyId, scope.playerId],
      assessment,
      observation: {
        ...observation,
        occurredAt: observation.occurredAt.toISOString(),
      },
    }),
  }]);
  return saved;
}