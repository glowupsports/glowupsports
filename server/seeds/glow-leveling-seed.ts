/**
 * Glow Leveling OS - Complete Seed Data
 * 
 * This file contains all the seed data for the 12-level skill certification system:
 * - RED_3, RED_2, RED_1 (mini court, red ball)
 * - ORANGE_3, ORANGE_2, ORANGE_1 (3/4 court, orange ball)
 * - GREEN_3, GREEN_2, GREEN_1 (full court, green ball)
 * - YELLOW_3, YELLOW_2, YELLOW_1 (full court, yellow ball)
 * 
 * Rubric System: 0 = Not Yet, 1 = Emerging, 2 = Achieved
 */

import { db } from "../db";
import { ballLevels, glowSkills, skillRubrics, levelSkills, levelTests } from "@shared/schema";

// =============================================================================
// BALL LEVELS - 12 levels with promotion requirements
// =============================================================================
export const BALL_LEVELS_SEED = [
  // RED STAGE
  {
    id: "RED_3",
    stage: "RED",
    rank: 3,
    languageTier: "RED",
    displayNamePlayer: "Red 3",
    displayNameCoach: "Red 3 (Starter)",
    identity: "I can hit the ball and play together.",
    courtType: "mini_court",
    ballType: "red_foam",
    promotionTo: "RED_2",
    promotionRequirements: {
      skillAchievedCount: 6,
      pillarMinimum: { TECHNIQUE: 1, MENTAL: 1, SOCIAL: 1 },
      tests: ["RED3_CONTACT_GATE", "RED3_BEHAVIOR_GATE", "RED3_FUN_MATCH"],
      evidenceMin: 1,
      matchEvents: 1
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "RED_2",
    stage: "RED",
    rank: 2,
    languageTier: "RED",
    displayNamePlayer: "Red 2",
    displayNameCoach: "Red 2 (Builder)",
    identity: "I can rally short and I'm starting to serve.",
    courtType: "mini_court",
    ballType: "red_low_compression",
    promotionTo: "RED_1",
    promotionRequirements: {
      skillAchievedCount: 10,
      pillarMinimum: { TECHNIQUE: 1, PHYSICAL: 1, MENTAL: 1, SOCIAL: 1 },
      tests: ["RED2_RALLY_GATE", "RED2_SERVE_GATE", "RED2_MATCH_GATE"],
      evidenceMin: 2,
      matchEvents: 3
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "RED_1",
    stage: "RED",
    rank: 1,
    languageTier: "RED",
    displayNamePlayer: "Red 1",
    displayNameCoach: "Red 1 (Graduate)",
    identity: "I can play real points, serve, and I'm ready for Orange.",
    courtType: "mini_court",
    ballType: "red_low_compression",
    promotionTo: "ORANGE_3",
    promotionRequirements: {
      skillAchievedCount: 14,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 1, PHYSICAL: 1, MENTAL: 2, SOCIAL: 1, MATCH: 1 },
      tests: ["RED1_SERVE_RETURN_GATE", "RED1_RALLY_GATE", "RED_GRAD_MATCH"],
      evidenceMin: 3,
      matchEvents: 6,
      matchWins: 2
    },
    trialEnabled: true,
    trialDays: 14
  },
  
  // ORANGE STAGE
  {
    id: "ORANGE_3",
    stage: "ORANGE",
    rank: 3,
    languageTier: "ORANGE",
    displayNamePlayer: "Orange 3",
    displayNameCoach: "Orange 3 (Adapter)",
    identity: "I can play on a bigger court and control the ball.",
    courtType: "three_quarter_court",
    ballType: "orange",
    promotionTo: "ORANGE_2",
    promotionRequirements: {
      skillAchievedCount: 8,
      pillarMinimum: { TECHNIQUE: 1, MENTAL: 1 },
      tests: ["OR3_RALLY_GATE", "OR3_SERVE_GATE", "OR3_MATCH_LOG"],
      evidenceMin: 1,
      matchEvents: 2
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "ORANGE_2",
    stage: "ORANGE",
    rank: 2,
    languageTier: "ORANGE",
    displayNamePlayer: "Orange 2",
    displayNameCoach: "Orange 2 (Constructor)",
    identity: "I can build points and adapt my game.",
    courtType: "three_quarter_court",
    ballType: "orange",
    promotionTo: "ORANGE_1",
    promotionRequirements: {
      skillAchievedCount: 12,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 1, MATCH: 1 },
      tests: ["OR2_RALLY_GATE", "OR2_SERVE_RETURN_GATE", "OR2_MATCH_GATE"],
      evidenceMin: 2,
      matchEvents: 5,
      matchWins: 1
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "ORANGE_1",
    stage: "ORANGE",
    rank: 1,
    languageTier: "ORANGE",
    displayNamePlayer: "Orange 1",
    displayNameCoach: "Orange 1 (Pre-Green Graduate)",
    identity: "I play real tennis points and I'm ready for full court.",
    courtType: "three_quarter_court",
    ballType: "orange",
    promotionTo: "GREEN_3",
    promotionRequirements: {
      skillAchievedCount: 16,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, MENTAL: 2, MATCH: 2 },
      tests: ["OR1_FULL_GATE", "OR1_RALLY_GATE", "OR_GRAD_MATCH"],
      evidenceMin: 3,
      matchEvents: 8,
      matchWins: 3
    },
    trialEnabled: true,
    trialDays: 14
  },
  
  // GREEN STAGE
  {
    id: "GREEN_3",
    stage: "GREEN",
    rank: 3,
    languageTier: "GREEN",
    displayNamePlayer: "Green 3",
    displayNameCoach: "Green 3 (Full-Court Adapter)",
    identity: "I can play full court without chaos. I stay in a rally and I serve for real.",
    courtType: "full_court",
    ballType: "green",
    promotionTo: "GREEN_2",
    promotionRequirements: {
      skillAchievedCount: 10,
      pillarMinimum: { TECHNIQUE: 1, PHYSICAL: 1, MATCH: 1 },
      tests: ["G3_RALLY_GATE", "G3_DEPTH_GATE", "G3_SERVE_GATE", "G3_MATCH_LOG"],
      evidenceMin: 2,
      matchEvents: 3
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "GREEN_2",
    stage: "GREEN",
    rank: 2,
    languageTier: "GREEN",
    displayNamePlayer: "Green 2",
    displayNameCoach: "Green 2 (Point Builder)",
    identity: "I can build points with depth, direction, and a plan.",
    courtType: "full_court",
    ballType: "green",
    promotionTo: "GREEN_1",
    promotionRequirements: {
      skillAchievedCount: 14,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, MATCH: 1, MENTAL: 1 },
      tests: ["G2_RALLY_GATE", "G2_SERVE_RETURN_GATE", "G2_SECOND_SERVE_GATE", "G2_MATCH_GATE"],
      evidenceMin: 3,
      matchEvents: 6,
      matchWins: 2
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "GREEN_1",
    stage: "GREEN",
    rank: 1,
    languageTier: "GREEN",
    displayNamePlayer: "Green 1",
    displayNameCoach: "Green 1 (Pre-Yellow Graduate)",
    identity: "I play real tennis on full court with control, 2nd serve, and mental stability.",
    courtType: "full_court",
    ballType: "green",
    promotionTo: "YELLOW_3",
    promotionRequirements: {
      skillAchievedCount: 18,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, PHYSICAL: 2, MENTAL: 2, MATCH: 2, SOCIAL: 1 },
      tests: ["G1_SERVE_TEST", "G1_RETURN_TEST", "G1_RALLY_TEST", "G1_MATCH_CERT"],
      evidenceMin: 4,
      matchEvents: 10,
      matchWins: 4
    },
    trialEnabled: true,
    trialDays: 14
  },
  
  // YELLOW STAGE
  {
    id: "YELLOW_3",
    stage: "YELLOW",
    rank: 3,
    languageTier: "YELLOW",
    displayNamePlayer: "Yellow 3",
    displayNameCoach: "Yellow 3 (Competitive Entry)",
    identity: "I play real matches with rules, 2nd serve, and focus.",
    courtType: "full_court",
    ballType: "yellow",
    promotionTo: "YELLOW_2",
    promotionRequirements: {
      skillAchievedCount: 12,
      pillarMinimum: { TECHNIQUE: 1, MENTAL: 1 },
      tests: ["Y3_SERVE_GATE", "Y3_RETURN_GATE", "Y3_MATCH_GATE"],
      evidenceMin: 2,
      matchEvents: 6,
      matchWins: 2
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "YELLOW_2",
    stage: "YELLOW",
    rank: 2,
    languageTier: "YELLOW",
    displayNamePlayer: "Yellow 2",
    displayNameCoach: "Yellow 2 (Established Competitor)",
    identity: "I win matches with structure, discipline, and smart choices.",
    courtType: "full_court",
    ballType: "yellow",
    promotionTo: "YELLOW_1",
    promotionRequirements: {
      skillAchievedCount: 16,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, MENTAL: 2, MATCH: 2 },
      tests: ["Y2_PRESSURE_SERVE", "Y2_PATTERN_TEST", "Y2_MATCH_GATE"],
      evidenceMin: 3,
      matchEvents: 12,
      matchWins: 5
    },
    trialEnabled: true,
    trialDays: 14
  },
  {
    id: "YELLOW_1",
    stage: "YELLOW",
    rank: 1,
    languageTier: "YELLOW",
    displayNamePlayer: "Yellow 1",
    displayNameCoach: "Yellow 1 (Advanced / Pre-Performance)",
    identity: "I play mature tennis with control, discipline, and my own identity.",
    courtType: "full_court",
    ballType: "yellow",
    promotionTo: null,
    promotionRequirements: {
      skillAchievedCount: 20,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, PHYSICAL: 2, MENTAL: 2, SOCIAL: 2, MATCH: 2 },
      tests: ["Y1_MATCH_CERT", "Y1_SERVE_PRESSURE", "Y1_TACTICAL_REVIEW"],
      evidenceMin: 5,
      matchEvents: 20,
      matchWins: 10
    },
    trialEnabled: true,
    trialDays: 14
  }
];

// =============================================================================
// SKILLS - All skills across all stages with pillar associations
// =============================================================================
export const GLOW_SKILLS_SEED = [
  // ========== RED STAGE SKILLS ==========
  // TECHNIQUE
  { id: "FH_CONTACT", pillar: "TECHNIQUE", name: "Forehand contact", stage: "RED" },
  { id: "BH_CONTACT", pillar: "TECHNIQUE", name: "Backhand contact", stage: "RED" },
  { id: "RALLY_COOP", pillar: "TECHNIQUE", name: "Cooperative rally", stage: "RED" },
  { id: "SERVE_INTRO", pillar: "TECHNIQUE", name: "Serve intro (throw-to-hit)", stage: "RED" },
  { id: "SERVE_OVERHAND", pillar: "TECHNIQUE", name: "Overhand serve (baseline red)", stage: "RED" },
  { id: "VOLLEY_TAP", pillar: "TECHNIQUE", name: "Volley tap control", stage: "RED" },
  { id: "OVERHEAD_EXPOSURE", pillar: "TECHNIQUE", name: "Overhead exposure", stage: "RED" },
  
  // TACTICAL
  { id: "HOME_SPOT", pillar: "TACTICAL", name: "Recover to home spot", stage: "RED" },
  { id: "AIM_OPEN_SPACE", pillar: "TACTICAL", name: "Aim to open space", stage: "RED" },
  { id: "SCORE_RULES_MINI", pillar: "TACTICAL", name: "Mini scoring & rules", stage: "RED" },
  { id: "RETURN_INPLAY", pillar: "TACTICAL", name: "Return in play", stage: "RED" },
  
  // PHYSICAL
  { id: "READY_POSITION", pillar: "PHYSICAL", name: "Ready position habit", stage: "RED" },
  { id: "ABC_BALANCE", pillar: "PHYSICAL", name: "Balance / stop-start", stage: "RED" },
  { id: "CATCH_THROW", pillar: "PHYSICAL", name: "Catch & throw target", stage: "RED" },
  { id: "SIDE_SHUFFLE", pillar: "PHYSICAL", name: "Side shuffle (mini court)", stage: "RED" },
  { id: "COURT_COVER_RED", pillar: "PHYSICAL", name: "Cover wide + recover", stage: "RED" },
  
  // MENTAL
  { id: "FOLLOW_INSTRUCTIONS", pillar: "MENTAL", name: "Follows instructions", stage: "RED" },
  { id: "COACHABILITY", pillar: "MENTAL", name: "Coachability (respond to cues)", stage: "RED" },
  { id: "RESET_ROUTINE_RED", pillar: "MENTAL", name: "Reset after mistake", stage: "RED" },
  
  // SOCIAL
  { id: "TURN_TAKING", pillar: "SOCIAL", name: "Turn taking", stage: "RED" },
  { id: "SPORTSMANSHIP_RED", pillar: "SOCIAL", name: "Sportsmanship", stage: "RED" },
  { id: "TEAM_HELP", pillar: "SOCIAL", name: "Helps teammates", stage: "RED" },
  
  // MATCH
  { id: "MATCH_PARTICIPATION_RED", pillar: "MATCH", name: "Match participation", stage: "RED" },
  { id: "MATCH_WINS_RED", pillar: "MATCH", name: "Match wins / dominance", stage: "RED" },
  
  // ========== ORANGE STAGE SKILLS ==========
  // TECHNIQUE
  { id: "BASELINE_RALLY_OR", pillar: "TECHNIQUE", name: "Baseline rally (8+)", stage: "ORANGE" },
  { id: "SERVE_FULL_MOTION", pillar: "TECHNIQUE", name: "Serve full motion", stage: "ORANGE" },
  { id: "RETURN_BLOCK", pillar: "TECHNIQUE", name: "Return block", stage: "ORANGE" },
  { id: "VOLLEY_CONTROL_OR", pillar: "TECHNIQUE", name: "Volley control", stage: "ORANGE" },
  { id: "RALLY_12_PLUS", pillar: "TECHNIQUE", name: "Rally 12+ balls", stage: "ORANGE" },
  { id: "SECOND_SERVE_INTRO", pillar: "TECHNIQUE", name: "Second serve intro", stage: "ORANGE" },
  { id: "OVERHEAD_OR", pillar: "TECHNIQUE", name: "Overhead control", stage: "ORANGE" },
  { id: "BH_STABILITY", pillar: "TECHNIQUE", name: "Backhand stability", stage: "ORANGE" },
  { id: "RALLY_15_PLUS", pillar: "TECHNIQUE", name: "Rally 15+ balls", stage: "ORANGE" },
  { id: "SERVE_8_10", pillar: "TECHNIQUE", name: "Serve 8/10 in", stage: "ORANGE" },
  { id: "RETURN_8_10", pillar: "TECHNIQUE", name: "Return 8/10 controlled", stage: "ORANGE" },
  { id: "VOLLEYS_STABLE", pillar: "TECHNIQUE", name: "Volleys stable L/R", stage: "ORANGE" },
  { id: "OVERHEAD_6_10", pillar: "TECHNIQUE", name: "Overhead 6/10 control", stage: "ORANGE" },
  
  // TACTICAL
  { id: "CROSSCOURT_INTENT", pillar: "TACTICAL", name: "Cross-court intent", stage: "ORANGE" },
  { id: "RECOVERY_CENTER", pillar: "TACTICAL", name: "Recovery to center", stage: "ORANGE" },
  { id: "BASELINE_PATTERN", pillar: "TACTICAL", name: "Baseline pattern (cross->open)", stage: "ORANGE" },
  { id: "SHORT_BALL_APPROACH", pillar: "TACTICAL", name: "Short ball approach", stage: "ORANGE" },
  { id: "HEIGHT_VARIATION", pillar: "TACTICAL", name: "Height variation", stage: "ORANGE" },
  { id: "GAMEPLAN_BASIC", pillar: "TACTICAL", name: "Basic gameplan", stage: "ORANGE" },
  { id: "SERVE_PLUS_ONE", pillar: "TACTICAL", name: "Serve +1 pattern", stage: "ORANGE" },
  { id: "WEAKNESS_RECOGNITION", pillar: "TACTICAL", name: "Recognize opponent weakness", stage: "ORANGE" },
  
  // PHYSICAL
  { id: "SPLIT_STEP_60", pillar: "PHYSICAL", name: "Split-step 60%", stage: "ORANGE" },
  { id: "LATERAL_MOVEMENT", pillar: "PHYSICAL", name: "Lateral movement", stage: "ORANGE" },
  { id: "SESSION_FOCUS_45", pillar: "PHYSICAL", name: "45 min session focus", stage: "ORANGE" },
  { id: "SPLIT_STEP_70", pillar: "PHYSICAL", name: "Split-step 70%", stage: "ORANGE" },
  { id: "ENDURANCE_60", pillar: "PHYSICAL", name: "Endurance 60 min", stage: "ORANGE" },
  { id: "DROP_RECOVER", pillar: "PHYSICAL", name: "Drop shot + recover", stage: "ORANGE" },
  { id: "COURT_COVER_34", pillar: "PHYSICAL", name: "3/4 court coverage", stage: "ORANGE" },
  { id: "EXPLOSIVE_FIRST_STEP", pillar: "PHYSICAL", name: "Explosive first step", stage: "ORANGE" },
  { id: "TWO_MATCHES_DAY", pillar: "PHYSICAL", name: "2 matches per day", stage: "ORANGE" },
  
  // MENTAL
  { id: "TWO_STEP_INSTRUCTIONS", pillar: "MENTAL", name: "2-step instructions", stage: "ORANGE" },
  { id: "TASK_FOCUS_AFTER_FAULT", pillar: "MENTAL", name: "Task focus after fault", stage: "ORANGE" },
  { id: "APPLY_CUE_SAME_DRILL", pillar: "MENTAL", name: "Apply cue in same drill", stage: "ORANGE" },
  { id: "POINT_RESET_ROUTINE", pillar: "MENTAL", name: "Point reset routine", stage: "ORANGE" },
  { id: "TIEBREAK_COMPOSURE", pillar: "MENTAL", name: "Tiebreak composure", stage: "ORANGE" },
  { id: "SELF_FAULT_RECOGNITION", pillar: "MENTAL", name: "Self fault recognition", stage: "ORANGE" },
  { id: "SELF_REGULATION", pillar: "MENTAL", name: "Self-regulation under pressure", stage: "ORANGE" },
  { id: "COMEBACK_BEHAVIOR", pillar: "MENTAL", name: "Comeback from behind", stage: "ORANGE" },
  { id: "MATCH_GOAL_SETTING", pillar: "MENTAL", name: "Pre-match goal setting", stage: "ORANGE" },
  
  // SOCIAL
  { id: "SCORE_RESPECT", pillar: "SOCIAL", name: "Respect score & turn", stage: "ORANGE" },
  { id: "NEW_PARTNER_COOP", pillar: "SOCIAL", name: "New partner cooperation", stage: "ORANGE" },
  { id: "SCORE_CONFLICT_RESOLUTION", pillar: "SOCIAL", name: "Score conflict resolution", stage: "ORANGE" },
  { id: "DRILL_LEADERSHIP", pillar: "SOCIAL", name: "Drill leadership", stage: "ORANGE" },
  { id: "SPORTSMANSHIP_OR", pillar: "SOCIAL", name: "Sportsmanship advanced", stage: "ORANGE" },
  { id: "ROLE_MODEL", pillar: "SOCIAL", name: "Role model behavior", stage: "ORANGE" },
  
  // MATCH
  { id: "MATCH_2_EVENTS", pillar: "MATCH", name: "2 match events", stage: "ORANGE" },
  { id: "MATCH_5_EVENTS", pillar: "MATCH", name: "5 match events", stage: "ORANGE" },
  { id: "MATCH_1_WIN", pillar: "MATCH", name: "1 match win", stage: "ORANGE" },
  { id: "MATCH_8_EVENTS", pillar: "MATCH", name: "8 match events", stage: "ORANGE" },
  { id: "MATCH_3_WINS", pillar: "MATCH", name: "3 match wins", stage: "ORANGE" },
  { id: "DOUBLES_MATCH", pillar: "MATCH", name: "Doubles match", stage: "ORANGE" },
  
  // ========== GREEN STAGE SKILLS ==========
  // TECHNIQUE
  { id: "FULL_COURT_RALLY_8", pillar: "TECHNIQUE", name: "Full court rally 8+", stage: "GREEN" },
  { id: "DEPTH_CONTROL_6_10", pillar: "TECHNIQUE", name: "Depth control 6/10", stage: "GREEN" },
  { id: "SERVE_FULL_6_10", pillar: "TECHNIQUE", name: "Serve 6/10 full baseline", stage: "GREEN" },
  { id: "SECOND_SERVE_CONCEPT", pillar: "TECHNIQUE", name: "Second serve concept", stage: "GREEN" },
  { id: "RETURN_6_10", pillar: "TECHNIQUE", name: "Return 6/10", stage: "GREEN" },
  { id: "VOLLEY_INTRO_GR", pillar: "TECHNIQUE", name: "Volley intro", stage: "GREEN" },
  { id: "FULL_COURT_RALLY_12", pillar: "TECHNIQUE", name: "Full court rally 12+", stage: "GREEN" },
  { id: "DEPTH_7_10", pillar: "TECHNIQUE", name: "Depth 7/10", stage: "GREEN" },
  { id: "SERVE_7_10", pillar: "TECHNIQUE", name: "Serve 7/10", stage: "GREEN" },
  { id: "SECOND_SERVE_6_10", pillar: "TECHNIQUE", name: "Second serve 6/10", stage: "GREEN" },
  { id: "RETURN_7_10_DEEP", pillar: "TECHNIQUE", name: "Return 7/10 + deep", stage: "GREEN" },
  { id: "VOLLEYS_7_10", pillar: "TECHNIQUE", name: "Volleys 7/10", stage: "GREEN" },
  { id: "OVERHEAD_5_10", pillar: "TECHNIQUE", name: "Overhead 5/10", stage: "GREEN" },
  { id: "FULL_COURT_RALLY_18", pillar: "TECHNIQUE", name: "Full court rally 18+", stage: "GREEN" },
  { id: "DEPTH_8_10", pillar: "TECHNIQUE", name: "Depth 8/10", stage: "GREEN" },
  { id: "SERVE_8_10_TARGETS", pillar: "TECHNIQUE", name: "Serve 8/10 + targets", stage: "GREEN" },
  { id: "SECOND_SERVE_7_10_PRESSURE", pillar: "TECHNIQUE", name: "Second serve 7/10 under pressure", stage: "GREEN" },
  { id: "RETURN_8_10_DIRECTION", pillar: "TECHNIQUE", name: "Return 8/10 + direction", stage: "GREEN" },
  { id: "VOLLEYS_8_10_TRANSITION", pillar: "TECHNIQUE", name: "Volleys 8/10 + transition", stage: "GREEN" },
  { id: "OVERHEAD_7_10", pillar: "TECHNIQUE", name: "Overhead 7/10", stage: "GREEN" },
  { id: "VARIATION_INTRO", pillar: "TECHNIQUE", name: "Variation intro (slice/drop)", stage: "GREEN" },
  
  // TACTICAL
  { id: "RECOVERY_NEUTRAL", pillar: "TACTICAL", name: "Recovery to neutral zone", stage: "GREEN" },
  { id: "CROSSCOURT_DEFAULT", pillar: "TACTICAL", name: "Cross-court as default", stage: "GREEN" },
  { id: "SHORT_BALL_APPROACH_GR", pillar: "TACTICAL", name: "Short ball approach", stage: "GREEN" },
  { id: "PATTERN_CROSS_CHANGE", pillar: "TACTICAL", name: "Pattern: cross->change", stage: "GREEN" },
  { id: "MOMENTUM_RECOGNITION", pillar: "TACTICAL", name: "Momentum recognition", stage: "GREEN" },
  { id: "IN_MATCH_ADJUSTMENT", pillar: "TACTICAL", name: "In-match adjustment", stage: "GREEN" },
  { id: "GAMEPLAN_VISIBLE", pillar: "TACTICAL", name: "Gameplan visible", stage: "GREEN" },
  { id: "SERVE_PLUS_ONE_GR", pillar: "TACTICAL", name: "Serve +1 pattern", stage: "GREEN" },
  { id: "THREE_PHASE_POINT", pillar: "TACTICAL", name: "Defense->neutral->attack", stage: "GREEN" },
  { id: "RISK_MANAGEMENT", pillar: "TACTICAL", name: "Risk management big points", stage: "GREEN" },
  
  // PHYSICAL
  { id: "SPLIT_STEP_70_GR", pillar: "PHYSICAL", name: "Split-step 70%", stage: "GREEN" },
  { id: "WIDE_BALL_RECOVER", pillar: "PHYSICAL", name: "Wide ball + recover", stage: "GREEN" },
  { id: "SESSION_60_FOCUS", pillar: "PHYSICAL", name: "60 min session focus", stage: "GREEN" },
  { id: "NET_TRANSITION", pillar: "PHYSICAL", name: "Baseline-to-net transition", stage: "GREEN" },
  { id: "ENDURANCE_90", pillar: "PHYSICAL", name: "Endurance 90 min", stage: "GREEN" },
  { id: "CROSSOVER_RECOVERY", pillar: "PHYSICAL", name: "Crossover step + recovery", stage: "GREEN" },
  { id: "TWO_MATCHES_DAY_GR", pillar: "PHYSICAL", name: "2 matches per day", stage: "GREEN" },
  { id: "EXPLOSIVE_FIRST_STEP_GR", pillar: "PHYSICAL", name: "Explosive first step", stage: "GREEN" },
  { id: "INJURY_HABITS", pillar: "PHYSICAL", name: "Warmup/cooldown habits", stage: "GREEN" },
  
  // MENTAL
  { id: "RESET_ROUTINE_GR", pillar: "MENTAL", name: "Reset routine visible", stage: "GREEN" },
  { id: "THREE_GAMES_COMPOSURE", pillar: "MENTAL", name: "3 games composure", stage: "GREEN" },
  { id: "APPLY_CUE_GR", pillar: "MENTAL", name: "Apply cue in drill", stage: "GREEN" },
  { id: "POINT_ROUTINES", pillar: "MENTAL", name: "Serve/return routines", stage: "GREEN" },
  { id: "TIEBREAK_FOCUS", pillar: "MENTAL", name: "Tiebreak focus", stage: "GREEN" },
  { id: "FOCUS_TARGET", pillar: "MENTAL", name: "Focus target in match", stage: "GREEN" },
  { id: "PRESSURE_PROOF", pillar: "MENTAL", name: "Pressure proof", stage: "GREEN" },
  { id: "CLOSE_SET_MATCH", pillar: "MENTAL", name: "Close set/match", stage: "GREEN" },
  { id: "SELF_COACHING", pillar: "MENTAL", name: "Self-coaching", stage: "GREEN" },
  { id: "CONSISTENT_ATTITUDE", pillar: "MENTAL", name: "Consistent attitude", stage: "GREEN" },
  
  // SOCIAL
  { id: "SELF_SCORE_CALLS", pillar: "SOCIAL", name: "Self score calls", stage: "GREEN" },
  { id: "PARTNER_RESPECT", pillar: "SOCIAL", name: "Partner/opponent respect", stage: "GREEN" },
  { id: "DOUBLES_COMMUNICATION", pillar: "SOCIAL", name: "Doubles communication", stage: "GREEN" },
  { id: "POSITIVE_LEADER", pillar: "SOCIAL", name: "Positive group leader", stage: "GREEN" },
  { id: "ROLE_MODEL_GR", pillar: "SOCIAL", name: "Role model behavior", stage: "GREEN" },
  { id: "HELPS_YOUNGER", pillar: "SOCIAL", name: "Helps younger players", stage: "GREEN" },
  
  // MATCH
  { id: "MATCH_3_FULL_COURT", pillar: "MATCH", name: "3 full court matches", stage: "GREEN" },
  { id: "SELF_OFFICIATING", pillar: "MATCH", name: "Self-officiating", stage: "GREEN" },
  { id: "MATCH_6_EVENTS_GR", pillar: "MATCH", name: "6 match events", stage: "GREEN" },
  { id: "MATCH_2_WINS_GR", pillar: "MATCH", name: "2 match wins", stage: "GREEN" },
  { id: "DOUBLES_MATCH_GR", pillar: "MATCH", name: "Doubles match", stage: "GREEN" },
  { id: "MATCH_10_EVENTS", pillar: "MATCH", name: "10 match events", stage: "GREEN" },
  { id: "MATCH_4_WINS", pillar: "MATCH", name: "4 match wins", stage: "GREEN" },
  { id: "EVENT_PARTICIPATION", pillar: "MATCH", name: "Event/tournament participation", stage: "GREEN" },
  
  // ========== YELLOW STAGE SKILLS ==========
  // TECHNIQUE
  { id: "RALLY_PRESSURE_12_15", pillar: "TECHNIQUE", name: "Rally 12-15 under pressure", stage: "YELLOW" },
  { id: "SERVE_60_PERCENT", pillar: "TECHNIQUE", name: "1st serve 60%", stage: "YELLOW" },
  { id: "SECOND_SERVE_RELIABLE", pillar: "TECHNIQUE", name: "2nd serve reliable", stage: "YELLOW" },
  { id: "RETURN_70_PERCENT", pillar: "TECHNIQUE", name: "Return 70% in", stage: "YELLOW" },
  { id: "GROUNDSTROKES_DIRECTION", pillar: "TECHNIQUE", name: "Groundstrokes direction control", stage: "YELLOW" },
  { id: "TRANSITION_VOLLEY_6_10", pillar: "TECHNIQUE", name: "Transition volley 6/10", stage: "YELLOW" },
  { id: "RALLY_18_PLUS_Y", pillar: "TECHNIQUE", name: "Rally 18+", stage: "YELLOW" },
  { id: "SERVE_65_PERCENT", pillar: "TECHNIQUE", name: "1st serve 65%", stage: "YELLOW" },
  { id: "SECOND_SERVE_SPIN_TARGET", pillar: "TECHNIQUE", name: "2nd serve spin + target", stage: "YELLOW" },
  { id: "RETURN_DIRECTION", pillar: "TECHNIQUE", name: "Return with direction", stage: "YELLOW" },
  { id: "SLICE_OR_DROP_EFFECTIVE", pillar: "TECHNIQUE", name: "Slice/drop effective", stage: "YELLOW" },
  { id: "SERVE_TARGETS_TWB", pillar: "TECHNIQUE", name: "Serve targets (T/wide/body)", stage: "YELLOW" },
  { id: "SECOND_SERVE_PRESSURE_Y", pillar: "TECHNIQUE", name: "2nd serve under pressure", stage: "YELLOW" },
  { id: "RETURN_ATTACK_NEUTRAL", pillar: "TECHNIQUE", name: "Return attack or neutralize", stage: "YELLOW" },
  { id: "DEPTH_HEIGHT_DIRECTION", pillar: "TECHNIQUE", name: "Depth + height + direction", stage: "YELLOW" },
  { id: "FULL_ARSENAL", pillar: "TECHNIQUE", name: "Full arsenal (slice/drop/lob/net)", stage: "YELLOW" },
  
  // TACTICAL
  { id: "HIGH_PERCENTAGE_TENNIS", pillar: "TACTICAL", name: "High percentage tennis", stage: "YELLOW" },
  { id: "SIMPLE_GAMEPLAN", pillar: "TACTICAL", name: "Simple gameplan execution", stage: "YELLOW" },
  { id: "SCORE_CONTEXT_PLAY", pillar: "TACTICAL", name: "Score context play", stage: "YELLOW" },
  { id: "PATTERN_TENNIS", pillar: "TACTICAL", name: "Pattern tennis (serve+1, cross->change)", stage: "YELLOW" },
  { id: "MOMENTUM_SHIFTS", pillar: "TACTICAL", name: "Momentum shift recognition", stage: "YELLOW" },
  { id: "IN_MATCH_ADJUSTMENT_Y", pillar: "TACTICAL", name: "In-match adjustment", stage: "YELLOW" },
  { id: "MATCH_IQ", pillar: "TACTICAL", name: "Match IQ (when to take risks)", stage: "YELLOW" },
  { id: "SCORE_CONTEXT_ADVANCED", pillar: "TACTICAL", name: "Advanced score context", stage: "YELLOW" },
  { id: "OWN_STYLE_KNOWN", pillar: "TACTICAL", name: "Own playing style known", stage: "YELLOW" },
  
  // PHYSICAL
  { id: "NINETY_MIN_MATCH", pillar: "PHYSICAL", name: "90 min match capacity", stage: "YELLOW" },
  { id: "SPLIT_STEP_DEFAULT", pillar: "PHYSICAL", name: "Split-step default", stage: "YELLOW" },
  { id: "NO_PHYSICAL_DROP_SET2", pillar: "PHYSICAL", name: "No drop in set 2", stage: "YELLOW" },
  { id: "TWO_MATCHES_DAY_Y", pillar: "PHYSICAL", name: "2 matches per day", stage: "YELLOW" },
  { id: "EXPLOSIVE_FIRST_STEP_Y", pillar: "PHYSICAL", name: "Explosive first step", stage: "YELLOW" },
  { id: "WARMUP_HABITS", pillar: "PHYSICAL", name: "Good warmup habits", stage: "YELLOW" },
  { id: "TOURNAMENT_READY", pillar: "PHYSICAL", name: "Tournament ready (multiple days)", stage: "YELLOW" },
  { id: "LOAD_MANAGEMENT", pillar: "PHYSICAL", name: "Injury-aware load management", stage: "YELLOW" },
  
  // MENTAL
  { id: "POINT_RESET_Y", pillar: "MENTAL", name: "Point reset routine", stage: "YELLOW" },
  { id: "NO_EMOTIONAL_SPIRAL", pillar: "MENTAL", name: "No emotional spirals", stage: "YELLOW" },
  { id: "BETWEEN_SETS_APPLY", pillar: "MENTAL", name: "Apply instruction between sets", stage: "YELLOW" },
  { id: "TIEBREAK_COMPOSURE_Y", pillar: "MENTAL", name: "Tiebreak composure", stage: "YELLOW" },
  { id: "SELF_FAULT_NAMING", pillar: "MENTAL", name: "Self fault naming", stage: "YELLOW" },
  { id: "POST_MATCH_REFLECTION", pillar: "MENTAL", name: "Post-match reflection", stage: "YELLOW" },
  { id: "PRESSURE_PROOF_Y", pillar: "MENTAL", name: "Pressure proof", stage: "YELLOW" },
  { id: "COMEBACK_ABILITY", pillar: "MENTAL", name: "Comeback ability", stage: "YELLOW" },
  { id: "SELF_COACHING_Y", pillar: "MENTAL", name: "Self-coaching on court", stage: "YELLOW" },
  { id: "CONSISTENT_ATTITUDE_Y", pillar: "MENTAL", name: "Consistent attitude (no tantrums)", stage: "YELLOW" },
  
  // SOCIAL
  { id: "LINE_CALLS_CORRECT", pillar: "SOCIAL", name: "Correct line calls", stage: "YELLOW" },
  { id: "RESPECT_FAULTS_LOSS", pillar: "SOCIAL", name: "Respect at faults & loss", stage: "YELLOW" },
  { id: "ROLE_MODEL_Y", pillar: "SOCIAL", name: "Role model behavior", stage: "YELLOW" },
  { id: "TEAM_DOUBLES_CORRECT", pillar: "SOCIAL", name: "Team/doubles correct behavior", stage: "YELLOW" },
  { id: "RESPECT_OFFICIALS", pillar: "SOCIAL", name: "Respect officials & opponents", stage: "YELLOW" },
  { id: "LEADER_EXAMPLE", pillar: "SOCIAL", name: "Leader / example", stage: "YELLOW" },
  
  // MATCH
  { id: "MATCH_6_OFFICIAL", pillar: "MATCH", name: "6 official matches", stage: "YELLOW" },
  { id: "SELF_OFFICIATING_Y", pillar: "MATCH", name: "Self-officiating", stage: "YELLOW" },
  { id: "MATCH_2_WINS_Y", pillar: "MATCH", name: "2 wins or competitive losses", stage: "YELLOW" },
  { id: "MATCH_12_EVENTS", pillar: "MATCH", name: "12 match events", stage: "YELLOW" },
  { id: "MATCH_5_WINS", pillar: "MATCH", name: "5 match wins", stage: "YELLOW" },
  { id: "EVENT_PARTICIPATION_Y", pillar: "MATCH", name: "Ladder/league/tournament", stage: "YELLOW" },
  { id: "MATCH_20_EVENTS", pillar: "MATCH", name: "20 match events", stage: "YELLOW" },
  { id: "MATCH_10_WINS", pillar: "MATCH", name: "10 match wins", stage: "YELLOW" },
  { id: "MULTI_EVENT", pillar: "MATCH", name: "Multiple events completed", stage: "YELLOW" }
];

// =============================================================================
// RUBRICS - Observable criteria for 0/1/2 scoring
// =============================================================================
export const SKILL_RUBRICS_SEED = [
  // RED TECHNIQUE
  {
    skillId: "FH_CONTACT",
    scale: [
      { score: 0, observable: "<4/10 in play, inconsistent grip/contact" },
      { score: 1, observable: "4–7/10 in play, needs reminders" },
      { score: 2, observable: "8/10 in play, stable contact + ready grip" }
    ]
  },
  {
    skillId: "BH_CONTACT",
    scale: [
      { score: 0, observable: "<3/10 in play, no consistent form" },
      { score: 1, observable: "3–5/10 in play, recognizable grip" },
      { score: 2, observable: "6/10 in play, stable contact" }
    ]
  },
  {
    skillId: "RALLY_COOP",
    scale: [
      { score: 0, observable: "Cannot sustain 3-ball rally" },
      { score: 1, observable: "Can do 3–5 with resets" },
      { score: 2, observable: "6+ rally, 2 times in session" }
    ]
  },
  {
    skillId: "SERVE_INTRO",
    scale: [
      { score: 0, observable: "No throw-to-hit concept visible" },
      { score: 1, observable: "Throw-to-hit concept emerging, <3/10 in" },
      { score: 2, observable: "5/10 serves in service box (mid-court)" }
    ]
  },
  {
    skillId: "SERVE_OVERHAND",
    scale: [
      { score: 0, observable: "<3/10 from red baseline" },
      { score: 1, observable: "3–5/10 from red baseline" },
      { score: 2, observable: "6/10 overhand serves from red baseline" }
    ]
  },
  {
    skillId: "VOLLEY_TAP",
    scale: [
      { score: 0, observable: "<3/10 volleys controlled" },
      { score: 1, observable: "3–5/10 volleys over net" },
      { score: 2, observable: "6/10 stable volleys" }
    ]
  },
  
  // RED MENTAL
  {
    skillId: "FOLLOW_INSTRUCTIONS",
    scale: [
      { score: 0, observable: "Follows <50% of instructions" },
      { score: 1, observable: "Follows 50–70% with reminders" },
      { score: 2, observable: "Follows 80%+ consistently" }
    ]
  },
  {
    skillId: "COACHABILITY",
    scale: [
      { score: 0, observable: "Does not respond to cues" },
      { score: 1, observable: "Responds with repeated cues" },
      { score: 2, observable: "Applies cue directly after 1 reminder" }
    ]
  },
  {
    skillId: "RESET_ROUTINE_RED",
    scale: [
      { score: 0, observable: "Stops/cry/anger after mistakes" },
      { score: 1, observable: "Recovers with coach help" },
      { score: 2, observable: "Self-reset within 5 seconds consistently" }
    ]
  },
  
  // RED SOCIAL
  {
    skillId: "TURN_TAKING",
    scale: [
      { score: 0, observable: "Cannot wait for turn, interrupts" },
      { score: 1, observable: "Waits with reminders" },
      { score: 2, observable: "Takes turns naturally + high five" }
    ]
  },
  {
    skillId: "SPORTSMANSHIP_RED",
    scale: [
      { score: 0, observable: "No sportsmanship visible" },
      { score: 1, observable: "High-five/handshake with prompt" },
      { score: 2, observable: "Natural sportsmanship + encourages others" }
    ]
  },
  
  // ORANGE TECHNIQUE
  {
    skillId: "BASELINE_RALLY_OR",
    scale: [
      { score: 0, observable: "<4 balls in rally" },
      { score: 1, observable: "4–7 balls in rally" },
      { score: 2, observable: "8+ balls rally (min 2x)" }
    ]
  },
  {
    skillId: "RALLY_12_PLUS",
    scale: [
      { score: 0, observable: "<8 balls in rally" },
      { score: 1, observable: "8–11 balls" },
      { score: 2, observable: "12+ balls (min 2x)" }
    ]
  },
  {
    skillId: "SERVE_FULL_MOTION",
    scale: [
      { score: 0, observable: "<3/10 in from 3/4 baseline" },
      { score: 1, observable: "3–4/10 in" },
      { score: 2, observable: "5/10+ in" }
    ]
  },
  
  // GREEN TECHNIQUE
  {
    skillId: "FULL_COURT_RALLY_8",
    scale: [
      { score: 0, observable: "<5 balls full court" },
      { score: 1, observable: "5–7 balls" },
      { score: 2, observable: "8+ balls (min 2x)" }
    ]
  },
  {
    skillId: "FULL_COURT_RALLY_12",
    scale: [
      { score: 0, observable: "<8 balls full court" },
      { score: 1, observable: "8–11 balls" },
      { score: 2, observable: "12+ balls (min 2x)" }
    ]
  },
  {
    skillId: "FULL_COURT_RALLY_18",
    scale: [
      { score: 0, observable: "<12 balls" },
      { score: 1, observable: "12–17 balls" },
      { score: 2, observable: "18+ balls (min 1x)" }
    ]
  },
  {
    skillId: "DEPTH_CONTROL_6_10",
    scale: [
      { score: 0, observable: "<4/10 past service line" },
      { score: 1, observable: "4–5/10 past service line" },
      { score: 2, observable: "6/10+ past service line" }
    ]
  },
  
  // GREEN MENTAL
  {
    skillId: "PRESSURE_PROOF",
    scale: [
      { score: 0, observable: "Chokes on big points consistently" },
      { score: 1, observable: "Sometimes handles pressure" },
      { score: 2, observable: "Plays big points with focus" }
    ]
  },
  {
    skillId: "SELF_COACHING",
    scale: [
      { score: 0, observable: "Cannot identify solutions" },
      { score: 1, observable: "Identifies problem, needs help with solution" },
      { score: 2, observable: "Identifies and applies own solution" }
    ]
  },
  
  // YELLOW TECHNIQUE
  {
    skillId: "RALLY_PRESSURE_12_15",
    scale: [
      { score: 0, observable: "<8 balls under pressure" },
      { score: 1, observable: "8–11 balls under pressure" },
      { score: 2, observable: "12–15+ balls under pressure" }
    ]
  },
  {
    skillId: "SERVE_60_PERCENT",
    scale: [
      { score: 0, observable: "<50% 1st serve" },
      { score: 1, observable: "50–59% 1st serve" },
      { score: 2, observable: "60%+ 1st serve" }
    ]
  },
  
  // YELLOW MENTAL
  {
    skillId: "MATCH_IQ",
    scale: [
      { score: 0, observable: "Takes wrong risks, no adaptation" },
      { score: 1, observable: "Knows when to risk, inconsistent execution" },
      { score: 2, observable: "Smart risk-taking, adapts during match" }
    ]
  }
];

// =============================================================================
// TRIAL TESTS - Standardized gates per level
// =============================================================================
export const TRIAL_TESTS_SEED = [
  // RED STAGE
  { id: "RED3_CONTACT_GATE", levelId: "RED_3", type: "COACH_OBSERVED", name: "Contact Gate", description: "10 feeds FH/BH mixed", metrics: { inPlayMin: 14, attempts: 20 }, passThreshold: 0.7 },
  { id: "RED3_BEHAVIOR_GATE", levelId: "RED_3", type: "COACH_OBSERVED", name: "Behavior Gate", description: "10 min games - no quit, follows rules", metrics: { noQuit: true, followsRules: true }, passThreshold: 1.0 },
  { id: "RED3_FUN_MATCH", levelId: "RED_3", type: "MATCH_LOG", name: "Fun Match", description: "1 mini match to 7", metrics: { minEvents: 1, format: "MINI_POINTS_7" }, passThreshold: 1.0 },
  
  { id: "RED2_RALLY_GATE", levelId: "RED_2", type: "COACH_OBSERVED", name: "Rally Gate", description: "10 min rally station - min 3 rallies of 6+", metrics: { minRallies: 3, rallyLen: 6 }, passThreshold: 1.0 },
  { id: "RED2_SERVE_GATE", levelId: "RED_2", type: "COACH_OBSERVED", name: "Serve Gate", description: "10 serves - min 5 in mid-court box", metrics: { servesInMin: 5, attempts: 10, zone: "MIDCOURT_BOX" }, passThreshold: 0.5 },
  { id: "RED2_MATCH_GATE", levelId: "RED_2", type: "MATCH_LOG", name: "Match Gate", description: "3 match events with effort flags", metrics: { minEvents: 3, effortFlagsMin: 2 }, passThreshold: 1.0 },
  
  { id: "RED1_SERVE_RETURN_GATE", levelId: "RED_1", type: "COACH_OBSERVED", name: "Serve/Return Gate", description: "10 serves + 10 returns - min 12/20 in play", metrics: { inPlayMin: 12, attempts: 20 }, passThreshold: 0.6 },
  { id: "RED1_RALLY_GATE", levelId: "RED_1", type: "COACH_OBSERVED", name: "Rally Gate", description: "2 rallies of 10+", metrics: { minRallies: 2, rallyLen: 10 }, passThreshold: 1.0 },
  { id: "RED_GRAD_MATCH", levelId: "RED_1", type: "MATCH_LOG", name: "Graduate Match", description: "1 full scored match (best of 3 short sets or race to 21)", metrics: { minEvents: 1, format: "RACE_21_OR_SHORT_SETS" }, passThreshold: 1.0 },
  
  // ORANGE STAGE
  { id: "OR3_RALLY_GATE", levelId: "ORANGE_3", type: "COACH_OBSERVED", name: "Rally Gate", description: "2 rallies of 6+", metrics: { minRallies: 2, rallyLen: 6 }, passThreshold: 1.0 },
  { id: "OR3_SERVE_GATE", levelId: "ORANGE_3", type: "COACH_OBSERVED", name: "Serve Gate", description: "5/10 serves in", metrics: { servesInMin: 5, attempts: 10 }, passThreshold: 0.5 },
  { id: "OR3_MATCH_LOG", levelId: "ORANGE_3", type: "MATCH_LOG", name: "Match Log", description: "2 match events", metrics: { minEvents: 2 }, passThreshold: 1.0 },
  
  { id: "OR2_RALLY_GATE", levelId: "ORANGE_2", type: "COACH_OBSERVED", name: "Rally Gate", description: "2 rallies of 10+", metrics: { minRallies: 2, rallyLen: 10 }, passThreshold: 1.0 },
  { id: "OR2_SERVE_RETURN_GATE", levelId: "ORANGE_2", type: "COACH_OBSERVED", name: "Serve/Return Gate", description: "12/20 in play", metrics: { inPlayMin: 12, attempts: 20 }, passThreshold: 0.6 },
  { id: "OR2_MATCH_GATE", levelId: "ORANGE_2", type: "MATCH_LOG", name: "Match Gate", description: "5 matches + effort flag", metrics: { minEvents: 5, effortFlagsMin: 1 }, passThreshold: 1.0 },
  
  { id: "OR1_FULL_GATE", levelId: "ORANGE_1", type: "COACH_OBSERVED", name: "Full Gate", description: "15/20 serve+return in play", metrics: { inPlayMin: 15, attempts: 20 }, passThreshold: 0.75 },
  { id: "OR1_RALLY_GATE", levelId: "ORANGE_1", type: "COACH_OBSERVED", name: "Rally Gate", description: "1 rally of 15+", metrics: { minRallies: 1, rallyLen: 15 }, passThreshold: 1.0 },
  { id: "OR_GRAD_MATCH", levelId: "ORANGE_1", type: "MATCH_LOG", name: "Graduate Match", description: "Full scored match", metrics: { minEvents: 1, format: "FULL_MATCH" }, passThreshold: 1.0 },
  
  // GREEN STAGE
  { id: "G3_RALLY_GATE", levelId: "GREEN_3", type: "COACH_OBSERVED", name: "Rally Gate", description: "2 rallies of 8+", metrics: { minRallies: 2, rallyLen: 8 }, passThreshold: 1.0 },
  { id: "G3_DEPTH_GATE", levelId: "GREEN_3", type: "COACH_OBSERVED", name: "Depth Gate", description: "6/10 past service line", metrics: { inPlayMin: 6, attempts: 10 }, passThreshold: 0.6 },
  { id: "G3_SERVE_GATE", levelId: "GREEN_3", type: "COACH_OBSERVED", name: "Serve Gate", description: "6/10 first serve + 5 safe seconds", metrics: { firstServeMin: 6, secondServeMin: 5, attempts: 10 }, passThreshold: 0.6 },
  { id: "G3_MATCH_LOG", levelId: "GREEN_3", type: "MATCH_LOG", name: "Match Log", description: "3 matches", metrics: { minEvents: 3 }, passThreshold: 1.0 },
  
  { id: "G2_RALLY_GATE", levelId: "GREEN_2", type: "COACH_OBSERVED", name: "Rally Gate", description: "2 rallies of 12+", metrics: { minRallies: 2, rallyLen: 12 }, passThreshold: 1.0 },
  { id: "G2_SERVE_RETURN_GATE", levelId: "GREEN_2", type: "COACH_OBSERVED", name: "Serve/Return Gate", description: "14/20 in play + 3 deep returns", metrics: { inPlayMin: 14, attempts: 20, deepReturnsMin: 3 }, passThreshold: 0.7 },
  { id: "G2_SECOND_SERVE_GATE", levelId: "GREEN_2", type: "COACH_OBSERVED", name: "Second Serve Gate", description: "6/10 second serves in", metrics: { servesInMin: 6, attempts: 10 }, passThreshold: 0.6 },
  { id: "G2_MATCH_GATE", levelId: "GREEN_2", type: "MATCH_LOG", name: "Match Gate", description: "6 matches + 2 wins", metrics: { minEvents: 6, winsMin: 2 }, passThreshold: 1.0 },
  
  { id: "G1_SERVE_TEST", levelId: "GREEN_1", type: "COACH_OBSERVED", name: "Serve Test", description: "15 serves: 10 in (incl 5 seconds)", metrics: { firstServeMin: 10, secondServeMin: 5, attempts: 15 }, passThreshold: 0.67 },
  { id: "G1_RETURN_TEST", levelId: "GREEN_1", type: "COACH_OBSERVED", name: "Return Test", description: "20 returns: 16 in + 8 targeted", metrics: { inPlayMin: 16, attempts: 20, targetedMin: 8 }, passThreshold: 0.8 },
  { id: "G1_RALLY_TEST", levelId: "GREEN_1", type: "COACH_OBSERVED", name: "Rally Test", description: "1 rally of 18+", metrics: { minRallies: 1, rallyLen: 18 }, passThreshold: 1.0 },
  { id: "G1_MATCH_CERT", levelId: "GREEN_1", type: "MATCH_LOG", name: "Match Certification", description: "1 full match + maturity checklist", metrics: { minEvents: 1, maturityCheck: true }, passThreshold: 1.0 },
  
  // YELLOW STAGE
  { id: "Y3_SERVE_GATE", levelId: "YELLOW_3", type: "COACH_OBSERVED", name: "Serve Gate", description: "20 serves - 12 in", metrics: { servesInMin: 12, attempts: 20 }, passThreshold: 0.6 },
  { id: "Y3_RETURN_GATE", levelId: "YELLOW_3", type: "COACH_OBSERVED", name: "Return Gate", description: "20 returns - 14 in", metrics: { inPlayMin: 14, attempts: 20 }, passThreshold: 0.7 },
  { id: "Y3_MATCH_GATE", levelId: "YELLOW_3", type: "MATCH_LOG", name: "Match Gate", description: "6 matches logged", metrics: { minEvents: 6 }, passThreshold: 1.0 },
  
  { id: "Y2_PRESSURE_SERVE", levelId: "YELLOW_2", type: "COACH_OBSERVED", name: "Pressure Serve", description: "10 serves @ 30-30 - 7 in", metrics: { servesInMin: 7, attempts: 10, pressure: true }, passThreshold: 0.7 },
  { id: "Y2_PATTERN_TEST", levelId: "YELLOW_2", type: "COACH_OBSERVED", name: "Pattern Test", description: "3 successful serve+1 patterns", metrics: { patternsMin: 3 }, passThreshold: 1.0 },
  { id: "Y2_MATCH_GATE", levelId: "YELLOW_2", type: "MATCH_LOG", name: "Match Gate", description: "12 matches + 5 wins", metrics: { minEvents: 12, winsMin: 5 }, passThreshold: 1.0 },
  
  { id: "Y1_MATCH_CERT", levelId: "YELLOW_1", type: "MATCH_LOG", name: "Match Certification", description: "Full match with maturity checklist", metrics: { minEvents: 1, maturityCheck: true }, passThreshold: 1.0 },
  { id: "Y1_SERVE_PRESSURE", levelId: "YELLOW_1", type: "COACH_OBSERVED", name: "Serve Pressure", description: "TB-serve drill - 8/10", metrics: { servesInMin: 8, attempts: 10, pressure: true }, passThreshold: 0.8 },
  { id: "Y1_TACTICAL_REVIEW", levelId: "YELLOW_1", type: "COACH_OBSERVED", name: "Tactical Review", description: "Post-match gameplan feedback", metrics: { tacticalReview: true }, passThreshold: 1.0 }
];

// =============================================================================
// LEVEL SKILL TARGETS - Which skills are required per level
// =============================================================================
export const LEVEL_SKILL_TARGETS_SEED = [
  // RED_3
  { levelId: "RED_3", skillId: "FH_CONTACT", targetScore: 2, weight: 1.0 },
  { levelId: "RED_3", skillId: "BH_CONTACT", targetScore: 1, weight: 1.0 },
  { levelId: "RED_3", skillId: "READY_POSITION", targetScore: 1, weight: 0.6 },
  { levelId: "RED_3", skillId: "ABC_BALANCE", targetScore: 1, weight: 0.8 },
  { levelId: "RED_3", skillId: "FOLLOW_INSTRUCTIONS", targetScore: 1, weight: 1.0 },
  { levelId: "RED_3", skillId: "TURN_TAKING", targetScore: 1, weight: 1.0 },
  { levelId: "RED_3", skillId: "MATCH_PARTICIPATION_RED", targetScore: 1, weight: 1.0 },
  
  // RED_2
  { levelId: "RED_2", skillId: "RALLY_COOP", targetScore: 2, weight: 1.0 },
  { levelId: "RED_2", skillId: "SERVE_INTRO", targetScore: 2, weight: 1.0 },
  { levelId: "RED_2", skillId: "VOLLEY_TAP", targetScore: 1, weight: 0.8 },
  { levelId: "RED_2", skillId: "HOME_SPOT", targetScore: 1, weight: 0.8 },
  { levelId: "RED_2", skillId: "SIDE_SHUFFLE", targetScore: 1, weight: 0.8 },
  { levelId: "RED_2", skillId: "COACHABILITY", targetScore: 1, weight: 1.0 },
  { levelId: "RED_2", skillId: "TEAM_HELP", targetScore: 1, weight: 0.8 },
  { levelId: "RED_2", skillId: "MATCH_PARTICIPATION_RED", targetScore: 2, weight: 1.0 },
  
  // RED_1
  { levelId: "RED_1", skillId: "SERVE_OVERHAND", targetScore: 2, weight: 1.0 },
  { levelId: "RED_1", skillId: "RETURN_INPLAY", targetScore: 2, weight: 1.0 },
  { levelId: "RED_1", skillId: "AIM_OPEN_SPACE", targetScore: 1, weight: 0.8 },
  { levelId: "RED_1", skillId: "SCORE_RULES_MINI", targetScore: 1, weight: 0.8 },
  { levelId: "RED_1", skillId: "COURT_COVER_RED", targetScore: 1, weight: 1.0 },
  { levelId: "RED_1", skillId: "RESET_ROUTINE_RED", targetScore: 2, weight: 1.0 },
  { levelId: "RED_1", skillId: "SPORTSMANSHIP_RED", targetScore: 1, weight: 1.0 },
  { levelId: "RED_1", skillId: "MATCH_WINS_RED", targetScore: 1, weight: 1.0 },
  
  // ORANGE_3
  { levelId: "ORANGE_3", skillId: "BASELINE_RALLY_OR", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_3", skillId: "SERVE_FULL_MOTION", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_3", skillId: "RETURN_BLOCK", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_3", skillId: "VOLLEY_CONTROL_OR", targetScore: 2, weight: 0.8 },
  { levelId: "ORANGE_3", skillId: "CROSSCOURT_INTENT", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_3", skillId: "RECOVERY_CENTER", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_3", skillId: "SPLIT_STEP_60", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_3", skillId: "TWO_STEP_INSTRUCTIONS", targetScore: 1, weight: 1.0 },
  
  // ORANGE_2
  { levelId: "ORANGE_2", skillId: "RALLY_12_PLUS", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "SECOND_SERVE_INTRO", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "BASELINE_PATTERN", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "SHORT_BALL_APPROACH", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "SPLIT_STEP_70", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "POINT_RESET_ROUTINE", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "SCORE_CONFLICT_RESOLUTION", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_2", skillId: "MATCH_5_EVENTS", targetScore: 2, weight: 1.0 },
  
  // ORANGE_1
  { levelId: "ORANGE_1", skillId: "RALLY_15_PLUS", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "SERVE_8_10", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "RETURN_8_10", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "VOLLEYS_STABLE", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "GAMEPLAN_BASIC", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "SERVE_PLUS_ONE", targetScore: 1, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "COURT_COVER_34", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "SELF_REGULATION", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "SPORTSMANSHIP_OR", targetScore: 2, weight: 1.0 },
  { levelId: "ORANGE_1", skillId: "MATCH_8_EVENTS", targetScore: 2, weight: 1.0 },
  
  // GREEN_3
  { levelId: "GREEN_3", skillId: "FULL_COURT_RALLY_8", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "DEPTH_CONTROL_6_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "SERVE_FULL_6_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "SECOND_SERVE_CONCEPT", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "RETURN_6_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "RECOVERY_NEUTRAL", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "SPLIT_STEP_70_GR", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "RESET_ROUTINE_GR", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "SELF_SCORE_CALLS", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_3", skillId: "MATCH_3_FULL_COURT", targetScore: 2, weight: 1.0 },
  
  // GREEN_2
  { levelId: "GREEN_2", skillId: "FULL_COURT_RALLY_12", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "DEPTH_7_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "SERVE_7_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "SECOND_SERVE_6_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "PATTERN_CROSS_CHANGE", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "NET_TRANSITION", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "ENDURANCE_90", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "POINT_ROUTINES", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "DOUBLES_COMMUNICATION", targetScore: 1, weight: 1.0 },
  { levelId: "GREEN_2", skillId: "MATCH_6_EVENTS_GR", targetScore: 2, weight: 1.0 },
  
  // GREEN_1
  { levelId: "GREEN_1", skillId: "FULL_COURT_RALLY_18", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "DEPTH_8_10", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "SERVE_8_10_TARGETS", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "SECOND_SERVE_7_10_PRESSURE", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "GAMEPLAN_VISIBLE", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "THREE_PHASE_POINT", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "TWO_MATCHES_DAY_GR", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "PRESSURE_PROOF", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "SELF_COACHING", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "ROLE_MODEL_GR", targetScore: 2, weight: 1.0 },
  { levelId: "GREEN_1", skillId: "MATCH_10_EVENTS", targetScore: 2, weight: 1.0 },
  
  // YELLOW_3
  { levelId: "YELLOW_3", skillId: "RALLY_PRESSURE_12_15", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "SERVE_60_PERCENT", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "SECOND_SERVE_RELIABLE", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "RETURN_70_PERCENT", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "HIGH_PERCENTAGE_TENNIS", targetScore: 1, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "SIMPLE_GAMEPLAN", targetScore: 1, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "NINETY_MIN_MATCH", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "POINT_RESET_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "LINE_CALLS_CORRECT", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_3", skillId: "MATCH_6_OFFICIAL", targetScore: 2, weight: 1.0 },
  
  // YELLOW_2
  { levelId: "YELLOW_2", skillId: "RALLY_18_PLUS_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "SERVE_65_PERCENT", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "SECOND_SERVE_SPIN_TARGET", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "RETURN_DIRECTION", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "PATTERN_TENNIS", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "IN_MATCH_ADJUSTMENT_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "TWO_MATCHES_DAY_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "COMEBACK_ABILITY", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "POST_MATCH_REFLECTION", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "ROLE_MODEL_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_2", skillId: "MATCH_12_EVENTS", targetScore: 2, weight: 1.0 },
  
  // YELLOW_1
  { levelId: "YELLOW_1", skillId: "SERVE_TARGETS_TWB", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "SECOND_SERVE_PRESSURE_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "RETURN_ATTACK_NEUTRAL", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "DEPTH_HEIGHT_DIRECTION", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "FULL_ARSENAL", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "MATCH_IQ", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "OWN_STYLE_KNOWN", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "TOURNAMENT_READY", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "LOAD_MANAGEMENT", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "PRESSURE_PROOF_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "SELF_COACHING_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "CONSISTENT_ATTITUDE_Y", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "LEADER_EXAMPLE", targetScore: 2, weight: 1.0 },
  { levelId: "YELLOW_1", skillId: "MATCH_20_EVENTS", targetScore: 2, weight: 1.0 }
];

// =============================================================================
// SEED FUNCTION
// =============================================================================
export async function seedGlowLevelingData() {
  console.log("[GlowLevelingSeed] Starting seed...");
  
  try {
    // 1. Seed Ball Levels
    console.log("[GlowLevelingSeed] Seeding ball levels...");
    for (const level of BALL_LEVELS_SEED) {
      await db.insert(ballLevels).values({
        id: level.id,
        stage: level.stage,
        rank: level.rank,
        languageTier: level.languageTier,
        displayNamePlayer: level.displayNamePlayer,
        displayNameCoach: level.displayNameCoach,
        identity: level.identity,
        courtType: level.courtType,
        ballType: level.ballType,
        promotionToLevelId: level.promotionTo,
        promotionRequirements: level.promotionRequirements,
        trialEnabled: level.trialEnabled,
        trialDays: level.trialDays
      }).onConflictDoUpdate({
        target: ballLevels.id,
        set: {
          stage: level.stage,
          rank: level.rank,
          languageTier: level.languageTier,
          displayNamePlayer: level.displayNamePlayer,
          displayNameCoach: level.displayNameCoach,
          identity: level.identity,
          courtType: level.courtType,
          ballType: level.ballType,
          promotionToLevelId: level.promotionTo,
          promotionRequirements: level.promotionRequirements,
          trialEnabled: level.trialEnabled,
          trialDays: level.trialDays
        }
      });
    }
    console.log(`[GlowLevelingSeed] Seeded ${BALL_LEVELS_SEED.length} ball levels`);
    
    // 2. Seed Skills
    console.log("[GlowLevelingSeed] Seeding glow skills...");
    for (const skill of GLOW_SKILLS_SEED) {
      await db.insert(glowSkills).values({
        id: skill.id,
        pillar: skill.pillar,
        name: skill.name,
        stage: skill.stage
      }).onConflictDoUpdate({
        target: glowSkills.id,
        set: {
          pillar: skill.pillar,
          name: skill.name,
          stage: skill.stage
        }
      });
    }
    console.log(`[GlowLevelingSeed] Seeded ${GLOW_SKILLS_SEED.length} skills`);
    
    // 3. Seed Rubrics
    console.log("[GlowLevelingSeed] Seeding skill rubrics...");
    for (const rubric of SKILL_RUBRICS_SEED) {
      for (const scale of rubric.scale) {
        await db.insert(skillRubrics).values({
          skillId: rubric.skillId,
          score: scale.score,
          observable: scale.observable
        }).onConflictDoNothing();
      }
    }
    console.log(`[GlowLevelingSeed] Seeded rubrics for ${SKILL_RUBRICS_SEED.length} skills`);
    
    // 4. Seed Level Tests
    console.log("[GlowLevelingSeed] Seeding level tests...");
    for (const test of TRIAL_TESTS_SEED) {
      await db.insert(levelTests).values({
        id: test.id,
        levelId: test.levelId,
        testType: test.type,
        name: test.name,
        description: test.description,
        metrics: test.metrics
      }).onConflictDoUpdate({
        target: levelTests.id,
        set: {
          levelId: test.levelId,
          testType: test.type,
          name: test.name,
          description: test.description,
          metrics: test.metrics
        }
      });
    }
    console.log(`[GlowLevelingSeed] Seeded ${TRIAL_TESTS_SEED.length} level tests`);
    
    // 5. Seed Level Skills (skill targets per level)
    console.log("[GlowLevelingSeed] Seeding level skills...");
    for (const target of LEVEL_SKILL_TARGETS_SEED) {
      await db.insert(levelSkills).values({
        levelId: target.levelId,
        skillId: target.skillId,
        targetScore: target.targetScore,
        weight: String(target.weight),
        isRequired: true
      }).onConflictDoNothing();
    }
    console.log(`[GlowLevelingSeed] Seeded ${LEVEL_SKILL_TARGETS_SEED.length} level skills`);
    
    console.log("[GlowLevelingSeed] Seed complete!");
    return { success: true };
  } catch (error) {
    console.error("[GlowLevelingSeed] Error:", error);
    throw error;
  }
}
