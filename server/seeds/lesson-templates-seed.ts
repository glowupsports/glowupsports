/**
 * Lesson Templates Seed Data
 * Pre-built lesson structures with drill blocks per level
 */

import { db } from "../db";
import { lessonTemplates, drillBlocks, roleMessageTemplates } from "../../shared/schema";

const LESSON_TEMPLATES = [
  // RED BALL TEMPLATES
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
