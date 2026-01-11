/**
 * Adult Glow Rank System - Complete Seed Data
 * 
 * Glow Ranks 9 → 1 (9 = Beginner, 1 = International/Semi-Pro)
 * 
 * Key principles:
 * - Coach never chooses level, app decides
 * - MMR is primary (Elo-based from match results)
 * - Skill gates block unrealistic promotions
 * - Anti-cheat: farming rules, trust factors, consistency engine
 */

// =============================================================================
// GLOW RANKS - 9 levels with MMR ranges and requirements
// =============================================================================
export const ADULT_GLOW_RANKS = [
  {
    rank: 9,
    name: "Beginner Starter",
    mmrRange: { min: 0, max: 300 },
    abilitySnapshot: "Just started tennis, can barely maintain a rally",
    skillGates: [
      { id: "G9_FH_CONTACT", metric: "fh_feeds_over_net", min: 6, outOf: 10, description: "FH contact: 6/10 soft feeds over net" },
      { id: "G9_BH_CONTACT", metric: "bh_feeds_over_net", min: 4, outOf: 10, description: "BH contact: 4/10 over net (slice/bump ok)" },
      { id: "G9_SERVE_BASIC", metric: "serves_in_box", min: 6, outOf: 10, description: "Serve (underhand or simplified): 6/10 in box" },
      { id: "G9_RALLY_4", metric: "rally_count", min: 4, outOf: 1, description: "4-ball cooperative rally (with coach) 3x" },
    ],
    matchRequirements: {
      minMatches8Weeks: 0,
      format: "FIRST_TO_11",
      winrateRange: null,
      opponentSpread: null,
    },
    behaviorGates: [
      { id: "G9_SCORE_HELP", metric: "can_keep_score_with_help", required: true },
      { id: "G9_NO_RAGE", metric: "no_rage_no_quit", required: true },
    ],
  },
  {
    rank: 8,
    name: "Recreational",
    mmrRange: { min: 301, max: 600 },
    abilitySnapshot: "Can do basic rallies, understands rules, plays for fun",
    skillGates: [
      { id: "G8_RALLY_8", metric: "rally_count", min: 8, outOf: 1, description: "8-ball rally at steady pace (with coach) 2x" },
      { id: "G8_SERVE_OVERHEAD", metric: "overhead_serves_in", min: 5, outOf: 10, description: "Overhead serve basis: 5/10 in box" },
      { id: "G8_RETURN", metric: "returns_in_play", min: 5, outOf: 10, description: "Return: 5/10 back in play (coach serve)" },
    ],
    matchRequirements: {
      minMatches8Weeks: 3,
      minMatches16Weeks: 6,
      format: "TIEBREAK_7",
      winrateRange: { min: 30, max: 70 },
      opponentSpread: null,
    },
    behaviorGates: [
      { id: "G8_SCORE_SELF", metric: "keeps_score_independently", required: true },
      { id: "G8_SPORTSMANSHIP", metric: "basic_sportsmanship", required: true },
    ],
  },
  {
    rank: 7,
    name: "Club Player",
    mmrRange: { min: 601, max: 900 },
    abilitySnapshot: "Plays regularly, can play sets, has basic style",
    skillGates: [
      { id: "G7_SERVE_1ST", metric: "first_serve_in_pct", min: 60, outOf: 100, description: "Serve: 6/10 1st serve in" },
      { id: "G7_SERVE_2ND", metric: "second_serve_safe", min: 70, outOf: 100, description: "2nd serve: 7/10 safe (no DF spam)" },
      { id: "G7_RALLY_10", metric: "rally_count", min: 10, outOf: 1, description: "10+ rally (crosscourt) with equal player" },
      { id: "G7_VOLLEY", metric: "volleys_in_court", min: 6, outOf: 10, description: "Volley: 6/10 simple volleys in court" },
      { id: "G7_SPLIT_STEP", metric: "split_step_present", required: true, description: "Movement: split-step present (coach check)" },
    ],
    matchRequirements: {
      minMatches8Weeks: 5,
      format: "SHORT_SET_4",
      winrateRange: { min: 35, max: 65 },
      opponentSpread: 2,
    },
    behaviorGates: [
      { id: "G7_SET_STABILITY", metric: "plays_full_set_no_meltdown", required: true },
      { id: "G7_CALL_DISPUTES", metric: "resolves_calls_normally", required: true },
    ],
  },
  {
    rank: 6,
    name: "Strong Club Player",
    mmrRange: { min: 901, max: 1200 },
    abilitySnapshot: "Can increase tempo, has control, starting to use tactics",
    skillGates: [
      { id: "G6_SERVE_MATCH", metric: "first_serve_in_match_pct", min: 60, outOf: 100, description: "60% 1st serve in match" },
      { id: "G6_SERVE_PRESSURE", metric: "second_serve_under_pressure", required: true, description: "2nd serve consistent under pressure" },
      { id: "G6_DEPTH", metric: "balls_past_service_line", min: 6, outOf: 10, description: "Ground depth: 6/10 past service line" },
      { id: "G6_PATTERNS", metric: "can_execute_2_patterns", required: true, description: "Can execute 2 patterns (cross→open, serve+1)" },
      { id: "G6_APPROACH", metric: "approach_volley_finish", min: 4, outOf: 10, description: "Net: approach + volley finish 4/10" },
    ],
    matchRequirements: {
      minMatches8Weeks: 6,
      format: "FULL_SET",
      winrateRange: { min: 40, max: 60 },
      mustBeatLowerRanks: { rank: 7, margin: "comfortable" },
      opponentSpread: 2,
    },
    behaviorGates: [
      { id: "G6_RESET_ROUTINE", metric: "has_reset_routine", required: true },
      { id: "G6_NO_RAGE_QUIT", metric: "no_rage_quits", required: true },
    ],
  },
  {
    rank: 5,
    name: "Competitive",
    mmrRange: { min: 1201, max: 1500 },
    abilitySnapshot: "Competition/ladder player. Consistently beats lower ranks",
    skillGates: [
      { id: "G5_SERVE_PLACEMENT", metric: "serve_target_hit", min: 4, outOf: 10, description: "Serve placement: 2 targets (wide/body) min 4/10 each" },
      { id: "G5_RETURN_NEUTRAL", metric: "neutralize_return", min: 6, outOf: 10, description: "Return: neutralize 6/10 in play" },
      { id: "G5_UE_CONTROL", metric: "unforced_errors_controlled", required: true, description: "Unforced errors under control (coach rubric)" },
      { id: "G5_TACTICAL_IQ", metric: "recognizes_weakness_adapts", required: true, description: "Recognizes weakness & adapts target" },
    ],
    matchRequirements: {
      minMatches8Weeks: 8,
      format: "FULL_SET",
      winrateRange: { min: 45, max: 55 },
      mustBeatLowerRanks: { rank: 6, consistently: true },
      canBeatHigherRanks: { rank: 4, minWins: 1, inWeeks: 16 },
      opponentSpread: 3,
    },
    behaviorGates: [
      { id: "G5_CLOSE_GAMES", metric: "handles_close_games", required: true },
    ],
  },
  {
    rank: 4,
    name: "Advanced Regional",
    mmrRange: { min: 1501, max: 1800 },
    abilitySnapshot: "Strong, plays with patterns, multiple game plans",
    skillGates: [
      { id: "G4_SECOND_SERVE_SPIN", metric: "second_serve_with_spin", required: true, description: "2nd serve weaponized (slice/kick): safe but with spin" },
      { id: "G4_DEFENSIVE_PATTERNS", metric: "defensive_patterns", min: 2, outOf: 2, description: "Can defend & reset: 2 defensive patterns" },
      { id: "G4_NET_TRANSITION", metric: "net_point_per_game", min: 1, outOf: 1, description: "Transition: initiates 1 net point per game" },
    ],
    matchRequirements: {
      minMatches8Weeks: 10,
      format: "FULL_SET",
      mustCompeteWith: { rank: 3, winrate: { min: 20, max: 40 } },
      opponentSpread: 3,
    },
    behaviorGates: [
      { id: "G4_TIEBREAK_STABLE", metric: "tiebreak_performance_stable", required: true },
    ],
  },
  {
    rank: 3,
    name: "National Level",
    mmrRange: { min: 1801, max: 2200 },
    abilitySnapshot: "High level, few free errors, can absorb and create pace",
    skillGates: [
      { id: "G3_SERVE_PLUS_1", metric: "serve_plus_1_dominance", required: true, description: "Serve+1 dominance: point construction after serve" },
      { id: "G3_BH_RELIABLE", metric: "backhand_no_exploit", required: true, description: "Backhand reliability (no exploit)" },
      { id: "G3_FITNESS", metric: "endurance_speed_baseline", required: true, description: "Fitness baseline: endurance + speed (test)" },
    ],
    matchRequirements: {
      minMatches8Weeks: 10,
      format: "TOURNAMENT",
      mustBeatLowerRanks: { rank: 4, winrate: 60 },
      canBeatHigherRanks: { rank: 2, required: true },
      opponentSpread: 4,
    },
    behaviorGates: [],
  },
  {
    rank: 2,
    name: "National Top",
    mmrRange: { min: 2201, max: 2600 },
    abilitySnapshot: "Near-pro intensity, tactically mature",
    skillGates: [
      { id: "G2_MULTI_STYLE", metric: "multi_style_competence", required: true, description: "Multi-style competence (attack/defend)" },
      { id: "G2_TILT_CONTROL", metric: "mental_tilt_control", required: true, description: "Mental: tilt control under pressure" },
      { id: "G2_STRENGTH", metric: "physical_strength_prevention", required: true, description: "Physical: strength + injury prevention habits" },
    ],
    matchRequirements: {
      minMatches8Weeks: 10,
      format: "TOURNAMENT",
      mustBeatLowerRanks: { rank: 3, multiple: true },
      canBeatHigherRanks: { rank: 1, orScrimmage: true },
      opponentSpread: 5,
    },
    behaviorGates: [],
  },
  {
    rank: 1,
    name: "International / Semi-Pro",
    mmrRange: { min: 2601, max: 3000 },
    abilitySnapshot: "Tournament capable internationally",
    skillGates: [
      { id: "G1_FULL_TOOLKIT", metric: "full_toolkit", required: true, description: "Full toolkit (coach validation + video evidence)" },
    ],
    matchRequirements: {
      format: "INTERNATIONAL_EVENTS",
      highLevelResults: true,
      strongWinQuality: true,
    },
    behaviorGates: [],
  },
];

// =============================================================================
// ADULT SKILL GATES - Detailed rubrics per rank
// =============================================================================
export const ADULT_SKILL_RUBRICS = [
  // Glow 9 Skills
  { id: "ADULT_FH_CONTACT", pillar: "TECHNIQUE", name: "Forehand Contact", description: "Basic forehand contact ability",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot make contact with forehand consistently" },
      { score: 1, label: "Emerging", observable: "Makes contact 4-6/10 times, inconsistent direction" },
      { score: 2, label: "Achieved", observable: "Makes clean contact 7+/10 times, ball goes over net" },
    ]
  },
  { id: "ADULT_BH_CONTACT", pillar: "TECHNIQUE", name: "Backhand Contact", description: "Basic backhand contact ability",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Struggles with backhand grip and contact" },
      { score: 1, label: "Emerging", observable: "Makes contact 3-5/10 times, uses slice or two-handed" },
      { score: 2, label: "Achieved", observable: "Makes clean contact 6+/10 times consistently" },
    ]
  },
  { id: "ADULT_SERVE_BASIC", pillar: "TECHNIQUE", name: "Basic Serve", description: "Underhand or simplified serve",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot serve into correct box" },
      { score: 1, label: "Emerging", observable: "Gets 4-6/10 serves in box" },
      { score: 2, label: "Achieved", observable: "Gets 7+/10 serves in box with consistent motion" },
    ]
  },
  { id: "ADULT_SERVE_OVERHEAD", pillar: "TECHNIQUE", name: "Overhead Serve", description: "Full overhead serve motion",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot execute overhead motion" },
      { score: 1, label: "Emerging", observable: "Gets 4-5/10 overhead serves in, motion developing" },
      { score: 2, label: "Achieved", observable: "Gets 6+/10 overhead serves in with proper motion" },
    ]
  },
  { id: "ADULT_RALLY_COOPERATIVE", pillar: "TECHNIQUE", name: "Rally Ability", description: "Cooperative rally maintenance",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot maintain 3-ball rally" },
      { score: 1, label: "Emerging", observable: "Can do 4-6 ball rallies with coach/patient partner" },
      { score: 2, label: "Achieved", observable: "Can do 8+ ball rallies consistently" },
    ]
  },
  // Glow 7+ Skills
  { id: "ADULT_SPLIT_STEP", pillar: "PHYSICAL", name: "Split Step", description: "Ready position and split step timing",
    rubric: [
      { score: 0, label: "Not Yet", observable: "No split step, flat-footed" },
      { score: 1, label: "Emerging", observable: "Sometimes uses split step, timing inconsistent" },
      { score: 2, label: "Achieved", observable: "Consistent split step before opponent contact" },
    ]
  },
  { id: "ADULT_VOLLEY_CONTROL", pillar: "TECHNIQUE", name: "Volley Control", description: "Net volley execution",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot control volleys, big swing" },
      { score: 1, label: "Emerging", observable: "Gets 4-5/10 volleys in court, punch motion developing" },
      { score: 2, label: "Achieved", observable: "Gets 7+/10 volleys in court with punch motion" },
    ]
  },
  // Glow 6+ Skills
  { id: "ADULT_DEPTH_CONTROL", pillar: "TACTICAL", name: "Depth Control", description: "Hitting deep past service line",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Most balls land short (inside service line)" },
      { score: 1, label: "Emerging", observable: "4-5/10 balls land past service line" },
      { score: 2, label: "Achieved", observable: "7+/10 balls land deep past service line" },
    ]
  },
  { id: "ADULT_PATTERN_EXECUTION", pillar: "TACTICAL", name: "Pattern Execution", description: "Executing tactical patterns",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Plays random, no pattern awareness" },
      { score: 1, label: "Emerging", observable: "Can execute 1 pattern when prompted" },
      { score: 2, label: "Achieved", observable: "Executes 2+ patterns independently (cross→open, serve+1)" },
    ]
  },
  { id: "ADULT_APPROACH_VOLLEY", pillar: "TECHNIQUE", name: "Approach + Volley", description: "Net transition and finish",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot execute approach + volley combination" },
      { score: 1, label: "Emerging", observable: "Finishes 2-4/10 approach volleys" },
      { score: 2, label: "Achieved", observable: "Finishes 5+/10 approach volleys with direction" },
    ]
  },
  // Glow 5+ Skills
  { id: "ADULT_SERVE_PLACEMENT", pillar: "TECHNIQUE", name: "Serve Placement", description: "Serving to specific targets",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot aim serve to specific areas" },
      { score: 1, label: "Emerging", observable: "Hits 2-3/10 serves to intended target" },
      { score: 2, label: "Achieved", observable: "Hits 4+/10 serves to each target (wide/body/T)" },
    ]
  },
  { id: "ADULT_RETURN_NEUTRAL", pillar: "TECHNIQUE", name: "Neutralizing Return", description: "Getting return in play and neutral",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Return is inconsistent, often out or net" },
      { score: 1, label: "Emerging", observable: "Gets 4-5/10 returns in play" },
      { score: 2, label: "Achieved", observable: "Gets 7+/10 returns in play, can neutralize pace" },
    ]
  },
  { id: "ADULT_UE_CONTROL", pillar: "MENTAL", name: "Unforced Error Control", description: "Limiting unforced errors",
    rubric: [
      { score: 0, label: "Not Yet", observable: "High UE rate, plays recklessly" },
      { score: 1, label: "Emerging", observable: "Moderate UE rate, aware of mistakes" },
      { score: 2, label: "Achieved", observable: "Low UE rate, plays within ability" },
    ]
  },
  // Glow 4+ Skills
  { id: "ADULT_SECOND_SERVE_SPIN", pillar: "TECHNIQUE", name: "Spin Second Serve", description: "Second serve with spin",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Flat, weak second serve" },
      { score: 1, label: "Emerging", observable: "Some spin on second, inconsistent" },
      { score: 2, label: "Achieved", observable: "Reliable kick/slice second serve" },
    ]
  },
  { id: "ADULT_DEFENSIVE_PATTERNS", pillar: "TACTICAL", name: "Defensive Patterns", description: "Defend and reset ability",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot defend, always attacks or errors" },
      { score: 1, label: "Emerging", observable: "Can use 1 defensive pattern" },
      { score: 2, label: "Achieved", observable: "Uses 2+ defensive patterns (high heavy, neutral cross)" },
    ]
  },
  // Mental & Behavior Skills
  { id: "ADULT_SCORE_KEEPING", pillar: "MENTAL", name: "Score Keeping", description: "Keeping track of score",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Cannot keep score, needs constant help" },
      { score: 1, label: "Emerging", observable: "Keeps score with occasional help" },
      { score: 2, label: "Achieved", observable: "Keeps score independently and correctly" },
    ]
  },
  { id: "ADULT_SPORTSMANSHIP", pillar: "SOCIAL", name: "Sportsmanship", description: "Fair play and respect",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Poor sportsmanship, disputes, complaints" },
      { score: 1, label: "Emerging", observable: "Usually respectful, occasional issues" },
      { score: 2, label: "Achieved", observable: "Consistently respectful, fair calls, good attitude" },
    ]
  },
  { id: "ADULT_RESET_ROUTINE", pillar: "MENTAL", name: "Reset Routine", description: "Routine between points",
    rubric: [
      { score: 0, label: "Not Yet", observable: "No routine, rushes or dwells on errors" },
      { score: 1, label: "Emerging", observable: "Sometimes uses reset, inconsistent" },
      { score: 2, label: "Achieved", observable: "Consistent reset routine, stays focused" },
    ]
  },
  { id: "ADULT_PRESSURE_HANDLING", pillar: "MENTAL", name: "Pressure Handling", description: "Performance in close situations",
    rubric: [
      { score: 0, label: "Not Yet", observable: "Crumbles under pressure, makes poor decisions" },
      { score: 1, label: "Emerging", observable: "Sometimes handles pressure, inconsistent" },
      { score: 2, label: "Achieved", observable: "Stays composed in tiebreaks and close games" },
    ]
  },
];

// =============================================================================
// MMR CALCULATION CONSTANTS
// =============================================================================
export const MMR_CONFIG = {
  baseK: 28,
  activityFactorThreshold: 6, // matches per 8 weeks
  activeActivityFactor: 1.0,
  inactiveActivityFactor: 0.85,
  newPlayerThreshold: 10, // total matches
  newPlayerVolatility: 1.15,
  establishedVolatility: 1.0,
  
  // Trust factors for match verification
  trustFactors: {
    systemVerified: 1.0,    // Both players confirm in-app
    coachVerified: 0.85,    // Coach verified the result
    selfReported: 0.70,     // One side reported only
  },
  
  // Margin factors for score difference
  marginBase: 0.85,
  marginPerGame: 0.03,
  marginMin: 0.85,
  marginMax: 1.25,
  
  // Anti-farming rules
  sameOpponentMaxPerWeek: 2,
  lowerRankReduction: 0.5, // Wins against >2 ranks lower
  
  // Rank thresholds
  rankThresholds: [
    { rank: 9, minMmr: 0, maxMmr: 300 },
    { rank: 8, minMmr: 301, maxMmr: 600 },
    { rank: 7, minMmr: 601, maxMmr: 900 },
    { rank: 6, minMmr: 901, maxMmr: 1200 },
    { rank: 5, minMmr: 1201, maxMmr: 1500 },
    { rank: 4, minMmr: 1501, maxMmr: 1800 },
    { rank: 3, minMmr: 1801, maxMmr: 2200 },
    { rank: 2, minMmr: 2201, maxMmr: 2600 },
    { rank: 1, minMmr: 2601, maxMmr: 3000 },
  ],
};

// =============================================================================
// ADULT LESSON TEMPLATE TYPES
// =============================================================================
export const ADULT_SESSION_GOALS = [
  "serve_day",
  "rally_day",
  "match_day",
  "net_day",
  "fitness_day",
  "mental_day",
  "pattern_day",
] as const;

export const ADULT_SESSION_TYPES = [
  "private",
  "semi_private",
  "group",
] as const;

export const ADULT_INTENSITY_LEVELS = [
  "light",
  "normal",
  "high",
] as const;

export type AdultSessionGoal = typeof ADULT_SESSION_GOALS[number];
export type AdultSessionType = typeof ADULT_SESSION_TYPES[number];
export type AdultIntensityLevel = typeof ADULT_INTENSITY_LEVELS[number];
