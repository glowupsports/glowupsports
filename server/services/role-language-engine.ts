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
import { eq, and, isNull, or } from "drizzle-orm";

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
