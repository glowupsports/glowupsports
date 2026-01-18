/**
 * Lesson Templates Seed Data
 * Pre-built lesson structures with drill blocks per level
 */

import { db } from "../db";
import { lessonTemplates, drillBlocks, roleMessageTemplates } from "../../shared/schema";

const LESSON_TEMPLATES = [
  // =============================================================================
  // BLUE BALL TEMPLATES (Ages 2-4) - Pre-Tennis Foundation
  // Short blocks, lots of movement, FUN focused, no real tennis strokes
  // =============================================================================
  {
    id: "TPL_BLUE_EXPLORER_FUN",
    levelId: "BLUE_3",
    name: "Explorer Fun Session",
    description: "First-time players: safety, listening, and having fun on the court",
    focus: "physical",
    durationMinutes: 30,
    minPlayers: 2,
    maxPlayers: 6,
    ageGroup: "toddlers",
    tags: ["beginner", "fun", "blue-ball", "first-time", "ages-2-4"],
    blocks: [
      { name: "Hello Circle", blockType: "warmup", durationMinutes: 5, pillars: ["SOCIAL", "MENTAL"], skillIds: ["B3_LISTEN_INSTRUCTION", "B3_FOLLOWS_COACH"], coachInstructions: "Sit in circle, names + high-fives, show 'our court' boundaries", playerInstructions: "Let's say hi to everyone! High-five!" },
      { name: "Follow the Leader", blockType: "game", durationMinutes: 6, pillars: ["PHYSICAL", "MENTAL"], skillIds: ["B3_RUNS", "B3_STOPS_ON_COMMAND"], coachInstructions: "Walk/run/freeze game. Use whistle or 'STOP!' command. Praise listening.", playerInstructions: "Follow me! When I say STOP, freeze like a statue!" },
      { name: "Ball Collecting Race", blockType: "game", durationMinutes: 6, pillars: ["PHYSICAL", "SOCIAL"], skillIds: ["B3_PICKUP_BALL", "B3_WALK_TARGET"], coachInstructions: "Scatter balls, kids collect into buckets. Make it fun with counting!", playerInstructions: "Pick up balls and put them in the bucket! How many can you find?" },
      { name: "Racket Introduction", blockType: "drill", durationMinutes: 6, pillars: ["TECHNIQUE", "MENTAL"], skillIds: ["B3_HOLD_RACKET", "B3_CARRY_RACKET"], coachInstructions: "Hand out rackets, show 'holding hand', walk with rackets. No hitting yet.", playerInstructions: "This is YOUR racket! Hold it tight and walk with me!" },
      { name: "Balloon Tap", blockType: "game", durationMinutes: 5, pillars: ["TECHNIQUE", "PHYSICAL"], skillIds: ["B3_HIT_BALL", "B3_EYE_TRACKS"], coachInstructions: "Tap balloons up with racket. Safe, soft, builds eye-hand coordination.", playerInstructions: "Keep the balloon up! Tap, tap, tap!" },
      { name: "Bye-bye Circle", blockType: "cooldown", durationMinutes: 2, pillars: ["SOCIAL", "MENTAL"], skillIds: ["B3_SAYS_GOODBYE", "B3_POSITIVE_END"], coachInstructions: "Gather, ask what was fun, high-fives goodbye, stickers if available.", playerInstructions: "What was your favorite game? See you next time!" },
    ],
  },
  {
    id: "TPL_BLUE_EXPLORER_MOVE",
    levelId: "BLUE_3",
    name: "Little Movers Session",
    description: "Building basic motor skills through fun movement games",
    focus: "physical",
    durationMinutes: 30,
    minPlayers: 2,
    maxPlayers: 6,
    ageGroup: "toddlers",
    tags: ["movement", "motor-skills", "blue-ball", "ages-2-4"],
    blocks: [
      { name: "Animal Warm-up", blockType: "warmup", durationMinutes: 5, pillars: ["PHYSICAL", "SOCIAL"], skillIds: ["B3_RUNS", "B3_CRAWLS"], coachInstructions: "Walk like a bear, hop like bunny, slither like snake. High energy fun!", playerInstructions: "Let's be animals! Can you walk like a bear?" },
      { name: "Color Cones Run", blockType: "game", durationMinutes: 6, pillars: ["PHYSICAL", "TACTICAL"], skillIds: ["B3_WALK_TARGET", "B3_START_STOP"], coachInstructions: "Call colors, kids run to matching cones. Practice start/stop.", playerInstructions: "Run to the RED cone! Now BLUE! Go go go!" },
      { name: "Balance Walk", blockType: "drill", durationMinutes: 5, pillars: ["PHYSICAL"], skillIds: ["B3_BALANCES", "B3_WALKS_LINE"], coachInstructions: "Walk on court lines like a tightrope. Arms out for balance.", playerInstructions: "Walk on the line like a tightrope! Don't fall off!" },
      { name: "Throw & Catch", blockType: "drill", durationMinutes: 6, pillars: ["TECHNIQUE", "PHYSICAL"], skillIds: ["B3_THROW_ONE_HAND", "B3_CATCH_TWO_HANDS"], coachInstructions: "Soft throws with large foam balls. Celebrate catches!", playerInstructions: "Catch the ball with BOTH hands! Ready? Here it comes!" },
      { name: "Mini Obstacle Course", blockType: "game", durationMinutes: 6, pillars: ["PHYSICAL", "MENTAL"], skillIds: ["B3_JUMPS_TWO_FEET", "B3_FOLLOWS_ROUTE"], coachInstructions: "Simple course: jump over cone, crawl under net, touch cone, run back.", playerInstructions: "Go through the course! Jump, crawl, run!" },
      { name: "Stretch & Stars", blockType: "cooldown", durationMinutes: 2, pillars: ["PHYSICAL", "SOCIAL"], skillIds: ["B3_POSITIVE_END"], coachInstructions: "Simple stretches, everyone gets a star sticker.", playerInstructions: "Stretch up high! Touch your toes! You're a STAR!" },
    ],
  },
  {
    id: "TPL_BLUE_BUILDER_BALLS",
    levelId: "BLUE_2",
    name: "Ball Handling Builders",
    description: "Building coordination through ball handling activities",
    focus: "technique",
    durationMinutes: 35,
    minPlayers: 2,
    maxPlayers: 6,
    ageGroup: "toddlers",
    tags: ["ball-handling", "coordination", "blue-ball", "ages-2-4"],
    blocks: [
      { name: "Movement Warm-up", blockType: "warmup", durationMinutes: 5, pillars: ["PHYSICAL"], skillIds: ["B2_RUNS_CONTROLLED", "B2_STOPS_QUICKLY"], coachInstructions: "Running games with direction changes. Add silly movements.", playerInstructions: "Run fast! Now slow like a turtle! Now fast like a cheetah!" },
      { name: "Bounce Challenge", blockType: "drill", durationMinutes: 6, pillars: ["TECHNIQUE", "PHYSICAL"], skillIds: ["B2_BOUNCES_BALL", "B2_EYE_HAND"], coachInstructions: "Bounce ball with two hands, catch with two hands. Count bounces.", playerInstructions: "Bounce and catch! How many can you do? 1... 2... 3..." },
      { name: "Roll & Chase", blockType: "game", durationMinutes: 6, pillars: ["TECHNIQUE", "PHYSICAL"], skillIds: ["B2_ROLLS_BALL", "B2_CHASES_BALL"], coachInstructions: "Roll balls to each other, chase and retrieve. Build tracking.", playerInstructions: "Roll the ball to your friend! Then chase it!" },
      { name: "Racket Balance", blockType: "drill", durationMinutes: 6, pillars: ["TECHNIQUE", "MENTAL"], skillIds: ["B2_CARRIES_RACKET", "B2_BALANCE_BALL"], coachInstructions: "Balance ball on racket while walking slowly. Build control.", playerInstructions: "Put the ball on your racket. Can you walk without it falling?" },
      { name: "Target Toss", blockType: "game", durationMinutes: 7, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["B2_THROWS_DIRECTION", "B2_AIM_TARGET"], coachInstructions: "Throw balls into hoops/buckets. Celebrate hits!", playerInstructions: "Throw the ball into the hoop! Aim carefully!" },
      { name: "Partner High-Fives", blockType: "cooldown", durationMinutes: 5, pillars: ["SOCIAL", "MENTAL"], skillIds: ["B2_SHARES_EQUIPMENT", "B2_POSITIVE_PARTNER"], coachInstructions: "Find a partner, high-five, say something nice. Build social skills.", playerInstructions: "High-five your friend! Say 'good job!'" },
    ],
  },
  {
    id: "TPL_BLUE_BUILDER_RACKET",
    levelId: "BLUE_2",
    name: "Racket Explorers",
    description: "Introduction to racket control and hitting foam balls",
    focus: "technique",
    durationMinutes: 35,
    minPlayers: 2,
    maxPlayers: 5,
    ageGroup: "toddlers",
    tags: ["racket", "hitting", "blue-ball", "ages-2-4"],
    blocks: [
      { name: "Racket Parade", blockType: "warmup", durationMinutes: 5, pillars: ["PHYSICAL", "TECHNIQUE"], skillIds: ["B2_CARRIES_RACKET", "B2_WALKS_RACKET"], coachInstructions: "March around court with rackets held high. Make it a parade!", playerInstructions: "Hold your racket up high! March march march!" },
      { name: "Tap the Ball", blockType: "drill", durationMinutes: 7, pillars: ["TECHNIQUE"], skillIds: ["B2_TAPS_BALL", "B2_CONTACT_POINT"], coachInstructions: "Ball on ground, tap with racket. No swing, just tap.", playerInstructions: "Tap the ball gently! Just tap - not hit!" },
      { name: "Rolling Rally", blockType: "drill", durationMinutes: 6, pillars: ["TECHNIQUE", "SOCIAL"], skillIds: ["B2_ROLLS_RACKET", "B2_TURN_TAKING"], coachInstructions: "Use racket to roll ball to partner. Like hockey but gentle.", playerInstructions: "Roll the ball to your friend with your racket! Your turn, their turn!" },
      { name: "Balloon Tennis", blockType: "game", durationMinutes: 7, pillars: ["TECHNIQUE", "PHYSICAL"], skillIds: ["B2_HITS_BALLOON", "B2_TRACKS_OBJECT"], coachInstructions: "Hit balloons over low net or line. Soft and slow = success!", playerInstructions: "Hit the balloon over! Keep it up!" },
      { name: "Net Intro", blockType: "drill", durationMinutes: 6, pillars: ["TACTICAL", "TECHNIQUE"], skillIds: ["B2_KNOWS_NET", "B2_OVER_NET"], coachInstructions: "Stand at net, toss balls over gently. Introduce 'over the net' concept.", playerInstructions: "This is the NET! Try to get the ball OVER it!" },
      { name: "Team Cheer", blockType: "cooldown", durationMinutes: 4, pillars: ["SOCIAL", "MENTAL"], skillIds: ["B2_TEAM_SPIRIT", "B2_POSITIVE_END"], coachInstructions: "Team huddle, hands in middle, cheer together. Build group connection.", playerInstructions: "Hands in! 1-2-3... TENNIS!" },
    ],
  },
  {
    id: "TPL_BLUE_READY_GAMES",
    levelId: "BLUE_1",
    name: "Game Time Ready",
    description: "Preparing for transition to Red Ball with structured games",
    focus: "match_play",
    durationMinutes: 40,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "toddlers",
    tags: ["games", "ready", "blue-ball", "transition", "ages-3-4"],
    blocks: [
      { name: "Active Warm-up", blockType: "warmup", durationMinutes: 5, pillars: ["PHYSICAL"], skillIds: ["B1_RUNS_FAST", "B1_AGILITY"], coachInstructions: "Quick feet, side shuffles, jumping. Get energy up!", playerInstructions: "Quick feet! Side to side! Jump up high!" },
      { name: "Forehand Ready", blockType: "drill", durationMinutes: 8, pillars: ["TECHNIQUE"], skillIds: ["B1_SWING_MOTION", "B1_CONTACT"], coachInstructions: "Show forehand motion, swing low to high. Hit foam balls off tee.", playerInstructions: "Swing like a rainbow! Low to HIGH!" },
      { name: "Hit Over Net", blockType: "drill", durationMinutes: 8, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["B1_HITS_OVER_NET", "B1_DIRECTION"], coachInstructions: "Hand-feed from close, hit over mini net. Celebrate success!", playerInstructions: "Hit it OVER the net! You can do it!" },
      { name: "Rally Count", blockType: "game", durationMinutes: 8, pillars: ["TECHNIQUE", "MENTAL"], skillIds: ["B1_RALLY_2", "B1_FOCUS"], coachInstructions: "Coach feeds, count how many returns. Target: 2-3 hits in a row.", playerInstructions: "Let's count! 1... 2... 3... NEW RECORD!" },
      { name: "Mini Match", blockType: "game", durationMinutes: 8, pillars: ["MATCH", "SOCIAL"], skillIds: ["B1_PLAYS_GAME", "B1_SPORTSMANSHIP"], coachInstructions: "First to 3 points wins. Focus on fun and trying. Shake hands after.", playerInstructions: "Play a game! First to 3! Shake hands at the end!" },
      { name: "Ready Review", blockType: "cooldown", durationMinutes: 3, pillars: ["MENTAL", "SOCIAL"], skillIds: ["B1_KNOWS_PROGRESS", "B1_CELEBRATES"], coachInstructions: "Review skills learned, talk about 'getting ready for RED ball'.", playerInstructions: "You're almost ready for RED ball! So proud of you!" },
    ],
  },
  {
    id: "TPL_BLUE_READY_SKILLS",
    levelId: "BLUE_1",
    name: "Skills Showcase",
    description: "Demonstrating readiness for Red Ball progression",
    focus: "technique",
    durationMinutes: 40,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "toddlers",
    tags: ["skills", "assessment", "blue-ball", "ready", "ages-3-4"],
    blocks: [
      { name: "Champion Warm-up", blockType: "warmup", durationMinutes: 5, pillars: ["PHYSICAL", "MENTAL"], skillIds: ["B1_INDEPENDENT_WARMUP", "B1_FOLLOWS_ROUTINE"], coachInstructions: "Let kids lead parts of warm-up. Build independence.", playerInstructions: "Show me YOUR warm-up! You're the leader!" },
      { name: "Throw & Catch Check", blockType: "drill", durationMinutes: 6, pillars: ["TECHNIQUE", "PHYSICAL"], skillIds: ["B1_THROW_ACCURATE", "B1_CATCH_CONSISTENT"], coachInstructions: "Test throw accuracy and catching. Count successes.", playerInstructions: "Throw to me! Catch from me! Show your best!" },
      { name: "Racket Control Check", blockType: "drill", durationMinutes: 7, pillars: ["TECHNIQUE"], skillIds: ["B1_RACKET_CONTROL", "B1_BALANCE_WALK"], coachInstructions: "Balance ball on racket, walk course. Measure control.", playerInstructions: "Walk the whole way without dropping! You can do it!" },
      { name: "Hitting Station", blockType: "drill", durationMinutes: 8, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["B1_HITS_FORWARD", "B1_HITS_OVER_NET"], coachInstructions: "Hit from tee, hit hand-feeds. Count successful hits over net.", playerInstructions: "Hit them all over! Show me your power!" },
      { name: "Game Situation", blockType: "game", durationMinutes: 8, pillars: ["MATCH", "MENTAL"], skillIds: ["B1_PLAYS_POINTS", "B1_UNDERSTANDS_SCORING"], coachInstructions: "Play points, introduce simple scoring. Check game understanding.", playerInstructions: "Play for points! You got this!" },
      { name: "Celebration & Next Steps", blockType: "cooldown", durationMinutes: 6, pillars: ["SOCIAL", "MENTAL"], skillIds: ["B1_READY_NEXT", "B1_CONFIDENT"], coachInstructions: "Celebrate progress, discuss RED ball. Certificate if ready!", playerInstructions: "You're amazing! Ready for RED ball soon!" },
    ],
  },

  // =============================================================================
  // RED BALL TEMPLATES
  // =============================================================================
  {
    id: "TPL_RED_FUNDAMENTALS",
    levelId: "RED_3",
    name: "Red Ball Fundamentals",
    description: "Introduction to basic strokes and court awareness",
    focus: "technique",
    durationMinutes: 45,
    minPlayers: 2,
    maxPlayers: 6,
    ageGroup: "kids",
    tags: ["beginner", "fundamentals", "red-ball"],
    blocks: [
      { name: "Active Warm-up", blockType: "warmup", durationMinutes: 8, pillars: ["PHYSICAL"], coachInstructions: "Ball handling games, light running, stretching", playerInstructions: "Follow the leader with your racket!" },
      { name: "Forehand Contact Drill", blockType: "drill", durationMinutes: 10, pillars: ["TECHNIQUE"], skillIds: ["SK_RED_FH_CONTACT"], coachInstructions: "Focus on racket face angle and contact point. Use hand-feed.", playerInstructions: "Hit the ball in front of you like a high-five!" },
      { name: "Rally Game", blockType: "game", durationMinutes: 12, pillars: ["TECHNIQUE", "MENTAL"], skillIds: ["SK_RED_RALLY_3"], coachInstructions: "Count successful rallies. Celebrate progress.", playerInstructions: "How many can you get? Try to beat your record!" },
      { name: "Fun Match", blockType: "game", durationMinutes: 10, pillars: ["MATCH", "SOCIAL"], coachInstructions: "Short tiebreak format. Focus on having fun.", playerInstructions: "Play a mini match with your friend!" },
      { name: "Cool Down", blockType: "cooldown", durationMinutes: 5, pillars: ["PHYSICAL", "MENTAL"], coachInstructions: "Gentle stretching, review session highlights", playerInstructions: "What did you learn today?" },
    ],
  },
  {
    id: "TPL_RED_RALLY_MASTER",
    levelId: "RED_2",
    name: "Rally Master Session",
    description: "Building consistent rally skills",
    focus: "technique",
    durationMinutes: 60,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "kids",
    tags: ["rally", "consistency", "red-ball"],
    blocks: [
      { name: "Dynamic Warm-up", blockType: "warmup", durationMinutes: 10, pillars: ["PHYSICAL"], coachInstructions: "Agility ladder, side shuffles, racket swings", playerInstructions: "Get your body ready to move!" },
      { name: "Forehand Cross-court", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE"], skillIds: ["SK_RED_FH_CROSSCOURT"], coachInstructions: "Emphasis on footwork and recovery", playerInstructions: "Send the ball to the corner!" },
      { name: "Backhand Introduction", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE"], skillIds: ["SK_RED_BH_CONTACT"], coachInstructions: "Two-hand grip, sideways stance", playerInstructions: "Use both hands for power!" },
      { name: "Rally Challenge", blockType: "game", durationMinutes: 15, pillars: ["TECHNIQUE", "MENTAL"], skillIds: ["SK_RED_RALLY_5"], coachInstructions: "Target 5+ rallies. Track personal bests.", playerInstructions: "Can you get 5 in a row?" },
      { name: "Mini Tournament", blockType: "game", durationMinutes: 8, pillars: ["MATCH"], coachInstructions: "Quick rotational matches", playerInstructions: "Play and shake hands!" },
      { name: "Review & Stretch", blockType: "cooldown", durationMinutes: 3, pillars: ["MENTAL"], coachInstructions: "Discuss goals for next session", playerInstructions: "What will you practice at home?" },
    ],
  },
  {
    id: "TPL_RED_SERVE_INTRO",
    levelId: "RED_1",
    name: "Serve Introduction",
    description: "Learning the underhand and overhand serve",
    focus: "technique",
    durationMinutes: 60,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "kids",
    tags: ["serve", "technique", "red-ball"],
    blocks: [
      { name: "Movement Warm-up", blockType: "warmup", durationMinutes: 8, pillars: ["PHYSICAL"], coachInstructions: "Shadow swings, throwing motions", playerInstructions: "Pretend to throw a ball over a fence!" },
      { name: "Underhand Serve", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE"], skillIds: ["SK_RED_SERVE_UNDER"], coachInstructions: "Focus on consistent toss and contact", playerInstructions: "Bowl the ball over the net!" },
      { name: "Overhand Trophy Position", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE"], skillIds: ["SK_RED_SERVE_TROPHY"], coachInstructions: "Freeze at trophy position, check balance", playerInstructions: "Reach for the sky like a superhero!" },
      { name: "Serve & Rally Game", blockType: "game", durationMinutes: 15, pillars: ["TECHNIQUE", "MATCH"], coachInstructions: "Underhand serve to start point, then rally", playerInstructions: "Start the point and keep it going!" },
      { name: "Serve Target Practice", blockType: "drill", durationMinutes: 10, pillars: ["TECHNIQUE", "MENTAL"], coachInstructions: "Targets in service box, celebrate hits", playerInstructions: "Aim for the cones!" },
      { name: "Cool Down", blockType: "cooldown", durationMinutes: 3, pillars: ["MENTAL"], coachInstructions: "Review serve progress", playerInstructions: "Show your best serve motion!" },
    ],
  },
  // ORANGE BALL TEMPLATES
  {
    id: "TPL_ORANGE_TRANSITION",
    levelId: "ORANGE_3",
    name: "Orange Ball Transition",
    description: "Adapting to the larger court and faster ball",
    focus: "technique",
    durationMinutes: 60,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "kids",
    tags: ["transition", "orange-ball", "court-coverage"],
    blocks: [
      { name: "Court Exploration", blockType: "warmup", durationMinutes: 10, pillars: ["PHYSICAL", "TACTICAL"], coachInstructions: "Run to different court zones, touch lines", playerInstructions: "Learn your new bigger court!" },
      { name: "Deeper Groundstrokes", blockType: "drill", durationMinutes: 15, pillars: ["TECHNIQUE"], skillIds: ["SK_ORANGE_FH_DEPTH"], coachInstructions: "Target past service line", playerInstructions: "Hit the ball deep!" },
      { name: "Movement Patterns", blockType: "drill", durationMinutes: 12, pillars: ["PHYSICAL", "TECHNIQUE"], skillIds: ["SK_ORANGE_FOOTWORK"], coachInstructions: "Split step, recovery steps", playerInstructions: "Quick feet back to base!" },
      { name: "Cross-court Rally", blockType: "game", durationMinutes: 13, pillars: ["TECHNIQUE", "TACTICAL"], coachInstructions: "Count cross-court rallies only", playerInstructions: "Keep it cross-court!" },
      { name: "Match Play", blockType: "game", durationMinutes: 8, pillars: ["MATCH"], coachInstructions: "Tiebreak format", playerInstructions: "Use what you learned!" },
      { name: "Stretch & Review", blockType: "cooldown", durationMinutes: 2, pillars: ["MENTAL"], coachInstructions: "What was different about orange ball?", playerInstructions: "How does the bigger court feel?" },
    ],
  },
  {
    id: "TPL_ORANGE_RALLY_BUILDER",
    levelId: "ORANGE_2",
    name: "Rally Builder",
    description: "Extending rallies and building consistency",
    focus: "tactical",
    durationMinutes: 60,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "juniors",
    tags: ["rally", "consistency", "orange-ball"],
    blocks: [
      { name: "Dynamic Stretching", blockType: "warmup", durationMinutes: 8, pillars: ["PHYSICAL"], coachInstructions: "Lunges, arm circles, mini-tennis", playerInstructions: "Get loose and ready!" },
      { name: "Height Over Net", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["SK_ORANGE_RALLY_HEIGHT"], coachInstructions: "2-3 feet over net for margin", playerInstructions: "High and safe over the net!" },
      { name: "Direction Control", blockType: "drill", durationMinutes: 12, pillars: ["TACTICAL"], skillIds: ["SK_ORANGE_DIRECTION"], coachInstructions: "Alternate cross-court and down-the-line", playerInstructions: "You choose where it goes!" },
      { name: "Rally Targets", blockType: "game", durationMinutes: 15, pillars: ["TECHNIQUE", "MENTAL"], coachInstructions: "Target 10+ rally count", playerInstructions: "Can you reach 10?" },
      { name: "Competitive Games", blockType: "game", durationMinutes: 10, pillars: ["MATCH", "SOCIAL"], coachInstructions: "King of the court rotation", playerInstructions: "Win and stay on!" },
      { name: "Review", blockType: "cooldown", durationMinutes: 3, pillars: ["MENTAL"], coachInstructions: "Celebrate rally improvements", playerInstructions: "What's your new record?" },
    ],
  },
  // GREEN BALL TEMPLATES
  {
    id: "TPL_GREEN_FULL_COURT",
    levelId: "GREEN_3",
    name: "Full Court Introduction",
    description: "Transitioning to the full court",
    focus: "tactical",
    durationMinutes: 60,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "juniors",
    tags: ["full-court", "green-ball", "transition"],
    blocks: [
      { name: "Baseline Movement", blockType: "warmup", durationMinutes: 10, pillars: ["PHYSICAL"], coachInstructions: "Sideline to sideline, recovery runs", playerInstructions: "Cover the whole baseline!" },
      { name: "Depth Control", blockType: "drill", durationMinutes: 15, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["SK_GREEN_DEPTH"], coachInstructions: "Target deep boxes", playerInstructions: "Push them back!" },
      { name: "Serve from Baseline", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE"], skillIds: ["SK_GREEN_SERVE"], coachInstructions: "Full motion from baseline", playerInstructions: "Big serve from far back!" },
      { name: "Point Construction", blockType: "game", durationMinutes: 13, pillars: ["TACTICAL", "MATCH"], coachInstructions: "Rally 3+ then play point", playerInstructions: "Build the point, then attack!" },
      { name: "Practice Match", blockType: "game", durationMinutes: 8, pillars: ["MATCH"], coachInstructions: "Short set to 4 games", playerInstructions: "Play for real!" },
      { name: "Cool Down", blockType: "cooldown", durationMinutes: 2, pillars: ["MENTAL"], coachInstructions: "Discuss full court strategy", playerInstructions: "What's your game plan?" },
    ],
  },
  // YELLOW BALL TEMPLATES
  {
    id: "TPL_YELLOW_MATCH_READY",
    levelId: "YELLOW_3",
    name: "Match Ready Session",
    description: "Preparing for competitive play",
    focus: "match_play",
    durationMinutes: 90,
    minPlayers: 2,
    maxPlayers: 4,
    ageGroup: "teens",
    tags: ["match-play", "competition", "yellow-ball"],
    blocks: [
      { name: "Match Warm-up Routine", blockType: "warmup", durationMinutes: 12, pillars: ["PHYSICAL", "MENTAL"], coachInstructions: "Simulate pre-match warm-up", playerInstructions: "Warm up like before a real match!" },
      { name: "Serve Patterns", blockType: "drill", durationMinutes: 15, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["SK_YELLOW_SERVE_PATTERNS"], coachInstructions: "Wide, body, T serves", playerInstructions: "Keep them guessing!" },
      { name: "Return of Serve", blockType: "drill", durationMinutes: 12, pillars: ["TECHNIQUE", "TACTICAL"], skillIds: ["SK_YELLOW_RETURN"], coachInstructions: "Block return, aggressive return", playerInstructions: "Neutralize or attack!" },
      { name: "Pressure Situations", blockType: "game", durationMinutes: 15, pillars: ["MENTAL", "MATCH"], coachInstructions: "30-30, 40-40 scenarios", playerInstructions: "Stay calm under pressure!" },
      { name: "Practice Sets", blockType: "game", durationMinutes: 30, pillars: ["MATCH"], coachInstructions: "Full set with coaching between games", playerInstructions: "Play your best tennis!" },
      { name: "Match Analysis", blockType: "cooldown", durationMinutes: 6, pillars: ["MENTAL", "TACTICAL"], coachInstructions: "Review key moments, patterns", playerInstructions: "What worked? What didn't?" },
    ],
  },
];

const ROLE_MESSAGE_TEMPLATES = [
  {
    templateKey: "feedback_effort_high",
    category: "feedback",
    coachMessage: "Player showed excellent effort and work rate throughout the session. Consistent intensity in all drills.",
    playerMessage: "Amazing work today! You gave 100% effort and it really showed! Keep up that energy!",
    parentMessage: "{playerName} showed fantastic effort today! They worked hard in every drill and gave their best. We're proud of their dedication!",
    placeholders: ["{playerName}"],
  },
  {
    templateKey: "feedback_effort_medium",
    category: "feedback",
    coachMessage: "Player maintained steady effort with some variation in intensity. Room for more consistent engagement.",
    playerMessage: "Good session today! You worked well, and with a bit more focus you'll be even better!",
    parentMessage: "{playerName} had a productive session today. They showed good effort and are continuing to develop their skills.",
    placeholders: ["{playerName}"],
  },
  {
    templateKey: "feedback_technique_improved",
    category: "feedback",
    coachMessage: "Notable technical improvement observed. Stroke mechanics showing better consistency and form.",
    playerMessage: "Your technique is getting better! That practice is paying off! Keep working on it!",
    parentMessage: "{playerName} is making great progress with their technique. Their coach noticed real improvement in their strokes today!",
    placeholders: ["{playerName}"],
  },
  {
    templateKey: "level_up_celebration",
    category: "celebration",
    coachMessage: "Player has successfully completed all requirements for {fromLevel} and is ready to progress to {toLevel}.",
    playerMessage: "CONGRATULATIONS! You've leveled up to {toLevel}! You worked SO hard for this - you should be proud!",
    parentMessage: "Exciting news! {playerName} has officially moved up from {fromLevel} to {toLevel}! This is a big achievement that shows their dedication and progress. Congratulations!",
    placeholders: ["{playerName}", "{fromLevel}", "{toLevel}"],
  },
  {
    templateKey: "trial_started",
    category: "progress",
    coachMessage: "Trial period initiated for {toLevel}. Player will be evaluated over 14 days on gate tests and match performance.",
    playerMessage: "You're starting your trial for {toLevel}! This is your chance to show what you can do! You have 14 days - you got this!",
    parentMessage: "{playerName} has started their trial period for {toLevel}! Over the next 14 days, they'll be working towards their level-up. We'll keep you updated on their progress!",
    placeholders: ["{playerName}", "{toLevel}"],
  },
  {
    templateKey: "session_reminder",
    category: "notification",
    coachMessage: "Session scheduled: {sessionName} at {time}. {playerCount} players confirmed.",
    playerMessage: "Don't forget! You have tennis at {time} today! Get your racket ready!",
    parentMessage: "Reminder: {playerName} has tennis practice at {time} today ({sessionName}). Please ensure they have their equipment ready!",
    placeholders: ["{playerName}", "{sessionName}", "{time}", "{playerCount}"],
  },
  {
    templateKey: "skill_achieved",
    category: "progress",
    coachMessage: "Player has achieved mastery of {skillName} (scored 2 consistently).",
    playerMessage: "You nailed it! You've mastered {skillName}! That's one more skill in the bag!",
    parentMessage: "Great news! {playerName} has mastered a new skill: {skillName}! Their hard work is really showing!",
    placeholders: ["{playerName}", "{skillName}"],
  },
  {
    templateKey: "match_result_win",
    category: "feedback",
    coachMessage: "Match won {score}. Good execution of game plan. Areas to build on: {areas}.",
    playerMessage: "What a win! {score}! You played smart and stayed focused. Keep that winning mentality!",
    parentMessage: "{playerName} won their match today ({score})! They showed great sportsmanship and skill. Well done!",
    placeholders: ["{playerName}", "{score}", "{areas}"],
  },
  {
    templateKey: "match_result_loss",
    category: "feedback",
    coachMessage: "Match lost {score}. Learning opportunities identified: {areas}. Good competitive effort.",
    playerMessage: "Tough match today ({score}), but you learned a lot! Every match makes you better. We'll work on {areas} next time!",
    parentMessage: "{playerName}'s match today was a learning experience ({score}). They competed well and their coach identified some great areas to work on. Every match is part of the journey!",
    placeholders: ["{playerName}", "{score}", "{areas}"],
  },
];

export async function seedLessonTemplates() {
  console.log("[Seed] Starting lesson templates seed...");
  
  try {
    // Seed lesson templates with drill blocks
    for (const template of LESSON_TEMPLATES) {
      const { blocks, ...templateData } = template;
      
      // Insert template
      await db.insert(lessonTemplates).values({
        ...templateData,
      }).onConflictDoUpdate({
        target: lessonTemplates.id,
        set: {
          name: templateData.name,
          description: templateData.description,
          focus: templateData.focus,
          durationMinutes: templateData.durationMinutes,
          tags: templateData.tags,
        },
      });
      
      // Insert drill blocks
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const blockId = `${template.id}_BLOCK_${i + 1}`;
        
        await db.insert(drillBlocks).values({
          id: blockId,
          templateId: template.id,
          name: block.name,
          blockType: block.blockType,
          orderIndex: i,
          durationMinutes: block.durationMinutes,
          pillars: block.pillars,
          skillIds: block.skillIds || [],
          coachInstructions: block.coachInstructions,
          playerInstructions: block.playerInstructions,
        }).onConflictDoNothing();
      }
      
      console.log(`[Seed] Created template: ${template.name} with ${blocks.length} blocks`);
    }
    
    // Seed role message templates
    for (const template of ROLE_MESSAGE_TEMPLATES) {
      await db.insert(roleMessageTemplates).values({
        ...template,
        academyId: null, // Global templates
      }).onConflictDoNothing();
    }
    
    console.log(`[Seed] Created ${ROLE_MESSAGE_TEMPLATES.length} role message templates`);
    console.log("[Seed] Lesson templates seed complete!");
    
    return {
      templates: LESSON_TEMPLATES.length,
      blocks: LESSON_TEMPLATES.reduce((sum, t) => sum + t.blocks.length, 0),
      messageTemplates: ROLE_MESSAGE_TEMPLATES.length,
    };
  } catch (error) {
    console.error("[Seed] Error seeding lesson templates:", error);
    throw error;
  }
}
