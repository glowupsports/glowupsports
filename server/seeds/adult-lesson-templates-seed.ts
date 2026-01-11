/**
 * Adult Lesson Templates - Progress Generators
 * 
 * Coach chooses only: Session Type + Goal + Intensity
 * App automatically determines: drills, gates, language, progress mapping
 * 
 * Templates structured per session goal with:
 * - Blocks: warmup → technical → tactical → points → debrief
 * - Skill tags per block
 * - Expected ranges (success %)
 * - Quick coach grading (3 taps)
 */

export interface AdultLessonBlock {
  name: string;
  blockType: "warmup" | "technical" | "tactical" | "points" | "debrief" | "fitness";
  durationMinutes: number;
  pillars: ("TECHNIQUE" | "TACTICAL" | "PHYSICAL" | "MENTAL" | "SOCIAL" | "MATCH")[];
  skillTags?: string[];
  coachInstructions: string;
  playerInstructions: string;
  expectedRanges?: {
    glowRank7to8?: string;
    glowRank5to6?: string;
    glowRank3to4?: string;
  };
}

export interface AdultLessonTemplate {
  id: string;
  name: string;
  description: string;
  sessionGoal: "serve_day" | "rally_day" | "match_day" | "net_day" | "fitness_day" | "mental_day" | "pattern_day";
  sessionType: "private" | "semi_private" | "group";
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  intensityDefault: "light" | "normal" | "high";
  blocks: AdultLessonBlock[];
  skillGatesTargeted: string[];
}

// =============================================================================
// SERVE DAY TEMPLATES
// =============================================================================
const SERVE_CONSISTENCY_PRIVATE: AdultLessonTemplate = {
  id: "ADULT_SERVE_PRIVATE",
  name: "Serve Consistency Session",
  description: "Focus on 1st serve %, 2nd serve reliability, and double fault control",
  sessionGoal: "serve_day",
  sessionType: "private",
  durationMinutes: 60,
  minPlayers: 1,
  maxPlayers: 1,
  intensityDefault: "normal",
  skillGatesTargeted: ["G8_SERVE_OVERHEAD", "G7_SERVE_1ST", "G7_SERVE_2ND", "G6_SERVE_MATCH", "G5_SERVE_PLACEMENT"],
  blocks: [
    {
      name: "Shoulder Mobility & Shadow Serves",
      blockType: "warmup",
      durationMinutes: 8,
      pillars: ["PHYSICAL"],
      coachInstructions: "Focus on shoulder rotation, arm path, and trophy position. Check for tension.",
      playerInstructions: "Warm up your shoulder and practice your serve motion without the ball.",
    },
    {
      name: "Toss & Rhythm Drills",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE"],
      skillTags: ["ADULT_SERVE_OVERHEAD", "ADULT_SERVE_BASIC"],
      coachInstructions: "Focus on consistent toss height and placement. 10 tosses without hitting, then 10 full serves.",
      playerInstructions: "Get your toss in the same spot every time. Feel the rhythm.",
      expectedRanges: {
        glowRank7to8: "55-65% 1st serve in",
        glowRank5to6: "60-70% 1st serve in",
        glowRank3to4: "65-75% 1st serve in",
      },
    },
    {
      name: "Serve Placement Patterns",
      blockType: "tactical",
      durationMinutes: 15,
      pillars: ["TECHNIQUE", "TACTICAL"],
      skillTags: ["ADULT_SERVE_PLACEMENT"],
      coachInstructions: "Wide, body, T serves. Track hit rates per target. Adjust as needed.",
      playerInstructions: "Pick your target before each serve. Own your serve.",
      expectedRanges: {
        glowRank7to8: "N/A (focus on consistency)",
        glowRank5to6: "30-40% target hit rate",
        glowRank3to4: "35-45% target hit rate",
      },
    },
    {
      name: "Serve + 1 Pattern Games",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["TECHNIQUE", "TACTICAL", "MATCH"],
      skillTags: ["ADULT_PATTERN_EXECUTION"],
      coachInstructions: "Play points starting with serve. Focus on first ball after serve.",
      playerInstructions: "Plan your first shot after the serve. Serve with intent.",
    },
    {
      name: "Second Serve Under Pressure",
      blockType: "points",
      durationMinutes: 7,
      pillars: ["TECHNIQUE", "MENTAL"],
      skillTags: ["ADULT_SECOND_SERVE_SPIN", "ADULT_PRESSURE_HANDLING"],
      coachInstructions: "Simulate break point scenarios. Track double faults.",
      playerInstructions: "Imagine it's 30-40. Trust your second serve.",
      expectedRanges: {
        glowRank7to8: "75-85% 2nd serve in",
        glowRank5to6: "80-90% 2nd serve in",
        glowRank3to4: "85-95% 2nd serve in",
      },
    },
    {
      name: "Review & Takeaways",
      blockType: "debrief",
      durationMinutes: 3,
      pillars: ["MENTAL"],
      coachInstructions: "Highlight 1 improvement, 1 focus for next time.",
      playerInstructions: "What felt different today? What will you practice?",
    },
  ],
};

// =============================================================================
// RALLY DAY TEMPLATES
// =============================================================================
const RALLY_CONTROL_GROUP: AdultLessonTemplate = {
  id: "ADULT_RALLY_GROUP",
  name: "Rally Control Session",
  description: "Crosscourt rally stability, depth control, error reduction",
  sessionGoal: "rally_day",
  sessionType: "group",
  durationMinutes: 60,
  minPlayers: 2,
  maxPlayers: 4,
  intensityDefault: "normal",
  skillGatesTargeted: ["G8_RALLY_8", "G7_RALLY_10", "G6_DEPTH", "G5_UE_CONTROL"],
  blocks: [
    {
      name: "Dynamic Stretching & Mini-Tennis",
      blockType: "warmup",
      durationMinutes: 10,
      pillars: ["PHYSICAL"],
      coachInstructions: "Lunges, arm circles, then mini-tennis from service line.",
      playerInstructions: "Get loose and find your timing with short rallies.",
    },
    {
      name: "Height Over Net Drill",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE", "TACTICAL"],
      skillTags: ["ADULT_RALLY_COOPERATIVE"],
      coachInstructions: "Focus on 2-3 feet clearance over net for margin. Count consecutive rallies.",
      playerInstructions: "High and safe over the net. Build the rally.",
      expectedRanges: {
        glowRank7to8: "8-10 ball rallies",
        glowRank5to6: "12-15 ball rallies",
        glowRank3to4: "15-20 ball rallies",
      },
    },
    {
      name: "Depth Control Drill",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE", "TACTICAL"],
      skillTags: ["ADULT_DEPTH_CONTROL"],
      coachInstructions: "Target deep boxes. Count balls landing past service line.",
      playerInstructions: "Push them back! Deep balls are hard to attack.",
      expectedRanges: {
        glowRank7to8: "4-5/10 past service line",
        glowRank5to6: "6-7/10 past service line",
        glowRank3to4: "7-8/10 past service line",
      },
    },
    {
      name: "Crosscourt Rally Challenge",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["TECHNIQUE", "MENTAL", "MATCH"],
      skillTags: ["ADULT_UE_CONTROL"],
      coachInstructions: "Only crosscourt. First to miss loses point. Track error types.",
      playerInstructions: "Consistency is king. Be the last one standing.",
    },
    {
      name: "Open Court Points",
      blockType: "points",
      durationMinutes: 8,
      pillars: ["TACTICAL", "MATCH"],
      coachInstructions: "Rally 4 balls crosscourt, then play open. Track patterns used.",
      playerInstructions: "Build with cross, then open up the court.",
    },
    {
      name: "Debrief & Rally Records",
      blockType: "debrief",
      durationMinutes: 3,
      pillars: ["MENTAL", "SOCIAL"],
      coachInstructions: "Celebrate new personal bests. Note improvements.",
      playerInstructions: "What's your new rally record?",
    },
  ],
};

// =============================================================================
// RETURN & FIRST BALL TEMPLATE
// =============================================================================
const RETURN_FIRST_BALL: AdultLessonTemplate = {
  id: "ADULT_RETURN_SESSION",
  name: "Return & First Ball Session",
  description: "Return neutralize, return direction, 3rd ball plan",
  sessionGoal: "rally_day",
  sessionType: "semi_private",
  durationMinutes: 60,
  minPlayers: 2,
  maxPlayers: 2,
  intensityDefault: "normal",
  skillGatesTargeted: ["G8_RETURN", "G5_RETURN_NEUTRAL"],
  blocks: [
    {
      name: "Ready Position & Split Step",
      blockType: "warmup",
      durationMinutes: 8,
      pillars: ["PHYSICAL", "TECHNIQUE"],
      skillTags: ["ADULT_SPLIT_STEP"],
      coachInstructions: "Focus on timing split step with server's contact.",
      playerInstructions: "Be ready. Split when they hit.",
    },
    {
      name: "Block Return Drill",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE"],
      skillTags: ["ADULT_RETURN_NEUTRAL"],
      coachInstructions: "Feed serves at moderate pace. Focus on getting return in play.",
      playerInstructions: "Block it back. Just get it in play.",
      expectedRanges: {
        glowRank7to8: "5-6/10 returns in play",
        glowRank5to6: "6-7/10 returns in play",
        glowRank3to4: "7-8/10 returns in play",
      },
    },
    {
      name: "Return Direction Drill",
      blockType: "tactical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE", "TACTICAL"],
      coachInstructions: "Call target (cross/line) before serve. Track success rate.",
      playerInstructions: "Know where you're going before the serve comes.",
    },
    {
      name: "Return + 2 Pattern",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["TACTICAL", "MATCH"],
      skillTags: ["ADULT_PATTERN_EXECUTION"],
      coachInstructions: "Play points focusing on return + 2nd ball plan.",
      playerInstructions: "Return, then take control of the rally.",
    },
    {
      name: "First Strike Returns",
      blockType: "points",
      durationMinutes: 10,
      pillars: ["TECHNIQUE", "MENTAL"],
      coachInstructions: "Aggressive return scenarios. When to attack vs neutralize.",
      playerInstructions: "Second serve? Step in and punish.",
    },
    {
      name: "Debrief",
      blockType: "debrief",
      durationMinutes: 3,
      pillars: ["MENTAL"],
      coachInstructions: "Review return improvement, next focus areas.",
      playerInstructions: "What's your return plan for matches?",
    },
  ],
};

// =============================================================================
// NET & TRANSITION TEMPLATE
// =============================================================================
const NET_TRANSITION: AdultLessonTemplate = {
  id: "ADULT_NET_SESSION",
  name: "Net & Transition Session",
  description: "Approach triggers, first volley target, passing shot defense",
  sessionGoal: "net_day",
  sessionType: "semi_private",
  durationMinutes: 60,
  minPlayers: 2,
  maxPlayers: 2,
  intensityDefault: "normal",
  skillGatesTargeted: ["G7_VOLLEY", "G6_APPROACH", "G4_NET_TRANSITION"],
  blocks: [
    {
      name: "Volley Warm-up",
      blockType: "warmup",
      durationMinutes: 8,
      pillars: ["TECHNIQUE", "PHYSICAL"],
      skillTags: ["ADULT_VOLLEY_CONTROL"],
      coachInstructions: "Mini-volleys at net, focus on soft hands and punch motion.",
      playerInstructions: "Quick hands, no big swings.",
    },
    {
      name: "Approach Shot Triggers",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE", "TACTICAL"],
      skillTags: ["ADULT_APPROACH_VOLLEY"],
      coachInstructions: "Feed short balls. Player approaches with direction and comes to net.",
      playerInstructions: "Short ball = your invitation to the net.",
    },
    {
      name: "First Volley Targets",
      blockType: "tactical",
      durationMinutes: 12,
      pillars: ["TECHNIQUE", "TACTICAL"],
      coachInstructions: "Approach + first volley to specific targets. Track hit rate.",
      playerInstructions: "Approach deep, volley to the open court.",
      expectedRanges: {
        glowRank7to8: "4-5/10 volleys in target",
        glowRank5to6: "5-6/10 volleys in target",
        glowRank3to4: "6-7/10 volleys in target",
      },
    },
    {
      name: "Net Points",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["TECHNIQUE", "TACTICAL", "MATCH"],
      coachInstructions: "Play points where player must come to net within first 3 shots.",
      playerInstructions: "Find your way to net and finish.",
    },
    {
      name: "Passing Shot Defense",
      blockType: "points",
      durationMinutes: 10,
      pillars: ["TECHNIQUE", "MENTAL"],
      coachInstructions: "Player at net vs passing shots. Focus on positioning.",
      playerInstructions: "Cover the angles. Close the net.",
    },
    {
      name: "Debrief",
      blockType: "debrief",
      durationMinutes: 3,
      pillars: ["MENTAL"],
      coachInstructions: "Review approach patterns, volley improvements.",
      playerInstructions: "When will you come to net in matches?",
    },
  ],
};

// =============================================================================
// MATCH SIMULATION TEMPLATE
// =============================================================================
const MATCH_SIMULATION: AdultLessonTemplate = {
  id: "ADULT_MATCH_SIMULATION",
  name: "Match Simulation Session",
  description: "Short-set formats, pressure games, tiebreak performance",
  sessionGoal: "match_day",
  sessionType: "semi_private",
  durationMinutes: 90,
  minPlayers: 2,
  maxPlayers: 2,
  intensityDefault: "high",
  skillGatesTargeted: ["G7_SET_STABILITY", "G6_NO_RAGE_QUIT", "G5_CLOSE_GAMES", "G4_TIEBREAK_STABLE"],
  blocks: [
    {
      name: "Match Warm-up Routine",
      blockType: "warmup",
      durationMinutes: 12,
      pillars: ["PHYSICAL", "MENTAL"],
      coachInstructions: "Simulate pre-match warm-up: groundstrokes, volleys, serves, returns.",
      playerInstructions: "Warm up like it's a real match.",
    },
    {
      name: "First Set",
      blockType: "points",
      durationMinutes: 30,
      pillars: ["MATCH", "MENTAL", "TACTICAL"],
      skillTags: ["ADULT_PRESSURE_HANDLING", "ADULT_SPORTSMANSHIP"],
      coachInstructions: "Short set to 4 games, no-ad. Observe tactics, mental state, patterns.",
      playerInstructions: "Play your game. Execute your patterns.",
    },
    {
      name: "Pressure Situations",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["MENTAL", "MATCH"],
      skillTags: ["ADULT_PRESSURE_HANDLING"],
      coachInstructions: "Start points at 30-30, 40-40, tiebreak 5-5. Track decision making.",
      playerInstructions: "Big points. Stay calm. Play smart.",
    },
    {
      name: "Tiebreak Practice",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["MENTAL", "MATCH"],
      coachInstructions: "Play 2-3 tiebreaks. Note composure and point construction.",
      playerInstructions: "Every point matters. Reset between points.",
    },
    {
      name: "Second Set",
      blockType: "points",
      durationMinutes: 12,
      pillars: ["MATCH", "PHYSICAL"],
      coachInstructions: "Short set to 4 or tiebreak to 10, depending on time.",
      playerInstructions: "Finish strong. Manage your energy.",
    },
    {
      name: "Match Analysis",
      blockType: "debrief",
      durationMinutes: 6,
      pillars: ["MENTAL", "TACTICAL"],
      coachInstructions: "Review key moments, patterns used, mental lapses.",
      playerInstructions: "What worked? What didn't? What's next?",
    },
  ],
};

// =============================================================================
// PATTERN DAY TEMPLATE
// =============================================================================
const PATTERN_DAY: AdultLessonTemplate = {
  id: "ADULT_PATTERN_SESSION",
  name: "Pattern Play Session",
  description: "Cross → open court, serve+1, short ball attack",
  sessionGoal: "pattern_day",
  sessionType: "group",
  durationMinutes: 60,
  minPlayers: 2,
  maxPlayers: 4,
  intensityDefault: "normal",
  skillGatesTargeted: ["G6_PATTERNS", "G5_TACTICAL_IQ", "G4_DEFENSIVE_PATTERNS"],
  blocks: [
    {
      name: "Pattern Warm-up",
      blockType: "warmup",
      durationMinutes: 8,
      pillars: ["PHYSICAL", "TACTICAL"],
      coachInstructions: "Mini-tennis with direction changes. Cross, then line.",
      playerInstructions: "Move the ball around. Find the rhythm.",
    },
    {
      name: "Cross → Open Court Pattern",
      blockType: "tactical",
      durationMinutes: 15,
      pillars: ["TACTICAL", "TECHNIQUE"],
      skillTags: ["ADULT_PATTERN_EXECUTION"],
      coachInstructions: "Rally crosscourt until short ball, then attack open court.",
      playerInstructions: "Build cross, wait for the short ball, then open up.",
    },
    {
      name: "Serve + 1 Pattern",
      blockType: "tactical",
      durationMinutes: 12,
      pillars: ["TACTICAL", "TECHNIQUE"],
      skillTags: ["ADULT_PATTERN_EXECUTION"],
      coachInstructions: "Serve to open up court for next shot. Track execution.",
      playerInstructions: "Serve wide, then attack the open court.",
    },
    {
      name: "Defensive Patterns",
      blockType: "tactical",
      durationMinutes: 12,
      pillars: ["TACTICAL", "MENTAL"],
      skillTags: ["ADULT_DEFENSIVE_PATTERNS"],
      coachInstructions: "Practice high heavy ball, neutral cross, reset patterns.",
      playerInstructions: "When you're in trouble, get back to neutral.",
    },
    {
      name: "Pattern Play Points",
      blockType: "points",
      durationMinutes: 10,
      pillars: ["TACTICAL", "MATCH"],
      coachInstructions: "Play points focusing on pattern execution. Call out patterns used.",
      playerInstructions: "Play with intent. Execute your patterns.",
    },
    {
      name: "Pattern Review",
      blockType: "debrief",
      durationMinutes: 3,
      pillars: ["MENTAL", "TACTICAL"],
      coachInstructions: "Review which patterns worked, which need practice.",
      playerInstructions: "Which patterns feel natural now?",
    },
  ],
};

// =============================================================================
// FITNESS DAY TEMPLATE
// =============================================================================
const FITNESS_DAY: AdultLessonTemplate = {
  id: "ADULT_FITNESS_SESSION",
  name: "Tennis Fitness Session",
  description: "Movement, agility, endurance for tennis",
  sessionGoal: "fitness_day",
  sessionType: "group",
  durationMinutes: 60,
  minPlayers: 2,
  maxPlayers: 6,
  intensityDefault: "high",
  skillGatesTargeted: ["G7_SPLIT_STEP", "G3_FITNESS"],
  blocks: [
    {
      name: "Dynamic Warm-up",
      blockType: "warmup",
      durationMinutes: 10,
      pillars: ["PHYSICAL"],
      coachInstructions: "Jogging, high knees, butt kicks, side shuffles, carioca.",
      playerInstructions: "Get your body moving and warm.",
    },
    {
      name: "Agility Ladder & Cones",
      blockType: "fitness",
      durationMinutes: 12,
      pillars: ["PHYSICAL"],
      coachInstructions: "Ladder drills, cone sprints, change of direction work.",
      playerInstructions: "Quick feet! Be light on your toes.",
    },
    {
      name: "Split Step & Recovery Drills",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["PHYSICAL", "TECHNIQUE"],
      skillTags: ["ADULT_SPLIT_STEP"],
      coachInstructions: "Split step timing with ball feeds, recovery to center.",
      playerInstructions: "Split before the ball, recover after every shot.",
    },
    {
      name: "Court Coverage Challenge",
      blockType: "fitness",
      durationMinutes: 12,
      pillars: ["PHYSICAL"],
      coachInstructions: "Side-to-side feeds, make players cover the full court width.",
      playerInstructions: "Get to every ball. No excuses.",
    },
    {
      name: "Endurance Rally",
      blockType: "points",
      durationMinutes: 10,
      pillars: ["PHYSICAL", "MENTAL"],
      coachInstructions: "Long rallies with minimal breaks. Test endurance.",
      playerInstructions: "Keep going. Don't give up.",
    },
    {
      name: "Cool Down & Stretch",
      blockType: "debrief",
      durationMinutes: 4,
      pillars: ["PHYSICAL"],
      coachInstructions: "Static stretching, focus on legs, shoulders, back.",
      playerInstructions: "Stretch it out. Take care of your body.",
    },
  ],
};

// =============================================================================
// MENTAL DAY TEMPLATE
// =============================================================================
const MENTAL_DAY: AdultLessonTemplate = {
  id: "ADULT_MENTAL_SESSION",
  name: "Mental Toughness Session",
  description: "Reset routines, pressure handling, focus training",
  sessionGoal: "mental_day",
  sessionType: "private",
  durationMinutes: 60,
  minPlayers: 1,
  maxPlayers: 1,
  intensityDefault: "normal",
  skillGatesTargeted: ["G6_RESET_ROUTINE", "G5_CLOSE_GAMES", "G4_TIEBREAK_STABLE"],
  blocks: [
    {
      name: "Mindfulness Warm-up",
      blockType: "warmup",
      durationMinutes: 8,
      pillars: ["MENTAL", "PHYSICAL"],
      coachInstructions: "Breathing exercises, present moment focus, body scan.",
      playerInstructions: "Be here now. Focus on your breath.",
    },
    {
      name: "Reset Routine Development",
      blockType: "technical",
      durationMinutes: 12,
      pillars: ["MENTAL"],
      skillTags: ["ADULT_RESET_ROUTINE"],
      coachInstructions: "Help player develop personal reset routine. Practice after each point.",
      playerInstructions: "Create your routine: breathe, bounce, focus, ready.",
    },
    {
      name: "Intentional Errors Drill",
      blockType: "tactical",
      durationMinutes: 10,
      pillars: ["MENTAL"],
      coachInstructions: "Player hits deliberate errors, practices reset routine.",
      playerInstructions: "Miss on purpose, then reset. Practice handling mistakes.",
    },
    {
      name: "Pressure Point Play",
      blockType: "points",
      durationMinutes: 15,
      pillars: ["MENTAL", "MATCH"],
      skillTags: ["ADULT_PRESSURE_HANDLING"],
      coachInstructions: "Start at 4-5 in tiebreak, 30-40, etc. Observe mental state.",
      playerInstructions: "This is what you train for. Stay calm.",
    },
    {
      name: "Focus Under Fatigue",
      blockType: "points",
      durationMinutes: 10,
      pillars: ["MENTAL", "PHYSICAL"],
      coachInstructions: "Physical challenge (sprints), then immediately play pressure points.",
      playerInstructions: "When you're tired, that's when focus matters most.",
    },
    {
      name: "Mental Debrief",
      blockType: "debrief",
      durationMinutes: 5,
      pillars: ["MENTAL"],
      coachInstructions: "Review mental state during session. Identify triggers, solutions.",
      playerInstructions: "What triggers you? How will you handle it?",
    },
  ],
};

// =============================================================================
// EXPORT ALL TEMPLATES
// =============================================================================
export const ADULT_LESSON_TEMPLATES: AdultLessonTemplate[] = [
  SERVE_CONSISTENCY_PRIVATE,
  RALLY_CONTROL_GROUP,
  RETURN_FIRST_BALL,
  NET_TRANSITION,
  MATCH_SIMULATION,
  PATTERN_DAY,
  FITNESS_DAY,
  MENTAL_DAY,
];

/**
 * Get templates by session goal
 */
export function getTemplatesByGoal(goal: AdultLessonTemplate["sessionGoal"]): AdultLessonTemplate[] {
  return ADULT_LESSON_TEMPLATES.filter(t => t.sessionGoal === goal);
}

/**
 * Get templates by session type
 */
export function getTemplatesByType(type: AdultLessonTemplate["sessionType"]): AdultLessonTemplate[] {
  return ADULT_LESSON_TEMPLATES.filter(t => t.sessionType === type);
}

/**
 * Get appropriate template based on player count and goal
 */
export function selectTemplate(
  goal: AdultLessonTemplate["sessionGoal"],
  playerCount: number
): AdultLessonTemplate | null {
  const goalTemplates = getTemplatesByGoal(goal);
  
  // Find template that fits player count
  const matching = goalTemplates.find(
    t => playerCount >= t.minPlayers && playerCount <= t.maxPlayers
  );
  
  return matching || goalTemplates[0] || null;
}
