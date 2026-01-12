import { Router, Request, Response } from "express";
import { db } from "../db";
import { lessonGroups, lessonGroupMembers, players, playerLevelEvents } from "../../shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

const router = Router();

// GET /api/lesson-groups - Get all lesson groups for an academy
router.get("/", async (req: Request, res: Response) => {
  try {
    const academyId = req.query.academyId as string;
    if (!academyId) {
      return res.status(400).json({ error: "academyId is required" });
    }

    const groups = await db
      .select()
      .from(lessonGroups)
      .where(eq(lessonGroups.academyId, academyId));

    // Get member counts for each group
    const groupsWithCounts = await Promise.all(
      groups.map(async (group) => {
        const members = await db
          .select({ count: sql<number>`count(*)` })
          .from(lessonGroupMembers)
          .where(
            and(
              eq(lessonGroupMembers.groupId, group.id),
              eq(lessonGroupMembers.status, "active")
            )
          );
        return {
          ...group,
          memberCount: Number(members[0]?.count || 0),
        };
      })
    );

    res.json(groupsWithCounts);
  } catch (error) {
    console.error("Error fetching lesson groups:", error);
    res.status(500).json({ error: "Failed to fetch lesson groups" });
  }
});

// POST /api/lesson-groups - Create a new lesson group
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      academyId,
      coachId,
      name,
      description,
      groupType,
      allowedBallLevels,
      minSkillLevel,
      maxSkillLevel,
      minGlowRank,
      maxGlowRank,
      maxPlayers,
    } = req.body;

    if (!academyId || !name) {
      return res.status(400).json({ error: "academyId and name are required" });
    }

    const [newGroup] = await db
      .insert(lessonGroups)
      .values({
        academyId,
        coachId,
        name,
        description,
        groupType: groupType || "youth",
        allowedBallLevels: allowedBallLevels || ["red", "orange", "green", "yellow"],
        minSkillLevel: minSkillLevel || 1,
        maxSkillLevel: maxSkillLevel || 3,
        minGlowRank,
        maxGlowRank,
        maxPlayers: maxPlayers || 8,
      })
      .returning();

    res.status(201).json(newGroup);
  } catch (error) {
    console.error("Error creating lesson group:", error);
    res.status(500).json({ error: "Failed to create lesson group" });
  }
});

// GET /api/lesson-groups/:id - Get a single lesson group with members
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [group] = await db
      .select()
      .from(lessonGroups)
      .where(eq(lessonGroups.id, id));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Get all members with player details
    const members = await db
      .select({
        id: lessonGroupMembers.id,
        playerId: lessonGroupMembers.playerId,
        joinedAt: lessonGroupMembers.joinedAt,
        status: lessonGroupMembers.status,
        playerName: players.name,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        glowRank: players.glowRank,
        isAdult: players.isAdult,
      })
      .from(lessonGroupMembers)
      .innerJoin(players, eq(lessonGroupMembers.playerId, players.id))
      .where(eq(lessonGroupMembers.groupId, id));

    res.json({ ...group, members });
  } catch (error) {
    console.error("Error fetching lesson group:", error);
    res.status(500).json({ error: "Failed to fetch lesson group" });
  }
});

// PUT /api/lesson-groups/:id - Update a lesson group
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db
      .update(lessonGroups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(lessonGroups.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating lesson group:", error);
    res.status(500).json({ error: "Failed to update lesson group" });
  }
});

// DELETE /api/lesson-groups/:id - Delete a lesson group
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // First remove all members
    await db
      .delete(lessonGroupMembers)
      .where(eq(lessonGroupMembers.groupId, id));

    // Then delete the group
    const [deleted] = await db
      .delete(lessonGroups)
      .where(eq(lessonGroups.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting lesson group:", error);
    res.status(500).json({ error: "Failed to delete lesson group" });
  }
});

// POST /api/lesson-groups/:id/members - Add a player to a group
router.post("/:id/members", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    // Check if group exists
    const [group] = await db
      .select()
      .from(lessonGroups)
      .where(eq(lessonGroups.id, id));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if player is already a member
    const existingMember = await db
      .select()
      .from(lessonGroupMembers)
      .where(
        and(
          eq(lessonGroupMembers.groupId, id),
          eq(lessonGroupMembers.playerId, playerId)
        )
      );

    if (existingMember.length > 0) {
      // Reactivate if previously removed
      if (existingMember[0].status === "removed") {
        await db
          .update(lessonGroupMembers)
          .set({ status: "active", joinedAt: new Date() })
          .where(eq(lessonGroupMembers.id, existingMember[0].id));
        return res.json({ success: true, reactivated: true });
      }
      return res.status(400).json({ error: "Player is already a member" });
    }

    // Add the player
    const [member] = await db
      .insert(lessonGroupMembers)
      .values({
        groupId: id,
        playerId,
      })
      .returning();

    res.status(201).json(member);
  } catch (error) {
    console.error("Error adding member to group:", error);
    res.status(500).json({ error: "Failed to add member to group" });
  }
});

// DELETE /api/lesson-groups/:id/members/:playerId - Remove a player from a group
router.delete("/:id/members/:playerId", async (req: Request, res: Response) => {
  try {
    const { id, playerId } = req.params;

    const [updated] = await db
      .update(lessonGroupMembers)
      .set({ status: "removed" })
      .where(
        and(
          eq(lessonGroupMembers.groupId, id),
          eq(lessonGroupMembers.playerId, playerId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing member from group:", error);
    res.status(500).json({ error: "Failed to remove member from group" });
  }
});

// GET /api/lesson-groups/eligible/:playerId - Get groups eligible for a player
router.get("/eligible/:playerId", async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    // Get player details
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    // Get all groups for the player's academy
    const allGroups = await db
      .select()
      .from(lessonGroups)
      .where(
        and(
          eq(lessonGroups.academyId, player.academyId!),
          eq(lessonGroups.isActive, true)
        )
      );

    // Filter groups based on player's level
    const eligibleGroups = allGroups.filter((group) => {
      if (player.isAdult && (group.groupType === "adult" || group.groupType === "mixed")) {
        // Check adult rank range
        if (group.minGlowRank && group.maxGlowRank) {
          const rank = player.glowRank || 9;
          return rank >= group.minGlowRank && rank <= group.maxGlowRank;
        }
        return true;
      }

      if (!player.isAdult && (group.groupType === "youth" || group.groupType === "mixed")) {
        // Check ball level
        const allowedLevels = (group.allowedBallLevels as string[]) || [];
        if (allowedLevels.length > 0 && !allowedLevels.includes(player.ballLevel || "red")) {
          return false;
        }
        // Check skill level
        const skillLevel = player.skillLevel || 1;
        const minSkill = group.minSkillLevel || 1;
        const maxSkill = group.maxSkillLevel || 3;
        return skillLevel >= minSkill && skillLevel <= maxSkill;
      }

      return false;
    });

    res.json(eligibleGroups);
  } catch (error) {
    console.error("Error fetching eligible groups:", error);
    res.status(500).json({ error: "Failed to fetch eligible groups" });
  }
});

// POST /api/players/:id/set-skill-level - Set a player's skill level (coach action)
router.post("/players/:id/set-skill-level", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ballLevel, skillLevel, coachId, reason } = req.body;

    if (!ballLevel || !skillLevel) {
      return res.status(400).json({ error: "ballLevel and skillLevel are required" });
    }

    // Get current player level
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, id));

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    // Determine event type
    const isInitial = !player.ballLevel;
    const eventType = isInitial ? "initial_assignment" : "coach_override";

    // Update player
    const [updated] = await db
      .update(players)
      .set({ ballLevel, skillLevel })
      .where(eq(players.id, id))
      .returning();

    // Create level event for audit trail
    await db.insert(playerLevelEvents).values({
      playerId: id,
      eventType,
      fromBallLevel: player.ballLevel,
      fromSkillLevel: player.skillLevel,
      toBallLevel: ballLevel,
      toSkillLevel: skillLevel,
      actorId: coachId,
      actorType: "coach",
      reason: reason || (isInitial ? "Initial skill level assignment" : "Coach override"),
      status: "applied",
    });

    res.json({
      success: true,
      player: updated,
      compositeLevel: `${ballLevel.toUpperCase()}_${skillLevel}`,
    });
  } catch (error) {
    console.error("Error setting player skill level:", error);
    res.status(500).json({ error: "Failed to set player skill level" });
  }
});

// GET /api/players/by-level - Get players grouped by skill level
router.get("/players/by-level", async (req: Request, res: Response) => {
  try {
    const academyId = req.query.academyId as string;
    if (!academyId) {
      return res.status(400).json({ error: "academyId is required" });
    }

    const allPlayers = await db
      .select()
      .from(players)
      .where(eq(players.academyId, academyId));

    // Group by ball level
    const grouped: Record<string, typeof allPlayers> = {
      red: [],
      orange: [],
      green: [],
      yellow: [],
      adult: [],
      unassigned: [],
    };

    allPlayers.forEach((player) => {
      if (player.isAdult) {
        grouped.adult.push(player);
      } else if (player.ballLevel && grouped[player.ballLevel]) {
        grouped[player.ballLevel].push(player);
      } else {
        grouped.unassigned.push(player);
      }
    });

    // Count per level
    const summary = {
      red: { total: grouped.red.length, levels: { 1: 0, 2: 0, 3: 0 } },
      orange: { total: grouped.orange.length, levels: { 1: 0, 2: 0, 3: 0 } },
      green: { total: grouped.green.length, levels: { 1: 0, 2: 0, 3: 0 } },
      yellow: { total: grouped.yellow.length, levels: { 1: 0, 2: 0, 3: 0 } },
      adult: { total: grouped.adult.length, byRank: {} as Record<number, number> },
      unassigned: { total: grouped.unassigned.length },
    };

    // Count skill levels within each ball level
    ["red", "orange", "green", "yellow"].forEach((level) => {
      grouped[level].forEach((p) => {
        const skill = p.skillLevel || 1;
        (summary[level as keyof typeof summary] as any).levels[skill]++;
      });
    });

    // Count adult ranks
    grouped.adult.forEach((p) => {
      const rank = p.glowRank || 9;
      summary.adult.byRank[rank] = (summary.adult.byRank[rank] || 0) + 1;
    });

    res.json({ players: grouped, summary });
  } catch (error) {
    console.error("Error fetching players by level:", error);
    res.status(500).json({ error: "Failed to fetch players by level" });
  }
});

// GET /api/players/:id/level-history - Get skill level change history for a player
router.get("/players/:id/level-history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const events = await db
      .select()
      .from(playerLevelEvents)
      .where(eq(playerLevelEvents.playerId, id))
      .orderBy(sql`created_at DESC`);

    res.json(events);
  } catch (error) {
    console.error("Error fetching level history:", error);
    res.status(500).json({ error: "Failed to fetch level history" });
  }
});

export default router;
