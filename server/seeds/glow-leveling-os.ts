import { db } from "../db";
import { ballLevels, glowSkills, skillRubrics, levelSkills, levelTests } from "../../shared/schema";

// All skills across all stages
const skills = [
  // RED STAGE - TECHNIQUE
  { id: "FH_CONTACT", pillar: "TECHNIQUE", name: "Forehand contact", stage: "RED", description: "Basic forehand contact on fed balls" },
  { id: "BH_CONTACT", pillar: "TECHNIQUE", name: "Backhand contact", stage: "RED", description: "Basic backhand contact on fed balls" },
  { id: "READY_POSITION", pillar: "TECHNIQUE", name: "Ready position habit", stage: "RED", description: "Racket ready at start of drill" },
  { id: "RALLY_COOP", pillar: "TECHNIQUE", name: "Cooperative rally", stage: "RED", description: "Sustained rally with coach/peer" },
  { id: "SERVE_INTRO", pillar: "TECHNIQUE", name: "Serve intro (throw-to-hit)", stage: "RED", description: "Overhand throw-to-hit concept" },
  { id: "SERVE_OVERHAND", pillar: "TECHNIQUE", name: "Overhand serve (baseline red)", stage: "RED", description: "Serve from red baseline" },
  { id: "VOLLEY_TAP", pillar: "TECHNIQUE", name: "Volley tap control", stage: "RED", description: "Simple volleys over net" },
  { id: "OVERHEAD_EXPOSURE", pillar: "TECHNIQUE", name: "Overhead exposure", stage: "RED", description: "Basic overhead attempts" },
  
  // RED STAGE - TACTICAL
  { id: "OVER_NET_INTENT", pillar: "TACTICAL", name: "Over the net intent", stage: "RED", description: "Chooses safe return over net" },
  { id: "HOME_SPOT", pillar: "TACTICAL", name: "Recover to home spot", stage: "RED", description: "Returns to base position" },
  { id: "AIM_OPEN_SPACE", pillar: "TACTICAL", name: "Aim to open space", stage: "RED", description: "Hits away from opponent" },
  { id: "RETURN_INPLAY", pillar: "TACTICAL", name: "Return in play", stage: "RED", description: "Returns serve in play" },
  { id: "SCORE_RULES_MINI", pillar: "TACTICAL", name: "Mini scoring & rules", stage: "RED", description: "Understands mini format rules" },
  
  // RED STAGE - PHYSICAL
  { id: "ABC_BALANCE", pillar: "PHYSICAL", name: "Balance / stop-start", stage: "RED", description: "Basic ABC movement" },
  { id: "CATCH_THROW", pillar: "PHYSICAL", name: "Catch & throw target", stage: "RED", description: "Hand-eye coordination" },
  { id: "SIDE_SHUFFLE", pillar: "PHYSICAL", name: "Side shuffle (mini court)", stage: "RED", description: "Lateral movement without crossing feet" },
  { id: "SPLIT_STEP_INTRO", pillar: "PHYSICAL", name: "Split-step introduction", stage: "RED", description: "Ready bounce on feeds" },
  { id: "COURT_COVER_RED", pillar: "PHYSICAL", name: "Cover full red court", stage: "RED", description: "Covers wide balls and recovers" },
  { id: "ENDURANCE_RED", pillar: "PHYSICAL", name: "Session endurance (45-60min)", stage: "RED", description: "Stays engaged full session" },
  
  // RED STAGE - MENTAL
  { id: "FOLLOW_INSTRUCTIONS", pillar: "MENTAL", name: "Follows instructions", stage: "RED", description: "Follows 1-step instructions 80%" },
  { id: "NO_MELTDOWN", pillar: "MENTAL", name: "No meltdown in games", stage: "RED", description: "Stays in game without rage/stopping" },
  { id: "COACHABILITY", pillar: "MENTAL", name: "Coachability", stage: "RED", description: "Responds to correction within session" },
  { id: "RESET_ROUTINE", pillar: "MENTAL", name: "Reset after mistake", stage: "RED", description: "Self-reset within 5 seconds" },
  { id: "PRESSURE_FOCUS", pillar: "MENTAL", name: "Pressure focus", stage: "RED", description: "Plays tie-break with focus" },
  
  // RED STAGE - SOCIAL
  { id: "TURN_TAKING", pillar: "SOCIAL", name: "Turn taking", stage: "RED", description: "Waits for turn + high five" },
  { id: "GROUP_DISCIPLINE", pillar: "SOCIAL", name: "Group discipline", stage: "RED", description: "Respects coach says go" },
  { id: "SPORTSMANSHIP", pillar: "SOCIAL", name: "Sportsmanship", stage: "RED", description: "Fair calls + handshake" },
  { id: "TEAM_HELP", pillar: "SOCIAL", name: "Helps teammates", stage: "RED", description: "Helps others in group" },
  { id: "GROUP_INTEGRATION", pillar: "SOCIAL", name: "Group integration", stage: "RED", description: "Joins new groups smoothly" },
  
  // RED STAGE - MATCH
  { id: "MATCH_PARTICIPATION", pillar: "MATCH", name: "Match participation", stage: "RED", description: "Completes fun match events" },
  { id: "MATCH_EVENTS_LOGGED", pillar: "MATCH", name: "Match events logged", stage: "RED", description: "Multiple matches played" },
  { id: "MATCH_WINS", pillar: "MATCH", name: "Match wins / dominance", stage: "RED", description: "Wins or shows stable superiority" },
  
  // ORANGE STAGE - TECHNIQUE
  { id: "FULL_SWING_BASELINE", pillar: "TECHNIQUE", name: "Full swing baseline rally", stage: "ORANGE", description: "Baseline rally on 3/4 court" },
  { id: "DEPTH_CONTROL", pillar: "TACTICAL", name: "Depth control", stage: "ORANGE", description: "Hits past service line consistently" },
  { id: "SERVE_ORANGE", pillar: "TECHNIQUE", name: "Serve (orange baseline)", stage: "ORANGE", description: "Serve from orange baseline" },
  { id: "SECOND_SERVE", pillar: "TECHNIQUE", name: "Second serve routine", stage: "ORANGE", description: "Safe second serve" },
  { id: "RETURN_ORANGE", pillar: "TACTICAL", name: "Return in play (orange)", stage: "ORANGE", description: "Returns serve consistently" },
  { id: "TRANSITION_APPROACH", pillar: "TACTICAL", name: "Short ball transition", stage: "ORANGE", description: "Recognizes short ball, moves forward" },
  { id: "DIRECTION_CHOICE", pillar: "TACTICAL", name: "Direction choice", stage: "ORANGE", description: "Chooses cross vs DTL deliberately" },
  { id: "OVERHEAD_FINISH", pillar: "TECHNIQUE", name: "Overhead finish", stage: "ORANGE", description: "Finishes overhead on easy lobs" },
  { id: "NET_APPROACH_VOLLEY", pillar: "TECHNIQUE", name: "Approach + volley", stage: "ORANGE", description: "Approach shot and volley finish" },
  { id: "PATTERNS_BASIC", pillar: "TACTICAL", name: "Basic patterns", stage: "ORANGE", description: "Serve+1, cross to open" },
  
  // ORANGE STAGE - PHYSICAL
  { id: "COURT_COVER_ORANGE", pillar: "PHYSICAL", name: "3/4 court coverage", stage: "ORANGE", description: "Covers larger court" },
  { id: "SPLIT_STEP_HABIT", pillar: "PHYSICAL", name: "Split-step habit", stage: "ORANGE", description: "Automatic split-step" },
  { id: "ENDURANCE_ORANGE", pillar: "PHYSICAL", name: "Session endurance (60-90min)", stage: "ORANGE", description: "Longer focus sessions" },
  { id: "SPEED_AGILITY", pillar: "PHYSICAL", name: "Speed and agility", stage: "ORANGE", description: "Improved court speed" },
  
  // ORANGE STAGE - MENTAL
  { id: "COMPOSURE_SWINGS", pillar: "MENTAL", name: "Composure at score swings", stage: "ORANGE", description: "Handles score pressure" },
  { id: "SELF_SCORING", pillar: "MENTAL", name: "Independent scoring", stage: "ORANGE", description: "Keeps score without help" },
  { id: "COMPETITIVE_MATURITY", pillar: "MENTAL", name: "Competitive maturity", stage: "ORANGE", description: "Mature in competition" },
  
  // ORANGE STAGE - SOCIAL
  { id: "DOUBLES_BASICS", pillar: "SOCIAL", name: "Doubles positioning basics", stage: "ORANGE", description: "Understands doubles positions" },
  { id: "MATCH_ETIQUETTE", pillar: "SOCIAL", name: "Match etiquette", stage: "ORANGE", description: "Proper match behavior" },
  { id: "LEADERSHIP_GROUP", pillar: "SOCIAL", name: "Leadership in group", stage: "ORANGE", description: "Takes leadership role" },
  
  // ORANGE STAGE - MATCH
  { id: "MATCH_VOLUME_ORANGE", pillar: "MATCH", name: "Match volume (8+)", stage: "ORANGE", description: "8+ matches played" },
  { id: "MATCH_WINS_ORANGE", pillar: "MATCH", name: "Match wins (3+)", stage: "ORANGE", description: "At least 3 wins" },
  { id: "PERFORMANCE_THRESHOLD", pillar: "MATCH", name: "Performance threshold", stage: "ORANGE", description: "Meets performance threshold" },
  
  // GREEN STAGE - TECHNIQUE
  { id: "RALLY_FULL_COURT", pillar: "TECHNIQUE", name: "Rally full court (15+)", stage: "GREEN", description: "15+ ball rally full court" },
  { id: "RALLY_20_PLUS", pillar: "TECHNIQUE", name: "Rally 20+ balls", stage: "GREEN", description: "20+ ball sustained rally" },
  { id: "SERVE_GREEN", pillar: "TECHNIQUE", name: "Serve baseline (green)", stage: "GREEN", description: "Full court baseline serve" },
  { id: "SERVE_ADVANTAGE", pillar: "TECHNIQUE", name: "First serve advantage", stage: "GREEN", description: "First serve gives advantage" },
  { id: "COMPLETE_TOOLKIT", pillar: "TECHNIQUE", name: "Complete toolkit", stage: "GREEN", description: "Topspin/slice/drop + overhead/volleys" },
  
  // GREEN STAGE - TACTICAL
  { id: "CROSSCOURT_STABILITY", pillar: "TACTICAL", name: "Crosscourt stability", stage: "GREEN", description: "Stable crosscourt patterns" },
  { id: "PATTERNS_ADVANCED", pillar: "TACTICAL", name: "Advanced patterns", stage: "GREEN", description: "Serve+1, cross then DTL" },
  { id: "GAMEPLAN", pillar: "TACTICAL", name: "Gameplan execution", stage: "GREEN", description: "Has and follows gameplan" },
  { id: "TEMPO_CHANGES", pillar: "TACTICAL", name: "Tempo changes", stage: "GREEN", description: "Varies pace strategically" },
  
  // GREEN STAGE - PHYSICAL
  { id: "FULL_COURT_COVER", pillar: "PHYSICAL", name: "Full court coverage", stage: "GREEN", description: "Covers full court consistently" },
  { id: "AGILITY_BENCHMARKS", pillar: "PHYSICAL", name: "Agility benchmarks", stage: "GREEN", description: "Meets agility standards" },
  { id: "TOURNAMENT_READY", pillar: "PHYSICAL", name: "Tournament ready (2 matches/day)", stage: "GREEN", description: "Can play 2 matches per day" },
  
  // GREEN STAGE - MENTAL
  { id: "DISCIPLINE_NO_PROMPTS", pillar: "MENTAL", name: "Discipline without prompts", stage: "GREEN", description: "Self-disciplined in training" },
  { id: "PRESSURE_MOMENTS", pillar: "MENTAL", name: "Pressure moment handling", stage: "GREEN", description: "Performs in pressure moments" },
  { id: "RESILIENCE", pillar: "MENTAL", name: "Resilience", stage: "GREEN", description: "Bounces back from adversity" },
  { id: "SELF_MANAGEMENT", pillar: "MENTAL", name: "Self-management", stage: "GREEN", description: "Manages own behavior" },
  
  // GREEN STAGE - SOCIAL
  { id: "RESPECT_FAIRNESS", pillar: "SOCIAL", name: "Respect and fairness", stage: "GREEN", description: "Always respectful and fair" },
  { id: "TEAM_CONTRIBUTION", pillar: "SOCIAL", name: "Team/doubles contribution", stage: "GREEN", description: "Contributes to team" },
  { id: "LEADERSHIP_ALWAYS", pillar: "SOCIAL", name: "Leadership always", stage: "GREEN", description: "Consistent leadership" },
  { id: "SPORTSMANSHIP_ALWAYS", pillar: "SOCIAL", name: "Good sportsmanship always", stage: "GREEN", description: "Exemplary sportsmanship" },
  
  // GREEN STAGE - MATCH
  { id: "MATCH_VOLUME_GREEN", pillar: "MATCH", name: "Match volume (5+)", stage: "GREEN", description: "5+ matches at green level" },
  { id: "MATCH_WINS_GREEN", pillar: "MATCH", name: "Match wins (3+)", stage: "GREEN", description: "3+ wins at green level" },
  { id: "TOURNAMENT_RESULTS", pillar: "MATCH", name: "Tournament performance", stage: "GREEN", description: "Proven tournament results" },
  
  // YELLOW STAGE (simplified for now)
  { id: "COMPLETE_TECHNIQUE", pillar: "TECHNIQUE", name: "Complete technique", stage: "YELLOW", description: "All strokes tournament-ready" },
  { id: "STRATEGIC_PLAY", pillar: "TACTICAL", name: "Strategic play", stage: "YELLOW", description: "High-level tactical awareness" },
  { id: "COMPETITION_FITNESS", pillar: "PHYSICAL", name: "Competition fitness", stage: "YELLOW", description: "High training load capacity" },
  { id: "MENTAL_TOUGHNESS", pillar: "MENTAL", name: "Mental toughness", stage: "YELLOW", description: "Elite mental skills" },
  { id: "LEADERSHIP_MENTOR", pillar: "SOCIAL", name: "Leadership & mentoring", stage: "YELLOW", description: "Leads and mentors others" },
  { id: "COMPETITIVE_TRACK", pillar: "MATCH", name: "Competitive track record", stage: "YELLOW", description: "Proven competitive results" },
];

// Rubrics for key skills
const rubrics = [
  // FH_CONTACT
  { skillId: "FH_CONTACT", score: 0, observable: "Less than 4/10 in play, inconsistent grip/contact" },
  { skillId: "FH_CONTACT", score: 1, observable: "4-7/10 in play, needs reminders on grip" },
  { skillId: "FH_CONTACT", score: 2, observable: "8/10 in play, stable contact + ready grip" },
  
  // BH_CONTACT
  { skillId: "BH_CONTACT", score: 0, observable: "Less than 3/10 in play, poor contact point" },
  { skillId: "BH_CONTACT", score: 1, observable: "3-5/10 in play, improving contact" },
  { skillId: "BH_CONTACT", score: 2, observable: "6/10 in play, consistent contact" },
  
  // RALLY_COOP
  { skillId: "RALLY_COOP", score: 0, observable: "Cannot sustain 3-ball rally" },
  { skillId: "RALLY_COOP", score: 1, observable: "Can do 3-5 balls with resets" },
  { skillId: "RALLY_COOP", score: 2, observable: "6+ ball rally, 2 times in session" },
  
  // SERVE_INTRO
  { skillId: "SERVE_INTRO", score: 0, observable: "Cannot execute throw-to-hit motion" },
  { skillId: "SERVE_INTRO", score: 1, observable: "Motion emerging, 2-4/10 in box" },
  { skillId: "SERVE_INTRO", score: 2, observable: "5/10 in service box from mid-court" },
  
  // SERVE_OVERHAND
  { skillId: "SERVE_OVERHAND", score: 0, observable: "Less than 3/10 in from baseline" },
  { skillId: "SERVE_OVERHAND", score: 1, observable: "3-5/10 in, inconsistent toss" },
  { skillId: "SERVE_OVERHAND", score: 2, observable: "6/10 in from red baseline, consistent motion" },
  
  // RESET_ROUTINE
  { skillId: "RESET_ROUTINE", score: 0, observable: "Stops/cries/anger after mistakes" },
  { skillId: "RESET_ROUTINE", score: 1, observable: "Recovers with coach help" },
  { skillId: "RESET_ROUTINE", score: 2, observable: "Self-reset within 5 seconds consistently" },
  
  // COACHABILITY
  { skillId: "COACHABILITY", score: 0, observable: "Ignores corrections, argues" },
  { skillId: "COACHABILITY", score: 1, observable: "Tries correction after multiple prompts" },
  { skillId: "COACHABILITY", score: 2, observable: "Immediately tries correction, min 2x per session" },
  
  // FOLLOW_INSTRUCTIONS
  { skillId: "FOLLOW_INSTRUCTIONS", score: 0, observable: "Follows less than 50% of instructions" },
  { skillId: "FOLLOW_INSTRUCTIONS", score: 1, observable: "Follows 50-79% of instructions" },
  { skillId: "FOLLOW_INSTRUCTIONS", score: 2, observable: "Follows 80%+ of 1-step instructions" },
  
  // TURN_TAKING
  { skillId: "TURN_TAKING", score: 0, observable: "Cuts in line, doesn't wait" },
  { skillId: "TURN_TAKING", score: 1, observable: "Waits with reminders" },
  { skillId: "TURN_TAKING", score: 2, observable: "Waits turn + high five consistently" },
  
  // SPORTSMANSHIP
  { skillId: "SPORTSMANSHIP", score: 0, observable: "Refuses handshake, disputes calls angrily" },
  { skillId: "SPORTSMANSHIP", score: 1, observable: "Basic handshake, occasional disputes" },
  { skillId: "SPORTSMANSHIP", score: 2, observable: "Fair calls + handshake/high five always" },
  
  // MATCH_PARTICIPATION
  { skillId: "MATCH_PARTICIPATION", score: 0, observable: "Refuses to play matches" },
  { skillId: "MATCH_PARTICIPATION", score: 1, observable: "Plays with encouragement needed" },
  { skillId: "MATCH_PARTICIPATION", score: 2, observable: "Eager to play, completes fun matches" },
  
  // HOME_SPOT
  { skillId: "HOME_SPOT", score: 0, observable: "Stays where ball landed" },
  { skillId: "HOME_SPOT", score: 1, observable: "Returns with verbal cue" },
  { skillId: "HOME_SPOT", score: 2, observable: "Auto-recovers to center without reminder 70%" },
  
  // SPLIT_STEP_INTRO
  { skillId: "SPLIT_STEP_INTRO", score: 0, observable: "No ready bounce visible" },
  { skillId: "SPLIT_STEP_INTRO", score: 1, observable: "Ready bounce on 40-59% of feeds" },
  { skillId: "SPLIT_STEP_INTRO", score: 2, observable: "Ready bounce on 60%+ of feeds" },
  
  // ABC_BALANCE
  { skillId: "ABC_BALANCE", score: 0, observable: "Falls after swings, poor stop-start" },
  { skillId: "ABC_BALANCE", score: 1, observable: "Occasional balance loss" },
  { skillId: "ABC_BALANCE", score: 2, observable: "Stable balance, clean stop-start" },
  
  // VOLLEY_TAP
  { skillId: "VOLLEY_TAP", score: 0, observable: "Less than 3/10 volleys over net" },
  { skillId: "VOLLEY_TAP", score: 1, observable: "3-5/10 volleys over net" },
  { skillId: "VOLLEY_TAP", score: 2, observable: "6/10 volleys over net from service line" },
];

// Level definitions
const levels = [
  // RED STAGE
  {
    id: "RED_3",
    stage: "RED",
    rank: 3,
    languageTier: "RED",
    displayNamePlayer: "Red 3",
    displayNameCoach: "Red 3 (Starter)",
    identity: "Ik kan de bal raken en samen spelen.",
    courtType: "mini court (36')",
    ballType: "Red foam / 75% low compression",
    matchFormat: "Mini points to 7 (underhand serve allowed)",
    socialGoals: ["HIGH_FIVE", "TURN_TAKING"],
    rewardBadge: "Red Starter Unlocked",
    rewardUnlock: "Sticker progress bar + new emote",
    promotionToLevelId: "RED_2",
    promotionRequirements: {
      skillAchievedCount: 6,
      pillarMinimum: { TECHNIQUE: 1, MENTAL: 1, SOCIAL: 1 },
      matchMinEvents: 1,
      matchType: "FUN_MATCH",
      evidenceMinItems: 1
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
    identity: "Ik kan kort rally'en en begin te serveren.",
    courtType: "mini court (36')",
    ballType: "Red foam / 75% low compression",
    matchFormat: "Mini set: first to 11 (switch at 6)",
    socialGoals: ["TEAMMATE_BOOST", "QUEUE_RULES"],
    rewardBadge: "Red Builder",
    rewardUnlock: "Clan-ready (appears in squads)",
    promotionToLevelId: "RED_1",
    promotionRequirements: {
      skillAchievedCount: 10,
      pillarMinimum: { TECHNIQUE: 1, PHYSICAL: 1, MENTAL: 1, SOCIAL: 1 },
      matchMinEvents: 3,
      matchType: "MATCH_LOG",
      evidenceMinItems: 2
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
    identity: "Ik kan echte punten spelen, serveren en ben klaar voor Orange.",
    courtType: "mini court (36')",
    ballType: "Red low compression",
    matchFormat: "Best of 3 short sets to 4 (TB 3-3) or race to 21",
    socialGoals: ["CAPTAIN_MOMENT", "MATCHMAKING_UNLOCKED"],
    rewardBadge: "Red Graduate 🏅",
    rewardUnlock: "Orange UI language + Orange templates + new cosmetics",
    promotionToLevelId: "ORANGE_3",
    promotionRequirements: {
      skillAchievedCount: 14,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 1, PHYSICAL: 1, MENTAL: 2, SOCIAL: 1, MATCH: 1 },
      matchMinEvents: 6,
      matchType: "SCORED_MATCH",
      evidenceMinItems: 3
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
    displayNameCoach: "Orange 3 (Entry)",
    identity: "Ik kan rally'en op een groter veld met volle slagen.",
    courtType: "3/4 court (60')",
    ballType: "Orange ball",
    matchFormat: "Set to 4 games",
    socialGoals: ["TRAINING_PARTNER_FEEDBACK", "TEAM_GAMES"],
    rewardBadge: "Orange Entry",
    rewardUnlock: "Tennis terminology unlocked",
    promotionToLevelId: "ORANGE_2",
    promotionRequirements: {
      skillAchievedCount: 8,
      pillarMinimum: { TECHNIQUE: 1, TACTICAL: 1, PHYSICAL: 1, MENTAL: 1 },
      matchMinEvents: 4,
      matchType: "SET_TO_4",
      evidenceMinItems: 2
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
    displayNameCoach: "Orange 2 (Intermediate)",
    identity: "Ik kan langere rally's spelen met richting en mijn serve is betrouwbaarder.",
    courtType: "3/4 court (60')",
    ballType: "Orange ball",
    matchFormat: "Short sets with tiebreak",
    socialGoals: ["DOUBLES_AWARENESS", "ENCOURAGEMENT"],
    rewardBadge: "Orange Builder",
    rewardUnlock: "Pattern play unlocked",
    promotionToLevelId: "ORANGE_1",
    promotionRequirements: {
      skillAchievedCount: 12,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 1, PHYSICAL: 1, MENTAL: 1, SOCIAL: 1 },
      matchMinEvents: 8,
      matchType: "MATCH_LOG",
      evidenceMinItems: 3
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
    displayNameCoach: "Orange 1 (Advanced)",
    identity: "Ik beheers het 3/4 veld en ben klaar voor full court.",
    courtType: "3/4 court (60')",
    ballType: "Orange ball",
    matchFormat: "Regular set format",
    socialGoals: ["LEADERSHIP", "MATCH_ETIQUETTE"],
    rewardBadge: "Orange Graduate 🏅",
    rewardUnlock: "Green court access + advanced stats",
    promotionToLevelId: "GREEN_3",
    promotionRequirements: {
      skillAchievedCount: 15,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, PHYSICAL: 1, MENTAL: 1, SOCIAL: 1, MATCH: 1 },
      matchMinEvents: 12,
      matchType: "PERFORMANCE_THRESHOLD",
      evidenceMinItems: 4
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
    displayNameCoach: "Green 3 (Entry Full Court)",
    identity: "Ik speel op het volledige veld met groene bal.",
    courtType: "Full court",
    ballType: "Green ball",
    matchFormat: "Regular sets",
    socialGoals: ["RESPECT_FAIRNESS", "SELF_DISCIPLINE"],
    rewardBadge: "Green Entry",
    rewardUnlock: "Percentages visible + full stats",
    promotionToLevelId: "GREEN_2",
    promotionRequirements: {
      skillAchievedCount: 10,
      pillarMinimum: { TECHNIQUE: 1, TACTICAL: 1, PHYSICAL: 1, MENTAL: 1, SOCIAL: 1 },
      matchMinEvents: 5,
      matchType: "MATCH_LOG",
      evidenceMinItems: 2
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
    displayNameCoach: "Green 2 (Strong)",
    identity: "Ik beheers patronen en kan wedstrijden winnen.",
    courtType: "Full court",
    ballType: "Green ball",
    matchFormat: "Best of 3 sets",
    socialGoals: ["TEAM_CONTRIBUTION", "DOUBLES_PLAY"],
    rewardBadge: "Green Builder",
    rewardUnlock: "Tournament ready indicator",
    promotionToLevelId: "GREEN_1",
    promotionRequirements: {
      skillAchievedCount: 14,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 1, PHYSICAL: 1, MENTAL: 1, SOCIAL: 1 },
      matchMinEvents: 8,
      matchType: "MATCH_LOG",
      evidenceMinItems: 3
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
    displayNameCoach: "Green 1 (Graduate)",
    identity: "Ik ben klaar voor gele bal competitie.",
    courtType: "Full court",
    ballType: "Green ball",
    matchFormat: "Tournament format",
    socialGoals: ["LEADERSHIP_ALWAYS", "SPORTSMANSHIP_ALWAYS"],
    rewardBadge: "Green Graduate 🏅",
    rewardUnlock: "Yellow ball access + competitive profile",
    promotionToLevelId: "YELLOW_3",
    promotionRequirements: {
      skillAchievedCount: 18,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, PHYSICAL: 2, MENTAL: 2, SOCIAL: 1, MATCH: 2 },
      matchMinEvents: 10,
      matchType: "TOURNAMENT_RESULTS",
      evidenceMinItems: 5
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
    displayNameCoach: "Yellow 3 (Club Competitor)",
    identity: "Ik speel competitief met gele bal.",
    courtType: "Full court",
    ballType: "Yellow ball",
    matchFormat: "Full tournament format",
    socialGoals: ["COMPETITION_ETIQUETTE"],
    rewardBadge: "Yellow Entry",
    rewardUnlock: "Rankings visible + Glow Rank",
    promotionToLevelId: "YELLOW_2",
    promotionRequirements: {
      skillAchievedCount: 12,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, PHYSICAL: 2, MENTAL: 2, SOCIAL: 1, MATCH: 1 },
      matchMinEvents: 8,
      matchType: "COMPETITION",
      evidenceMinItems: 3
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
    displayNameCoach: "Yellow 2 (Regional Competitor)",
    identity: "Ik presteer op regionaal niveau.",
    courtType: "Full court",
    ballType: "Yellow ball",
    matchFormat: "Tournament + ranking events",
    socialGoals: ["MENTORING"],
    rewardBadge: "Yellow Builder",
    rewardUnlock: "Advanced analytics + match analysis",
    promotionToLevelId: "YELLOW_1",
    promotionRequirements: {
      skillAchievedCount: 15,
      pillarMinimum: { TECHNIQUE: 2, TACTICAL: 2, PHYSICAL: 2, MENTAL: 2, SOCIAL: 2, MATCH: 2 },
      matchMinEvents: 15,
      matchType: "REGIONAL_RESULTS",
      evidenceMinItems: 5
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
    displayNameCoach: "Yellow 1 (Performance Track)",
    identity: "Ik train op nationaal competitieniveau.",
    courtType: "Full court",
    ballType: "Yellow ball",
    matchFormat: "National/international events",
    socialGoals: ["AMBASSADOR", "LEADER"],
    rewardBadge: "Yellow Master 🏆",
    rewardUnlock: "Performance program access",
    promotionToLevelId: null,
    promotionRequirements: null,
    trialEnabled: false,
    trialDays: 0
  },
];

// Tests per level
const tests = [
  // RED_3 tests
  { id: "RED3_CONTACT_GATE", levelId: "RED_3", name: "Contact Gate", testType: "COACH_OBSERVED", 
    description: "10 feeds FH/BH mixed - min 14/20 in play",
    metrics: { inPlayMin: 14, attempts: 20 } },
  { id: "RED3_BEHAVIOR_GATE", levelId: "RED_3", name: "Behavior Gate", testType: "COACH_OBSERVED",
    description: "10 min games - no quit, follows rules",
    metrics: { noQuit: true, followsRules: true } },
  { id: "RED3_FUN_MATCH", levelId: "RED_3", name: "Fun Match", testType: "MATCH_LOG",
    description: "Complete 1 mini match to 7",
    metrics: { minEvents: 1, format: "MINI_POINTS_7" } },
  
  // RED_2 tests
  { id: "RED2_RALLY_GATE", levelId: "RED_2", name: "Rally Gate", testType: "COACH_OBSERVED",
    description: "10 min rally station - min 3 rallies of 6+",
    metrics: { minRallies: 3, rallyLen: 6 } },
  { id: "RED2_SERVE_GATE", levelId: "RED_2", name: "Serve Gate", testType: "COACH_OBSERVED",
    description: "10 serves - min 5 in box (mid-court)",
    metrics: { servesInMin: 5, attempts: 10, zone: "MIDCOURT_BOX" } },
  { id: "RED2_MATCH_GATE", levelId: "RED_2", name: "Match Gate", testType: "MATCH_LOG",
    description: "3 match events logged with effort flags",
    metrics: { minEvents: 3, effortFlagsMin: 2 } },
  
  // RED_1 tests
  { id: "RED1_SERVE_RETURN_GATE", levelId: "RED_1", name: "Serve/Return Gate", testType: "COACH_OBSERVED",
    description: "10 serves + 10 returns - min 12/20 in play",
    metrics: { inPlayMin: 12, attempts: 20 } },
  { id: "RED1_RALLY_GATE", levelId: "RED_1", name: "Rally Gate", testType: "COACH_OBSERVED",
    description: "2 rallies of 10+ balls",
    metrics: { minRallies: 2, rallyLen: 10 } },
  { id: "RED_GRAD_MATCH", levelId: "RED_1", name: "Graduation Match", testType: "MATCH_LOG",
    description: "1 scored match (best of 3 short sets or race to 21)",
    metrics: { minEvents: 1, format: "RACE_21_OR_SHORT_SETS" } },
  
  // ORANGE_3 tests
  { id: "ORANGE3_RALLY_GATE", levelId: "ORANGE_3", name: "Rally Gate", testType: "COACH_OBSERVED",
    description: "Baseline rally 12+ balls on 3/4 court",
    metrics: { minRallies: 2, rallyLen: 12 } },
  { id: "ORANGE3_SERVE_GATE", levelId: "ORANGE_3", name: "Serve Gate", testType: "COACH_OBSERVED",
    description: "6/10 serves in from orange baseline",
    metrics: { servesInMin: 6, attempts: 10 } },
  
  // ORANGE_2 tests
  { id: "ORANGE2_CONSISTENCY_GATE", levelId: "ORANGE_2", name: "Consistency Gate", testType: "COACH_OBSERVED",
    description: "Rally 12+ with direction control",
    metrics: { minRallies: 3, rallyLen: 12 } },
  { id: "ORANGE2_SERVE_GATE", levelId: "ORANGE_2", name: "Serve Gate", testType: "COACH_OBSERVED",
    description: "7/10 serves in + second serve",
    metrics: { servesInMin: 7, attempts: 10 } },
  
  // ORANGE_1 tests
  { id: "ORANGE1_DEPTH_GATE", levelId: "ORANGE_1", name: "Depth Gate", testType: "COACH_OBSERVED",
    description: "8/10 balls past service line both wings",
    metrics: { inPlayMin: 8, attempts: 10 } },
  { id: "ORANGE1_PATTERN_GATE", levelId: "ORANGE_1", name: "Pattern Gate", testType: "COACH_OBSERVED",
    description: "Execute 2-3 shot combo with intent",
    metrics: { minRallies: 3, rallyLen: 5 } },
  
  // GREEN tests (simplified)
  { id: "GREEN3_RALLY_GATE", levelId: "GREEN_3", name: "Rally Gate", testType: "COACH_OBSERVED",
    description: "15+ ball rally full court",
    metrics: { minRallies: 2, rallyLen: 15 } },
  { id: "GREEN2_RALLY_GATE", levelId: "GREEN_2", name: "Rally Gate", testType: "COACH_OBSERVED",
    description: "20+ ball sustained rally",
    metrics: { minRallies: 2, rallyLen: 20 } },
  { id: "GREEN1_TOURNAMENT_GATE", levelId: "GREEN_1", name: "Tournament Gate", testType: "MATCH_LOG",
    description: "Tournament performance threshold",
    metrics: { minEvents: 5, format: "TOURNAMENT" } },
];

// Level-skill mappings
const levelSkillMappings: { levelId: string; skillId: string; targetScore: number; weight: string; isRequired: boolean }[] = [
  // RED_3 skills
  { levelId: "RED_3", skillId: "FH_CONTACT", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "RED_3", skillId: "BH_CONTACT", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_3", skillId: "READY_POSITION", targetScore: 1, weight: "0.60", isRequired: false },
  { levelId: "RED_3", skillId: "ABC_BALANCE", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_3", skillId: "FOLLOW_INSTRUCTIONS", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_3", skillId: "TURN_TAKING", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_3", skillId: "MATCH_PARTICIPATION", targetScore: 1, weight: "1.00", isRequired: true },
  
  // RED_2 skills
  { levelId: "RED_2", skillId: "RALLY_COOP", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "RED_2", skillId: "SERVE_INTRO", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "RED_2", skillId: "VOLLEY_TAP", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "RED_2", skillId: "HOME_SPOT", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_2", skillId: "SPLIT_STEP_INTRO", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "RED_2", skillId: "COACHABILITY", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_2", skillId: "TEAM_HELP", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "RED_2", skillId: "MATCH_EVENTS_LOGGED", targetScore: 2, weight: "1.00", isRequired: true },
  
  // RED_1 skills
  { levelId: "RED_1", skillId: "SERVE_OVERHAND", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "RED_1", skillId: "RETURN_INPLAY", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "RED_1", skillId: "AIM_OPEN_SPACE", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "RED_1", skillId: "SCORE_RULES_MINI", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "RED_1", skillId: "COURT_COVER_RED", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_1", skillId: "RESET_ROUTINE", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "RED_1", skillId: "SPORTSMANSHIP", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "RED_1", skillId: "MATCH_WINS", targetScore: 1, weight: "1.00", isRequired: true },
  
  // ORANGE_3 skills
  { levelId: "ORANGE_3", skillId: "FULL_SWING_BASELINE", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_3", skillId: "DEPTH_CONTROL", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_3", skillId: "SERVE_ORANGE", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_3", skillId: "RETURN_ORANGE", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_3", skillId: "SPLIT_STEP_HABIT", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "ORANGE_3", skillId: "ENDURANCE_ORANGE", targetScore: 1, weight: "0.80", isRequired: false },
  
  // ORANGE_2 skills
  { levelId: "ORANGE_2", skillId: "FULL_SWING_BASELINE", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_2", skillId: "SECOND_SERVE", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_2", skillId: "TRANSITION_APPROACH", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_2", skillId: "DIRECTION_CHOICE", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "ORANGE_2", skillId: "PATTERNS_BASIC", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_2", skillId: "COMPOSURE_SWINGS", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "ORANGE_2", skillId: "DOUBLES_BASICS", targetScore: 1, weight: "0.60", isRequired: false },
  
  // ORANGE_1 skills
  { levelId: "ORANGE_1", skillId: "DEPTH_CONTROL", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_1", skillId: "SERVE_ORANGE", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_1", skillId: "SECOND_SERVE", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_1", skillId: "OVERHEAD_FINISH", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "ORANGE_1", skillId: "NET_APPROACH_VOLLEY", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_1", skillId: "SELF_SCORING", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "ORANGE_1", skillId: "COMPETITIVE_MATURITY", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "ORANGE_1", skillId: "LEADERSHIP_GROUP", targetScore: 1, weight: "0.60", isRequired: false },
  { levelId: "ORANGE_1", skillId: "PERFORMANCE_THRESHOLD", targetScore: 1, weight: "1.00", isRequired: true },
  
  // GREEN_3 skills
  { levelId: "GREEN_3", skillId: "RALLY_FULL_COURT", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_3", skillId: "SERVE_GREEN", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_3", skillId: "CROSSCOURT_STABILITY", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_3", skillId: "FULL_COURT_COVER", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "GREEN_3", skillId: "DISCIPLINE_NO_PROMPTS", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "GREEN_3", skillId: "RESPECT_FAIRNESS", targetScore: 1, weight: "1.00", isRequired: true },
  
  // GREEN_2 skills
  { levelId: "GREEN_2", skillId: "RALLY_20_PLUS", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_2", skillId: "DEPTH_CONTROL", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "GREEN_2", skillId: "SERVE_GREEN", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "GREEN_2", skillId: "PATTERNS_ADVANCED", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_2", skillId: "AGILITY_BENCHMARKS", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "GREEN_2", skillId: "PRESSURE_MOMENTS", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_2", skillId: "TEAM_CONTRIBUTION", targetScore: 1, weight: "0.80", isRequired: false },
  
  // GREEN_1 skills
  { levelId: "GREEN_1", skillId: "COMPLETE_TOOLKIT", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "SERVE_ADVANTAGE", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "GAMEPLAN", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "TEMPO_CHANGES", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "GREEN_1", skillId: "TOURNAMENT_READY", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "RESILIENCE", targetScore: 2, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "SELF_MANAGEMENT", targetScore: 1, weight: "0.80", isRequired: false },
  { levelId: "GREEN_1", skillId: "LEADERSHIP_ALWAYS", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "SPORTSMANSHIP_ALWAYS", targetScore: 1, weight: "1.00", isRequired: true },
  { levelId: "GREEN_1", skillId: "TOURNAMENT_RESULTS", targetScore: 2, weight: "1.00", isRequired: true },
];

export async function seedGlowLevelingOS() {
  console.log("[GlowOS] Seeding Glow Leveling OS...");
  
  try {
    // 1. Insert skills first
    console.log("Inserting skills...");
    for (const skill of skills) {
      await db.insert(glowSkills).values(skill).onConflictDoNothing();
    }
    console.log(`Inserted ${skills.length} skills`);
    
    // 2. Insert rubrics
    console.log("Inserting rubrics...");
    for (const rubric of rubrics) {
      await db.insert(skillRubrics).values(rubric).onConflictDoNothing();
    }
    console.log(`Inserted ${rubrics.length} rubrics`);
    
    // 3. Insert levels
    console.log("Inserting levels...");
    for (const level of levels) {
      await db.insert(ballLevels).values(level).onConflictDoNothing();
    }
    console.log(`Inserted ${levels.length} levels`);
    
    // 4. Insert level tests
    console.log("Inserting level tests...");
    for (const test of tests) {
      await db.insert(levelTests).values(test).onConflictDoNothing();
    }
    console.log(`Inserted ${tests.length} tests`);
    
    // 5. Insert level-skill mappings
    console.log("Inserting level-skill mappings...");
    for (const mapping of levelSkillMappings) {
      await db.insert(levelSkills).values(mapping).onConflictDoNothing();
    }
    console.log(`Inserted ${levelSkillMappings.length} level-skill mappings`);
    
    console.log("Glow Leveling OS seeding complete!");
  } catch (error) {
    console.error("Error seeding Glow Leveling OS:", error);
    throw error;
  }
}
