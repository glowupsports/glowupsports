import { db } from "../db";
import {
  questTemplates as questTemplatesTable,
  playerQuests as playerQuestsTable,
  dailyQuestSlots as dailyQuestSlotsTable,
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { publishQuestComplete } from "./feed-publisher";

export async function fireQuestEvent(
  playerId: string,
  action: string
): Promise<void> {
  if (!playerId) return;

  try {
    const activeQuests = await db
      .select({
        quest: playerQuestsTable,
        template: questTemplatesTable,
      })
      .from(playerQuestsTable)
      .innerJoin(
        questTemplatesTable,
        eq(playerQuestsTable.questTemplateId, questTemplatesTable.id)
      )
      .where(
        and(
          eq(playerQuestsTable.playerId, playerId),
          eq(playerQuestsTable.status, "active"),
          eq(questTemplatesTable.targetAction, action),
          eq(questTemplatesTable.isActive, true)
        )
      );

    for (const { quest, template } of activeQuests) {
      const newProgress = Math.min(
        (quest.currentProgress || 0) + 1,
        quest.targetProgress
      );
      const isComplete = newProgress >= quest.targetProgress;

      await db
        .update(playerQuestsTable)
        .set({
          currentProgress: newProgress,
          status: isComplete ? "completed" : "active",
          completedAt: isComplete ? new Date() : null,
        })
        .where(eq(playerQuestsTable.id, quest.id));

      if (isComplete) {
        publishQuestComplete(quest.id).catch(() => {});
      }

      if (isComplete && template.questType === "daily") {
        const today = new Date().toISOString().split("T")[0];
        await db
          .update(dailyQuestSlotsTable)
          .set({
            completedCount: sql`completed_count + 1`,
            allCompleted: sql`completed_count + 1 >= 3`,
            bonusUnlocked: sql`completed_count + 1 >= 3`,
          })
          .where(
            and(
              eq(dailyQuestSlotsTable.playerId, playerId),
              eq(dailyQuestSlotsTable.slotDate, today)
            )
          );
      }
    }
  } catch (err) {
    console.error("[QuestEvents] Error firing quest event:", action, err);
  }
}
