/**
 * Level Coaching Context Seed
 * 
 * Seeds failure points and progression checklists for all 24 ball levels:
 * RED_3 → RED_1, ORANGE_3 → ORANGE_1, GREEN_3 → GREEN_1, YELLOW_3 → YELLOW_1
 * GLOW_9 → GLOW_1, BLUE_3 → BLUE_1
 * 
 * Sources: USTA Player Development, Tennis Australia, KNLTB, ITF, Glow 9→1 rubric
 */

import { db } from "../db";
import { levelCoachingContext } from "../../shared/schema";
import { sql } from "drizzle-orm";

interface CoachingContextEntry {
  levelId: string;
  failurePoints: string[];
  progressionChecklist: string[];
}

export const LEVEL_COACHING_CONTEXT: CoachingContextEntry[] = [
  // ========== RED STAGE ==========
  {
    levelId: "RED_3",
    failurePoints: [
      "Grip reverts to palm/frying-pan under any time pressure",
      "Swing collapses to a push when ball varies in height or direction",
      "No shoulder turn — player uses arm-only mechanics",
      "Motor control breaks down when moving and hitting simultaneously",
      "Loses ready position immediately after each shot",
    ],
    progressionChecklist: [
      "Consistent Eastern grip on all forehands without reminder",
      "Shoulder turn visible on 6 of 10 attempts",
      "Can rally 3 balls cooperatively over the mini net",
      "Returns to ready position after every shot",
      "Demonstrates body control when moving to a slow feed",
    ],
  },
  {
    levelId: "RED_2",
    failurePoints: [
      "Tempo increases before motor control is established — quality degrades under rally speed",
      "Split-step absent or mistimed; player is always late to the ball",
      "Grip switches inconsistently between forehand and backhand",
      "Follow-through cuts short when under perceived pressure",
      "Serve toss direction is unpredictable, leading to body-contact serves",
    ],
    progressionChecklist: [
      "Attempts split-step before opponent contact on 5 of 10 rallies",
      "Forehand and backhand both show recognisable swing path",
      "Can sustain 5-ball cooperative rally on the red court",
      "Ball toss goes consistently forward and up for serve",
      "Understands concept of rally direction (crosscourt vs. down the line)",
    ],
  },
  {
    levelId: "RED_1",
    failurePoints: [
      "Tactical awareness missing — player hits every ball the same regardless of opponent position",
      "Serve second ball is a soft push rather than a full action",
      "Recovery to centre is skipped after wide balls",
      "Volley grip not adapted — uses full groundstroke swing at the net",
      "Mental composure breaks after two or more errors in a row",
    ],
    progressionChecklist: [
      "Directs groundstrokes crosscourt or down the line on request",
      "Completes 3-of-5 serves into the mini service box",
      "Recovers to approximate centre after every baseline shot",
      "Shows continental grip for volleys",
      "Stays on task for a full 4-game match set without behavioural breaks",
    ],
  },

  // ========== ORANGE STAGE ==========
  {
    levelId: "ORANGE_3",
    failurePoints: [
      "Forehand backswing is loop-free — no 'C' shape, just a pull-back push",
      "Split-step disappears entirely under any competitive pressure",
      "Ball bounces unread — player is set up for the shot before judging where the ball will land",
      "Backhand technique collapses when ball is hit with pace",
      "Service motion shortened under match stress — arm-only action",
    ],
    progressionChecklist: [
      "Forehand shows a recognisable 'C' or loop backswing",
      "Split-step timed correctly (at opponent contact) on 5 of 10 points",
      "Can sustain 8-ball crosscourt rally on orange court",
      "Backhand keeps two-handed grip through contact on all fed balls",
      "Serve lands in service box 4 of 10 attempts with full motion",
    ],
  },
  {
    levelId: "ORANGE_2",
    failurePoints: [
      "Rally tactics non-existent — hits direction based on ball arrival, not strategic intent",
      "Approach shot hit defensively (sliced/pushed) instead of driven deep",
      "Volleys are caught too close to the body with a bent elbow",
      "Physical recovery is slow — player does not move back to base quickly",
      "Effort drops visibly on third game and beyond (conditioning gap)",
    ],
    progressionChecklist: [
      "Attempts crosscourt or down-the-line direction on command during rally",
      "Forehand approach driven deep with topspin on fed ball",
      "Volleys made with arm extended and continental grip",
      "Recovers to baseline centre position within 3 steps after each shot",
      "Maintains effort level throughout a 6-game set without visible drop",
    ],
  },
  {
    levelId: "ORANGE_1",
    failurePoints: [
      "Second serve is a flat, low-risk 'get it in' ball with no spin or direction",
      "Return of serve goes back to centre every time — no intent to redirect",
      "Net approaches are random rather than triggered by short ball recognition",
      "Match pressure causes visible technique breakdown at key moments",
      "No pre-point routine — player starts next point before mentally ready",
    ],
    progressionChecklist: [
      "Second serve uses slice or kick to land in service box 5 of 10 attempts",
      "Return of serve directed crosscourt on 4 of 8 attempts",
      "Identifies and approaches on short balls in practice matches",
      "Demonstrates consistent pre-point routine (bounce, breath, decide)",
      "Wins at least 1 full orange-level competition match or equivalent",
    ],
  },

  // ========== GREEN STAGE ==========
  {
    levelId: "GREEN_3",
    failurePoints: [
      "Reverts to flat ball when under pace — topspin mechanics not yet automatic",
      "Serve grip inconsistent — Eastern continental not yet reliable under pressure",
      "Net approach selection poor — moves forward on slow-ball triggers, not opportunity triggers",
      "Footwork to short balls is late — player stops short and reaches rather than arriving",
      "Rally consistency drops below 4 shots once opponent changes pace or height",
    ],
    progressionChecklist: [
      "Produces brushed forehand topspin consistently with correct low-to-high swing path",
      "Uses continental grip for serve on 8 of 10 attempts without reminder",
      "Approaches the net on appropriate short balls with correct footwork",
      "Maintains 6-ball cooperative rally at moderate pace with directional control",
      "Demonstrates basic cross-court pattern awareness in cooperative practice",
    ],
  },
  {
    levelId: "GREEN_2",
    failurePoints: [
      "Topspin production inconsistent — brushing angle shallow, ball sits up for opponent",
      "Serve does not have defined first/second strategy — both treated as first serves",
      "Footwork to wide balls is defensive — player reaches rather than splits and drives",
      "Net game is retreating — player approaches and immediately backs off at first lob threat",
      "No pattern awareness — cannot describe or repeat a 3-shot point-construction pattern",
    ],
    progressionChecklist: [
      "Produces visible topspin on forehand with at least 30 cm net clearance",
      "Defines and executes a first-serve target zone and a second-serve spin strategy",
      "Splits correctly to wide balls and drives from a balanced position",
      "Completes approach+volley+finish sequence from fed short ball",
      "Can describe and demonstrate one tactical pattern (e.g. crosscourt then down the line)",
    ],
  },
  {
    levelId: "GREEN_1",
    failurePoints: [
      "Physical deceleration in third set — technique and decision-making drop after 60 min",
      "Overhead is avoided by dropping to the baseline instead of being attacked",
      "Slice backhand passive — used to survive, never to disrupt or create",
      "Match emotional control: visible frustration after double faults or winners against",
      "Point construction ends after 2 shots — no planning beyond shot 3",
    ],
    progressionChecklist: [
      "Maintains technical quality through simulated 75-min match",
      "Attacks overheads from up to 3 metres behind service line",
      "Uses slice backhand offensively (short angle, drop shot, change of pace)",
      "Manages emotions: no visible frustration after any single error",
      "Demonstrates one 3-shot pattern consistently in practice match play",
    ],
  },

  // ========== YELLOW STAGE ==========
  {
    levelId: "YELLOW_3",
    failurePoints: [
      "Serve placement is predictable — opponent reads direction easily from ball toss",
      "Return game is passive — blocking rather than redirecting or attacking",
      "Movement to net after serve (serve and volley) is absent",
      "Defensive recovery shots go back to centre rather than creating problems",
      "No match stats awareness — player cannot describe own win/loss trends",
    ],
    progressionChecklist: [
      "Disguises serve direction using consistent ball toss position",
      "Returns directed with intention to a target zone 5 of 10 attempts",
      "Executes serve and volley approach once per set in practice",
      "Defensive passing attempt goes crosscourt low at least 4 of 6 attempts",
      "Reviews and discusses own recent match result using basic stats",
    ],
  },
  {
    levelId: "YELLOW_2",
    failurePoints: [
      "Double fault rate above 20% on second serves in match play",
      "Net approach triggers opponent passing shots — approach direction is telegraphed",
      "Physical endurance limits: point construction suffers after 90 minutes",
      "Mental reset after losing a game is slow — first point of next game is consistently lost",
      "Backhand slice used as a bail-out every time pace increases",
    ],
    progressionChecklist: [
      "Second serve double fault rate below 15% in timed match play",
      "Varies approach direction (down line vs. crosscourt) based on opponent position",
      "Maintains consistent tactical execution through 90-minute match simulation",
      "Demonstrates mental reset routine and wins first point of game 4 of 6 times",
      "Backhand drive selected over slice at least 50% of the time when balanced",
    ],
  },
  {
    levelId: "YELLOW_1",
    failurePoints: [
      "High-pressure points (30-40, tiebreak) reveal technique shortcuts",
      "Serve under pressure loses 30% of first-serve percentage",
      "Tactical adjustment mid-match absent — continues same pattern even when losing",
      "Physical fitness gap: movement quality degrades in second and third sets",
      "Competitive mindset: over-tries on break points rather than executing practiced patterns",
    ],
    progressionChecklist: [
      "First-serve percentage stable (within 5%) on high-pressure points",
      "Adjusts tactics after losing 3 games in a row (can describe the adjustment)",
      "Maintains movement quality and first-step speed through 2 hours of match play",
      "Executes practiced patterns on break points without over-swinging",
      "Competes at regional junior level or equivalent full-court format",
    ],
  },

  // ========== GLOW STAGE (Adults) ==========
  {
    levelId: "GLOW_9",
    failurePoints: [
      "No consistent grip — reverts to palm grip on every fast ball",
      "Swing is a push or a slap — no recognisable backswing, contact, follow-through sequence",
      "Ball awareness absent — player does not track ball off the racket",
      "Body and ball are out of sync — feet planted while arm reaches for ball",
    ],
    progressionChecklist: [
      "Eastern grip held consistently for 5 consecutive forehand swings",
      "Backswing, contact, follow-through all visible in slow-motion check",
      "Can rally 3 balls cooperatively over the net from the service line",
      "Moves 1-2 steps to position before hitting",
      "Understands the difference between rally and point play",
    ],
  },
  {
    levelId: "GLOW_8",
    failurePoints: [
      "Forehand and backhand grips are identical — no grip change between wings",
      "No split-step or weight transfer on any shot",
      "Serve toss is dropped rather than released upward — leads to body contact",
      "Physical tension in arm and shoulder causes mishits under any time pressure",
    ],
    progressionChecklist: [
      "Grip changes between forehand and backhand without looking at racket",
      "Weight transfers forward through contact on groundstrokes",
      "Ball toss goes 30+ cm upward consistently",
      "Can sustain 5-ball cooperative rally from the baseline",
      "Completes 2 serves into the service box from 5 attempts",
    ],
  },
  {
    levelId: "GLOW_7",
    failurePoints: [
      "Rallying breaks down above 5 balls — errors increase with rally length",
      "No understanding of crosscourt vs. down-the-line risk management",
      "Volley technique uses full groundstroke swing at the net",
      "Recovery to base is absent — stands and watches after each shot",
      "Physical deceleration visible after 20 minutes of continuous play",
    ],
    progressionChecklist: [
      "Sustains 10-ball cooperative crosscourt rally with topspin",
      "Correctly identifies which shots have lower net clearance risk",
      "Demonstrates punch volley with continental grip",
      "Returns to approximate base position after every groundstroke",
      "Plays 45 minutes continuously without visible energy drop",
    ],
  },
  {
    levelId: "GLOW_6",
    failurePoints: [
      "Second serve collapses under pressure — becomes a flat push with low first-serve speed",
      "Defensive balls go back to the middle — no attempt to redirect or create time",
      "Approach shot after short ball is driven hard into the net",
      "Double fault rate above 30% in match play",
      "No awareness of opponent court position during point construction",
    ],
    progressionChecklist: [
      "Second serve uses slice or kick spin: 4 of 8 land in the box",
      "Defensive rally ball directed crosscourt low and deep on request",
      "Short-ball approach driven deep to the open court",
      "Double fault rate below 20% in match play",
      "Describes opponent position before selecting shot direction",
    ],
  },
  {
    levelId: "GLOW_5",
    failurePoints: [
      "Return of serve is a block — no intention to redirect or put pressure on server",
      "Net approach is random — not triggered by short ball opportunity",
      "Backhand breaks down under any high-pace ball (reverts to slice survival)",
      "Match play patterns are reactive, not constructed — no 1-2-3 pattern execution",
      "Mental composure drops after 2+ consecutive errors — next point tactics suffer",
    ],
    progressionChecklist: [
      "Return directed with intent to target zone 4 of 8 attempts",
      "Identifies and approaches short balls consistently in practice match",
      "Backhand drive used (not slice) when ball is at comfortable height",
      "Demonstrates one 3-shot point-construction pattern in practice",
      "Maintains composure after 2 errors in a row: next point approach unchanged",
    ],
  },
  {
    levelId: "GLOW_4",
    failurePoints: [
      "Topspin loop on forehand shallow — ball lands short, allowing opponent to attack",
      "Net game abandoned at first sign of passing shot threat",
      "Serve direction same every point — opponent can read and position early",
      "Physical deceleration after 60 minutes: footwork and recovery slow",
      "Overhead avoided — player drops back to baseline on every lob",
    ],
    progressionChecklist: [
      "Topspin forehand clears net by 40+ cm and lands past service line",
      "Executes volley+overhead finish sequence from fed lob",
      "Varies serve direction game-to-game — can describe the pattern",
      "Maintains first-step speed and recovery through 75-minute session",
      "Attacks overheads from up to 2m behind service line",
    ],
  },
  {
    levelId: "GLOW_3",
    failurePoints: [
      "Tactical adjustment mid-set absent — loses games without changing pattern",
      "Second serve double fault rate above 15% in competitive match",
      "Slice backhand is a defensive default — never used offensively",
      "High-pressure point (30-40, game 5) reveals technique shortcuts",
      "Physical base insufficient for 3-set competitive play",
    ],
    progressionChecklist: [
      "Identifies and makes one tactical adjustment after losing 2 consecutive games",
      "Second serve double fault rate below 10% in competition",
      "Uses slice backhand offensively at least once per set (drop shot, angle, disruptor)",
      "Technique quality stable on pressure points (no shortening of swing)",
      "Completes simulated 3-set match with physical quality maintained throughout",
    ],
  },
  {
    levelId: "GLOW_2",
    failurePoints: [
      "Serve loses 30% first-serve percentage on break and set points",
      "Footwork pattern to wide balls is reactive — no anticipatory split-step",
      "Opponent's game plan read too late — pattern not recognised until game 4+",
      "Groundstroke patterns collapse under 6+ shot rally pressure",
      "Competitive anxiety over-engages — swings harder instead of safer on big points",
    ],
    progressionChecklist: [
      "First-serve percentage within 8% of regular on break and set points",
      "Split-step timed to opponent contact on 7 of 10 groundstrokes",
      "Identifies opponent's main tactical pattern by game 2",
      "Sustains tactical pattern execution in rallies of 8+ shots",
      "Uses percentage shot on break points rather than attempted winner",
    ],
  },
  {
    levelId: "GLOW_1",
    failurePoints: [
      "Physical deceleration after 90+ minutes: movement becomes predictable under fatigue",
      "Serve under match-pressure loses 20-30% of first-serve percentage",
      "Mental reset after losing a set takes 2+ games to stabilise",
      "Pattern repetition becomes predictable at club-level competitive play",
      "Overheads from high, deep lobs are attacked instead of reset safely",
    ],
    progressionChecklist: [
      "Movement quality and first-step speed maintained through 2-hour match simulation",
      "First-serve percentage within 5% of standard on all pressure points",
      "Mental reset completed within 1 game of losing a set",
      "Executes at least 3 different tactical patterns in a single match",
      "Competes at club championship level or equivalent regional competition",
    ],
  },

  // ========== BLUE STAGE (adult beginners / recreational pathway) ==========
  {
    levelId: "BLUE_1",
    failurePoints: [
      "Losing consistent rally length when court opens up to full dimensions",
      "Serve action breaks down with full-court pressure — toss and swing coordination fails",
      "Net approach not triggered by the right ball — timing and selection errors",
      "Low ball confidence under pressure in early match-play situations",
    ],
    progressionChecklist: [
      "Maintains 4+ ball rallies with directional control on a full court",
      "Serve lands in with correct grip and 60%+ consistency",
      "Moves forward to net on short balls with purpose and balanced approach",
      "Reads opponent position and selects a direction deliberately",
    ],
  },
  {
    levelId: "BLUE_2",
    failurePoints: [
      "Cannot sustain cross-court vs down-the-line pattern switch under pressure",
      "Net approach collapses when first volley is low or wide — retreat instead of close",
      "Second serve too passive — consistently gets attacked by opponent",
      "Rally patterns break down against pace variation — loses depth and direction",
    ],
    progressionChecklist: [
      "Constructs 3-ball patterns intentionally (setup + attack + finish)",
      "Second serve lands deep with spin and variation on 6 of 10 attempts",
      "Volleys closed out correctly from inside the service box",
      "Recognises short ball opportunity and converts net approach consistently",
    ],
  },
  {
    levelId: "BLUE_3",
    failurePoints: [
      "Cannot sustain tactical pattern under fatigue — technique regresses in extended rallies",
      "Serve variety absent under competition pressure — relies on single flat delivery",
      "Footwork recovery incomplete after wide balls — gets caught out of position",
      "Point construction reverts to single-shot hitting rather than planned 3-ball patterns",
    ],
    progressionChecklist: [
      "Controls ball height and depth deliberately in extended rally sequences",
      "Demonstrates slice or kick serve with intentional trajectory variation",
      "Returns effectively from wide positions to reset or attack short balls",
      "Completes full groundstroke recovery footwork after each ball in rally",
    ],
  },
];

export async function seedLevelCoachingContext() {
  console.log("[Seed] Starting level_coaching_context seed...");

  let inserted = 0;
  let skipped = 0;

  for (const entry of LEVEL_COACHING_CONTEXT) {
    try {
      await db.execute(sql`
        INSERT INTO level_coaching_context (level_id, failure_points, progression_checklist)
        VALUES (
          ${entry.levelId},
          ${JSON.stringify(entry.failurePoints)}::jsonb,
          ${JSON.stringify(entry.progressionChecklist)}::jsonb
        )
        ON CONFLICT (level_id) DO UPDATE SET
          failure_points = EXCLUDED.failure_points,
          progression_checklist = EXCLUDED.progression_checklist,
          updated_at = NOW()
      `);
      inserted++;
    } catch (err) {
      console.warn(`[Seed] Skipped level_coaching_context for ${entry.levelId}:`, err);
      skipped++;
    }
  }

  console.log(`[Seed] level_coaching_context done: ${inserted} upserted, ${skipped} skipped`);
}
