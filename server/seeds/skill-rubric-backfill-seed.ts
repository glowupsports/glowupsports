/**
 * Skill Rubric Backfill Seed
 * 
 * Adds 0/1/2 rubrics for all RED, ORANGE, GREEN, and YELLOW skills
 * currently missing measurable observables.
 * 
 * Sources: USTA Player Development, Tennis Australia, KNLTB
 * Scoring: 0 = Not Yet, 1 = Emerging, 2 = Achieved
 */

import { db } from "../db";
import { skillRubrics } from "../../shared/schema";
import { sql } from "drizzle-orm";

interface RubricEntry {
  skillId: string;
  rubrics: { score: number; observable: string }[];
}

export const SKILL_RUBRIC_BACKFILL: RubricEntry[] = [
  // ========== RED STAGE - MISSING RUBRICS ==========

  // TACTICAL
  { skillId: "AIM_OPEN_SPACE", rubrics: [
    { score: 0, observable: "Hits to opponent or into the net regardless of open space" },
    { score: 1, observable: "Sometimes aims away from opponent but inconsistently" },
    { score: 2, observable: "Consistently directs ball away from opponent to open space" },
  ]},
  { skillId: "OVER_NET_INTENT", rubrics: [
    { score: 0, observable: "Does not attempt to get ball over net; pushes or misses" },
    { score: 1, observable: "Sometimes chooses safer shots to get ball over net" },
    { score: 2, observable: "Consistently prioritises getting ball safely over the net on every shot" },
  ]},
  { skillId: "RETURN_INPLAY", rubrics: [
    { score: 0, observable: "Cannot return serve — ball goes into net or wide" },
    { score: 1, observable: "Returns serve in play occasionally (3 of 8 attempts)" },
    { score: 2, observable: "Returns serve in play consistently (6 of 8+ attempts)" },
  ]},
  { skillId: "SCORE_RULES_MINI", rubrics: [
    { score: 0, observable: "Does not understand mini scoring or game format" },
    { score: 1, observable: "Understands basic scoring with reminders" },
    { score: 2, observable: "Keeps score independently and knows the mini format rules" },
  ]},

  // PHYSICAL
  { skillId: "CATCH_THROW", rubrics: [
    { score: 0, observable: "Cannot catch or throw accurately to target" },
    { score: 1, observable: "Catches and throws to general area but not target consistently" },
    { score: 2, observable: "Catches and throws accurately to a target 6 of 8 attempts" },
  ]},
  { skillId: "COURT_COVER_RED", rubrics: [
    { score: 0, observable: "Does not move to wide balls — lets them pass" },
    { score: 1, observable: "Moves to wide balls but does not recover to centre" },
    { score: 2, observable: "Moves to wide ball and recovers to approximate centre position" },
  ]},
  { skillId: "ENDURANCE_RED", rubrics: [
    { score: 0, observable: "Disengages or loses focus before 30 minutes" },
    { score: 1, observable: "Stays engaged for 30-45 minutes with some fading" },
    { score: 2, observable: "Stays fully engaged for the entire 45-60 minute session" },
  ]},
  { skillId: "READY_POSITION", rubrics: [
    { score: 0, observable: "No ready position at start of drill — racket not raised" },
    { score: 1, observable: "Sometimes in ready position with reminders" },
    { score: 2, observable: "Consistently in ready position at start of every drill or point" },
  ]},
  { skillId: "SIDE_SHUFFLE", rubrics: [
    { score: 0, observable: "Crosses feet or trips when moving laterally on mini court" },
    { score: 1, observable: "Side-shuffles with occasional crossover steps" },
    { score: 2, observable: "Smooth side-shuffle without crossing feet across the mini court" },
  ]},

  // SOCIAL
  { skillId: "GROUP_DISCIPLINE", rubrics: [
    { score: 0, observable: "Does not stop when coach says stop; ignores group cues" },
    { score: 1, observable: "Responds to group cues with 1-2 reminders" },
    { score: 2, observable: "Respects group discipline signals immediately without reminders" },
  ]},
  { skillId: "GROUP_INTEGRATION", rubrics: [
    { score: 0, observable: "Refuses to join new groups or causes conflict" },
    { score: 1, observable: "Joins new groups reluctantly or after prompting" },
    { score: 2, observable: "Joins new groups smoothly and engages positively" },
  ]},
  { skillId: "TEAM_HELP", rubrics: [
    { score: 0, observable: "Does not help teammates; ignores others' difficulties" },
    { score: 1, observable: "Helps teammates occasionally when prompted" },
    { score: 2, observable: "Proactively helps teammates without being asked" },
  ]},

  // MENTAL
  { skillId: "NO_MELTDOWN", rubrics: [
    { score: 0, observable: "Has emotional outbursts (racket abuse, crying, quitting) during games" },
    { score: 1, observable: "Shows frustration but manages to continue with coach support" },
    { score: 2, observable: "Stays in game through mistakes without meltdown behaviours" },
  ]},
  { skillId: "PRESSURE_FOCUS", rubrics: [
    { score: 0, observable: "Gives up or disengages in tiebreak or pressure situations" },
    { score: 1, observable: "Stays present in tiebreaks but shows visible stress" },
    { score: 2, observable: "Maintains focus and effort through tiebreak or pressure moments" },
  ]},

  // MATCH
  { skillId: "MATCH_EVENTS_LOGGED", rubrics: [
    { score: 0, observable: "No match events recorded" },
    { score: 1, observable: "1-2 match events logged" },
    { score: 2, observable: "3+ match events logged in the system" },
  ]},
  { skillId: "MATCH_PARTICIPATION_RED", rubrics: [
    { score: 0, observable: "Has not participated in any match or refuses match play" },
    { score: 1, observable: "Participates in 1 match but struggles with format" },
    { score: 2, observable: "Participates in 2+ matches and understands the match format" },
  ]},
  { skillId: "MATCH_WINS", rubrics: [
    { score: 0, observable: "Has not won any mini matches" },
    { score: 1, observable: "Has won 1 mini match" },
    { score: 2, observable: "Has won 2+ mini matches or shows clear scoring dominance" },
  ]},
  { skillId: "MATCH_WINS_RED", rubrics: [
    { score: 0, observable: "No mini match wins recorded" },
    { score: 1, observable: "1 mini match win recorded" },
    { score: 2, observable: "2+ mini match wins or consistent match performance" },
  ]},

  // TECHNIQUE
  { skillId: "OVERHEAD_EXPOSURE", rubrics: [
    { score: 0, observable: "Refuses or does not attempt overhead motion" },
    { score: 1, observable: "Attempts overhead with limited swing and no footwork" },
    { score: 2, observable: "Attempts overhead with recognisable upward swing from basic position" },
  ]},

  // ========== ORANGE STAGE - MISSING RUBRICS ==========

  // MATCH
  { skillId: "DOUBLES_MATCH", rubrics: [
    { score: 0, observable: "Has not participated in doubles format" },
    { score: 1, observable: "Participated in 1 doubles match" },
    { score: 2, observable: "Participated in 2+ doubles matches with appropriate positioning" },
  ]},
  { skillId: "MATCH_1_WIN", rubrics: [
    { score: 0, observable: "No match wins recorded at orange level" },
    { score: 1, observable: "1 close match win or strong competitive loss" },
    { score: 2, observable: "1+ match wins clearly recorded at orange level" },
  ]},
  { skillId: "MATCH_2_EVENTS", rubrics: [
    { score: 0, observable: "Fewer than 2 match events logged" },
    { score: 1, observable: "2 match events logged" },
    { score: 2, observable: "2+ match events logged with completion" },
  ]},
  { skillId: "MATCH_3_WINS", rubrics: [
    { score: 0, observable: "Fewer than 3 match wins recorded" },
    { score: 1, observable: "1-2 match wins recorded" },
    { score: 2, observable: "3+ match wins recorded at orange level" },
  ]},
  { skillId: "MATCH_5_EVENTS", rubrics: [
    { score: 0, observable: "Fewer than 3 match events" },
    { score: 1, observable: "3-4 match events completed" },
    { score: 2, observable: "5+ match events completed at orange level" },
  ]},
  { skillId: "MATCH_8_EVENTS", rubrics: [
    { score: 0, observable: "Fewer than 5 match events" },
    { score: 1, observable: "5-7 match events completed" },
    { score: 2, observable: "8+ match events completed" },
  ]},
  { skillId: "MATCH_VOLUME_ORANGE", rubrics: [
    { score: 0, observable: "Fewer than 5 matches played" },
    { score: 1, observable: "5-7 matches played" },
    { score: 2, observable: "8+ matches played at orange level" },
  ]},
  { skillId: "MATCH_WINS_ORANGE", rubrics: [
    { score: 0, observable: "No match wins at orange level" },
    { score: 1, observable: "1-2 match wins at orange level" },
    { score: 2, observable: "3+ match wins at orange level" },
  ]},
  { skillId: "PERFORMANCE_THRESHOLD", rubrics: [
    { score: 0, observable: "Does not meet minimum performance threshold for orange level" },
    { score: 1, observable: "Meets some performance criteria but inconsistently" },
    { score: 2, observable: "Consistently meets performance threshold across all key pillars" },
  ]},

  // MENTAL
  { skillId: "APPLY_CUE_SAME_DRILL", rubrics: [
    { score: 0, observable: "Cannot apply a coach cue in the same drill even with reminders" },
    { score: 1, observable: "Applies cue once or twice after reminder in the same drill" },
    { score: 2, observable: "Applies coach cue consistently within the same drill set" },
  ]},
  { skillId: "COMEBACK_BEHAVIOR", rubrics: [
    { score: 0, observable: "Gives up or disengages when losing" },
    { score: 1, observable: "Stays in game when losing but effort drops" },
    { score: 2, observable: "Increases effort and stays composed when coming from behind" },
  ]},
  { skillId: "COMPETITIVE_MATURITY", rubrics: [
    { score: 0, observable: "Behaves immaturely in competition (tantrums, blaming)" },
    { score: 1, observable: "Generally mature but shows immaturity at score changes" },
    { score: 2, observable: "Demonstrates consistent maturity and self-control in competition" },
  ]},
  { skillId: "COMPOSURE_SWINGS", rubrics: [
    { score: 0, observable: "Loses composure at score swings (30-30, deuce)" },
    { score: 1, observable: "Shows some tension at score swings but continues" },
    { score: 2, observable: "Stays calm and composed at all score swings including deuce" },
  ]},
  { skillId: "MATCH_GOAL_SETTING", rubrics: [
    { score: 0, observable: "Does not set or discuss a pre-match goal" },
    { score: 1, observable: "Sets a goal with coach prompting" },
    { score: 2, observable: "Sets own pre-match goal and can reflect on it post-match" },
  ]},
  { skillId: "POINT_RESET_ROUTINE", rubrics: [
    { score: 0, observable: "No reset routine — starts next point immediately after error" },
    { score: 1, observable: "Has partial routine (e.g., walks slowly) but inconsistent" },
    { score: 2, observable: "Demonstrates a visible reset routine between every point" },
  ]},
  { skillId: "SELF_FAULT_RECOGNITION", rubrics: [
    { score: 0, observable: "Cannot identify own errors — blames ball, racket, or opponent" },
    { score: 1, observable: "Identifies own faults with coach prompting" },
    { score: 2, observable: "Independently names own fault after each error" },
  ]},
  { skillId: "SELF_REGULATION", rubrics: [
    { score: 0, observable: "Cannot self-regulate — requires coach intervention to calm down" },
    { score: 1, observable: "Calms down with one verbal cue from coach" },
    { score: 2, observable: "Self-regulates without coach input under competitive pressure" },
  ]},
  { skillId: "SELF_SCORING", rubrics: [
    { score: 0, observable: "Cannot keep score independently" },
    { score: 1, observable: "Keeps score with occasional errors or checks with coach" },
    { score: 2, observable: "Keeps score independently and accurately throughout match" },
  ]},
  { skillId: "TASK_FOCUS_AFTER_FAULT", rubrics: [
    { score: 0, observable: "Loses task focus after fault — dwells or disengages" },
    { score: 1, observable: "Recovers task focus within 2-3 points after a fault" },
    { score: 2, observable: "Returns to task focus immediately on next point after fault" },
  ]},
  { skillId: "TIEBREAK_COMPOSURE", rubrics: [
    { score: 0, observable: "Falls apart physically or mentally in tiebreak situations" },
    { score: 1, observable: "Shows tension in tiebreak but finishes the format" },
    { score: 2, observable: "Maintains composure and executes game plan in tiebreak" },
  ]},
  { skillId: "TWO_STEP_INSTRUCTIONS", rubrics: [
    { score: 0, observable: "Cannot follow a 2-step instruction — forgets second part" },
    { score: 1, observable: "Follows 2-step instruction with one repetition" },
    { score: 2, observable: "Follows 2-step instructions consistently without reminders" },
  ]},

  // PHYSICAL
  { skillId: "COURT_COVER_34", rubrics: [
    { score: 0, observable: "Cannot cover 3/4 court — misses wide balls by large margin" },
    { score: 1, observable: "Covers 3/4 court with effort but poor recovery" },
    { score: 2, observable: "Covers 3/4 court consistently and recovers to base" },
  ]},
  { skillId: "COURT_COVER_ORANGE", rubrics: [
    { score: 0, observable: "Unable to cover the larger orange court" },
    { score: 1, observable: "Covers orange court area with effort but tires quickly" },
    { score: 2, observable: "Consistently covers orange court and recovers to base position" },
  ]},
  { skillId: "DROP_RECOVER", rubrics: [
    { score: 0, observable: "Does not recover after playing a drop shot — stays at net" },
    { score: 1, observable: "Recovers after drop shot but slowly" },
    { score: 2, observable: "Plays drop shot and recovers quickly to ready position" },
  ]},
  { skillId: "ENDURANCE_60", rubrics: [
    { score: 0, observable: "Focus and physical quality drops before 45 minutes" },
    { score: 1, observable: "Maintains quality to 45 min; fades in final 15 min" },
    { score: 2, observable: "Maintains quality and focus for full 60-minute session" },
  ]},
  { skillId: "ENDURANCE_ORANGE", rubrics: [
    { score: 0, observable: "Cannot sustain session longer than 45 minutes at quality" },
    { score: 1, observable: "Sustains 60-75 min sessions with some fading" },
    { score: 2, observable: "Sustains full 60-90 min sessions at consistent quality" },
  ]},
  { skillId: "EXPLOSIVE_FIRST_STEP", rubrics: [
    { score: 0, observable: "No explosive first step — moves flat-footed" },
    { score: 1, observable: "First step is faster than a walk but no explosive push-off" },
    { score: 2, observable: "Clear explosive first step from split-step to ball position" },
  ]},
  { skillId: "LATERAL_MOVEMENT", rubrics: [
    { score: 0, observable: "Lateral movement restricted — turns and runs instead of shuffling" },
    { score: 1, observable: "Lateral movement present but inefficient with some crossover steps" },
    { score: 2, observable: "Efficient lateral movement using split and shuffle across orange court" },
  ]},
  { skillId: "SESSION_FOCUS_45", rubrics: [
    { score: 0, observable: "Focus lost before 30 minutes" },
    { score: 1, observable: "Focus maintained for 30-40 minutes" },
    { score: 2, observable: "Maintains focus for full 45-minute session" },
  ]},
  { skillId: "SPEED_AGILITY", rubrics: [
    { score: 0, observable: "Below-average court speed relative to peer group" },
    { score: 1, observable: "Average court speed with noticeable improvement over baseline" },
    { score: 2, observable: "Above-average court speed and agility relative to peer group" },
  ]},
  { skillId: "SPLIT_STEP_60", rubrics: [
    { score: 0, observable: "Split-step absent or fewer than 30% of rallies" },
    { score: 1, observable: "Split-step present on 40-55% of opportunities" },
    { score: 2, observable: "Split-step present on 60%+ of rally opportunities" },
  ]},
  { skillId: "SPLIT_STEP_70", rubrics: [
    { score: 0, observable: "Split-step present on fewer than 50% of opportunities" },
    { score: 1, observable: "Split-step present on 55-65% of opportunities" },
    { score: 2, observable: "Split-step present on 70%+ of opportunities" },
  ]},
  { skillId: "SPLIT_STEP_HABIT", rubrics: [
    { score: 0, observable: "Split-step requires constant verbal reminders" },
    { score: 1, observable: "Split-step emerging as a habit; occasional reminders needed" },
    { score: 2, observable: "Split-step is automatic — no reminder needed at all" },
  ]},
  { skillId: "TWO_MATCHES_DAY", rubrics: [
    { score: 0, observable: "Cannot physically or mentally complete 2 matches in a day" },
    { score: 1, observable: "Can complete 2 matches but quality drops significantly in match 2" },
    { score: 2, observable: "Completes 2 matches in a day with maintained quality and effort" },
  ]},

  // SOCIAL
  { skillId: "DOUBLES_BASICS", rubrics: [
    { score: 0, observable: "Unaware of doubles positioning — stands on wrong side or middle" },
    { score: 1, observable: "Knows basic positioning with reminders" },
    { score: 2, observable: "Demonstrates correct doubles positioning without reminders" },
  ]},
  { skillId: "DRILL_LEADERSHIP", rubrics: [
    { score: 0, observable: "Does not take leadership in drills — follows passively" },
    { score: 1, observable: "Takes drill leadership role when asked" },
    { score: 2, observable: "Proactively leads drills and keeps group on task" },
  ]},
  { skillId: "LEADERSHIP_GROUP", rubrics: [
    { score: 0, observable: "No leadership contribution to group" },
    { score: 1, observable: "Takes leadership role when assigned" },
    { score: 2, observable: "Consistently leads group positively without being assigned" },
  ]},
  { skillId: "MATCH_ETIQUETTE", rubrics: [
    { score: 0, observable: "Breaks match etiquette (no handshake, ball abuse, bad line calls)" },
    { score: 1, observable: "Shows proper etiquette with reminders" },
    { score: 2, observable: "Demonstrates proper match etiquette consistently without reminders" },
  ]},
  { skillId: "NEW_PARTNER_COOP", rubrics: [
    { score: 0, observable: "Refuses to cooperate with new partner or causes conflict" },
    { score: 1, observable: "Works with new partner but reluctantly or with friction" },
    { score: 2, observable: "Cooperates positively with any new partner immediately" },
  ]},
  { skillId: "ROLE_MODEL", rubrics: [
    { score: 0, observable: "Sets poor example (negative behaviour, disrespect)" },
    { score: 1, observable: "Generally positive but occasionally negative behaviour visible" },
    { score: 2, observable: "Consistently models positive attitude, effort, and respect" },
  ]},
  { skillId: "SCORE_CONFLICT_RESOLUTION", rubrics: [
    { score: 0, observable: "Argues or cannot resolve score disputes" },
    { score: 1, observable: "Resolves score disputes with coach help" },
    { score: 2, observable: "Resolves score disputes calmly and independently (replays point)" },
  ]},
  { skillId: "SCORE_RESPECT", rubrics: [
    { score: 0, observable: "Does not respect score or turn order" },
    { score: 1, observable: "Respects score with reminders" },
    { score: 2, observable: "Respects score and turn order consistently without reminders" },
  ]},
  { skillId: "SPORTSMANSHIP_OR", rubrics: [
    { score: 0, observable: "Poor sportsmanship (blaming, unsportsmanlike behaviour)" },
    { score: 1, observable: "Adequate sportsmanship with occasional lapses" },
    { score: 2, observable: "Consistently demonstrates advanced sportsmanship in all situations" },
  ]},

  // TACTICAL
  { skillId: "BASELINE_PATTERN", rubrics: [
    { score: 0, observable: "No baseline pattern — hits randomly to any direction" },
    { score: 1, observable: "Attempts crosscourt-to-open pattern with coaching cue" },
    { score: 2, observable: "Executes crosscourt-to-open-court pattern independently in practice" },
  ]},
  { skillId: "CROSSCOURT_INTENT", rubrics: [
    { score: 0, observable: "No crosscourt intent — all balls go back to centre" },
    { score: 1, observable: "Attempts crosscourt direction on cue" },
    { score: 2, observable: "Consistently intends and executes crosscourt as default direction" },
  ]},
  { skillId: "DEPTH_CONTROL", rubrics: [
    { score: 0, observable: "Balls land in service box or shorter more than half the time" },
    { score: 1, observable: "Balls land past service line 50-60% of the time" },
    { score: 2, observable: "Consistently hits past service line on 7 of 10 groundstrokes" },
  ]},
  { skillId: "DIRECTION_CHOICE", rubrics: [
    { score: 0, observable: "Direction is based on ball arrival, not deliberate choice" },
    { score: 1, observable: "Occasionally chooses crosscourt vs. down-the-line deliberately" },
    { score: 2, observable: "Consistently selects direction with clear intent before shot" },
  ]},
  { skillId: "GAMEPLAN_BASIC", rubrics: [
    { score: 0, observable: "No gameplan visible — plays point to point without strategy" },
    { score: 1, observable: "Can describe a basic gameplan with prompting" },
    { score: 2, observable: "Executes a basic pre-agreed gameplan independently in match play" },
  ]},
  { skillId: "HEIGHT_VARIATION", rubrics: [
    { score: 0, observable: "All balls hit flat — no height variation" },
    { score: 1, observable: "Attempts height variation on request" },
    { score: 2, observable: "Varies ball height intentionally (flat vs. high margin) during rally" },
  ]},
  { skillId: "PATTERNS_BASIC", rubrics: [
    { score: 0, observable: "Cannot execute serve+1 or crosscourt-to-open pattern" },
    { score: 1, observable: "Executes pattern in structured drill with coach prompting" },
    { score: 2, observable: "Executes serve+1 or crosscourt-to-open pattern in practice match" },
  ]},
  { skillId: "RECOVERY_CENTER", rubrics: [
    { score: 0, observable: "Stays where they hit and does not recover to centre" },
    { score: 1, observable: "Recovers toward centre on some shots" },
    { score: 2, observable: "Recovers to approximate centre position after every shot" },
  ]},
  { skillId: "RETURN_ORANGE", rubrics: [
    { score: 0, observable: "Cannot return serve in play consistently" },
    { score: 1, observable: "Returns serve in play 40-50% of attempts" },
    { score: 2, observable: "Returns serve in play 60%+ of attempts at orange level" },
  ]},
  { skillId: "SERVE_PLUS_ONE", rubrics: [
    { score: 0, observable: "No serve+1 concept — serves and waits" },
    { score: 1, observable: "Attempts follow-up shot after serve with coaching cue" },
    { score: 2, observable: "Executes serve+1 pattern proactively in practice match" },
  ]},
  { skillId: "SHORT_BALL_APPROACH", rubrics: [
    { score: 0, observable: "Does not identify or move to short balls" },
    { score: 1, observable: "Moves to short ball when prompted" },
    { score: 2, observable: "Identifies and approaches short ball independently" },
  ]},
  { skillId: "TRANSITION_APPROACH", rubrics: [
    { score: 0, observable: "Does not recognise short ball as an approach opportunity" },
    { score: 1, observable: "Recognises short ball and moves forward with coaching cue" },
    { score: 2, observable: "Independently recognises short ball and transitions forward to finish" },
  ]},
  { skillId: "WEAKNESS_RECOGNITION", rubrics: [
    { score: 0, observable: "Cannot identify opponent's weakness" },
    { score: 1, observable: "Identifies opponent weakness with coaching help" },
    { score: 2, observable: "Independently identifies and exploits opponent weakness in match" },
  ]},

  // TECHNIQUE
  { skillId: "BH_STABILITY", rubrics: [
    { score: 0, observable: "Backhand is unstable — mishit or push on most balls" },
    { score: 1, observable: "Backhand stable on fed balls but unstable on live rally balls" },
    { score: 2, observable: "Consistent backhand stability in both fed drills and live rallies" },
  ]},
  { skillId: "FULL_SWING_BASELINE", rubrics: [
    { score: 0, observable: "Cannot sustain baseline rally from 3/4 court — errors on most shots" },
    { score: 1, observable: "Sustains rally to 5-7 balls from 3/4 court" },
    { score: 2, observable: "Sustains 10+ ball cooperative rally with full swing from 3/4 court" },
  ]},
  { skillId: "NET_APPROACH_VOLLEY", rubrics: [
    { score: 0, observable: "Cannot execute approach and volley sequence" },
    { score: 1, observable: "Approaches net from short ball but volley technique poor" },
    { score: 2, observable: "Executes approach shot deep and finishes with controlled volley" },
  ]},
  { skillId: "OVERHEAD_6_10", rubrics: [
    { score: 0, observable: "Fewer than 3 of 10 overheads land in court with control" },
    { score: 1, observable: "4-5 of 10 overheads controlled and in court" },
    { score: 2, observable: "6 of 10 overheads controlled and land in court" },
  ]},
  { skillId: "OVERHEAD_FINISH", rubrics: [
    { score: 0, observable: "Does not attempt to finish easy overheads — lets them bounce" },
    { score: 1, observable: "Attempts overhead finish but inconsistent direction" },
    { score: 2, observable: "Finishes easy overheads into open court with control" },
  ]},
  { skillId: "OVERHEAD_OR", rubrics: [
    { score: 0, observable: "No overhead control — ball goes anywhere" },
    { score: 1, observable: "Overhead lands in court but no direction control" },
    { score: 2, observable: "Overhead lands in target zone with directional control" },
  ]},
  { skillId: "RALLY_15_PLUS", rubrics: [
    { score: 0, observable: "Cannot sustain a 10-ball cooperative rally" },
    { score: 1, observable: "Sustains 10-12 ball cooperative rally" },
    { score: 2, observable: "Sustains 15+ ball cooperative rally consistently" },
  ]},
  { skillId: "RETURN_8_10", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 returns in play" },
    { score: 1, observable: "6-7 of 10 returns in play" },
    { score: 2, observable: "8 of 10 returns in play with controlled contact" },
  ]},
  { skillId: "RETURN_BLOCK", rubrics: [
    { score: 0, observable: "Cannot block return — full swing leads to errors on pace" },
    { score: 1, observable: "Block return lands in play but no directional intent" },
    { score: 2, observable: "Block return with compact swing lands consistently in court" },
  ]},
  { skillId: "SECOND_SERVE", rubrics: [
    { score: 0, observable: "Second serve goes in fewer than 3 of 10 times" },
    { score: 1, observable: "Second serve goes in 4-5 of 10 times" },
    { score: 2, observable: "Second serve lands in play consistently (6+ of 10) with safe action" },
  ]},
  { skillId: "SECOND_SERVE_INTRO", rubrics: [
    { score: 0, observable: "No second serve concept — hits same ball as first serve" },
    { score: 1, observable: "Attempts a safer second serve but inconsistent" },
    { score: 2, observable: "Demonstrates clear second serve concept with safer action 5 of 8" },
  ]},
  { skillId: "SERVE_8_10", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 serves land in the box" },
    { score: 1, observable: "6-7 of 10 serves land in the box" },
    { score: 2, observable: "8 of 10 serves land in the correct service box" },
  ]},
  { skillId: "SERVE_ORANGE", rubrics: [
    { score: 0, observable: "Cannot serve consistently from orange baseline — most balls net or wide" },
    { score: 1, observable: "Serves in play 40-50% from orange baseline" },
    { score: 2, observable: "Serves in play 60%+ consistently from full orange baseline" },
  ]},
  { skillId: "VOLLEYS_STABLE", rubrics: [
    { score: 0, observable: "Volleys unstable left and right — mishits or arm-only swings" },
    { score: 1, observable: "Forehand volley stable but backhand volley unstable or vice versa" },
    { score: 2, observable: "Both forehand and backhand volleys stable with punch action" },
  ]},
  { skillId: "VOLLEY_CONTROL_OR", rubrics: [
    { score: 0, observable: "No volley control — ball goes anywhere" },
    { score: 1, observable: "Volley in court but no directional control" },
    { score: 2, observable: "Volley directed to target area with controlled punch" },
  ]},

  // ========== GREEN STAGE - MISSING RUBRICS ==========

  // MATCH
  { skillId: "DOUBLES_MATCH_GR", rubrics: [
    { score: 0, observable: "Has not played doubles at green level" },
    { score: 1, observable: "Played 1 doubles match at green level" },
    { score: 2, observable: "Played 2+ doubles matches at green level with appropriate positioning" },
  ]},
  { skillId: "EVENT_PARTICIPATION", rubrics: [
    { score: 0, observable: "Has not participated in any event or tournament" },
    { score: 1, observable: "Entered 1 event or tournament" },
    { score: 2, observable: "Completed 2+ events or tournaments at green level" },
  ]},
  { skillId: "MATCH_10_EVENTS", rubrics: [
    { score: 0, observable: "Fewer than 6 match events logged" },
    { score: 1, observable: "6-9 match events logged" },
    { score: 2, observable: "10+ match events completed" },
  ]},
  { skillId: "MATCH_2_WINS_GR", rubrics: [
    { score: 0, observable: "No match wins at green level" },
    { score: 1, observable: "1 match win at green level" },
    { score: 2, observable: "2+ match wins at green level" },
  ]},
  { skillId: "MATCH_3_FULL_COURT", rubrics: [
    { score: 0, observable: "No full court matches completed" },
    { score: 1, observable: "1-2 full court matches completed" },
    { score: 2, observable: "3+ full court matches completed at green level" },
  ]},
  { skillId: "MATCH_4_WINS", rubrics: [
    { score: 0, observable: "Fewer than 2 match wins" },
    { score: 1, observable: "2-3 match wins" },
    { score: 2, observable: "4+ match wins at green level" },
  ]},
  { skillId: "MATCH_6_EVENTS_GR", rubrics: [
    { score: 0, observable: "Fewer than 4 match events" },
    { score: 1, observable: "4-5 match events completed" },
    { score: 2, observable: "6+ match events completed at green level" },
  ]},
  { skillId: "MATCH_VOLUME_GREEN", rubrics: [
    { score: 0, observable: "Fewer than 3 matches played at green level" },
    { score: 1, observable: "3-4 matches played at green level" },
    { score: 2, observable: "5+ matches played at green level" },
  ]},
  { skillId: "MATCH_WINS_GREEN", rubrics: [
    { score: 0, observable: "No match wins at green level" },
    { score: 1, observable: "1-2 match wins at green level" },
    { score: 2, observable: "3+ match wins at green level" },
  ]},
  { skillId: "SELF_OFFICIATING", rubrics: [
    { score: 0, observable: "Cannot self-officiate — requires constant coach/umpire intervention" },
    { score: 1, observable: "Self-officiates with occasional errors or disputes" },
    { score: 2, observable: "Self-officiates accurately and resolves disputes fairly" },
  ]},
  { skillId: "TOURNAMENT_RESULTS", rubrics: [
    { score: 0, observable: "No tournament results on record" },
    { score: 1, observable: "Some tournament results but limited or unclear" },
    { score: 2, observable: "Proven tournament results at green level with wins logged" },
  ]},

  // MENTAL
  { skillId: "APPLY_CUE_GR", rubrics: [
    { score: 0, observable: "Cannot apply coach cue in a drill situation" },
    { score: 1, observable: "Applies cue with direct reminder during drill" },
    { score: 2, observable: "Applies coach cue without reminder in drill context" },
  ]},
  { skillId: "CLOSE_SET_MATCH", rubrics: [
    { score: 0, observable: "Loses composure or effort in close sets" },
    { score: 1, observable: "Stays in close set but shows visible strain" },
    { score: 2, observable: "Performs at best level in close sets and matches" },
  ]},
  { skillId: "CONSISTENT_ATTITUDE", rubrics: [
    { score: 0, observable: "Attitude varies significantly session to session" },
    { score: 1, observable: "Mostly positive attitude with occasional lapses" },
    { score: 2, observable: "Consistently positive and professional attitude across all sessions" },
  ]},
  { skillId: "DISCIPLINE_NO_PROMPTS", rubrics: [
    { score: 0, observable: "Requires constant prompts to maintain discipline" },
    { score: 1, observable: "Self-disciplined most of the time; needs occasional reminders" },
    { score: 2, observable: "Fully self-disciplined in all training activities without prompts" },
  ]},
  { skillId: "FOCUS_TARGET", rubrics: [
    { score: 0, observable: "No target focus in match — plays instinctively without aim" },
    { score: 1, observable: "Focuses on target some of the time in match" },
    { score: 2, observable: "Maintains target focus consistently in match play situations" },
  ]},
  { skillId: "POINT_ROUTINES", rubrics: [
    { score: 0, observable: "No serve or return routine — starts point randomly" },
    { score: 1, observable: "Has a routine for serving or returning but not both" },
    { score: 2, observable: "Consistent visible routine for both serve and return of serve" },
  ]},
  { skillId: "PRESSURE_MOMENTS", rubrics: [
    { score: 0, observable: "Performance drops significantly in pressure moments" },
    { score: 1, observable: "Handles pressure moments with some deterioration in quality" },
    { score: 2, observable: "Performs at or above normal level in pressure moments" },
  ]},
  { skillId: "RESET_ROUTINE_GR", rubrics: [
    { score: 0, observable: "No visible reset routine between points" },
    { score: 1, observable: "Partial reset routine visible but inconsistent" },
    { score: 2, observable: "Consistent visible reset routine between every point" },
  ]},
  { skillId: "RESILIENCE", rubrics: [
    { score: 0, observable: "Does not bounce back from adversity — disengages" },
    { score: 1, observable: "Bounces back from adversity with coaching support" },
    { score: 2, observable: "Independently bounces back from any adversity within the same match" },
  ]},
  { skillId: "SELF_MANAGEMENT", rubrics: [
    { score: 0, observable: "Cannot manage own behaviour — requires intervention" },
    { score: 1, observable: "Manages own behaviour with occasional reminders" },
    { score: 2, observable: "Fully manages own behaviour without any external intervention" },
  ]},
  { skillId: "THREE_GAMES_COMPOSURE", rubrics: [
    { score: 0, observable: "Composure breaks within the first 3 games" },
    { score: 1, observable: "Composure mostly held through 3 games with minor lapses" },
    { score: 2, observable: "Full composure maintained for 3+ consecutive games" },
  ]},
  { skillId: "TIEBREAK_FOCUS", rubrics: [
    { score: 0, observable: "Focus collapses in tiebreaks — errors and disengagement" },
    { score: 1, observable: "Maintains focus in tiebreaks with some tension" },
    { score: 2, observable: "Sharp focus maintained through entire tiebreak" },
  ]},

  // PHYSICAL
  { skillId: "AGILITY_BENCHMARKS", rubrics: [
    { score: 0, observable: "Does not meet agility benchmarks for green level" },
    { score: 1, observable: "Meets some but not all agility benchmarks" },
    { score: 2, observable: "Meets all defined agility benchmarks for green level" },
  ]},
  { skillId: "CROSSOVER_RECOVERY", rubrics: [
    { score: 0, observable: "No crossover step — shuffle only, misses wide balls" },
    { score: 1, observable: "Uses crossover step to reach wide ball but recovery is slow" },
    { score: 2, observable: "Crossover step and full recovery to base position consistently" },
  ]},
  { skillId: "ENDURANCE_90", rubrics: [
    { score: 0, observable: "Physical quality and effort drop before 60 minutes" },
    { score: 1, observable: "Maintains quality to 60-75 min; fades in final 15 min" },
    { score: 2, observable: "Maintains full quality through 90-minute session" },
  ]},
  { skillId: "EXPLOSIVE_FIRST_STEP_GR", rubrics: [
    { score: 0, observable: "No explosive first step — slow start to every ball" },
    { score: 1, observable: "Explosive first step on some balls but inconsistent" },
    { score: 2, observable: "Consistently explosive first step from split-step position" },
  ]},
  { skillId: "FULL_COURT_COVER", rubrics: [
    { score: 0, observable: "Cannot cover full court — wide balls not reached consistently" },
    { score: 1, observable: "Covers full court but recovery is slow or incomplete" },
    { score: 2, observable: "Consistently covers full court and recovers to base" },
  ]},
  { skillId: "INJURY_HABITS", rubrics: [
    { score: 0, observable: "Does not warm up or cool down independently" },
    { score: 1, observable: "Warms up/cools down when instructed" },
    { score: 2, observable: "Proactively warms up and cools down every session without reminders" },
  ]},
  { skillId: "NET_TRANSITION", rubrics: [
    { score: 0, observable: "Cannot transition from baseline to net efficiently" },
    { score: 1, observable: "Transitions to net with some hesitation or poor split timing" },
    { score: 2, observable: "Efficient baseline-to-net transition with split-step before volley" },
  ]},
  { skillId: "SESSION_60_FOCUS", rubrics: [
    { score: 0, observable: "Focus drops before 45 minutes" },
    { score: 1, observable: "Focus maintained for 45-55 minutes" },
    { score: 2, observable: "Full focus for entire 60-minute session" },
  ]},
  { skillId: "SPLIT_STEP_70_GR", rubrics: [
    { score: 0, observable: "Split-step present on fewer than 50% of opportunities" },
    { score: 1, observable: "Split-step on 55-65% of opportunities" },
    { score: 2, observable: "Split-step on 70%+ of opportunities consistently" },
  ]},
  { skillId: "TWO_MATCHES_DAY_GR", rubrics: [
    { score: 0, observable: "Cannot complete 2 matches in one day at quality" },
    { score: 1, observable: "Completes 2 matches but quality drops in match 2" },
    { score: 2, observable: "Completes 2 full matches in one day with maintained quality" },
  ]},
  { skillId: "WIDE_BALL_RECOVER", rubrics: [
    { score: 0, observable: "Does not recover after wide ball — stays wide" },
    { score: 1, observable: "Recovers after wide ball but slowly" },
    { score: 2, observable: "Reaches wide ball and recovers to centre quickly" },
  ]},

  // SOCIAL
  { skillId: "DOUBLES_COMMUNICATION", rubrics: [
    { score: 0, observable: "No communication with doubles partner" },
    { score: 1, observable: "Communicates with partner occasionally" },
    { score: 2, observable: "Consistent clear communication with doubles partner throughout match" },
  ]},
  { skillId: "HELPS_YOUNGER", rubrics: [
    { score: 0, observable: "Does not help younger players" },
    { score: 1, observable: "Helps younger players when asked" },
    { score: 2, observable: "Proactively and effectively helps younger players" },
  ]},
  { skillId: "LEADERSHIP_ALWAYS", rubrics: [
    { score: 0, observable: "No leadership demonstrated" },
    { score: 1, observable: "Leadership shown in some situations" },
    { score: 2, observable: "Consistent leadership demonstrated across all training situations" },
  ]},
  { skillId: "PARTNER_RESPECT", rubrics: [
    { score: 0, observable: "Disrespects partner or opponent" },
    { score: 1, observable: "Generally respectful with occasional lapses" },
    { score: 2, observable: "Consistently respectful to partner and opponent at all times" },
  ]},
  { skillId: "POSITIVE_LEADER", rubrics: [
    { score: 0, observable: "Negative influence on group" },
    { score: 1, observable: "Neutral or occasionally positive influence on group" },
    { score: 2, observable: "Consistently positive and inspiring group leader" },
  ]},
  { skillId: "RESPECT_FAIRNESS", rubrics: [
    { score: 0, observable: "Disputes calls unfairly or shows poor sportsmanship" },
    { score: 1, observable: "Mostly fair with occasional unfair calls" },
    { score: 2, observable: "Always respectful and fair regardless of score or situation" },
  ]},
  { skillId: "ROLE_MODEL_GR", rubrics: [
    { score: 0, observable: "Does not model positive behaviour" },
    { score: 1, observable: "Sometimes models positive behaviour" },
    { score: 2, observable: "Consistently models positive behaviour for peers to follow" },
  ]},
  { skillId: "SELF_SCORE_CALLS", rubrics: [
    { score: 0, observable: "Cannot keep or call own score" },
    { score: 1, observable: "Keeps score with some errors" },
    { score: 2, observable: "Keeps and calls own score accurately throughout match" },
  ]},
  { skillId: "SPORTSMANSHIP_ALWAYS", rubrics: [
    { score: 0, observable: "Poor sportsmanship in some situations" },
    { score: 1, observable: "Good sportsmanship most of the time" },
    { score: 2, observable: "Exemplary sportsmanship in all situations without exception" },
  ]},
  { skillId: "TEAM_CONTRIBUTION", rubrics: [
    { score: 0, observable: "Does not contribute to team or doubles effort" },
    { score: 1, observable: "Contributes to team when asked" },
    { score: 2, observable: "Proactively contributes to team and doubles partnership" },
  ]},

  // TACTICAL
  { skillId: "CROSSCOURT_DEFAULT", rubrics: [
    { score: 0, observable: "Does not default to crosscourt — hits randomly" },
    { score: 1, observable: "Uses crosscourt as default some of the time" },
    { score: 2, observable: "Crosscourt is the clear default on all neutral balls" },
  ]},
  { skillId: "CROSSCOURT_STABILITY", rubrics: [
    { score: 0, observable: "Crosscourt rally breaks down within 5 balls" },
    { score: 1, observable: "Stable crosscourt pattern for 7-10 balls" },
    { score: 2, observable: "Stable crosscourt pattern beyond 10 balls consistently" },
  ]},
  { skillId: "GAMEPLAN", rubrics: [
    { score: 0, observable: "No gameplan visible — plays instinctively" },
    { score: 1, observable: "Has a gameplan but does not consistently follow it" },
    { score: 2, observable: "Has a clear gameplan and follows it consistently throughout match" },
  ]},
  { skillId: "GAMEPLAN_VISIBLE", rubrics: [
    { score: 0, observable: "No observable gameplan in match play" },
    { score: 1, observable: "Gameplan visible in some games" },
    { score: 2, observable: "Clearly visible gameplan executed consistently throughout match" },
  ]},
  { skillId: "IN_MATCH_ADJUSTMENT", rubrics: [
    { score: 0, observable: "No adjustment made during match — same tactics regardless of result" },
    { score: 1, observable: "Makes one adjustment in match with coaching prompt" },
    { score: 2, observable: "Independently makes tactical adjustment within a match when losing" },
  ]},
  { skillId: "MOMENTUM_RECOGNITION", rubrics: [
    { score: 0, observable: "Does not recognise momentum shifts — continues same approach" },
    { score: 1, observable: "Recognises momentum change post-match when discussed" },
    { score: 2, observable: "Recognises momentum shift during match and adjusts immediately" },
  ]},
  { skillId: "PATTERNS_ADVANCED", rubrics: [
    { score: 0, observable: "Cannot execute multi-shot pattern including serve+1 or cross-then-DTL" },
    { score: 1, observable: "Executes advanced pattern in practice but not in match" },
    { score: 2, observable: "Executes serve+1 and cross-then-DTL pattern in live match play" },
  ]},
  { skillId: "PATTERN_CROSS_CHANGE", rubrics: [
    { score: 0, observable: "Cannot execute crosscourt-then-change-direction pattern" },
    { score: 1, observable: "Executes pattern in isolated drill only" },
    { score: 2, observable: "Executes crosscourt-then-change pattern in practice match" },
  ]},
  { skillId: "RECOVERY_NEUTRAL", rubrics: [
    { score: 0, observable: "Does not recover to neutral zone — stays on one side" },
    { score: 1, observable: "Recovers toward neutral zone some of the time" },
    { score: 2, observable: "Recovers to neutral zone after every shot consistently" },
  ]},
  { skillId: "RISK_MANAGEMENT", rubrics: [
    { score: 0, observable: "Goes for winners or high-risk shots on big points regardless of situation" },
    { score: 1, observable: "Sometimes manages risk on big points" },
    { score: 2, observable: "Consistently selects percentage shot on big points" },
  ]},
  { skillId: "SERVE_PLUS_ONE_GR", rubrics: [
    { score: 0, observable: "No serve+1 execution at green level" },
    { score: 1, observable: "Attempts serve+1 pattern with prompting" },
    { score: 2, observable: "Executes serve+1 pattern proactively in green-level match" },
  ]},
  { skillId: "SHORT_BALL_APPROACH_GR", rubrics: [
    { score: 0, observable: "Does not move to short balls — stays at baseline" },
    { score: 1, observable: "Moves to short ball but approach shot is defensive" },
    { score: 2, observable: "Drives short ball approach deep and closes to net" },
  ]},
  { skillId: "TEMPO_CHANGES", rubrics: [
    { score: 0, observable: "Always hits same pace — no tempo variation" },
    { score: 1, observable: "Occasionally varies pace on request" },
    { score: 2, observable: "Strategically varies pace to disrupt opponent's rhythm" },
  ]},
  { skillId: "THREE_PHASE_POINT", rubrics: [
    { score: 0, observable: "Cannot demonstrate defense-neutral-attack phase awareness" },
    { score: 1, observable: "Understands phases with coaching explanation" },
    { score: 2, observable: "Executes defensive reset → neutral rally → attack sequence in practice" },
  ]},

  // TECHNIQUE
  { skillId: "COMPLETE_TOOLKIT", rubrics: [
    { score: 0, observable: "Missing multiple stroke types (slice, drop, overhead, volley)" },
    { score: 1, observable: "Has most strokes but 1-2 are unreliable" },
    { score: 2, observable: "Complete toolkit: topspin, slice, drop, overhead, and both volleys reliable" },
  ]},
  { skillId: "DEPTH_7_10", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 groundstrokes land past service line" },
    { score: 1, observable: "5-6 of 10 land past service line" },
    { score: 2, observable: "7 of 10 groundstrokes land in the deep zone consistently" },
  ]},
  { skillId: "DEPTH_8_10", rubrics: [
    { score: 0, observable: "Fewer than 6 of 10 groundstrokes land past service line" },
    { score: 1, observable: "6-7 of 10 land past service line" },
    { score: 2, observable: "8 of 10 groundstrokes land past the service line" },
  ]},
  { skillId: "OVERHEAD_5_10", rubrics: [
    { score: 0, observable: "Fewer than 3 of 10 overheads land in court" },
    { score: 1, observable: "3-4 of 10 overheads in court" },
    { score: 2, observable: "5 of 10 overheads controlled and in court" },
  ]},
  { skillId: "OVERHEAD_7_10", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 overheads in court" },
    { score: 1, observable: "5-6 of 10 overheads in court" },
    { score: 2, observable: "7 of 10 overheads land in court with direction" },
  ]},
  { skillId: "RALLY_20_PLUS", rubrics: [
    { score: 0, observable: "Cannot sustain a 15-ball rally" },
    { score: 1, observable: "Sustains 15-18 ball cooperative rally" },
    { score: 2, observable: "Sustains 20+ ball cooperative rally consistently" },
  ]},
  { skillId: "RALLY_FULL_COURT", rubrics: [
    { score: 0, observable: "Cannot sustain full court rally beyond 8 balls" },
    { score: 1, observable: "Sustains full court rally to 10-12 balls" },
    { score: 2, observable: "Sustains 15+ ball rally on full court" },
  ]},
  { skillId: "RETURN_6_10", rubrics: [
    { score: 0, observable: "Fewer than 4 of 10 returns in play" },
    { score: 1, observable: "4-5 of 10 returns in play" },
    { score: 2, observable: "6 of 10 returns in play at full court level" },
  ]},
  { skillId: "RETURN_7_10_DEEP", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 returns in play with depth" },
    { score: 1, observable: "5-6 of 10 returns in play but landing short" },
    { score: 2, observable: "7 of 10 returns in play and landing past service line" },
  ]},
  { skillId: "RETURN_8_10_DIRECTION", rubrics: [
    { score: 0, observable: "Fewer than 6 of 10 returns with direction" },
    { score: 1, observable: "6-7 of 10 returns in play with some direction" },
    { score: 2, observable: "8 of 10 returns in play with intended direction" },
  ]},
  { skillId: "SECOND_SERVE_6_10", rubrics: [
    { score: 0, observable: "Fewer than 4 of 10 second serves in the box" },
    { score: 1, observable: "4-5 of 10 second serves in the box" },
    { score: 2, observable: "6 of 10 second serves land in the box" },
  ]},
  { skillId: "SECOND_SERVE_7_10_PRESSURE", rubrics: [
    { score: 0, observable: "Second serve percentage drops below 40% under pressure" },
    { score: 1, observable: "5-6 of 10 second serves in under pressure" },
    { score: 2, observable: "7 of 10 second serves land in under match pressure" },
  ]},
  { skillId: "SECOND_SERVE_CONCEPT", rubrics: [
    { score: 0, observable: "No second serve concept — hits same ball as first" },
    { score: 1, observable: "Understands second serve concept, attempts spin but inconsistent" },
    { score: 2, observable: "Clearly executes a distinct second serve strategy (spin/safety) consistently" },
  ]},
  { skillId: "SERVE_7_10", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 first serves in box" },
    { score: 1, observable: "5-6 of 10 first serves in box" },
    { score: 2, observable: "7 of 10 first serves land in the correct box" },
  ]},
  { skillId: "SERVE_8_10_TARGETS", rubrics: [
    { score: 0, observable: "Fewer than 6 of 10 serves in box with no target accuracy" },
    { score: 1, observable: "6-7 of 10 in box but without target accuracy" },
    { score: 2, observable: "8 of 10 serves in box and hitting intended target zones" },
  ]},
  { skillId: "SERVE_ADVANTAGE", rubrics: [
    { score: 0, observable: "First serve puts player at disadvantage — easy to attack" },
    { score: 1, observable: "First serve is neutral — not attacking but not defensive" },
    { score: 2, observable: "First serve consistently gives scoring advantage through pace, spin, or placement" },
  ]},
  { skillId: "SERVE_FULL_6_10", rubrics: [
    { score: 0, observable: "Fewer than 4 of 10 serves land from full baseline" },
    { score: 1, observable: "4-5 of 10 serves in from full baseline" },
    { score: 2, observable: "6 of 10 serves in from full court baseline position" },
  ]},
  { skillId: "SERVE_GREEN", rubrics: [
    { score: 0, observable: "Cannot serve in consistently from green/full court baseline" },
    { score: 1, observable: "Serves in from full baseline 40-50% of the time" },
    { score: 2, observable: "Serves in from full court baseline 60%+ consistently" },
  ]},
  { skillId: "VARIATION_INTRO", rubrics: [
    { score: 0, observable: "Only uses flat baseline shots — no slice or drop" },
    { score: 1, observable: "Attempts slice or drop shot in isolated drills" },
    { score: 2, observable: "Uses slice or drop shot as an option in live play" },
  ]},
  { skillId: "VOLLEYS_7_10", rubrics: [
    { score: 0, observable: "Fewer than 5 of 10 volleys controlled in court" },
    { score: 1, observable: "5-6 of 10 volleys controlled" },
    { score: 2, observable: "7 of 10 volleys controlled and placed in court" },
  ]},
  { skillId: "VOLLEYS_8_10_TRANSITION", rubrics: [
    { score: 0, observable: "Fewer than 6 of 10 volleys in transition" },
    { score: 1, observable: "6-7 of 10 transition volleys controlled" },
    { score: 2, observable: "8 of 10 volleys in transition controlled and in court" },
  ]},
  { skillId: "VOLLEY_INTRO_GR", rubrics: [
    { score: 0, observable: "No volley technique — full swing at net" },
    { score: 1, observable: "Volley attempt visible with some punch action" },
    { score: 2, observable: "Consistent continental-grip punch volley in both directions" },
  ]},

  // ========== YELLOW STAGE - MISSING RUBRICS ==========

  // MATCH
  { skillId: "COMPETITIVE_TRACK", rubrics: [
    { score: 0, observable: "No competitive results on record" },
    { score: 1, observable: "Some competitive results logged" },
    { score: 2, observable: "Proven competitive track record with multiple logged results" },
  ]},
  { skillId: "EVENT_PARTICIPATION_Y", rubrics: [
    { score: 0, observable: "Has not entered any ladder, league, or tournament" },
    { score: 1, observable: "Entered 1 ladder/league/tournament" },
    { score: 2, observable: "Consistently participates in ladder, league, or tournament events" },
  ]},
  { skillId: "MATCH_10_WINS", rubrics: [
    { score: 0, observable: "Fewer than 5 match wins recorded" },
    { score: 1, observable: "5-9 match wins recorded" },
    { score: 2, observable: "10+ match wins recorded" },
  ]},
  { skillId: "MATCH_12_EVENTS", rubrics: [
    { score: 0, observable: "Fewer than 8 match events" },
    { score: 1, observable: "8-11 match events completed" },
    { score: 2, observable: "12+ match events completed" },
  ]},
  { skillId: "MATCH_20_EVENTS", rubrics: [
    { score: 0, observable: "Fewer than 12 match events" },
    { score: 1, observable: "12-19 match events completed" },
    { score: 2, observable: "20+ match events completed" },
  ]},
  { skillId: "MATCH_2_WINS_Y", rubrics: [
    { score: 0, observable: "No wins or all losses by large margin" },
    { score: 1, observable: "1 win or 1-2 close competitive losses" },
    { score: 2, observable: "2+ wins or 2 competitive losses showing clear competitive level" },
  ]},
  { skillId: "MATCH_5_WINS", rubrics: [
    { score: 0, observable: "Fewer than 3 match wins" },
    { score: 1, observable: "3-4 match wins" },
    { score: 2, observable: "5+ match wins recorded" },
  ]},
  { skillId: "MATCH_6_OFFICIAL", rubrics: [
    { score: 0, observable: "Fewer than 3 official matches played" },
    { score: 1, observable: "3-5 official matches played" },
    { score: 2, observable: "6+ official matches completed" },
  ]},
  { skillId: "MULTI_EVENT", rubrics: [
    { score: 0, observable: "Only participated in 1 type of event" },
    { score: 1, observable: "Participated in 2 different event types" },
    { score: 2, observable: "Completed multiple event types (ladder + tournament + league)" },
  ]},
  { skillId: "SELF_OFFICIATING_Y", rubrics: [
    { score: 0, observable: "Cannot self-officiate accurately" },
    { score: 1, observable: "Self-officiates with occasional disputes or errors" },
    { score: 2, observable: "Self-officiates accurately and handles disputes professionally" },
  ]},

  // MENTAL
  { skillId: "BETWEEN_SETS_APPLY", rubrics: [
    { score: 0, observable: "Cannot apply coaching instruction given between sets" },
    { score: 1, observable: "Applies 1 instruction between sets with reminder" },
    { score: 2, observable: "Applies coaching instruction given between sets in next game" },
  ]},
  { skillId: "COMEBACK_ABILITY", rubrics: [
    { score: 0, observable: "Cannot come back from set or break down" },
    { score: 1, observable: "Has come back from deficit once in recorded matches" },
    { score: 2, observable: "Demonstrates consistent ability to fight back from deficits" },
  ]},
  { skillId: "CONSISTENT_ATTITUDE_Y", rubrics: [
    { score: 0, observable: "Attitude issues visible in training or match (tantrums, blaming)" },
    { score: 1, observable: "Generally good attitude with occasional lapses" },
    { score: 2, observable: "Consistently positive attitude — no tantrums or blame in any session" },
  ]},
  { skillId: "MENTAL_TOUGHNESS", rubrics: [
    { score: 0, observable: "Mentally fragile under pressure — often collapses" },
    { score: 1, observable: "Adequate mental toughness in some situations" },
    { score: 2, observable: "Elite-level mental toughness — performs best when stakes are highest" },
  ]},
  { skillId: "NO_EMOTIONAL_SPIRAL", rubrics: [
    { score: 0, observable: "Frequently enters emotional spirals affecting multiple games" },
    { score: 1, observable: "Occasional emotional spirals but recovers within 1-2 games" },
    { score: 2, observable: "No emotional spirals — immediately resets after any error" },
  ]},
  { skillId: "POINT_RESET_Y", rubrics: [
    { score: 0, observable: "No reset routine between points" },
    { score: 1, observable: "Partial reset routine — inconsistent" },
    { score: 2, observable: "Clear consistent reset routine between every point" },
  ]},
  { skillId: "POST_MATCH_REFLECTION", rubrics: [
    { score: 0, observable: "Cannot reflect on own match performance" },
    { score: 1, observable: "Reflects with coach prompting" },
    { score: 2, observable: "Independently reflects on match with specific observations" },
  ]},
  { skillId: "PRESSURE_PROOF_Y", rubrics: [
    { score: 0, observable: "Technique and decision quality drop significantly on pressure points" },
    { score: 1, observable: "Some degradation on pressure points but stays competitive" },
    { score: 2, observable: "Pressure-proof: quality maintained or improved on all pressure points" },
  ]},
  { skillId: "SELF_COACHING_Y", rubrics: [
    { score: 0, observable: "Cannot self-coach — waits for all direction from coach" },
    { score: 1, observable: "Identifies one technical issue and attempts to self-correct" },
    { score: 2, observable: "Independently identifies and corrects technical issues during match" },
  ]},
  { skillId: "SELF_FAULT_NAMING", rubrics: [
    { score: 0, observable: "Cannot name own fault — blames external factors" },
    { score: 1, observable: "Names fault with prompting" },
    { score: 2, observable: "Immediately and accurately names own fault after each error" },
  ]},
  { skillId: "TIEBREAK_COMPOSURE_Y", rubrics: [
    { score: 0, observable: "Composure breaks in tiebreaks consistently" },
    { score: 1, observable: "Maintains composure in most tiebreaks" },
    { score: 2, observable: "Plays best tennis in tiebreaks — composure and execution at peak" },
  ]},

  // PHYSICAL
  { skillId: "COMPETITION_FITNESS", rubrics: [
    { score: 0, observable: "Cannot sustain high training load without physical decline" },
    { score: 1, observable: "Adequate competition fitness but fatigues after 2 sessions" },
    { score: 2, observable: "High training load capacity — can sustain competition schedule" },
  ]},
  { skillId: "EXPLOSIVE_FIRST_STEP_Y", rubrics: [
    { score: 0, observable: "No explosive first step even in fresh state" },
    { score: 1, observable: "Explosive first step early in match; fades in set 2" },
    { score: 2, observable: "Consistently explosive first step throughout full match" },
  ]},
  { skillId: "LOAD_MANAGEMENT", rubrics: [
    { score: 0, observable: "No awareness of load management — trains until injured" },
    { score: 1, observable: "Manages load with coach guidance" },
    { score: 2, observable: "Independently manages own training load and communicates body status" },
  ]},
  { skillId: "NINETY_MIN_MATCH", rubrics: [
    { score: 0, observable: "Physical quality drops significantly before 60 minutes" },
    { score: 1, observable: "Maintains quality to 60-75 min with some fading" },
    { score: 2, observable: "Full physical quality maintained through 90-minute match" },
  ]},
  { skillId: "NO_PHYSICAL_DROP_SET2", rubrics: [
    { score: 0, observable: "Significant physical drop visible in set 2" },
    { score: 1, observable: "Minor physical drop in set 2 but still competitive" },
    { score: 2, observable: "No observable physical quality drop in set 2 vs set 1" },
  ]},
  { skillId: "SPLIT_STEP_DEFAULT", rubrics: [
    { score: 0, observable: "Split-step still requires reminder" },
    { score: 1, observable: "Split-step is mostly automatic with occasional lapses" },
    { score: 2, observable: "Split-step is fully automatic on every rally ball — zero reminders needed" },
  ]},
  { skillId: "TOURNAMENT_READY", rubrics: [
    { score: 0, observable: "Cannot sustain 2 matches in a competition day" },
    { score: 1, observable: "Can play 2 matches per day with some degradation in match 2" },
    { score: 2, observable: "Tournament-ready: 2 matches per day with full quality maintained" },
  ]},
  { skillId: "TWO_MATCHES_DAY_Y", rubrics: [
    { score: 0, observable: "Cannot complete 2 matches per day at competitive quality" },
    { score: 1, observable: "Completes 2 matches but quality drops in second match" },
    { score: 2, observable: "Completes 2 matches in a day with quality maintained throughout" },
  ]},
  { skillId: "WARMUP_HABITS", rubrics: [
    { score: 0, observable: "No warmup habits — starts cold without any preparation" },
    { score: 1, observable: "Warms up when prompted" },
    { score: 2, observable: "Proactively performs full warmup routine before every session" },
  ]},

  // SOCIAL
  { skillId: "LEADERSHIP_MENTOR", rubrics: [
    { score: 0, observable: "Does not lead or mentor others" },
    { score: 1, observable: "Occasionally leads or mentors when asked" },
    { score: 2, observable: "Proactively leads and mentors younger or less experienced players" },
  ]},
  { skillId: "LEADER_EXAMPLE", rubrics: [
    { score: 0, observable: "Does not lead by example" },
    { score: 1, observable: "Leads by example in some situations" },
    { score: 2, observable: "Consistently leads by example in all training and match situations" },
  ]},
  { skillId: "LINE_CALLS_CORRECT", rubrics: [
    { score: 0, observable: "Makes incorrect or disputed line calls regularly" },
    { score: 1, observable: "Line calls mostly correct with occasional disputes" },
    { score: 2, observable: "Consistently correct and fair line calls throughout match" },
  ]},
  { skillId: "RESPECT_FAULTS_LOSS", rubrics: [
    { score: 0, observable: "Shows disrespect after faults or when losing" },
    { score: 1, observable: "Generally respectful after faults and losses" },
    { score: 2, observable: "Always respectful at faults and losses — no negative reactions" },
  ]},
  { skillId: "RESPECT_OFFICIALS", rubrics: [
    { score: 0, observable: "Argues with or disrespects officials or opponents" },
    { score: 1, observable: "Generally respectful with occasional challenges" },
    { score: 2, observable: "Consistently respectful to all officials and opponents without exception" },
  ]},
  { skillId: "ROLE_MODEL_Y", rubrics: [
    { score: 0, observable: "Does not model positive behaviour for peers" },
    { score: 1, observable: "Sometimes models positive behaviour" },
    { score: 2, observable: "Consistently models positive behaviour that others aspire to emulate" },
  ]},
  { skillId: "TEAM_DOUBLES_CORRECT", rubrics: [
    { score: 0, observable: "Incorrect doubles positioning and communication" },
    { score: 1, observable: "Mostly correct doubles behaviour with occasional errors" },
    { score: 2, observable: "Correct team and doubles behaviour consistently" },
  ]},

  // TACTICAL
  { skillId: "HIGH_PERCENTAGE_TENNIS", rubrics: [
    { score: 0, observable: "Goes for low-percentage shots in neutral situations" },
    { score: 1, observable: "Selects high-percentage shots sometimes but not consistently" },
    { score: 2, observable: "Consistently plays high-percentage tennis — right shot selection for every situation" },
  ]},
  { skillId: "IN_MATCH_ADJUSTMENT_Y", rubrics: [
    { score: 0, observable: "No tactical adjustment within match" },
    { score: 1, observable: "Makes 1 tactical adjustment in match with coaching" },
    { score: 2, observable: "Independently makes multiple tactical adjustments within a match" },
  ]},
  { skillId: "MOMENTUM_SHIFTS", rubrics: [
    { score: 0, observable: "Does not recognise momentum shifts" },
    { score: 1, observable: "Recognises momentum shift after the fact" },
    { score: 2, observable: "Recognises and responds to momentum shifts in real-time during match" },
  ]},
  { skillId: "OWN_STYLE_KNOWN", rubrics: [
    { score: 0, observable: "Cannot describe own playing style" },
    { score: 1, observable: "Describes playing style in general terms" },
    { score: 2, observable: "Clearly articulates own playing style and uses it strategically" },
  ]},
  { skillId: "PATTERN_TENNIS", rubrics: [
    { score: 0, observable: "No pattern tennis — plays point to point reactively" },
    { score: 1, observable: "Executes one pattern (serve+1) in practice" },
    { score: 2, observable: "Executes multiple patterns including serve+1 and cross-then-change in match" },
  ]},
  { skillId: "SCORE_CONTEXT_ADVANCED", rubrics: [
    { score: 0, observable: "No score context awareness — same shot selection at all scores" },
    { score: 1, observable: "Changes shot selection at obvious pressure scores (30-40)" },
    { score: 2, observable: "Advanced score context: adjusts strategy based on all score situations" },
  ]},
  { skillId: "SCORE_CONTEXT_PLAY", rubrics: [
    { score: 0, observable: "Does not adapt play based on score context" },
    { score: 1, observable: "Adapts play at obvious key moments with coaching" },
    { score: 2, observable: "Consistently adjusts play based on score context without prompting" },
  ]},
  { skillId: "SIMPLE_GAMEPLAN", rubrics: [
    { score: 0, observable: "No gameplan — all points played the same" },
    { score: 1, observable: "Has a simple gameplan but forgets it under pressure" },
    { score: 2, observable: "Executes a simple pre-agreed gameplan throughout the match" },
  ]},
  { skillId: "STRATEGIC_PLAY", rubrics: [
    { score: 0, observable: "No strategic awareness — plays purely instinctively" },
    { score: 1, observable: "Shows some strategic thinking with coaching prompts" },
    { score: 2, observable: "High-level tactical awareness: reads opponent, selects strategy, executes it" },
  ]},

  // TECHNIQUE
  { skillId: "COMPLETE_TECHNIQUE", rubrics: [
    { score: 0, observable: "Several strokes not yet at tournament-ready level" },
    { score: 1, observable: "Most strokes reliable; 1-2 still under development" },
    { score: 2, observable: "All major strokes at tournament-ready level consistently" },
  ]},
  { skillId: "DEPTH_HEIGHT_DIRECTION", rubrics: [
    { score: 0, observable: "Cannot combine depth, height, and direction on groundstrokes" },
    { score: 1, observable: "Can achieve 2 of 3 elements (e.g., depth and direction but not height)" },
    { score: 2, observable: "Consistently combines depth, height, and direction on groundstrokes" },
  ]},
  { skillId: "FULL_ARSENAL", rubrics: [
    { score: 0, observable: "Missing 2+ weapons (no slice, no lob, no net game)" },
    { score: 1, observable: "Has most weapons but 1-2 are below competitive standard" },
    { score: 2, observable: "Full arsenal: slice, drop, lob, net — all competitive level" },
  ]},
  { skillId: "GROUNDSTROKES_DIRECTION", rubrics: [
    { score: 0, observable: "No directional control — groundstrokes go unpredictably" },
    { score: 1, observable: "Can direct groundstrokes on request with some errors" },
    { score: 2, observable: "Consistently controls groundstroke direction to intended target" },
  ]},
  { skillId: "RALLY_18_PLUS_Y", rubrics: [
    { score: 0, observable: "Cannot sustain rally beyond 12 balls" },
    { score: 1, observable: "Sustains rally to 14-16 balls" },
    { score: 2, observable: "Sustains 18+ ball cooperative rally consistently" },
  ]},
  { skillId: "RETURN_70_PERCENT", rubrics: [
    { score: 0, observable: "Fewer than 50% of returns land in play" },
    { score: 1, observable: "55-65% of returns in play" },
    { score: 2, observable: "70%+ of returns in play consistently" },
  ]},
  { skillId: "RETURN_ATTACK_NEUTRAL", rubrics: [
    { score: 0, observable: "Return is purely defensive — does not attack or neutralise" },
    { score: 1, observable: "Occasionally attacks or neutralises with return" },
    { score: 2, observable: "Selects attack or neutralise return based on serve quality consistently" },
  ]},
  { skillId: "RETURN_DIRECTION", rubrics: [
    { score: 0, observable: "Return direction is uncontrolled" },
    { score: 1, observable: "Can direct return on slow serves" },
    { score: 2, observable: "Consistently directs return to intended target zone" },
  ]},
  { skillId: "SECOND_SERVE_PRESSURE_Y", rubrics: [
    { score: 0, observable: "Second serve percentage drops below 40% under pressure" },
    { score: 1, observable: "Second serve holds to 50-60% under pressure" },
    { score: 2, observable: "Second serve maintained at regular percentage under all pressure situations" },
  ]},
  { skillId: "SECOND_SERVE_RELIABLE", rubrics: [
    { score: 0, observable: "Second serve is unreliable — frequent double faults" },
    { score: 1, observable: "Second serve reliable in practice, faults under match pressure" },
    { score: 2, observable: "Second serve reliable in both practice and match situations consistently" },
  ]},
  { skillId: "SECOND_SERVE_SPIN_TARGET", rubrics: [
    { score: 0, observable: "Second serve has no spin or target" },
    { score: 1, observable: "Has spin or has a target, but not both consistently" },
    { score: 2, observable: "Second serve uses spin and lands in intended target zone consistently" },
  ]},
  { skillId: "SERVE_65_PERCENT", rubrics: [
    { score: 0, observable: "First serve percentage below 50%" },
    { score: 1, observable: "First serve percentage 55-62%" },
    { score: 2, observable: "First serve percentage at 65%+ consistently" },
  ]},
  { skillId: "SERVE_TARGETS_TWB", rubrics: [
    { score: 0, observable: "Cannot hit serve targets to T, wide, or body" },
    { score: 1, observable: "Can hit 1-2 serve targets reliably" },
    { score: 2, observable: "Hits T, wide, and body serve targets reliably" },
  ]},
  { skillId: "SLICE_OR_DROP_EFFECTIVE", rubrics: [
    { score: 0, observable: "Slice and drop shot are not effective — easy for opponent to attack" },
    { score: 1, observable: "Slice or drop effective in practice but not in match" },
    { score: 2, observable: "Slice and/or drop shot effective in match — creates discomfort for opponent" },
  ]},
  { skillId: "TRANSITION_VOLLEY_6_10", rubrics: [
    { score: 0, observable: "Fewer than 4 of 10 transition volleys controlled" },
    { score: 1, observable: "4-5 of 10 transition volleys controlled" },
    { score: 2, observable: "6 of 10 transition volleys controlled and placed" },
  ]},
];

export async function seedSkillRubricBackfill() {
  console.log("[Seed] Starting skill rubric backfill...");

  let inserted = 0;
  let skipped = 0;
  let skillNotFound = 0;

  for (const entry of SKILL_RUBRIC_BACKFILL) {
    for (const rubric of entry.rubrics) {
      try {
        await db.execute(sql`
          INSERT INTO skill_rubrics (skill_id, score, observable)
          VALUES (${entry.skillId}, ${rubric.score}, ${rubric.observable})
          ON CONFLICT (skill_id, score) DO UPDATE SET
            observable = EXCLUDED.observable
        `);
        inserted++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("foreign key") || message.includes("skill_id")) {
          skillNotFound++;
        } else {
          console.warn(`[Seed] Skipped rubric for ${entry.skillId} score ${rubric.score}:`, message);
          skipped++;
        }
      }
    }
  }

  console.log(`[Seed] Rubric backfill done: ${inserted} rubrics inserted, ${skipped} skipped, ${skillNotFound} skills not found`);
}
