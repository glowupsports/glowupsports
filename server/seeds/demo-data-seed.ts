import { db } from "../db";
import { eq, and, or, ilike, ne } from "drizzle-orm";
import {
  players,
  users,
  playerConnections,
  communityGroups,
  groupMembers,
  posts,
  playerPillarProgress,
  coaches,
  skillDomains,
  playerSkillState,
} from "@shared/schema";

// Maps pillar names to skill domain names (domain names must match what PillarProgressRings expects when uppercased)
const PILLARS = [
  { name: "TECHNIQUE", domainName: "technique", percentage: 72, icon: "tennisball", color: "#10B981" },
  { name: "TACTICAL", domainName: "tactical", percentage: 65, icon: "bulb-outline", color: "#F59E0B" },
  { name: "PHYSICAL", domainName: "physical", percentage: 78, icon: "fitness", color: "#EF4444" },
  { name: "MENTAL", domainName: "mental", percentage: 58, icon: "flash-outline", color: "#8B5CF6" },
  { name: "SOCIAL", domainName: "social", percentage: 70, icon: "people-outline", color: "#EC4899" },
  { name: "MATCH", domainName: "match", percentage: 55, icon: "trophy-outline", color: "#3B82F6" },
];

export async function seedDemoDataForTheLaw() {
  console.log("[DemoSeed] Starting demo data seed for TheLaw...");
  
  try {
    // Find TheLaw player by ID pattern
    const theLawPlayer = await db.select()
      .from(players)
      .where(ilike(players.id, '%thelaw%'))
      .limit(1);

    if (!theLawPlayer.length) {
      console.log("[DemoSeed] TheLaw player not found by ID pattern, trying name...");
      const playerByName = await db.select()
        .from(players)
        .where(ilike(players.name, '%law%'))
        .limit(1);
      
      if (!playerByName.length) {
        console.log("[DemoSeed] TheLaw player not found");
        return { success: false, error: "TheLaw player not found" };
      }
      theLawPlayer.push(playerByName[0]);
    }

    const playerId = theLawPlayer[0].id;
    const academyId = theLawPlayer[0].academyId;
    const [theLawUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.playerId, playerId))
      .limit(1);
    const userId = theLawUser?.id ?? null;
    console.log("[DemoSeed] Found TheLaw player:", playerId, "academy:", academyId);

    // Find a coach for assessments
    const coachResult = await db.select()
      .from(coaches)
      .where(eq(coaches.academyId, academyId))
      .limit(1);
    
    const coachId = coachResult.length > 0 ? coachResult[0].id : null;
    console.log("[DemoSeed] Found coach:", coachId);

    // Add pillar progress data
    console.log("[DemoSeed] Adding pillar progress data...");
    for (const pillar of PILLARS) {
      const existing = await db.select()
        .from(playerPillarProgress)
        .where(and(
          eq(playerPillarProgress.playerId, playerId),
          eq(playerPillarProgress.pillar, pillar.name)
        ))
        .limit(1);

      // Convert percentage to a 0-2 scale score (e.g., 72% = 1.44)
      const scoreValue = (pillar.percentage / 100) * 2;
      const trend = pillar.percentage > 60 ? "improving" : "stable";

      if (existing.length > 0) {
        await db.update(playerPillarProgress)
          .set({
            currentScore: scoreValue.toFixed(2),
            trend,
            lastSessionDelta: "+",
            lastUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(playerPillarProgress.id, existing[0].id));
      } else {
        await db.insert(playerPillarProgress).values({
          id: `pillar-${playerId}-${pillar.name.toLowerCase()}`,
          playerId,
          pillar: pillar.name,
          currentScore: scoreValue.toFixed(2),
          trend,
          lastSessionDelta: "+",
          lastUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    console.log("[DemoSeed] Pillar progress added");

    // Add player skill state for SkillRadar
    console.log("[DemoSeed] Adding player skill state data...");
    
    // Get existing skill domains
    const existingDomains = await db.select().from(skillDomains);
    console.log("[DemoSeed] Found", existingDomains.length, "existing skill domains");
    
    for (const pillar of PILLARS) {
      // Find matching domain
      let domain = existingDomains.find(d => 
        d.name.toLowerCase() === pillar.domainName.toLowerCase()
      );
      
      // If domain doesn't exist, create it
      if (!domain) {
        const displayName = pillar.domainName.charAt(0).toUpperCase() + pillar.domainName.slice(1);
        const [newDomain] = await db.insert(skillDomains).values({
          id: `domain-${pillar.domainName}`,
          name: pillar.domainName,
          displayName,
          description: `${displayName} skills assessment`,
          icon: pillar.icon,
          color: pillar.color,
          sortOrder: PILLARS.indexOf(pillar),
        }).returning();
        domain = newDomain;
        console.log("[DemoSeed] Created skill domain:", pillar.domainName);
      }
      
      // Check for existing player skill state
      const existingState = await db.select()
        .from(playerSkillState)
        .where(and(
          eq(playerSkillState.playerId, playerId),
          eq(playerSkillState.domainId, domain.id)
        ))
        .limit(1);
      
      const trend = pillar.percentage > 60 ? "improving" : pillar.percentage > 40 ? "stable" : "focus";
      const momentum = pillar.percentage > 70 ? "strong" : pillar.percentage > 50 ? "building" : "slowing";
      const assessmentStatus = pillar.percentage > 70 ? "meets" : pillar.percentage > 50 ? "developing" : "not_yet";
      
      if (existingState.length > 0) {
        await db.update(playerSkillState)
          .set({
            progressValue: pillar.percentage,
            trend,
            momentum,
            confidenceScore: Math.round(pillar.percentage * 0.8),
            assessmentStatus,
            lastAssessmentDate: new Date(),
            lastUpDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
            upCountRecent: Math.floor(pillar.percentage / 15),
            downCountRecent: Math.floor((100 - pillar.percentage) / 30),
            updatedAt: new Date(),
          })
          .where(eq(playerSkillState.id, existingState[0].id));
      } else {
        await db.insert(playerSkillState).values({
          id: `skill-${playerId}-${pillar.domainName}`,
          playerId,
          domainId: domain.id,
          progressValue: pillar.percentage,
          trend,
          momentum,
          confidenceScore: Math.round(pillar.percentage * 0.8),
          assessmentStatus,
          lastAssessmentDate: new Date(),
          lastUpDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          upCountRecent: Math.floor(pillar.percentage / 15),
          downCountRecent: Math.floor((100 - pillar.percentage) / 30),
          isFrozen: false,
          updatedAt: new Date(),
        });
      }
    }
    console.log("[DemoSeed] Player skill state added");

    // Find other players to add as friends
    console.log("[DemoSeed] Finding other players to add as friends...");
    const otherPlayers = await db.select()
      .from(players)
      .where(and(
        eq(players.academyId, academyId),
        ne(players.id, playerId)
      ))
      .limit(5);

    console.log("[DemoSeed] Found", otherPlayers.length, "other players");

    for (const otherPlayer of otherPlayers) {
      const existingConnection = await db.select()
        .from(playerConnections)
        .where(or(
          and(eq(playerConnections.player1Id, playerId), eq(playerConnections.player2Id, otherPlayer.id)),
          and(eq(playerConnections.player1Id, otherPlayer.id), eq(playerConnections.player2Id, playerId))
        ))
        .limit(1);

      if (existingConnection.length === 0) {
        await db.insert(playerConnections).values({
          id: `conn-${playerId}-${otherPlayer.id}`,
          player1Id: playerId,
          player2Id: otherPlayer.id,
          status: "accepted",
          connectionType: Math.random() > 0.5 ? "friend" : "training_partner",
          matchesPlayed: Math.floor(Math.random() * 10) + 1,
          lastPlayedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          acceptedAt: new Date(),
        });
        console.log("[DemoSeed] Added connection with", otherPlayer.name);
      }
    }

    // Create training group
    console.log("[DemoSeed] Creating training group...");
    const existingGroup = await db.select()
      .from(communityGroups)
      .where(and(
        eq(communityGroups.academyId, academyId),
        ilike(communityGroups.name, '%Yellow Ball%')
      ))
      .limit(1);

    let groupId: string;
    if (existingGroup.length > 0) {
      groupId = existingGroup[0].id;
    } else {
      const newGroup = await db.insert(communityGroups).values({
        id: `group-training-${academyId}`,
        academyId,
        name: "Yellow Ball Training Squad",
        description: "Advanced players training together for competition",
        type: "level",
        isPrivate: false,
        allowChat: true,
        allowPosts: true,
        memberCount: 6,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      groupId = newGroup[0].id;
    }

    // Add TheLaw as group member
    if (userId) {
      const existingMember = await db.select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (existingMember.length === 0) {
        await db.insert(groupMembers).values({
          id: `member-${groupId}-${userId}`,
          groupId,
          userId,
          role: "admin",
          notificationsEnabled: true,
          joinedAt: new Date(),
        });
      }
    }

    // Add other players to group
    for (const otherPlayer of otherPlayers.slice(0, 3)) {
      const [otherUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.playerId, otherPlayer.id))
        .limit(1);
      const otherUserId = otherUser?.id;
      if (otherUserId) {
        const existingOtherMember = await db.select()
          .from(groupMembers)
          .where(and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, otherUserId)
          ))
          .limit(1);

        if (existingOtherMember.length === 0) {
          await db.insert(groupMembers).values({
            id: `member-${groupId}-${otherUserId}`,
            groupId,
            userId: otherUserId,
            role: "member",
            notificationsEnabled: true,
            joinedAt: new Date(),
          });
        }
      }
    }
    console.log("[DemoSeed] Training group created/updated");

    // Add social posts
    console.log("[DemoSeed] Adding social posts...");
    if (userId) {
      const existingPosts = await db.select()
        .from(posts)
        .where(eq(posts.authorId, userId))
        .limit(1);

      if (existingPosts.length === 0) {
        const postTexts = [
          "Great training session today! Worked on my backhand and feeling the improvement",
          "Won my first match of the season! Thanks coach for the preparation",
          "Practicing serves before the big tournament next week",
        ];

        for (let i = 0; i < postTexts.length; i++) {
          await db.insert(posts).values({
            id: `post-${userId}-${i}`,
            authorId: userId,
            academyId,
            contextType: i === 1 ? "match" : "training",
            caption: postTexts[i],
            visibility: "academy",
            likesCount: Math.floor(Math.random() * 15) + 3,
            commentsCount: Math.floor(Math.random() * 5),
            createdAt: new Date(Date.now() - i * 2 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(Date.now() - i * 2 * 24 * 60 * 60 * 1000),
          });
        }
      }
    }
    console.log("[DemoSeed] Social posts added");

    console.log("[DemoSeed] Demo data seeded successfully!");
    return { 
      success: true, 
      data: {
        playerId,
        pillarsAdded: PILLARS.length,
        connectionsAdded: otherPlayers.length,
        groupCreated: true,
        postsAdded: 3,
      }
    };

  } catch (error) {
    console.error("[DemoSeed] Error seeding demo data:", error);
    return { success: false, error: String(error) };
  }
}
