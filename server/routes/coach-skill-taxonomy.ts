import { Router } from "express";
import type { Response } from "express";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";

const router = Router();

// ── Skill Taxonomy ────────────────────────────────────────────────────────────
// Level-aware skill entries for Technique and Tactical pillars.
// Universal pillars (Effort, Physical, Mental) are NOT included here —
// they render identically for every player level.

export interface SkillEntry {
  id: string;
  label: string;
  pillar: "technique" | "tactical";
  levelKey: string;
}

const SKILL_TAXONOMY: SkillEntry[] = [
  // ── Red (beginner / youngest juniors) ──────────────────────────────────────
  { id: "red_tech_rally",      label: "Rally Consistency",      pillar: "technique", levelKey: "red" },
  { id: "red_tech_balance",    label: "Balance & Posture",       pillar: "technique", levelKey: "red" },
  { id: "red_tech_forehand",   label: "Forehand Basics",         pillar: "technique", levelKey: "red" },
  { id: "red_tech_backhand",   label: "Backhand Basics",         pillar: "technique", levelKey: "red" },
  { id: "red_tech_serve",      label: "Serve Motion",            pillar: "technique", levelKey: "red" },
  { id: "red_tact_court",      label: "Court Awareness",         pillar: "tactical",  levelKey: "red" },
  { id: "red_tact_direction",  label: "Directing the Ball",      pillar: "tactical",  levelKey: "red" },
  { id: "red_tact_target",     label: "Targeting Safe Zones",    pillar: "tactical",  levelKey: "red" },

  // ── Orange ─────────────────────────────────────────────────────────────────
  { id: "ora_tech_xcourt",     label: "Cross-Court Patterns",    pillar: "technique", levelKey: "orange" },
  { id: "ora_tech_netapp",     label: "Net Approach",            pillar: "technique", levelKey: "orange" },
  { id: "ora_tech_serveplc",   label: "Serve Placement",         pillar: "technique", levelKey: "orange" },
  { id: "ora_tech_bhslice",    label: "Backhand Slice",          pillar: "technique", levelKey: "orange" },
  { id: "ora_tech_volley",     label: "Volley Fundamentals",     pillar: "technique", levelKey: "orange" },
  { id: "ora_tact_openspace",  label: "Opening the Court",       pillar: "tactical",  levelKey: "orange" },
  { id: "ora_tact_recovery",   label: "Recovery Position",       pillar: "tactical",  levelKey: "orange" },
  { id: "ora_tact_transition", label: "Baseline to Net Transition", pillar: "tactical", levelKey: "orange" },

  // ── Yellow ─────────────────────────────────────────────────────────────────
  { id: "yel_tech_spin",       label: "Spin Variation",          pillar: "technique", levelKey: "yellow" },
  { id: "yel_tech_approach",   label: "Approach Shots",          pillar: "technique", levelKey: "yellow" },
  { id: "yel_tech_kickserve",  label: "Kick Serve",              pillar: "technique", levelKey: "yellow" },
  { id: "yel_tech_dropshot",   label: "Drop Shot",               pillar: "technique", levelKey: "yellow" },
  { id: "yel_tact_patterns",   label: "Tactical Patterns",       pillar: "tactical",  levelKey: "yellow" },
  { id: "yel_tact_construct",  label: "Point Construction",      pillar: "tactical",  levelKey: "yellow" },
  { id: "yel_tact_serve1",     label: "Serve + 1 Patterns",      pillar: "tactical",  levelKey: "yellow" },
  { id: "yel_tact_return",     label: "Return of Serve Tactics", pillar: "tactical",  levelKey: "yellow" },

  // ── Green (advanced juniors / competitive) ─────────────────────────────────
  { id: "grn_tech_2ndserve",   label: "Second Serve Quality",    pillar: "technique", levelKey: "green" },
  { id: "grn_tech_inside",     label: "Inside-Out Forehand",     pillar: "technique", levelKey: "green" },
  { id: "grn_tech_overhead",   label: "Overhead Smash",          pillar: "technique", levelKey: "green" },
  { id: "grn_tech_slice_bh",   label: "Defensive Backhand Slice",pillar: "technique", levelKey: "green" },
  { id: "grn_tact_construct",  label: "Point Construction",      pillar: "tactical",  levelKey: "green" },
  { id: "grn_tact_2ndservetact", label: "Second Serve Tactics",  pillar: "tactical",  levelKey: "green" },
  { id: "grn_tact_returnpos",  label: "Return Positions",        pillar: "tactical",  levelKey: "green" },
  { id: "grn_tact_presspt",    label: "Pressure Point Play",     pillar: "tactical",  levelKey: "green" },

  // ── Adult / NTRP ──────────────────────────────────────────────────────────
  { id: "adu_tech_serve_var",  label: "Serve Variation",         pillar: "technique", levelKey: "adult" },
  { id: "adu_tech_return",     label: "Return Mechanics",        pillar: "technique", levelKey: "adult" },
  { id: "adu_tech_net",        label: "Net Finishing",           pillar: "technique", levelKey: "adult" },
  { id: "adu_tech_slice",      label: "Approach / Slice",        pillar: "technique", levelKey: "adult" },
  { id: "adu_tact_matchplay",  label: "Match-Play Decisions",    pillar: "tactical",  levelKey: "adult" },
  { id: "adu_tact_pressure",   label: "Pressure Point Tactics",  pillar: "tactical",  levelKey: "adult" },
  { id: "adu_tact_serve1",     label: "Serve + 1 Patterns",      pillar: "tactical",  levelKey: "adult" },
  { id: "adu_tact_returnpos",  label: "Return Position & Read",  pillar: "tactical",  levelKey: "adult" },

  // ── Glow (elite) — reuse adult entries with glow label ────────────────────
  { id: "glo_tech_serve_var",  label: "Elite Serve Variation",   pillar: "technique", levelKey: "glow" },
  { id: "glo_tech_return",     label: "High-Level Return",       pillar: "technique", levelKey: "glow" },
  { id: "glo_tech_net",        label: "Net Dominance",           pillar: "technique", levelKey: "glow" },
  { id: "glo_tech_slice",      label: "Approach & Slice",        pillar: "technique", levelKey: "glow" },
  { id: "glo_tact_matchplay",  label: "Elite Match-Play Decisions", pillar: "tactical", levelKey: "glow" },
  { id: "glo_tact_pressure",   label: "Clutch Point Tactics",    pillar: "tactical",  levelKey: "glow" },
  { id: "glo_tact_serve1",     label: "Serve + 1 Patterns",      pillar: "tactical",  levelKey: "glow" },
  { id: "glo_tact_returnpos",  label: "Return Position & Read",  pillar: "tactical",  levelKey: "glow" },
];

// Normalise any ball-level variant to a canonical taxonomy key
function normaliseLevelKey(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith("red"))    return "red";
  if (lower.startsWith("orange")) return "orange";
  if (lower.startsWith("yellow")) return "yellow";
  if (lower.startsWith("green"))  return "green";
  if (lower.startsWith("glow"))   return "glow";
  if (lower.startsWith("adult") || lower.startsWith("blue")) return "adult";
  // NTRP numeric strings (e.g. "3.5")
  if (/^\d/.test(lower)) return "adult";
  return "adult";
}

/**
 * GET /api/coach/skill-taxonomy?level=yellow
 *
 * Returns the level-specific skill entries for Technique and Tactical pillars.
 * Callers pass the player's ballLevel value as the `level` query param.
 * When `level` is omitted, the default adult set is returned.
 */
router.get(
  "/api/coach/skill-taxonomy",
  authMiddleware,
  requireRole("coach", "assistant", "platform_owner", "academy_owner", "owner"),
  (req: AuthenticatedRequest, res: Response) => {
    const rawLevel = (req.query.level as string | undefined) ?? "adult";
    const levelKey = normaliseLevelKey(rawLevel);
    const skills = SKILL_TAXONOMY.filter((s) => s.levelKey === levelKey);
    return res.json({ levelKey, skills });
  }
);

export default router;
