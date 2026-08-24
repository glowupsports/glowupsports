/**
 * Phase 3B — server-side AI development interpretation.
 *
 * The Phase 3A context is the only model input. Model output is untrusted and
 * is validated against that exact context before it is persisted as evaluation
 * provenance. This service intentionally never creates or applies a
 * DevelopmentDecision and never writes canonical progression state.
 */
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { aiDevelopmentEvaluations } from "@shared/schema";
import { logAiCall } from "../middleware/aiQuotaMiddleware";
import { getAcademyBudgetState } from "./aiBudgetService";
import {
  DEVELOPMENT_CONTEXT_CONTRACT_VERSION,
  getDevelopmentContext,
  type DevelopmentContext,
  type DevelopmentEvaluationTrigger,
} from "./ai-development-context-service";

export const AI_DEVELOPMENT_EVALUATION_VERSION = "phase-3b-ai-development-evaluation.v1";
export const AI_DEVELOPMENT_PROMPT_VERSION = "phase-3b-development-coach-prompt.v1";
export const AI_DEVELOPMENT_MODEL = "gpt-5-mini";
const AI_DEVELOPMENT_TIMEOUT_MS = 15_000;

const versionsSchema = z.object({
  taxonomyConfigVersion: z.string().min(1),
  benchmarkConfigVersion: z.string().min(1),
  evidenceConfigVersion: z.string().min(1),
  strengthModelVersion: z.string().min(1),
  glowConfigVersion: z.string().min(1),
}).strict();

const affectedSkillSchema = z.object({
  canonicalSkillId: z.string().min(1),
  benchmarkId: z.string().min(1),
  benchmarkRelativeMastery: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  trend: z.enum(["IMPROVING", "STABLE", "DECLINING", "UNCERTAIN"]),
}).strict();

const prioritySchema = z.object({
  canonicalSkillId: z.string().min(1),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  focus: z.string().min(1).max(500),
}).strict();

const missingEvidenceSchema = z.object({
  canonicalSkillId: z.string().min(1).nullable(),
  request: z.string().min(1).max(500),
}).strict();

/**
 * The model must return this complete envelope. Keeping server/context
 * identity and versions in the model output makes stale or cross-player
 * responses rejectable rather than silently attachable to a new evaluation.
 */
export const aiDevelopmentInterpretationSchema = z.object({
  interpretationVersion: z.literal(AI_DEVELOPMENT_EVALUATION_VERSION),
  contextContractVersion: z.literal(DEVELOPMENT_CONTEXT_CONTRACT_VERSION),
  playerId: z.string().min(1),
  academyId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  versions: versionsSchema,
  outcome: z.enum(["INTERPRETATION", "NO_CHANGE", "INSUFFICIENT_EVIDENCE"]),
  affectedSkills: z.array(affectedSkillSchema),
  supportingEvidenceIds: z.array(z.string().min(1)),
  contradictingEvidenceIds: z.array(z.string().min(1)),
  trend: z.enum(["IMPROVING", "STABLE", "DECLINING", "MIXED", "UNCERTAIN"]),
  rationale: z.string().min(1).max(4000),
  uncertainty: z.string().min(1).max(2000),
  priorities: z.array(prioritySchema),
  missingEvidenceRequests: z.array(missingEvidenceSchema),
}).strict();
export type AiDevelopmentInterpretation = z.infer<typeof aiDevelopmentInterpretationSchema>;

export type DevelopmentEvaluationStatus =
  | "PROCESSING"
  | "INTERPRETATION"
  | "NO_CHANGE"
  | "INSUFFICIENT_EVIDENCE"
  | "REJECTED"
  | "FAILED"
  | "DUPLICATE";

export interface DevelopmentEvaluationResult {
  evaluationId: string;
  status: DevelopmentEvaluationStatus;
  duplicate: boolean;
  interpretation: AiDevelopmentInterpretation | null;
  provenance: {
    evaluationVersion: string;
    contextContractVersion: string;
    contextHash: string;
    promptVersion: string;
    promptHash: string;
    model: string;
    stateVersion: number;
    versions: DevelopmentContext["canonical"]["versions"];
  };
  diagnostics: Record<string, unknown>;
}

export class DevelopmentInterpretationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "DevelopmentInterpretationError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableContextHash(context: DevelopmentContext): string {
  return sha256(JSON.stringify({
    ...context,
    canonical: {
      ...context.canonical,
      capturedAt: undefined,
    },
  }));
}

function promptForContext(context: DevelopmentContext): { system: string; user: string } {
  const system = [
    `You are the Glow Up Sports AI Coach development interpreter.`,
    `Prompt version: ${AI_DEVELOPMENT_PROMPT_VERSION}.`,
    `Evaluation version: ${AI_DEVELOPMENT_EVALUATION_VERSION}.`,
    "Return JSON only and exactly match the requested interpretation schema.",
    "Treat the supplied context as authoritative and do not invent player, academy, skill, benchmark, state, version, or evidence identifiers.",
    "Use benchmarkRelativeMastery and confidence in the inclusive range 0..1.",
    "Use NO_CHANGE when the trusted evidence does not justify a change and INSUFFICIENT_EVIDENCE when more observation is required.",
    "This is an interpretation only. Do not propose an executable canonical decision.",
  ].join(" ");
  return {
    system,
    user: JSON.stringify(context),
  };
}

function uniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Validate an untrusted model object exclusively against the exact context
 * used for the call. This is exported for focused security tests.
 */
export function validateAiDevelopmentInterpretation(
  raw: unknown,
  context: DevelopmentContext,
): AiDevelopmentInterpretation {
  const parsed = aiDevelopmentInterpretationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DevelopmentInterpretationError("MALFORMED_INTERPRETATION", "Model output does not match the strict interpretation contract");
  }
  const interpretation = parsed.data;
  const canonical = context.canonical;
  if (
    interpretation.playerId !== context.target.playerId
    || interpretation.academyId !== context.target.academyId
    || interpretation.stateVersion !== canonical.stateVersion
    || interpretation.contextContractVersion !== context.contractVersion
    || JSON.stringify(interpretation.versions) !== JSON.stringify(context.canonical.versions)
  ) {
    throw new DevelopmentInterpretationError("STALE_OR_WRONG_SCOPE", "Model interpretation does not match the evaluated player, academy, state version, or frozen versions");
  }

  const evidenceById = new Map(context.evidence.map((evidence) => [evidence.evidenceId, evidence]));
  const allEvidenceRefs = [
    ...interpretation.supportingEvidenceIds,
    ...interpretation.contradictingEvidenceIds,
  ];
  if (
    !uniqueValues(interpretation.supportingEvidenceIds)
    || !uniqueValues(interpretation.contradictingEvidenceIds)
    || !uniqueValues(allEvidenceRefs)
    || allEvidenceRefs.some((evidenceId) => !evidenceById.has(evidenceId))
  ) {
    throw new DevelopmentInterpretationError("FABRICATED_EVIDENCE_REFERENCE", "Model referenced evidence outside the exact server-retrieved evidence set");
  }

  const canonicalSkills = new Set(canonical.current.skills.map((skill) => skill.canonicalSkillId));
  const benchmarkForSkill = new Map<string, Set<string>>();
  for (const evidence of context.evidence) {
    for (const skillId of evidence.canonicalSkillIds) {
      const benchmarks = benchmarkForSkill.get(skillId) ?? new Set<string>();
      for (const benchmarkId of evidence.benchmarkIds) benchmarks.add(benchmarkId);
      benchmarkForSkill.set(skillId, benchmarks);
    }
  }
  for (const affected of interpretation.affectedSkills) {
    if (!canonicalSkills.has(affected.canonicalSkillId)) {
      throw new DevelopmentInterpretationError("INVALID_CANONICAL_SKILL", "Model referenced a canonical skill outside the snapshot");
    }
    if (!benchmarkForSkill.get(affected.canonicalSkillId)?.has(affected.benchmarkId)) {
      throw new DevelopmentInterpretationError("INVALID_BENCHMARK_REFERENCE", "Model referenced a benchmark not available for the affected skill in the retrieved context");
    }
  }
  for (const priority of interpretation.priorities) {
    if (!canonicalSkills.has(priority.canonicalSkillId)) {
      throw new DevelopmentInterpretationError("INVALID_PRIORITY_SKILL", "Model referenced an invalid priority skill");
    }
  }
  for (const request of interpretation.missingEvidenceRequests) {
    if (request.canonicalSkillId !== null && !canonicalSkills.has(request.canonicalSkillId)) {
      throw new DevelopmentInterpretationError("INVALID_MISSING_EVIDENCE_SKILL", "Model requested evidence for an invalid canonical skill");
    }
  }
  if (interpretation.outcome === "NO_CHANGE" && interpretation.affectedSkills.length > 0) {
    throw new DevelopmentInterpretationError("INVALID_NO_CHANGE", "NO_CHANGE cannot contain affected skills");
  }
  if (interpretation.outcome === "INSUFFICIENT_EVIDENCE" && interpretation.missingEvidenceRequests.length === 0) {
    throw new DevelopmentInterpretationError("MISSING_EVIDENCE_OUTCOME_REQUIRED", "INSUFFICIENT_EVIDENCE must include a missing-evidence request");
  }
  if (interpretation.outcome === "INTERPRETATION" && interpretation.affectedSkills.length === 0) {
    throw new DevelopmentInterpretationError("AFFECTED_SKILL_REQUIRED", "INTERPRETATION must contain at least one affected skill");
  }
  return interpretation;
}

function providerFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out") || (error as { code?: string } | null)?.code === "ETIMEDOUT") {
    return "PROVIDER_TIMEOUT";
  }
  return "PROVIDER_ERROR";
}

function toResult(
  row: typeof aiDevelopmentEvaluations.$inferSelect,
  duplicate: boolean,
): DevelopmentEvaluationResult {
  const parsed = row.interpretationJson
    ? aiDevelopmentInterpretationSchema.safeParse(row.interpretationJson)
    : null;
  return {
    evaluationId: row.id,
    status: (duplicate ? "DUPLICATE" : row.status) as DevelopmentEvaluationStatus,
    duplicate,
    interpretation: parsed?.success ? parsed.data : null,
    provenance: {
      evaluationVersion: row.evaluationVersion,
      contextContractVersion: row.contextContractVersion,
      contextHash: row.contextHash,
      promptVersion: row.promptVersion,
      promptHash: row.promptHash,
      model: row.model,
      stateVersion: row.requestedStateVersion,
      versions: row.requestedVersionsJson as DevelopmentContext["canonical"]["versions"],
    },
    diagnostics: (row.diagnosticsJson ?? {}) as Record<string, unknown>,
  };
}

async function updateEvaluation(
  evaluationId: string,
  values: {
    status: DevelopmentEvaluationStatus;
    interpretationJson?: AiDevelopmentInterpretation | null;
    diagnosticsJson: Record<string, unknown>;
    providerRequestId?: string | null;
  },
): Promise<void> {
  await db.update(aiDevelopmentEvaluations)
    .set({
      status: values.status,
      interpretationJson: values.interpretationJson ?? null,
      diagnosticsJson: values.diagnosticsJson,
      providerRequestId: values.providerRequestId ?? null,
      completedAt: new Date(),
    })
    .where(eq(aiDevelopmentEvaluations.id, evaluationId));
}

async function invokeModel(context: DevelopmentContext): Promise<{
  raw: unknown;
  providerRequestId: string | null;
  promptHash: string;
}> {
  const prompt = promptForContext(context);
  const promptHash = sha256(JSON.stringify(prompt));
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    timeout: AI_DEVELOPMENT_TIMEOUT_MS,
    maxRetries: 0,
  });
  const response = await openai.chat.completions.create({
    model: AI_DEVELOPMENT_MODEL,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1600,
    temperature: 0,
  });
  const message = response.choices?.[0]?.message as (typeof response.choices[number]["message"] & { refusal?: string | null }) | undefined;
  if (message?.refusal) {
    throw new DevelopmentInterpretationError("PROVIDER_REFUSAL", "AI provider refused the development interpretation", 502);
  }
  if (!message?.content) {
    throw new DevelopmentInterpretationError("PROVIDER_EMPTY_RESPONSE", "AI provider returned no interpretation", 502);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(message.content);
  } catch {
    throw new DevelopmentInterpretationError("MALFORMED_INTERPRETATION", "AI provider returned non-JSON content");
  }
  await logAiCall({
    userId: context.actor.userId,
    featureType: "canonical_development_interpretation",
    model: AI_DEVELOPMENT_MODEL,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
    academyId: context.target.academyId,
  });
  return {
    raw,
    providerRequestId: response.id ?? null,
    promptHash,
  };
}

export async function evaluateDevelopmentInterpretation(
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
  clientIdempotencyKey?: string,
): Promise<DevelopmentEvaluationResult> {
  const context = await getDevelopmentContext(user, targetPlayerId, trigger);
  const contextHash = stableContextHash(context);
  const prompt = promptForContext(context);
  const promptHash = sha256(JSON.stringify(prompt));
  const identityPart = clientIdempotencyKey
    ? `client:${sha256(clientIdempotencyKey)}`
    : `context:${contextHash}`;
  const evaluationKey = sha256([
    context.actor.userId,
    context.target.academyId,
    context.target.playerId,
    trigger,
    identityPart,
  ].join("|"));

  const [existing] = await db.select().from(aiDevelopmentEvaluations)
    .where(eq(aiDevelopmentEvaluations.evaluationKey, evaluationKey))
    .limit(1);
  if (existing) return toResult(existing, true);

  const [created] = await db.insert(aiDevelopmentEvaluations).values({
    evaluationKey,
    actorUserId: context.actor.userId,
    actorCoachId: user.coachId ?? null,
    academyId: context.target.academyId,
    playerId: context.target.playerId,
    trigger,
    status: "PROCESSING",
    evaluationVersion: AI_DEVELOPMENT_EVALUATION_VERSION,
    contextContractVersion: context.contractVersion,
    contextHash,
    promptVersion: AI_DEVELOPMENT_PROMPT_VERSION,
    promptHash,
    model: AI_DEVELOPMENT_MODEL,
    requestedStateVersion: context.canonical.stateVersion,
    requestedVersionsJson: context.canonical.versions,
    diagnosticsJson: { phase: "created" },
  }).onConflictDoNothing({ target: aiDevelopmentEvaluations.evaluationKey }).returning();
  if (!created) {
    const [duplicate] = await db.select().from(aiDevelopmentEvaluations)
      .where(eq(aiDevelopmentEvaluations.evaluationKey, evaluationKey))
      .limit(1);
    if (!duplicate) {
      throw new DevelopmentInterpretationError("IDEMPOTENCY_CONFLICT", "Evaluation could not be established safely", 409);
    }
    return toResult(duplicate, true);
  }

  if (context.evidence.length === 0) {
    const diagnostics = {
      code: "INSUFFICIENT_EVIDENCE",
      providerStatus: "NOT_INVOKED",
      reason: "No relevant approved evidence was available in the trusted context",
    };
    await updateEvaluation(created.id, {
      status: "INSUFFICIENT_EVIDENCE",
      diagnosticsJson: diagnostics,
    });
    const [completed] = await db.select().from(aiDevelopmentEvaluations).where(eq(aiDevelopmentEvaluations.id, created.id)).limit(1);
    return toResult(completed ?? { ...created, status: "INSUFFICIENT_EVIDENCE", diagnosticsJson: diagnostics }, false);
  }

  try {
    const budget = await getAcademyBudgetState(context.target.academyId);
    if (budget.status === "exhausted") {
      const diagnostics = { code: "AI_BUDGET_EXHAUSTED", providerStatus: "NOT_INVOKED" };
      await updateEvaluation(created.id, { status: "FAILED", diagnosticsJson: diagnostics });
      const [failed] = await db.select().from(aiDevelopmentEvaluations).where(eq(aiDevelopmentEvaluations.id, created.id)).limit(1);
      return toResult(failed ?? { ...created, status: "FAILED", diagnosticsJson: diagnostics }, false);
    }
    const response = await invokeModel(context);
    const interpretation = validateAiDevelopmentInterpretation(response.raw, context);
    // The model call happens outside the Phase 3A read transaction. Re-read
    // the trusted context before accepting the interpretation so a canonical
    // update that completed while the provider was working cannot be returned
    // as current.
    const latestContext = await getDevelopmentContext(user, targetPlayerId, trigger);
    if (
      latestContext.canonical.stateVersion !== context.canonical.stateVersion
      || latestContext.target.academyId !== context.target.academyId
      || latestContext.target.playerId !== context.target.playerId
    ) {
      throw new DevelopmentInterpretationError(
        "STALE_EVALUATION",
        "Canonical state changed while the AI interpretation was being generated",
        409,
      );
    }
    const status = interpretation.outcome === "INTERPRETATION"
      ? "INTERPRETATION"
      : interpretation.outcome;
    await updateEvaluation(created.id, {
      status,
      interpretationJson: interpretation,
      diagnosticsJson: {
        code: "VALIDATED",
        providerStatus: "SUCCEEDED",
        providerRequestId: response.providerRequestId,
      },
      providerRequestId: response.providerRequestId,
    });
    const [completed] = await db.select().from(aiDevelopmentEvaluations).where(eq(aiDevelopmentEvaluations.id, created.id)).limit(1);
    return toResult(completed ?? { ...created, status, interpretationJson: interpretation }, false);
  } catch (error) {
    const code = error instanceof DevelopmentInterpretationError ? error.code : providerFailureCode(error);
    const diagnostics = {
      code,
      providerStatus: code.startsWith("PROVIDER") ? "FAILED" : "REJECTED",
      message: error instanceof Error ? error.message : "Unknown evaluation failure",
    };
    const status: DevelopmentEvaluationStatus = code === "MALFORMED_INTERPRETATION"
      || code.startsWith("FABRICATED_")
      || code.startsWith("INVALID_")
      || code === "STALE_OR_WRONG_SCOPE"
      || code === "STALE_EVALUATION"
      ? "REJECTED"
      : "FAILED";
    await updateEvaluation(created.id, { status, diagnosticsJson: diagnostics });
    const [failed] = await db.select().from(aiDevelopmentEvaluations).where(eq(aiDevelopmentEvaluations.id, created.id)).limit(1);
    return toResult(failed ?? { ...created, status, diagnosticsJson: diagnostics }, false);
  }
}