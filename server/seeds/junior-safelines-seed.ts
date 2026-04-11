/**
 * Junior Safelines Tactical Concepts Seed
 *
 * Seeds ORANGE_1–3, GREEN_1–3, YELLOW_1–3 with tactical_concepts JSONB data
 * based on Tennis Australia's safelines / safe spots principles.
 * RED_1–3 receive a simplified introductory safeline concept.
 *
 * Key principles seeded:
 *   - Safeline definition: "high and deep to centre when under pressure"
 *   - Height equals depth rule
 *   - Safe spot definition per stage
 *   - Stage-specific risk management (when to attack vs. reset)
 *   - 50–70% optimal challenge band as coach session calibration note
 *
 * Sources: Tennis Australia Safelines framework, ITF Junior curriculum, Tennis Canada challenge band.
 *
 * Usage:
 *   npx tsx server/seeds/junior-safelines-seed.ts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface JuniorTacticalConcepts {
  safeline_principle: string;
  safe_spot: string;
  height_equals_depth: string;
  risk_management: string;
  challenge_band: string;
}

interface JuniorSafelinesEntry {
  levelId: string;
  tacticalConcepts: JuniorTacticalConcepts;
}

const JUNIOR_SAFELINES_DATA: JuniorSafelinesEntry[] = [
  // ========== RED STAGE — Simplified intro ==========
  {
    levelId: "RED_3",
    tacticalConcepts: {
      safeline_principle: "Introduction: the safe shot is one that clears the net with good height and lands in the middle of the court — not near the lines",
      safe_spot: "Middle of the court (away from sidelines and short areas); aim for the centre third of the mini court",
      height_equals_depth: "Hitting the ball higher over the net makes it go deeper — encourage high clearance for longer, safer shots",
      risk_management: "At this stage: always choose the safe middle shot; avoid trying to aim at lines or corners; keeping the ball in play is success",
      challenge_band: "Session calibration: 50–70% of balls landing in safe target zone is the optimal challenge band — adjust feed pace to stay in range (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "RED_2",
    tacticalConcepts: {
      safeline_principle: "Safe shot is one that clears the net with margin and lands away from sidelines; 'high and down the middle' is always a safe choice",
      safe_spot: "Centre of the mini court, away from corners; crosscourt towards the middle is the default safe target",
      height_equals_depth: "More height over net = more depth in the court; reinforce 'lift the ball' cue when under pressure",
      risk_management: "Use the safe middle shot when under time pressure or out of balance; only aim for a corner when in a comfortable, balanced position with time",
      challenge_band: "Session calibration: 50–70% successful safe shots in cooperative rally is optimal; increase pace or distance if consistently above 70% (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "RED_1",
    tacticalConcepts: {
      safeline_principle: "Safe shot principle: when under pressure or off-balance, hit high and crosscourt to the middle — never go for the line",
      safe_spot: "Crosscourt middle of the court; after a wide defensive ball, the safe spot is always deep to the centre",
      height_equals_depth: "Height over the net translates to depth: a ball hit 50 cm higher clears more safely and lands deeper — useful when rushed",
      risk_management: "Risk management gate: if not in balance and not inside the baseline, choose the safe reset; only go down the line when feet are set and in balance",
      challenge_band: "Session calibration: 50–70% challenge band applies to point-play scenarios; use mini-game scoring to add pressure within safe shot framework (Tennis Canada benchmark)",
    },
  },

  // ========== ORANGE STAGE ==========
  {
    levelId: "ORANGE_3",
    tacticalConcepts: {
      safeline_principle: "Safeline: the shot that gives maximum margin — high over the net and deep to the centre of the court when under pressure (Tennis Australia framework)",
      safe_spot: "Deep crosscourt to the centre of the baseline; the 'safe spot' is away from sidelines and short balls — centre-to-deep target zone",
      height_equals_depth: "Height equals depth: every extra 30 cm of net clearance on a topspin ball adds 1–2 m of depth; reinforce 'lift' under pressure to create time",
      risk_management: "Use safe shot (high crosscourt to deep middle) when: out of position, behind baseline, ball is below knee, or opponent is at net; attack only when inside baseline and in balance",
      challenge_band: "Session calibration: 50–70% safe-shot success in point-play format; use 'safe shot required' rule in rallies as a pressure drill when player is near 70% success (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "ORANGE_2",
    tacticalConcepts: {
      safeline_principle: "Safeline: maximum-margin shot — high topspin crosscourt to centre-deep when under any time or positional pressure (Tennis Australia framework)",
      safe_spot: "Deep crosscourt to the centre of the baseline is the primary safe spot; after wide recovery, the safe spot shifts to the high crosscourt centre",
      height_equals_depth: "Height equals depth rule applied: when hurried, add extra net clearance rather than hitting harder — the ball will land deeper automatically",
      risk_management: "Risk management: down-the-line only when inside the baseline and feet set; crosscourt is always the higher-percentage option; no drop shots or sharp angles while under pressure",
      challenge_band: "Session calibration: 50–70% of point-play rallies ending safely (in target zone or winner, not forced error) is optimal; use conditioned points with bonus points for safe shots (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "ORANGE_1",
    tacticalConcepts: {
      safeline_principle: "Safeline principle: shot that maximises net clearance, lands deep, and reduces opponent's opportunity; high crosscourt to deep middle is the default safe choice under pressure (Tennis Australia framework)",
      safe_spot: "Deep crosscourt to the centre of the baseline (safe spot); from baseline, safe target is 1 m inside the sideline and 2 m from the baseline centre",
      height_equals_depth: "Height equals depth: applied actively — player can describe and demonstrate: hit 60 cm higher over net, ball lands 1–2 m deeper; use to neutralise opponent pace",
      risk_management: "Risk gate: attack when inside baseline + in balance + ball above waist; reset to safe shot when any one condition is not met; can verbalise the gate before each point in practice",
      challenge_band: "Session calibration: 50–70% of attack attempts should succeed; if exceeding 70% success on attack patterns, increase challenge (faster feed, shorter time pressure) to maintain band (Tennis Canada benchmark)",
    },
  },

  // ========== GREEN STAGE ==========
  {
    levelId: "GREEN_3",
    tacticalConcepts: {
      safeline_principle: "Safeline: consistent high topspin crosscourt to deep centre when out of position or under pace pressure; margin over the net (60+ cm) protects against forced error (Tennis Australia framework)",
      safe_spot: "Deep crosscourt to within 1 m of centre baseline; after wide defensive scramble, safe spot is high crosscourt middle — never risk the down-the-line under pressure",
      height_equals_depth: "Height equals depth actively applied: topspin clearance of 60+ cm nets depth past service line; cue: 'if hurried, lift higher' — used in every defensive rally situation",
      risk_management: "Risk management gates: attack down the line only when inside baseline, ball above hip, feet set, opponent not at net; otherwise crosscourt high-deep reset; no angles or drops when rushed",
      challenge_band: "Session calibration: 50–70% challenge band on competitive rally games; track unforced errors vs. winners ratio — target 1:1 or better as session quality indicator (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GREEN_2",
    tacticalConcepts: {
      safeline_principle: "Safeline: maximum-margin crosscourt topspin to deep centre — the tactical baseline when under pressure, out of position, or facing pace (Tennis Australia framework)",
      safe_spot: "Deep crosscourt centre (safe spot primary); secondary safe spot is down the middle at depth — avoids sideline risk when stretched wide",
      height_equals_depth: "Height equals depth rule: player can demonstrate and apply in match: lift the ball 60+ cm over net under pace, achieve depth past service line to neutralise; 'high ball = deep ball' mantra",
      risk_management: "Risk management: 3-condition gate before attacking (inside baseline, above waist, feet set); attack with topspin crosscourt as safest attack option; only go down the line when all 3 conditions met + opponent out of position",
      challenge_band: "Session calibration: 50–70% attack success in conditioned point play; use 'one down the line per 5 rally' rule to manage risk in practice (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "GREEN_1",
    tacticalConcepts: {
      safeline_principle: "Safeline: well-rehearsed default — topspin crosscourt to deep centre; used proactively in point construction, not just under pressure; sets up for directional change (Tennis Australia framework)",
      safe_spot: "Primary safe spot: deep crosscourt centre; secondary: down the middle at depth when opponent is out of position wide; avoid sidelines and short targets when defensive",
      height_equals_depth: "Height equals depth fully internalised: player uses extra net clearance as a tactical tool (e.g. high kick to backhand as safe neutraliser); can describe the mechanical relationship",
      risk_management: "Risk management at Green 1: attack when inside baseline + ball above hip + opponent out of position; reset with safe shot when 1+ condition missing; track shot choice decisions in practice sessions",
      challenge_band: "Session calibration: 50–70% challenge band applied to 3-shot pattern success rates; use competitive scoring with 'safe shot bonus point' rules to reward smart risk management (Tennis Canada benchmark)",
    },
  },

  // ========== YELLOW STAGE ==========
  {
    levelId: "YELLOW_3",
    tacticalConcepts: {
      safeline_principle: "Safeline principle applied to full-court: high topspin crosscourt to deep centre is the default safe choice in any defensive or neutral situation (Tennis Australia framework, full court version)",
      safe_spot: "Deep crosscourt centre (primary); high down the middle at depth from behind baseline (secondary when very wide); safe target is always 1 m inside lines and past service line",
      height_equals_depth: "Height equals depth: used as a serve strategy (kick serve to backhand = safe + deep), as a defensive pass (lobbed topspin crosscourt), and in rally reset; player can describe all three uses",
      risk_management: "Risk gate at Yellow 3: attack when inside baseline, above hip, feet set AND opponent not in optimal position; down the line only when opponent is drawn wide AND all other gates met; verbalise decisions in practice",
      challenge_band: "Session calibration: 50–70% challenge band on conditioned match-score practice; use tiebreak scenarios and 'must win 3 in a row' rules to simulate pressure while tracking safe-shot compliance (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "YELLOW_2",
    tacticalConcepts: {
      safeline_principle: "Safeline: advanced application — deep crosscourt with topspin is the tactical default for neutral and defensive situations; used to open the court for later attack (Tennis Australia framework)",
      safe_spot: "Deep crosscourt centre (primary safe spot); deep down the middle as defensive reset when very wide; approach shot safe target is down the line deep — never short crosscourt",
      height_equals_depth: "Height equals depth applied to kick serve and heavy topspin groundstrokes: high kick serve to backhand forces weak return; heavy loop forehand lands deeper than flat with same effort",
      risk_management: "Risk management at Yellow 2: use crosscourt topspin to create short ball, then down the line on approach; double fault risk managed by safe second serve (kick to backhand); track DF% and safe serve % monthly",
      challenge_band: "Session calibration: 50–70% challenge band on match-play simulations; use tactical statistics (1st serve %, DF%, winners/UE ratio) as calibration indicators — adjust difficulty of scenarios to stay in band (Tennis Canada benchmark)",
    },
  },
  {
    levelId: "YELLOW_1",
    tacticalConcepts: {
      safeline_principle: "Safeline fully internalised: any time under match pressure (tight score, big points), default to high-margin crosscourt to deep centre — the brain must override the urge to go for lines under stress (Tennis Australia framework)",
      safe_spot: "Deep crosscourt centre (primary); kick serve wide to backhand (safeline serve); topspin lob to deep centre on defensive wide ball; all three safe spots used instinctively",
      height_equals_depth: "Height equals depth mastery: player uses loop topspin intentionally for depth under pace; kick serve as a weapon, not just a second-serve option; can adapt height/depth ratio to opponent positioning",
      risk_management: "Risk management gate at Yellow 1: attack decision must be automatic and correct; safe shot is the choice on break points and pressure moments — 'big points = safe shot' rule internalised; tactical adjustment mid-match if risk choices are costing points",
      challenge_band: "Session calibration: 50–70% challenge band in full competitive simulation; match statistics reviewed weekly (1st serve %, DF rate, unforced error %, approach shot efficiency) to calibrate training difficulty (Tennis Canada benchmark)",
    },
  },
];

export async function seedJuniorSafelines() {
  console.log("[Seed] Starting junior safelines tactical concepts seed...");

  let updated = 0;
  let skipped = 0;

  for (const entry of JUNIOR_SAFELINES_DATA) {
    try {
      const result = await db.execute(sql`
        UPDATE level_coaching_context
        SET
          tactical_concepts = ${JSON.stringify(entry.tacticalConcepts)}::jsonb,
          updated_at = NOW()
        WHERE level_id = ${entry.levelId}
      `);
      const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      if (rowCount > 0) {
        updated++;
        console.log(`[Seed] Updated tactical_concepts for ${entry.levelId}`);
      } else {
        console.warn(`[Seed] No row found for ${entry.levelId} — skipping`);
        skipped++;
      }
    } catch (err) {
      console.warn(`[Seed] Error updating ${entry.levelId}:`, err);
      skipped++;
    }
  }

  console.log(`[Seed] Junior safelines done: ${updated} updated, ${skipped} skipped`);
}

if (require.main === module) {
  seedJuniorSafelines()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Junior safelines seed failed:", err);
      process.exit(1);
    });
}
