/**
 * Role Language Engine
 * 
 * Provides role-specific messaging for coaches, players, and parents.
 * Each role gets appropriately styled content:
 * - Coach: Technical, data-driven language
 * - Player: Fun, encouraging, gamified language
 * - Parent: Informative, progress-focused language
 */

import { db } from "../db";
import { roleMessageTemplates } from "../../shared/schema";
import { eq, and, isNull, or, sql } from "drizzle-orm";

export type RoleType = "coach" | "player" | "parent";

interface MessageContext {
  playerName?: string;
  coachName?: string;
  skillName?: string;
  levelName?: string;
  fromLevel?: string;
  toLevel?: string;
  score?: number;
  sessionDate?: string;
  sessionTime?: string;
  xpEarned?: number;
  badgeEarned?: string;
  progressPercent?: number;
  [key: string]: string | number | undefined;
}

const DEFAULT_TEMPLATES: Record<string, { coach: string; player: string; parent: string }> = {
  skill_achieved: {
    coach: "{playerName} has demonstrated consistent achievement (score 2) on {skillName}. Moving average: {score}/2 across last 3 observations.",
    player: "Amazing! You've mastered {skillName}! Keep up the great work, champion!",
    parent: "{playerName} has successfully achieved the skill '{skillName}'. This is an important milestone in their tennis development.",
  },
  skill_emerging: {
    coach: "{playerName} shows emerging competency (score 1) on {skillName}. Requires additional focus in upcoming sessions.",
    player: "You're getting better at {skillName}! Just a little more practice and you'll master it!",
    parent: "{playerName} is making good progress on '{skillName}'. With continued practice, they should master this skill soon.",
  },
  session_feedback: {
    coach: "Session completed. Technical focus areas addressed: {skillName}. Player engagement: high. Recommend continuing focus on fundamentals.",
    player: "Great session today! You worked really hard on {skillName}. See you next time, superstar!",
    parent: "{playerName} had a productive session today focusing on {skillName}. They showed good effort and engagement throughout.",
  },
  level_up: {
    coach: "{playerName} has successfully promoted from {fromLevel} to {toLevel}. All trial gates passed. Trial period: 14 days.",
    player: "WOW! You did it! You're now a {toLevel} player! That's incredible - you earned {xpEarned} XP!",
    parent: "Congratulations! {playerName} has been promoted from {fromLevel} to {toLevel}. This is a significant achievement in their tennis journey.",
  },
  trial_started: {
    coach: "{playerName} has begun trial period for {toLevel}. 14-day evaluation window. Focus on trial gate requirements.",
    player: "Exciting news! You're trying out for {toLevel}! Show everyone what you can do!",
    parent: "{playerName} has started a trial period for {toLevel}. Over the next 14 days, their coach will evaluate if they're ready for this level.",
  },
  trial_passed: {
    coach: "{playerName} has successfully completed trial for {toLevel}. All requirements met. Promotion confirmed.",
    player: "You passed! You're officially a {toLevel} player now! So proud of you!",
    parent: "Great news! {playerName} has passed their trial and is now officially a {toLevel} player. They worked hard for this!",
  },
  trial_extended: {
    coach: "{playerName} trial extended. Additional time needed to meet requirements. Focus areas identified.",
    player: "You're doing great! We're giving you a bit more time to show your best. Keep practicing!",
    parent: "{playerName}'s trial period has been extended. This gives them more time to meet the requirements. Their coach will continue to support them.",
  },
  session_reminder: {
    coach: "Session with {playerName} scheduled for {sessionDate} at {sessionTime}. Review player's recent progress before session.",
    player: "Tennis time! Your session is on {sessionDate} at {sessionTime}. Get ready to have fun!",
    parent: "Reminder: {playerName} has a tennis session on {sessionDate} at {sessionTime}. Please ensure they arrive on time.",
  },
  progress_update: {
    coach: "{playerName} progress: {progressPercent}% toward {toLevel}. Key areas: technique ({score}), tactical (emerging).",
    player: "You're {progressPercent}% of the way to {toLevel}! Keep going, you're almost there!",
    parent: "{playerName} is {progressPercent}% of the way to reaching {toLevel}. They continue to make steady progress in their development.",
  },
  match_result_win: {
    coach: "{playerName} match result: Win. Performance metrics recorded. Match contributes to promotion requirements.",
    player: "Victory! You won your match! What a star player you are!",
    parent: "Exciting news! {playerName} won their match today. Each match experience helps build their competitive skills.",
  },
  match_result_loss: {
    coach: "{playerName} match result: Loss. Learning opportunities identified. Recommend tactical review in next session.",
    player: "Tough match today, but you played with heart! Every game helps you get better!",
    parent: "{playerName} had a challenging match today. These experiences are valuable for their development and building resilience.",
  },
  evidence_submitted: {
    coach: "Evidence video submitted for {skillName}. Duration: 10 seconds. Awaiting review.",
    player: "Your skill video has been sent! Your coach will check it out soon!",
    parent: "A video of {playerName} demonstrating {skillName} has been submitted for coach review.",
  },
  evidence_approved: {
    coach: "{playerName} evidence for {skillName} approved. Score: {score}/2. Evidence requirement progress updated.",
    player: "Your video was approved! Great job showing off your {skillName} skills!",
    parent: "The video evidence for {playerName}'s {skillName} has been approved by their coach. This contributes to their level progress.",
  },
  // Skill descriptions by pillar
  skill_technique: {
    coach: "Technical skill: {skillName}. Focus on proper form, grip, and execution mechanics.",
    player: "Learn how to {skillName} like a pro! It's all about practice and having fun!",
    parent: "{skillName} is an important technique that helps build the foundation for advanced tennis skills.",
  },
  skill_tactical: {
    coach: "Tactical skill: {skillName}. Court positioning, shot selection, and strategic thinking.",
    player: "This is about being smart on the court! {skillName} helps you win more points!",
    parent: "{skillName} teaches strategic thinking and decision-making during matches.",
  },
  skill_physical: {
    coach: "Physical skill: {skillName}. Conditioning, agility, and movement fundamentals.",
    player: "Get faster and stronger! {skillName} makes you a better athlete!",
    parent: "{skillName} improves physical fitness and athletic ability, essential for tennis success.",
  },
  skill_mental: {
    coach: "Mental skill: {skillName}. Focus, resilience, and competitive mindset development.",
    player: "Stay strong in your head! {skillName} helps you stay calm and focused!",
    parent: "{skillName} develops mental strength and emotional control, vital for competitive play.",
  },
  skill_social: {
    coach: "Social skill: {skillName}. Sportsmanship, teamwork, and court etiquette.",
    player: "Be a great teammate! {skillName} is about being kind and fair on the court!",
    parent: "{skillName} teaches important life skills like respect, fairness, and teamwork.",
  },
  skill_match: {
    coach: "Match skill: {skillName}. Competition readiness and performance under pressure.",
    player: "Get ready for matches! {skillName} helps you play your best when it counts!",
    parent: "{skillName} prepares players for competitive match situations.",
  },
  // Booking and court notifications
  court_booking_confirmed: {
    coach: "Court {courtName} booked for {sessionDate} at {sessionTime}. Player count: {playerCount}.",
    player: "Court booked! See you at {courtName} on {sessionDate} at {sessionTime}! +{xpEarned} XP!",
    parent: "Court {courtName} has been reserved for {sessionDate} at {sessionTime}. Please ensure {playerName} arrives on time.",
  },
  court_booking_cancelled: {
    coach: "Court {courtName} booking cancelled for {sessionDate}. Slot now available.",
    player: "Your booking at {courtName} for {sessionDate} has been cancelled.",
    parent: "The booking at {courtName} for {sessionDate} has been cancelled.",
  },
  open_match_created: {
    coach: "Open match created at {courtName} for {sessionDate} at {sessionTime}. {spotsAvailable} spots available.",
    player: "New open match! Join players at {courtName} on {sessionDate} at {sessionTime}! +{xpEarned} XP if you host!",
    parent: "An open match has been created for {sessionDate}. {playerName} can join to practice with other players.",
  },
  friend_request_sent: {
    coach: "{playerName} sent friend request to {friendName}. Social engagement active.",
    player: "Friend request sent! Hope {friendName} accepts soon!",
    parent: "{playerName} has sent a friend request to another player at the academy.",
  },
  friend_request_accepted: {
    coach: "{playerName} and {friendName} are now connected. Social network expanding.",
    player: "Yay! {friendName} is now your friend! Time to book courts together!",
    parent: "{playerName} is now connected with {friendName}. They can now book courts and play together.",
  },
  // XP and level notifications
  xp_earned: {
    coach: "{playerName} earned {xpEarned} XP. Source: {xpSource}. Total XP: {totalXp}.",
    player: "+{xpEarned} XP! {xpSource} Keep it up, champion!",
    parent: "{playerName} earned {xpEarned} experience points for {xpSource}.",
  },
  feature_unlocked: {
    coach: "{playerName} unlocked feature: {featureName} at level {levelName}.",
    player: "NEW FEATURE UNLOCKED! You can now use {featureName}! Explore it now!",
    parent: "{playerName} has reached level {levelName} and unlocked a new feature: {featureName}.",
  },
  streak_milestone: {
    coach: "{playerName} streak milestone: {streakDays} consecutive days. Engagement metric strong.",
    player: "{streakDays} day streak! You're on fire! Keep the streak alive!",
    parent: "{playerName} has maintained a {streakDays} day activity streak. Great consistency!",
  },
  // Payment and billing
  payment_received: {
    coach: "Payment received from {parentName} for {playerName}. Amount: {amount}. Sessions covered: {sessionCount}.",
    player: "Thanks for your payment! You're all set for your next sessions!",
    parent: "Thank you! Your payment of {amount} for {playerName}'s sessions has been received.",
  },
  payment_due: {
    coach: "Outstanding balance for {playerName}: {amount}. Sessions: {sessionCount}. Follow up recommended.",
    player: "Don't forget - there's a balance for your lessons. Ask your parents about it!",
    parent: "{playerName} has an outstanding balance of {amount} for {sessionCount} sessions. Please arrange payment.",
  },
  // Baseline and assessment
  baseline_completed: {
    coach: "{playerName} baseline completed. Starting level: {levelName}. Skills assessed: {skillCount}.",
    player: "Baseline done! You're starting at {levelName}! Time to level up!",
    parent: "{playerName}'s starting assessment is complete. They begin at {levelName} level.",
  },
  // Welcome and onboarding
  player_welcome: {
    coach: "New player {playerName} added. Age: {age}. Baseline assessment pending.",
    player: "Welcome to the academy! Your tennis adventure starts now! Ready to glow up?",
    parent: "Welcome! {playerName} has been added to the academy. Their coach will conduct an initial assessment soon.",
  },
};

export async function getMessage(
  templateKey: string,
  role: RoleType,
  context: MessageContext,
  academyId?: string | null
): Promise<string> {
  let template = await db
    .select()
    .from(roleMessageTemplates)
    .where(and(
      eq(roleMessageTemplates.templateKey, templateKey),
      academyId 
        ? or(eq(roleMessageTemplates.academyId, academyId), isNull(roleMessageTemplates.academyId))
        : isNull(roleMessageTemplates.academyId),
      eq(roleMessageTemplates.isActive, true)
    ))
    .orderBy(
      sql`CASE WHEN ${roleMessageTemplates.academyId} = ${academyId || ''} THEN 0 ELSE 1 END`
    )
    .limit(1);

  let messageTemplate: string;
  
  if (template.length > 0) {
    const t = template[0];
    messageTemplate = role === "coach" ? t.coachMessage 
                    : role === "player" ? t.playerMessage 
                    : t.parentMessage;
  } else if (DEFAULT_TEMPLATES[templateKey]) {
    messageTemplate = DEFAULT_TEMPLATES[templateKey][role];
  } else {
    return `Message template '${templateKey}' not found`;
  }

  return interpolateMessage(messageTemplate, context);
}

function interpolateMessage(template: string, context: MessageContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = context[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match;
  });
}

export async function getMessagesForAllRoles(
  templateKey: string,
  context: MessageContext,
  academyId?: string | null
): Promise<{ coach: string; player: string; parent: string }> {
  const [coach, player, parent] = await Promise.all([
    getMessage(templateKey, "coach", context, academyId),
    getMessage(templateKey, "player", context, academyId),
    getMessage(templateKey, "parent", context, academyId),
  ]);

  return { coach, player, parent };
}

export function getDefaultTemplates() {
  return DEFAULT_TEMPLATES;
}

export async function seedDefaultTemplates(): Promise<number> {
  let count = 0;
  
  for (const [key, messages] of Object.entries(DEFAULT_TEMPLATES)) {
    const existing = await db
      .select()
      .from(roleMessageTemplates)
      .where(and(
        eq(roleMessageTemplates.templateKey, key),
        isNull(roleMessageTemplates.academyId)
      ));
    
    if (existing.length === 0) {
      const placeholders = extractPlaceholders(messages.coach + messages.player + messages.parent);
      
      await db.insert(roleMessageTemplates).values({
        templateKey: key,
        academyId: null,
        coachMessage: messages.coach,
        playerMessage: messages.player,
        parentMessage: messages.parent,
        placeholders,
        category: getCategoryForKey(key),
        isActive: true,
      });
      count++;
    }
  }
  
  return count;
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{(\w+)\}/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

function getCategoryForKey(key: string): string {
  if (key.includes("feedback") || key.includes("session")) return "feedback";
  if (key.includes("level") || key.includes("trial") || key.includes("progress")) return "progress";
  if (key.includes("match") || key.includes("evidence")) return "activity";
  return "notification";
}
