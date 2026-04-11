/**
 * Glow Operational Depth Seed
 *
 * Seeds all 9 Glow levels (GLOW_1–GLOW_9) with operational_targets JSONB data.
 * Content is Derived (non-official) — these are training targets, not official federation requirements.
 *
 * Sources: Cross-federation research, Tennis Canada 50–70% optimal challenge band,
 * ITF fitness benchmarks, Glow 9→1 requirements rubric.
 *
 * Usage:
 *   npx tsx server/seeds/glow-operational-depth-seed.ts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface GlowOperationalTargets {
  stances: string;
  footwork: string;
  timing_cues: string;
  distance_control: string;
  defensive_patterns: string;
  conditioning: string;
  challenge_band: string;
}

interface GlowOperationalDepthEntry {
  levelId: string;
  operationalTargets: GlowOperationalTargets;
}

const GLOW_OPERATIONAL_DEPTH: GlowOperationalDepthEntry[] = [
  {
    levelId: "GLOW_9",
    operationalTargets: {
      stances: "Neutral/square stance only; no expectation of open-stance mechanics at this stage",
      footwork: "Two-step recovery to base after each shot; split-step introduced as a concept but not yet assessed",
      timing_cues: "Contact point in front of lead hip on forehands; full arm extension on follow-through before recovery",
      distance_control: "Target landing zone: anywhere in the service box area; focus on clearing the net by 30+ cm",
      defensive_patterns: "No tactical defensive patterns required; priority is keeping the ball in play",
      conditioning: "Sustain 20 min of continuous cooperative rally play without visible fatigue; track over-net % as primary gate metric (Derived)",
      challenge_band: "Session calibration: 50–70% successful contacts in cooperative feed is the optimal challenge band (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_8",
    operationalTargets: {
      stances: "Square stance on most balls; begin introducing semi-open on wide forehands when feed allows",
      footwork: "Split-step initiated before opponent/feeder contact; weight shift forward through contact on groundstrokes",
      timing_cues: "Ball toss released 30+ cm upward for serve; contact on serve at full extension above shoulder height",
      distance_control: "Target: 60%+ of cooperative rally balls land past the service line; depth tracking introduced as a coach metric",
      defensive_patterns: "Default recovery to approximate baseline centre after every groundstroke; no active defensive redirection yet required",
      conditioning: "Sustain 30 min of continuous play at moderate cooperative intensity; HR-based fatigue monitoring not required (Derived)",
      challenge_band: "Session calibration: 50–70% success rate on fed drills; adjust feed pace/height to stay in optimal challenge band (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_7",
    operationalTargets: {
      stances: "Semi-open stance on wide forehand balls begins to appear; split-step timing slightly after opponent contact (Glow 7 milestone)",
      footwork: "Split-step timed slightly after opponent contact — the 'Glow 7 footwork milestone'; recovery to base in 2–3 steps after each shot",
      timing_cues: "Trophy position on serve: racket arm at 90° before upward swing; forehand contact in front of the body, not beside",
      distance_control: "60–70% of crosscourt rally balls target past service line; over-net clearance 40+ cm on topspin groundstrokes",
      defensive_patterns: "Identify crosscourt vs. down-the-line risk in cooperative rally (crosscourt = lower risk, more net clearance); verbalise shot selection once per session",
      conditioning: "Sustain 45 min of continuous play; no significant energy drop visible in movement speed or recovery effort (Derived)",
      challenge_band: "Session calibration: 50–70% optimal challenge band; if player succeeds >70% on drill consistently, increase pace/reduce time (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_6",
    operationalTargets: {
      stances: "Open stance used on wide forehand balls; semi-open default on regular pace balls; square stance on slow high-bouncing balls",
      footwork: "Split-step timed correctly on 6 of 10 groundstrokes in cooperative rally; load-and-drive footwork pattern visible on approach shots",
      timing_cues: "On-the-rise return timing introduced: contact ball 10–20 cm before peak of bounce to compress opponent time; 'meet early' cue",
      distance_control: "Depth measured as % past service line (target 65%+ in cooperative play); monthly ITF fitness baseline adopted as conditioning gate (Derived)",
      defensive_patterns: "Defensive crosscourt ball directed low and deep; second shot recovery to baseline centre is automatic after defensive ball",
      conditioning: "Complete a 45–60 min active session block without visible energy loss in footwork; basic ITF monthly fitness baseline test adopted as benchmark (Derived)",
      challenge_band: "Session calibration: 50–70% challenge band; second serve success rate of 50–60% in box is target zone — adjust difficulty to match (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_5",
    operationalTargets: {
      stances: "Open/semi-open stance automatic on forehand; two-handed backhand uses square/semi-open as appropriate to ball position",
      footwork: "Split-step timed to opponent contact on 7 of 10 points; load-and-drive to wide balls replaces reaching/lunging",
      timing_cues: "On-the-rise forehand return used on second-serve speed balls; 'short backswing, early contact' cue for return of serve",
      distance_control: "Net clearance target 40–50 cm on regular topspin groundstrokes; 65%+ depth (past service line) on cooperative and match play",
      defensive_patterns: "Defensive recovery ball directed crosscourt low and deep; basic pattern execution: push wide then recover to centre",
      conditioning: "Sustain 60 min of match-intensity play without tactical degradation; 1-shot point construction patterns executed consistently under fatigue (Derived)",
      challenge_band: "Session calibration: 50–70% challenge band on competitive drills; include pressure-rule scenarios (e.g. must get 3 in a row) to simulate match intensity (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_4",
    operationalTargets: {
      stances: "Open stance forehand automatic under rally pace; backhand semi-open on pace balls; semi-open on serve return",
      footwork: "Split-step timed 7–8 of 10 attempts; load-and-drive to short balls for approach shots; recovery split-step before second ball after volley",
      timing_cues: "Trophy position achieved before upward swing on every serve; on-the-rise timing used on 3+ returns per set in practice match",
      distance_control: "Topspin forehand clears net by 40+ cm and lands past service line on 65%+ of shots; approach shot depth target 70% past service line",
      defensive_patterns: "Defensive passing attempt directed crosscourt low; overhead reset to deep centre when taken wide or behind",
      conditioning: "Sustain 75 min active session with maintained first-step speed; no significant movement quality drop in final 20 min (Derived)",
      challenge_band: "Session calibration: 50–70% optimal challenge band; use competitive drills (first to 10 points) with score pressure to simulate match challenge band (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_3",
    operationalTargets: {
      stances: "Open/semi-open forehand stance fully automatic across all ball speeds; backhand semi-open on mid-pace, square on high kick balls",
      footwork: "Split-step anticipatory (before contact) on 8 of 10 points; load-and-drive recovery; COD (change of direction) speed tracked in monthly conditioning test",
      timing_cues: "Serve + 1 timing: immediate recovery split-step after serve contact; on-the-rise return used on 40%+ of second serve returns",
      distance_control: "Serve+1 dominance measured in match stats (% of serve+1 points won); net clearance 50+ cm on second serves with kick spin",
      defensive_patterns: "Defensive recovery ball: crosscourt low with topspin to create time; slice backhand used as 1–2 disruptor per set",
      conditioning: "Endurance + speed/COD testing; serve+1 dominance measured in match stats; complete simulated 3-set match at full quality (Derived)",
      challenge_band: "Session calibration: 50–70% challenge band; use match-stat tracking (1st serve %, double faults, winners/errors ratio) as ongoing challenge calibration (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_2",
    operationalTargets: {
      stances: "Open forehand stance fully automatic; backhand semi-open default with square-stance adjustment for wide/low balls",
      footwork: "Anticipatory split-step timed to opponent contact on 8–9 of 10 groundstrokes; 2-step attack footwork to short balls for volley close-out",
      timing_cues: "On-the-rise forehand used when inside baseline; serve contact at maximum reach, full leg drive through trophy position",
      distance_control: "First serve landing zone accuracy measured monthly; groundstroke depth 70%+ past service line in match stats",
      defensive_patterns: "Defensive lob used once per set from deep position; wide ball recovery with cross-step, counter-punch crosscourt low",
      conditioning: "Full 2-hour match simulation with maintained technical quality; anticipatory footwork remains sharp in final set (Derived)",
      challenge_band: "Session calibration: 50–70% challenge band; tiebreak simulations and match-score pressure scenarios are the primary challenge calibration tools at this level (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GLOW_1",
    operationalTargets: {
      stances: "All stances fully automatic and context-appropriate; open stance forehand used instinctively under high pace; closed stance on approach shots as required",
      footwork: "Anticipatory split-step on 9 of 10 groundstrokes; explosive 2-step first-move to wide balls; recovery footwork maintained through 2-hour match simulation",
      timing_cues: "On-the-rise returns used systematically against pace servers; serve contact optimised at maximum reach with consistent toss-to-peak timing",
      distance_control: "Serve landing zone accuracy tracked per match; groundstroke depth 70–75%+ past service line in match play; net clearance 50+ cm on heavy topspin",
      defensive_patterns: "Deep defensive lob to centre when drawn wide and off-balance; low crosscourt passing attempt when drawn to net; overhead reset to centre from behind baseline",
      conditioning: "Movement quality and first-step speed maintained through 2-hour match simulation; physical quality standard for club championship competition (Derived)",
      challenge_band: "Session calibration: 50–70% challenge band; full match-simulation pressure (tiebreaks, score scenarios, opponent pattern adjustment) is the only meaningful challenge calibration at Glow 1 (Tennis Canada benchmark)",
    },
  },
];

export async function seedGlowOperationalDepth() {
  console.log("[Seed] Starting Glow operational depth seed (GLOW_1–GLOW_9)...");

  let updated = 0;
  let skipped = 0;

  for (const entry of GLOW_OPERATIONAL_DEPTH) {
    try {
      const result = await db.execute(sql`
        UPDATE level_coaching_context
        SET
          operational_targets = ${JSON.stringify(entry.operationalTargets)}::jsonb,
          updated_at = NOW()
        WHERE level_id = ${entry.levelId}
      `);
      const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      if (rowCount > 0) {
        updated++;
        console.log(`[Seed] Updated operational_targets for ${entry.levelId}`);
      } else {
        console.warn(`[Seed] No row found for ${entry.levelId} — skipping`);
        skipped++;
      }
    } catch (err) {
      console.warn(`[Seed] Error updating ${entry.levelId}:`, err);
      skipped++;
    }
  }

  console.log(`[Seed] Glow operational depth done: ${updated} updated, ${skipped} skipped`);
}

if (require.main === module) {
  seedGlowOperationalDepth()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Glow operational depth seed failed:", err);
      process.exit(1);
    });
}
