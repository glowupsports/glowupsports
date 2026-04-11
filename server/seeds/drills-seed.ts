/**
 * Drills Seed - Standardized Drill Library
 * 
 * 16 structured drills across all stages covering key skill areas.
 * Sources: USTA Player Development, Tennis Australia, KNLTB, ITF, Glow methodology
 */

import { db } from "../db";
import { drills } from "../../shared/schema";
import { sql } from "drizzle-orm";

interface DrillEntry {
  id: string;
  name: string;
  skillArea: string;
  stageRange: string[];
  instruction: string;
  repRange: string;
  milestoneCriteria: string;
  source: string;
}

export const DRILL_LIBRARY: DrillEntry[] = [
  // ========== RED/ORANGE ==========
  {
    id: "DRILL_CROSSCOURT_RALLY",
    name: "Crosscourt Cooperative Rally",
    skillArea: "TECHNIQUE",
    stageRange: ["RED", "ORANGE"],
    instruction: "Player and coach (or two players) rally crosscourt from the baseline. Emphasise unit turn before the ball bounces. Count how many consecutive balls land in the crosscourt half. Switch direction each set.",
    repRange: "3 sets of 10 balls",
    milestoneCriteria: "10 consecutive crosscourt balls landing in the correct half without error",
    source: "USTA",
  },
  {
    id: "DRILL_SPLIT_STEP_TIMING",
    name: "Split-Step Timing Gate",
    skillArea: "PHYSICAL",
    stageRange: ["RED", "ORANGE", "GREEN"],
    instruction: "Coach feeds from across the net. Player waits at baseline in ready position. The moment the coach's racket makes contact, player performs a split-step and then moves to the ball. Coach calls 'late', 'on time', or 'early' after each rep. Drill is done at slow and medium pace.",
    repRange: "20 feeds (2 sets of 10)",
    milestoneCriteria: "Split-step timed correctly (coach call: 'on time') on 7 of 10 consecutive feeds",
    source: "Tennis Australia",
  },
  {
    id: "DRILL_10_BALL_SERVE_LADDER",
    name: "10-Ball Serve Ladder",
    skillArea: "SERVE",
    stageRange: ["RED", "ORANGE", "GREEN", "YELLOW"],
    instruction: "Player serves 10 balls to each service box (deuce and ad side). Record how many land in. Points scored: 1 pt = in the box, 2 pts = hits a target cone. Repeat across 3 rounds. Track score each round to show improvement.",
    repRange: "10 serves per box, 3 rounds",
    milestoneCriteria: "Score improves each round; 7 of 10 serves land in target box by round 3",
    source: "USTA",
  },
  {
    id: "DRILL_BLOCK_RETURN_DEEP_MIDDLE",
    name: "Block Return to Deep Middle",
    skillArea: "RETURN",
    stageRange: ["ORANGE", "GREEN", "YELLOW"],
    instruction: "Coach or ball machine serves at 50-60% pace. Player's task: block return to a target cone placed on the deep centre of the baseline (T). No attempt to redirect — focus is on contact quality, compact swing, and depth. Progress by increasing pace 10% each set.",
    repRange: "3 sets of 8 returns",
    milestoneCriteria: "6 of 8 block returns land within 1 metre of the deep centre target",
    source: "KNLTB",
  },
  {
    id: "DRILL_APPROACH_VOLLEY_SEQUENCE",
    name: "Approach + Volley Sequence",
    skillArea: "TACTICAL",
    stageRange: ["ORANGE", "GREEN", "YELLOW"],
    instruction: "Coach feeds a short ball to mid-court. Player drives approach deep cross or down the line, then closes to the net. Coach lobs or passes. Player must either volley away or recover and reset. Emphasise: short ball recognition trigger, drive not push, split before volley.",
    repRange: "4 sets of 5 sequences",
    milestoneCriteria: "Completes the full approach → close → volley or reset sequence 4 of 5 attempts without retreating unnecessarily",
    source: "Tennis Australia",
  },
  {
    id: "DRILL_RESET_DRILL",
    name: "Defensive Reset Drill",
    skillArea: "MENTAL",
    stageRange: ["ORANGE", "GREEN", "YELLOW", "GLOW"],
    instruction: "Coach hammers pace balls at the player from 2m inside the baseline. Player's only objective: get the ball back crosscourt low and deep. No attempt to win the point. Count consecutive successful resets. After 5, coach backs off and plays out the point normally.",
    repRange: "3 rounds of 5 defensive balls + 1 live point",
    milestoneCriteria: "5 consecutive defensive resets crosscourt, then wins or constructs the live point",
    source: "Glow",
  },
  {
    id: "DRILL_OVERHEAD_CONTROL",
    name: "Overhead Control Ladder",
    skillArea: "TECHNIQUE",
    stageRange: ["GREEN", "YELLOW", "GLOW"],
    instruction: "Coach lobs from the service line. Player starts at the T, reads the lob, moves back, and hits an overhead. Progress through 3 zones: Zone 1 = low lob close to service line, Zone 2 = medium lob at 4m, Zone 3 = deep lob near baseline. Player must land overhead in an open court target.",
    repRange: "3 zones × 5 overheads = 15 total",
    milestoneCriteria: "3 of 5 overheads land in the designated open-court target zone at each level",
    source: "USTA",
  },
  {
    id: "DRILL_TOPSPIN_NET_CLEARANCE",
    name: "Topspin Net Clearance Marker",
    skillArea: "TECHNIQUE",
    stageRange: ["GREEN", "YELLOW", "GLOW"],
    instruction: "Tie a rope or use a cone to mark 40 cm above the net tape. Player hits 10 crosscourt forehands with the goal of clearing the marker with topspin. Coach counts clearances vs. hits into net vs. hits long. Track across 3 sets.",
    repRange: "3 sets of 10 forehands",
    milestoneCriteria: "8 of 10 balls clear the 40 cm marker and land in the crosscourt baseline zone",
    source: "Tennis Australia",
  },
  {
    id: "DRILL_ITF_FITNESS_PROTOCOL",
    name: "ITF Monthly Fitness Test Protocol",
    skillArea: "PHYSICAL",
    stageRange: ["YELLOW", "GLOW"],
    instruction: "Run four standardised tests in sequence: (1) 20m sprint x5 with 20s recovery, (2) Spider run x3 (touch all 5 court markers), (3) Side shuffle baseline-to-net-and-back x8, (4) Jump-rope 90s for foot speed. Record times and counts. Test monthly to show improvement.",
    repRange: "1 session per test (approx 25 min total)",
    milestoneCriteria: "Personal best on at least 2 of 4 tests vs. previous month, or meets USTA age-group benchmark for one test",
    source: "ITF",
  },
  {
    id: "DRILL_SERVE_DIRECTION_DISGUISE",
    name: "Serve Direction Disguise Drill",
    skillArea: "SERVE",
    stageRange: ["YELLOW", "GLOW"],
    instruction: "Player serves 10 balls to the deuce court: 5 wide, 5 down the T. Coach watches ball toss position only and guesses direction before contact. Goal: coach guesses incorrectly 4 of 10 times. Player experiments with toss position consistency to disguise intent.",
    repRange: "2 sets of 10 serves per court side",
    milestoneCriteria: "Coach guesses direction incorrectly at least 4 of 10 serves (40% disguise rate)",
    source: "Glow",
  },
  {
    id: "DRILL_RETURN_REDIRECT",
    name: "Return Redirect Targeting",
    skillArea: "RETURN",
    stageRange: ["YELLOW", "GLOW"],
    instruction: "Coach serves at 60-70% pace. Two target cones are set: one crosscourt deep, one down the line at mid-depth. Before each serve, coach calls 'cross' or 'line'. Player must redirect to the called target. If no call is made, player chooses. Progress: remove the call and let player decide based on server position.",
    repRange: "3 sets of 8 returns (4 cross, 4 line per set)",
    milestoneCriteria: "5 of 8 returns land within 1m of the called target; 4 of 4 self-selected returns go to correct zone based on server position",
    source: "USTA",
  },
  {
    id: "DRILL_3_SHOT_PATTERN",
    name: "3-Shot Point Construction Pattern",
    skillArea: "TACTICAL",
    stageRange: ["GREEN", "YELLOW", "GLOW"],
    instruction: "Pre-agree a 3-shot pattern: e.g. (1) Serve wide, (2) Forehand crosscourt, (3) Forehand inside-out. Player runs the pattern 5 times in a row. Coach feeds neutrally and tries to disrupt. After 5, switch to live play and player tries to execute same pattern when opportunity arises.",
    repRange: "3 patterns × 5 attempts per pattern = 15 reps",
    milestoneCriteria: "Completes the agreed 3-shot pattern without breaking 4 of 5 attempts; executes it once in live play",
    source: "Glow",
  },
  {
    id: "DRILL_PRESSURE_POINT_SIMULATION",
    name: "Pressure Point Simulation",
    skillArea: "MENTAL",
    stageRange: ["YELLOW", "GLOW"],
    instruction: "Set score to 30-40 or tiebreak 6-6. Play out points normally. After each point, coach gives verbal feedback on whether the player 'executed' (ran their shot plan) or 'overplayed' (tried for unrealistic winner). Track execution vs. overplay over 20 pressure points.",
    repRange: "20 pressure points across 2 sets of simulated tiebreaks or game points",
    milestoneCriteria: "Executes percentage shot plan (coach call: 'executed') on 14 of 20 pressure points",
    source: "Glow",
  },
  {
    id: "DRILL_PILLAR_CIRCUIT",
    name: "6-Pillar Mini Circuit",
    skillArea: "PHYSICAL",
    stageRange: ["RED", "ORANGE"],
    instruction: "6 stations, 2 minutes each with 30s transition: (1) Bounce and catch with partner (hand-eye), (2) Cone shuffle ladder (footwork), (3) 5-ball rally with coach (technique), (4) Copy-cat mirror movement (tactical awareness), (5) Balance on one foot 30s each side (physical), (6) High-five greeting routine (social). Run 1-2 full circuits.",
    repRange: "1-2 circuits (12-24 minutes total)",
    milestoneCriteria: "Completes all 6 stations without behaviour interruption; personal improvement noted on technique or footwork station",
    source: "KNLTB",
  },
  {
    id: "DRILL_BACKHAND_TOPSPIN_BUILD",
    name: "Backhand Topspin Build Drill",
    skillArea: "TECHNIQUE",
    stageRange: ["GREEN", "YELLOW", "GLOW"],
    instruction: "Player starts at the service line hitting backhand crosscourt mini-rallies with coach. Every 5 balls, player takes one step back. Build from service line to full baseline in stages. At each stage, focus is on brushing up the back of the ball, not pushing. Coach marks a water bottle on the net — target is to clear it by 20 cm.",
    repRange: "5 balls per position × 4 positions = 20 balls",
    milestoneCriteria: "Clears the net marker with topspin at all 4 distances, landing in crosscourt half",
    source: "Tennis Australia",
  },
  {
    id: "DRILL_COOPERATIVE_BASELINE_TARGET",
    name: "Cooperative Baseline Target Rally",
    skillArea: "TECHNIQUE",
    stageRange: ["RED", "ORANGE", "GREEN"],
    instruction: "Place a cone or marker on the deep baseline T. Two players or player+coach rally cooperatively, aiming to land each ball within 1 metre of the cone. No playing for winners. Count consecutive successful targets. Reset count on any error or ball more than 1 metre from target.",
    repRange: "5 attempts to reach 8 consecutive target hits",
    milestoneCriteria: "Achieves 8 consecutive balls landing within 1 metre of the target cone",
    source: "USTA",
  },
];

export async function seedDrills() {
  console.log("[Seed] Starting drills seed...");

  let inserted = 0;
  let skipped = 0;

  for (const drill of DRILL_LIBRARY) {
    try {
      await db.execute(sql`
        INSERT INTO drills (id, name, skill_area, stage_range, instruction, rep_range, milestone_criteria, source)
        VALUES (
          ${drill.id},
          ${drill.name},
          ${drill.skillArea},
          ${JSON.stringify(drill.stageRange)}::jsonb,
          ${drill.instruction},
          ${drill.repRange},
          ${drill.milestoneCriteria},
          ${drill.source}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          skill_area = EXCLUDED.skill_area,
          stage_range = EXCLUDED.stage_range,
          instruction = EXCLUDED.instruction,
          rep_range = EXCLUDED.rep_range,
          milestone_criteria = EXCLUDED.milestone_criteria,
          source = EXCLUDED.source
      `);
      inserted++;
    } catch (err) {
      console.warn(`[Seed] Skipped drill ${drill.id}:`, err);
      skipped++;
    }
  }

  console.log(`[Seed] Drills done: ${inserted} upserted, ${skipped} skipped`);
}
