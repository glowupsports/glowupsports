# Batch 4A — Phase 1 correction pass

**Status:** specification only. This document does not introduce a migration, schema implementation, service, route, UI change, AIChat change, or writer disablement.

## 1. Corrected Phase 1 sections

### Canonical atomic skills and deterministic crosswalk

The canonical model uses **202 atomic skills** in skill families, rather than broad `FOREHAND_EXECUTION` or `BACKHAND_EXECUTION` buckets. The technical families preserve separate atoms for, where applicable:

- forehand and backhand: grip, ready position, preparation/unit turn, contact, swing path, follow-through, timing, balance, footwork, consistency, depth, direction, spin, power, attack, defence, and pressure;
- serve: stance, toss height/consistency, motion sequence, contact, rhythm, consistency, power, spin, placement, first-serve reliability, second-serve reliability, variety, and pressure;
- return, volley/net, overhead, specialty shots, rally, pre-tennis object control, movement, physical, tactical, mental, and match-play execution;
- a separate `SOCIAL_CHARACTER` family for respect, fair play, etiquette, teamwork, leadership, mentoring, and similar character outcomes.

The complete generated/configured mapping is in `docs/specs/batch-4a-canonical-crosswalk-v1.json`. It is a specification artifact, not a runtime implementation. Each entry uses a collision-safe source key:

```text
{pathway}:{level}:{source_skill_id}
```

and a deterministic benchmark ID:

```text
BM_V1_{PATHWAY_UPPER}_{LEVEL}_{SOURCE_SKILL_ID}
```

This is the required `source_skill_id → canonical_atomic_skill_id → benchmark_id` definition. It contains every detailed curriculum record exactly once and must be persisted as data in Phase 2; Phase 2 must not infer it from category/name heuristics.

| Crosswalk result | Count |
|---|---:|
| Source curriculum rows | 1,117 |
| Canonical atomic skills used | 202 |
| Benchmark definitions | 1,117 |
| Existing three-point rubric anchors | 3,351 |
| `ABILITY_BENCHMARK` | 819 |
| `HARD_GATE` | 90 |
| `CONTEXT_ONLY` | 108 |
| `SOCIAL_CHARACTER` | 100 |
| Unmapped Ability/Social rows | **0** |

`HARD_GATE` and `CONTEXT_ONLY` entries have a deliberately null canonical Ability atom. That is an explicit exclusion, not an unmapped row. The two occurrences of the raw ID `G1_SOC_AMBASSADOR` are disambiguated by their qualified source keys: `green:GREEN_1:G1_SOC_AMBASSADOR` and `adult:GLOW_1:G1_SOC_AMBASSADOR`.

Only `ABILITY_BENCHMARK` contributes to Absolute Skill Strength, Ability-family strength, Ability-pillar strength, or Glow. `SOCIAL_CHARACTER` is available for a separate character view and reporting, but never contributes to Ability/Glow. `HARD_GATE` affects only configured readiness/placement prerequisites. `CONTEXT_ONLY` can be retained as evidence context but cannot independently alter an atomic Ability state.

The crosswalk artifact lists the exact 65 semantically ambiguous source occurrences. They are intentionally retained as explicit `CONTEXT_ONLY` records, not split by runtime inference. They include the compound Blue records (`B3_START_STOP`, `B3_CRAWL_ROLL`, `B3_SQUAT_STAND`, `B2_START_STOP_FAST`, `B2_JUMP_LAND`, `B1_THROW_HIT_COMBO`, `B1_RUN_AND_HIT`); aggregate/alternative Red, Orange, Green, Yellow, and Adult records such as `R1_*_COMPLETE`, `R1_DROP_LOB`, `O1_BH_SLICE_DROP`, `G1_STROKES`, `G1_WEAPONS`, `Y2_WEAPONS`, `G8_VOL_FH_BH`, `G7_FH_CROSS_DTL`, `G6_LOB_PRESSURE`, and `G1_TECH_AUTOMATED`; and all remaining exact keys in the artifact’s `ambiguousRows` array.

### AI interpretation and deterministic Absolute Skill Strength

The only AI-interpreted Ability value is:

```ts
{
  benchmarkId,
  proposedBenchmarkMastery: number, // 0..100
  confidence: number,               // 0..1
  evidenceRefs: string[],
  rationale: string
}
```

AI must never propose or directly persist Absolute Skill Strength.

For a benchmark with versioned absolute interval `[lower, upper]`, the server derives:

```text
candidate = lower + (proposedBenchmarkMastery / 100) × (upper - lower)
q = 1 - Π(1 - reliability_i × magnitude_i × difficulty_i × exp(-ageDays_i / recencyHalfLifeDays))
allowedIncrease = config.maxIncrease × q × confidence
allowedRegression = config.maxRegression × q × confidence
absoluteNext = clamp(candidate, absolutePrevious - allowedRegression, absolutePrevious + allowedIncrease)
```

The calculation uses only validated, referenced evidence whose IDs have not already been consumed for that player/atom/config version. Evidence is normalized before use; a match result, attendance row, win count, or decision count is not an Ability observation. `maxIncrease`, `maxRegression`, and `recencyHalfLifeDays` are required, versioned calibration fields. Their initial values are provisional until calibration approval.

Above the highest calibrated benchmark interval, the server uses an elite continuation rule:

```text
eliteDelta = eliteUnitScale × q × normalizedPerformanceMagnitude × difficultyWeight × confidence
absoluteNext = absolutePrevious + eliteDelta
```

The sign and magnitude come from the referenced performance evidence against the active benchmark protocol. `decisionFrequencyWeight = 0`; a decision without newly eligible evidence has `q = 0` and therefore changes Ability by zero. Replaying the same evidence is rejected by the evidence-consumption/idempotency check.

### Benchmark windows

The recommended model is **overlapping, versioned benchmark windows**. A promotion changes the benchmark reference but does not alter Absolute Skill Strength:

```text
Red 1:    [200, 300]
Orange 3: [250, 350]
absolute strength 300 → Red 1 mastery 100; Orange 3 mastery 50
```

The non-overlapping alternative (`[200,300]`, `[300,400]`) is simpler but would display 0 at the next benchmark for the same 300 absolute strength. It is not recommended because it conflicts with the desired promotion experience. Benchmark anchors and overlap widths are calibration data, versioned and explicitly provisional until approved.

### Missing data, Glow, placement, and pathway calibration

There are five Ability pillars for Glow: `TECHNIQUE`, `TACTICAL`, `PHYSICAL`, `MENTAL`, and `MATCH_PLAY`. Social/character has no Glow weight.

- An atomic skill is `UNOBSERVED` when it has no qualifying canonical state for the active config; it is never zero by default.
- A family is `UNOBSERVED` when it has no observed Ability atom. Otherwise, its strength and confidence are weighted means of observed descendants only.
- A pillar has `pillarCoverage = observedRequiredAtomWeight / activeRequiredAtomWeight`. Its strength is the weighted mean of observed atoms; its confidence is the weighted mean of observed-atom confidence.
- `coverage = Σ(pillarWeight × pillarCoverage) / Σ(pillarWeight)`.
- `estimatedGlow = Σ(observedPillarWeight × observedPillarStrength) / Σ(observedPillarWeight)`. It is null when no Ability pillar is observed and is always returned with coverage, confidence, and status.
- `confidence = Σ(pillarWeight × pillarCoverage × pillarConfidence) / Σ(pillarWeight)`. Missing evidence therefore lowers confidence without becoming a zero-strength observation.

`GLOW_STATUS` is independent of placement:

| Status | Exact v1 condition |
|---|---|
| `ESTABLISHING` | no observed Ability pillar, or fewer than two observed Ability pillars |
| `PROVISIONAL` | any other partial state that does not meet confirmation |
| `CONFIRMED` | all five Ability pillars observed; each has coverage ≥ 0.80, confidence ≥ 0.70, and at least two distinct eligible evidence events in the configured recency horizon; total coverage ≥ 0.85 |

`PLACEMENT_STATUS` is separate:

| Status | Exact v1 condition |
|---|---|
| `UNASSESSED` | no qualifying Ability evidence against a placement benchmark |
| `PROVISIONAL` | qualifying evidence exists but configured placement-family coverage/confidence or required gates are incomplete |
| `CONFIRMED` | active pathway/level placement-family coverage ≥ 0.75, placement confidence ≥ 0.65, and every hard gate configured for that placement is satisfied |

Placement configuration may have no match-history gate for beginner levels. A beginner can therefore have confirmed training placement while Glow remains `ESTABLISHING` or `PROVISIONAL`.

Junior and Adult pathways share one versioned Absolute Skill Strength axis **only through same-atomic-skill calibration**. An adult with no junior history is placed from Adult benchmarks for the shared atoms; no Adult-rank-to-Junior-level conversion is permitted. Cross-pathway comparison stays disabled until a versioned calibration dataset provides approved absolute intervals for each shared atomic skill in both pathways, using common protocols or a scored bridge cohort. Until then, Adult and Junior values remain internally valid per pathway but are not displayed as directly comparable.

### DevelopmentDecision lifecycle and writer map

Decision creation/validation is separate from canonical application:

1. **Transaction A — auditable validation.** Persist `PROPOSED`; validate actor, academy, evidence references, crosswalk, benchmark/config version, input range, and idempotency. Persist `VALIDATING`, then either `REJECTED` with immutable validation reasons, or leave the decision valid for application. A rejection commits independently and makes no canonical mutation.
2. **Transaction B — atomic application.** Lock the player-level aggregate row with `FOR UPDATE`; recheck idempotency, version, actor scope, eligible evidence, and configuration snapshots. In the same transaction write `ACCEPTED`, current states, history, consumed-evidence records, immutable snapshots, aggregate values/version, and finally `APPLIED`. Commit once.
3. **Apply failure.** A Transaction B failure rolls back all canonical changes and the persisted `ACCEPTED` transition. A short, separate transaction records `APPLY_FAILED` with a stable failure code and diagnostic reference. An `APPLY_FAILED` attempt is terminal; retry creates a new attempt linked to the original decision root. The same idempotency key returns the existing `APPLIED` snapshot or existing terminal outcome; it never creates a second application.

Current reachable writer families: **14**. The future central execution service is the only `CANONICAL` writer; this mapping is a migration target, not a Phase 2 writer migration.

| Writer family | Classification | Required future treatment |
|---|---|---|
| Canonical execution service | `CANONICAL` | Sole mutation path for canonical current/history/aggregate state |
| AIChat commit | `EVIDENCE_ONLY` | Later adapter creates a decision proposal; no direct skill/pillar/Glow mutation |
| Glow Assessment | `EVIDENCE_ONLY` | Later adapter supplies assessed evidence |
| Deep Assessment | `EVIDENCE_ONLY` | Later adapter supplies evidence; AI summaries remain non-authoritative |
| Quick/session feedback | `EVIDENCE_ONLY` | Later adapter supplies evidence; no direct pillar update |
| In-session feedback | `EVIDENCE_ONLY` | Note/evidence only |
| Legacy `player_progress` | `LEGACY_COMPATIBILITY` | Preserve reads until proven unused, then retire |
| Player self Glow assessment | `RETIRE` | No confirmed reachable player-self writer; do not create one implicitly |
| Match Intelligence and `match-pillar-update` | `EVIDENCE_ONLY` | Preserve match evidence; remove direct pillar mutation in a later phase |
| Adult Glow/MMR processing | `SEPARATE_DOMAIN` | Keep MMR/rank independent of canonical Ability |
| XP/profile-level writers | `SEPARATE_DOMAIN` | Preserve XP/profile progression; no canonical Ability feed |
| V2 domain progression/state | `SEPARATE_DOMAIN` | Keep explicit V2 domain semantics separate pending later consolidation |
| Initialization/admin/demo Glow writers | `LEGACY_COMPATIBILITY` | Defaults/repair only; never evidence-derived canonical progression |
| Legacy session storage feedback | `LEGACY_COMPATIBILITY` | Activity/evidence compatibility only |
| Trial/test completion/readiness routes | `EVIDENCE_ONLY` | Feed only explicit hard-gate evidence after a later adapter |

## 2. Impact on schema/config

Phase 2 must introduce, not yet implement, the following model:

- `player_canonical_progression` is the single player-level concurrency anchor: `player_id` primary key, `academy_id`, `state_version`, `placement_status`, `glow_status`, `current_pathway_id`, `current_level_id`, `estimated_glow`, `glow_coverage`, `glow_confidence`, taxonomy/benchmark/glow config versions, `last_decision_id`, and timestamps. It has `UNIQUE (academy_id, player_id)`, indexes on `(academy_id, placement_status)`, `(academy_id, glow_status)`, `(academy_id, updated_at)`, and `last_decision_id`; all canonical transitions lock this row, never an arbitrary skill row.
- Versioned configuration persistence for canonical skill definitions, benchmark intervals/classifications, the checked-in source crosswalk, Glow configuration, and calibration/protocol versions. Crosswalk uniqueness is `(crosswalk_version, qualified_source_key)`; benchmark uniqueness is `(benchmark_config_version, benchmark_id)`.
- Normalized current canonical skill state, append-only skill history, immutable decision/config/evidence snapshots, consumed-evidence uniqueness, DevelopmentDecision plus immutable validation records, and aggregate history snapshots.
- Database constraints must enforce the four benchmark classifications, null canonical atom only for `HARD_GATE`/`CONTEXT_ONLY`, an atomic skill for `ABILITY_BENCHMARK`/`SOCIAL_CHARACTER`, valid confidence/mastery ranges, and optimistic state-version comparison.

## 3. Remaining genuine product ambiguities

1. Approve initial numeric calibration values for benchmark intervals, overlap widths, evidence recency half-life, reliability/difficulty normalization, and movement/regression caps. The rule structure is fixed; values are deliberately not presented as repository-derived.
2. Approve the bridge-calibration protocol and minimum cohort/quality criteria that unlock Adult/Junior cross-pathway comparison. Until then, placement is pathway-local.
3. Decide whether the 65 compound/context curriculum records should later be split into independently observable source benchmarks. They are safely non-Ability now; splitting them is a curriculum-content decision.
4. Confirm whether `MATCH_PLAY` is equally weighted with the other four Ability pillars at every pathway/level, or whether its configured weight/required atom set varies by level. This affects Glow configuration, not the missing-data rule.

## 4. Corrected bounded Phase 2 implementation boundary

**In scope only:** canonical schema and config persistence; crosswalk import/validation; player aggregate/version lock row; normalized current state and append-only history; DevelopmentDecision lifecycle; immutable snapshots; deterministic Absolute Strength and Glow engines; central execution transaction; consumed-evidence idempotency; concurrency control; canonical current/history DTO/service; and targeted unit/integration tests for crosswalk completeness, classification exclusion, window behavior, missing-data/status logic, regression/elite evidence rules, rejection persistence, application atomicity, idempotency, and contention.

**Explicitly out of scope:** AIChat migration; broad AI context changes; Quick Feedback, Deep Assessment, Glow Assessment, baseline, or self-assessment migration; Player Home/Player Progress/Coach Progress UI work; Match writer removal; XP/profile or Adult Glow changes; training planner work; broad legacy cleanup; and any Phase 3+ writer adapters.

Bounded estimate: **2 migrations, 12–16 production/config files, 5–7 focused test files**. It is gated on approval of this crosswalk/configuration and the unresolved calibration decisions above.