import { db } from "./db";
import { randomUUID } from "node:crypto";
import { localHHMMToUtc } from "./utils/timezone";
import { eq, and, gte, lte, lt, ne, or, inArray, ilike, sql, count, gt, isNull, isNotNull, type SQL } from "drizzle-orm";
import { desc, asc } from "drizzle-orm";
import {
  // Auth tables
  users,
  type User,
  type InsertUser,
  // Corporate accounts (imported near top to avoid circular issues)
  corporateAccounts,
  corporateMembers,
  corporateCreditTransactions,
  type CorporateAccount,
  type InsertCorporateAccount,
  type CorporateMember,
  type InsertCorporateMember,
  type CorporateCreditTransaction,
  type InsertCorporateCreditTransaction,
  // Multi-academy structure
  academies,
  academyApplications,
  invites,
  joinRequests,
  academyTransferRequests,
  coachInvitations,
  type Academy,
  type AcademyApplication,
  type InsertAcademyApplication,
  type Invite,
  type InsertInvite,
  type JoinRequest,
  type InsertJoinRequest,
  type AcademyTransferRequest,
  type InsertAcademyTransferRequest,
  type CoachInvitation,
  type InsertCoachInvitation,
  // Core tables
  coaches,
  locations,
  courts,
  players,
  packages,
  sessions,
  sessionPlayers,
  playerHolidays,
  sessionFeedback,
  auditLogs,
  offlineQueue,
  playerNotes,
  playerProgress,
  sessionTemplates,
  coachNotifications,
  recurringSeries,
  coachingSeries,
  seriesPlayers,
  type CoachingSeries,
  type InsertCoachingSeries,
  type SeriesPlayer,
  type InsertSeriesPlayer,
  playerSessionCancellations,
  type PlayerSessionCancellation,
  type InsertPlayerSessionCancellation,
  // Progress Engine V2
  skillDomains,
  playerSkillState,
  sessionSkillObservations,
  levelRequirements,
  coachStatsRollup,
  playerProgressFlags,
  domainAssessments,
  xpTransactions,
  // Coach XP System
  coachXpTransactions,
  // Glow Chat System
  conversations,
  conversationParticipants,
  messages,
  messageReactions,
  // Court Preferences System
  coachCourtPreferences,
  coachCourtRules,
  // Location Travel Times
  locationTravelTimes,
  // Player Booking System
  coachAvailability,
  availabilityExceptions,
  coachSettings,
  bookingRequests,
  // Coach Time Blocks
  coachTimeBlocks,
  // Player Social & Matches
  playerMatches,
  playerConnections,
  type PlayerConnection,
  // Player Invites
  playerInvites,
  type PlayerInvite,
  type InsertPlayerInvite,
  // Phase 3: Academy Management
  academySettings,
  academyInvites,
  coachAcademyMemberships,
  coachFreelanceProfiles,
  type CoachFreelanceProfile,
  type InsertCoachFreelanceProfile,
  academyOwnerProfiles,
  // Phase 3: Push Notifications
  pushDeviceTokens,
  notificationPreferences,
  scheduledNotifications,
  // Phase 3: Billing & Payments
  billingAccounts,
  subscriptionPlans,
  subscriptions,
  invoices,
  payments,
  refunds,
  playerSubscriptions,
  packageTemplates,
  type PackageTemplate,
  type InsertPackageTemplate,
  // Session Ratings
  sessionRatings,
  // Coach Review System
  coachReviews,
  reviewResponses,
  reviewFlags,
  reviewPrompts,
  coachReviewStats,
  type CoachReview,
  type InsertCoachReview,
  type ReviewResponse,
  type InsertReviewResponse,
  type ReviewFlag,
  type InsertReviewFlag,
  type ReviewPrompt,
  type InsertReviewPrompt,
  type CoachReviewStats,
  // 3-Layer Pricing System
  academyPricing,
  coachContracts,
  type AcademyPricing,
  type InsertAcademyPricing,
  type CoachContract,
  type InsertCoachContract,
  type InsertCoachReviewStats,
  // Court Booking Marketplace
  courtAvailability,
  courtBookings,
  type CourtAvailability,
  type InsertCourtAvailability,
  type CourtBooking,
  type InsertCourtBooking,
  // Academy types (Academy already imported above)
  type InsertAcademy,
  type Coach,
  type InsertCoach,
  type Location,
  type InsertLocation,
  type Court,
  type InsertCourt,
  type Player,
  type InsertPlayer,
  type Session,
  type InsertSession,
  type SessionPlayer,
  type InsertSessionPlayer,
  type PlayerHoliday,
  type InsertPlayerHoliday,
  type SessionFeedback,
  type InsertSessionFeedback,
  type AuditLog,
  type InsertAuditLog,
  type OfflineQueue,
  type InsertOfflineQueue,
  type PlayerNote,
  type InsertPlayerNote,
  type PlayerProgress,
  type InsertPlayerProgress,
  type Package,
  type InsertPackage,
  type SessionTemplate,
  type InsertSessionTemplate,
  type CoachNotification,
  type InsertCoachNotification,
  // Progress Engine V2 types
  type SkillDomain,
  type InsertSkillDomain,
  type PlayerSkillState,
  type InsertPlayerSkillState,
  type SessionSkillObservation,
  type InsertSessionSkillObservation,
  type LevelRequirement,
  type InsertLevelRequirement,
  type CoachStatsRollup,
  type InsertCoachStatsRollup,
  type PlayerProgressFlag,
  type InsertPlayerProgressFlag,
  type DomainAssessment,
  type InsertDomainAssessment,
  type XpTransaction,
  type InsertXpTransaction,
  type CoachXpTransaction,
  type InsertCoachXpTransaction,
  // Recurring Series types
  type RecurringSeries,
  type InsertRecurringSeries,
  // Glow Chat types
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type Message,
  type InsertMessage,
  type MessageReaction,
  type InsertMessageReaction,
  // Court Preferences types
  type CoachCourtPreference,
  type InsertCoachCourtPreference,
  type CoachCourtRules,
  type InsertCoachCourtRules,
  // Player Booking System types
  type CoachAvailability,
  type InsertCoachAvailability,
  type BookingRequest,
  type InsertBookingRequest,
  // Phase 3 types
  type AcademySettings,
  type InsertAcademySettings,
  type AcademyInvite,
  type InsertAcademyInvite,
  type AcademyOwnerProfile,
  type InsertAcademyOwnerProfile,
  type CoachAcademyMembership,
  type InsertCoachAcademyMembership,
  type PushDeviceToken,
  type InsertPushDeviceToken,
  type NotificationPreference,
  type InsertNotificationPreference,
  type ScheduledNotification,
  type InsertScheduledNotification,
  type BillingAccount,
  type InsertBillingAccount,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  type Subscription,
  type InsertSubscription,
  type Invoice,
  type InsertInvoice,
  type Payment,
  type InsertPayment,
  type Refund,
  type InsertRefund,
  type PlayerSubscription,
  type InsertPlayerSubscription,
  // Coach Payouts
  coachPayouts,
  type CoachPayout,
  type InsertCoachPayout,
  // Platform Config
  platformConfig,
  type PlatformConfig,
  type InsertPlatformConfig,
  // Diagnostics
  diagnosticReports,
  type DiagnosticReport,
  type InsertDiagnosticReport,
  // Parent Portal
  parentPlayerRelations,
  parentSettings,
  paymentReminders,
  coachPaymentRules,
  coachEarnings,
  type ParentPlayerRelation,
  type InsertParentPlayerRelation,
  type ParentSettings,
  type InsertParentSettings,
  type PaymentReminder,
  type InsertPaymentReminder,
  // Credit Transactions
  creditTransactions,
  type CreditTransaction,
  type InsertCreditTransaction,
  // In-Session Feedback
  inSessionFeedback,
  // Player Baselines
  playerBaselines,
  playerBaselineSkillScores,
  playerPillarProgress,
  ballLevels,
  type PlayerBaseline,
  type InsertPlayerBaseline,
  // Deep Assessment
  deepAssessmentSkills,
  playerDeepAssessments,
  type DeepAssessmentSkill,
  type InsertDeepAssessmentSkill,
  type PlayerDeepAssessment,
  type InsertPlayerDeepAssessment,
  // Glow Skills
  glowSkills,
  levelSkills,
  // Booking invites
  bookingInvites,
  bookingInviteGuests,
  // Open matches
  openMatches,
  openMatchSlots,
  matchRequests,
  playerBookingPreferences,
  // Lesson groups
  lessonGroupMembers,
  // Player level events
  playerLevelEvents,
  // Adult glow matches
  adultGlowMatches,
  adultSkillAssessments,
  // Session waitlist & squads
  sessionWaitlist,
  squadMembers,
  // Player gamification
  playerBadges,
  playerTitles,
  playerQuests,
  dailyQuestSlots,
  playerStreaks,
  // Shop
  shopOrders,
  shopOrderItems,
  shopWishlist,
  // Marketplace
  marketplaceListings,
  sellerProfiles,
  // Ball levels & skill scoring
  playerBallLevels,
  playerSkillScores,
  levelTrials,
  sessionSkillFeedback,
  // Match intelligence
  matchLogs,
  skillEvidence,
  levelUpEvents,
  matches,
  matchOpponents,
  matchPlans,
  matchChallenges,
  matchReflections,
  matchPillarScores,
  coachMatchReviews,
  matchTrainingSuggestions,
  // Player XP / level up
  playerXpEvents,
  playerLevelUpCelebrations,
  playerFeatureUnlockHistory,
  // Deep assessment
  deepAssessmentPillarSummaries,
  // Tournaments & ladders
  tournaments,
  tournamentParticipants,
  tournamentMatches,
  ladderPlayers,
  ladderChallenges,
  // Play requests
  playRequests,
  playRequestParticipants,
  // Live matches
  liveMatches,
  // Player notifications
  playerNotifications,
} from "@shared/schema";

export const storage = {
  // ==================== USERS (AUTH) ====================
  async getUserById(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return result[0];
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
    return result[0];
  },

  async checkUsernameExists(username: string): Promise<boolean> {
    const result = await db.select({ id: users.id }).from(users).where(eq(users.username, username.toLowerCase())).limit(1);
    return result.length > 0;
  },

  async createUser(data: { 
    username: string;
    email: string; 
    password: string; 
    role: string; 
    academyId?: string | null; 
    coachId?: string | null; 
    playerId?: string | null; 
  }): Promise<User> {
    const result = await db.insert(users).values({
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      password: data.password,
      role: data.role,
      academyId: data.academyId || null,
      coachId: data.coachId || null,
      playerId: data.playerId || null,
    }).returning();
    return result[0];
  },

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  },

  async updateUserLastLogin(id: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  },

  async getUserByAppleId(appleId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.appleId, appleId));
    return result[0];
  },

  async linkAppleId(userId: string, appleId: string): Promise<User | undefined> {
    const result = await db.update(users).set({ appleId }).where(eq(users.id, userId)).returning();
    return result[0];
  },

  async unlinkAppleId(userId: string): Promise<User | undefined> {
    const result = await db.update(users).set({ appleId: null }).where(eq(users.id, userId)).returning();
    return result[0];
  },

  async getUserByPlayerId(playerId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.playerId, playerId));
    return result[0];
  },

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  },

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  },

  // ==================== ACADEMIES ====================
  async getAcademy(id: string): Promise<Academy | undefined> {
    const result = await db.select().from(academies).where(eq(academies.id, id));
    return result[0];
  },

  async getAcademyBySlug(slug: string): Promise<Academy | undefined> {
    const result = await db.select().from(academies).where(eq(academies.slug, slug));
    return result[0];
  },

  async getAcademyByJoinCode(joinCode: string): Promise<Academy | undefined> {
    const result = await db.select().from(academies).where(eq(academies.joinCode, joinCode.toUpperCase()));
    return result[0];
  },

  async generateJoinCode(academyId: string): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: string;
    let attempts = 0;
    
    do {
      code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.getAcademyByJoinCode(code);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);
    
    await db.update(academies).set({ joinCode: code }).where(eq(academies.id, academyId));
    return code;
  },

  async getAllAcademies(): Promise<Academy[]> {
    return db.select().from(academies);
  },

  async createAcademy(data: InsertAcademy): Promise<Academy> {
    const result = await db.insert(academies).values(data).returning();
    return result[0];
  },

  async updateAcademy(id: string, data: Partial<InsertAcademy>): Promise<Academy | undefined> {
    const result = await db.update(academies).set(data).where(eq(academies.id, id)).returning();
    return result[0];
  },

  async deleteAcademy(id: string): Promise<void> {
    // Delete all related data in proper order to respect foreign key constraints
    // This is a comprehensive cascade delete - all academy data will be permanently removed
    // Wrapped in a transaction for atomicity - if any step fails, all changes are rolled back
    
    await db.transaction(async (tx) => {
      // First, collect all IDs we need for cascade deletion
      const academyCoaches = await tx.select({ id: coaches.id }).from(coaches).where(eq(coaches.academyId, id));
      const coachIds = academyCoaches.map(c => c.id);
      
      const academyPlayers = await tx.select({ id: players.id }).from(players).where(eq(players.academyId, id));
      const playerIds = academyPlayers.map(p => p.id);
      
      const academySessions = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.academyId, id));
      const sessionIds = academySessions.map(s => s.id);
      
      const academyCourts = await tx.select({ id: courts.id }).from(courts).where(eq(courts.academyId, id));
      const courtIds = academyCourts.map(c => c.id);
      
      const academyConversations = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.academyId, id));
      const conversationIds = academyConversations.map(c => c.id);
      
      const academyInvoiceRecords = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.academyId, id));
      const invoiceIds = academyInvoiceRecords.map(i => i.id);
      
      const academyPaymentRecords = await tx.select({ id: payments.id }).from(payments).where(eq(payments.academyId, id));
      const paymentIds = academyPaymentRecords.map(p => p.id);
      
      const academyReviews = await tx.select({ id: coachReviews.id }).from(coachReviews).where(eq(coachReviews.academyId, id));
      const reviewIds = academyReviews.map(r => r.id);
      
      // Get users associated with this academy for parentSettings cleanup
      const academyUsers = await tx.select({ id: users.id }).from(users).where(eq(users.academyId, id));
      const userIds = academyUsers.map(u => u.id);
      
      // Get message IDs for proper reaction cleanup
      const academyMessages = await tx.select({ id: messages.id }).from(messages).where(eq(messages.academyId, id));
      const messageIds = academyMessages.map(m => m.id);
      
      // ===== PHASE 1: Delete deepest nested relationships first =====
      
      // Delete review-related (deepest level)
      if (reviewIds.length > 0) {
        await tx.delete(reviewFlags).where(inArray(reviewFlags.reviewId, reviewIds));
        await tx.delete(reviewResponses).where(inArray(reviewResponses.reviewId, reviewIds));
      }
      if (playerIds.length > 0) {
        await tx.delete(reviewPrompts).where(inArray(reviewPrompts.playerId, playerIds));
      }
      if (coachIds.length > 0) {
        await tx.delete(coachReviewStats).where(inArray(coachReviewStats.coachId, coachIds));
      }
      await tx.delete(coachReviews).where(eq(coachReviews.academyId, id));
      
      // Delete payment-related (refunds depend on payments)
      if (paymentIds.length > 0) {
        await tx.delete(refunds).where(inArray(refunds.paymentId, paymentIds));
      }
      
      // Delete invoice-related (payment reminders depend on invoices)
      if (invoiceIds.length > 0) {
        await tx.delete(paymentReminders).where(inArray(paymentReminders.invoiceId, invoiceIds));
      }
      
      // Delete message-related (reactions depend on messages)
      if (messageIds.length > 0) {
        await tx.delete(messageReactions).where(inArray(messageReactions.messageId, messageIds));
      }
      await tx.delete(messages).where(eq(messages.academyId, id));
      
      // Delete conversation-related
      if (conversationIds.length > 0) {
        await tx.delete(conversationParticipants).where(inArray(conversationParticipants.conversationId, conversationIds));
      }
      await tx.delete(conversations).where(eq(conversations.academyId, id));
      
      // ===== PHASE 2: Delete session-related data =====
      
      if (sessionIds.length > 0) {
        await tx.delete(sessionPlayers).where(inArray(sessionPlayers.sessionId, sessionIds));
        await tx.delete(sessionFeedback).where(inArray(sessionFeedback.sessionId, sessionIds));
        await tx.delete(sessionSkillObservations).where(inArray(sessionSkillObservations.sessionId, sessionIds));
      }
      await tx.delete(playerSessionCancellations).where(eq(playerSessionCancellations.academyId, id));
      await tx.delete(sessions).where(eq(sessions.academyId, id));
      await tx.delete(recurringSeries).where(eq(recurringSeries.academyId, id));
      
      // ===== PHASE 3: Delete court-related data =====
      
      if (courtIds.length > 0) {
        await tx.delete(courtAvailability).where(inArray(courtAvailability.courtId, courtIds));
        await tx.delete(courtBookings).where(inArray(courtBookings.courtId, courtIds));
      }
      // Also delete any court bookings directly by academyId
      await tx.delete(courtBookings).where(eq(courtBookings.academyId, id));
      
      // ===== PHASE 4: Delete coach-related data =====
      
      if (coachIds.length > 0) {
        await tx.delete(coachNotifications).where(inArray(coachNotifications.coachId, coachIds));
        await tx.delete(coachAvailability).where(inArray(coachAvailability.coachId, coachIds));
        await tx.delete(availabilityExceptions).where(inArray(availabilityExceptions.coachId, coachIds));
        await tx.delete(coachCourtPreferences).where(inArray(coachCourtPreferences.coachId, coachIds));
        await tx.delete(coachCourtRules).where(inArray(coachCourtRules.coachId, coachIds));
        await tx.delete(coachSettings).where(inArray(coachSettings.coachId, coachIds));
        await tx.delete(coachXpTransactions).where(inArray(coachXpTransactions.coachId, coachIds));
        await tx.delete(coachStatsRollup).where(inArray(coachStatsRollup.coachId, coachIds));
        await tx.delete(pushDeviceTokens).where(inArray(pushDeviceTokens.coachId, coachIds));
        await tx.delete(notificationPreferences).where(inArray(notificationPreferences.coachId, coachIds));
        await tx.delete(scheduledNotifications).where(inArray(scheduledNotifications.coachId, coachIds));
        await tx.delete(offlineQueue).where(inArray(offlineQueue.coachId, coachIds));
        await tx.delete(sessionTemplates).where(inArray(sessionTemplates.coachId, coachIds));
        await tx.delete(coachEarnings).where(inArray(coachEarnings.coachId, coachIds));
        await tx.delete(coachPaymentRules).where(inArray(coachPaymentRules.coachId, coachIds));
      }
      await tx.delete(coachPayouts).where(eq(coachPayouts.academyId, id));
      
      // ===== PHASE 5: Delete player-related data =====
      
      if (playerIds.length > 0) {
        await tx.delete(playerNotes).where(inArray(playerNotes.playerId, playerIds));
        await tx.delete(playerProgress).where(inArray(playerProgress.playerId, playerIds));
        await tx.delete(playerHolidays).where(inArray(playerHolidays.playerId, playerIds));
        await tx.delete(playerSkillState).where(inArray(playerSkillState.playerId, playerIds));
        await tx.delete(playerProgressFlags).where(inArray(playerProgressFlags.playerId, playerIds));
        await tx.delete(xpTransactions).where(inArray(xpTransactions.playerId, playerIds));
        await tx.delete(domainAssessments).where(inArray(domainAssessments.playerId, playerIds));
        await tx.delete(playerConnections).where(or(
          inArray(playerConnections.player1Id, playerIds),
          inArray(playerConnections.player2Id, playerIds)
        ));
        await tx.delete(playerMatches).where(or(
          inArray(playerMatches.initiatorId, playerIds),
          inArray(playerMatches.receiverId, playerIds)
        ));
        await tx.delete(parentPlayerRelations).where(inArray(parentPlayerRelations.playerId, playerIds));
      }
      
      // ===== PHASE 6: Delete booking and request data =====
      
      await tx.delete(bookingRequests).where(eq(bookingRequests.academyId, id));
      await tx.delete(joinRequests).where(eq(joinRequests.academyId, id));
      await tx.delete(academyTransferRequests).where(or(
        eq(academyTransferRequests.fromAcademyId, id),
        eq(academyTransferRequests.toAcademyId, id)
      ));
      
      // ===== PHASE 7: Delete billing and subscription data =====
      
      await tx.delete(payments).where(eq(payments.academyId, id));
      await tx.delete(invoices).where(eq(invoices.academyId, id));
      await tx.delete(packages).where(eq(packages.academyId, id));
      await tx.delete(packageTemplates).where(eq(packageTemplates.academyId, id));
      await tx.delete(playerSubscriptions).where(eq(playerSubscriptions.academyId, id));
      await tx.delete(subscriptions).where(eq(subscriptions.academyId, id));
      await tx.delete(billingAccounts).where(eq(billingAccounts.academyId, id));
      
      // ===== PHASE 8: Delete academy structure =====
      
      await tx.delete(courts).where(eq(courts.academyId, id));
      await tx.delete(locations).where(eq(locations.academyId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.academyId, id));
      
      // Nullify resolvedBy FK for diagnostic reports before deletion
      // (resolvedBy references users.id which may be users from this academy)
      if (userIds.length > 0) {
        await tx.update(diagnosticReports)
          .set({ resolvedBy: null })
          .where(inArray(diagnosticReports.resolvedBy, userIds));
      }
      await tx.delete(diagnosticReports).where(eq(diagnosticReports.academyId, id));
      
      // ===== PHASE 9: Delete invites and memberships =====
      
      await tx.delete(coachInvitations).where(eq(coachInvitations.academyId, id));
      await tx.delete(invites).where(eq(invites.academyId, id));
      await tx.delete(academyInvites).where(eq(academyInvites.academyId, id));
      await tx.delete(coachAcademyMemberships).where(eq(coachAcademyMemberships.academyId, id));
      await tx.delete(academySettings).where(eq(academySettings.academyId, id));
      await tx.delete(academyOwnerProfiles).where(eq(academyOwnerProfiles.academyId, id));
      
      // ===== PHASE 10: Handle users and parent settings =====
      
      // Delete parent settings for users in this academy
      if (userIds.length > 0) {
        await tx.delete(parentSettings).where(inArray(parentSettings.userId, userIds));
      }
      
      // Nullify user references (don't delete users, just disassociate them)
      if (coachIds.length > 0) {
        await tx.update(users).set({ coachId: null }).where(inArray(users.coachId, coachIds));
      }
      if (playerIds.length > 0) {
        await tx.update(users).set({ playerId: null }).where(inArray(users.playerId, playerIds));
      }
      await tx.update(users).set({ academyId: null }).where(eq(users.academyId, id));
      
      // ===== PHASE 11: Delete players and coaches =====
      
      await tx.delete(players).where(eq(players.academyId, id));
      await tx.delete(coaches).where(eq(coaches.academyId, id));
      
      // ===== PHASE 12: Finally, delete the academy =====
      
      await tx.delete(academies).where(eq(academies.id, id));
    });
  },

  async resetAcademyData(id: string, resetTypes: {
    sessions?: boolean;
    attendance?: boolean;
    payments?: boolean;
    progress?: boolean;
    feedback?: boolean;
    packages?: boolean;
    invoices?: boolean;
    players?: boolean;
  }): Promise<{ deleted: Record<string, number> }> {
    const deleted: Record<string, number> = {};
    
    await db.transaction(async (tx) => {
      const academyPlayers = await tx.select({ id: players.id }).from(players).where(eq(players.academyId, id));
      const playerIds = academyPlayers.map(p => p.id);
      
      const academySessions = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.academyId, id));
      const sessionIds = academySessions.map(s => s.id);
      
      const academyCoaches = await tx.select({ id: coaches.id }).from(coaches).where(eq(coaches.academyId, id));
      const coachIds = academyCoaches.map(c => c.id);
      
      if (resetTypes.feedback && sessionIds.length > 0) {
        await tx.delete(sessionFeedback).where(inArray(sessionFeedback.sessionId, sessionIds));
        if (playerIds.length > 0) {
          const skillDel = await tx.delete(sessionSkillObservations).where(inArray(sessionSkillObservations.playerId, playerIds)).returning();
          deleted.skillObservations = skillDel.length;
        }
        deleted.feedback = sessionIds.length;
      }
      
      if (resetTypes.attendance && sessionIds.length > 0) {
        const attDel = await tx.delete(sessionPlayers).where(and(
          inArray(sessionPlayers.sessionId, sessionIds),
          sql`true`
        )).returning();
        deleted.attendance = attDel.length;
      }
      
      if (resetTypes.progress && playerIds.length > 0) {
        await tx.delete(playerProgress).where(inArray(playerProgress.playerId, playerIds));
        await tx.delete(playerSkillState).where(inArray(playerSkillState.playerId, playerIds));
        await tx.delete(playerProgressFlags).where(inArray(playerProgressFlags.playerId, playerIds));
        await tx.delete(domainAssessments).where(inArray(domainAssessments.playerId, playerIds));
        const xpDel = await tx.delete(xpTransactions).where(inArray(xpTransactions.playerId, playerIds)).returning();
        deleted.progress = xpDel.length;
        
        await tx.update(players)
          .set({ level: 1, totalXp: 0, glowScore: 50 })
          .where(eq(players.academyId, id));
        deleted.playersReset = playerIds.length;
      }
      
      if (resetTypes.packages && playerIds.length > 0) {
        const pkgDel = await tx.delete(packages).where(eq(packages.academyId, id)).returning();
        deleted.packages = pkgDel.length;
      }
      
      if (resetTypes.invoices) {
        const academyInvoiceRecords = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.academyId, id));
        const invoiceIds = academyInvoiceRecords.map(i => i.id);
        if (invoiceIds.length > 0) {
          await tx.delete(paymentReminders).where(inArray(paymentReminders.invoiceId, invoiceIds));
        }
        const invDel = await tx.delete(invoices).where(eq(invoices.academyId, id)).returning();
        deleted.invoices = invDel.length;
      }
      
      if (resetTypes.payments) {
        const academyPaymentRecords = await tx.select({ id: payments.id }).from(payments).where(eq(payments.academyId, id));
        const paymentIds = academyPaymentRecords.map(p => p.id);
        if (paymentIds.length > 0) {
          await tx.delete(refunds).where(inArray(refunds.paymentId, paymentIds));
        }
        const payDel = await tx.delete(payments).where(eq(payments.academyId, id)).returning();
        deleted.payments = payDel.length;
      }
      
      if (resetTypes.sessions && sessionIds.length > 0) {
        await tx.delete(playerSessionCancellations).where(inArray(playerSessionCancellations.sessionId, sessionIds));
        await tx.delete(sessionPlayers).where(inArray(sessionPlayers.sessionId, sessionIds));
        await tx.delete(sessionFeedback).where(inArray(sessionFeedback.sessionId, sessionIds));
        await tx.delete(sessionSkillObservations).where(inArray(sessionSkillObservations.sessionId, sessionIds));
        await tx.delete(playerNotes).where(inArray(playerNotes.sessionId, sessionIds));
        await tx.delete(xpTransactions).where(inArray(xpTransactions.sessionId, sessionIds));
        if (coachIds.length > 0) {
          await tx.delete(coachXpTransactions).where(inArray(coachXpTransactions.sessionId, sessionIds));
          await tx.delete(coachEarnings).where(inArray(coachEarnings.sessionId, sessionIds));
        }
        await tx.update(bookingRequests).set({ sessionId: null }).where(inArray(bookingRequests.sessionId, sessionIds));
        await tx.update(invoices).set({ sessionId: null }).where(inArray(invoices.sessionId, sessionIds));
        const sesDel = await tx.delete(sessions).where(eq(sessions.academyId, id)).returning();
        deleted.sessions = sesDel.length;
      }
      
      if (resetTypes.players && playerIds.length > 0) {
        await tx.delete(playerProgress).where(inArray(playerProgress.playerId, playerIds));
        await tx.delete(playerSkillState).where(inArray(playerSkillState.playerId, playerIds));
        await tx.delete(playerProgressFlags).where(inArray(playerProgressFlags.playerId, playerIds));
        await tx.delete(domainAssessments).where(inArray(domainAssessments.playerId, playerIds));
        await tx.delete(xpTransactions).where(inArray(xpTransactions.playerId, playerIds));
        await tx.delete(sessionSkillObservations).where(inArray(sessionSkillObservations.playerId, playerIds));
        await tx.delete(packages).where(inArray(packages.playerId, playerIds));
        await tx.delete(bookingRequests).where(inArray(bookingRequests.playerId, playerIds));
        await tx.delete(joinRequests).where(inArray(joinRequests.playerId, playerIds));
        await tx.delete(playerNotes).where(inArray(playerNotes.playerId, playerIds));
        await tx.delete(playerHolidays).where(inArray(playerHolidays.playerId, playerIds));
        await tx.delete(playerMatches).where(or(
          inArray(playerMatches.initiatorId, playerIds),
          inArray(playerMatches.receiverId, playerIds)
        ));
        await tx.delete(playerConnections).where(or(
          inArray(playerConnections.player1Id, playerIds),
          inArray(playerConnections.player2Id, playerIds)
        ));
        await tx.delete(messageReactions).where(inArray(messageReactions.reactorPlayerId, playerIds));
        await tx.delete(messages).where(inArray(messages.senderPlayerId, playerIds));
        await tx.delete(conversationParticipants).where(inArray(conversationParticipants.playerId, playerIds));
        await tx.delete(conversations).where(inArray(conversations.playerId, playerIds));
        await tx.delete(courtBookings).where(inArray(courtBookings.playerId, playerIds));
        await tx.delete(academyTransferRequests).where(inArray(academyTransferRequests.playerId, playerIds));
        await tx.delete(parentPlayerRelations).where(inArray(parentPlayerRelations.playerId, playerIds));
        await tx.delete(reviewPrompts).where(inArray(reviewPrompts.playerId, playerIds));
        await tx.delete(coachReviews).where(inArray(coachReviews.playerId, playerIds));
        await tx.delete(sessionPlayers).where(inArray(sessionPlayers.playerId, playerIds));
        await tx.delete(playerSessionCancellations).where(inArray(playerSessionCancellations.playerId, playerIds));
        await tx.delete(paymentReminders).where(inArray(paymentReminders.playerId, playerIds));
        await tx.delete(invoices).where(inArray(invoices.playerId, playerIds));
        await tx.delete(playerSubscriptions).where(inArray(playerSubscriptions.playerId, playerIds));
        await tx.update(payments).set({ playerId: null }).where(inArray(payments.playerId, playerIds));
        await tx.update(users).set({ playerId: null }).where(inArray(users.playerId, playerIds));
        const plaDel = await tx.delete(players).where(eq(players.academyId, id)).returning();
        deleted.players = plaDel.length;
      }
    });
    
    return { deleted };
  },

  async getAcademyResetCounts(academyId: string): Promise<{
    sessions: number;
    attendance: number;
    payments: number;
    progress: number;
    feedback: number;
    packages: number;
    invoices: number;
    players: number;
  }> {
    const [sessionsCount] = await db.select({ count: count() }).from(sessions).where(eq(sessions.academyId, academyId));
    const [playersCount] = await db.select({ count: count() }).from(players).where(eq(players.academyId, academyId));
    const [attendanceCount] = await db.select({ count: count() }).from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(eq(sessions.academyId, academyId));
    const [paymentsCount] = await db.select({ count: count() }).from(payments).where(eq(payments.academyId, academyId));
    const [feedbackCount] = await db.select({ count: count() }).from(sessionFeedback)
      .innerJoin(sessions, eq(sessionFeedback.sessionId, sessions.id))
      .where(eq(sessions.academyId, academyId));
    const [packagesCount] = await db.select({ count: count() }).from(packages).where(eq(packages.academyId, academyId));
    const [invoicesCount] = await db.select({ count: count() }).from(invoices).where(eq(invoices.academyId, academyId));
    
    const academyPlayerIds = await db.select({ id: players.id }).from(players).where(eq(players.academyId, academyId));
    const playerIds = academyPlayerIds.map(p => p.id);
    let progressCount = 0;
    if (playerIds.length > 0) {
      const [xpCount] = await db.select({ count: count() }).from(xpTransactions).where(inArray(xpTransactions.playerId, playerIds));
      progressCount = xpCount?.count || 0;
    }
    
    return {
      sessions: sessionsCount?.count || 0,
      attendance: attendanceCount?.count || 0,
      payments: paymentsCount?.count || 0,
      progress: progressCount,
      feedback: feedbackCount?.count || 0,
      packages: packagesCount?.count || 0,
      invoices: invoicesCount?.count || 0,
      players: playersCount?.count || 0,
    };
  },

  // Get academy public profile with coach count and player count
  async getAcademyPublicProfile(academyId: string) {
    const academy = await db.select().from(academies).where(eq(academies.id, academyId));
    if (!academy[0]) return null;
    
    const coachResult = await db.select({ count: count() }).from(coaches).where(eq(coaches.academyId, academyId));
    const playerResult = await db.select({ count: count() }).from(players).where(eq(players.academyId, academyId));
    const coachList = await db.select({
      id: coaches.id,
      name: coaches.name,
      specialty: coaches.specialty,
      photoUrl: coaches.photoUrl,
      publicQuote: coaches.publicQuote,
      yearsExperience: coaches.yearsExperience,
      specializations: coaches.specializations,
      level: coaches.level,
      bioStatus: coaches.bioStatus,
      showProfileToPlayers: coaches.showProfileToPlayers,
    }).from(coaches).where(and(
      eq(coaches.academyId, academyId),
      eq(coaches.showProfileToPlayers, true),
      eq(coaches.bioStatus, "approved")
    ));

    // Enrich coaches with review stats (averageRating, totalRatings)
    let coachReviewStatsMap: Record<string, { averageRating: string | null; totalReviews: number }> = {};
    if (coachList.length > 0) {
      try {
        const coachIds = coachList.map(c => c.id);
        const statsRows = await db.select({
          coachId: coachReviewStats.coachId,
          averageOverall: coachReviewStats.averageOverall,
          totalReviews: coachReviewStats.totalReviews,
        }).from(coachReviewStats).where(inArray(coachReviewStats.coachId, coachIds));
        for (const s of statsRows) {
          coachReviewStatsMap[s.coachId] = {
            averageRating: s.averageOverall?.toString() ?? null,
            totalReviews: s.totalReviews ?? 0,
          };
        }
      } catch {
        // Review stats not available
      }
    }
    const coachesWithRatings = coachList.map(coach => ({
      ...coach,
      averageRating: coachReviewStatsMap[coach.id]?.averageRating ?? null,
      totalRatings: coachReviewStatsMap[coach.id]?.totalReviews ?? 0,
    }));

    // Public coaching groups — only group sessionType (not private/semi-private)
    // coachingSeries does not have an isPublic column yet, so we use sessionType as proxy.
    const publicGroups = await db.select({
      id: coachingSeries.id,
      title: coachingSeries.title,
      sport: coachingSeries.sport,
      ballLevel: coachingSeries.ballLevel,
      dayOfWeek: coachingSeries.dayOfWeek,
      startTime: coachingSeries.startTime,
      duration: coachingSeries.duration,
      price: coachingSeries.price,
      maxPlayers: coachingSeries.maxPlayers,
      status: coachingSeries.status,
      sessionType: coachingSeries.sessionType,
    }).from(coachingSeries).where(and(
      eq(coachingSeries.academyId, academyId),
      eq(coachingSeries.status, "active"),
      eq(coachingSeries.sessionType, "group") // Only expose public group sessions
    )).limit(10);

    // Active player counts per series
    const groupPlayerCounts: Record<string, number> = {};
    if (publicGroups.length > 0) {
      const seriesIds = publicGroups.map(g => g.id);
      const activeCounts = await db.select({
        seriesId: seriesPlayers.seriesId,
        cnt: count(),
      }).from(seriesPlayers).where(and(
        inArray(seriesPlayers.seriesId, seriesIds),
        eq(seriesPlayers.status, "active")
      )).groupBy(seriesPlayers.seriesId);
      for (const row of activeCounts) {
        groupPlayerCounts[row.seriesId] = row.cnt;
      }
    }

    const publicGroupsWithSpots = publicGroups.map(g => ({
      ...g,
      enrolledCount: groupPlayerCounts[g.id] || 0,
      spotsLeft: g.maxPlayers != null ? Math.max(0, g.maxPlayers - (groupPlayerCounts[g.id] || 0)) : null,
    }));

    // Upcoming public tournaments
    // tournaments.is_public column may not exist yet (Task #498), so we try with it first,
    // then fall back to public-status-only filter.
    interface TournamentRow {
      id: string;
      name: string;
      sport: string;
      startDate: string;
      endDate: string;
      entryFee: string | null;
      status: string;
      spotsTotal: number;
      location: string;
    }
    let upcomingTournaments: TournamentRow[] = [];
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      // Attempt to filter by is_public=true when the column exists
      const rows = await db.execute(sql`
        SELECT id, name, sport, start_date as "startDate", end_date as "endDate",
               entry_fee as "entryFee", status, spots_total as "spotsTotal", location
        FROM tournaments
        WHERE academy_id = ${academyId}
          AND start_date >= ${todayStr}
          AND (is_public IS NULL OR is_public = true)
          AND status IN ('upcoming', 'registration_open', 'in_progress')
        ORDER BY start_date ASC
        LIMIT 5
      `);
      upcomingTournaments = (rows.rows ?? []) as TournamentRow[];
    } catch {
      // is_public column or table issue — skip tournaments gracefully
      upcomingTournaments = [];
    }

    // Trust signals
    const completedSessionsResult = await db.select({ count: count() })
      .from(sessions)
      .where(and(
        eq(sessions.academyId, academyId),
        eq(sessions.status, "completed")
      ));

    return {
      ...academy[0],
      coachCount: coachResult[0]?.count || 0,
      playerCount: playerResult[0]?.count || 0,
      coaches: coachesWithRatings,
      publicGroups: publicGroupsWithSpots,
      upcomingTournaments,
      trustSignals: {
        totalSessions: completedSessionsResult[0]?.count || 0,
        activePlayers: playerResult[0]?.count || 0,
      },
    };
  },

  // ==================== COACH DIRECTORY ====================
  async getCoachesForDirectory(filters?: {
    search?: string;
    specialization?: string;
    city?: string;
    country?: string;
    openToOpportunities?: boolean;
  }) {
    let query = db.select({
      id: coaches.id,
      name: coaches.name,
      specialty: coaches.specialty,
      photoUrl: coaches.photoUrl,
      publicQuote: coaches.publicQuote,
      yearsExperience: coaches.yearsExperience,
      specializations: coaches.specializations,
      languages: coaches.languages,
      level: coaches.level,
      openToOpportunities: coaches.openToOpportunities,
      academyId: coaches.academyId,
    }).from(coaches).where(and(
      eq(coaches.showInDirectory, true),
      eq(coaches.bioStatus, "approved")
    ));
    
    const results = await query;
    
    // Get academy info for each coach
    const coachesWithAcademy = await Promise.all(results.map(async (coach) => {
      if (!coach.academyId) return { ...coach, academyName: null, academyCity: null };
      const academy = await db.select({ name: academies.name, city: academies.city, country: academies.country })
        .from(academies).where(eq(academies.id, coach.academyId));
      return {
        ...coach,
        academyName: academy[0]?.name || null,
        academyCity: academy[0]?.city || null,
        academyCountry: academy[0]?.country || null,
      };
    }));
    
    // Apply filters in memory for simplicity
    let filtered = coachesWithAcademy;
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(search) ||
        c.specialty?.toLowerCase().includes(search) ||
        c.academyName?.toLowerCase().includes(search)
      );
    }
    if (filters?.openToOpportunities) {
      filtered = filtered.filter(c => c.openToOpportunities === true);
    }
    
    return filtered;
  },

  // Get all coaches from an academy for booking wizard (with extended details)
  async getAcademyCoachesForBooking(academyId: string) {
    try {
      // Get all coaches for this academy using full select to avoid field issues
      const academyCoaches = await db.select().from(coaches).where(eq(coaches.academyId, academyId));
      
      // Get session counts and calculate ratings for each coach
      const enrichedCoaches = await Promise.all(academyCoaches.map(async (coach) => {
        try {
          // Count completed sessions only
          const sessionCount = await db.select({ count: count() })
            .from(sessions)
            .where(and(
              eq(sessions.coachId, coach.id),
              eq(sessions.status, 'completed')
            ));
          
          // Calculate average rating from coach reviews using raw SQL for safety
          let avgRating = null;
          let totalReviews = 0;
          try {
            const feedbackResult = await db.execute(
              sql`SELECT AVG(CAST(overall_score AS NUMERIC)) as avg_rating, COUNT(*) as total_reviews 
                  FROM coach_reviews WHERE coach_id = ${coach.id}`
            );
            if (feedbackResult.rows && feedbackResult.rows.length > 0) {
              avgRating = feedbackResult.rows[0].avg_rating;
              totalReviews = Number(feedbackResult.rows[0].total_reviews || 0);
            }
          } catch (reviewError) {
            console.warn(`[CoachBooking] Review query failed for coach ${coach.id}:`, reviewError);
          }
          
          return {
            id: coach.id,
            name: coach.name,
            profilePhotoUrl: coach.photoUrl,
            specialty: coach.specialty,
            yearsExperience: coach.yearsExperience,
            specializations: coach.specializations,
            ballLevels: coach.ballLevels,
            bio: coach.publicQuote,
            certifications: coach.certifications,
            languages: coach.languages,
            hourlyRate: coach.hourlyRate,
            totalSessions: sessionCount[0]?.count || 0,
            rating: avgRating ? Number(avgRating).toFixed(1) : null,
            totalReviews,
            availableForPrivate: true,
            availableForGroup: true,
          };
        } catch (coachError) {
          console.error(`[CoachBooking] Error enriching coach ${coach.id}:`, coachError);
          return {
            id: coach.id,
            name: coach.name,
            profilePhotoUrl: coach.photoUrl,
            specialty: coach.specialty,
            yearsExperience: coach.yearsExperience,
            specializations: coach.specializations,
            ballLevels: coach.ballLevels,
            bio: coach.publicQuote,
            certifications: coach.certifications,
            languages: coach.languages,
            hourlyRate: coach.hourlyRate,
            totalSessions: 0,
            rating: null,
            totalReviews: 0,
            availableForPrivate: true,
            availableForGroup: true,
          };
        }
      }));
      
      return enrichedCoaches;
    } catch (error) {
      console.error("[CoachBooking] getAcademyCoachesForBooking error:", error);
      throw error;
    }
  },


  async getCoachPublicProfile(coachId: string) {
    const coach = await db.select().from(coaches).where(and(
      eq(coaches.id, coachId),
      eq(coaches.showInDirectory, true)
    ));
    if (!coach[0]) return null;
    
    // Get academy info
    let academyInfo = null;
    if (coach[0].academyId) {
      const academy = await db.select({ id: academies.id, name: academies.name, city: academies.city, country: academies.country })
        .from(academies).where(eq(academies.id, coach[0].academyId));
      academyInfo = academy[0] || null;
    }
    
    return {
      ...coach[0],
      academy: academyInfo,
    };
  },

  // ==================== ACADEMY TRANSFER REQUESTS ====================
  async createTransferRequest(data: InsertAcademyTransferRequest): Promise<AcademyTransferRequest> {
    const result = await db.insert(academyTransferRequests).values(data).returning();
    return result[0];
  },

  async getTransferRequest(id: string): Promise<AcademyTransferRequest | undefined> {
    const result = await db.select().from(academyTransferRequests).where(eq(academyTransferRequests.id, id));
    return result[0];
  },

  async getPlayerTransferRequests(playerId: string): Promise<AcademyTransferRequest[]> {
    return db.select().from(academyTransferRequests)
      .where(eq(academyTransferRequests.playerId, playerId))
      .orderBy(desc(academyTransferRequests.createdAt));
  },

  async getAcademyIncomingTransfers(academyId: string): Promise<AcademyTransferRequest[]> {
    return db.select().from(academyTransferRequests)
      .where(and(
        eq(academyTransferRequests.toAcademyId, academyId),
        eq(academyTransferRequests.status, "pending")
      ))
      .orderBy(desc(academyTransferRequests.createdAt));
  },

  async getAcademyOutgoingTransfers(academyId: string): Promise<AcademyTransferRequest[]> {
    return db.select().from(academyTransferRequests)
      .where(and(
        eq(academyTransferRequests.fromAcademyId, academyId),
        eq(academyTransferRequests.status, "pending")
      ))
      .orderBy(desc(academyTransferRequests.createdAt));
  },

  async updateTransferRequest(id: string, data: Partial<AcademyTransferRequest>): Promise<AcademyTransferRequest | undefined> {
    const result = await db.update(academyTransferRequests).set(data).where(eq(academyTransferRequests.id, id)).returning();
    return result[0];
  },

  // ==================== COACH INVITATIONS ====================
  async createCoachInvitation(data: InsertCoachInvitation & { token: string }): Promise<CoachInvitation> {
    const result = await db.insert(coachInvitations).values(data).returning();
    return result[0];
  },

  async getCoachInvitation(id: string): Promise<CoachInvitation | undefined> {
    const result = await db.select().from(coachInvitations).where(eq(coachInvitations.id, id));
    return result[0];
  },

  async getCoachInvitationByToken(token: string): Promise<CoachInvitation | undefined> {
    const result = await db.select().from(coachInvitations).where(eq(coachInvitations.token, token));
    return result[0];
  },

  async getCoachInvitationByEmail(email: string, academyId: string): Promise<CoachInvitation | undefined> {
    const result = await db.select().from(coachInvitations).where(and(
      eq(coachInvitations.email, email.toLowerCase()),
      eq(coachInvitations.academyId, academyId),
      eq(coachInvitations.status, "pending")
    ));
    return result[0];
  },

  async getAcademyCoachInvitations(academyId: string): Promise<CoachInvitation[]> {
    return db.select().from(coachInvitations)
      .where(eq(coachInvitations.academyId, academyId))
      .orderBy(desc(coachInvitations.createdAt));
  },

  async getCoachPendingInvitations(coachId: string): Promise<CoachInvitation[]> {
    return db.select().from(coachInvitations)
      .where(and(
        eq(coachInvitations.coachId, coachId),
        eq(coachInvitations.status, "pending")
      ))
      .orderBy(desc(coachInvitations.createdAt));
  },

  async updateCoachInvitation(id: string, data: Partial<CoachInvitation>): Promise<CoachInvitation | undefined> {
    const result = await db.update(coachInvitations).set(data).where(eq(coachInvitations.id, id)).returning();
    return result[0];
  },

  async deleteCoachInvitation(id: string): Promise<void> {
    await db.delete(coachInvitations).where(eq(coachInvitations.id, id));
  },

  // ==================== ACADEMY APPLICATIONS ====================
  async getAcademyApplication(id: string): Promise<AcademyApplication | undefined> {
    const result = await db.select().from(academyApplications).where(eq(academyApplications.id, id));
    return result[0];
  },

  async getAcademyApplicationByEmail(email: string): Promise<AcademyApplication | undefined> {
    const result = await db.select().from(academyApplications)
      .where(and(eq(academyApplications.email, email.toLowerCase()), eq(academyApplications.status, "pending")));
    return result[0];
  },

  async getAllAcademyApplications(status?: string): Promise<AcademyApplication[]> {
    if (status) {
      return db.select().from(academyApplications)
        .where(eq(academyApplications.status, status))
        .orderBy(desc(academyApplications.createdAt));
    }
    return db.select().from(academyApplications).orderBy(desc(academyApplications.createdAt));
  },

  async createAcademyApplication(data: InsertAcademyApplication): Promise<AcademyApplication> {
    const result = await db.insert(academyApplications).values({
      ...data,
      email: data.email.toLowerCase(),
    }).returning();
    return result[0];
  },

  async updateAcademyApplication(id: string, data: Partial<AcademyApplication>): Promise<AcademyApplication | undefined> {
    const result = await db.update(academyApplications).set(data).where(eq(academyApplications.id, id)).returning();
    return result[0];
  },

  // ==================== INVITES ====================
  async getInvite(id: string): Promise<Invite | undefined> {
    const result = await db.select().from(invites).where(eq(invites.id, id));
    return result[0];
  },

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const upper = token.toUpperCase();
    const result = await db.select().from(invites)
      .where(or(eq(invites.token, token), eq(invites.shortCode, upper)))
      .limit(1);
    return result[0];
  },

  async getCoachInvites(academyId: string): Promise<Invite[]> {
    return db.select().from(invites)
      .where(eq(invites.academyId, academyId))
      .orderBy(desc(invites.createdAt));
  },

  async getInvitesByAcademy(academyId: string): Promise<Invite[]> {
    return db.select().from(invites)
      .where(eq(invites.academyId, academyId))
      .orderBy(desc(invites.createdAt));
  },

  async createInvite(data: InsertInvite): Promise<Invite> {
    const result = await db.insert(invites).values(data).returning();
    return result[0];
  },

  async updateInvite(id: string, data: Partial<Invite>): Promise<Invite | undefined> {
    const result = await db.update(invites).set(data).where(eq(invites.id, id)).returning();
    return result[0];
  },

  async markInviteUsed(id: string, userId: string): Promise<Invite | undefined> {
    const result = await db.update(invites).set({
      usedBy: userId,
      usedAt: new Date(),
    }).where(eq(invites.id, id)).returning();
    return result[0];
  },

  // ==================== JOIN REQUESTS ====================
  async getJoinRequest(id: string): Promise<JoinRequest | undefined> {
    const result = await db.select().from(joinRequests).where(eq(joinRequests.id, id));
    return result[0];
  },

  async getJoinRequestByPlayerAndAcademy(playerId: string, academyId: string): Promise<JoinRequest | undefined> {
    const result = await db.select().from(joinRequests)
      .where(and(eq(joinRequests.playerId, playerId), eq(joinRequests.academyId, academyId)));
    return result[0];
  },

  async getJoinRequestsByPlayer(playerId: string): Promise<JoinRequest[]> {
    return db.select().from(joinRequests)
      .where(eq(joinRequests.playerId, playerId))
      .orderBy(desc(joinRequests.createdAt));
  },

  async getJoinRequestsByAcademy(academyId: string, status?: string): Promise<JoinRequest[]> {
    if (status) {
      return db.select().from(joinRequests)
        .where(and(eq(joinRequests.academyId, academyId), eq(joinRequests.status, status)))
        .orderBy(desc(joinRequests.createdAt));
    }
    return db.select().from(joinRequests)
      .where(eq(joinRequests.academyId, academyId))
      .orderBy(desc(joinRequests.createdAt));
  },

  async createJoinRequest(data: InsertJoinRequest): Promise<JoinRequest> {
    const result = await db.insert(joinRequests).values(data).returning();
    return result[0];
  },

  async updateJoinRequest(id: string, data: Partial<JoinRequest>): Promise<JoinRequest | undefined> {
    const result = await db.update(joinRequests).set(data).where(eq(joinRequests.id, id)).returning();
    return result[0];
  },

  // ==================== COACHES ====================
  async getCoach(id: string, academyId?: string): Promise<Coach | undefined> {
    const conditions = [eq(coaches.id, id)];
    if (academyId) {
      conditions.push(eq(coaches.academyId, academyId));
    }
    const result = await db.select().from(coaches).where(and(...conditions));
    return result[0];
  },

  async getCoachSettings(coachId: string): Promise<any | null> {
    const result = await db.select().from(coachSettings).where(eq(coachSettings.coachId, coachId));
    return result[0] || null;
  },

  async getAllCoaches(academyId?: string): Promise<Coach[]> {
    if (academyId) {
      // Two-part approach: (1) coaches with active membership, (2) legacy coaches (no membership but academy matches)
      // Part 1: Coaches with active membership for this academy
      const withActiveMembership = await db
        .selectDistinct({ coach: coaches })
        .from(coaches)
        .innerJoin(
          coachAcademyMemberships,
          and(
            eq(coachAcademyMemberships.coachId, coaches.id),
            eq(coachAcademyMemberships.academyId, academyId),
            eq(coachAcademyMemberships.isActive, true)
          )
        );
      
      // Part 2: Legacy coaches (academy matches, no membership exists)
      const legacyCoaches = await db
        .select()
        .from(coaches)
        .where(and(
          eq(coaches.academyId, academyId),
          sql`NOT EXISTS (
            SELECT 1 FROM coach_academy_memberships cam 
            WHERE cam.coach_id = coaches.id AND cam.academy_id = ${academyId}
          )`
        ));
      
      // Combine and deduplicate by ID
      const coachMap = new Map<string, Coach>();
      for (const row of withActiveMembership) {
        coachMap.set(row.coach.id, row.coach);
      }
      for (const coach of legacyCoaches) {
        if (!coachMap.has(coach.id)) {
          coachMap.set(coach.id, coach);
        }
      }
      
      return Array.from(coachMap.values());
    }
    // For all coaches (no academy filter), return all coaches
    return db.select().from(coaches);
  },

  async getCoachesByAcademy(academyId: string): Promise<Coach[]> {
    // Two-part approach: (1) coaches with active membership, (2) legacy coaches (no membership but academy matches)
    // Part 1: Coaches with active membership for this academy
    const withActiveMembership = await db
      .selectDistinct({ coach: coaches })
      .from(coaches)
      .innerJoin(
        coachAcademyMemberships,
        and(
          eq(coachAcademyMemberships.coachId, coaches.id),
          eq(coachAcademyMemberships.academyId, academyId),
          eq(coachAcademyMemberships.isActive, true)
        )
      );
    
    // Part 2: Legacy coaches (academy matches, no membership exists)
    const legacyCoaches = await db
      .select()
      .from(coaches)
      .where(and(
        eq(coaches.academyId, academyId),
        sql`NOT EXISTS (
          SELECT 1 FROM coach_academy_memberships cam 
          WHERE cam.coach_id = coaches.id AND cam.academy_id = ${academyId}
        )`
      ));
    
    // Combine and deduplicate by ID
    const coachMap = new Map<string, Coach>();
    for (const row of withActiveMembership) {
      coachMap.set(row.coach.id, row.coach);
    }
    for (const coach of legacyCoaches) {
      if (!coachMap.has(coach.id)) {
        coachMap.set(coach.id, coach);
      }
    }
    
    return Array.from(coachMap.values());
  },

  async createCoach(data: InsertCoach): Promise<Coach> {
    const result = await db.insert(coaches).values(data).returning();
    return result[0];
  },

  async updateCoach(id: string, data: Partial<InsertCoach>, academyId?: string): Promise<Coach | undefined> {
    const conditions = [eq(coaches.id, id)];
    if (academyId) {
      conditions.push(eq(coaches.academyId, academyId));
    }
    const result = await db.update(coaches).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async removeCoachFromAcademy(coachId: string, academyId: string): Promise<boolean> {
    // Verify coach belongs to this academy
    const coach = await db.select().from(coaches).where(
      and(eq(coaches.id, coachId), eq(coaches.academyId, academyId))
    );
    if (coach.length === 0) return false;

    // Check if membership record exists
    const existingMembership = await db.select().from(coachAcademyMemberships).where(
      and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.academyId, academyId)
      )
    );

    if (existingMembership.length > 0) {
      // Update existing membership to inactive
      await db.update(coachAcademyMemberships).set({ 
        isActive: false,
        leftAt: new Date()
      }).where(
        and(
          eq(coachAcademyMemberships.coachId, coachId),
          eq(coachAcademyMemberships.academyId, academyId)
        )
      );
    } else {
      // Create an inactive membership record (for coaches without prior membership)
      await db.insert(coachAcademyMemberships).values({
        id: randomUUID(),
        coachId,
        academyId,
        isActive: false,
        joinedAt: new Date(),
        leftAt: new Date()
      });
    }

    return true;
  },

  async getCoachUpcomingSessions(coachId: string, academyId: string): Promise<Session[]> {
    const now = new Date();
    return db.select().from(sessions).where(
      and(
        eq(sessions.coachId, coachId),
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, now)
      )
    );
  },

  async reassignCoachSessions(fromCoachId: string, toCoachId: string, academyId: string): Promise<number> {
    const now = new Date();
    const result = await db.update(sessions)
      .set({ coachId: toCoachId })
      .where(
        and(
          eq(sessions.coachId, fromCoachId),
          eq(sessions.academyId, academyId),
          gte(sessions.startTime, now)
        )
      )
      .returning();
    return result.length;
  },

  async fullyDeleteCoach(coachId: string, academyId: string): Promise<boolean> {
    // Verify coach belongs to this academy
    const coach = await db.select().from(coaches).where(
      and(eq(coaches.id, coachId), eq(coaches.academyId, academyId))
    );
    if (coach.length === 0) return false;

    try {
      // Pre-batch: Delete availability exceptions before coach availability (FK dependency)
      await db.delete(availabilityExceptions).where(eq(availabilityExceptions.coachId, coachId));
      
      // First batch: Delete all related records in parallel (no dependencies)
      await Promise.all([
        // Coach invitations
        db.delete(coachInvitations).where(eq(coachInvitations.coachId, coachId)),
        // Coach freelance profiles
        db.delete(coachFreelanceProfiles).where(eq(coachFreelanceProfiles.coachId, coachId)),
        // Coach notifications
        db.delete(coachNotifications).where(eq(coachNotifications.coachId, coachId)),
        // Coach stats rollup
        db.delete(coachStatsRollup).where(eq(coachStatsRollup.coachId, coachId)),
        // Coach XP transactions
        db.delete(coachXpTransactions).where(eq(coachXpTransactions.coachId, coachId)),
        // Coach availability (now safe after exceptions deleted)
        db.delete(coachAvailability).where(eq(coachAvailability.coachId, coachId)),
        // Coach court preferences
        db.delete(coachCourtPreferences).where(eq(coachCourtPreferences.coachId, coachId)),
        // Coach court rules
        db.delete(coachCourtRules).where(eq(coachCourtRules.coachId, coachId)),
        // Coach settings
        db.delete(coachSettings).where(eq(coachSettings.coachId, coachId)),
        // Push device tokens
        db.delete(pushDeviceTokens).where(eq(pushDeviceTokens.coachId, coachId)),
        // Notification preferences
        db.delete(notificationPreferences).where(eq(notificationPreferences.coachId, coachId)),
        // Scheduled notifications
        db.delete(scheduledNotifications).where(eq(scheduledNotifications.coachId, coachId)),
        // Offline queue
        db.delete(offlineQueue).where(eq(offlineQueue.coachId, coachId)),
        // Player notes by this coach
        db.delete(playerNotes).where(eq(playerNotes.coachId, coachId)),
        // Player progress entries by this coach
        db.delete(playerProgress).where(eq(playerProgress.coachId, coachId)),
        // Coach time blocks
        db.delete(coachTimeBlocks).where(eq(coachTimeBlocks.coachId, coachId)),
        // Coach payouts
        db.delete(coachPayouts).where(eq(coachPayouts.coachId, coachId)),
        // Coach payment rules
        db.delete(coachPaymentRules).where(eq(coachPaymentRules.coachId, coachId)),
        // Coach earnings
        db.delete(coachEarnings).where(eq(coachEarnings.coachId, coachId)),
        // Location travel times
        db.delete(locationTravelTimes).where(
          and(eq(locationTravelTimes.coachId, coachId), eq(locationTravelTimes.academyId, academyId))
        ),
        // Session skill observations (by coachId)
        db.delete(sessionSkillObservations).where(eq(sessionSkillObservations.coachId, coachId)),
        // Session templates
        db.delete(sessionTemplates).where(eq(sessionTemplates.coachId, coachId)),
        // Recurring series
        db.delete(recurringSeries).where(eq(recurringSeries.coachId, coachId)),
        // Booking requests
        db.delete(bookingRequests).where(eq(bookingRequests.coachId, coachId)),
        // Review prompts
        db.delete(reviewPrompts).where(eq(reviewPrompts.coachId, coachId)),
        // Coach academy membership
        db.delete(coachAcademyMemberships).where(
          and(eq(coachAcademyMemberships.coachId, coachId), eq(coachAcademyMemberships.academyId, academyId))
        ),
        // Domain assessments by this coach
        db.delete(domainAssessments).where(eq(domainAssessments.coachId, coachId)),
      ]);

      // Coaching series batch: Delete series_players first (FK dependency), then coaching_series
      await db.delete(seriesPlayers).where(
        inArray(
          seriesPlayers.seriesId,
          db.select({ id: coachingSeries.id }).from(coachingSeries).where(eq(coachingSeries.coachId, coachId))
        )
      );
      await db.delete(coachingSeries).where(eq(coachingSeries.coachId, coachId));

      // Second batch: Chat related (sequential to avoid FK race conditions)
      // First, get all message IDs sent by this coach
      const coachMessageIds = await db.select({ id: messages.id })
        .from(messages)
        .where(eq(messages.senderCoachId, coachId));
      const messageIdList = coachMessageIds.map(m => m.id);
      
      // Delete reactions: both reactions BY the coach AND reactions ON the coach's messages
      await db.delete(messageReactions).where(eq(messageReactions.reactorCoachId, coachId));
      if (messageIdList.length > 0) {
        await db.delete(messageReactions).where(inArray(messageReactions.messageId, messageIdList));
      }
      
      // Now delete the messages and participants
      await db.delete(messages).where(eq(messages.senderCoachId, coachId));
      await db.delete(conversationParticipants).where(eq(conversationParticipants.coachId, coachId));
      
      // Null out conversations where this coach is the context coach (preserve conversation history)
      await db.update(conversations).set({ coachId: null }).where(eq(conversations.coachId, coachId));

      // Third batch: Review system - first get review IDs, then delete dependents
      const coachReviewIds = await db.select({ id: coachReviews.id })
        .from(coachReviews)
        .where(eq(coachReviews.coachId, coachId));
      const reviewIdList = coachReviewIds.map(r => r.id);
      
      if (reviewIdList.length > 0) {
        await db.delete(reviewResponses).where(inArray(reviewResponses.reviewId, reviewIdList));
        await db.delete(reviewFlags).where(inArray(reviewFlags.reviewId, reviewIdList));
      }
      // Also delete any review responses written BY this coach (different from responses TO their reviews)
      await db.delete(reviewResponses).where(eq(reviewResponses.coachId, coachId));
      await db.delete(coachReviews).where(eq(coachReviews.coachId, coachId));
      await db.delete(coachReviewStats).where(eq(coachReviewStats.coachId, coachId));

      // Fourth batch: Sessions - set coachId to null (keep history but unlink coach)
      await db.update(sessions)
        .set({ coachId: null })
        .where(
          and(eq(sessions.coachId, coachId), eq(sessions.academyId, academyId))
        );
      
      // Null out paidBy reference in coach payouts (for payouts paid by this coach to others)
      await db.update(coachPayouts).set({ paidBy: null }).where(eq(coachPayouts.paidBy, coachId));
      
      // Null out respondedBy reference in booking requests
      await db.update(bookingRequests).set({ respondedBy: null }).where(eq(bookingRequests.respondedBy, coachId));
      
      // Delete invitations where this coach was the inviter (invitedBy is notNull, so can't nullify)
      await db.delete(coachInvitations).where(eq(coachInvitations.invitedBy, coachId));
      
      // Null out academyInvites invitedBy/acceptedBy references (these columns are on academyInvites, not coachAcademyMemberships)
      await db.update(academyInvites).set({ invitedBy: null }).where(eq(academyInvites.invitedBy, coachId));
      await db.update(academyInvites).set({ acceptedBy: null }).where(eq(academyInvites.acceptedBy, coachId));
      
      // Null out payments receivedBy/confirmedBy/rejectedBy references
      await db.update(payments).set({ receivedBy: null }).where(eq(payments.receivedBy, coachId));
      await db.update(payments).set({ confirmedBy: null }).where(eq(payments.confirmedBy, coachId));
      await db.update(payments).set({ rejectedBy: null }).where(eq(payments.rejectedBy, coachId));
      
      // Null out refunds.processedBy reference
      await db.update(refunds).set({ processedBy: null }).where(eq(refunds.processedBy, coachId));
      
      // Null out academies.ownerId if this coach was an academy owner
      await db.update(academies).set({ ownerId: null }).where(eq(academies.ownerId, coachId));

      // Fifth batch: Update players to remove primary coach reference
      await db.update(players)
        .set({ coachId: null })
        .where(
          and(eq(players.coachId, coachId), eq(players.academyId, academyId))
        );

      // Sixth batch: Unlink user from coach profile
      await db.update(users).set({ coachId: null }).where(eq(users.coachId, coachId));

      // Finally: Delete the coach record
      await db.delete(coaches).where(
        and(eq(coaches.id, coachId), eq(coaches.academyId, academyId))
      );

      return true;
    } catch (error) {
      console.error("Error in fullyDeleteCoach transaction:", error);
      throw error;
    }
  },

  // ==================== LOCATIONS ====================
  async getLocation(id: string, academyId?: string): Promise<Location | undefined> {
    const conditions = [eq(locations.id, id)];
    if (academyId) {
      conditions.push(eq(locations.academyId, academyId));
    }
    const result = await db.select().from(locations).where(and(...conditions));
    return result[0];
  },

  async getLocationById(id: string): Promise<Location | undefined> {
    const result = await db.select().from(locations).where(eq(locations.id, id));
    return result[0];
  },

  async getAllLocations(academyId?: string): Promise<Location[]> {
    if (academyId) {
      return db.select().from(locations).where(eq(locations.academyId, academyId));
    }
    return db.select().from(locations);
  },

  async createLocation(data: InsertLocation): Promise<Location> {
    const result = await db.insert(locations).values(data).returning();
    return result[0];
  },

  async updateLocation(id: string, data: Partial<InsertLocation>, academyId?: string): Promise<Location | undefined> {
    const conditions = [eq(locations.id, id)];
    if (academyId) {
      conditions.push(eq(locations.academyId, academyId));
    }
    const result = await db.update(locations).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async deleteLocation(id: string, academyId?: string): Promise<void> {
    const conditions = [eq(locations.id, id)];
    if (academyId) {
      conditions.push(eq(locations.academyId, academyId));
    }
    // First delete related travel times to avoid foreign key constraint violations
    await db.delete(locationTravelTimes).where(
      or(
        eq(locationTravelTimes.fromLocationId, id),
        eq(locationTravelTimes.toLocationId, id)
      )
    );
    await db.delete(locations).where(and(...conditions));
  },

  // ==================== COURTS ====================
  async getCourt(id: string, academyId?: string): Promise<Court | undefined> {
    const conditions = [eq(courts.id, id)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    const result = await db.select().from(courts).where(and(...conditions));
    return result[0];
  },

  async getCourtById(id: string): Promise<Court | undefined> {
    const result = await db.select().from(courts).where(eq(courts.id, id));
    return result[0];
  },

  async getCourtsByLocation(locationId: string, academyId?: string): Promise<Court[]> {
    const conditions = [eq(courts.locationId, locationId)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    return db.select().from(courts).where(and(...conditions)).orderBy(courts.position);
  },

  async getAllCourts(academyId?: string): Promise<Court[]> {
    if (academyId) {
      const results = await db.select().from(courts)
        .where(eq(courts.academyId, academyId))
        .orderBy(courts.position);
      // Sort so courts with locations come first (sorted by locationId), then null locations at end
      return results.sort((a, b) => {
        if (a.locationId && !b.locationId) return -1;
        if (!a.locationId && b.locationId) return 1;
        if (a.locationId && b.locationId && a.locationId !== b.locationId) {
          return a.locationId.localeCompare(b.locationId);
        }
        return (a.position || 0) - (b.position || 0);
      });
    }
    const results = await db.select().from(courts).orderBy(courts.position);
    return results.sort((a, b) => {
      if (a.locationId && !b.locationId) return -1;
      if (!a.locationId && b.locationId) return 1;
      if (a.locationId && b.locationId && a.locationId !== b.locationId) {
        return a.locationId.localeCompare(b.locationId);
      }
      return (a.position || 0) - (b.position || 0);
    });
  },

  async getCourtByName(name: string, academyId: string): Promise<Court | undefined> {
    const result = await db.select().from(courts)
      .where(and(
        eq(courts.academyId, academyId),
        ilike(courts.name, name.trim())
      ));
    return result[0];
  },

  async createCourt(data: InsertCourt): Promise<Court> {
    const result = await db.insert(courts).values(data).returning();
    return result[0];
  },

  async updateCourt(id: string, data: Partial<InsertCourt>, academyId?: string): Promise<Court | undefined> {
    const conditions = [eq(courts.id, id)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    const result = await db.update(courts).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async deleteCourt(id: string, academyId?: string): Promise<void> {
    const conditions = [eq(courts.id, id)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    await db.delete(courts).where(and(...conditions));
  },

  // ==================== PLAYERS ====================
  async getPlayer(id: string, academyId?: string): Promise<Player | undefined> {
    const conditions = [eq(players.id, id)];
    if (academyId) {
      conditions.push(eq(players.academyId, academyId));
    }
    const result = await db.select().from(players).where(and(...conditions));
    return result[0];
  },

  async getPlayerById(id: string): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.id, id));
    return result[0];
  },

  async getAllPlayers(academyId?: string): Promise<Player[]> {
    if (academyId) {
      return db.select().from(players).where(eq(players.academyId, academyId));
    }
    return db.select().from(players);
  },
  
  async getAllPlayersWithCredits(
    academyId?: string,
    statusFilter?: "active" | "inactive" | "pending_payment" | "all",
  ): Promise<(Player & { remainingCredits: number; totalCredits: number; creditsByType: { private: number; group: number; semiPrivate: number }; primaryCreditType: string | null })[]> {
    // Push status filter into SQL instead of in-memory filtering by caller.
    const playerWhere: SQL<unknown>[] = [];
    if (academyId) playerWhere.push(eq(players.academyId, academyId));
    if (statusFilter === "inactive") {
      playerWhere.push(eq(players.status, "inactive"));
    } else if (statusFilter === "pending_payment") {
      playerWhere.push(eq(players.status, "pending_payment"));
    } else if (!statusFilter || statusFilter === "active") {
      // Preserve legacy JS-side filter semantics: rows with NULL status
      // were treated as active (because `null !== 'inactive'` is true in JS).
      // Use OR(IS NULL, status NOT IN (...)) so SQL pushdown matches.
      playerWhere.push(
        or(
          isNull(players.status),
          and(
            ne(players.status, "inactive"),
            ne(players.status, "pending_payment"),
          )!,
        )!,
      );
    }
    const playerList = playerWhere.length > 0
      ? await db.select().from(players).where(and(...playerWhere))
      : await db.select().from(players);

    if (playerList.length === 0) return [];

    const playerIds = playerList.map(p => p.id);

    // Run credit balance fetch and total-credits package fetch in parallel.
    const packageConditions: SQL<unknown>[] = [
      inArray(packages.playerId, playerIds),
      eq(packages.status, "active"),
    ];
    if (academyId) {
      packageConditions.push(eq(packages.academyId, academyId));
    }
    const [balances, activePackages] = await Promise.all([
      this.getPlayersCreditBalances(playerIds),
      db
        .select({
          playerId: packages.playerId,
          totalCredits: packages.totalCredits,
        })
        .from(packages)
        .where(and(...packageConditions)),
    ]);
    
    // Calculate total credits purchased per player
    const totalsByPlayer = new Map<string, number>();
    for (const pkg of activePackages) {
      if (!pkg.playerId) continue;
      totalsByPlayer.set(pkg.playerId, (totalsByPlayer.get(pkg.playerId) || 0) + (Number(pkg.totalCredits) || 0));
    }
    
    return playerList.map(player => {
      const balance = balances[player.id] || { group: 0, semi_private: 0, private: 0, totalDebt: 0, groupDebt: 0, semiPrivateDebt: 0, privateDebt: 0, hasDebt: false, uncoveredGroup: 0, uncoveredSemiPrivate: 0, uncoveredPrivate: 0, netGroup: 0, netSemiPrivate: 0, netPrivate: 0 };
      // Use the helper's pre-computed net values: gross packages remaining
      // minus session_debt ledger minus uncovered attended sessions. This is
      // exactly the formula the player-detail Packages card uses, so the
      // list pill and detail card always show the same number.
      const netGroup = balance.netGroup;
      const netPrivate = balance.netPrivate;
      const netSemiPrivate = balance.netSemiPrivate;
      const byType = { 
        private: netPrivate, 
        group: netGroup, 
        semiPrivate: netSemiPrivate 
      };
      const totalRemaining = netPrivate + netGroup + netSemiPrivate;
      
      // Determine primary credit type (the one with most credits, including negative)
      let primaryType: string | null = null;
      const absPrivate = Math.abs(byType.private);
      const absGroup = Math.abs(byType.group);
      const absSemi = Math.abs(byType.semiPrivate);
      if (absPrivate > 0 || absGroup > 0 || absSemi > 0) {
        if (absPrivate >= absGroup && absPrivate >= absSemi) {
          primaryType = 'private';
        } else if (absGroup >= absPrivate && absGroup >= absSemi) {
          primaryType = 'group';
        } else {
          primaryType = 'semi_private';
        }
      }
      
      return {
        ...player,
        remainingCredits: totalRemaining,
        totalCredits: totalsByPlayer.get(player.id) || 0,
        creditsByType: byType,
        primaryCreditType: primaryType,
      };
    });
  },

  async getPlayersByAcademy(academyId: string): Promise<Player[]> {
    return db.select().from(players).where(eq(players.academyId, academyId));
  },

  // ==================== PLAYER INVITES ====================
  async createPlayerInvite(data: InsertPlayerInvite): Promise<PlayerInvite> {
    const result = await db.insert(playerInvites).values(data).returning();
    return result[0];
  },

  async getPlayerInvite(inviteCode: string): Promise<PlayerInvite | undefined> {
    const result = await db.select().from(playerInvites).where(eq(playerInvites.inviteCode, inviteCode));
    return result[0];
  },

  async getPlayerInviteById(id: string): Promise<PlayerInvite | undefined> {
    const result = await db.select().from(playerInvites).where(eq(playerInvites.id, id));
    return result[0];
  },

  async getPlayerInviteByPlayerId(playerId: string): Promise<PlayerInvite | undefined> {
    const result = await db.select().from(playerInvites)
      .where(and(
        eq(playerInvites.playerId, playerId),
        eq(playerInvites.status, "pending")
      ))
      .orderBy(desc(playerInvites.createdAt))
      .limit(1);
    return result[0];
  },

  async updatePlayerInvite(id: string, data: Partial<InsertPlayerInvite>): Promise<PlayerInvite | undefined> {
    const result = await db.update(playerInvites).set(data).where(eq(playerInvites.id, id)).returning();
    return result[0];
  },

  async claimPlayerInvite(inviteCode: string, userId: string): Promise<PlayerInvite | undefined> {
    const result = await db.update(playerInvites)
      .set({ 
        status: "claimed", 
        claimedBy: userId, 
        claimedAt: new Date() 
      })
      .where(and(
        eq(playerInvites.inviteCode, inviteCode),
        eq(playerInvites.status, "pending")
      ))
      .returning();
    return result[0];
  },

  async searchPlayers(query: string, academyId?: string): Promise<Player[]> {
    let allPlayers: Player[];
    if (academyId) {
      allPlayers = await db.select().from(players).where(eq(players.academyId, academyId));
    } else {
      allPlayers = await db.select().from(players);
    }
    const lowerQuery = query.toLowerCase();
    return allPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        (p.phone && p.phone.includes(query))
    );
  },

  async getAllPlayersPaginated(limit: number, offset: number, academyId?: string): Promise<{ players: Player[]; total: number }> {
    // Build where clause: academy filter if provided
    const whereClause = academyId ? eq(players.academyId, academyId) : undefined;
    
    const baseQuery = db.select().from(players);
    const countQuery = db.select({ count: count() }).from(players);
    
    const [playerList, countResult] = await Promise.all([
      whereClause 
        ? baseQuery.where(whereClause).orderBy(asc(players.name)).limit(limit).offset(offset)
        : baseQuery.orderBy(asc(players.name)).limit(limit).offset(offset),
      whereClause
        ? countQuery.where(whereClause)
        : countQuery
    ]);
    
    return { players: playerList, total: countResult[0]?.count || 0 };
  },

  async searchPlayersPaginated(query: string, limit: number, offset: number, academyId?: string): Promise<{ players: Player[]; total: number }> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    const searchCondition = or(
      ilike(players.name, lowerQuery),
      ilike(players.phone, lowerQuery)
    );
    
    // Build where clause: search + optional academy filter
    const whereClause = academyId 
      ? and(searchCondition, eq(players.academyId, academyId))
      : searchCondition;
    
    const [playerList, countResult] = await Promise.all([
      db.select().from(players)
        .where(whereClause!)
        .orderBy(asc(players.name))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(players)
        .where(whereClause!)
    ]);
    
    return { players: playerList, total: countResult[0]?.count || 0 };
  },

  async createPlayer(data: InsertPlayer): Promise<Player> {
    const result = await db.insert(players).values(data).returning();
    return result[0];
  },

  async updatePlayer(id: string, data: Partial<InsertPlayer>): Promise<Player | undefined> {
    const result = await db.update(players).set(data).where(eq(players.id, id)).returning();
    return result[0];
  },

  async deletePlayer(id: string, academyId: string | null): Promise<boolean> {
    // Academy-scoped callers (admin/coach) pass an academyId so the player
    // can only be deleted from inside their own academy. The platform-owner
    // delete path passes `null` to bypass the scope check ("delete anyone",
    // including ghost rows where academyId IS NULL).
    const scopeWhere = academyId
      ? and(eq(players.id, id), eq(players.academyId, academyId))
      : eq(players.id, id);
    const player = await db.select().from(players).where(scopeWhere);
    if (player.length === 0) return false;
    
    // Use a transaction to ensure atomicity
    try {
      // Delete credit transactions first — they FK-reference session_players, packages, and players
      await db.delete(creditTransactions).where(eq(creditTransactions.playerId, id));

      // ---------------------------------------------------------------
      // Batch A: Pure leaf tables — no other table FKs reference them
      // ---------------------------------------------------------------
      await Promise.all([
        // Player invites
        db.delete(playerInvites).where(eq(playerInvites.playerId, id)),
        // Progress Engine V2
        db.delete(sessionSkillObservations).where(eq(sessionSkillObservations.playerId, id)),
        db.delete(playerSkillState).where(eq(playerSkillState.playerId, id)),
        db.delete(playerProgressFlags).where(eq(playerProgressFlags.playerId, id)),
        db.delete(domainAssessments).where(eq(domainAssessments.playerId, id)),
        db.delete(xpTransactions).where(eq(xpTransactions.playerId, id)),
        // Core
        db.delete(playerNotes).where(eq(playerNotes.playerId, id)),
        db.delete(playerProgress).where(eq(playerProgress.playerId, id)),
        db.delete(playerHolidays).where(eq(playerHolidays.playerId, id)),
        db.delete(sessionPlayers).where(eq(sessionPlayers.playerId, id)),
        db.delete(playerSessionCancellations).where(eq(playerSessionCancellations.playerId, id)),
        // Booking and transfers
        db.delete(bookingRequests).where(eq(bookingRequests.playerId, id)),
        db.delete(joinRequests).where(eq(joinRequests.playerId, id)),
        db.delete(academyTransferRequests).where(eq(academyTransferRequests.playerId, id)),
        // Chat
        db.delete(conversationParticipants).where(eq(conversationParticipants.playerId, id)),
        db.delete(messageReactions).where(eq(messageReactions.reactorPlayerId, id)),
        // Coach reviews and prompts
        db.delete(coachReviews).where(eq(coachReviews.playerId, id)),
        db.delete(reviewPrompts).where(eq(reviewPrompts.playerId, id)),
        // Player matches / connections
        db.delete(playerMatches).where(
          or(eq(playerMatches.initiatorId, id), eq(playerMatches.receiverId, id))
        ),
        db.delete(playerConnections).where(
          or(eq(playerConnections.player1Id, id), eq(playerConnections.player2Id, id))
        ),
        // Booking invite guests where this player is a guest
        db.delete(bookingInviteGuests).where(eq(bookingInviteGuests.playerId, id)),
        // Open match slots where this player is a participant (non-host)
        db.delete(openMatchSlots).where(eq(openMatchSlots.playerId, id)),
        // Play request participants where this player joined someone else's request
        db.delete(playRequestParticipants).where(eq(playRequestParticipants.playerId, id)),
        // Match requests (creator or invited/matched party)
        db.delete(matchRequests).where(
          or(
            eq(matchRequests.playerId, id),
            eq(matchRequests.invitedPlayerId, id),
            eq(matchRequests.matchedWithPlayerId, id)
          )
        ),
        // Player booking preferences
        db.delete(playerBookingPreferences).where(eq(playerBookingPreferences.playerId, id)),
        // Lesson group members
        db.delete(lessonGroupMembers).where(eq(lessonGroupMembers.playerId, id)),
        // Player level events
        db.delete(playerLevelEvents).where(eq(playerLevelEvents.playerId, id)),
        // Adult glow matches (player or opponent)
        db.delete(adultGlowMatches).where(
          or(eq(adultGlowMatches.playerId, id), eq(adultGlowMatches.opponentId, id))
        ),
        // Adult skill assessments
        db.delete(adultSkillAssessments).where(eq(adultSkillAssessments.playerId, id)),
        // Session waitlist
        db.delete(sessionWaitlist).where(eq(sessionWaitlist.playerId, id)),
        // Squad members
        db.delete(squadMembers).where(eq(squadMembers.playerId, id)),
        // Player gamification
        db.delete(playerBadges).where(eq(playerBadges.playerId, id)),
        db.delete(playerTitles).where(eq(playerTitles.playerId, id)),
        db.delete(playerStreaks).where(eq(playerStreaks.playerId, id)),
        // Shop wishlist
        db.delete(shopWishlist).where(eq(shopWishlist.playerId, id)),
        // Ball levels & skill scoring
        db.delete(playerBallLevels).where(eq(playerBallLevels.playerId, id)),
        db.delete(playerSkillScores).where(eq(playerSkillScores.playerId, id)),
        db.delete(sessionSkillFeedback).where(eq(sessionSkillFeedback.playerId, id)),
        // Match intelligence sub-tables (before matches)
        db.delete(matchLogs).where(
          or(eq(matchLogs.playerId, id), eq(matchLogs.opponentPlayerId, id))
        ),
        db.delete(skillEvidence).where(eq(skillEvidence.playerId, id)),
        // Match challenges (challenger, opponent, or winner)
        db.delete(matchChallenges).where(
          or(
            eq(matchChallenges.challengerId, id),
            eq(matchChallenges.opponentId, id),
            eq(matchChallenges.winnerPlayerId, id)
          )
        ),
        // Player XP / level up
        db.delete(playerXpEvents).where(eq(playerXpEvents.playerId, id)),
        db.delete(playerLevelUpCelebrations).where(eq(playerLevelUpCelebrations.playerId, id)),
        db.delete(playerFeatureUnlockHistory).where(eq(playerFeatureUnlockHistory.playerId, id)),
        // Deep assessment pillar summaries
        db.delete(deepAssessmentPillarSummaries).where(eq(deepAssessmentPillarSummaries.playerId, id)),
        // Tournament participants
        db.delete(tournamentParticipants).where(eq(tournamentParticipants.playerId, id)),
        // Ladder players
        db.delete(ladderPlayers).where(eq(ladderPlayers.playerId, id)),
        // Ladder challenges (challenger, challenged, or winner)
        db.delete(ladderChallenges).where(
          or(
            eq(ladderChallenges.challengerId, id),
            eq(ladderChallenges.challengedId, id),
            eq(ladderChallenges.winnerId, id)
          )
        ),
        // Series players
        db.delete(seriesPlayers).where(eq(seriesPlayers.playerId, id)),
        // Player notifications
        db.delete(playerNotifications).where(eq(playerNotifications.playerId, id)),
        // Player deep assessments
        db.delete(playerDeepAssessments).where(eq(playerDeepAssessments.playerId, id)),
        // Player baseline skill scores
        db.delete(playerBaselineSkillScores).where(eq(playerBaselineSkillScores.playerId, id)),
        // Player pillar progress
        db.delete(playerPillarProgress).where(eq(playerPillarProgress.playerId, id)),
        // In-session feedback
        db.delete(inSessionFeedback).where(eq(inSessionFeedback.playerId, id)),
      ]);

      // ---------------------------------------------------------------
      // Batch B: Tables that reference other player-owned rows deleted above
      // ---------------------------------------------------------------
      // daily_quest_slots references player_quests, so delete slots first
      await db.delete(dailyQuestSlots).where(eq(dailyQuestSlots.playerId, id));
      await db.delete(playerQuests).where(eq(playerQuests.playerId, id));

      // level_trials is referenced by level_up_events (via trialId), delete events first
      await db.delete(levelUpEvents).where(eq(levelUpEvents.playerId, id));
      await db.delete(levelTrials).where(eq(levelTrials.playerId, id));

      // match_pillar_scores, match_reflections, coach_match_reviews, match_training_suggestions
      // all reference matches.id — delete them before matches
      // match_opponents is referenced by matches (opponentId) — delete matches first, then orphaned opponents
      await Promise.all([
        db.delete(matchPillarScores).where(eq(matchPillarScores.playerId, id)),
        db.delete(matchReflections).where(eq(matchReflections.playerId, id)),
        db.delete(coachMatchReviews).where(eq(coachMatchReviews.playerId, id)),
        db.delete(matchTrainingSuggestions).where(eq(matchTrainingSuggestions.playerId, id)),
        // match_plans references match_opponents; delete plans before opponents
        db.delete(matchPlans).where(eq(matchPlans.playerId, id)),
      ]);
      await db.delete(matches).where(eq(matches.playerId, id));
      // Orphaned matchOpponents rows owned by this player (no active match references remain)
      await db.delete(matchOpponents).where(eq(matchOpponents.playerId, id));

      // Marketplace: messages before listings, seller profile after listings
      await db.delete(marketplaceListings).where(eq(marketplaceListings.sellerId, id));
      await db.delete(sellerProfiles).where(eq(sellerProfiles.playerId, id));

      // Play requests where this player is the CREATOR:
      // Must delete ALL participant rows on those requests first (other players' participant rows)
      await db.delete(playRequestParticipants).where(
        inArray(playRequestParticipants.requestId,
          db.select({ id: playRequests.id }).from(playRequests).where(eq(playRequests.creatorId, id))
        )
      );
      await db.delete(playRequests).where(eq(playRequests.creatorId, id));

      // Live matches: SET NULL on winnerId then delete creator rows
      await db.update(liveMatches).set({ winnerId: null }).where(eq(liveMatches.winnerId, id));
      await db.delete(liveMatches).where(eq(liveMatches.creatorId, id));

      // Tournament matches: SET NULL on winner/player refs then leave parent rows (tournament-owned)
      await db.update(tournamentMatches).set({ winnerId: null }).where(eq(tournamentMatches.winnerId, id));
      await db.update(tournamentMatches).set({ player1Id: null }).where(eq(tournamentMatches.player1Id, id));
      await db.update(tournamentMatches).set({ player2Id: null }).where(eq(tournamentMatches.player2Id, id));

      // Tournaments: SET NULL on winner_id (tournament rows are academy-owned, not player-owned)
      await db.update(tournaments).set({ winnerId: null }).where(eq(tournaments.winnerId, id));

      // Booking invites where this player is the HOST:
      // Must delete ALL guest rows on those invites first (other players' guest rows we didn't catch above)
      await db.delete(bookingInviteGuests).where(
        inArray(bookingInviteGuests.inviteId,
          db.select({ id: bookingInvites.id }).from(bookingInvites).where(eq(bookingInvites.hostPlayerId, id))
        )
      );
      await db.delete(bookingInvites).where(eq(bookingInvites.hostPlayerId, id));

      // Open matches where this player is the HOST:
      // Must delete ALL slot rows on those matches first (other players' slots we didn't catch above)
      await db.delete(openMatchSlots).where(
        inArray(openMatchSlots.matchId,
          db.select({ id: openMatches.id }).from(openMatches).where(eq(openMatches.hostPlayerId, id))
        )
      );
      await db.delete(openMatches).where(eq(openMatches.hostPlayerId, id));

      // Court bookings: must come after bookingInvites and openMatches (which reference court_bookings.id)
      await db.delete(courtBookings).where(eq(courtBookings.playerId, id));

      // Player baselines (baseline skill scores already deleted above)
      await db.delete(playerBaselines).where(eq(playerBaselines.playerId, id));

      // ---------------------------------------------------------------
      // Batch C: chat messages, conversations, and parent relations
      // ---------------------------------------------------------------
      // messages must be deleted before conversations (senderPlayerId FK)
      // conversationParticipants already deleted in Batch A
      await db.delete(messages).where(eq(messages.senderPlayerId, id));
      // conversations.playerId is nullable — NULL it out (conversation is shared with coach/provider)
      await db.update(conversations).set({ playerId: null }).where(eq(conversations.playerId, id));
      await db.delete(parentPlayerRelations).where(eq(parentPlayerRelations.playerId, id));

      // ---------------------------------------------------------------
      // Batch D: billing tables (order matters due to FKs)
      // ---------------------------------------------------------------
      await db.delete(paymentReminders).where(eq(paymentReminders.playerId, id));
      await db.delete(refunds).where(
        inArray(refunds.paymentId, 
          db.select({ id: payments.id }).from(payments).where(eq(payments.playerId, id))
        )
      );
      await db.delete(payments).where(eq(payments.playerId, id));
      await db.delete(invoices).where(eq(invoices.playerId, id));
      await db.delete(playerSubscriptions).where(eq(playerSubscriptions.playerId, id));
      // Shop order items: must be deleted before shop orders (no ON DELETE CASCADE)
      await db.delete(shopOrderItems).where(
        inArray(shopOrderItems.orderId,
          db.select({ id: shopOrders.id }).from(shopOrders).where(eq(shopOrders.playerId, id))
        )
      );
      await db.delete(shopOrders).where(eq(shopOrders.playerId, id));
      await db.delete(packages).where(eq(packages.playerId, id));
      
      // Update users table to unlink the player
      await db.update(users).set({ playerId: null }).where(eq(users.playerId, id));
      
      // Finally delete the player (using the same scope clause as the
      // initial existence check, so platform-owner null-scope deletes work).
      const result = await db
        .delete(players)
        .where(scopeWhere)
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in deletePlayer transaction:", error);
      throw error;
    }
  },

  // ==================== PLAYER BASELINES ====================
  async getPlayerBaseline(playerId: string): Promise<PlayerBaseline | undefined> {
    const result = await db.select().from(playerBaselines).where(eq(playerBaselines.playerId, playerId));
    return result[0];
  },

  async createPlayerBaseline(data: InsertPlayerBaseline): Promise<PlayerBaseline> {
    const result = await db.insert(playerBaselines).values(data).returning();
    return result[0];
  },

  async updatePlayerBaseline(id: string, data: Partial<InsertPlayerBaseline>): Promise<PlayerBaseline | undefined> {
    const result = await db.update(playerBaselines).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(playerBaselines.id, id)).returning();
    return result[0];
  },

  async lockPlayerBaseline(id: string, coachId: string): Promise<PlayerBaseline | undefined> {
    const result = await db.update(playerBaselines).set({
      status: "locked",
      lockedAt: new Date(),
      lockedByCoachId: coachId,
      updatedAt: new Date(),
    }).where(eq(playerBaselines.id, id)).returning();
    return result[0];
  },

  async unlockPlayerBaseline(id: string): Promise<PlayerBaseline | undefined> {
    const result = await db.update(playerBaselines).set({
      status: "confirmed",
      lockedAt: null,
      lockedByCoachId: null,
      updatedAt: new Date(),
    }).where(eq(playerBaselines.id, id)).returning();
    return result[0];
  },

  async getPlayersWithoutBaseline(academyId: string): Promise<Player[]> {
    const playersWithBaseline = db.select({ playerId: playerBaselines.playerId }).from(playerBaselines);
    const result = await db.select().from(players).where(
      and(
        eq(players.academyId, academyId),
        sql`${players.id} NOT IN (${playersWithBaseline})`
      )
    );
    return result;
  },

  async getAcademyBaselineStats(academyId: string): Promise<{ total: number; withBaseline: number; locked: number }> {
    const totalPlayers = await db.select({ count: count() }).from(players).where(eq(players.academyId, academyId));
    const withBaseline = await db.select({ count: count() }).from(playerBaselines).where(eq(playerBaselines.academyId, academyId));
    const locked = await db.select({ count: count() }).from(playerBaselines).where(
      and(eq(playerBaselines.academyId, academyId), eq(playerBaselines.status, "locked"))
    );
    return {
      total: totalPlayers[0]?.count || 0,
      withBaseline: withBaseline[0]?.count || 0,
      locked: locked[0]?.count || 0,
    };
  },

  async getAllBallLevels() {
    return db.select().from(ballLevels).orderBy(asc(ballLevels.rank));
  },

  // ==================== PACKAGES ====================
  async getPackage(id: string, academyId?: string): Promise<Package | undefined> {
    // If academyId provided, verify package belongs to a player in that academy
    const result = await db.select().from(packages).where(eq(packages.id, id));
    const pkg = result[0];
    if (!pkg || !academyId) return pkg;
    
    // Verify the player belongs to this academy
    const player = await db.select().from(players).where(
      and(eq(players.id, pkg.playerId!), eq(players.academyId, academyId))
    );
    return player.length > 0 ? pkg : undefined;
  },

  async getPlayerPackages(playerId: string, academyId?: string): Promise<Package[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db.select().from(packages).where(eq(packages.playerId, playerId)).orderBy(desc(packages.createdAt));
  },

  async getPlayerPackagesWithCalculatedRemaining(playerId: string, academyId?: string): Promise<(Package & { calculatedRemaining: number })[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    
    // Get all packages for player
    const playerPackages = await db.select().from(packages).where(eq(packages.playerId, playerId));
    
    if (playerPackages.length === 0) return [];
    
    return playerPackages;
  },

  async getActivePlayerPackages(playerId: string, academyId?: string): Promise<Package[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    
    const today = new Date().toISOString().split("T")[0];
    const result = await db
      .select()
      .from(packages)
      .where(
        and(
          eq(packages.playerId, playerId),
          gte(packages.remainingCredits, 1)
        )
      );
    return result.filter(p => !p.expiryDate || p.expiryDate >= today);
  },

  async checkPlayerCreditsForSessionType(
    playerId: string, 
    sessionType: string, 
    academyId?: string
  ): Promise<{ hasCredits: boolean; availableCredits: number; creditType: string | null }> {
    const activePackages = await this.getActivePlayerPackages(playerId, academyId);
    
    // Map session types to credit types
    const sessionToCreditType: Record<string, string> = {
      private: "private",
      semi: "semi_private",
      semi_private: "semi_private",
      group: "group",
    };
    
    const requiredCreditType = sessionToCreditType[sessionType] || sessionType;
    
    // Find packages with matching credit type
    const matchingPackages = activePackages.filter(pkg => {
      const pkgCreditType = pkg.creditType || "group";
      return pkgCreditType === requiredCreditType;
    });
    
    const availableCredits = matchingPackages.reduce((sum, pkg) => sum + Number(pkg.remainingCredits), 0);
    
    return {
      hasCredits: availableCredits > 0,
      availableCredits,
      creditType: requiredCreditType,
    };
  },

  async createPackage(data: InsertPackage): Promise<Package> {
    const result = await db.insert(packages).values(data).returning();
    return result[0];
  },

  async updatePackage(id: string, data: Partial<InsertPackage>, academyId?: string): Promise<Package | undefined> {
    // Verify ownership before update if academyId provided
    if (academyId) {
      const pkg = await this.getPackage(id, academyId);
      if (!pkg) return undefined;
    }
    const result = await db.update(packages).set(data).where(eq(packages.id, id)).returning();
    return result[0];
  },

  // Convert session_booking/session_consumed transactions for a depleted/non-active package into
  // session_debt records so they surface correctly in the balance calculation.
  // This mirrors the conversion already performed inside deletePackage, but without destroying
  // the package row — used when a package naturally depletes to 0 credits.
  //
  // GUARD: If the package is still 'active' (i.e. depletion hasn't committed yet), this is a
  // no-op. This makes it safe to call immediately after the credit-deduction transaction
  // commits from any path (deductTypedCreditsForSession, ensureCreditProcessed, etc.).
  async convertPackageConsumptionToDebt(packageId: string, playerId?: string): Promise<{ converted: number }> {
    // Only convert when the package is genuinely no longer active
    const pkgStatus = await db.execute(sql`
      SELECT status, academy_id FROM packages WHERE id = ${packageId} LIMIT 1
    `);
    if (pkgStatus.rows.length === 0) return { converted: 0 };
    const status = (pkgStatus.rows[0] as any).status;
    if (status === 'active') return { converted: 0 };

    // Task #676 Phase 2 — V1 write gate. V2 doesn't manufacture session_debt
    // rows from package depletion (debt is computed from credit_ledger_v2).
    {
      const { v1WritesAllowed } = await import("./services/credit-feature-flag");
      const pkgAcademyId = (pkgStatus.rows[0] as any)?.academy_id ?? null;
      if (!(await v1WritesAllowed(pkgAcademyId))) {
        return { converted: 0 };
      }
    }

    const consumptionTxs = await db.execute(sql`
      SELECT ct.id, ct.player_id, ct.academy_id, ct.session_id, ct.session_player_id,
             ct.credit_type, ct.amount, ct.metadata
      FROM credit_transactions ct
      WHERE ct.package_id = ${packageId}
        AND ct.amount < 0
        AND ct.reason IN ('session_booking', 'session_consumed')
        AND ct.session_id IS NOT NULL
        AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
        AND NOT EXISTS (
          SELECT 1 FROM session_players sp
          WHERE sp.session_id = ct.session_id
            AND sp.player_id = ct.player_id
            AND sp.attendance_status IN ('holiday', 'vacation')
        )
    `);

    if (consumptionTxs.rows.length === 0) return { converted: 0 };

    console.log(`[ConvertToDebt] Package ${packageId}: converting ${consumptionTxs.rows.length} session_booking/session_consumed tx(s) to session_debt`);
    let converted = 0;

    for (const bookingTx of consumptionTxs.rows as any[]) {
      const debtAmount = Math.abs(Number(bookingTx.amount)) || 1;
      const debtTxId = crypto.randomUUID();
      const eventKey = `debt_from_booking:${bookingTx.id}`;
      const creditType = bookingTx.credit_type || "group";
      try {
        // Cancel any pre-existing unlinked legacy session_booking debts for the same session
        await db.execute(sql`
          UPDATE credit_transactions
          SET metadata = metadata || ${JSON.stringify({
            cancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelledReason: 'superseded_by_package_depletion_debt',
          })}::jsonb
          WHERE player_id = ${bookingTx.player_id}
            AND session_id = ${bookingTx.session_id}
            AND reason IN ('session_booking', 'session_consumed')
            AND package_id IS NULL
            AND (metadata->>'packageId') IS NULL
            AND COALESCE(metadata->>'cancelled', 'false') != 'true'
            AND id != ${bookingTx.id}
        `);

        await db.execute(sql`
          INSERT INTO credit_transactions (
            id, player_id, academy_id, session_id, session_player_id, package_id,
            type, credit_type, amount, reason, event_key, balance_before, balance_after, metadata
          ) VALUES (
            ${debtTxId}, ${bookingTx.player_id}, ${bookingTx.academy_id},
            ${bookingTx.session_id}, ${bookingTx.session_player_id}, NULL,
            'debit', ${creditType}, ${-debtAmount}, 'session_debt', ${eventKey}, 0, ${-debtAmount},
            ${JSON.stringify({
              isDebt: true,
              convertedFromBooking: bookingTx.id,
              packageDepleted: packageId,
              description: `Debt: package depleted, pre-paid session became unpaid`,
            })}::jsonb
          )
          ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING
        `);

        // Mark the original booking transaction as cancelled to prevent double-accounting
        await db.execute(sql`
          UPDATE credit_transactions
          SET metadata = metadata || ${JSON.stringify({
            cancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelledReason: 'package_depleted_converted_to_debt',
            debtTransactionId: debtTxId,
          })}::jsonb
          WHERE id = ${bookingTx.id}
        `);

        converted++;
      } catch (err: any) {
        if (err.code === '23505') {
          console.log(`[ConvertToDebt] Duplicate event_key for tx ${bookingTx.id}, skipping`);
        } else {
          throw err;
        }
      }
    }

    console.log(`[ConvertToDebt] Package ${packageId}: converted ${converted} tx(s) to session_debt for player ${playerId}`);
    return { converted };
  },

  async deletePackage(id: string, academyId?: string, force: boolean = false): Promise<{ success: boolean; error?: string; creditsUsed?: number }> {
    const pkg = await this.getPackage(id, academyId);
    if (!pkg) {
      return { success: false, error: "Package not found" };
    }

    const creditsUsed = Number(pkg.totalCredits) - Number(pkg.remainingCredits);

    // Task #676 Phase 2 — V1 write gate. The debt-restore + booking-to-debt
    // conversion blocks below write to credit_transactions. For V2 academies
    // those become no-ops; the package row itself is still deleted.
    const { v1WritesAllowed: _v1Allowed } = await import("./services/credit-feature-flag");
    const _gateAcademyId = pkg.academyId ?? academyId ?? null;
    const _v1WritesPermitted = await _v1Allowed(_gateAcademyId);
    
    if (Number(pkg.remainingCredits) > 0 && !force) {
      return { 
        success: false, 
        error: `Cannot delete: ${Number(pkg.remainingCredits)} unused credit(s) still remaining in this package`,
        creditsUsed 
      };
    }
    
    // Use transaction to cascade delete all dependent records
    // Dependency chain: packages → invoices → payments → refunds, also series_players.linked_package_id
    await db.transaction(async (tx) => {
      // REFUND: Only refund if there are genuinely remaining unused credits
      // SAFETY: Skip refund entirely - deleting a package removes its purchase transaction too,
      // so adding a refund on top creates ghost credits (the purchase credits vanish when the
      // package row is deleted, but the refund transaction persists with packageId: null).
      // The debt restoration below already handles re-opening any settled debts.
      if (creditsUsed > 0 && pkg.playerId) {
        const validCreditType = pkg.creditType || "group";
        console.log(`[PackageDelete] Package had ${creditsUsed} credits used (type: ${validCreditType}). Skipping refund to prevent ghost credits - debts will be restored separately.`);
      }

      // IMPORTANT: Restore any debts that were settled by this package
      // Find credit transactions where metadata.settledByPackage matches this package
      const allDebts = await tx.select().from(creditTransactions)
        .where(and(
          eq(creditTransactions.playerId, pkg.playerId!),
          or(
            eq(creditTransactions.reason, "session_join_debt"),
            eq(creditTransactions.reason, "session_debt"),
            eq(creditTransactions.reason, "session_unpaid")
          )
        ));
      
      // Filter to find debts settled by this specific package
      const debtsSettledByThisPackage = allDebts.filter(debt => {
        const meta = debt.metadata as Record<string, unknown> | null;
        return meta?.settledByPackage === id;
      });
      
      // Restore each debt (mark as unsettled)
      for (const debt of debtsSettledByThisPackage) {
        const meta = debt.metadata as Record<string, unknown> | null;
        const originalAmount = (meta?.originalAmount as number) || Math.abs(Number(debt.amount));
        const updatedMeta = { ...meta };
        delete updatedMeta.settled;
        delete updatedMeta.settledByPackage;
        delete updatedMeta.lastSettledAt;
        delete updatedMeta.originalAmount;
        
        await tx.update(creditTransactions)
          .set({ 
            amount: -originalAmount, // Restore negative debt amount
            metadata: updatedMeta
          })
          .where(eq(creditTransactions.id, debt.id));
        
        console.log(`[PackageDelete] Restored debt ${debt.id} for player ${pkg.playerId}, amount: -${originalAmount}`);
      }
      
      if (debtsSettledByThisPackage.length > 0) {
        console.log(`[PackageDelete] Restored ${debtsSettledByThisPackage.length} debts for player ${pkg.playerId}`);
      }
      
      // CRITICAL FIX: Convert consumption transactions to debt BEFORE clearing packageId.
      // When a package is force-deleted with used credits, those sessions become unpaid.
      // Create session_debt transactions so the balance correctly shows the negative debt.
      // Task #676 Phase 2 — V2 academies don't use session_debt (debt is computed from
      // credit_ledger_v2), so skip the conversion entirely for them.
      if (creditsUsed > 0 && pkg.playerId && _v1WritesPermitted) {
        // Only convert pre-paid session consumption reasons: session_booking and session_consumed.
        // Intentionally excludes debt/settlement rows to prevent double-accounting.
        // Guards:
        //   1. session_id IS NOT NULL — skip phantom sessions with no real session record
        //   2. NOT EXISTS holiday/vacation in session_players — holiday sessions must never become debt
        //   3. Inside loop: cancel pre-existing legacy session_booking for same session to prevent double-counting
        const consumptionTxs = await tx.execute(sql`
          SELECT ct.id, ct.player_id, ct.academy_id, ct.session_id, ct.session_player_id,
                 ct.credit_type, ct.amount, ct.metadata
          FROM credit_transactions ct
          WHERE ct.package_id = ${id}
            AND ct.amount < 0
            AND ct.reason IN ('session_booking', 'session_consumed')
            AND ct.session_id IS NOT NULL
            AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
            AND NOT EXISTS (
              SELECT 1 FROM session_players sp
              WHERE sp.session_id = ct.session_id
                AND sp.player_id = ct.player_id
                AND sp.attendance_status IN ('holiday', 'vacation')
            )
        `);

        if (consumptionTxs.rows.length > 0) {
          console.log(`[PackageDelete] Converting ${consumptionTxs.rows.length} session_booking/session_consumed transactions to debt for player ${pkg.playerId}`);
          for (const bookingTx of consumptionTxs.rows as any[]) {
            const debtAmount = Math.abs(Number(bookingTx.amount)) || 1;
            const debtTxId = crypto.randomUUID();
            const eventKey = `debt_from_booking:${bookingTx.id}`;
            const creditType = bookingTx.credit_type || pkg.creditType || "group";
            try {
              // Cancel any pre-existing legacy session_booking debts for the same session
              // to prevent double-counting (once as session_booking + once as new session_debt)
              await tx.execute(sql`
                UPDATE credit_transactions
                SET metadata = metadata || ${JSON.stringify({
                  cancelled: true,
                  cancelledAt: new Date().toISOString(),
                  cancelledReason: 'superseded_by_package_delete_debt',
                })}::jsonb
                WHERE player_id = ${bookingTx.player_id}
                  AND session_id = ${bookingTx.session_id}
                  AND reason IN ('session_booking', 'session_consumed')
                  AND package_id IS NULL
                  AND (metadata->>'packageId') IS NULL
                  AND COALESCE(metadata->>'cancelled', 'false') != 'true'
                  AND id != ${bookingTx.id}
              `);
              await tx.execute(sql`
                INSERT INTO credit_transactions (
                  id, player_id, academy_id, session_id, session_player_id, package_id,
                  type, credit_type, amount, reason, event_key, balance_before, balance_after, metadata
                ) VALUES (
                  ${debtTxId}, ${bookingTx.player_id}, ${bookingTx.academy_id},
                  ${bookingTx.session_id}, ${bookingTx.session_player_id}, NULL,
                  'debit', ${creditType}, ${-debtAmount}, 'session_debt', ${eventKey}, 0, ${-debtAmount},
                  ${JSON.stringify({
                    isDebt: true,
                    convertedFromBooking: bookingTx.id,
                    packageDeleted: id,
                    description: `Debt: package deleted, pre-paid session became unpaid`,
                  })}::jsonb
                )
                ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING
              `);
              // Mark the original booking transaction as cancelled to prevent double-accounting
              await tx.execute(sql`
                UPDATE credit_transactions
                SET metadata = metadata || ${JSON.stringify({
                  cancelled: true,
                  cancelledAt: new Date().toISOString(),
                  cancelledReason: 'package_deleted_converted_to_debt',
                  debtTransactionId: debtTxId,
                })}::jsonb
                WHERE id = ${bookingTx.id}
              `);
            } catch (err: any) {
              if (err.code === '23505') {
                console.log(`[PackageDelete] Duplicate debt conversion for tx ${bookingTx.id}, skipping`);
              } else {
                throw err;
              }
            }
          }
          console.log(`[PackageDelete] Debt conversion complete for player ${pkg.playerId}`);
        }
      }

      // Clear any series_players references to this package first
      await tx.update(seriesPlayers)
        .set({ linkedPackageId: null })
        .where(eq(seriesPlayers.linkedPackageId, id));
      
      // Clear credit_transactions references to this package (set package_id to null)
      await tx.update(creditTransactions)
        .set({ packageId: null })
        .where(eq(creditTransactions.packageId, id));
      
      // Get invoice IDs associated with this package
      const packageInvoices = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.packageId, id));
      const invoiceIds = packageInvoices.map(inv => inv.id);
      
      if (invoiceIds.length > 0) {
        // Get payment IDs for these invoices
        const invoicePayments = await tx.select({ id: payments.id }).from(payments).where(inArray(payments.invoiceId, invoiceIds));
        const paymentIds = invoicePayments.map(p => p.id);
        
        // 1. Delete refunds first (they reference payments)
        if (paymentIds.length > 0) {
          await tx.delete(refunds).where(inArray(refunds.paymentId, paymentIds));
        }
        
        // 2. Delete payments for these invoices
        await tx.delete(payments).where(inArray(payments.invoiceId, invoiceIds));
        
        // 3. Delete payment reminders for these invoices
        await tx.delete(paymentReminders).where(inArray(paymentReminders.invoiceId, invoiceIds));
        
        // 4. Delete the invoices
        await tx.delete(invoices).where(eq(invoices.packageId, id));
      }
      
      // 5. Finally delete the package
      await tx.delete(packages).where(eq(packages.id, id));
    });
    
    return { success: true };
  },

  async usePackageCredit(packageId: string, academyId?: string, creditCost: number = 1): Promise<Package | undefined> {
    const pkg = await this.getPackage(packageId, academyId);
    if (!pkg || Number(pkg.remainingCredits) < creditCost) return undefined;
    
    const newRemaining = Number(pkg.remainingCredits) - creditCost;
    const result = await db
      .update(packages)
      .set({ 
        remainingCredits: newRemaining,
        status: newRemaining <= 0 ? "depleted" : pkg.status,
      })
      .where(eq(packages.id, packageId))
      .returning();

    return result[0];
  },

  async autoDeductPlayerCredit(playerId: string, academyId?: string): Promise<{ success: boolean; package?: Package; reason?: string }> {
    const activePackages = await this.getActivePlayerPackages(playerId, academyId);
    if (activePackages.length === 0) {
      return { success: false, reason: "no_active_package" };
    }
    
    // Sort by expiry date (soonest first) to use credits from expiring packages first
    const sortedPackages = activePackages.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
    });
    
    const packageToUse = sortedPackages[0];
    const updatedPackage = await this.usePackageCredit(packageToUse.id, academyId);
    
    if (updatedPackage) {
      return { success: true, package: updatedPackage };
    }
    return { success: false, reason: "credit_deduction_failed" };
  },

  /**
   * @deprecated Use ensureCreditProcessed(sessionPlayerId) instead.
   * This function is now only called internally by ensureCreditProcessed.
   * Direct calls from routes should be replaced with ensureCreditProcessed.
   */
  async deductTypedCreditsForSession(
    playerId: string,
    sessionType: string,
    sessionId: string,
    academyId?: string,
    sessionPlayerId?: string // Optional: target specific session_player record
  ): Promise<{ success: boolean; package?: Package; creditType?: string; transactionId?: string; reason?: string }> {
    // Phase 3 — Task #651. If this academy is on the new Credit Engine V2,
    // route through credit-engine.consumeCredit and freeze the legacy
    // package decrement + credit_transactions write-path entirely.
    {
      let v2AcademyId = academyId ?? null;
      if (!v2AcademyId) {
        const r = await db.execute(sql`
          SELECT s.academy_id FROM sessions s WHERE s.id = ${sessionId} LIMIT 1
        `);
        v2AcademyId = (r.rows[0] as { academy_id?: string | null } | undefined)?.academy_id ?? null;
      }
      if (v2AcademyId) {
        const { isV2EnabledForAcademy } = await import("./services/credit-feature-flag");
        if (await isV2EnabledForAcademy(v2AcademyId)) {
          let spId = sessionPlayerId ?? null;
          if (!spId) {
            const lookup = await db.execute(sql`
              SELECT id FROM session_players
              WHERE session_id = ${sessionId} AND player_id = ${playerId}
              LIMIT 1
            `);
            spId = (lookup.rows[0] as { id?: string } | undefined)?.id ?? null;
          }
          if (!spId) {
            return { success: false, reason: "session_player_not_found" };
          }
          try {
            const { consumeCredit } = await import("./services/credit-engine");
            const v2Result = await consumeCredit({ sessionPlayerId: spId, actorRole: "system" });
            if (v2Result.alreadyApplied) {
              return { success: true, creditType: v2Result.type ?? undefined, reason: "already_processed" };
            }
            if (!v2Result.charged) {
              return { success: false, reason: "not_chargeable", creditType: v2Result.type ?? undefined };
            }
            return { success: true, creditType: v2Result.type ?? undefined };
          } catch (v2Err: any) {
            console.error(`[deductTypedCredits][V2] consume failed for sp ${spId}:`, v2Err);
            return { success: false, reason: v2Err?.message ?? "v2_consume_error" };
          }
        }
      }
    }

    // Map session types to credit types
    const sessionToCreditType: Record<string, string> = {
      private: "private",
      semi: "semi_private",
      semi_private: "semi_private",
      group: "group",
    };
    
    const requiredCreditType = sessionToCreditType[sessionType] || "group";
    
    // Fetch session duration for proportional credit charging
    const sessionResult = await db.select({ duration: sessions.duration }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const sessionDuration = sessionResult[0]?.duration || 60;
    const creditCost = sessionDuration / 60;
    
    const activePackages = await this.getActivePlayerPackages(playerId, academyId);
    
    // Filter packages with matching credit type
    const matchingPackages = activePackages.filter(pkg => {
      const pkgCreditType = pkg.creditType || "group";
      return pkgCreditType === requiredCreditType && Number(pkg.remainingCredits) >= creditCost;
    });
    
    if (matchingPackages.length === 0) {
      return { 
        success: false, 
        reason: "no_matching_credits", 
        creditType: requiredCreditType 
      };
    }
    
    // Sort by expiry date (soonest first) to use credits from expiring packages first
    const sortedPackages = matchingPackages.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
    });
    
    const packageToUse = sortedPackages[0];
    const balanceBefore = Number(packageToUse.remainingCredits);
    const balanceAfter = balanceBefore - creditCost;
    
    // Deduct credit from package
    const updatedPackage = await this.usePackageCredit(packageToUse.id, academyId, creditCost);
    
    if (!updatedPackage) {
      return { success: false, reason: "credit_deduction_failed", creditType: requiredCreditType };
    }
    
    // Log the credit transaction
    const transaction = await this.createCreditTransaction({
      playerId,
      academyId: academyId || packageToUse.academyId,
      packageId: packageToUse.id,
      type: "debit",
      creditType: requiredCreditType,
      amount: -creditCost,
      reason: "session_booking",
      sessionId,
      balanceBefore,
      balanceAfter,
      metadata: JSON.stringify({
        sessionType,
        bookedBy: "coach",
        creditCost,
        sessionDuration,
      }),
    });
    
    // Update session_player record with credit deduction timestamp
    // Use specific sessionPlayerId if provided, otherwise fallback to sessionId+playerId match
    const whereClause = sessionPlayerId 
      ? eq(sessionPlayers.id, sessionPlayerId)
      : and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        );
    
    await db.update(sessionPlayers)
      .set({ 
        creditDeductedAt: new Date(),
        creditTransactionId: transaction?.id ?? null,
      })
      .where(whereClause);

    // If the package just depleted, convert ALL its consumption txs (including this new one)
    // to session_debt records so they surface correctly in the balance calculation.
    // The conversion guard in convertPackageConsumptionToDebt skips non-depleted packages.
    if (balanceAfter <= 0) {
      try {
        await this.convertPackageConsumptionToDebt(packageToUse.id, playerId);
      } catch (err) {
        console.error(`[deductTypedCredits] Failed to convert depleted package ${packageToUse.id} to debt:`, err);
      }
    }
    
    return { 
      success: true, 
      package: updatedPackage, 
      creditType: requiredCreditType,
      transactionId: transaction?.id ?? null,
    };
  },

  async createDebtForSession(
    playerId: string,
    sessionType: string,
    sessionId: string,
    academyId?: string,
    sessionPlayerId?: string
  ): Promise<{ transactionId: string }> {
    const sessionToCreditType: Record<string, string> = {
      private: "private",
      semi: "semi_private",
      semi_private: "semi_private",
      group: "group",
    };
    const creditType = sessionToCreditType[sessionType] || "group";

    // Fetch session duration for proportional credit charging
    const sessionResult = await db.select({ duration: sessions.duration }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const sessionDuration = sessionResult[0]?.duration || 60;
    const creditCost = sessionDuration / 60;

    const transaction = await this.createCreditTransaction({
      playerId,
      academyId: academyId || null,
      packageId: null,
      type: "debit",
      creditType,
      amount: -creditCost,
      reason: "session_join_debt",
      sessionId,
      balanceBefore: 0,
      balanceAfter: -creditCost,
      metadata: JSON.stringify({
        sessionType,
        debt: true,
        noPackageAvailable: true,
        isDebt: true,
        creditCost,
        sessionDuration,
      }),
    });

    const whereClause = sessionPlayerId
      ? eq(sessionPlayers.id, sessionPlayerId)
      : and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        );

    await db.update(sessionPlayers)
      .set({
        creditDeductedAt: new Date(),
        creditTransactionId: transaction?.id ?? null,
      })
      .where(whereClause);

    return { transactionId: transaction?.id ?? null };
  },

  async refundCreditsForSession(
    playerId: string,
    sessionId: string,
    academyId?: string
  ): Promise<{ success: boolean; creditType?: string; reason?: string; alreadyRefunded?: boolean; debtRemoved?: boolean }> {
    type RefundResult = { success: boolean; creditType?: string; reason?: string; alreadyRefunded?: boolean; debtRemoved?: boolean };

    // Phase 3 — Task #651. If this academy is on the new Credit Engine V2,
    // route the refund through the engine. Policy is derived from the
    // session start time: ≥24h before start = 'early' (full refund), else
    // 'late' (no refund — late cancellations are not credited back).
    const v2AcademyId = academyId ?? (await (async () => {
      const r = await db.execute(sql`
        SELECT s.academy_id FROM sessions s WHERE s.id = ${sessionId} LIMIT 1
      `);
      return (r.rows[0] as { academy_id?: string | null } | undefined)?.academy_id ?? null;
    })());
    if (v2AcademyId) {
      const { isV2EnabledForAcademy } = await import("./services/credit-feature-flag");
      const v2Enabled = await isV2EnabledForAcademy(v2AcademyId);
      if (v2Enabled) {
        try {
          const spLookup = await db.execute(sql`
            SELECT sp.id AS sp_id, s.start_time
            FROM session_players sp
            JOIN sessions s ON s.id = sp.session_id
            WHERE sp.session_id = ${sessionId} AND sp.player_id = ${playerId}
            LIMIT 1
          `);
          const spRow = spLookup.rows[0] as { sp_id?: string; start_time?: Date | string | null } | undefined;
          if (!spRow?.sp_id) {
            return { success: false, reason: "session_player_not_found" };
          }
          const startMs = spRow.start_time ? new Date(spRow.start_time).getTime() : 0;
          const hoursUntilStart = startMs > 0 ? (startMs - Date.now()) / (1000 * 60 * 60) : 0;
          const policy = hoursUntilStart >= 24 ? "early" as const : "late" as const;

          const { refundCredit } = await import("./services/credit-engine");
          const v2Result = await refundCredit({
            sessionPlayerId: spRow.sp_id,
            policy,
            actorRole: "system",
            reason: "session_cancel",
          });

          if (v2Result.alreadyApplied) {
            return { success: true, alreadyRefunded: true, creditType: v2Result.type ?? undefined };
          }
          if (!v2Result.refunded) {
            // Late cancellation or no prior consume to refund. Treat as a
            // no-op (parity with legacy `success: true, debtRemoved: true`
            // when the session had no live debit).
            return { success: true, debtRemoved: true, creditType: v2Result.type ?? undefined };
          }
          // Clear creditDeductedAt on session_player to mark as refunded
          // (mirrors legacy behaviour so UI consumers stay in sync).
          await db.update(sessionPlayers)
            .set({ creditDeductedAt: null, creditTransactionId: null })
            .where(and(
              eq(sessionPlayers.sessionId, sessionId),
              eq(sessionPlayers.playerId, playerId),
            ));
          return { success: true, creditType: v2Result.type ?? "group" };
        } catch (v2Err: any) {
          console.error(`[RefundCredits][V2] refund failed for session ${sessionId} player ${playerId}:`, v2Err);
          return { success: false, reason: v2Err?.message ?? "v2_refund_error" };
        }
      }
    }

    const result: RefundResult = await (async (): Promise<RefundResult> => {
    // Find the original debit transaction for this session
    const transactions = await this.getCreditTransactionsBySession(sessionId);
    
    // First check for regular session_booking transactions
    let originalDebit = transactions.find(
      t => t.playerId === playerId && t.type === "debit" && t.reason === "session_booking"
    );
    
    // If no session_booking found, check for session_join_debt or session_debt (players without packages)
    if (!originalDebit) {
      const debtTransaction = transactions.find(
        t => t.playerId === playerId && t.type === "debit" && 
        (t.reason === "session_join_debt" || t.reason === "session_debt")
      );
      
      if (debtTransaction) {
        const meta = debtTransaction.metadata ? 
          (typeof debtTransaction.metadata === 'string' ? JSON.parse(debtTransaction.metadata) : debtTransaction.metadata) : {};
        
        if (meta.settled && meta.settledByPackage) {
          // Guard: Only refund if the player did NOT actually attend the session.
          // If the session is completed and the player has a session_players record,
          // the debt was legitimately consumed — do NOT restore the credit.
          const sessionRecord = await db.select({
            status: sessions.status,
          }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
          const sessionStatus = sessionRecord[0]?.status;

          const spRecord = await db.select({
            id: sessionPlayers.id,
            creditDeductedAt: sessionPlayers.creditDeductedAt,
          }).from(sessionPlayers)
            .where(and(
              eq(sessionPlayers.sessionId, sessionId),
              eq(sessionPlayers.playerId, playerId)
            ))
            .limit(1);
          // A player "attended" if and only if their session_players record
          // has creditDeductedAt set (the authoritative marker that a credit
          // was actually consumed for this session). We do NOT use session.status
          // because a completed session can still have unattended players.
          const playerAttended = spRecord.length > 0 && spRecord[0].creditDeductedAt !== null;

          if (playerAttended) {
            console.log(`[Refund] Skipping credit restore for player ${playerId} in session ${sessionId} — player attended (session status: ${sessionStatus}, creditDeductedAt: ${spRecord[0]?.creditDeductedAt})`);
            // Mark the debt as cancelled (session is being removed) but do NOT restore the package credit
            await db.update(creditTransactions)
              .set({ metadata: { ...meta, cancelled: true, cancelledReason: "session_cancelled_attended_no_refund" } })
              .where(eq(creditTransactions.id, debtTransaction.id));
            await db.update(sessionPlayers)
              .set({ creditDeductedAt: null, creditTransactionId: null })
              .where(and(
                eq(sessionPlayers.sessionId, sessionId),
                eq(sessionPlayers.playerId, playerId)
              ));
            return {
              success: true,
              creditType: debtTransaction.creditType || "group",
              debtRemoved: true,
            };
          }

          // This debt was already settled by a package purchase - need to refund the package credit
          const pkg = await this.getPackage(meta.settledByPackage);
          if (pkg) {
            const debtRefundAmount = Math.abs(Number(debtTransaction.amount)) || 1;
            await db.update(packages)
              .set({ remainingCredits: Number(pkg.remainingCredits) + debtRefundAmount })
              .where(eq(packages.id, pkg.id));
            
            // Also undo the debt_settlement transaction if exists
            if (meta.settledByTransactionId) {
              const existingMeta = await db.select({ metadata: creditTransactions.metadata })
                .from(creditTransactions)
                .where(eq(creditTransactions.id, meta.settledByTransactionId));
              if (existingMeta.length > 0) {
                const settleMeta = existingMeta[0].metadata ? 
                  (typeof existingMeta[0].metadata === 'string' ? JSON.parse(existingMeta[0].metadata) : existingMeta[0].metadata) : {};
                await db.update(creditTransactions)
                  .set({ metadata: { ...settleMeta, cancelled: true, cancelledReason: "session_cancelled" } })
                  .where(eq(creditTransactions.id, meta.settledByTransactionId));
              }
            }
          }
          // Mark the original debt as cancelled
          await db.update(creditTransactions)
            .set({ metadata: { ...meta, cancelled: true, cancelledReason: "session_cancelled" } })
            .where(eq(creditTransactions.id, debtTransaction.id));
        } else {
          // Unsettled debt - just mark as cancelled
          await db.update(creditTransactions)
            .set({ metadata: { ...meta, cancelled: true, cancelledReason: "session_cancelled" } })
            .where(eq(creditTransactions.id, debtTransaction.id));
        }
        
        // Clear session_player record
        await db.update(sessionPlayers)
          .set({ 
            creditDeductedAt: null,
            creditTransactionId: null,
          })
          .where(and(
            eq(sessionPlayers.sessionId, sessionId),
            eq(sessionPlayers.playerId, playerId)
          ));
        
        console.log(`[Refund] Cancelled debt transaction for player ${playerId} in session ${sessionId} (settled: ${!!meta.settled})`);
        return { 
          success: true, 
          creditType: debtTransaction.creditType || "group",
          debtRemoved: true
        };
      }
    }
    
    if (!originalDebit || !originalDebit.packageId) {
      return { success: false, reason: "no_original_transaction" };
    }
    
    // Check if already refunded (idempotency check)
    const existingRefund = transactions.find(t => {
      if (t.playerId !== playerId || t.type !== "credit" || t.reason !== "session_removal_refund") {
        return false;
      }
      // Parse metadata JSON to check originalTransactionId
      try {
        const meta = t.metadata ? JSON.parse(t.metadata) : {};
        return meta.originalTransactionId === originalDebit.id;
      } catch {
        return false;
      }
    });
    
    if (existingRefund) {
      // Still normalize session_player record in case previous refund left it in charged state
      await db.update(sessionPlayers)
        .set({ 
          creditDeductedAt: null,
          creditTransactionId: null,
        })
        .where(and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        ));
      return { success: true, creditType: originalDebit.creditType || "group", alreadyRefunded: true };
    }
    
    // Find the package and refund the credit
    const pkg = await this.getPackage(originalDebit.packageId, academyId);
    if (!pkg) {
      return { success: false, reason: "package_not_found" };
    }
    
    // Refund credit to package - use actual charged amount from original transaction
    const refundAmount = Math.abs(Number(originalDebit.amount)) || 1;
    const balanceBefore = Number(pkg.remainingCredits);
    const balanceAfter = balanceBefore + refundAmount;
    
    await db
      .update(packages)
      .set({ remainingCredits: balanceAfter })
      .where(eq(packages.id, pkg.id));
    
    // Log the refund transaction
    await this.createCreditTransaction({
      playerId,
      academyId: academyId || pkg.academyId,
      packageId: pkg.id,
      type: "credit",
      creditType: originalDebit.creditType || "group",
      amount: refundAmount,
      reason: "session_removal_refund",
      sessionId,
      balanceBefore,
      balanceAfter,
      metadata: JSON.stringify({
        originalTransactionId: originalDebit.id,
        refundedBy: "coach",
      }),
    });
    
    // Clear creditDeductedAt on session_player record to mark as refunded
    await db.update(sessionPlayers)
      .set({ 
        creditDeductedAt: null,
        creditTransactionId: null,
      })
      .where(and(
        eq(sessionPlayers.sessionId, sessionId),
        eq(sessionPlayers.playerId, playerId)
      ));
    
    return { 
      success: true, 
      creditType: originalDebit.creditType || "group"
    };
    })();

    // Phase 2 — Credit shadow-mode (Task #650). Fire-and-forget; never
    // blocks or affects the legacy result. Off by default — enable via
    // env `CREDIT_SHADOW_MODE=on`.
    if (result.success) {
      void (async () => {
        try {
          const { isShadowModeEnabled, shadowRefundAfterLegacy } = await import("./services/credit-shadow");
          if (!isShadowModeEnabled()) return;
          const spRows = await db.execute(sql`
            SELECT id FROM session_players
            WHERE session_id = ${sessionId} AND player_id = ${playerId}
            LIMIT 1
          `);
          const spRow = spRows.rows[0] as { id: string } | undefined;
          if (!spRow) return;
          await shadowRefundAfterLegacy(spRow.id, result);
        } catch (err) {
          console.error(`[RefundCredits] shadow refund failed for session ${sessionId} player ${playerId}:`, err);
        }
      })();
    }

    return result;
  },

  // ==================== PACKAGE TEMPLATES ====================
  async getPackageTemplates(academyId: string): Promise<PackageTemplate[]> {
    return db.select().from(packageTemplates)
      .where(eq(packageTemplates.academyId, academyId))
      .orderBy(asc(packageTemplates.sortOrder), asc(packageTemplates.name));
  },

  async getPackageTemplate(id: string, academyId?: string): Promise<PackageTemplate | undefined> {
    const conditions = [eq(packageTemplates.id, id)];
    if (academyId) {
      conditions.push(eq(packageTemplates.academyId, academyId));
    }
    const result = await db.select().from(packageTemplates).where(and(...conditions));
    return result[0];
  },

  async createPackageTemplate(data: InsertPackageTemplate): Promise<PackageTemplate> {
    const result = await db.insert(packageTemplates).values(data).returning();
    return result[0];
  },

  async updatePackageTemplate(id: string, data: Partial<InsertPackageTemplate>, academyId: string): Promise<PackageTemplate | undefined> {
    const result = await db.update(packageTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(packageTemplates.id, id), eq(packageTemplates.academyId, academyId)))
      .returning();
    return result[0];
  },

  async deletePackageTemplate(id: string, academyId: string): Promise<boolean> {
    const result = await db.delete(packageTemplates)
      .where(and(eq(packageTemplates.id, id), eq(packageTemplates.academyId, academyId)))
      .returning();
    return result.length > 0;
  },

  // ==================== SESSIONS ====================
  async getSession(id: string, academyId?: string): Promise<Session | undefined> {
    const conditions = [eq(sessions.id, id)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    const result = await db.select().from(sessions).where(and(...conditions));
    return result[0];
  },

  async getSessionsByCoach(coachId: string, startDate: Date, endDate: Date, academyId?: string): Promise<Session[]> {
    const conditions = [
      eq(sessions.coachId, coachId),
      gte(sessions.startTime, startDate),
      lte(sessions.startTime, endDate),
      ne(sessions.status, "cancelled")
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async getAllSessionsByCoach(coachId: string, academyId?: string): Promise<Session[]> {
    const conditions = [eq(sessions.coachId, coachId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async getCoachSessionsInRange(coachId: string, academyId: string, startDate: Date, endDate: Date): Promise<Session[]> {
    return db.select().from(sessions).where(
      and(
        eq(sessions.coachId, coachId),
        eq(sessions.academyId, academyId),
        ne(sessions.status, "cancelled"),
        gte(sessions.startTime, startDate),
        lte(sessions.endTime, endDate)
      )
    );
  },

  async getSessionsBySeriesId(seriesId: string): Promise<Session[]> {
    return db.select().from(sessions).where(eq(sessions.seriesId, seriesId));
  },

  async getSessionsByDateRange(startDate: Date, endDate: Date, academyId?: string): Promise<Session[]> {
    const conditions = [
      gte(sessions.startTime, startDate),
      lte(sessions.startTime, endDate)
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async getAllSessions(academyId: string): Promise<Session[]> {
    return db.select().from(sessions).where(eq(sessions.academyId, academyId));
  },

  async getSessionsByAcademy(academyId: string): Promise<Session[]> {
    return db.select().from(sessions).where(eq(sessions.academyId, academyId));
  },

  async getPlayersByCoach(coachId: string): Promise<Player[]> {
    return db.select().from(players).where(eq(players.coachId, coachId));
  },

  async getFeedbackCountByCoach(coachId: string, startDate: Date, endDate: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(sessionFeedback)
      .innerJoin(sessions, eq(sessionFeedback.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.coachId, coachId),
          gte(sessions.startTime, startDate),
          lte(sessions.startTime, endDate)
        )
      );
    return result[0]?.count || 0;
  },

  async getBlockedSessions(coachId: string, startDate: Date, endDate: Date, academyId?: string): Promise<Session[]> {
    const conditions = [
      ne(sessions.coachId, coachId),
      gte(sessions.startTime, startDate),
      lte(sessions.startTime, endDate)
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async createSession(data: InsertSession): Promise<Session> {
    const result = await db.insert(sessions).values(data).returning();
    return result[0];
  },

  async updateSession(id: string, data: Partial<InsertSession>): Promise<Session | undefined> {
    // Filter out undefined values to prevent SQL syntax errors
    const cleanData: Partial<InsertSession> = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (value !== undefined) {
        (cleanData as any)[key] = value;
      }
    }
    
    // Return existing session if no valid updates provided
    if (Object.keys(cleanData).length === 0) {
      const existing = await db.select().from(sessions).where(eq(sessions.id, id));
      return existing[0];
    }
    const result = await db
      .update(sessions)
      .set(cleanData)
      .where(eq(sessions.id, id))
      .returning();
    return result[0];
  },

  async cancelSession(id: string): Promise<Session | undefined> {
    const result = await db
      .update(sessions)
      .set({ status: "cancelled" })
      .where(eq(sessions.id, id))
      .returning();

    // Cancel any unsettled debt transactions for all players in this session.
    // We cancel for ALL players regardless of creditDeductedAt so that debts created
    // by ensureCreditProcessed (which DOES set creditDeductedAt) are also cleaned up.
    const players = await db
      .select({ playerId: sessionPlayers.playerId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, id));

    for (const sp of players) {
      await this.cancelSessionDebt(sp.playerId, id, "session_cancelled");
    }

    return result[0];
  },

  // Conflict checking
  async checkCoachConflict(coachId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string, courtId?: string): Promise<boolean> {
    const conditions = [
      eq(sessions.coachId, coachId),
      eq(sessions.status, "scheduled"),
      or(
        and(lt(sessions.startTime, endTime), gt(sessions.endTime, startTime))
      )
    ];
    
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    
    const conflicts = await db.select().from(sessions).where(and(...conditions));
    
    let filteredConflicts = excludeSessionId 
      ? conflicts.filter(s => s.id !== excludeSessionId) 
      : conflicts;
    
    if (filteredConflicts.length > 0) {
      const validConflicts = [];
      for (const conflict of filteredConflicts) {
        if (conflict.seriesId) {
          const series = await db.select({ status: coachingSeries.status }).from(coachingSeries).where(eq(coachingSeries.id, conflict.seriesId)).limit(1);
          if (series.length > 0 && (series[0].status === "ended" || series[0].status === "completed" || series[0].status === "deleted")) {
            continue;
          }
        }
        validConflicts.push(conflict);
      }
      if (validConflicts.length === 0) {
        filteredConflicts = validConflicts;
      } else {
        return true;
      }
    }
    
    // Check travel time conflicts - sessions that need travel buffer
    if (courtId && academyId) {
      // Get the court's location
      const court = await db.select().from(courts).where(eq(courts.id, courtId)).limit(1);
      const newSessionLocationId = court[0]?.locationId;
      
      if (newSessionLocationId) {
        // Get all coach sessions on the same day (wider window for travel time check)
        const dayStart = new Date(startTime);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(startTime);
        dayEnd.setHours(23, 59, 59, 999);
        
        const daySessions = await db
          .select()
          .from(sessions)
          .where(and(
            eq(sessions.coachId, coachId),
            eq(sessions.status, "scheduled"),
            gte(sessions.startTime, dayStart),
            lte(sessions.endTime, dayEnd)
          ));
        
        const filteredDaySessions = excludeSessionId 
          ? daySessions.filter(s => s.id !== excludeSessionId) 
          : daySessions;
        
        // Get travel times for this coach
        const travelTimes = await db
          .select()
          .from(locationTravelTimes)
          .where(eq(locationTravelTimes.coachId, coachId));
        
        for (const existingSession of filteredDaySessions) {
          if (!existingSession.courtId) continue;
          
          // Get existing session's location
          const existingCourt = await db.select().from(courts).where(eq(courts.id, existingSession.courtId)).limit(1);
          const existingLocationId = existingCourt[0]?.locationId;
          
          if (!existingLocationId || existingLocationId === newSessionLocationId) continue;
          
          // Find travel time between these locations (check both directions)
          const travelTime = travelTimes.find(tt => 
            (tt.fromLocationId === existingLocationId && tt.toLocationId === newSessionLocationId) ||
            (tt.fromLocationId === newSessionLocationId && tt.toLocationId === existingLocationId)
          );
          
          if (!travelTime) continue;
          
          const travelMinutes = travelTime.travelTimeMinutes;
          const existingStart = new Date(existingSession.startTime);
          const existingEnd = new Date(existingSession.endTime);
          
          // Check if new session starts too soon after existing session ends (need travel buffer)
          // existing ends at 8:00, travel is 30 min, new can't start before 8:30
          const bufferAfterExisting = new Date(existingEnd.getTime() + travelMinutes * 60000);
          if (startTime < bufferAfterExisting && endTime > existingEnd) {
            return true; // Conflict: not enough travel time after existing session
          }
          
          // Check if new session ends too close before existing session starts (need travel buffer)
          // existing starts at 9:00, travel is 30 min, new must end before 8:30
          const bufferBeforeExisting = new Date(existingStart.getTime() - travelMinutes * 60000);
          if (endTime > bufferBeforeExisting && startTime < existingStart) {
            return true; // Conflict: not enough travel time before existing session
          }
        }
      }
    }
    
    return false;
  },

  async checkCourtConflict(courtId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string): Promise<boolean> {
    const conditions = [
      eq(sessions.courtId, courtId),
      eq(sessions.status, "scheduled"),
      or(
        and(lt(sessions.startTime, endTime), gt(sessions.endTime, startTime))
      )
    ];
    
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    
    let conflicts = await db.select().from(sessions).where(and(...conditions));
    
    if (excludeSessionId) {
      conflicts = conflicts.filter(s => s.id !== excludeSessionId);
    }
    
    if (conflicts.length > 0) {
      const validConflicts = [];
      for (const conflict of conflicts) {
        if (conflict.seriesId) {
          const series = await db.select({ status: coachingSeries.status }).from(coachingSeries).where(eq(coachingSeries.id, conflict.seriesId)).limit(1);
          if (series.length > 0 && (series[0].status === "ended" || series[0].status === "completed" || series[0].status === "deleted")) {
            continue;
          }
        }
        validConflicts.push(conflict);
      }
      return validConflicts.length > 0;
    }
    return false;
  },

  async checkPlayerConflict(playerId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string): Promise<boolean> {
    const playerSessions = await db
      .select({ sessionId: sessionPlayers.sessionId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));

    if (playerSessions.length === 0) return false;

    const sessionIds = playerSessions.map(ps => ps.sessionId).filter((id): id is string => id !== null);
    if (sessionIds.length === 0) return false;
    
    const baseConditions = [
      inArray(sessions.id, sessionIds),
      eq(sessions.status, "scheduled"),
      or(
        and(lt(sessions.startTime, endTime), gt(sessions.endTime, startTime))
      )
    ];
    
    if (academyId) {
      baseConditions.push(eq(sessions.academyId, academyId));
    }
    
    const conflicts = await db
      .select()
      .from(sessions)
      .where(and(...baseConditions));
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  // ==================== SESSION PLAYERS ====================
  async getSessionPlayers(sessionId: string): Promise<SessionPlayer[]> {
    return db.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId));
  },

  async getSessionPlayersBatch(sessionIds: string[]): Promise<SessionPlayer[]> {
    if (sessionIds.length === 0) return [];
    return db.select().from(sessionPlayers).where(inArray(sessionPlayers.sessionId, sessionIds));
  },

  async getSessionPlayer(sessionId: string, playerId: string): Promise<SessionPlayer | null> {
    const result = await db
      .select()
      .from(sessionPlayers)
      .where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      );
    return result[0] || null;
  },

  async updateSessionPlayer(id: string, data: Partial<InsertSessionPlayer>): Promise<SessionPlayer | null> {
    const result = await db
      .update(sessionPlayers)
      .set(data)
      .where(eq(sessionPlayers.id, id))
      .returning();
    return result[0] || null;
  },

  async getSessionPlayersWithPlayerInfo(sessionId: string): Promise<Array<SessionPlayer & { player: { id: string; name: string; ballLevel: string | null } | null }>> {
    const result = await db
      .select({
        sessionPlayer: sessionPlayers,
        player: {
          id: players.id,
          name: players.name,
          ballLevel: players.ballLevel,
        },
      })
      .from(sessionPlayers)
      .leftJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, sessionId));
    
    return result.map(r => ({
      ...r.sessionPlayer,
      player: r.player,
    }));
  },

  async getPlayerLastSession(playerId: string, academyId?: string): Promise<Session | null> {
    // Get all session IDs for this player
    const playerSessionEntries = await db
      .select({ sessionId: sessionPlayers.sessionId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));
    
    const sessionIds = playerSessionEntries
      .map(ps => ps.sessionId)
      .filter((id): id is string => id !== null);
    
    if (sessionIds.length === 0) return null;
    
    // Find the most recent PAST session (not future scheduled sessions)
    const now = new Date();
    const conditions = [
      inArray(sessions.id, sessionIds),
      lte(sessions.startTime, now),
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    
    const result = await db
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.startTime))
      .limit(1);
    
    return result[0] || null;
  },

  async getPlayersLastSessions(playerIds: string[]): Promise<Map<string, Session>> {
    if (playerIds.length === 0) return new Map();
    
    const now = new Date();
    
    // Single query to get last session for each player using a subquery
    const result = await db
      .select({
        playerId: sessionPlayers.playerId,
        sessionId: sessions.id,
        startTime: sessions.startTime,
        title: sessions.title,
        sessionType: sessions.sessionType,
        status: sessions.status,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        inArray(sessionPlayers.playerId, playerIds),
        lte(sessions.startTime, now)
      ))
      .orderBy(desc(sessions.startTime));
    
    // Build map with first (most recent) session per player
    const lastSessionMap = new Map<string, Session>();
    for (const row of result) {
      if (!row.playerId || lastSessionMap.has(row.playerId)) continue;
      lastSessionMap.set(row.playerId, {
        id: row.sessionId,
        startTime: row.startTime,
        title: row.title,
        sessionType: row.sessionType,
        status: row.status,
      } as Session);
    }
    
    return lastSessionMap;
  },

  async getSessionPlayersWithDetails(sessionId: string, academyId?: string): Promise<Array<{
    id: string;
    name: string;
    level: string | null;
    ballLevel: string | null;
    skillLevel: number | null;
    status: string | null;
    lateMinutes: number | null;
    absentReason: string | null;
  }>> {
    const conditions = [eq(sessionPlayers.sessionId, sessionId)];
    if (academyId) {
      conditions.push(eq(players.academyId, academyId));
    }
    
    const result = await db
      .select({
        id: players.id,
        name: players.name,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        status: sessionPlayers.attendanceStatus,
        lateMinutes: sessionPlayers.lateMinutes,
        absentReason: sessionPlayers.absenceReason,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(and(...conditions));
    
    return result.map(p => ({
      ...p,
      level: p.ballLevel || "green",
    }));
  },

  // UNIFIED SESSION ROSTER - Single source of truth for session players
  // Combines series players (members) with session-specific overrides (attendance, guests)
  async getSessionRoster(sessionId: string, seriesId: string | null, academyId?: string): Promise<Array<{
    id: string;
    name: string;
    level: string | null;
    ballLevel: string | null;
    skillLevel: number | null;
    status: string | null;
    lateMinutes: number | null;
    absentReason: string | null;
    isGuest: boolean;
    fromSeries: boolean;
  }>> {
    // Step 1: Get session-specific player records (attendance overrides, guests)
    const sessionPlayerRecords = await db
      .select({
        playerId: sessionPlayers.playerId,
        status: sessionPlayers.attendanceStatus,
        lateMinutes: sessionPlayers.lateMinutes,
        absentReason: sessionPlayers.absenceReason,
        isGuest: sessionPlayers.isGuest,
      })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));

    // Create a map of session-specific overrides
    const sessionOverrides = new Map<string, {
      status: string | null;
      lateMinutes: number | null;
      absentReason: string | null;
      isGuest: boolean | null;
    }>();
    
    for (const sp of sessionPlayerRecords) {
      if (sp.playerId) {
        sessionOverrides.set(sp.playerId, {
          status: sp.status,
          lateMinutes: sp.lateMinutes,
          absentReason: sp.absentReason,
          isGuest: sp.isGuest,
        });
      }
    }

    const roster: Array<{
      id: string;
      name: string;
      level: string | null;
      ballLevel: string | null;
      skillLevel: number | null;
      status: string | null;
      lateMinutes: number | null;
      absentReason: string | null;
      isGuest: boolean;
      fromSeries: boolean;
    }> = [];

    // Step 2: If session has a series, get series players as the base roster
    if (seriesId) {
      const seriesPlayersList = await db
        .select({
          playerId: seriesPlayers.playerId,
          playerName: players.name,
          playerBallLevel: players.ballLevel,
          playerSkillLevel: players.skillLevel,
          seriesStatus: seriesPlayers.status,
        })
        .from(seriesPlayers)
        .innerJoin(players, eq(seriesPlayers.playerId, players.id))
        .where(and(
          eq(seriesPlayers.seriesId, seriesId),
          eq(seriesPlayers.status, "active")
        ));

      for (const sp of seriesPlayersList) {
        const override = sessionOverrides.get(sp.playerId);
        roster.push({
          id: sp.playerId,
          name: sp.playerName,
          level: sp.playerBallLevel || "green",
          ballLevel: sp.playerBallLevel,
          skillLevel: sp.playerSkillLevel,
          status: override?.status || null,
          lateMinutes: override?.lateMinutes || null,
          absentReason: override?.absentReason || null,
          isGuest: false,
          fromSeries: true,
        });
        // Remove from overrides map so we can add remaining guests/extras
        sessionOverrides.delete(sp.playerId);
      }
    }

    // Step 3: Add session-specific players (guests, or standalone session players not in series)
    for (const [playerId, override] of sessionOverrides) {
      // Fetch player details
      const playerData = await db
        .select({
          id: players.id,
          name: players.name,
          ballLevel: players.ballLevel,
          skillLevel: players.skillLevel,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (playerData.length > 0) {
        const p = playerData[0];
        roster.push({
          id: p.id,
          name: override.isGuest ? `${p.name} (Guest)` : p.name,
          level: p.ballLevel || "green",
          ballLevel: p.ballLevel,
          skillLevel: p.skillLevel,
          status: override.status,
          lateMinutes: override.lateMinutes,
          absentReason: override.absentReason,
          isGuest: override.isGuest || false,
          fromSeries: false,
        });
      }
    }

    return roster;
  },

  async addPlayerToSession(data: InsertSessionPlayer): Promise<SessionPlayer> {
    // Check if player is already in the session to prevent duplicates
    if (data.sessionId && data.playerId) {
      const existing = await db
        .select()
        .from(sessionPlayers)
        .where(
          and(
            eq(sessionPlayers.sessionId, data.sessionId),
            eq(sessionPlayers.playerId, data.playerId)
          )
        );
      if (existing.length > 0) {
        return existing[0]; // Return existing entry instead of creating duplicate
      }
    }
    const result = await db.insert(sessionPlayers).values(data).returning();
    return result[0];
  },

  async removePlayerFromSession(sessionId: string, playerId: string): Promise<void> {
    await db
      .delete(sessionPlayers)
      .where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      );
  },

  async updateAttendance(
    sessionId: string,
    playerId: string,
    status: string,
    lateMinutes?: number,
    absenceReason?: string
  ): Promise<SessionPlayer | undefined> {
    // Use UPSERT pattern: insert if not exists, update if exists
    const existing = await db.select().from(sessionPlayers)
      .where(and(
        eq(sessionPlayers.sessionId, sessionId),
        eq(sessionPlayers.playerId, playerId)
      ));
    
    let result: SessionPlayer | undefined;

    if (existing.length > 0) {
      // Update existing record
      const rows = await db
        .update(sessionPlayers)
        .set({
          attendanceStatus: status,
          lateMinutes,
          absenceReason,
        })
        .where(
          and(
            eq(sessionPlayers.sessionId, sessionId),
            eq(sessionPlayers.playerId, playerId)
          )
        )
        .returning();
      result = rows[0];
    } else {
      // Insert new record
      const rows = await db
        .insert(sessionPlayers)
        .values({
          id: randomUUID(),
          sessionId,
          playerId,
          attendanceStatus: status,
          lateMinutes,
          absenceReason,
          isGuest: false,
        })
        .returning();
      result = rows[0];
      console.log(`[Attendance] Created new session_player record for session ${sessionId}, player ${playerId}, status ${status}`);
    }

    // CRITICAL: When attendance changes to holiday or vacation, cancel any existing debt.
    // A player on holiday/vacation should never owe for a session they legitimately skipped.
    // This covers the case where a debt was created at session-time (player was absent)
    // and the coach later corrects attendance to holiday/vacation.
    if (status === "holiday" || status === "vacation") {
      const cancelReason = status === "vacation" ? "attendance_changed_to_vacation" : "attendance_changed_to_holiday";
      const cancelResult = await this.cancelSessionDebt(playerId, sessionId, cancelReason);
      if (cancelResult.cancelled) {
        console.log(`[Attendance] Auto-cancelled ${cancelResult.amount} credit debt for player ${playerId} session ${sessionId} — status changed to ${status}`);
      }
    }

    return result;
  },
  
  // Mark attendance for backfill - returns object with isNewAttendance flag
  // isNewAttendance: true only if this call actually transitioned to 'present' (consume credit)
  // isNewAttendance: false if already was 'present' (don't consume credit again)
  async markAttendance(
    sessionId: string,
    playerId: string,
    attended: boolean,
    academyId?: string
  ): Promise<{ record: SessionPlayer; isNewAttendance: boolean } | null> {
    // Check if player already has attendance status for this session
    const existing = await db.select().from(sessionPlayers)
      .where(and(
        eq(sessionPlayers.sessionId, sessionId),
        eq(sessionPlayers.playerId, playerId)
      ));
    
    const status = attended ? 'present' : 'absent';
    
    if (existing.length > 0) {
      // If already marked as 'present', this is a duplicate - don't consume credits
      if (existing[0].attendanceStatus === 'present' && attended) {
        return { record: existing[0], isNewAttendance: false };
      }
      
      // Update existing entry
      const result = await db.update(sessionPlayers)
        .set({ attendanceStatus: status })
        .where(and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        ))
        .returning();
      // This is new attendance if we're marking as present (transition from absent/null to present)
      return result[0] ? { record: result[0], isNewAttendance: attended } : null;
    } else {
      // Insert new session player entry
      const result = await db.insert(sessionPlayers)
        .values({
          sessionId,
          playerId,
          attendanceStatus: status,
        })
        .returning();
      // New record marked as present is new attendance
      return result[0] ? { record: result[0], isNewAttendance: attended } : null;
    }
  },

  // ==================== PLAYER HOLIDAYS ====================
  async getPlayerHolidays(playerId: string, academyId?: string): Promise<PlayerHoliday[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db.select().from(playerHolidays).where(eq(playerHolidays.playerId, playerId));
  },

  async createPlayerHoliday(data: InsertPlayerHoliday): Promise<PlayerHoliday> {
    const result = await db.insert(playerHolidays).values(data).returning();
    return result[0];
  },

  // ==================== SESSION FEEDBACK ====================
  async getSessionFeedback(sessionId: string): Promise<SessionFeedback | undefined> {
    const result = await db.select().from(sessionFeedback).where(eq(sessionFeedback.sessionId, sessionId));
    return result[0];
  },

  async createSessionFeedback(data: InsertSessionFeedback): Promise<SessionFeedback> {
    const result = await db.insert(sessionFeedback).values(data).returning();
    return result[0];
  },

  // ==================== AUDIT LOGS ====================
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values(data).returning();
    return result[0];
  },

  async getAuditLogs(entityType: string, entityId?: string): Promise<AuditLog[]> {
    const conditions = [eq(auditLogs.entityType, entityType)];
    if (entityId) {
      conditions.push(eq(auditLogs.entityId, entityId));
    }
    return db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.timestamp));
  },

  async getAuditLogsByAcademy(academyId: string, filters?: {
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditLog[]> {
    const allLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.academyId, academyId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(filters?.limit || 100);
    
    return allLogs.filter(log => {
      if (filters?.entityType && log.entityType !== filters.entityType) return false;
      if (filters?.startDate && log.timestamp && new Date(log.timestamp) < filters.startDate) return false;
      if (filters?.endDate && log.timestamp && new Date(log.timestamp) > filters.endDate) return false;
      return true;
    });
  },

  // ==================== OFFLINE QUEUE ====================
  async addToOfflineQueue(data: InsertOfflineQueue): Promise<OfflineQueue> {
    const result = await db.insert(offlineQueue).values(data).returning();
    return result[0];
  },

  async getUnsynced(coachId: string): Promise<OfflineQueue[]> {
    return db
      .select()
      .from(offlineQueue)
      .where(and(eq(offlineQueue.coachId, coachId), eq(offlineQueue.synced, false)));
  },

  async markSynced(id: string): Promise<void> {
    await db.update(offlineQueue).set({ synced: true }).where(eq(offlineQueue.id, id));
  },

  // ==================== PLAYER NOTES ====================
  async getPlayerNotes(playerId: string, academyId?: string): Promise<PlayerNote[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(playerNotes)
      .where(eq(playerNotes.playerId, playerId))
      .orderBy(desc(playerNotes.isPinned), desc(playerNotes.createdAt));
  },

  async createPlayerNote(data: InsertPlayerNote): Promise<PlayerNote> {
    const noteData = {
      ...data,
      category: data.category || "general",
      isPinned: data.isPinned ?? false,
    };
    const result = await db.insert(playerNotes).values(noteData).returning();
    return result[0];
  },

  async deletePlayerNote(id: string): Promise<void> {
    await db.delete(playerNotes).where(eq(playerNotes.id, id));
  },

  async toggleNotePin(id: string, isPinned: boolean): Promise<PlayerNote> {
    const result = await db
      .update(playerNotes)
      .set({ isPinned: isPinned })
      .where(eq(playerNotes.id, id))
      .returning();
    return result[0];
  },

  // ==================== PLAYER PROGRESS ====================
  async getPlayerProgress(playerId: string, academyId?: string): Promise<PlayerProgress[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, playerId))
      .orderBy(desc(playerProgress.createdAt));
  },

  async createPlayerProgress(data: InsertPlayerProgress): Promise<PlayerProgress> {
    const result = await db.insert(playerProgress).values(data).returning();
    return result[0];
  },

  async getProgressSummary(playerId: string, academyId?: string): Promise<{ skillArea: string; avgRating: number; trend: string; glowScore?: number; domainScores?: { domain: string; score: number; trend: string }[] }[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    const progress = await db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, playerId))
      .orderBy(desc(playerProgress.createdAt));
    
    const skillAreas = ["forehand", "backhand", "serve", "volley", "movement", "mental"];
    const skills = skillAreas.map(area => {
      const areaProgress = progress.filter(p => p.skillArea === area);
      const avgRating = areaProgress.length > 0 
        ? areaProgress.reduce((sum, p) => sum + (p.rating || 0), 0) / areaProgress.length 
        : 0;
      const latestTrend = areaProgress[0]?.trend || "stable";
      return { skillArea: area, avgRating: Math.round(avgRating * 10) / 10, trend: latestTrend };
    });

    // Get domain skill states for weighted Glow Score
    const domainStatesWithNames = await db
      .select({
        progressValue: playerSkillState.progressValue,
        trend: playerSkillState.trend,
        domainName: skillDomains.name,
      })
      .from(playerSkillState)
      .leftJoin(skillDomains, eq(playerSkillState.domainId, skillDomains.id))
      .where(eq(playerSkillState.playerId, playerId));

    // Domain weights: Technical 30%, Mental 20%, Physical 20%, Social 15%, Tactical 15%
    const domainWeights: Record<string, number> = {
      technical: 0.30,
      mental: 0.20,
      physical: 0.20,
      social: 0.15,
      tactical: 0.15,
    };

    // Map domain names to scores
    const domainScores = ["technical", "mental", "physical", "social", "tactical"].map(domain => {
      const state = domainStatesWithNames.find(s => s.domainName?.toLowerCase() === domain);
      return {
        domain,
        score: state?.progressValue || 0,
        trend: state?.trend || "stable",
      };
    });

    // Calculate weighted Glow Score (0-100)
    let glowScore = 0;
    domainScores.forEach(d => {
      const weight = domainWeights[d.domain] || 0;
      glowScore += d.score * weight;
    });
    glowScore = Math.round(glowScore);

    // Return backward-compatible array with glowScore and domainScores on first element
    if (skills.length > 0) {
      return skills.map((skill, index) => 
        index === 0 
          ? { ...skill, glowScore, domainScores } 
          : skill
      );
    }
    return skills;
  },

  // ==================== SESSION TEMPLATES ====================
  async getSessionTemplates(coachId: string): Promise<SessionTemplate[]> {
    return db
      .select()
      .from(sessionTemplates)
      .where(eq(sessionTemplates.coachId, coachId))
      .orderBy(desc(sessionTemplates.createdAt));
  },

  async createSessionTemplate(data: InsertSessionTemplate): Promise<SessionTemplate> {
    const result = await db.insert(sessionTemplates).values(data).returning();
    return result[0];
  },

  async deleteSessionTemplate(id: string): Promise<void> {
    await db.delete(sessionTemplates).where(eq(sessionTemplates.id, id));
  },

  // ==================== COACHING SERIES ====================
  // Series-first approach: coaches manage training blocks, not individual sessions
  
  async getCoachingSeries(coachId: string, academyId?: string): Promise<CoachingSeries[]> {
    const conditions = [eq(coachingSeries.coachId, coachId)];
    if (academyId) {
      conditions.push(eq(coachingSeries.academyId, academyId));
    }
    return db
      .select()
      .from(coachingSeries)
      .where(and(...conditions))
      .orderBy(desc(coachingSeries.createdAt));
  },

  async getCoachingSeriesById(id: string): Promise<CoachingSeries | undefined> {
    const result = await db.select().from(coachingSeries).where(eq(coachingSeries.id, id));
    return result[0];
  },

  async getActiveCoachingSeries(coachId: string, academyId?: string): Promise<CoachingSeries[]> {
    const conditions = [
      eq(coachingSeries.coachId, coachId),
      eq(coachingSeries.status, "active")
    ];
    if (academyId) {
      conditions.push(eq(coachingSeries.academyId, academyId));
    }
    return db
      .select()
      .from(coachingSeries)
      .where(and(...conditions))
      .orderBy(asc(coachingSeries.dayOfWeek), asc(coachingSeries.startTime));
  },

  async createCoachingSeries(data: InsertCoachingSeries): Promise<CoachingSeries> {
    const result = await db.insert(coachingSeries).values(data).returning();
    return result[0];
  },

  async updateCoachingSeries(id: string, data: Partial<InsertCoachingSeries>): Promise<CoachingSeries | undefined> {
    const result = await db
      .update(coachingSeries)
      .set(data)
      .where(eq(coachingSeries.id, id))
      .returning();
    return result[0];
  },

  async pauseCoachingSeries(id: string): Promise<CoachingSeries | undefined> {
    const result = await db
      .update(coachingSeries)
      .set({ status: "paused", pausedAt: new Date() })
      .where(eq(coachingSeries.id, id))
      .returning();
    return result[0];
  },

  async resumeCoachingSeries(id: string): Promise<CoachingSeries | undefined> {
    const result = await db
      .update(coachingSeries)
      .set({ status: "active", pausedAt: null })
      .where(eq(coachingSeries.id, id))
      .returning();
    return result[0];
  },

  async endCoachingSeries(id: string): Promise<CoachingSeries | undefined> {
    const now = new Date();
    
    const futureSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(
        or(eq(sessions.seriesId, id), eq(sessions.recurringGroupId, id)),
        eq(sessions.status, "scheduled"),
        gte(sessions.startTime, now)
      ));
    
    const futureSessionIds = futureSessions.map(s => s.id);
    
    // Step 2: Delete future sessions and their related data (credits not yet used)
    if (futureSessionIds.length > 0) {
      await db.transaction(async (tx) => {
        // Delete credit transactions for future sessions (these are pending/unused)
        await tx.delete(creditTransactions).where(inArray(creditTransactions.sessionId, futureSessionIds));

        // Delete session players for future sessions
        await tx.delete(sessionPlayers).where(inArray(sessionPlayers.sessionId, futureSessionIds));

        // Nullify booking_requests.sessionId before deleting future sessions (FK constraint)
        await tx.update(bookingRequests).set({ sessionId: null }).where(inArray(bookingRequests.sessionId, futureSessionIds));

        // Delete the future sessions themselves
        await tx.delete(sessions).where(inArray(sessions.id, futureSessionIds));
      });

      console.log(`[EndSeries] Deleted ${futureSessionIds.length} future scheduled sessions for series ${id}`);
    }
    
    // Step 3: Mark series as ended (completed sessions remain intact!)
    const result = await db
      .update(coachingSeries)
      .set({ status: "ended", endedAt: now })
      .where(eq(coachingSeries.id, id))
      .returning();
    
    return result[0];
  },

  async deleteCoachingSeries(id: string): Promise<void> {
    const seriesSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(or(
        eq(sessions.seriesId, id),
        eq(sessions.recurringGroupId, id)
      ));
    
    const sessionIds = seriesSessions.map(s => s.id);
    console.log(`[DeleteSeries] Found ${sessionIds.length} sessions for series ${id} (via seriesId + recurringGroupId)`);
    
    await db.transaction(async (tx) => {
      if (sessionIds.length > 0) {
        await tx.delete(xpTransactions).where(inArray(xpTransactions.sessionId, sessionIds));
        await tx.delete(coachXpTransactions).where(inArray(coachXpTransactions.sessionId, sessionIds));
        await tx.delete(creditTransactions).where(inArray(creditTransactions.sessionId, sessionIds));
        await tx.delete(sessionPlayers).where(inArray(sessionPlayers.sessionId, sessionIds));
        // Nullify booking_requests.sessionId before deleting sessions (FK constraint)
        await tx.update(bookingRequests).set({ sessionId: null }).where(inArray(bookingRequests.sessionId, sessionIds));
        await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
      }
      
      await tx.delete(seriesPlayers).where(eq(seriesPlayers.seriesId, id));
      await tx.delete(coachingSeries).where(eq(coachingSeries.id, id));
    });
  },

  // ==================== SERIES PLAYERS ====================
  async getSeriesPlayers(seriesId: string): Promise<SeriesPlayer[]> {
    return db
      .select()
      .from(seriesPlayers)
      .where(eq(seriesPlayers.seriesId, seriesId))
      .orderBy(asc(seriesPlayers.joinedAt));
  },

  async getSeriesPlayersBatch(seriesIds: string[]): Promise<SeriesPlayer[]> {
    if (seriesIds.length === 0) return [];
    return db.select().from(seriesPlayers).where(inArray(seriesPlayers.seriesId, seriesIds));
  },

  async getSeriesPlayersWithDetails(seriesId: string): Promise<Array<{
    playerId: string;
    playerName: string | null;
    playerBallLevel: string | null;
    status: string | null;
    joinedAt: Date | null;
  }>> {
    const result = await db
      .select({
        playerId: seriesPlayers.playerId,
        playerName: players.name,
        playerBallLevel: players.ballLevel,
        status: seriesPlayers.status,
        joinedAt: seriesPlayers.joinedAt,
      })
      .from(seriesPlayers)
      .innerJoin(players, eq(seriesPlayers.playerId, players.id))
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.status, "active")
      ))
      .orderBy(asc(seriesPlayers.joinedAt));
    
    return result;
  },

  async getSeriesPlayerAttendanceSummary(seriesId: string): Promise<Map<string, number>> {
    const seriesSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.seriesId, seriesId));
    
    if (seriesSessions.length === 0) {
      return new Map();
    }
    
    const sessionIds = seriesSessions.map(s => s.id);
    
    const attendanceCounts = await db
      .select({
        playerId: sessionPlayers.playerId,
        presentCount: count(),
      })
      .from(sessionPlayers)
      .where(and(
        inArray(sessionPlayers.sessionId, sessionIds),
        or(
          eq(sessionPlayers.attendanceStatus, "present"),
          eq(sessionPlayers.attendanceStatus, "late")
        )
      ))
      .groupBy(sessionPlayers.playerId);
    
    const result = new Map<string, number>();
    for (const row of attendanceCounts) {
      if (row.playerId) {
        result.set(row.playerId, Number(row.presentCount));
      }
    }
    return result;
  },

  async addPlayerToSeries(data: InsertSeriesPlayer): Promise<SeriesPlayer> {
    const result = await db.insert(seriesPlayers).values(data).returning();
    return result[0];
  },

  async removePlayerFromSeries(seriesId: string, playerId: string): Promise<void> {
    await db
      .delete(seriesPlayers)
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ));
  },

  async removePlayerFromFutureSeriesSessions(seriesId: string, playerId: string, effectiveDate: Date, academyId: string): Promise<number> {
    // Find all future sessions of this series
    const futureSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(
        eq(sessions.seriesId, seriesId),
        gte(sessions.startTime, effectiveDate),
        ne(sessions.status, "cancelled")
      ));

    if (futureSessions.length === 0) return 0;

    const sessionIds = futureSessions.map(s => s.id);
    let removedCount = 0;

    // Remove player from each future session and refund credits
    for (const sessionId of sessionIds) {
      // Check if player is enrolled in this session
      const enrollment = await db
        .select()
        .from(sessionPlayers)
        .where(and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        ))
        .limit(1);

      if (enrollment.length > 0) {
        // Refund credits for this session
        await this.refundCreditsForSession(playerId, sessionId, academyId);

        // Nullify FK references in credit_transactions before deleting the session_player row
        // to avoid FK constraint violation (credit_transactions_session_player_id_fkey)
        const sessionPlayerId = enrollment[0].id;
        await db
          .update(creditTransactions)
          .set({ sessionPlayerId: null })
          .where(eq(creditTransactions.sessionPlayerId, sessionPlayerId));

        // Remove from session_players
        await db
          .delete(sessionPlayers)
          .where(and(
            eq(sessionPlayers.sessionId, sessionId),
            eq(sessionPlayers.playerId, playerId)
          ));
        removedCount++;
      }
    }

    console.log(`[RemoveFutureSessions] Removed player ${playerId} from ${removedCount}/${sessionIds.length} future sessions of series ${seriesId}`);
    return removedCount;
  },

  async updateSeriesPlayer(seriesId: string, playerId: string, data: Partial<InsertSeriesPlayer>): Promise<SeriesPlayer | undefined> {
    const result = await db
      .update(seriesPlayers)
      .set(data)
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ))
      .returning();
    return result[0];
  },

  async getPlayerSeries(playerId: string): Promise<CoachingSeries[]> {
    const playerSeriesIds = await db
      .select({ seriesId: seriesPlayers.seriesId })
      .from(seriesPlayers)
      .where(and(
        eq(seriesPlayers.playerId, playerId),
        eq(seriesPlayers.status, "active")
      ));
    
    if (playerSeriesIds.length === 0) return [];
    
    const seriesIds = playerSeriesIds.map(p => p.seriesId);
    return db
      .select()
      .from(coachingSeries)
      .where(inArray(coachingSeries.id, seriesIds))
      .orderBy(asc(coachingSeries.dayOfWeek), asc(coachingSeries.startTime));
  },

  async incrementSeriesPlayerAttendance(seriesId: string, playerId: string, xpEarned: number): Promise<void> {
    await db
      .update(seriesPlayers)
      .set({
        sessionsAttended: sql`${seriesPlayers.sessionsAttended} + 1`,
        totalXpEarned: sql`${seriesPlayers.totalXpEarned} + ${xpEarned}`
      })
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ));
  },

  // Pause a player's membership (vacation/injury) - credits not consumed during pause
  async pauseSeriesPlayer(seriesId: string, playerId: string, pauseFrom: Date, pauseUntil: Date, reason?: string): Promise<SeriesPlayer | undefined> {
    const result = await db
      .update(seriesPlayers)
      .set({
        status: "paused",
        pauseFrom: pauseFrom.toISOString().split('T')[0],
        pauseUntil: pauseUntil.toISOString().split('T')[0],
        pauseReason: reason || null,
      })
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ))
      .returning();
    return result[0];
  },

  // Unpause a player (early return from vacation)
  async unpauseSeriesPlayer(seriesId: string, playerId: string): Promise<SeriesPlayer | undefined> {
    const result = await db
      .update(seriesPlayers)
      .set({
        status: "active",
        pauseFrom: null,
        pauseUntil: null,
        pauseReason: null,
      })
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ))
      .returning();
    return result[0];
  },

  // Mark a player as left (not deleted - keeps history)
  async markPlayerLeftSeries(seriesId: string, playerId: string, leftAtDate?: Date): Promise<SeriesPlayer | undefined> {
    const result = await db
      .update(seriesPlayers)
      .set({
        status: "left",
        leftAt: leftAtDate || new Date(),
      })
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ))
      .returning();
    return result[0];
  },

  // Get active players for a session date (excludes paused players during their pause period)
  async getActiveSeriesPlayersForDate(seriesId: string, sessionDate: Date): Promise<SeriesPlayer[]> {
    const dateStr = sessionDate.toISOString().split('T')[0];
    const allPlayers = await db
      .select()
      .from(seriesPlayers)
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        inArray(seriesPlayers.status, ["active", "paused"])
      ));
    
    // Filter out players who are paused on this specific date
    return allPlayers.filter(player => {
      if (player.status === "left") return false;
      if (player.status === "paused" && player.pauseFrom && player.pauseUntil) {
        // Check if sessionDate falls within pause period
        return dateStr < player.pauseFrom || dateStr > player.pauseUntil;
      }
      return true;
    });
  },

  // Link a package to a series membership
  async linkPackageToMembership(seriesId: string, playerId: string, packageId: string): Promise<SeriesPlayer | undefined> {
    const result = await db
      .update(seriesPlayers)
      .set({ linkedPackageId: packageId })
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ))
      .returning();
    return result[0];
  },

  // Get a single series player membership
  async getSeriesPlayer(seriesId: string, playerId: string): Promise<SeriesPlayer | undefined> {
    const result = await db
      .select()
      .from(seriesPlayers)
      .where(and(
        eq(seriesPlayers.seriesId, seriesId),
        eq(seriesPlayers.playerId, playerId)
      ));
    return result[0];
  },

  // ==================== COACH NOTIFICATIONS ====================
  async getCoachNotifications(coachId: string): Promise<CoachNotification[]> {
    return db
      .select()
      .from(coachNotifications)
      .where(eq(coachNotifications.coachId, coachId))
      .orderBy(desc(coachNotifications.createdAt));
  },

  async getCoachNotificationsPaginated(coachId: string, limit: number, offset: number): Promise<{ notifications: CoachNotification[]; total: number }> {
    const [notifications, countResult] = await Promise.all([
      db.select().from(coachNotifications)
        .where(eq(coachNotifications.coachId, coachId))
        .orderBy(desc(coachNotifications.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(coachNotifications)
        .where(eq(coachNotifications.coachId, coachId))
    ]);
    return { notifications, total: countResult[0]?.count || 0 };
  },

  async getCoachNotification(id: string, coachId?: string): Promise<CoachNotification | undefined> {
    const conditions = [eq(coachNotifications.id, id)];
    if (coachId) {
      conditions.push(eq(coachNotifications.coachId, coachId));
    }
    const result = await db.select().from(coachNotifications).where(and(...conditions));
    return result[0];
  },

  async createNotification(data: InsertCoachNotification): Promise<CoachNotification> {
    const result = await db.insert(coachNotifications).values(data).returning();
    return result[0];
  },

  async markNotificationRead(id: string, coachId?: string): Promise<void> {
    const conditions = [eq(coachNotifications.id, id)];
    if (coachId) {
      conditions.push(eq(coachNotifications.coachId, coachId));
    }
    await db.update(coachNotifications).set({ isRead: true }).where(and(...conditions));
  },

  async markAllNotificationsRead(coachId: string): Promise<void> {
    await db.update(coachNotifications).set({ isRead: true }).where(eq(coachNotifications.coachId, coachId));
  },

  async deleteAllCoachNotifications(coachId: string): Promise<number> {
    const result = await db.delete(coachNotifications).where(eq(coachNotifications.coachId, coachId)).returning({ id: coachNotifications.id });
    return result.length;
  },

  async deleteNotification(id: string, coachId?: string): Promise<void> {
    const conditions = [eq(coachNotifications.id, id)];
    if (coachId) {
      conditions.push(eq(coachNotifications.coachId, coachId));
    }
    await db.delete(coachNotifications).where(and(...conditions));
  },

  // ==================== PLAYER SESSION CANCELLATIONS ====================
  async createPlayerSessionCancellation(data: InsertPlayerSessionCancellation): Promise<PlayerSessionCancellation> {
    const result = await db.insert(playerSessionCancellations).values(data).returning();
    return result[0];
  },

  async getPlayerSessionCancellations(playerId: string): Promise<PlayerSessionCancellation[]> {
    return db.select().from(playerSessionCancellations).where(eq(playerSessionCancellations.playerId, playerId)).orderBy(desc(playerSessionCancellations.createdAt));
  },

  // ==================== AUTO-RENEW ALERTS ====================
  async getAutoRenewAlerts(coachId: string): Promise<{ playerId: string; playerName: string; weekNumber: number; lastSessionDate: string }[]> {
    // Get all sessions grouped by recurring series (based on same time slot/player combo)
    // Find sessions where we're at week 9+ to alert for renewal
    const now = new Date();
    const tenWeeksAgo = new Date(now.getTime() - 10 * 7 * 24 * 60 * 60 * 1000);
    
    const coachSessions = await db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.coachId, coachId),
        gte(sessions.startTime, tenWeeksAgo),
        lte(sessions.startTime, now)
      ))
      .orderBy(desc(sessions.startTime));

    // Group sessions by dayOfWeek + time slot to detect recurring series
    const recurringGroups = new Map<string, Session[]>();
    for (const session of coachSessions) {
      const startTime = new Date(session.startTime);
      const dayOfWeek = startTime.getUTCDay();
      const hour = startTime.getUTCHours();
      const minute = startTime.getUTCMinutes();
      const key = `${dayOfWeek}-${hour}:${minute}`;
      
      if (!recurringGroups.has(key)) {
        recurringGroups.set(key, []);
      }
      recurringGroups.get(key)!.push(session);
    }

    const alerts: { playerId: string; playerName: string; weekNumber: number; lastSessionDate: string }[] = [];
    
    for (const [, groupSessions] of recurringGroups) {
      if (groupSessions.length >= 8) {
        // This is likely a recurring series
        const weekNumber = groupSessions.length;
        if (weekNumber >= 9 && weekNumber <= 10) {
          // Get players from the first session
          const sessionPlayerRecords = await db
            .select()
            .from(sessionPlayers)
            .where(eq(sessionPlayers.sessionId, groupSessions[0].id));
          
          for (const sp of sessionPlayerRecords) {
            if (sp.playerId) {
              const player = await db.select().from(players).where(eq(players.id, sp.playerId));
              if (player[0]) {
                alerts.push({
                  playerId: sp.playerId,
                  playerName: player[0].name,
                  weekNumber,
                  lastSessionDate: groupSessions[0].startTime.toISOString(),
                });
              }
            }
          }
        }
      }
    }

    return alerts;
  },

  // ==================== PROGRESS ENGINE V2 ====================

  // Skill Domains
  async getAllSkillDomains(): Promise<SkillDomain[]> {
    return db.select().from(skillDomains).orderBy(asc(skillDomains.sortOrder));
  },

  async getSkillDomain(id: string): Promise<SkillDomain | undefined> {
    const result = await db.select().from(skillDomains).where(eq(skillDomains.id, id));
    return result[0];
  },

  async getSkillDomainByName(name: string): Promise<SkillDomain | undefined> {
    const result = await db.select().from(skillDomains).where(eq(skillDomains.name, name));
    return result[0];
  },

  async createSkillDomain(data: InsertSkillDomain): Promise<SkillDomain> {
    const result = await db.insert(skillDomains).values(data).returning();
    return result[0];
  },

  async seedSkillDomains(): Promise<void> {
    const existingDomains = await db.select().from(skillDomains);
    if (existingDomains.length > 0) return; // Already seeded

    const domains = [
      { name: "technical", displayName: "Technical", description: "Strokes, technique, consistency", icon: "tennisball-outline", color: "#2ECC40", sortOrder: 1 },
      { name: "mental", displayName: "Mental", description: "Focus, resilience, confidence", icon: "brain-outline", color: "#00D4FF", sortOrder: 2 },
      { name: "physical", displayName: "Physical", description: "Fitness, speed, endurance", icon: "fitness-outline", color: "#FFD700", sortOrder: 3 },
      { name: "social", displayName: "Social", description: "Teamwork, sportsmanship, communication", icon: "people-outline", color: "#FF6B6B", sortOrder: 4 },
      { name: "tactical", displayName: "Tactical", description: "Strategy, decision-making, game IQ", icon: "bulb-outline", color: "#9B59B6", sortOrder: 5 },
    ];

    for (const domain of domains) {
      await db.insert(skillDomains).values(domain);
    }
  },

  // Player Skill State
  async getPlayerSkillStates(playerId: string, academyId?: string): Promise<PlayerSkillState[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(playerSkillState)
      .where(eq(playerSkillState.playerId, playerId));
  },

  async getPlayerSkillState(playerId: string, domainId: string): Promise<PlayerSkillState | undefined> {
    const result = await db
      .select()
      .from(playerSkillState)
      .where(and(
        eq(playerSkillState.playerId, playerId),
        eq(playerSkillState.domainId, domainId)
      ));
    return result[0];
  },

  async upsertPlayerSkillState(data: InsertPlayerSkillState): Promise<PlayerSkillState> {
    // Check if state exists
    const existing = await db
      .select()
      .from(playerSkillState)
      .where(and(
        eq(playerSkillState.playerId, data.playerId),
        eq(playerSkillState.domainId, data.domainId)
      ));

    if (existing.length > 0) {
      const result = await db
        .update(playerSkillState)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(playerSkillState.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(playerSkillState).values(data).returning();
    return result[0];
  },

  async initializePlayerSkillStates(playerId: string): Promise<void> {
    const domains = await db.select().from(skillDomains);
    for (const domain of domains) {
      const existing = await db
        .select()
        .from(playerSkillState)
        .where(and(
          eq(playerSkillState.playerId, playerId),
          eq(playerSkillState.domainId, domain.id)
        ));
      
      if (existing.length === 0) {
        await db.insert(playerSkillState).values({
          playerId,
          domainId: domain.id,
          progressValue: 0,
          trend: "stable",
          momentum: "building",
          confidenceScore: 50,
        });
      }
    }
  },

  // Session Skill Observations
  async getSessionSkillObservations(sessionId: string): Promise<SessionSkillObservation[]> {
    return db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.sessionId, sessionId))
      .orderBy(desc(sessionSkillObservations.createdAt));
  },

  async getPlayerRecentObservations(playerId: string, limit: number = 10): Promise<SessionSkillObservation[]> {
    return db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.playerId, playerId))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(limit);
  },

  async getPlayerObservationTrends(playerId: string, days: number = 30): Promise<{
    domainId: string;
    history: { date: string; delta: number; direction: string }[];
    streakUp: number;
    streakDown: number;
    hasSpeedrunWarning: boolean;
    improvementRate: number;
    hasData: boolean;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const allDomains = await db.select().from(skillDomains);
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        gte(sessionSkillObservations.createdAt, cutoffDate)
      ))
      .orderBy(asc(sessionSkillObservations.createdAt));
    
    const domainMap: Record<string, SessionSkillObservation[]> = {};
    
    // Initialize all domains with empty arrays
    for (const domain of allDomains) {
      domainMap[domain.id] = [];
    }
    
    for (const obs of observations) {
      if (!domainMap[obs.domainId]) domainMap[obs.domainId] = [];
      domainMap[obs.domainId].push(obs);
    }
    
    return Object.entries(domainMap).map(([domainId, obs]) => {
      const history = obs.map(o => ({
        date: o.createdAt?.toISOString().split('T')[0] || '',
        delta: o.appliedDelta || 0,
        direction: o.direction,
      }));
      
      let streakUp = 0, streakDown = 0, currentStreak = 0, lastDirection = '';
      const reversedObs = [...obs].reverse();
      for (const o of reversedObs) {
        if (o.direction === lastDirection || lastDirection === '') {
          currentStreak++;
          lastDirection = o.direction;
        } else break;
      }
      if (lastDirection === 'up') streakUp = currentStreak;
      if (lastDirection === 'down') streakDown = currentStreak;
      
      const upCount = obs.filter(o => o.direction === 'up').length;
      const totalCount = obs.length;
      const improvementRate = totalCount > 0 ? Math.round((upCount / totalCount) * 100) : 0;
      const hasSpeedrunWarning = improvementRate > 90 && totalCount >= 5;
      const hasData = obs.length > 0;
      
      return { domainId, history, streakUp, streakDown, hasSpeedrunWarning, improvementRate, hasData };
    });
  },

  async createSkillObservation(data: InsertSessionSkillObservation): Promise<SessionSkillObservation> {
    const result = await db.insert(sessionSkillObservations).values(data).returning();
    return result[0];
  },

  async getObservationCountForDomain(playerId: string, domainId: string, sessionCount: number = 3): Promise<{ upCount: number; downCount: number }> {
    // Get recent sessions for this player
    const recentObservations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        eq(sessionSkillObservations.domainId, domainId)
      ))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(sessionCount);

    const upCount = recentObservations.filter(o => o.direction === "up").length;
    const downCount = recentObservations.filter(o => o.direction === "down").length;

    return { upCount, downCount };
  },

  async getRecentDownSessionsForPlayer(playerId: string, sessionLimit: number = 3): Promise<string[]> {
    // First, get the player's last N sessions (by chronological order)
    const allPlayerObservations = await db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.playerId, playerId))
      .orderBy(desc(sessionSkillObservations.createdAt));

    // Extract the last N distinct sessions chronologically
    const lastNSessions: string[] = [];
    for (const obs of allPlayerObservations) {
      if (!lastNSessions.includes(obs.sessionId)) {
        lastNSessions.push(obs.sessionId);
        if (lastNSessions.length >= sessionLimit) break;
      }
    }

    // Now check which of these last N sessions had "down" observations
    const sessionsWithDowns: string[] = [];
    for (const sessionId of lastNSessions) {
      const hasDown = allPlayerObservations.some(
        obs => obs.sessionId === sessionId && obs.direction === "down"
      );
      if (hasDown) {
        sessionsWithDowns.push(sessionId);
      }
    }

    return sessionsWithDowns;
  },

  async getPlayerDomainXpSummary(playerId: string, sport?: string): Promise<{ domainId: string; totalXp: number; observationCount: number; avgDelta: number; lastObservation: Date | null }[]> {
    const allDomains = await db.select().from(skillDomains);
    const observationRows = sport
      ? await db
          .select({ obs: sessionSkillObservations })
          .from(sessionSkillObservations)
          .innerJoin(sessions, eq(sessionSkillObservations.sessionId, sessions.id))
          .where(and(eq(sessionSkillObservations.playerId, playerId), eq(sessions.sport, sport)))
      : await db
          .select({ obs: sessionSkillObservations })
          .from(sessionSkillObservations)
          .where(eq(sessionSkillObservations.playerId, playerId));
    const observations = observationRows.map(r => r.obs);
    
    const domainMap: Record<string, { totalXp: number; count: number; lastDate: Date | null }> = {};
    
    // Initialize all domains with zero values
    for (const domain of allDomains) {
      domainMap[domain.id] = { totalXp: 0, count: 0, lastDate: null };
    }
    
    for (const obs of observations) {
      if (!domainMap[obs.domainId]) {
        domainMap[obs.domainId] = { totalXp: 0, count: 0, lastDate: null };
      }
      domainMap[obs.domainId].totalXp += obs.appliedDelta || 0;
      domainMap[obs.domainId].count += 1;
      const obsDate = obs.createdAt ? new Date(obs.createdAt) : null;
      if (obsDate && (!domainMap[obs.domainId].lastDate || obsDate > domainMap[obs.domainId].lastDate!)) {
        domainMap[obs.domainId].lastDate = obsDate;
      }
    }
    
    return Object.entries(domainMap).map(([domainId, data]) => ({
      domainId,
      totalXp: data.totalXp ?? 0,
      observationCount: data.count ?? 0,
      avgDelta: data.count > 0 ? Math.round((data.totalXp / data.count) * 10) / 10 : 0,
      lastObservation: data.lastDate,
    }));
  },

  // Level Requirements
  async getLevelRequirements(ballLevel: string): Promise<LevelRequirement[]> {
    return db
      .select()
      .from(levelRequirements)
      .where(eq(levelRequirements.ballLevel, ballLevel));
  },

  async getAllLevelRequirements(): Promise<LevelRequirement[]> {
    return db.select().from(levelRequirements);
  },

  async createLevelRequirement(data: InsertLevelRequirement): Promise<LevelRequirement> {
    const result = await db.insert(levelRequirements).values(data).returning();
    return result[0];
  },

  // Domain Assessments
  async getPlayerAssessments(playerId: string): Promise<DomainAssessment[]> {
    return db
      .select()
      .from(domainAssessments)
      .where(eq(domainAssessments.playerId, playerId))
      .orderBy(desc(domainAssessments.createdAt));
  },

  async createAssessment(data: InsertDomainAssessment): Promise<DomainAssessment> {
    const result = await db.insert(domainAssessments).values(data).returning();
    return result[0];
  },

  async getLatestAssessment(playerId: string, domainId: string): Promise<DomainAssessment | undefined> {
    const result = await db
      .select()
      .from(domainAssessments)
      .where(and(
        eq(domainAssessments.playerId, playerId),
        eq(domainAssessments.domainId, domainId)
      ))
      .orderBy(desc(domainAssessments.createdAt))
      .limit(1);
    return result[0];
  },

  // Coach Stats Rollup (V2)
  async getCoachStats(coachId: string): Promise<CoachStatsRollup | undefined> {
    const result = await db.select().from(coachStatsRollup).where(eq(coachStatsRollup.coachId, coachId));
    return result[0];
  },

  async upsertCoachStats(data: InsertCoachStatsRollup): Promise<CoachStatsRollup> {
    const existing = await db.select().from(coachStatsRollup).where(eq(coachStatsRollup.coachId, data.coachId));
    
    if (existing.length > 0) {
      const result = await db
        .update(coachStatsRollup)
        .set({ ...data, lastCalculatedAt: new Date() })
        .where(eq(coachStatsRollup.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(coachStatsRollup).values(data).returning();
    return result[0];
  },

  // Player Progress Flags (V2)
  async getPlayerFlags(playerId: string): Promise<PlayerProgressFlag[]> {
    return db
      .select()
      .from(playerProgressFlags)
      .where(and(
        eq(playerProgressFlags.playerId, playerId),
        eq(playerProgressFlags.isActive, true)
      ));
  },

  async createPlayerFlag(data: InsertPlayerProgressFlag): Promise<PlayerProgressFlag> {
    const result = await db.insert(playerProgressFlags).values(data).returning();
    return result[0];
  },

  async resolvePlayerFlag(id: string): Promise<void> {
    await db
      .update(playerProgressFlags)
      .set({ isActive: false, resolvedAt: new Date() })
      .where(eq(playerProgressFlags.id, id));
  },

  // XP Transactions
  async getPlayerXpTransactions(playerId: string, limit: number = 50, academyId?: string): Promise<XpTransaction[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(xpTransactions)
      .where(eq(xpTransactions.playerId, playerId))
      .orderBy(desc(xpTransactions.createdAt))
      .limit(limit);
  },

  async createXpTransaction(data: InsertXpTransaction): Promise<XpTransaction> {
    const result = await db.insert(xpTransactions).values(data).returning();
    return result[0];
  },

  async addPlayerXP(playerId: string, xpAmount: number, sessionId?: string, description?: string): Promise<void> {
    await db.insert(xpTransactions).values({
      playerId,
      xpAmount,
      sessionId: sessionId || null,
      source: description || "session_attendance",
      description: description || "XP earned",
    });
    await db.update(players).set({
      totalXp: sql`COALESCE(${players.totalXp}, 0) + ${xpAmount}`,
    }).where(eq(players.id, playerId));
  },

  async getPlayerTotalXp(playerId: string, academyId?: string): Promise<number> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return 0;
    }
    const transactions = await db
      .select()
      .from(xpTransactions)
      .where(eq(xpTransactions.playerId, playerId));
    
    return transactions.reduce((sum, t) => sum + t.xpAmount, 0);
  },

  // ==================== ANTI-ABUSE RULES ====================
  
  // Get player XP gained today (for daily cap)
  async getPlayerDailyXp(playerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const transactions = await db
      .select()
      .from(xpTransactions)
      .where(and(
        eq(xpTransactions.playerId, playerId),
        gte(xpTransactions.createdAt, today)
      ));
    
    return transactions.reduce((sum, t) => sum + t.xpAmount, 0);
  },

  // Get coach observation patterns for pattern detection
  async getCoachObservationPatterns(coachId: string, sessionLimit: number = 30): Promise<{
    upRate: number;
    downRate: number;
    highEffortRate: number;
    totalObservations: number;
    isPatternAbuse: boolean;
  }> {
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.coachId, coachId))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(sessionLimit * 5); // ~5 observations per session
    
    if (observations.length === 0) {
      return { upRate: 0, downRate: 0, highEffortRate: 0, totalObservations: 0, isPatternAbuse: false };
    }
    
    const upCount = observations.filter(o => o.direction === "up").length;
    const downCount = observations.filter(o => o.direction === "down").length;
    const highEffortCount = observations.filter(o => o.effortLevel === "high").length;
    
    const upRate = upCount / observations.length;
    const downRate = downCount / observations.length;
    const highEffortRate = highEffortCount / observations.length;
    
    // Pattern abuse detection: >80% ups with <5% downs = likely abuse
    // OR >90% high effort ratings
    const isPatternAbuse = (upRate > 0.8 && downRate < 0.05) || highEffortRate > 0.9;
    
    return {
      upRate,
      downRate,
      highEffortRate,
      totalObservations: observations.length,
      isPatternAbuse,
    };
  },

  // Update coach stats rollup for anti-abuse calibration
  async updateCoachStatsFromObservations(coachId: string): Promise<CoachStatsRollup> {
    const patterns = await this.getCoachObservationPatterns(coachId, 30);
    
    // Calculate severity factor: coaches who give too many ups get reduced impact
    let severityFactor = 1.0;
    if (patterns.upRate > 0.7) {
      severityFactor = 0.9; // 10% reduction for generous coaches
    }
    if (patterns.upRate > 0.85) {
      severityFactor = 0.8; // 20% reduction for very generous coaches
    }
    
    return this.upsertCoachStats({
      coachId,
      highEffortRate30: String(patterns.highEffortRate),
      upRate30: String(patterns.upRate),
      downRate30: String(patterns.downRate),
      avgUpPerSession: String(patterns.upRate * 5), // ~5 obs per session
      severityFactor: String(severityFactor),
      isHighEffortSpammer: patterns.highEffortRate > 0.85,
      isUpSpammer: patterns.upRate > 0.8 && patterns.downRate < 0.05,
    });
  },

  // Check if coach can observe a specific player (prevents self-boosting via family accounts)
  async checkCoachPlayerRelationship(coachId: string, playerId: string): Promise<{
    isSameAccount: boolean;
    isFrequentFlyer: boolean;
    observationCount30Days: number;
  }> {
    // Get coach's user ID
    const coach = await db.select().from(coaches).where(eq(coaches.id, coachId));
    if (!coach || coach.length === 0) {
      return { isSameAccount: false, isFrequentFlyer: false, observationCount30Days: 0 };
    }
    
    // Check how many times this coach has observed this player in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentObservations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.coachId, coachId),
        eq(sessionSkillObservations.playerId, playerId),
        gte(sessionSkillObservations.createdAt, thirtyDaysAgo)
      ));
    
    // Frequent flyer: same coach giving >20 observations to same player in 30 days
    const isFrequentFlyer = recentObservations.length > 20;
    
    return {
      isSameAccount: false, // Would need user linking to implement fully
      isFrequentFlyer,
      observationCount30Days: recentObservations.length,
    };
  },

  // ==================== COACH XP SYSTEM ====================
  async getCoachXpTransactions(coachId: string, limit: number = 50): Promise<CoachXpTransaction[]> {
    return db
      .select()
      .from(coachXpTransactions)
      .where(eq(coachXpTransactions.coachId, coachId))
      .orderBy(desc(coachXpTransactions.createdAt))
      .limit(limit);
  },

  async addCoachXpTransaction(data: InsertCoachXpTransaction): Promise<CoachXpTransaction> {
    const result = await db.insert(coachXpTransactions).values(data).returning();
    return result[0];
  },

  async getCoachTotalXp(coachId: string): Promise<number> {
    const transactions = await db
      .select()
      .from(coachXpTransactions)
      .where(eq(coachXpTransactions.coachId, coachId));
    
    return transactions.reduce((sum, t) => sum + t.xpAmount, 0);
  },

  // Progress calculation helper
  async calculatePlayerLevelReadiness(playerId: string, targetLevel: string): Promise<{
    isReady: boolean;
    requirements: { domainId: string; domainName: string; required: string; current: string; met: boolean }[];
    sessionCount: number;
    minSessionsRequired: number;
  }> {
    const requirements = await db
      .select()
      .from(levelRequirements)
      .where(eq(levelRequirements.ballLevel, targetLevel));

    const skillStates = await db
      .select()
      .from(playerSkillState)
      .where(eq(playerSkillState.playerId, playerId));

    const domains = await db.select().from(skillDomains);
    const domainMap = new Map(domains.map(d => [d.id, d]));

    // Count sessions player has participated in
    const playerSessionCount = await db
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));

    const results = requirements.map(req => {
      const state = skillStates.find(s => s.domainId === req.domainId);
      const domain = domainMap.get(req.domainId);
      
      const statusOrder = ["not_yet", "developing", "meets", "above"];
      const currentIndex = statusOrder.indexOf(state?.assessmentStatus || "not_yet");
      const requiredIndex = statusOrder.indexOf(req.minStatus);

      return {
        domainId: req.domainId,
        domainName: domain?.displayName || "Unknown",
        required: req.minStatus,
        current: state?.assessmentStatus || "not_yet",
        met: currentIndex >= requiredIndex,
      };
    });

    // Use the strictest (maximum) minSessions across all domain requirements
    const minSessionsRequired = requirements.reduce((max, req) => {
      const reqSessions = req.minSessionsAtLevel || 8;
      return Math.max(max, reqSessions);
    }, 8);
    
    const allRequirementsMet = results.every(r => r.met);
    const hasEnoughSessions = playerSessionCount.length >= minSessionsRequired;

    return {
      isReady: allRequirementsMet && hasEnoughSessions,
      requirements: results,
      sessionCount: playerSessionCount.length,
      minSessionsRequired,
    };
  },

  // ==================== GLOW CHAT SYSTEM ====================
  
  // Conversations
  async getConversation(id: string, coachId?: string, academyId?: string): Promise<Conversation | undefined> {
    const conditions = [eq(conversations.id, id)];
    if (coachId) {
      conditions.push(eq(conversations.coachId, coachId));
    }
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    const result = await db.select().from(conversations).where(and(...conditions));
    return result[0];
  },

  async getConversationsForCoach(coachId: string, academyId?: string): Promise<Conversation[]> {
    const participantConversations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.coachId, coachId),
          eq(conversationParticipants.participantType, "coach")
        )
      );
    
    const conversationIds = participantConversations.map(p => p.conversationId);
    if (conversationIds.length === 0) return [];
    
    const conditions = [
      inArray(conversations.id, conversationIds),
      eq(conversations.isArchived, false)
    ];
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    
    return db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt));
  },

  async getConversationsForPlayer(playerId: string, academyId?: string): Promise<Conversation[]> {
    const participantConversations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );
    
    const conversationIds = participantConversations.map(p => p.conversationId);
    if (conversationIds.length === 0) return [];
    
    const conditions = [
      inArray(conversations.id, conversationIds),
      eq(conversations.isArchived, false)
    ];
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    
    return db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt));
  },

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(data).returning();
    return result[0];
  },

  async updateConversation(id: string, data: Partial<InsertConversation>, coachId?: string): Promise<Conversation | undefined> {
    const conditions = [eq(conversations.id, id)];
    if (coachId) {
      conditions.push(eq(conversations.coachId, coachId));
    }
    const result = await db.update(conversations).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async getOrCreateCoachPlayerConversation(coachId: string, playerId: string, academyId?: string): Promise<Conversation> {
    // Check if conversation already exists
    const conditions = [
      eq(conversations.type, "coach_player"),
      eq(conversations.coachId, coachId),
      eq(conversations.playerId, playerId)
    ];
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    
    const existing = await db
      .select()
      .from(conversations)
      .where(and(...conditions));
    
    if (existing.length > 0) return existing[0];
    
    // Create new conversation with academyId
    const conv = await db.insert(conversations).values({
      type: "coach_player",
      coachId,
      playerId,
      academyId: academyId || null,
    }).returning();
    
    // Add participants with academyId for multi-tenant isolation
    await db.insert(conversationParticipants).values([
      { conversationId: conv[0].id, participantType: "coach", coachId, role: "owner", canPost: true, academyId: academyId || null },
      { conversationId: conv[0].id, participantType: "player", playerId, role: "member", canPost: true, academyId: academyId || null },
    ]);
    
    return conv[0];
  },

  // Participants
  async getConversationParticipants(conversationId: string, coachId?: string, academyId?: string): Promise<ConversationParticipant[]> {
    // If coachId provided, verify they have access to this conversation
    if (coachId) {
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      // Also check if coach is a participant
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return [];
      }
    }
    
    // Filter by academyId if provided
    const conditions = [eq(conversationParticipants.conversationId, conversationId)];
    if (academyId) conditions.push(eq(conversationParticipants.academyId, academyId));
    
    return db.select().from(conversationParticipants).where(and(...conditions));
  },

  // Batch fetch participants for multiple conversations (optimized)
  async getConversationParticipantsBatch(conversationIds: string[], coachId?: string): Promise<(ConversationParticipant & { conversationId: string })[]> {
    if (conversationIds.length === 0) return [];
    return db.select().from(conversationParticipants).where(inArray(conversationParticipants.conversationId, conversationIds));
  },

  async addConversationParticipant(data: InsertConversationParticipant): Promise<ConversationParticipant> {
    const result = await db.insert(conversationParticipants).values(data).returning();
    return result[0];
  },

  async updateParticipantLastRead(conversationId: string, participantType: string, participantId: string): Promise<void> {
    if (participantType === "coach") {
      await db.update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.coachId, participantId)
          )
        );
    } else if (participantType === "player") {
      await db.update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.playerId, participantId)
          )
        );
    }
  },

  // Messages
  async getMessages(conversationId: string, limit: number = 50, coachId?: string, academyId?: string): Promise<Message[]> {
    // If coachId provided, verify they have access to this conversation
    if (coachId) {
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return [];
      }
    }
    
    // Add academyId filter if provided
    const msgConditions = [
      eq(messages.conversationId, conversationId),
      eq(messages.isDeleted, false)
    ];
    if (academyId) msgConditions.push(eq(messages.academyId, academyId));
    
    return db
      .select()
      .from(messages)
      .where(and(...msgConditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
  },

  async createMessage(data: InsertMessage, coachId?: string, academyId?: string): Promise<Message | null> {
    // If coachId provided, verify they have access to this conversation
    if (coachId) {
      const convConditions = [eq(conversations.id, data.conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, data.conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return null;
      }
    }
    
    // Include academyId in message data
    const messageData = academyId ? { ...data, academyId } : data;
    const result = await db.insert(messages).values(messageData).returning();
    
    // Update conversation last message
    await db.update(conversations).set({
      lastMessageAt: new Date(),
      lastMessagePreview: data.body.substring(0, 100),
    }).where(eq(conversations.id, data.conversationId));
    
    return result[0];
  },

  async deleteMessage(id: string): Promise<void> {
    await db.update(messages).set({ isDeleted: true }).where(eq(messages.id, id));
  },

  // Reactions
  async getMessageReactions(messageId: string, coachId?: string, academyId?: string): Promise<MessageReaction[]> {
    // If coachId provided, verify coach has access to the message's conversation
    if (coachId) {
      const msgConditions = [eq(messages.id, messageId)];
      if (academyId) msgConditions.push(eq(messages.academyId, academyId));
      
      const msg = await db.select().from(messages).where(and(...msgConditions));
      if (msg.length === 0) return [];
      const conversationId = msg[0].conversationId;
      
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return [];
      }
    }
    
    const reactionConditions = [eq(messageReactions.messageId, messageId)];
    if (academyId) reactionConditions.push(eq(messageReactions.academyId, academyId));
    
    return db.select().from(messageReactions).where(and(...reactionConditions));
  },

  async addReaction(data: InsertMessageReaction, coachId?: string, academyId?: string): Promise<MessageReaction | null> {
    // If coachId provided, verify coach has access to the message's conversation
    if (coachId) {
      const msgConditions = [eq(messages.id, data.messageId)];
      if (academyId) msgConditions.push(eq(messages.academyId, academyId));
      
      const msg = await db.select().from(messages).where(and(...msgConditions));
      if (msg.length === 0) return null;
      const conversationId = msg[0].conversationId;
      
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return null;
      }
    }
    
    // Include academyId in reaction data
    const reactionData = academyId ? { ...data, academyId } : data;
    const result = await db.insert(messageReactions).values(reactionData).returning();
    return result[0];
  },

  async removeReaction(messageId: string, reactorType: string, reactorId: string, emoji: string, coachId?: string, academyId?: string): Promise<boolean> {
    // If coachId provided, verify coach has access to the message's conversation
    if (coachId) {
      const msgConditions = [eq(messages.id, messageId)];
      if (academyId) msgConditions.push(eq(messages.academyId, academyId));
      
      const msg = await db.select().from(messages).where(and(...msgConditions));
      if (msg.length === 0) return false;
      const conversationId = msg[0].conversationId;
      
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return false;
      }
    }
    
    const baseConditions = [
      eq(messageReactions.messageId, messageId),
      eq(messageReactions.emoji, emoji)
    ];
    if (academyId) baseConditions.push(eq(messageReactions.academyId, academyId));
    
    if (reactorType === "coach") {
      await db.delete(messageReactions).where(
        and(...baseConditions, eq(messageReactions.reactorCoachId, reactorId))
      );
    } else {
      await db.delete(messageReactions).where(
        and(...baseConditions, eq(messageReactions.reactorPlayerId, reactorId))
      );
    }
    return true;
  },

  // Unread count
  async getUnreadCountForCoach(coachId: string): Promise<number> {
    const participations = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.coachId, coachId),
          eq(conversationParticipants.participantType, "coach")
        )
      );
    
    let unreadCount = 0;
    
    for (const p of participations) {
      const lastRead = p.lastReadAt || new Date(0);
      const unreadMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, p.conversationId),
            gt(messages.createdAt, lastRead),
            or(isNull(messages.senderCoachId), ne(messages.senderCoachId, coachId)),
            eq(messages.isDeleted, false)
          )
        );
      unreadCount += unreadMessages.length;
    }
    
    return unreadCount;
  },

  async getUnreadCountForPlayer(playerId: string): Promise<number> {
    const participations = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );
    
    let unreadCount = 0;
    
    for (const p of participations) {
      const lastRead = p.lastReadAt || new Date(0);
      const unreadMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, p.conversationId),
            gt(messages.createdAt, lastRead),
            // Null-safe: count messages not sent by this player (provider/system/coach msgs have senderPlayerId=null)
            or(isNull(messages.senderPlayerId), ne(messages.senderPlayerId, playerId)),
            eq(messages.isDeleted, false)
          )
        );
      unreadCount += unreadMessages.length;
    }
    
    return unreadCount;
  },

  // ==================== PLAYER CHAT STORAGE FUNCTIONS ====================

  async getPlayerToPlayerConversation(playerId: string, otherPlayerId: string, academyId: string): Promise<Conversation | undefined> {
    const playerConversations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );
    
    for (const pc of playerConversations) {
      const otherParticipant = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, pc.conversationId),
            eq(conversationParticipants.playerId, otherPlayerId),
            eq(conversationParticipants.participantType, "player")
          )
        );
      
      if (otherParticipant.length > 0) {
        const conv = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.id, pc.conversationId),
              eq(conversations.type, "player_player"),
              eq(conversations.academyId, academyId)
            )
          );
        if (conv.length > 0) return conv[0];
      }
    }
    return undefined;
  },

  async getAcademyConversationForPlayer(playerId: string, academyId: string): Promise<Conversation | undefined> {
    const result = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.type, "academy"),
          eq(conversations.playerId, playerId),
          eq(conversations.academyId, academyId)
        )
      );
    return result[0];
  },

  async getFirstCoachForAcademy(academyId: string): Promise<{ id: string; name: string } | undefined> {
    const result = await db
      .select()
      .from(coaches)
      .where(eq(coaches.academyId, academyId))
      .limit(1);
    return result[0];
  },

  async getConversationForPlayer(conversationId: string, playerId: string, academyId: string | null): Promise<Conversation | undefined> {
    // First, check if the player is a participant in this conversation
    const participant = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );

    if (participant.length > 0) {
      // Player is a participant — fetch the conversation.
      // For group conversations (no academyId), participant membership is sufficient.
      // For academy conversations, enforce tenant scoping.
      const conv = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      const c = conv[0];
      if (!c) return undefined;
      // Group conversations (type === "group") have null academyId — allow access via participant
      if (c.type === "group") return c;
      // World chat is open to all players
      if (c.type === "world") return c;
      // Academy conversations: enforce tenant scoping
      if (academyId && c.academyId === academyId) return c;
      return undefined;
    }

    // World chat conversation: any player may access regardless of participant row
    const worldCheck = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (worldCheck[0]?.type === "world") return worldCheck[0];

    // Fallback: player is the conversation owner (direct conversation starter)
    const conv = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.playerId, playerId),
        )
      );
    const c = conv[0];
    if (!c) return undefined;
    if (c.type === "group") return c;
    if (academyId && c.academyId === academyId) return c;
    return undefined;
  },

  async getMessagesForPlayer(conversationId: string, playerId: string, academyId: string | null, limit: number = 50): Promise<Message[]> {
    const hasAccess = await this.getConversationForPlayer(conversationId, playerId, academyId);
    if (!hasAccess) return [];
    
    return db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.isDeleted, false)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);
  },

  async getMessageReactionsForPlayer(messageId: string, playerId: string, academyId: string): Promise<MessageReaction[]> {
    return db.select().from(messageReactions).where(eq(messageReactions.messageId, messageId));
  },

  async getMessage(messageId: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, messageId));
    return result[0];
  },

  async markConversationRead(conversationId: string, participantId: string, participantType: "coach" | "player"): Promise<void> {
    if (participantType === "coach") {
      await db.update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.coachId, participantId)
          )
        );
    } else {
      await db.update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.playerId, participantId)
          )
        );
    }
  },

  async addMessageReaction(data: InsertMessageReaction): Promise<MessageReaction> {
    const result = await db.insert(messageReactions).values(data).returning();
    return result[0];
  },

  async getPlayerUnreadCount(playerId: string, academyId: string): Promise<number> {
    const participations = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );
    
    let unreadCount = 0;
    
    for (const p of participations) {
      const lastRead = p.lastReadAt || new Date(0);
      const unreadMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, p.conversationId),
            gt(messages.createdAt, lastRead),
            // Null-safe: count messages not sent by this player (provider/system/coach msgs have senderPlayerId=null)
            or(isNull(messages.senderPlayerId), ne(messages.senderPlayerId, playerId)),
            eq(messages.isDeleted, false)
          )
        );
      unreadCount += unreadMessages.length;
    }
    
    return unreadCount;
  },

  // ==================== RECURRING SERIES ====================
  async getRecurringSeries(id: string, academyId?: string): Promise<RecurringSeries | undefined> {
    const conditions = [eq(recurringSeries.id, id)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    const result = await db.select().from(recurringSeries).where(and(...conditions));
    return result[0];
  },

  async getRecurringSeriesForCoach(coachId: string, academyId?: string): Promise<RecurringSeries[]> {
    const conditions = [eq(recurringSeries.coachId, coachId), eq(recurringSeries.isActive, true)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    return db.select().from(recurringSeries).where(and(...conditions));
  },

  async createRecurringSeries(data: InsertRecurringSeries): Promise<RecurringSeries> {
    const result = await db.insert(recurringSeries).values(data).returning();
    return result[0];
  },

  async updateRecurringSeries(id: string, data: Partial<InsertRecurringSeries>, academyId?: string): Promise<RecurringSeries | undefined> {
    const conditions = [eq(recurringSeries.id, id)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    const result = await db.update(recurringSeries).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async deleteRecurringSeries(id: string, academyId?: string): Promise<void> {
    const conditions = [eq(recurringSeries.id, id)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    await db.update(recurringSeries).set({ isActive: false }).where(and(...conditions));
  },

  async createRecurringSessionInstances(
    seriesId: string,
    baseSession: Omit<InsertSession, 'startTime' | 'endTime'>,
    startDate: Date,
    weekCount: number,
    dayOfWeek: number,
    startTimeStr: string,
    duration: number,
    playerIds?: string[],
    academyId?: string
  ): Promise<{ sessions: Session[], skippedSessions: { sessionId: string, date: string, reason: string }[] }> {
    const createdSessions: Session[] = [];
    const skippedSessions: { sessionId: string, date: string, reason: string }[] = [];
    const [hours, minutes] = startTimeStr.split(':').map(Number);
    
    // Get player holidays if players specified
    const playerHolidaysMap: Map<string, PlayerHoliday[]> = new Map();
    if (playerIds && playerIds.length > 0) {
      for (const playerId of playerIds) {
        const holidays = await this.getPlayerHolidays(playerId, academyId);
        playerHolidaysMap.set(playerId, holidays);
      }
    }
    
    for (let week = 0; week < weekCount; week++) {
      const sessionDate = new Date(startDate);
      sessionDate.setDate(sessionDate.getDate() + (week * 7));
      
      // Adjust to correct day of week
      const currentDay = sessionDate.getDay();
      const daysToAdd = dayOfWeek - currentDay;
      sessionDate.setDate(sessionDate.getDate() + daysToAdd);
      
      // Set time
      const startTime = new Date(sessionDate);
      startTime.setHours(hours, minutes, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + duration);
      
      // Check if any player is on holiday
      let isHoliday = false;
      if (playerIds && playerIds.length > 0) {
        for (const playerId of playerIds) {
          const holidays = playerHolidaysMap.get(playerId) || [];
          for (const h of holidays) {
            const hStart = new Date(h.startDate);
            const hEnd = new Date(h.endDate);
            hEnd.setHours(23, 59, 59);
            if (startTime >= hStart && startTime <= hEnd) {
              isHoliday = true;
              break;
            }
          }
          if (isHoliday) break;
        }
      }
      
      const session = await db.insert(sessions).values({
        ...baseSession,
        startTime,
        endTime,
        duration,
        isRecurring: true,
        recurringGroupId: seriesId,
        weekCount,
        isSkipped: isHoliday,
        skipReason: isHoliday ? 'holiday' : null,
        status: isHoliday ? 'cancelled' : 'scheduled',
      }).returning();
      
      createdSessions.push(session[0]);
      if (isHoliday) {
        skippedSessions.push({
          sessionId: session[0].id,
          date: startTime.toISOString(),
          reason: 'holiday',
        });
      }
    }
    
    return { sessions: createdSessions, skippedSessions };
  },

  async getSessionsByRecurringGroupId(recurringGroupId: string, academyId?: string): Promise<Session[]> {
    const conditions = [eq(sessions.recurringGroupId, recurringGroupId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions)).orderBy(asc(sessions.startTime));
  },

  async deleteRecurringSessionInstances(recurringGroupId: string, fromDate?: Date, academyId?: string): Promise<void> {
    const conditions = [eq(sessions.recurringGroupId, recurringGroupId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    if (fromDate) {
      conditions.push(gte(sessions.startTime, fromDate));
    }
    await db.update(sessions).set({ status: 'cancelled' }).where(and(...conditions));
  },

  // ==================== INSIGHTS API ====================
  
  async getAttendanceTrends(academyId: string, days: number = 30): Promise<{
    date: string;
    attended: number;
    absent: number;
    rate: number;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const attendanceRecords = await db
      .select()
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, cutoffDate),
        lte(sessions.startTime, new Date())
      ));
    
    const dailyStats: Record<string, { attended: number; absent: number }> = {};
    
    for (const record of attendanceRecords) {
      const date = record.sessions.startTime.toISOString().split('T')[0];
      if (!dailyStats[date]) dailyStats[date] = { attended: 0, absent: 0 };
      if (record.session_players.attendanceStatus === 'present') {
        dailyStats[date].attended++;
      } else {
        dailyStats[date].absent++;
      }
    }
    
    return Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        attended: stats.attended,
        absent: stats.absent,
        rate: stats.attended + stats.absent > 0 
          ? Math.round((stats.attended / (stats.attended + stats.absent)) * 100) 
          : 0,
      }));
  },

  async getXpVelocity(academyId: string, days: number = 30): Promise<{
    date: string;
    totalXp: number;
    playerCount: number;
    avgXpPerPlayer: number;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const xpRecords = await db
      .select()
      .from(xpTransactions)
      .innerJoin(players, eq(xpTransactions.playerId, players.id))
      .where(and(
        eq(players.academyId, academyId),
        gte(xpTransactions.createdAt, cutoffDate)
      ));
    
    const dailyStats: Record<string, { totalXp: number; playerIds: Set<string> }> = {};
    
    for (const record of xpRecords) {
      const date = record.xp_transactions.createdAt?.toISOString().split('T')[0] || '';
      if (!dailyStats[date]) dailyStats[date] = { totalXp: 0, playerIds: new Set() };
      dailyStats[date].totalXp += record.xp_transactions.xpAmount;
      dailyStats[date].playerIds.add(record.players.id);
    }
    
    return Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        totalXp: stats.totalXp,
        playerCount: stats.playerIds.size,
        avgXpPerPlayer: stats.playerIds.size > 0 ? Math.round(stats.totalXp / stats.playerIds.size) : 0,
      }));
  },

  async getCoachLoadStats(academyId: string, days: number = 7): Promise<{
    coachId: string;
    coachName: string;
    sessionCount: number;
    totalMinutes: number;
    playerCount: number;
    avgSessionsPerDay: number;
    loadLevel: 'light' | 'moderate' | 'heavy';
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const coachSessions = await db
      .select()
      .from(sessions)
      .innerJoin(coaches, eq(sessions.coachId, coaches.id))
      .where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, cutoffDate),
        ne(sessions.status, 'cancelled')
      ));
    
    const coachStats: Record<string, {
      name: string;
      sessions: number;
      minutes: number;
      playerIds: Set<string>;
    }> = {};
    
    for (const record of coachSessions) {
      const coachId = record.coaches.id;
      if (!coachStats[coachId]) {
        coachStats[coachId] = {
          name: record.coaches.name || 'Unknown Coach',
          sessions: 0,
          minutes: 0,
          playerIds: new Set(),
        };
      }
      coachStats[coachId].sessions++;
      coachStats[coachId].minutes += record.sessions.duration;
    }
    
    // Get player counts per coach
    const sessionPlayerRecords = await db
      .select()
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, cutoffDate)
      ));
    
    for (const sp of sessionPlayerRecords) {
      const session = coachSessions.find(cs => cs.sessions.id === sp.sessions.id);
      if (session && coachStats[session.coaches.id] && sp.session_players.playerId) {
        coachStats[session.coaches.id].playerIds.add(sp.session_players.playerId);
      }
    }
    
    return Object.entries(coachStats).map(([coachId, stats]) => {
      const avgSessionsPerDay = Math.round((stats.sessions / days) * 10) / 10;
      let loadLevel: 'light' | 'moderate' | 'heavy' = 'light';
      if (stats.minutes > 300 * days) loadLevel = 'heavy';
      else if (stats.minutes > 180 * days) loadLevel = 'moderate';
      
      return {
        coachId,
        coachName: stats.name,
        sessionCount: stats.sessions,
        totalMinutes: stats.minutes,
        playerCount: stats.playerIds.size,
        avgSessionsPerDay,
        loadLevel,
      };
    });
  },

  // ==================== COACH COURT PREFERENCES ====================
  async getCoachCourtPreferences(coachId: string): Promise<CoachCourtPreference[]> {
    const result = await db
      .select()
      .from(coachCourtPreferences)
      .where(eq(coachCourtPreferences.coachId, coachId))
      .orderBy(asc(coachCourtPreferences.priority));
    return result;
  },

  async getCoachCourtRules(coachId: string): Promise<CoachCourtRules | undefined> {
    const result = await db
      .select()
      .from(coachCourtRules)
      .where(eq(coachCourtRules.coachId, coachId));
    return result[0];
  },

  async upsertCoachCourtPreferences(
    coachId: string,
    preferences: { courtId: string; priority: number }[]
  ): Promise<void> {
    await db.delete(coachCourtPreferences).where(eq(coachCourtPreferences.coachId, coachId));
    
    if (preferences.length > 0) {
      await db.insert(coachCourtPreferences).values(
        preferences.map(p => ({
          coachId,
          courtId: p.courtId,
          priority: p.priority,
        }))
      );
    }
  },

  async upsertCoachCourtRules(
    coachId: string,
    rules: {
      preferredType?: string;
      daylightOnly?: boolean;
      maxSessionsPerCourtPerDay?: number;
      maxTotalSessionsPerDay?: number;
      fallbackBehavior?: string;
    }
  ): Promise<CoachCourtRules> {
    const existing = await db
      .select()
      .from(coachCourtRules)
      .where(eq(coachCourtRules.coachId, coachId));

    if (existing.length > 0) {
      const updated = await db
        .update(coachCourtRules)
        .set({
          preferredType: rules.preferredType ?? existing[0].preferredType,
          daylightOnly: rules.daylightOnly ?? existing[0].daylightOnly,
          maxSessionsPerCourtPerDay: rules.maxSessionsPerCourtPerDay ?? existing[0].maxSessionsPerCourtPerDay,
          maxTotalSessionsPerDay: rules.maxTotalSessionsPerDay ?? existing[0].maxTotalSessionsPerDay,
          fallbackBehavior: rules.fallbackBehavior ?? existing[0].fallbackBehavior,
          updatedAt: new Date(),
        })
        .where(eq(coachCourtRules.coachId, coachId))
        .returning();
      return updated[0];
    } else {
      const inserted = await db
        .insert(coachCourtRules)
        .values({
          coachId,
          preferredType: rules.preferredType ?? "no_preference",
          daylightOnly: rules.daylightOnly ?? false,
          maxSessionsPerCourtPerDay: rules.maxSessionsPerCourtPerDay ?? 8,
          maxTotalSessionsPerDay: rules.maxTotalSessionsPerDay ?? 10,
          fallbackBehavior: rules.fallbackBehavior ?? "suggest",
        })
        .returning();
      return inserted[0];
    }
  },

  // ==================== PHASE 3: ACADEMY SETTINGS ====================
  
  async getAcademySettings(academyId: string): Promise<AcademySettings | undefined> {
    const result = await db.select().from(academySettings).where(eq(academySettings.academyId, academyId));
    return result[0];
  },

  async createAcademySettings(data: InsertAcademySettings): Promise<AcademySettings> {
    const result = await db.insert(academySettings).values(data).returning();
    return result[0];
  },

  async updateAcademySettings(academyId: string, data: Partial<InsertAcademySettings>): Promise<AcademySettings | undefined> {
    const result = await db.update(academySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(academySettings.academyId, academyId))
      .returning();
    return result[0];
  },

  async upsertAcademySettings(academyId: string, data: Partial<InsertAcademySettings>): Promise<AcademySettings> {
    const existing = await this.getAcademySettings(academyId);
    if (existing) {
      return (await this.updateAcademySettings(academyId, data))!;
    }
    return this.createAcademySettings({ ...data, academyId });
  },

  // ==================== ACADEMY OWNER PROFILES ====================

  async getAcademyOwnerProfile(academyId: string): Promise<AcademyOwnerProfile | undefined> {
    const result = await db.select().from(academyOwnerProfiles).where(eq(academyOwnerProfiles.academyId, academyId));
    return result[0];
  },

  async getAllPendingOwnerProfiles(): Promise<AcademyOwnerProfile[]> {
    return db.select().from(academyOwnerProfiles).where(eq(academyOwnerProfiles.approved, false));
  },

  async createAcademyOwnerProfile(data: InsertAcademyOwnerProfile): Promise<AcademyOwnerProfile> {
    const result = await db.insert(academyOwnerProfiles).values(data).returning();
    return result[0];
  },

  async updateAcademyOwnerProfile(academyId: string, data: Partial<InsertAcademyOwnerProfile>): Promise<AcademyOwnerProfile | undefined> {
    const result = await db.update(academyOwnerProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(academyOwnerProfiles.academyId, academyId))
      .returning();
    return result[0];
  },

  async upsertAcademyOwnerProfile(academyId: string, data: Partial<InsertAcademyOwnerProfile>): Promise<AcademyOwnerProfile> {
    const existing = await this.getAcademyOwnerProfile(academyId);
    if (existing) {
      return (await this.updateAcademyOwnerProfile(academyId, data))!;
    }
    return this.createAcademyOwnerProfile({ ...data, academyId } as InsertAcademyOwnerProfile);
  },

  async approveOwnerProfile(academyId: string, approvedBy: string): Promise<AcademyOwnerProfile | undefined> {
    const result = await db.update(academyOwnerProfiles)
      .set({ approved: true, approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(academyOwnerProfiles.academyId, academyId))
      .returning();
    return result[0];
  },

  async rejectOwnerProfile(academyId: string): Promise<AcademyOwnerProfile | undefined> {
    const result = await db.update(academyOwnerProfiles)
      .set({ approved: false, approvedBy: null, approvedAt: null, updatedAt: new Date() })
      .where(eq(academyOwnerProfiles.academyId, academyId))
      .returning();
    return result[0];
  },

  // ==================== PHASE 3: ACADEMY INVITES ====================

  async createAcademyInvite(data: InsertAcademyInvite): Promise<AcademyInvite> {
    const result = await db.insert(academyInvites).values(data).returning();
    return result[0];
  },

  async getAcademyInvite(id: string): Promise<AcademyInvite | undefined> {
    const result = await db.select().from(academyInvites).where(eq(academyInvites.id, id));
    return result[0];
  },

  async getAcademyInviteByCode(code: string): Promise<AcademyInvite | undefined> {
    const result = await db.select().from(academyInvites).where(eq(academyInvites.inviteCode, code));
    return result[0];
  },

  async getAcademyInvites(academyId: string): Promise<AcademyInvite[]> {
    return db.select().from(academyInvites)
      .where(eq(academyInvites.academyId, academyId))
      .orderBy(desc(academyInvites.createdAt));
  },

  async updateAcademyInvite(id: string, data: Partial<AcademyInvite>): Promise<AcademyInvite | undefined> {
    const result = await db.update(academyInvites).set(data).where(eq(academyInvites.id, id)).returning();
    return result[0];
  },

  async deleteAcademyInvite(id: string): Promise<void> {
    await db.delete(academyInvites).where(eq(academyInvites.id, id));
  },

  // ==================== PHASE 3: COACH MEMBERSHIPS ====================

  async createCoachMembership(data: InsertCoachAcademyMembership): Promise<CoachAcademyMembership> {
    const result = await db.insert(coachAcademyMemberships).values(data).returning();
    return result[0];
  },

  async getCoachMemberships(coachId: string): Promise<CoachAcademyMembership[]> {
    return db.select().from(coachAcademyMemberships)
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.isActive, true)
      ));
  },

  async getAcademyMembers(academyId: string): Promise<CoachAcademyMembership[]> {
    return db.select().from(coachAcademyMemberships)
      .where(and(
        eq(coachAcademyMemberships.academyId, academyId),
        eq(coachAcademyMemberships.isActive, true)
      ));
  },

  async getCoachAcademyMembership(coachId: string, academyId: string): Promise<CoachAcademyMembership | undefined> {
    const result = await db.select().from(coachAcademyMemberships)
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.academyId, academyId)
      ));
    return result[0];
  },

  async createCoachAcademyMembership(data: InsertCoachAcademyMembership): Promise<CoachAcademyMembership> {
    const result = await db.insert(coachAcademyMemberships).values(data).returning();
    return result[0];
  },

  async updateCoachAcademyMembership(id: string, data: Partial<CoachAcademyMembership>): Promise<CoachAcademyMembership | undefined> {
    const result = await db.update(coachAcademyMemberships).set(data).where(eq(coachAcademyMemberships.id, id)).returning();
    return result[0];
  },

  async updateCoachMembership(id: string, data: Partial<CoachAcademyMembership>): Promise<CoachAcademyMembership | undefined> {
    const result = await db.update(coachAcademyMemberships).set(data).where(eq(coachAcademyMemberships.id, id)).returning();
    return result[0];
  },

  async setPrimaryAcademy(coachId: string, academyId: string): Promise<void> {
    // First unset all as non-primary
    await db.update(coachAcademyMemberships)
      .set({ isPrimary: false })
      .where(eq(coachAcademyMemberships.coachId, coachId));
    // Set the new primary
    await db.update(coachAcademyMemberships)
      .set({ isPrimary: true })
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.academyId, academyId)
      ));
  },

  // ==================== COACH FREELANCE PROFILES ====================

  async getCoachFreelanceProfile(coachId: string): Promise<CoachFreelanceProfile | undefined> {
    const result = await db.select().from(coachFreelanceProfiles)
      .where(eq(coachFreelanceProfiles.coachId, coachId));
    return result[0];
  },

  async createCoachFreelanceProfile(data: InsertCoachFreelanceProfile): Promise<CoachFreelanceProfile> {
    const result = await db.insert(coachFreelanceProfiles).values(data).returning();
    return result[0];
  },

  async updateCoachFreelanceProfile(coachId: string, data: Partial<CoachFreelanceProfile>): Promise<CoachFreelanceProfile | undefined> {
    const result = await db.update(coachFreelanceProfiles)
      .set(data)
      .where(eq(coachFreelanceProfiles.coachId, coachId))
      .returning();
    return result[0];
  },

  async getFreelanceAcademyByCoachId(coachId: string): Promise<Academy | undefined> {
    const result = await db.select().from(academies)
      .where(and(
        eq(academies.isFreelance, true),
        eq(academies.freelanceOwnerCoachId, coachId)
      ));
    return result[0];
  },

  // ==================== ADMIN MANAGEMENT ====================
  
  async getAcademyAdmins(academyId: string): Promise<Coach[]> {
    const memberships = await db.select()
      .from(coachAcademyMemberships)
      .where(and(
        eq(coachAcademyMemberships.academyId, academyId),
        eq(coachAcademyMemberships.role, "admin"),
        eq(coachAcademyMemberships.isActive, true)
      ));
    
    if (memberships.length === 0) return [];
    
    const adminCoaches = await Promise.all(
      memberships.map(m => this.getCoach(m.coachId))
    );
    
    return adminCoaches.filter((c): c is Coach => c !== undefined);
  },

  async promoteToAdmin(coachId: string, academyId: string): Promise<void> {
    await db.update(coachAcademyMemberships)
      .set({ role: "admin" })
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.academyId, academyId)
      ));
  },

  async demoteFromAdmin(coachId: string, academyId: string): Promise<void> {
    await db.update(coachAcademyMemberships)
      .set({ role: "coach" })
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.academyId, academyId)
      ));
  },

  // ==================== PHASE 3: PUSH NOTIFICATIONS ====================

  async registerPushToken(data: InsertPushDeviceToken): Promise<PushDeviceToken> {
    const isFCM = data.token && !data.token.startsWith('ExponentPushToken[') && data.token.length > 100;
    const isExpo = data.token?.startsWith('ExponentPushToken[');
    const tokenType = isFCM ? 'FCM' : isExpo ? 'EXPO' : 'UNKNOWN';
    
    console.log(`[PushToken] Registering ${tokenType} token for user ${data.userId} (coach: ${data.coachId}, player: ${data.playerId})`);

    const existing = await db.select().from(pushDeviceTokens).where(eq(pushDeviceTokens.token, data.token));
    if (existing.length > 0) {
      const updated = await db.update(pushDeviceTokens)
        .set({ 
          isActive: true, 
          lastUsedAt: new Date(), 
          coachId: data.coachId,
          playerId: data.playerId || existing[0].playerId,
        })
        .where(eq(pushDeviceTokens.token, data.token))
        .returning();
      console.log(`[PushToken] Updated existing ${tokenType} token, lastUsedAt refreshed`);
      return updated[0];
    }

    if (data.userId) {
      const oldTokens = await db.select().from(pushDeviceTokens).where(
        and(
          eq(pushDeviceTokens.userId, data.userId),
          eq(pushDeviceTokens.isActive, true)
        )
      );
      const staleTokens = oldTokens.filter(t => t.token !== data.token);
      if (staleTokens.length > 0) {
        for (const stale of staleTokens) {
          await db.update(pushDeviceTokens)
            .set({ isActive: false })
            .where(eq(pushDeviceTokens.id, stale.id));
          const staleType = stale.token.startsWith('ExponentPushToken[') ? 'Expo' : 'FCM';
          console.log(`[PushToken] Deactivated old ${staleType} token for user ${data.userId} (replaced by new ${tokenType})`);
        }
      }
    }

    const result = await db.insert(pushDeviceTokens).values(data).returning();
    console.log(`[PushToken] Registered NEW ${tokenType} token for user ${data.userId} (platform: ${data.platform})`);
    return result[0];
  },

  async getCoachPushTokens(coachId: string): Promise<PushDeviceToken[]> {
    return db.select().from(pushDeviceTokens)
      .where(and(
        eq(pushDeviceTokens.coachId, coachId),
        eq(pushDeviceTokens.isActive, true)
      ));
  },

  async deactivatePushToken(token: string): Promise<void> {
    await db.update(pushDeviceTokens)
      .set({ isActive: false })
      .where(eq(pushDeviceTokens.token, token));
  },

  async getNotificationPreferences(coachId: string): Promise<NotificationPreference | undefined> {
    const result = await db.select().from(notificationPreferences).where(eq(notificationPreferences.coachId, coachId));
    return result[0];
  },

  async upsertNotificationPreferences(coachId: string, data: Partial<InsertNotificationPreference>): Promise<NotificationPreference> {
    const existing = await this.getNotificationPreferences(coachId);
    if (existing) {
      const result = await db.update(notificationPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationPreferences.coachId, coachId))
        .returning();
      return result[0];
    }
    const result = await db.insert(notificationPreferences).values({ ...data, coachId }).returning();
    return result[0];
  },

  async createScheduledNotification(data: InsertScheduledNotification): Promise<ScheduledNotification> {
    const result = await db.insert(scheduledNotifications).values(data).returning();
    return result[0];
  },

  async getPendingNotifications(before: Date): Promise<ScheduledNotification[]> {
    return db.select().from(scheduledNotifications)
      .where(and(
        eq(scheduledNotifications.status, 'pending'),
        lte(scheduledNotifications.scheduledFor, before)
      ))
      .orderBy(asc(scheduledNotifications.scheduledFor));
  },

  async markNotificationSent(id: string, error?: string): Promise<void> {
    await db.update(scheduledNotifications)
      .set({
        status: error ? 'failed' : 'sent',
        sentAt: error ? null : new Date(),
        error: error || null,
      })
      .where(eq(scheduledNotifications.id, id));
  },

  // ==================== PHASE 3: BILLING ====================

  async getBillingAccount(academyId: string): Promise<BillingAccount | undefined> {
    const result = await db.select().from(billingAccounts).where(eq(billingAccounts.academyId, academyId));
    return result[0];
  },

  async createBillingAccount(data: InsertBillingAccount): Promise<BillingAccount> {
    const result = await db.insert(billingAccounts).values(data).returning();
    return result[0];
  },

  async updateBillingAccount(academyId: string, data: Partial<InsertBillingAccount>): Promise<BillingAccount | undefined> {
    const result = await db.update(billingAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(billingAccounts.academyId, academyId))
      .returning();
    return result[0];
  },

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(asc(subscriptionPlans.sortOrder));
  },

  async getSubscription(academyId: string): Promise<Subscription | undefined> {
    const result = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.academyId, academyId),
        eq(subscriptions.status, 'active')
      ));
    return result[0];
  },

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(data).returning();
    return result[0];
  },

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const result = await db.update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return result[0];
  },

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const result = await db.insert(invoices).values(data).returning();
    return result[0];
  },

  async getInvoices(academyId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(eq(invoices.academyId, academyId))
      .orderBy(desc(invoices.createdAt));
  },

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const result = await db.select().from(invoices).where(eq(invoices.id, id));
    return result[0];
  },

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const result = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    const updated = result[0];

    // V2 bridge (Task #665): when an invoice flips to "paid" on a V2 academy
    // and it has a packageId, deposit a credit_lots row via the credit
    // engine. purchasePackage is idempotent on event_key
    // `purchase:inv:<invoiceId>`, so re-runs are safe.
    if (updated && data.status === "paid" && updated.packageId && updated.academyId) {
      try {
        const { isV2EnabledForAcademy } = await import("./services/credit-feature-flag");
        if (await isV2EnabledForAcademy(updated.academyId)) {
          const pkg = await this.getPackage(updated.packageId, updated.academyId);
          if (pkg) {
            const { purchasePackage, normalizeSessionTypeToCreditType } = await import("./services/credit-engine");
            const type = normalizeSessionTypeToCreditType(pkg.creditType);
            await purchasePackage({
              playerId: pkg.playerId,
              academyId: pkg.academyId,
              type,
              qty: Number(pkg.totalCredits),
              pricePerCredit: parseFloat(String(pkg.pricePerCredit ?? "0")),
              currency: pkg.currency ?? "AED",
              invoiceId: updated.id,
              sourcePackageId: pkg.id,
              purchasedAt: pkg.purchasedAt ?? new Date(),
              expiresAt: pkg.expiresAt ?? null,
              actorRole: "system",
            });
          }
        }
      } catch (bridgeErr) {
        console.error(`[updateInvoice][V2 bridge] failed for invoice ${id}:`, bridgeErr);
      }
    }

    return updated;
  },

  async createPayment(data: InsertPayment): Promise<Payment> {
    const result = await db.insert(payments).values(data).returning();
    return result[0];
  },

  async getPayments(academyId: string): Promise<Payment[]> {
    return db.select().from(payments)
      .where(eq(payments.academyId, academyId))
      .orderBy(desc(payments.createdAt));
  },

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const result = await db.update(payments).set({ ...data, updatedAt: new Date() }).where(eq(payments.id, id)).returning();
    return result[0];
  },

  async getPayment(id: string): Promise<Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.id, id));
    return result[0];
  },

  async getPaymentsWithFilters(academyId: string, filters: {
    status?: string;
    paymentMethod?: string;
    playerId?: string;
    receivedBy?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Payment[]> {
    let query = db.select().from(payments).where(eq(payments.academyId, academyId));
    
    const allPayments = await query.orderBy(desc(payments.createdAt));
    
    return allPayments.filter(p => {
      if (filters.status && p.status !== filters.status) return false;
      if (filters.paymentMethod && p.paymentMethod !== filters.paymentMethod) return false;
      if (filters.playerId && p.playerId !== filters.playerId) return false;
      if (filters.receivedBy && p.receivedBy !== filters.receivedBy) return false;
      if (filters.startDate && p.createdAt && new Date(p.createdAt) < filters.startDate) return false;
      if (filters.endDate && p.createdAt && new Date(p.createdAt) > filters.endDate) return false;
      return true;
    });
  },

  async confirmPayment(id: string, confirmedById: string): Promise<Payment | undefined> {
    const result = await db.update(payments)
      .set({
        status: 'confirmed',
        confirmedBy: confirmedById,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();
    return result[0];
  },

  async rejectPayment(id: string, rejectedById: string, reason: string): Promise<Payment | undefined> {
    const result = await db.update(payments)
      .set({
        status: 'rejected',
        rejectedBy: rejectedById,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();
    return result[0];
  },

  async deletePayment(id: string): Promise<boolean> {
    const result = await db.delete(payments).where(eq(payments.id, id)).returning();
    return result.length > 0;
  },

  // ==================== CREDIT TRANSACTIONS ====================
  /**
   * Task #676 Phase 2 — V1 write gate.
   *
   * For V2 academies we SKIP the legacy `credit_transactions` INSERT and
   * return `null`. The V2 short-circuits in `consumeCreditsForClassSession`,
   * `ensureCreditProcessed`, etc. fire before this wrapper is reached on
   * the booking/consume hot paths, so the in-app caller never sees a null
   * here in practice. All known callers either ignore the return value or
   * only use `.id` for logging — both safe with `null`.
   *
   * For V1 academies behaviour is unchanged: insert and return the row.
   *
   * If the skipped insert is for a `session_consumed` / `session_booking`
   * reason, the gated code path also skips the paired
   * `update(packages).set({ remainingCredits })`, so we bump the package
   * skip counter for the watchdog.
   */
  async createCreditTransaction(
    data: InsertCreditTransaction,
  ): Promise<CreditTransaction | null> {
    const {
      v1WritesAllowed,
      noteV1PackageWriteSkip,
    } = await import("./services/credit-feature-flag");
    if (!(await v1WritesAllowed(data.academyId ?? null))) {
      const r = data.reason;
      if (
        r === "session_consumed" ||
        r === "session_booking" ||
        r === "session_settlement" ||
        r === "session_cancel" ||
        r === "session_cancel_early"
      ) {
        noteV1PackageWriteSkip();
      }
      return null;
    }
    const result = await db.insert(creditTransactions).values(data).returning();
    return result[0];
  },

  async getCreditTransactionsByPlayer(playerId: string): Promise<CreditTransaction[]> {
    return db.select().from(creditTransactions)
      .where(eq(creditTransactions.playerId, playerId))
      .orderBy(desc(creditTransactions.createdAt));
  },

  async getCreditTransactionsBySession(sessionId: string): Promise<CreditTransaction[]> {
    return db.select().from(creditTransactions)
      .where(eq(creditTransactions.sessionId, sessionId))
      .orderBy(desc(creditTransactions.createdAt));
  },

  // Consume credits for all active class members when a session is completed
  // This is the core billing logic for class-based memberships
  // Uses transactions to ensure atomicity and prevent race conditions
  // Credits are matched by type: group sessions use group credits, etc.
  async consumeCreditsForClassSession(seriesId: string, sessionId: string, sessionDate: Date): Promise<{ 
    consumed: number; 
    skipped: number; 
    errors: string[];
  }> {
    const results = { consumed: 0, skipped: 0, errors: [] as string[] };
    
    // Get the series to find academyId and sessionType
    const series = await this.getCoachingSeriesById(seriesId);
    const academyId = series?.academyId || null;

    // Phase 3 — Task #651. V2 short-circuit: when the academy is on the
    // new Credit Engine, route every chargeable session_player through
    // credit-engine.consumeCredit and freeze the legacy package
    // decrement + credit_transactions write-path. The engine handles
    // attendance + chargeability internally and is idempotent on
    // `consume:<sessionPlayerId>`, so re-runs are safe.
    if (academyId) {
      const { isV2EnabledForAcademy } = await import("./services/credit-feature-flag");
      if (await isV2EnabledForAcademy(academyId)) {
        try {
          const sps = await db.execute(sql`
            SELECT id FROM session_players WHERE session_id = ${sessionId}
          `);
          const { consumeCredit } = await import("./services/credit-engine");
          for (const row of sps.rows) {
            const spId = (row as { id: string }).id;
            try {
              const r = await consumeCredit({ sessionPlayerId: spId, actorRole: "system" });
              if (r.charged) results.consumed += 1;
              else results.skipped += 1;
            } catch (err: any) {
              results.errors.push(`sp ${spId}: ${err?.message ?? String(err)}`);
            }
          }
          return results;
        } catch (v2Err: any) {
          console.error(`[consumeCreditsForClassSession][V2] failed for session ${sessionId}:`, v2Err);
          results.errors.push(v2Err?.message ?? "v2_consume_error");
          return results;
        }
      }
    }
    
    // Fetch session duration for proportional credit charging
    const sessionResult = await db.select({ duration: sessions.duration }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const sessionDuration = sessionResult[0]?.duration || 60;
    const creditCost = sessionDuration / 60;
    
    // Map session type to credit type
    const normalizeType = (type: string | undefined): string => {
      if (!type) return "group";
      const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
      if (normalized === "semi" || normalized === "semi_private") return "semi_private";
      if (normalized === "private") return "private";
      return "group";
    };
    const requiredCreditType = normalizeType(series?.sessionType);
    
    // Get active players for this date (excludes paused players)
    const activeMembers = await this.getActiveSeriesPlayersForDate(seriesId, sessionDate);
    
    for (const member of activeMembers) {
      try {
        // Use a transaction for each member to ensure atomicity
        // The key insight: INSERT the ledger entry FIRST (with ON CONFLICT), then decrement credits only if insert succeeded
        // This guarantees exactly-once debit semantics
        await db.transaction(async (tx) => {
          // Find the package to deduct from - must match credit type
          // Priority: 1) Linked package on membership (if matching type), 2) Any active package for this player with matching type
          let packageToUse = null;
          let creditType = requiredCreditType;
          
          if (member.linkedPackageId) {
            // Lock the package row with FOR UPDATE to prevent concurrent modifications
            // Only use if credit type matches or is null (legacy packages)
            const linked = await tx.execute(sql`
              SELECT * FROM packages 
              WHERE id = ${member.linkedPackageId} 
                AND status = 'active'
                AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
              FOR UPDATE
            `);
            if (linked.rows[0] && (linked.rows[0] as any).remaining_credits >= creditCost) {
              packageToUse = {
                id: (linked.rows[0] as any).id,
                remainingCredits: (linked.rows[0] as any).remaining_credits,
                creditType: (linked.rows[0] as any).credit_type,
              };
            }
          }
          
          if (!packageToUse) {
            // Find any active package for this player with matching credit type (or null for legacy)
            const playerPackagesResult = await tx.execute(sql`
              SELECT * FROM packages 
              WHERE player_id = ${member.playerId} 
                AND status = 'active' 
                AND remaining_credits >= ${creditCost}
                AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
              ORDER BY CASE WHEN series_id = ${seriesId} THEN 1 ELSE 0 END DESC, expiry_date ASC NULLS LAST
              FOR UPDATE
              LIMIT 1
            `);
            
            if (playerPackagesResult.rows[0]) {
              const p = playerPackagesResult.rows[0] as any;
              packageToUse = {
                id: p.id,
                remainingCredits: p.remaining_credits,
                creditType: p.credit_type,
              };
            }
          }
          
          if (!packageToUse) {
            results.errors.push(`No ${requiredCreditType} credits available for player ${member.playerId}`);
            return;
          }
          
          creditType = packageToUse.creditType || requiredCreditType;
          const balanceBefore = Number(packageToUse.remainingCredits);
          const balanceAfter = balanceBefore - creditCost;
          
          // STEP 1: Try to claim the ledger entry FIRST using ON CONFLICT with the partial unique index
          // The index credit_transactions_unique_session_join enforces uniqueness on (player_id, session_id) where reason='session_join'
          // This is the authoritative race-condition guard at the database level
          try {
            const insertResult = await tx.execute(sql`
              INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
              VALUES (${member.playerId}, ${academyId}, ${sessionId}, ${packageToUse.id}, 'debit', ${creditType}, ${-creditCost}, 'session_join', ${balanceBefore}, ${balanceAfter}, 
                     ${JSON.stringify({ packageId: packageToUse.id, seriesId, description: "Credit consumed for class session" })}::jsonb)
              ON CONFLICT DO NOTHING
              RETURNING id
            `);
            
            // If no row returned, a duplicate already exists (conflict occurred)
            if (insertResult.rowCount === 0) {
              results.skipped++;
              return;
            }
          } catch (insertError: any) {
            // Handle unique constraint violation as fallback
            if (insertError.code === '23505') { // PostgreSQL unique violation
              results.skipped++;
              return;
            }
            throw insertError;
          }
          
          // STEP 2: Ledger entry claimed successfully, now decrement the package credits
          await tx.update(packages)
            .set({ 
              remainingCredits: balanceAfter,
              status: balanceAfter <= 0 ? "depleted" : "active",
            })
            .where(eq(packages.id, packageToUse.id));
          
          results.consumed++;
        });
      } catch (txError) {
        console.error(`[Credits] Transaction error for player ${member.playerId}:`, txError);
        results.errors.push(`Transaction failed for player ${member.playerId}`);
      }
    }
    
    return results;
  },

  // Consume credits for class session with dynamic credit type based on actual attendance
  // For semi-private sessions: if only 1 player present OR 1 total in group, charge private credits
  async consumeCreditsForClassSessionWithAttendance(
    seriesId: string, 
    sessionId: string, 
    sessionDate: Date, 
    presentPlayerIds: string[],
    presentCount: number,
    totalPlayersInSession: number = 0
  ): Promise<{ 
    consumed: number; 
    skipped: number; 
    errors: string[];
    actualCreditType: string;
  }> {
    const results = { consumed: 0, skipped: 0, errors: [] as string[], actualCreditType: "group" };
    
    // Get the series to find academyId and sessionType
    const series = await this.getCoachingSeriesById(seriesId);
    const academyId = series?.academyId || null;

    // Phase 3 — Task #651. V2 short-circuit. The engine handles the
    // attendance-based "originally private" + semi→private re-classification
    // internally, so we just hand it every session_player and let it decide
    // chargeability. Idempotent on `consume:<sessionPlayerId>`.
    if (academyId) {
      const { isV2EnabledForAcademy } = await import("./services/credit-feature-flag");
      if (await isV2EnabledForAcademy(academyId)) {
        try {
          const sps = await db.execute(sql`
            SELECT id FROM session_players WHERE session_id = ${sessionId}
          `);
          const { consumeCredit } = await import("./services/credit-engine");
          let lastType: string | null = null;
          for (const row of sps.rows) {
            const spId = (row as { id: string }).id;
            try {
              const r = await consumeCredit({ sessionPlayerId: spId, actorRole: "system" });
              if (r.charged) {
                results.consumed += 1;
                if (r.type) lastType = r.type;
              } else {
                results.skipped += 1;
              }
            } catch (err: any) {
              results.errors.push(`sp ${spId}: ${err?.message ?? String(err)}`);
            }
          }
          if (lastType) results.actualCreditType = lastType;
          return results;
        } catch (v2Err: any) {
          console.error(`[consumeCreditsForClassSessionWithAttendance][V2] failed for session ${sessionId}:`, v2Err);
          results.errors.push(v2Err?.message ?? "v2_consume_error");
          return results;
        }
      }
    }
    
    // Fetch session duration for proportional credit charging
    const sessionResult = await db.select({ duration: sessions.duration }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const sessionDuration = sessionResult[0]?.duration || 60;
    const creditCost = sessionDuration / 60;
    
    // Map session type to credit type with dynamic override
    const normalizeType = (type: string | undefined): string => {
      if (!type) return "group";
      const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
      if (normalized === "semi" || normalized === "semi_private") return "semi_private";
      if (normalized === "private") return "private";
      return "group";
    };
    
    let requiredCreditType = normalizeType(series?.sessionType);
    
    // Dynamic credit type: semi-private with only 1 player (present OR total in group) becomes private
    if (requiredCreditType === "semi_private") {
      if (totalPlayersInSession === 1) {
        requiredCreditType = "private";
        console.log(`[Credits] Session ${sessionId}: Semi-private with only 1 player in group, charging as private`);
      } else if (presentCount === 1) {
        requiredCreditType = "private";
        console.log(`[Credits] Session ${sessionId}: Semi-private with 1 present out of ${totalPlayersInSession}, charging as private`);
      }
    }
    
    results.actualCreditType = requiredCreditType;
    
    // Only process present players
    for (const playerId of presentPlayerIds) {
      try {
        await db.transaction(async (tx) => {
          // Find the package to deduct from - must match credit type
          let packageToUse = null;
          let creditType = requiredCreditType;
          
          // Find any active package for this player with matching credit type (or null for legacy)
          const playerPackagesResult = await tx.execute(sql`
            SELECT * FROM packages 
            WHERE player_id = ${playerId} 
              AND status = 'active' 
              AND remaining_credits >= ${creditCost}
              AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
            ORDER BY CASE WHEN series_id = ${seriesId} THEN 1 ELSE 0 END DESC, expiry_date ASC NULLS LAST
            FOR UPDATE
            LIMIT 1
          `);
          
          if (playerPackagesResult.rows[0]) {
            const p = playerPackagesResult.rows[0] as any;
            packageToUse = {
              id: p.id,
              remainingCredits: p.remaining_credits,
              creditType: p.credit_type,
            };
          }
          
          if (!packageToUse) {
            // No matching package found - just log the unpaid session (no debt packages)
            // The session is attended but credits will be deducted when a package is added
            try {
              const unpaidResult = await tx.execute(sql`
                INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
                VALUES (${playerId}, ${academyId}, ${sessionId}, NULL, 'debit', ${requiredCreditType}, ${-creditCost}, 'session_unpaid', 0, ${-creditCost}, 
                       ${JSON.stringify({ seriesId, description: `Unpaid: ${requiredCreditType} session`, isUnpaid: true, actualCreditType: requiredCreditType })}::jsonb)
                ON CONFLICT DO NOTHING
                RETURNING id
              `);
              
              if (unpaidResult.rowCount === 0) {
                results.skipped++;
              } else {
                results.consumed++;
                console.log(`[Credits] Player ${playerId}: Session marked as unpaid (no ${requiredCreditType} credits available), cost: ${creditCost}`);
              }
            } catch (unpaidError: any) {
              if (unpaidError.code === '23505') {
                results.skipped++;
              } else {
                console.error(`[Credits] Unpaid session error for player ${playerId}:`, unpaidError);
                results.errors.push(`Unpaid session tracking failed for player ${playerId}`);
              }
            }
            return;
          }
          
          creditType = packageToUse.creditType || requiredCreditType;
          const balanceBefore = Number(packageToUse.remainingCredits);
          const balanceAfter = balanceBefore - creditCost;
          
          // STEP 1: Try to claim the ledger entry FIRST using ON CONFLICT
          try {
            const insertResult = await tx.execute(sql`
              INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
              VALUES (${playerId}, ${academyId}, ${sessionId}, ${packageToUse.id}, 'debit', ${creditType}, ${-creditCost}, 'session_join', ${balanceBefore}, ${balanceAfter}, 
                     ${JSON.stringify({ packageId: packageToUse.id, seriesId, description: `Credit consumed (${requiredCreditType})`, actualCreditType: requiredCreditType })}::jsonb)
              ON CONFLICT DO NOTHING
              RETURNING id
            `);
            
            if (insertResult.rowCount === 0) {
              results.skipped++;
              return;
            }
          } catch (insertError: any) {
            if (insertError.code === '23505') {
              results.skipped++;
              return;
            }
            throw insertError;
          }
          
          // STEP 2: Ledger entry claimed successfully, now decrement the package credits
          await tx.update(packages)
            .set({ 
              remainingCredits: balanceAfter,
              status: balanceAfter <= 0 ? "depleted" : "active",
            })
            .where(eq(packages.id, packageToUse.id));
          
          console.log(`[Credits] Player ${playerId}: Consumed ${creditCost} ${creditType} credit(s) for session ${sessionId} (duration: ${sessionDuration}min)`);
          results.consumed++;
        });
      } catch (txError) {
        console.error(`[Credits] Transaction error for player ${playerId}:`, txError);
        results.errors.push(`Transaction failed for player ${playerId}`);
      }
    }
    
    return results;
  },

  // Get available credits for a player (across all packages)
  async getPlayerCredits(playerId: string): Promise<{ total: number; byPackage: { id: string; name: string | null; remaining: number; expiry: string | null }[] }> {
    const playerPackages = await db.select().from(packages)
      .where(and(
        eq(packages.playerId, playerId),
        eq(packages.status, "active")
      ));
    
    const total = playerPackages.reduce((sum, p) => sum + Number(p.remainingCredits), 0);
    const byPackage = playerPackages.map(p => ({
      id: p.id,
      name: p.name,
      remaining: p.remainingCredits,
      expiry: p.expiryDate,
    }));
    
    return { total, byPackage };
  },

  // Delete all credit transactions for a session (used when re-marking attendance)
  async deleteSessionCreditTransactions(sessionId: string): Promise<number> {
    const result = await db.delete(creditTransactions)
      .where(eq(creditTransactions.sessionId, sessionId));
    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`[Credits] Deleted ${deletedCount} existing credit transactions for session ${sessionId}`);
    }
    return deletedCount;
  },

  // Get player credit balance by type, including debts (negative balances)
  // Returns balance per credit type: positive = available credits, negative = debt
  //
  // Hybrid approach combining three sources to prevent double-counting:
  //   1. credit_transactions ledger (purchases, debits, adjustments)
  //   2. packages table fallback: for each existing package without a matching
  //      positive credit_transaction, adds package.totalCredits to balance
  //   3. session_players cross-reference: for each attended session without a
  //      matching debit transaction, adds a debit to balance
  async getPlayerCreditBalanceByType(playerId: string): Promise<{
    group: number;
    semi_private: number;
    private: number;
    totalDebt: number;
    hasDebt: boolean;
  }> {
    const normalizeType = (type: string | undefined | null): "group" | "semi_private" | "private" => {
      if (!type) return "group";
      const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
      if (normalized === "semi" || normalized === "semi_private" || normalized === "semi_private_adjusted") return "semi_private";
      if (normalized === "private" || normalized === "private_adjusted") return "private";
      return "group";
    };

    // Read balance directly from packages.remaining_credits — the single source of truth.
    // This is maintained atomically by ensureCreditProcessed and settlePlayerDebts.
    const activePackages = await db.select({
      creditType: packages.creditType,
      remainingCredits: packages.remainingCredits,
    }).from(packages)
      .where(and(
        eq(packages.playerId, playerId),
        eq(packages.status, "active"),
      ));

    const balance = { group: 0, semi_private: 0, private: 0 };
    for (const pkg of activePackages) {
      const type = normalizeType(pkg.creditType);
      balance[type] += Number(pkg.remainingCredits);
    }

    // Debt = unsettled session_debt transactions (player used sessions with no package available).
    // Only new-style records are generated; legacy paths no longer create new records.
    const debtResult = await db.execute(sql`
      SELECT credit_type, ABS(SUM(amount::numeric)) as total
      FROM credit_transactions ct
      WHERE player_id = ${playerId}
        AND amount < 0
        AND type = 'debit'
        AND reason = 'session_debt'
        AND COALESCE(metadata->>'cancelled', 'false') != 'true'
        AND COALESCE(metadata->>'settled', 'false') != 'true'
      GROUP BY credit_type
    `);

    let totalDebt = 0;
    const debtByType = { group: 0, semi_private: 0, private: 0 };
    for (const row of debtResult.rows) {
      const amount = Number((row as any).total);
      totalDebt += amount;
      const type = normalizeType((row as any).credit_type);
      debtByType[type] += amount;
    }

    return {
      group: balance.group - debtByType.group,
      semi_private: balance.semi_private - debtByType.semi_private,
      private: balance.private - debtByType.private,
      totalDebt,
      hasDebt: totalDebt > 0,
    };
  },

  async getUncoveredSessionsByType(playerId: string): Promise<{ group: number; semi_private: number; private: number }> {
    const normalizeType = (t: string): "group" | "semi_private" | "private" => {
      if (t === "semi_private" || t === "semi_private_adjusted") return "semi_private";
      if (t === "private" || t === "private_adjusted") return "private";
      return "group";
    };
    // Task #636: Mirror shouldChargeCredit semantics so under-counts can't happen.
    //   - present/late: chargeable for ALL session types
    //   - absent: chargeable for group/group_adjusted, private, AND private_adjusted
    //     when isOriginallyPrivate=true (i.e. the series wasn't semi_private).
    //     NOT chargeable for semi_private/semi_private_adjusted, or private_adjusted
    //     that originated from a semi_private series.
    // Use a player+session NOT EXISTS check (instead of joining on sp.credit_transaction_id),
    // so legacy rows whose link points at a cancelled transaction are correctly counted as uncovered.
    const result = await db.execute(sql`
      SELECT s.session_type, count(*)::int as cnt
      FROM session_players sp
      JOIN sessions s ON sp.session_id = s.id
      LEFT JOIN coaching_series cs ON cs.id = s.series_id
      WHERE sp.player_id = ${playerId}
        AND s.status != 'cancelled'
        AND (
          sp.attendance_status IN ('present', 'late')
          OR (
            sp.attendance_status = 'absent'
            AND (
              LOWER(REPLACE(REPLACE(COALESCE(s.session_type, 'group'), '-', '_'), ' ', '_'))
                IN ('group', 'group_adjusted', 'private')
              OR (
                LOWER(REPLACE(REPLACE(COALESCE(s.session_type, 'group'), '-', '_'), ' ', '_')) = 'private_adjusted'
                AND COALESCE(LOWER(REPLACE(REPLACE(cs.session_type, '-', '_'), ' ', '_')), 'private') != 'semi_private'
              )
            )
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM credit_transactions ct
          WHERE ct.player_id = sp.player_id
            AND ct.session_id = sp.session_id
            AND ct.amount < 0
            AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
        )
      GROUP BY s.session_type
    `);
    const out: { group: number; semi_private: number; private: number } = { group: 0, semi_private: 0, private: 0 };
    for (const row of result.rows) {
      const type = normalizeType((row as any).session_type as string);
      out[type] += Number((row as any).cnt);
    }
    return out;
  },

  // Cancel/reverse debt transaction when attendance changes to holiday/vacation, or when
  // a session is cancelled. Removes debt for sessions the player legitimately did not attend.
  async cancelSessionDebt(playerId: string, sessionId: string, reason: string = "attendance_changed_to_holiday"): Promise<{ cancelled: boolean; amount: number }> {
    console.log(`[CancelDebt] Checking for debt to cancel - player: ${playerId}, session: ${sessionId}`);
    
    // Find debt transactions for this player and session
    const debtTransactions = await db.select().from(creditTransactions)
      .where(and(
        eq(creditTransactions.playerId, playerId),
        eq(creditTransactions.sessionId, sessionId),
        or(
          eq(creditTransactions.reason, "session_debt"),
          eq(creditTransactions.reason, "session_join_debt"),
          eq(creditTransactions.reason, "session_unpaid"),
          eq(creditTransactions.reason, "session_booking")
        )
      ));
    
    // Filter to actual debts (not settled)
    const unsettledDebts = debtTransactions.filter(t => {
      const meta = t.metadata as { isDebt?: boolean; settled?: boolean; cancelled?: boolean } | null;
      if (meta?.settled === true || meta?.cancelled === true) return false;
      if (t.reason === "session_debt" || t.reason === "session_join_debt" || t.reason === "session_unpaid") return true;
      if (t.reason === "session_booking" && meta?.isDebt === true) return true;
      if (t.reason === "session_booking" && !t.packageId) return true;
      return false;
    });
    
    if (unsettledDebts.length === 0) {
      console.log(`[CancelDebt] No debt found to cancel`);
      return { cancelled: false, amount: 0 };
    }
    
    let totalCancelled = 0;
    
    for (const debt of unsettledDebts) {
      // Mark debt as cancelled (don't delete - keep for audit trail)
      await db.update(creditTransactions)
        .set({
          metadata: {
            ...(debt.metadata as Record<string, unknown> || {}),
            cancelled: true,
            cancelledAt: new Date().toISOString(),
            cancelReason: reason,
          }
        })
        .where(eq(creditTransactions.id, debt.id));
      
      totalCancelled += Math.abs(Number(debt.amount));
      console.log(`[CancelDebt] Cancelled debt transaction ${debt.id}, amount: ${debt.amount}`);
    }
    
    console.log(`[CancelDebt] Total cancelled: ${totalCancelled} credits for player ${playerId}`);
    return { cancelled: true, amount: totalCancelled };
  },

  // PATCH C: Settle player debts when a new package is purchased
  // Debt transactions (session_join_debt) ALWAYS stay packageId = NULL
  // We only mark them as settled via metadata and create ONE settlement transaction
  async settlePlayerDebts(playerId: string, creditType: string, packageId: string): Promise<{
    settledCount: number;
    totalDeducted: number;
  }> {
    // Task #676 Phase 2 — V1 write gate. Settlement walks legacy debt rows
    // that V2 doesn't produce. Skip entirely for V2 academies.
    {
      const { v1WritesAllowed } = await import("./services/credit-feature-flag");
      const pkgRow = await db.execute(sql`
        SELECT academy_id FROM packages WHERE id = ${packageId} LIMIT 1
      `);
      const pkgAcademyId = (pkgRow.rows[0] as any)?.academy_id ?? null;
      if (!(await v1WritesAllowed(pkgAcademyId))) {
        console.log(`[SettleDebts] V2 academy ${pkgAcademyId} — skipping legacy debt settlement`);
        return { settledCount: 0, totalDeducted: 0 };
      }
    }
    console.log(`[SettleDebts] Starting for player ${playerId}, creditType ${creditType}, package ${packageId}`);

    const matchingCreditTypes = creditType === "semi_private" || creditType === "semi"
      ? ["semi_private", "semi", "semi_private_adjusted"]
      : creditType === "private"
      ? ["private", "private_adjusted"]
      : [creditType];

    return await db.transaction(async (tx) => {
      // Lock the package for the duration of settlement to prevent race conditions
      const pkgResult = await tx.execute(sql`
        SELECT id, remaining_credits, total_credits FROM packages WHERE id = ${packageId} FOR UPDATE
      `);
      if (pkgResult.rows.length === 0) {
        console.error(`[SettleDebts] Package ${packageId} not found`);
        return { settledCount: 0, totalDeducted: 0 };
      }

      const pkg = pkgResult.rows[0] as any;
      let currentRemaining = Number(pkg.remaining_credits);
      const originalRemaining = currentRemaining;

      const unsettledDebts = await tx.select({
          id: creditTransactions.id,
          playerId: creditTransactions.playerId,
          sessionId: creditTransactions.sessionId,
          amount: creditTransactions.amount,
          metadata: creditTransactions.metadata,
          createdAt: creditTransactions.createdAt,
        }).from(creditTransactions)
        .innerJoin(sessions, eq(creditTransactions.sessionId, sessions.id))
        .where(and(
          eq(creditTransactions.playerId, playerId),
          eq(creditTransactions.type, "debit"),
          or(
            eq(creditTransactions.reason, "session_debt"),
            eq(creditTransactions.reason, "session_join_debt"),
            eq(creditTransactions.reason, "session_unpaid")
          ),
          isNotNull(creditTransactions.sessionId),
          inArray(creditTransactions.creditType, matchingCreditTypes),
          ne(sessions.status, "cancelled"),
          sql`COALESCE(${creditTransactions.metadata}->>'cancelled', 'false') != 'true'`,
          sql`COALESCE(${creditTransactions.metadata}->>'settled', 'false') != 'true'`
        ))
        .orderBy(creditTransactions.createdAt);

      if (unsettledDebts.length === 0) {
        console.log(`[SettleDebts] No unsettled debts for player ${playerId}, creditType ${creditType}`);
        return { settledCount: 0, totalDeducted: 0 };
      }

      console.log(`[SettleDebts] Found ${unsettledDebts.length} unsettled debt(s), package has ${currentRemaining} credits available`);

      let settledCount = 0;
      let totalDeducted = 0;

      for (const debt of unsettledDebts) {
        const debtAmount = Math.abs(Number(debt.amount));

        // Hard guard: never settle more than this package can cover
        if (currentRemaining < debtAmount || currentRemaining <= 0) break;

        const meta = debt.metadata ? (typeof debt.metadata === 'string' ? JSON.parse(debt.metadata) : debt.metadata) : {};

        await tx.update(creditTransactions)
          .set({
            metadata: {
              ...meta,
              settled: true,
              settledByPackage: packageId,
              lastSettledAt: new Date().toISOString(),
              originalAmount: debtAmount,
            }
          })
          .where(eq(creditTransactions.id, debt.id));

        currentRemaining -= debtAmount;
        totalDeducted += debtAmount;
        settledCount++;
      }

      // Safety assertion: totalDeducted must never exceed what the package started with
      if (totalDeducted > originalRemaining) {
        console.error(`[SettleDebts] SAFETY VIOLATION: attempted to deduct ${totalDeducted} from package with only ${originalRemaining} remaining — rolling back extra settlements`);
        throw new Error(`Settlement safety violation for package ${packageId}: deducted ${totalDeducted} but only ${originalRemaining} available`);
      }

      if (settledCount > 0) {
        await tx.execute(sql`
          UPDATE packages
          SET remaining_credits = ${currentRemaining},
              status = CASE WHEN ${currentRemaining} <= 0 THEN 'depleted' ELSE status END
          WHERE id = ${packageId}
        `);
        console.log(`[SettleDebts] Settled ${settledCount}/${unsettledDebts.length} debt(s) for player ${playerId}, deducted ${totalDeducted} credits, ${originalRemaining} -> ${currentRemaining}`);
      }

      return { settledCount, totalDeducted };
    });
  },

  // Settle unpaid sessions (creditDeductedAt = null) when a new package is created
  async settleUnpaidSessions(playerId: string, creditType: string, packageId: string, academyId?: string): Promise<{
    settledCount: number;
    totalDeducted: number;
    sessionIds: string[];
  }> {
    // Task #676 Phase 2 — V1 write gate. Same reasoning as settlePlayerDebts.
    {
      const { v1WritesAllowed } = await import("./services/credit-feature-flag");
      let gateAcademyId = academyId ?? null;
      if (!gateAcademyId) {
        const pkgRow = await db.execute(sql`
          SELECT academy_id FROM packages WHERE id = ${packageId} LIMIT 1
        `);
        gateAcademyId = (pkgRow.rows[0] as any)?.academy_id ?? null;
      }
      if (!(await v1WritesAllowed(gateAcademyId))) {
        console.log(`[SettleUnpaidSessions] V2 academy ${gateAcademyId} — skipping legacy retrospective settlement`);
        return { settledCount: 0, totalDeducted: 0, sessionIds: [] };
      }
    }
    // Map credit type to session types (include all variations)
    // Both 'semi' and 'semi_private' keys point to the same session types
    const creditToSessionTypes: Record<string, string[]> = {
      private: ["private", "private_adjusted"],
      semi: ["semi", "semi_private", "semi_private_adjusted"],
      semi_private: ["semi", "semi_private", "semi_private_adjusted"],
      group: ["group", "group_adjusted"],
    };
    
    const matchingSessionTypes = creditToSessionTypes[creditType] || [creditType];
    
    // Determine which attendance statuses warrant a credit deduction for this credit type
    const isGroupType = creditType === "group";
    const chargeableAttendanceStatuses = isGroupType
      ? ["present", "late", "absent"] // Group: slot was taken regardless
      : ["present", "late"];          // Private/semi: only if the player actually showed up

    const unpaidSessions = await db.select({
      sessionPlayerId: sessionPlayers.id,
      sessionId: sessionPlayers.sessionId,
      playerId: sessionPlayers.playerId,
      sessionType: sessions.sessionType,
      startTime: sessions.startTime,
      duration: sessions.duration,
    })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
    .where(and(
      eq(sessionPlayers.playerId, playerId),
      isNull(sessionPlayers.creditDeductedAt),
      inArray(sessions.sessionType, matchingSessionTypes),
      ne(sessions.status, "cancelled"),
      inArray(sessionPlayers.attendanceStatus, chargeableAttendanceStatuses),
      academyId ? eq(sessions.academyId, academyId) : undefined
    ))
    .orderBy(sessions.startTime);
    
    if (unpaidSessions.length === 0) {
      return { settledCount: 0, totalDeducted: 0, sessionIds: [] };
    }
    
    const pkg = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
    if (pkg.length === 0) {
      console.error(`[SettleUnpaidSessions] Package ${packageId} not found`);
      return { settledCount: 0, totalDeducted: 0, sessionIds: [] };
    }
    
    let currentRemaining = Number(pkg[0].remainingCredits);
    let totalDeducted = 0;
    const settledSessionIds: string[] = [];
    
    for (const session of unpaidSessions) {
      // Guard against double-deduction: skip if a settled debt transaction already
      // covers this session player record (e.g. from a prior settlePlayerDebts run).
      const existingSettled = await db.select({ id: creditTransactions.id })
        .from(creditTransactions)
        .where(and(
          eq(creditTransactions.playerId, playerId),
          eq(creditTransactions.sessionId, session.sessionId),
          eq(creditTransactions.type, "debit"),
          sql`COALESCE(${creditTransactions.metadata}->>'settled', 'false') = 'true'`
        ))
        .limit(1);
      if (existingSettled.length > 0) {
        console.log(`[SettleUnpaidSessions] Skipping session ${session.sessionId} — already covered by a settled debt transaction`);
        continue;
      }

      const creditCost = (Number(session.duration) || 60) / 60;
      if (currentRemaining < creditCost) break;
      
      const balanceBefore = currentRemaining;
      currentRemaining -= creditCost;
      totalDeducted += creditCost;
      
      const transaction = await db.insert(creditTransactions).values({
        playerId,
        academyId: academyId || pkg[0].academyId,
        packageId,
        type: "debit",
        creditType,
        amount: -creditCost,
        reason: "retrospective_settlement",
        sessionId: session.sessionId,
        balanceBefore,
        balanceAfter: currentRemaining,
        metadata: JSON.stringify({
          sessionType: session.sessionType,
          settledAt: new Date().toISOString(),
          settledByPackage: packageId,
          originalSessionDate: session.startTime?.toISOString(),
          sessionDuration: (session.duration as number) || 60,
          creditCost,
        }),
      }).returning();
      
      await db.update(sessionPlayers)
        .set({ 
          creditDeductedAt: new Date(),
          creditTransactionId: transaction[0]?.id,
        })
        .where(eq(sessionPlayers.id, session.sessionPlayerId));
      
      settledSessionIds.push(session.sessionId);
    }
    
    if (settledSessionIds.length > 0) {
      await db.update(packages)
        .set({ 
          remainingCredits: currentRemaining,
          status: currentRemaining <= 0 ? "depleted" : "active",
        })
        .where(eq(packages.id, packageId));
    }
    
    console.log(`[SettleUnpaidSessions] Settled ${settledSessionIds.length} of ${unpaidSessions.length} unpaid sessions for player ${playerId}: deducted ${totalDeducted} credits from package ${packageId} (${pkg[0].remainingCredits} -> ${currentRemaining})`);
    
    return { settledCount: settledSessionIds.length, totalDeducted, sessionIds: settledSessionIds };
  },

  // Get player pillar progress summary for Glow Leveling OS display
  async getPlayerPillarProgressSummary(playerId: string): Promise<{
    pillars: Array<{
      name: string;
      score: number; // 0-2 EMA scale
      trend: string; // improving, stable, declining
      skillsTotal: number;
      skillsMeetsOrAbove: number;
      masteryPct: number; // curriculum mastery % (achievedSkills / totalSkills * 100)
      lastUpdated: string | null;
      lastChangeSource: "coach_assessment" | "match" | "coach_verified_match" | null;
    }>;
    overallReadiness: number; // 0-100%
    trialGateReady: boolean;
    recentFeedbackCount: number;
    glowScore: number; // 0-100 curriculum-based score
  }> {
    const PILLAR_NAMES = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];

    // Maps players.ball_level → level_skills.level_id (same mapping as skill-scores endpoint)
    const BALL_LEVEL_ENTRY_MAP: Record<string, string> = {
      blue: "BLUE_3",
      red: "RED_3",
      orange: "ORANGE_3",
      green: "GREEN_3",
      yellow: "YELLOW_1",
      glow: "GLOW_9",
    };
    
    // Get pillar EMA scores (for trend/lastUpdated fallback display)
    const progress = await db.select().from(playerPillarProgress)
      .where(eq(playerPillarProgress.playerId, playerId));

    // Get player's ball level to find curriculum skills
    const [playerRow] = await db
      .select({ ballLevel: players.ballLevel })
      .from(players)
      .where(eq(players.id, playerId));
    const ballLevelRaw = (playerRow?.ballLevel || "red").toLowerCase();
    const levelId = BALL_LEVEL_ENTRY_MAP[ballLevelRaw] || "RED_3";

    // Fetch all curriculum skills for this level with their pillar
    const curriculumSkills = await db
      .select({
        skillId: levelSkills.skillId,
        pillar: glowSkills.pillar,
        targetScore: levelSkills.targetScore,
      })
      .from(levelSkills)
      .innerJoin(glowSkills, eq(glowSkills.id, levelSkills.skillId))
      .where(eq(levelSkills.levelId, levelId));

    // Fetch player's latest moving average per skill (deduplicated)
    const skillIds = curriculumSkills.map(s => s.skillId);
    const rawScores = skillIds.length > 0
      ? await db
          .select({
            skillId: playerSkillScores.skillId,
            movingAverage: playerSkillScores.movingAverage,
          })
          .from(playerSkillScores)
          .where(and(
            eq(playerSkillScores.playerId, playerId),
            inArray(playerSkillScores.skillId, skillIds),
          ))
          .orderBy(playerSkillScores.skillId, desc(playerSkillScores.createdAt))
      : [];

    // Keep only the latest score per skill
    const latestBySkillId = new Map<string, number>();
    for (const row of rawScores) {
      if (!latestBySkillId.has(row.skillId)) {
        latestBySkillId.set(row.skillId, Number(row.movingAverage || 0));
      }
    }

    // Build per-pillar sums: (sum of movingAverages, count of skills, count achieved ≥ 1.5)
    const pillarCurriculum = new Map<string, { skillCount: number; sumScores: number; maxScore: number; achievedCount: number }>();
    for (const skill of curriculumSkills) {
      const pillar = skill.pillar || "TECHNIQUE";
      const existing = pillarCurriculum.get(pillar) || { skillCount: 0, sumScores: 0, maxScore: 0, achievedCount: 0 };
      const movingAvg = latestBySkillId.get(skill.skillId) || 0;
      existing.skillCount++;
      existing.sumScores += movingAvg;
      existing.maxScore += Number(skill.targetScore || 2);
      if (movingAvg >= 1.5) existing.achievedCount++;
      pillarCurriculum.set(pillar, existing);
    }

    // Get recent feedback count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentFeedback = await db.select({ count: sql<number>`count(*)` }).from(inSessionFeedback)
      .where(and(
        eq(inSessionFeedback.playerId, playerId),
        gte(inSessionFeedback.createdAt, thirtyDaysAgo)
      ));
    
    const pillars = PILLAR_NAMES.map(pillarName => {
      const pillarData = progress.find(p => p.pillar === pillarName);
      const curriculum = pillarCurriculum.get(pillarName);
      const skillsTotal = curriculum?.skillCount ?? 0;
      const skillsMeetsOrAbove = curriculum?.achievedCount ?? 0;

      // Curriculum mastery: proportional average of skill moving averages (0-100)
      const curriculumPct = skillsTotal > 0 && (curriculum?.maxScore ?? 0) > 0
        ? Math.min(100, Math.round(((curriculum?.sumScores ?? 0) / (curriculum?.maxScore ?? 1)) * 100))
        : 0;

      // Coach EMA: currentScore is on 0-2 scale → convert to 0-100
      const coachEmaScore = pillarData ? Number(pillarData.currentScore) : 0;
      const coachEmaPct = Math.min(100, Math.round((coachEmaScore / 2) * 100));

      // Blended mastery: 70% curriculum + 30% coach EMA
      // Fall back to 100% curriculum only when there is no coach EMA row at all (0 sessions)
      const hasCoachEma = pillarData !== undefined;
      const masteryPct = hasCoachEma
        ? Math.round(0.7 * curriculumPct + 0.3 * coachEmaPct)
        : curriculumPct;
      
      return {
        name: pillarName,
        score: coachEmaScore,
        trend: pillarData?.trend || "stable",
        skillsTotal,
        skillsMeetsOrAbove,
        masteryPct,
        lastUpdated: pillarData?.lastUpdatedAt?.toISOString() || null,
        lastChangeSource: pillarData?.lastChangeSource || null,
      };
    });
    
    // Overall readiness: average of blended pillar masteryPct values
    const hasCurriculumData = curriculumSkills.length > 0;
    const overallReadiness = hasCurriculumData
      ? Math.min(100, Math.round(pillars.reduce((s, p) => s + p.masteryPct, 0) / pillars.length))
      : Math.min(100, Math.round((pillars.reduce((s, p) => s + p.score, 0) / pillars.length / 2) * 100));
    
    // Trial gate: all pillars with curriculum data at ≥ 75% blended mastery, or EMA ≥ 1.5 fallback
    const trialGateReady = hasCurriculumData
      ? pillars.every(p => p.skillsTotal === 0 || p.masteryPct >= 75)
      : pillars.every(p => p.score >= 1.5);

    // GlowScore: average of blended pillar masteryPct values (0-100 scale)
    const glowScore = Math.round(pillars.reduce((s, p) => s + p.masteryPct, 0) / pillars.length);
    
    return {
      pillars,
      overallReadiness,
      trialGateReady,
      recentFeedbackCount: Number(recentFeedback[0]?.count || 0),
      glowScore,
    };
  },

  // Get credit balances for multiple players (batch query for efficiency)
  // Reads directly from packages.remaining_credits — the single source of truth.
  //
  // Also returns uncoveredGroup/uncoveredSemiPrivate/uncoveredPrivate: counts
  // of sessions the player attended whose linked credit_transaction has no
  // valid package (mirrors getUncoveredSessionsByType used by the detail
  // screen). Callers should net these against the type balance to get the
  // same number the player-detail Packages card displays.
  async getPlayersCreditBalances(playerIds: string[]): Promise<Record<string, {
    group: number;
    semi_private: number;
    private: number;
    totalDebt: number;
    groupDebt: number;
    semiPrivateDebt: number;
    privateDebt: number;
    hasDebt: boolean;
    uncoveredGroup: number;
    uncoveredSemiPrivate: number;
    uncoveredPrivate: number;
    // Net = packages.remaining - session_debt - uncovered sessions, per type.
    // This is the SAME number the player-detail Packages card displays for
    // each type (can be negative). All callers that show a balance to the
    // user should prefer these fields over the gross `group/semi_private/
    // private` fields.
    netGroup: number;
    netSemiPrivate: number;
    netPrivate: number;
  }>> {
    if (playerIds.length === 0) return {};

    const normalizeType = (type: string | null | undefined): "group" | "semi_private" | "private" => {
      if (!type) return "group";
      const t = type.toLowerCase().replace("-", "_").replace(" ", "_");
      if (t === "semi" || t === "semi_private" || t === "semi_private_adjusted") return "semi_private";
      if (t === "private" || t === "private_adjusted") return "private";
      return "group";
    };

    const result: Record<string, { group: number; semi_private: number; private: number; totalDebt: number; groupDebt: number; semiPrivateDebt: number; privateDebt: number; hasDebt: boolean; uncoveredGroup: number; uncoveredSemiPrivate: number; uncoveredPrivate: number; netGroup: number; netSemiPrivate: number; netPrivate: number }> = {};
    for (const id of playerIds) {
      result[id] = { group: 0, semi_private: 0, private: 0, totalDebt: 0, groupDebt: 0, semiPrivateDebt: 0, privateDebt: 0, hasDebt: false, uncoveredGroup: 0, uncoveredSemiPrivate: 0, uncoveredPrivate: 0, netGroup: 0, netSemiPrivate: 0, netPrivate: 0 };
    }

    // Sum remaining_credits from active packages directly
    const activePackages = await db.select({
      playerId: packages.playerId,
      creditType: packages.creditType,
      remainingCredits: packages.remainingCredits,
    }).from(packages)
      .where(and(
        inArray(packages.playerId, playerIds),
        eq(packages.status, "active"),
      ));

    for (const pkg of activePackages) {
      if (!result[pkg.playerId]) continue;
      const type = normalizeType(pkg.creditType);
      result[pkg.playerId][type] += Number(pkg.remainingCredits);
    }

    // Debt = unsettled session_debt transactions. Mirrors the per-player
    // getPlayerCreditBalanceByType query EXACTLY so the batch helper produces
    // the same number the player-detail screen does. Legacy session_booking
    // rows (no package_id) are intentionally excluded here — they are caught
    // instead by the uncovered-sessions query below, preventing double counting.
    const debtRows = await db.execute(sql`
      SELECT player_id, credit_type, ABS(SUM(amount::numeric)) as total
      FROM credit_transactions
      WHERE player_id = ANY(ARRAY[${sql.join(playerIds.map(id => sql`${id}`), sql`, `)}]::text[])
        AND amount < 0
        AND type = 'debit'
        AND reason = 'session_debt'
        AND COALESCE(metadata->>'cancelled', 'false') != 'true'
        AND COALESCE(metadata->>'settled', 'false') != 'true'
      GROUP BY player_id, credit_type
    `);

    for (const row of debtRows.rows) {
      const r = row as any;
      if (!result[r.player_id]) continue;
      const debtAmount = Number(r.total);
      result[r.player_id].totalDebt += debtAmount;
      const debtType = normalizeType(r.credit_type);
      if (debtType === "group") result[r.player_id].groupDebt += debtAmount;
      else if (debtType === "semi_private") result[r.player_id].semiPrivateDebt += debtAmount;
      else if (debtType === "private") result[r.player_id].privateDebt += debtAmount;
    }

    // Uncovered sessions = attended sessions whose linked credit transaction
    // is missing/cancelled/has no surviving package. Mirrors the per-player
    // getUncoveredSessionsByType query exactly so list and detail agree.
    const uncoveredRows = await db.execute(sql`
      SELECT sp.player_id, s.session_type, count(*)::int as cnt
      FROM session_players sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE sp.player_id = ANY(ARRAY[${sql.join(playerIds.map(id => sql`${id}`), sql`, `)}]::text[])
        AND sp.attendance_status = 'present'
        AND NOT EXISTS (
          SELECT 1 FROM credit_transactions ct
          WHERE ct.id = sp.credit_transaction_id
            AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
            AND ct.package_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM packages pkg
              WHERE pkg.id = ct.package_id
            )
        )
      GROUP BY sp.player_id, s.session_type
    `);

    for (const row of uncoveredRows.rows) {
      const r = row as any;
      if (!result[r.player_id]) continue;
      const cnt = Number(r.cnt);
      const t = normalizeType(r.session_type as string);
      if (t === "group") result[r.player_id].uncoveredGroup += cnt;
      else if (t === "semi_private") result[r.player_id].uncoveredSemiPrivate += cnt;
      else if (t === "private") result[r.player_id].uncoveredPrivate += cnt;
    }

    for (const playerId of playerIds) {
      const r = result[playerId];
      // Final net per type — single source of truth, matches detail screen.
      r.netGroup = r.group - r.groupDebt - r.uncoveredGroup;
      r.netSemiPrivate = r.semi_private - r.semiPrivateDebt - r.uncoveredSemiPrivate;
      r.netPrivate = r.private - r.privateDebt - r.uncoveredPrivate;
      // totalDebt / hasDebt now reflect the *real* deficit (sum of negative
      // nets across types). Previously they only counted unsettled
      // session_debt rows and missed uncovered-session debt entirely, so
      // warning badges (AdminSeriesDetailDrawer, SeriesOverviewTab,
      // AdminPlayersScreen) under-reported. With this change a player whose
      // only liability is uncovered sessions (e.g. Aisha, -21 semi) is
      // correctly flagged.
      const deficit =
        Math.max(0, -r.netGroup) +
        Math.max(0, -r.netSemiPrivate) +
        Math.max(0, -r.netPrivate);
      r.totalDebt = deficit;
      r.hasDebt = deficit > 0;
    }

    return result;
  },

  // Consume a single credit for a specific player+session (used for backfilling attendance)
  // Returns true if credit was consumed, false if no credits available or already consumed
  // linkedPackageId: If provided, prefer this package first (from series membership)
  // sessionType: The type of session (group, private, semi_private) - credits must match
  async consumeSingleCreditForSession(playerId: string, sessionId: string, academyId?: string, linkedPackageId?: string | null, sessionType?: string): Promise<boolean> {
    try {
      // Task #676 Phase 2 — V1 write gate. V2 academies route consume through
      // credit-engine; this legacy path must be a no-op for them so we don't
      // double-charge. The V2 charge happens via ensureCreditProcessed /
      // consumeCreditsForClassSessionWithAttendance short-circuits.
      {
        const { v1WritesAllowed } = await import("./services/credit-feature-flag");
        if (!(await v1WritesAllowed(academyId))) {
          return false;
        }
      }
      // Map session types to credit types (normalize naming)
      const normalizeType = (type: string | undefined): string => {
        if (!type) return "group"; // default
        const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
        if (normalized === "semi" || normalized === "semi_private") return "semi_private";
        if (normalized === "private") return "private";
        return "group"; // default for group, physical, activity, etc.
      };
      
      const requiredCreditType = normalizeType(sessionType);
      
      const sessionData = await db.select({ duration: sessions.duration }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      const creditCost = (Number(sessionData[0]?.duration) || 60) / 60;
      
      return await db.transaction(async (tx) => {
        // PATCH D: Idempotency guard - check if credit was already deducted for this session/player
        const existingSessionPlayer = await tx.select({
          creditDeductedAt: sessionPlayers.creditDeductedAt,
          creditTransactionId: sessionPlayers.creditTransactionId,
        }).from(sessionPlayers)
          .where(and(
            eq(sessionPlayers.sessionId, sessionId),
            eq(sessionPlayers.playerId, playerId)
          ));
        
        if (existingSessionPlayer.length > 0 && existingSessionPlayer[0].creditDeductedAt !== null) {
          console.log(`[Credits] Idempotency guard: Credit already deducted for session ${sessionId}, player ${playerId}. Transaction ID: ${existingSessionPlayer[0].creditTransactionId}`);
          return false; // No-op, already consumed
        }
        
        let packageToUse = null;
        
        // Priority 1: Check linkedPackageId first if provided AND has matching credit type
        if (linkedPackageId) {
          const linkedResult = await tx.execute(sql`
            SELECT * FROM packages 
            WHERE id = ${linkedPackageId} 
              AND status = 'active' 
              AND remaining_credits >= ${creditCost}
              AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
            FOR UPDATE
          `);
          if (linkedResult.rows[0]) {
            packageToUse = linkedResult.rows[0] as any;
          }
        }
        
        // Priority 2: Find any active package for this player with matching credit type
        if (!packageToUse) {
          const playerPackagesResult = await tx.execute(sql`
            SELECT * FROM packages 
            WHERE player_id = ${playerId} 
              AND status = 'active' 
              AND remaining_credits >= ${creditCost}
              AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
            ORDER BY expiry_date ASC NULLS LAST
            FOR UPDATE
            LIMIT 1
          `);
          if (playerPackagesResult.rows[0]) {
            packageToUse = playerPackagesResult.rows[0] as any;
          }
        }
        
        if (!packageToUse) {
          console.log(`[Credits] No ${requiredCreditType} credits available for player ${playerId}`);
          return false;
        }
        
        const balanceBefore = Number(packageToUse.remaining_credits);
        const balanceAfter = balanceBefore - creditCost;
        const creditType = packageToUse.credit_type || requiredCreditType;
        
        // Try to insert ledger entry (prevents duplicate deductions)
        try {
          const insertResult = await tx.execute(sql`
            INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
            VALUES (${playerId}, ${academyId || null}, ${sessionId}, ${packageToUse.id}, 'debit', ${creditType}, ${-creditCost}, 'session_join', ${balanceBefore}, ${balanceAfter}, 
                   ${JSON.stringify({ packageId: packageToUse.id, description: "Credit consumed for attended session" })}::jsonb)
            ON CONFLICT DO NOTHING
            RETURNING id
          `);
          
          // If no row returned, already consumed
          if (insertResult.rowCount === 0) {
            console.log(`[Credits] Credit already consumed for session ${sessionId}, player ${playerId}`);
            return false;
          }
        } catch (insertError: any) {
          if (insertError.code === '23505') {
            return false;
          }
          throw insertError;
        }
        
        // Decrement package credits
        await tx.update(packages)
          .set({ 
            remainingCredits: balanceAfter,
            status: balanceAfter <= 0 ? "depleted" : "active",
          })
          .where(eq(packages.id, packageToUse.id));
        
        // Atomically stamp credit_deducted_at and credit_transaction_id on the session_player row.
        // This keeps the idempotency guard and repairAllPlayerCredits consistent.
        const txIdResult = await tx.execute(sql`
          SELECT id FROM credit_transactions
          WHERE player_id = ${playerId}
            AND session_id = ${sessionId}
            AND package_id = ${packageToUse.id}
            AND amount < 0
            AND (metadata->>'cancelled')::text IS DISTINCT FROM 'true'
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const consumedTxId = (txIdResult.rows[0] as any)?.id || null;
        if (consumedTxId) {
          await tx.execute(sql`
            UPDATE session_players
            SET credit_deducted_at = COALESCE(credit_deducted_at, NOW()),
                credit_transaction_id = COALESCE(credit_transaction_id, ${consumedTxId})
            WHERE player_id = ${playerId}
              AND session_id = ${sessionId}
          `);
        }
        
        console.log(`[Credits] Consumed 1 ${creditType} credit for player ${playerId}, session ${sessionId}. Balance: ${balanceBefore} -> ${balanceAfter}`);
        return true;
      });
    } catch (error) {
      console.error(`[Credits] Error consuming credit for player ${playerId}:`, error);
      return false;
    }
  },

  // Create a debt transaction when no credits are available
  // PATCH D: Added idempotency guard for creditDeductedAt
  async createDebtTransaction(playerId: string, sessionId: string, academyId: string, sessionType?: string): Promise<boolean> {
    try {
      // Task #676 Phase 2 — V1 write gate. Debts are a V1 concept; V2
      // academies should never produce new session_join_debt rows.
      {
        const { v1WritesAllowed } = await import("./services/credit-feature-flag");
        if (!(await v1WritesAllowed(academyId))) {
          return false;
        }
      }
      // Idempotency guard: check if credit was already consumed for this session
      const existingSessionPlayer = await db.select({
        creditDeductedAt: sessionPlayers.creditDeductedAt,
      }).from(sessionPlayers)
        .where(and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        ));
      
      if (existingSessionPlayer.length > 0 && existingSessionPlayer[0].creditDeductedAt !== null) {
        console.log(`[Credits] Idempotency guard: Cannot create debt - credit already deducted for session ${sessionId}, player ${playerId}`);
        return false;
      }
      
      const normalizeType = (type: string | undefined): string => {
        if (!type) return "group";
        const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
        if (normalized === "semi" || normalized === "semi_private") return "semi_private";
        if (normalized === "private") return "private";
        return "group";
      };
      
      const creditType = normalizeType(sessionType);
      
      const result = await db.execute(sql`
        INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
        VALUES (${playerId}, ${academyId}, ${sessionId}, NULL, 'debit', ${creditType}, -1, 'session_join_debt', 0, -1, 
               ${JSON.stringify({ description: `Debt: ${creditType} credit owed (no package)`, isDebt: true, actualCreditType: creditType })}::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      
      if (result.rowCount === 0) {
        console.log(`[Credits] Debt transaction already exists for session ${sessionId}, player ${playerId}`);
        return false;
      }
      
      console.log(`[Credits] Created debt transaction for player ${playerId}, session ${sessionId}, type ${creditType}`);
      return true;
    } catch (error: any) {
      if (error.code === '23505') {
        return false;
      }
      console.error(`[Credits] Error creating debt transaction for player ${playerId}:`, error);
      return false;
    }
  },

  // Backfill debt transactions for past attended sessions without credits
  // This handles the case where players attended sessions before the debt system was implemented
  async backfillDebtTransactions(academyId: string): Promise<{
    processed: number;
    debtsCreated: number;
    skipped: number;
    errors: string[];
  }> {
    const results = { processed: 0, debtsCreated: 0, skipped: 0, errors: [] as string[] };
    
    try {
      // Find all completed sessions for this academy with attendance records
      const completedSessionsResult = await db.execute(sql`
        SELECT DISTINCT 
          s.id as session_id,
          s.series_id,
          s.start_time,
          cs.session_type,
          cs.academy_id
        FROM sessions s
        JOIN coaching_series cs ON s.series_id = cs.id
        WHERE s.status = 'completed'
          AND cs.academy_id = ${academyId}
          AND s.series_id IS NOT NULL
        ORDER BY s.start_time DESC
      `);
      
      const normalizeType = (type: string | undefined): string => {
        if (!type) return "group";
        const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
        if (normalized === "semi" || normalized === "semi_private") return "semi_private";
        if (normalized === "private") return "private";
        return "group";
      };
      
      for (const row of completedSessionsResult.rows) {
        const sessionId = row.session_id as string;
        const seriesId = row.series_id as string;
        const baseSessionType = normalizeType(row.session_type as string);
        
        // Get attendance records for this session - only "present" players
        const attendanceResult = await db.execute(sql`
          SELECT player_id FROM session_players 
          WHERE session_id = ${sessionId} AND attendance_status = 'present'
        `);
        
        let presentPlayerIds = attendanceResult.rows.map(r => r.player_id as string);
        
        // If no attendance records exist, get all active players from the series
        // This handles legacy sessions where attendance was never recorded
        if (presentPlayerIds.length === 0) {
          const seriesPlayersResult = await db.execute(sql`
            SELECT player_id FROM series_players 
            WHERE series_id = ${seriesId} AND status = 'active'
          `);
          presentPlayerIds = seriesPlayersResult.rows.map(r => r.player_id as string);
          
          if (presentPlayerIds.length > 0) {
            console.log(`[Backfill] Session ${sessionId}: No attendance records, using ${presentPlayerIds.length} active series players`);
          }
        }
        
        const presentCount = presentPlayerIds.length;
        
        if (presentCount === 0) continue;
        
        // Dynamic credit type: semi-private with 1 player becomes private
        let requiredCreditType = baseSessionType;
        if (baseSessionType === "semi_private" && presentCount === 1) {
          requiredCreditType = "private";
          console.log(`[Backfill] Session ${sessionId}: Semi-private with 1 player, treating as private`);
        }
        
        results.processed++;
        
        for (const playerId of presentPlayerIds) {
          try {
            // Check if there's already a credit transaction for this player+session
            const existingTxResult = await db.execute(sql`
              SELECT id FROM credit_transactions 
              WHERE player_id = ${playerId} AND session_id = ${sessionId}
              LIMIT 1
            `);
            
            if (existingTxResult.rows.length > 0) {
              // Already has a transaction (credit consumed or debt created)
              results.skipped++;
              continue;
            }
            
            // Check if player had credits at the time (we'll assume they didn't if no transaction exists)
            // Since we can't know historical credit state, we check current packages
            // If no matching package with credits, create debt
            const packageResult = await db.execute(sql`
              SELECT id FROM packages 
              WHERE player_id = ${playerId} 
                AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
                AND remaining_credits > 0
                AND status = 'active'
              LIMIT 1
            `);
            
            if (packageResult.rows.length > 0) {
              // Player has credits now - consume one
              const consumed = await this.consumeSingleCreditForSession(
                playerId, 
                sessionId, 
                academyId, 
                null, 
                requiredCreditType
              );
              if (consumed) {
                results.debtsCreated++; // Actually consumed credit, but counting as processed
              } else {
                results.skipped++;
              }
            } else {
              // No credits - create debt transaction
              try {
                // Task #676 Phase 2 — V1 write gate. V2 academies record the
                // owed balance in credit_ledger_v2; do not mint a legacy row.
                const { v1WritesAllowed } = await import("./services/credit-feature-flag");
                if (!(await v1WritesAllowed(academyId))) {
                  results.skipped++;
                  continue;
                }
                const debtResult = await db.execute(sql`
                  INSERT INTO credit_transactions (
                    player_id, academy_id, session_id, package_id, type, credit_type, 
                    amount, reason, balance_before, balance_after, metadata
                  )
                  VALUES (
                    ${playerId}, ${academyId}, ${sessionId}, NULL, 'debit', ${requiredCreditType}, 
                    -1, 'session_join_debt', 0, -1, 
                    ${JSON.stringify({ 
                      seriesId, 
                      description: `Backfilled debt: ${requiredCreditType} credit owed`, 
                      isDebt: true, 
                      backfilled: true,
                      actualCreditType: requiredCreditType 
                    })}::jsonb
                  )
                  ON CONFLICT DO NOTHING
                  RETURNING id
                `);
                
                if (debtResult.rowCount && debtResult.rowCount > 0) {
                  results.debtsCreated++;
                  console.log(`[Backfill] Created debt for player ${playerId}, session ${sessionId}, type ${requiredCreditType}`);
                } else {
                  results.skipped++;
                }
              } catch (insertError: any) {
                if (insertError.code === '23505') {
                  results.skipped++;
                } else {
                  console.error(`[Backfill] Error creating debt for player ${playerId}:`, insertError);
                  results.errors.push(`Failed to create debt for player ${playerId}`);
                }
              }
            }
          } catch (playerError: any) {
            console.error(`[Backfill] Error processing player ${playerId}:`, playerError);
            results.errors.push(`Error for player ${playerId}: ${playerError.message}`);
          }
        }
      }
      
      console.log(`[Backfill] Complete: ${results.processed} sessions, ${results.debtsCreated} debts created, ${results.skipped} skipped`);
      return results;
    } catch (error: any) {
      console.error("[Backfill] Error:", error);
      results.errors.push(`Backfill failed: ${error.message}`);
      return results;
    }
  },

  // Player Subscriptions (contracts - what players SHOULD pay)
  async createPlayerSubscription(data: InsertPlayerSubscription): Promise<PlayerSubscription> {
    const result = await db.insert(playerSubscriptions).values(data).returning();
    return result[0];
  },

  async getPlayerSubscriptions(academyId: string): Promise<PlayerSubscription[]> {
    return db.select().from(playerSubscriptions)
      .where(eq(playerSubscriptions.academyId, academyId))
      .orderBy(desc(playerSubscriptions.createdAt));
  },

  async getPlayerSubscriptionById(id: string): Promise<PlayerSubscription | undefined> {
    const result = await db.select().from(playerSubscriptions)
      .where(eq(playerSubscriptions.id, id));
    return result[0];
  },

  async getPlayerSubscriptionsByPlayer(playerId: string): Promise<PlayerSubscription[]> {
    return db.select().from(playerSubscriptions)
      .where(eq(playerSubscriptions.playerId, playerId))
      .orderBy(desc(playerSubscriptions.createdAt));
  },

  async getActivePlayerSubscriptions(academyId: string): Promise<PlayerSubscription[]> {
    return db.select().from(playerSubscriptions)
      .where(and(
        eq(playerSubscriptions.academyId, academyId),
        eq(playerSubscriptions.status, "active")
      ))
      .orderBy(desc(playerSubscriptions.createdAt));
  },

  async updatePlayerSubscription(id: string, data: Partial<InsertPlayerSubscription>): Promise<PlayerSubscription | undefined> {
    const result = await db.update(playerSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playerSubscriptions.id, id))
      .returning();
    return result[0];
  },

  async deletePlayerSubscription(id: string): Promise<boolean> {
    const result = await db.delete(playerSubscriptions).where(eq(playerSubscriptions.id, id)).returning();
    return result.length > 0;
  },

  async createRefund(data: InsertRefund): Promise<Refund> {
    const result = await db.insert(refunds).values(data).returning();
    return result[0];
  },

  async getRefunds(paymentId: string): Promise<Refund[]> {
    return db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  },

  async generateInvoiceNumber(academyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await db.select().from(invoices)
      .where(and(
        eq(invoices.academyId, academyId),
        gte(invoices.createdAt, new Date(`${year}-01-01`))
      ));
    return `INV-${year}-${String(count.length + 1).padStart(4, '0')}`;
  },

  async getAdminRevenueByMonth(academyId: string, year: number, month: number): Promise<{
    totalRevenue: number;
    cashTotal: number;
    bankTotal: number;
    pendingAmount: number;
    confirmedCount: number;
    pendingCount: number;
    netRevenue: number;
    isManualPayments: boolean;
  }> {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const allPayments = await db.select().from(payments).where(and(
        eq(payments.academyId, academyId),
        gte(payments.createdAt, startDate),
        lte(payments.createdAt, endDate)
      ));

      const confirmedPayments = allPayments.filter(p => p.status === 'confirmed');
      const pendingPayments = allPayments.filter(p => p.status === 'pending');

      const totalRevenue = confirmedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const pendingAmount = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const cashPayments = confirmedPayments.filter(p => p.paymentMethod === 'cash');
      const bankPayments = confirmedPayments.filter(p => p.paymentMethod === 'bank_transfer');
      const cashTotal = cashPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const bankTotal = bankPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const paymentIds = confirmedPayments.map(p => p.id);
      let refundsTotal = 0;
      if (paymentIds.length > 0) {
        const allRefunds = await db.select().from(refunds).where(
          inArray(refunds.paymentId, paymentIds)
        );
        refundsTotal = allRefunds
          .filter(r => r.status === 'succeeded')
          .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      }

      const monthSessions = await db.select().from(sessions).where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, startDate),
        lte(sessions.startTime, endDate),
        eq(sessions.status, 'completed')
      ));

      const completedSessions = monthSessions.length;
      const sessionFees = completedSessions > 0 ? Math.round(totalRevenue * 0.75) : 0;
      const subscriptionRevenue = Math.round(totalRevenue * 0.20);
      const otherRevenue = totalRevenue - sessionFees - subscriptionRevenue;
      const averageSessionRate = completedSessions > 0 ? Math.round(sessionFees / completedSessions) : 0;

      return {
        totalRevenue,
        cashTotal,
        bankTotal,
        pendingAmount,
        confirmedCount: confirmedPayments.length,
        pendingCount: pendingPayments.length,
        netRevenue: totalRevenue,
        isManualPayments: true,
      };
    } catch (error) {
      console.error("Error in getAdminRevenueByMonth:", error);
      return {
        totalRevenue: 0,
        cashTotal: 0,
        bankTotal: 0,
        pendingAmount: 0,
        confirmedCount: 0,
        pendingCount: 0,
        netRevenue: 0,
        isManualPayments: true,
      };
    }
  },

  // ==================== HEALTH CHECK ====================
  
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      const result = await db.select().from(users).limit(1);
      console.log("[Health] Database check passed, found", result.length, "users");
      return true;
    } catch (error: any) {
      console.error("[Health] Database check FAILED:", error.message);
      console.error("[Health] Full error:", JSON.stringify(error, null, 2));
      return false;
    }
  },

  // ==================== PLAYER APP SPECIFIC HELPERS ====================

  async getPlayerSessionsWithDetails(
    playerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    id: string;
    sessionPlayerId: string;
    startTime: Date;
    endTime: Date;
    sessionType: string | null;
    status: string | null;
    courtId: string | null;
    coachId: string | null;
    attendanceStatus: string | null;
    seriesId: string | null;
    locationId: string | null;
    sessionStatus: string | null;
  }[]> {
    try {
      // Get sessionPlayer records, excluding those marked as absent (cancelled)
      const sessionPlayerRecords = await db
        .select()
        .from(sessionPlayers)
        .where(and(
          eq(sessionPlayers.playerId, playerId),
          // Exclude absent/cancelled sessions from upcoming view
          or(
            isNull(sessionPlayers.attendanceStatus),
            ne(sessionPlayers.attendanceStatus, "absent")
          )
        ));
      
      if (sessionPlayerRecords.length === 0) {
        return [];
      }
      
      const sessionIds = sessionPlayerRecords
        .map(sp => sp.sessionId)
        .filter((id): id is string => id !== null);
      
      if (sessionIds.length === 0) {
        return [];
      }
      
      const sessionRecords = await db
        .select()
        .from(sessions)
        .where(and(
          inArray(sessions.id, sessionIds),
          gte(sessions.startTime, startDate),
          lte(sessions.endTime, endDate)
        ))
        .orderBy(sessions.startTime);
      
      return sessionRecords.map(s => {
        const playerRecord = sessionPlayerRecords.find(sp => sp.sessionId === s.id);
        return {
          id: s.id,
          sessionPlayerId: playerRecord?.id || s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          sessionType: s.sessionType,
          status: s.status,
          courtId: s.courtId,
          coachId: s.coachId,
          attendanceStatus: playerRecord?.attendanceStatus || null,
          seriesId: s.seriesId,
          locationId: s.locationId ?? null,
          sessionStatus: s.status,
        };
      });
    } catch (error) {
      console.error("Error in getPlayerSessionsWithDetails:", error);
      return [];
    }
  },

  // Get court bookings for a player/user
  async getPlayerCourtBookings(userId: string, playerId: string | null): Promise<CourtBooking[]> {
    try {
      // Get bookings by userId or playerId
      const conditions = playerId 
        ? or(eq(courtBookings.userId, userId), eq(courtBookings.playerId, playerId))
        : eq(courtBookings.userId, userId);
      
      // Get upcoming and recent bookings (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      
      const bookings = await db.select()
        .from(courtBookings)
        .where(and(
          conditions,
          gte(courtBookings.date, thirtyDaysAgoStr)
        ))
        .orderBy(desc(courtBookings.date));
      
      return bookings;
    } catch (error) {
      console.error("Error in getPlayerCourtBookings:", error);
      return [];
    }
  },

  async getPlayerFeedbackNotes(playerId: string, limit: number = 10): Promise<{
    id: string;
    content: string;
    category: string;
    createdAt: Date | null;
    coachId: string | null;
  }[]> {
    const result = await db
      .select({
        id: playerNotes.id,
        content: playerNotes.content,
        category: playerNotes.category,
        createdAt: playerNotes.createdAt,
        coachId: playerNotes.coachId,
      })
      .from(playerNotes)
      .where(eq(playerNotes.playerId, playerId))
      .orderBy(desc(playerNotes.createdAt))
      .limit(limit);
    return result;
  },

  async getPlayerXpTotal(playerId: string): Promise<{ totalXp: number; level: number; xpToNextLevel: number }> {
    const player = await db.select().from(players).where(eq(players.id, playerId));
    if (!player[0]) return { totalXp: 0, level: 1, xpToNextLevel: 500 };
    const level = player[0].level || 1;
    const xpThresholds = [0, 500, 1200, 2500, 4500, 7500];
    const nextLevelXp = xpThresholds[Math.min(level, xpThresholds.length - 1)] || 500;
    return {
      totalXp: player[0].totalXp || 0,
      level,
      xpToNextLevel: nextLevelXp,
    };
  },

  async getPlayerXpHistory(playerId: string, limit: number = 20): Promise<{
    id: string;
    amount: number;
    reason: string | null;
    createdAt: Date | null;
  }[]> {
    const result = await db
      .select({
        id: xpTransactions.id,
        amount: xpTransactions.xpAmount,
        reason: xpTransactions.description,
        createdAt: xpTransactions.createdAt,
      })
      .from(xpTransactions)
      .where(eq(xpTransactions.playerId, playerId))
      .orderBy(desc(xpTransactions.createdAt))
      .limit(limit);
    return result;
  },

  async getPlayerMilestones(playerId: string): Promise<{
    id: string;
    type: string;
    title: string;
    date: Date | null;
  }[]> {
    const milestones: { id: string; type: string; title: string; date: Date | null }[] = [];
    
    // Get skill observations that represent major improvements
    const observations = await db
      .select({
        id: sessionSkillObservations.id,
        direction: sessionSkillObservations.direction,
        domainId: sessionSkillObservations.domainId,
        createdAt: sessionSkillObservations.createdAt,
      })
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        eq(sessionSkillObservations.direction, "up")
      ))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(20);
    
    for (const obs of observations) {
      milestones.push({
        id: obs.id,
        type: "skill_improvement",
        title: `Skill improved`,
        date: obs.createdAt,
      });
    }
    
    // Get XP milestones (large XP gains)
    const xpMilestones = await db
      .select({
        id: xpTransactions.id,
        amount: xpTransactions.xpAmount,
        reason: xpTransactions.description,
        createdAt: xpTransactions.createdAt,
      })
      .from(xpTransactions)
      .where(and(
        eq(xpTransactions.playerId, playerId),
        gte(xpTransactions.xpAmount, 50)
      ))
      .orderBy(desc(xpTransactions.createdAt))
      .limit(10);
    
    for (const xp of xpMilestones) {
      milestones.push({
        id: xp.id,
        type: "xp_gain",
        title: xp.reason || `Earned ${xp.amount} XP`,
        date: xp.createdAt,
      });
    }
    
    // Sort by date
    milestones.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return b.date.getTime() - a.date.getTime();
    });
    
    return milestones.slice(0, 20);
  },

  async listSkillDomains(): Promise<SkillDomain[]> {
    return db.select().from(skillDomains);
  },

  async getPlayerDomainInsights(playerId: string, domainId: string): Promise<{
    recentHighlights: string[];
    focusAreas: string[];
    lastObservation: { direction: string; note: string | null; date: Date | null } | null;
    avgDelta: number;
    observationCount: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        eq(sessionSkillObservations.domainId, domainId),
        gte(sessionSkillObservations.createdAt, thirtyDaysAgo)
      ))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(20);
    
    if (observations.length === 0) {
      return {
        recentHighlights: [],
        focusAreas: [],
        lastObservation: null,
        avgDelta: 0,
        observationCount: 0,
      };
    }
    
    const recentHighlights: string[] = [];
    const focusAreas: string[] = [];
    
    for (const obs of observations) {
      if (obs.direction === "up" && obs.note && obs.effortLevel === "high") {
        if (!recentHighlights.includes(obs.note) && recentHighlights.length < 3) {
          recentHighlights.push(obs.note);
        }
      }
      if (obs.direction === "down" && obs.note) {
        if (!focusAreas.includes(obs.note) && focusAreas.length < 3) {
          focusAreas.push(obs.note);
        }
      }
    }
    
    const totalDelta = observations.reduce((sum, o) => sum + (o.appliedDelta || 0), 0);
    
    return {
      recentHighlights,
      focusAreas,
      lastObservation: {
        direction: observations[0].direction,
        note: observations[0].note,
        date: observations[0].createdAt,
      },
      avgDelta: observations.length > 0 ? Math.round((totalDelta / observations.length) * 10) / 10 : 0,
      observationCount: observations.length,
    };
  },

  // ==================== COACH PAYOUTS ====================
  
  async getCoachPayouts(coachId: string, limit?: number): Promise<CoachPayout[]> {
    const query = db.select().from(coachPayouts)
      .where(eq(coachPayouts.coachId, coachId))
      .orderBy(desc(coachPayouts.year), desc(coachPayouts.month));
    
    if (limit) {
      return query.limit(limit);
    }
    return query;
  },

  async getCoachPayoutsByAcademy(academyId: string, limit?: number): Promise<CoachPayout[]> {
    const query = db.select().from(coachPayouts)
      .where(eq(coachPayouts.academyId, academyId))
      .orderBy(desc(coachPayouts.year), desc(coachPayouts.month));
    
    if (limit) {
      return query.limit(limit);
    }
    return query;
  },

  async getCoachPayoutByMonthYear(coachId: string, month: number, year: number): Promise<CoachPayout | undefined> {
    const result = await db.select().from(coachPayouts)
      .where(and(
        eq(coachPayouts.coachId, coachId),
        eq(coachPayouts.month, month),
        eq(coachPayouts.year, year)
      ));
    return result[0];
  },

  async createCoachPayout(data: InsertCoachPayout): Promise<CoachPayout> {
    const result = await db.insert(coachPayouts).values(data).returning();
    return result[0];
  },

  async updateCoachPayout(id: string, data: Partial<InsertCoachPayout>): Promise<CoachPayout | undefined> {
    const result = await db.update(coachPayouts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(coachPayouts.id, id))
      .returning();
    return result[0];
  },

  async markCoachPayoutPaid(id: string, paidBy: string, paymentMethod: string, paymentReference?: string): Promise<CoachPayout | undefined> {
    const result = await db.update(coachPayouts)
      .set({ 
        status: "paid", 
        paidAt: new Date(), 
        paidBy,
        paymentMethod,
        paymentReference,
        updatedAt: new Date() 
      })
      .where(eq(coachPayouts.id, id))
      .returning();
    return result[0];
  },

  async declineCoachPayout(id: string, reason: string): Promise<CoachPayout | undefined> {
    const result = await db.update(coachPayouts)
      .set({ 
        status: "declined", 
        declineReason: reason,
        updatedAt: new Date() 
      })
      .where(eq(coachPayouts.id, id))
      .returning();
    return result[0];
  },

  async getCoachMonthlyHoursSummary(coachId: string, academyId?: string): Promise<{
    month: number;
    year: number;
    hoursWorked: number;
    sessionsCount: number;
  }[]> {
    const conditions = [eq(sessions.coachId, coachId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }

    const allSessions = await db.select().from(sessions).where(and(...conditions));
    
    const monthlyData: Map<string, { hours: number; count: number; month: number; year: number }> = new Map();
    
    for (const session of allSessions) {
      const startTime = new Date(session.startTime);
      const endTime = new Date(session.endTime);
      const month = startTime.getMonth() + 1;
      const year = startTime.getFullYear();
      const key = `${year}-${month}`;
      
      const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      if (!monthlyData.has(key)) {
        monthlyData.set(key, { hours: 0, count: 0, month, year });
      }
      
      const data = monthlyData.get(key)!;
      data.hours += durationHours;
      data.count += 1;
    }
    
    return Array.from(monthlyData.values())
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 12)
      .map(d => ({
        month: d.month,
        year: d.year,
        hoursWorked: Math.round(d.hours * 10) / 10,
        sessionsCount: d.count,
      }));
  },

  // ==================== PLATFORM CONFIG ====================

  async getPlatformConfig(key: string): Promise<PlatformConfig | undefined> {
    const result = await db.select().from(platformConfig).where(eq(platformConfig.key, key));
    return result[0];
  },

  async getAllPlatformConfigs(): Promise<PlatformConfig[]> {
    return db.select().from(platformConfig).orderBy(platformConfig.key);
  },

  async setPlatformConfig(key: string, value: any, updatedBy?: string): Promise<PlatformConfig> {
    const existing = await this.getPlatformConfig(key);
    
    if (existing) {
      const result = await db.update(platformConfig)
        .set({ value, updatedAt: new Date(), updatedBy })
        .where(eq(platformConfig.key, key))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(platformConfig)
        .values({ key, value, updatedBy })
        .returning();
      return result[0];
    }
  },

  async deletePlatformConfig(key: string): Promise<boolean> {
    const result = await db.delete(platformConfig).where(eq(platformConfig.key, key));
    return true;
  },

  async isMaintenanceMode(): Promise<boolean> {
    const config = await this.getPlatformConfig("maintenance");
    return config?.value === true || (config?.value as any)?.enabled === true;
  },
  
  async getPlayerEmail(playerId: string): Promise<string | null> {
    const result = await db
      .select({ email: players.email })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    return result[0]?.email || null;
  },

  async isFamilyMember(callerPlayerId: string, targetPlayerId: string): Promise<boolean> {
    if (callerPlayerId === targetPlayerId) return true;
    // Fetch both player records in parallel
    const [callerRows, targetRows] = await Promise.all([
      db.select({ email: players.email, parentEmail: players.parentEmail }).from(players).where(eq(players.id, callerPlayerId)).limit(1),
      db.select({ email: players.email, parentEmail: players.parentEmail }).from(players).where(eq(players.id, targetPlayerId)).limit(1),
    ]);
    const caller = callerRows[0];
    const target = targetRows[0];
    if (!caller || !target) return false;

    // Same email group (sub-profiles sharing the same email, e.g. parent→child)
    if (caller.email && target.email && caller.email === target.email) return true;
    // Caller is the parent (target.parentEmail = caller.email)
    if (caller.email && target.parentEmail && target.parentEmail === caller.email) return true;
    // Caller is a child and target is their parent (caller.parentEmail = target.email)
    if (caller.parentEmail && target.email && caller.parentEmail === target.email) return true;
    // Siblings: both share the same parentEmail
    if (caller.parentEmail && target.parentEmail && caller.parentEmail === target.parentEmail) return true;
    return false;
  },

  async isUserAcademyOwner(userId: string, academyId: string): Promise<boolean> {
    // Check path 3 first (most common, simplest) - User's default academy with academy_owner role
    const defaultAcademyOwnership = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.id, userId),
        eq(users.academyId, academyId),
        eq(users.role, "academy_owner")
      ))
      .limit(1);
    if (defaultAcademyOwnership.length > 0) return true;
    
    // 2. Direct ownership via academies.ownerId -> coaches -> users (join via users.coachId)
    const directOwnership = await db
      .select({ id: academies.id })
      .from(academies)
      .innerJoin(coaches, eq(academies.ownerId, coaches.id))
      .innerJoin(users, eq(users.coachId, coaches.id))
      .where(and(eq(users.id, userId), eq(academies.id, academyId)))
      .limit(1);
    if (directOwnership.length > 0) return true;
    
    // 3. Membership via coachAcademyMemberships with role academy_owner
    const membershipOwnership = await db
      .select({ id: coachAcademyMemberships.id })
      .from(coachAcademyMemberships)
      .innerJoin(coaches, eq(coachAcademyMemberships.coachId, coaches.id))
      .innerJoin(users, eq(users.coachId, coaches.id))
      .where(and(
        eq(users.id, userId),
        eq(coachAcademyMemberships.academyId, academyId),
        eq(coachAcademyMemberships.role, "academy_owner"),
        eq(coachAcademyMemberships.isActive, true)
      ))
      .limit(1);
    if (membershipOwnership.length > 0) return true;
    
    return false;
  },

  async setMaintenanceMode(enabled: boolean, updatedBy?: string): Promise<PlatformConfig> {
    return this.setPlatformConfig("maintenance", { enabled, updatedAt: new Date().toISOString() }, updatedBy);
  },

  async getXpConfig(): Promise<{
    baseValues: Record<string, number>;
    multipliers: Record<string, number>;
    dailyCap: number;
    weeklyCap: number;
  }> {
    const config = await this.getPlatformConfig("xp_engine");
    if (!config) {
      return {
        baseValues: {
          attendance: 10,
          feedback_received: 15,
          level_up: 50,
          badge_earned: 25,
          streak_bonus: 5,
          assessment_completed: 20,
        },
        multipliers: {
          high_effort: 1.5,
          coach_validated: 1.2,
          first_of_day: 1.1,
        },
        dailyCap: 100,
        weeklyCap: 500,
      };
    }
    return config.value as any;
  },

  async setXpConfig(config: {
    baseValues: Record<string, number>;
    multipliers: Record<string, number>;
    dailyCap: number;
    weeklyCap: number;
  }, updatedBy?: string): Promise<PlatformConfig> {
    return this.setPlatformConfig("xp_engine", config, updatedBy);
  },

  // ==================== DIAGNOSTICS ====================

  async createDiagnosticReport(data: InsertDiagnosticReport): Promise<DiagnosticReport> {
    const result = await db.insert(diagnosticReports).values(data).returning();
    return result[0];
  },

  async getDiagnosticReportByErrorId(errorId: string): Promise<DiagnosticReport | undefined> {
    const result = await db.select().from(diagnosticReports)
      .where(eq(diagnosticReports.errorId, errorId));
    return result[0];
  },

  async getDiagnosticReports(filters?: {
    academyId?: string;
    status?: string;
    severity?: string;
    userRole?: string;
    limit?: number;
  }): Promise<DiagnosticReport[]> {
    const conditions: any[] = [];
    
    if (filters?.academyId) {
      conditions.push(eq(diagnosticReports.academyId, filters.academyId));
    }
    if (filters?.status) {
      conditions.push(eq(diagnosticReports.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(diagnosticReports.severity, filters.severity));
    }
    if (filters?.userRole) {
      conditions.push(eq(diagnosticReports.userRole, filters.userRole));
    }
    
    const query = db.select().from(diagnosticReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(diagnosticReports.createdAt));
    
    if (filters?.limit) {
      return query.limit(filters.limit);
    }
    return query;
  },

  async getDiagnosticReportById(id: string): Promise<DiagnosticReport | undefined> {
    const result = await db.select().from(diagnosticReports)
      .where(eq(diagnosticReports.id, id));
    return result[0];
  },

  async updateDiagnosticReport(id: string, data: Partial<InsertDiagnosticReport>): Promise<DiagnosticReport | undefined> {
    const result = await db.update(diagnosticReports)
      .set(data)
      .where(eq(diagnosticReports.id, id))
      .returning();
    return result[0];
  },

  async resolveDiagnosticReport(id: string, resolvedBy: string, notes?: string): Promise<DiagnosticReport | undefined> {
    const result = await db.update(diagnosticReports)
      .set({
        status: "resolved",
        resolvedBy,
        resolvedAt: new Date(),
        resolutionNotes: notes,
      })
      .where(eq(diagnosticReports.id, id))
      .returning();
    return result[0];
  },

  async getDiagnosticReportStats(): Promise<{
    total: number;
    new: number;
    investigating: number;
    resolved: number;
    bySeverity: Record<string, number>;
  }> {
    const allReports = await db.select().from(diagnosticReports);
    
    const stats = {
      total: allReports.length,
      new: 0,
      investigating: 0,
      resolved: 0,
      bySeverity: {} as Record<string, number>,
    };
    
    for (const report of allReports) {
      if (report.status === "new") stats.new++;
      if (report.status === "investigating") stats.investigating++;
      if (report.status === "resolved") stats.resolved++;
      
      const severity = report.severity || "error";
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    }
    
    return stats;
  },

  // ==================== COACH AVAILABILITY ====================
  async getCoachAvailability(coachId: string, academyId: string): Promise<CoachAvailability[]> {
    return db.select().from(coachAvailability)
      .where(and(
        eq(coachAvailability.coachId, coachId),
        eq(coachAvailability.academyId, academyId)
      ))
      .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startTime));
  },

  async createCoachAvailability(data: InsertCoachAvailability): Promise<CoachAvailability> {
    const result = await db.insert(coachAvailability).values(data).returning();
    return result[0];
  },

  async updateCoachAvailability(id: string, updates: Partial<CoachAvailability>): Promise<CoachAvailability | undefined> {
    const result = await db.update(coachAvailability)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(coachAvailability.id, id))
      .returning();
    return result[0];
  },

  async deleteCoachAvailability(id: string): Promise<void> {
    await db.delete(coachAvailability).where(eq(coachAvailability.id, id));
  },

  // ==================== BOOKING REQUESTS ====================
  async getBookingRequests(filters: { 
    coachId?: string; 
    playerId?: string; 
    academyId?: string; 
    status?: string 
  }): Promise<BookingRequest[]> {
    const conditions: any[] = [];
    
    if (filters.coachId) {
      conditions.push(eq(bookingRequests.coachId, filters.coachId));
    }
    if (filters.playerId) {
      conditions.push(eq(bookingRequests.playerId, filters.playerId));
    }
    if (filters.academyId) {
      conditions.push(eq(bookingRequests.academyId, filters.academyId));
    }
    if (filters.status) {
      conditions.push(eq(bookingRequests.status, filters.status));
    }
    
    return db.select().from(bookingRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bookingRequests.createdAt));
  },

  async getBookingRequest(id: string): Promise<BookingRequest | undefined> {
    const result = await db.select().from(bookingRequests)
      .where(eq(bookingRequests.id, id));
    return result[0];
  },

  async createBookingRequest(data: InsertBookingRequest): Promise<BookingRequest> {
    const result = await db.insert(bookingRequests).values(data).returning();
    return result[0];
  },

  async updateBookingRequest(id: string, updates: Partial<BookingRequest>): Promise<BookingRequest | undefined> {
    const result = await db.update(bookingRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(bookingRequests.id, id))
      .returning();
    return result[0];
  },

  async approveBookingRequest(id: string, coachId: string): Promise<{ request: BookingRequest; session: Session } | undefined> {
    return await db.transaction(async (tx) => {
      const request = await tx.select().from(bookingRequests)
        .where(and(eq(bookingRequests.id, id), eq(bookingRequests.status, "pending")));
      
      if (!request[0]) return undefined;
      
      const bookingData = request[0];
      
      const startMs = new Date(bookingData.requestedStart as string | Date).getTime();
      const endMs = new Date(bookingData.requestedEnd as string | Date).getTime();
      const durationMinutes = Math.round((endMs - startMs) / 60000);

      const sessionData: InsertSession = {
        academyId: bookingData.academyId,
        coachId: bookingData.coachId || coachId,
        locationId: bookingData.locationId,
        courtId: bookingData.courtId,
        startTime: bookingData.requestedStart,
        endTime: bookingData.requestedEnd,
        duration: durationMinutes > 0 ? durationMinutes : 60,
        sessionType: bookingData.sessionType,
        status: "scheduled",
        notes: bookingData.playerNote,
      };
      
      const sessionResult = await tx.insert(sessions).values(sessionData).returning();
      const createdSession = sessionResult[0];
      
      if (bookingData.playerId) {
        await tx.insert(sessionPlayers).values({
          sessionId: createdSession.id,
          playerId: bookingData.playerId,
          status: "confirmed",
        });
      }
      
      const updatedRequest = await tx.update(bookingRequests)
        .set({
          status: "approved",
          sessionId: createdSession.id,
          respondedBy: coachId,
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bookingRequests.id, id))
        .returning();
      
      return {
        request: updatedRequest[0],
        session: createdSession,
      };
    });
  },

  // ==================== SLOT COMPUTATION ====================
  async getAvailableSlots(params: {
    academyId: string;
    coachId?: string;
    locationId?: string;
    startDate: Date;
    endDate: Date;
    duration: number;
    requestingPlayerId?: string;
  }): Promise<Array<{
    coachId: string;
    locationId: string | null;
    courtId: string | null;
    startTime: Date;
    endTime: Date;
  }>> {
    // Fetch the academy's timezone so availability windows are interpreted in local time
    const academyRow = await db.select({ timezone: academies.timezone }).from(academies).where(eq(academies.id, params.academyId)).limit(1);
    const academyTimezone = academyRow[0]?.timezone ?? 'Asia/Dubai';

    const conditions: any[] = [eq(coachAvailability.academyId, params.academyId), eq(coachAvailability.isActive, true)];
    
    if (params.coachId) {
      conditions.push(eq(coachAvailability.coachId, params.coachId));
    }
    if (params.locationId) {
      conditions.push(or(
        eq(coachAvailability.locationId, params.locationId),
        isNull(coachAvailability.locationId)
      ));
    }
    
    const availabilitySlots = await db.select().from(coachAvailability)
      .where(and(...conditions));
    
    // sessions.start_time / end_time and booking_requests.requested_start / requested_end
    // are all stored as real UTC in a `timestamp without time zone` column.
    // Supabase's PostgreSQL server runs at UTC, so ::timestamptz treats stored values as UTC.
    // The slot generator (localHHMMToUtc) also produces UTC — so conflict detection is a
    // straightforward UTC-to-UTC comparison with no timezone conversion needed.
    // This works correctly for any academy timezone (Dubai, Jakarta, etc.).
    const sessionStartIso = params.startDate.toISOString();
    const sessionEndIso = params.endDate.toISOString();

    const sessionQuery = params.coachId
      ? sql`
          SELECT
            id,
            coach_id      AS "coachId",
            academy_id    AS "academyId",
            status,
            court_id      AS "courtId",
            start_time::timestamptz AS "startTime",
            end_time::timestamptz   AS "endTime"
          FROM sessions
          WHERE academy_id = ${params.academyId}
            AND status != 'cancelled'
            AND end_time::timestamptz   > ${sessionStartIso}::timestamptz
            AND start_time::timestamptz < ${sessionEndIso}::timestamptz
            AND coach_id = ${params.coachId}
        `
      : sql`
          SELECT
            id,
            coach_id      AS "coachId",
            academy_id    AS "academyId",
            status,
            court_id      AS "courtId",
            start_time::timestamptz AS "startTime",
            end_time::timestamptz   AS "endTime"
          FROM sessions
          WHERE academy_id = ${params.academyId}
            AND status != 'cancelled'
            AND end_time::timestamptz   > ${sessionStartIso}::timestamptz
            AND start_time::timestamptz < ${sessionEndIso}::timestamptz
        `;

    const sessionResult = await db.execute(sessionQuery);
    // IMPORTANT: Drizzle's node-postgres adapter overrides pg type parsers so that
    // TIMESTAMP/TIMESTAMPTZ columns are returned as raw strings, NOT Date objects.
    // We must explicitly wrap them in new Date() so that JS comparisons work correctly.
    const existingSessions = (sessionResult.rows as Array<{
      id: string;
      coachId: string;
      academyId: string;
      status: string;
      courtId: string | null;
      startTime: string;
      endTime: string;
    }>).map(row => ({
      ...row,
      startTime: new Date(row.startTime),
      endTime: new Date(row.endTime),
    }));

    // booking_requests.requested_start / requested_end are also UTC (sent by the
    // client slot generator). Direct ::timestamptz cast is correct here too.
    const pendingQuery = params.coachId
      ? sql`
          SELECT
            id,
            coach_id        AS "coachId",
            academy_id      AS "academyId",
            status,
            court_id        AS "courtId",
            requested_start::timestamptz AS "requestedStart",
            requested_end::timestamptz   AS "requestedEnd"
          FROM booking_requests
          WHERE academy_id = ${params.academyId}
            AND status = 'pending'
            AND requested_end::timestamptz   > ${sessionStartIso}::timestamptz
            AND requested_start::timestamptz < ${sessionEndIso}::timestamptz
            AND coach_id = ${params.coachId}
        `
      : sql`
          SELECT
            id,
            coach_id        AS "coachId",
            academy_id      AS "academyId",
            status,
            court_id        AS "courtId",
            requested_start::timestamptz AS "requestedStart",
            requested_end::timestamptz   AS "requestedEnd"
          FROM booking_requests
          WHERE academy_id = ${params.academyId}
            AND status = 'pending'
            AND requested_end::timestamptz   > ${sessionStartIso}::timestamptz
            AND requested_start::timestamptz < ${sessionEndIso}::timestamptz
        `;

    const pendingResult = await db.execute(pendingQuery);
    // Same Drizzle string-return issue — must wrap timestamps explicitly.
    const pendingRequests = (pendingResult.rows as Array<{
      id: string;
      coachId: string;
      academyId: string;
      status: string;
      courtId: string | null;
      requestedStart: string;
      requestedEnd: string;
    }>).map(row => ({
      ...row,
      requestedStart: new Date(row.requestedStart),
      requestedEnd: new Date(row.requestedEnd),
    }));

    // Fetch travel times between locations for the academy, scoped per-coach.
    // checkCoachConflict (booking-time guard) does the same — it reads by coachId.
    // We fetch all records for the academy once and look up by coachId at evaluation time
    // so we avoid per-slot DB queries while still honouring coach-specific travel configs.
    const travelTimesData = await db
      .select()
      .from(locationTravelTimes)
      .where(eq(locationTravelTimes.academyId, params.academyId));

    // Build a court → locationId lookup from all courts in the academy
    const academyCourts = await db
      .select({ id: courts.id, locationId: courts.locationId })
      .from(courts)
      .where(eq(courts.academyId, params.academyId));
    const courtLocationMap = new Map<string, string | null>(
      academyCourts.map(c => [c.id, c.locationId])
    );

    // Pre-index travel times by "coachId:locationA:locationB" (both orderings) for O(1) lookup
    // inside the hot slot-generation loop. Mirrors checkCoachConflict's coach-scoped behavior.
    const travelTimeIndex = new Map<string, number>();
    for (const tt of travelTimesData) {
      if (!tt.coachId) continue;
      const keyAB = `${tt.coachId}:${tt.fromLocationId}:${tt.toLocationId}`;
      const keyBA = `${tt.coachId}:${tt.toLocationId}:${tt.fromLocationId}`;
      travelTimeIndex.set(keyAB, tt.travelTimeMinutes);
      travelTimeIndex.set(keyBA, tt.travelTimeMinutes);
    }

    function getTravelMinutes(coachId: string, fromLocId: string, toLocId: string): number {
      if (fromLocId === toLocId) return 0;
      return travelTimeIndex.get(`${coachId}:${fromLocId}:${toLocId}`) ?? 0;
    }

    // Fetch court availability blocks for the date range (blocked/booked from ALL coaches)
    // This ensures cross-coach court conflict exclusion
    const startDateStr = `${params.startDate.getUTCFullYear()}-${String(params.startDate.getUTCMonth() + 1).padStart(2, "0")}-${String(params.startDate.getUTCDate()).padStart(2, "0")}`;
    const endDateStr = `${params.endDate.getUTCFullYear()}-${String(params.endDate.getUTCMonth() + 1).padStart(2, "0")}-${String(params.endDate.getUTCDate()).padStart(2, "0")}`;
    const courtBlocks = await db.select({
      courtId: courtAvailability.courtId,
      date: courtAvailability.date,
      startTime: courtAvailability.startTime,
      endTime: courtAvailability.endTime,
      status: courtAvailability.status,
    }).from(courtAvailability)
      .where(and(
        gte(courtAvailability.date, startDateStr),
        lte(courtAvailability.date, endDateStr),
        sql`${courtAvailability.status} IN ('blocked', 'booked')`
      ));

    // Also check sessions that have courts assigned (cross-coach court conflict)
    const sessionCourtConflicts = existingSessions.filter(s => s.courtId);

    // Fetch active slot reservations by OTHER players — these temp-lock slots for 5 min
    // to prevent race-condition double-bookings. Clean up expired ones first.
    await db.execute(sql`DELETE FROM slot_reservations WHERE expires_at < NOW()`);
    const activeReservationsResult = await db.execute(sql`
      SELECT coach_id AS "coachId", start_time AS "startTime", end_time AS "endTime"
      FROM slot_reservations
      WHERE academy_id = ${params.academyId}
        AND expires_at > NOW()
        ${params.requestingPlayerId ? sql`AND player_id != ${params.requestingPlayerId}` : sql``}
    `);
    const activeReservations = (activeReservationsResult.rows as Array<{
      coachId: string;
      startTime: string;
      endTime: string;
    }>).map(row => ({
      coachId: row.coachId,
      startTime: new Date(row.startTime),
      endTime: new Date(row.endTime),
    }));

    const availableSlots: Array<{
      coachId: string;
      locationId: string | null;
      courtId: string | null;
      startTime: Date;
      endTime: Date;
    }> = [];
    
    // Use UTC-epoch-aligned midnight for iteration so weekday/date math is
    // always in UTC regardless of the server's local timezone.
    const startMidnightUtc = Date.UTC(
      params.startDate.getUTCFullYear(),
      params.startDate.getUTCMonth(),
      params.startDate.getUTCDate()
    );
    const endMidnightUtc = Date.UTC(
      params.endDate.getUTCFullYear(),
      params.endDate.getUTCMonth(),
      params.endDate.getUTCDate()
    );

    let currentDayUtcMs = startMidnightUtc;
    while (currentDayUtcMs <= endMidnightUtc) {
      const currentDayDate = new Date(currentDayUtcMs);
      const weekday = currentDayDate.getUTCDay();
      const yyyy = currentDayDate.getUTCFullYear();
      const mm = String(currentDayDate.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(currentDayDate.getUTCDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const dayAvailability = availabilitySlots.filter(a => a.weekday === weekday);
      
      for (const availability of dayAvailability) {
        const [startHour, startMin] = availability.startTime.split(':').map(Number);
        const [endHour, endMin] = availability.endTime.split(':').map(Number);
        
        // Build slot boundaries by converting local HH:MM availability windows to UTC
        // using the academy's timezone so that "09:00" means 9am local time, not 9am UTC
        const slotStart = localHHMMToUtc(yyyy, currentDayDate.getUTCMonth(), currentDayDate.getUTCDate(), startHour, startMin, academyTimezone);
        
        const availabilityEnd = localHHMMToUtc(yyyy, currentDayDate.getUTCMonth(), currentDayDate.getUTCDate(), endHour, endMin, academyTimezone);
        
        const slotDuration = availability.slotDuration || params.duration;
        
        const nowUtc = new Date();
        while (slotStart.getTime() + slotDuration * 60000 <= availabilityEnd.getTime()) {
          // Skip slots that have already started (past times for today)
          if (slotStart < nowUtc) {
            slotStart.setTime(slotStart.getTime() + slotDuration * 60000);
            continue;
          }

          const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
          const slotStartTime = `${String(slotStart.getUTCHours()).padStart(2, "0")}:${String(slotStart.getUTCMinutes()).padStart(2, "0")}`;
          const slotEndTime = `${String(slotEnd.getUTCHours()).padStart(2, "0")}:${String(slotEnd.getUTCMinutes()).padStart(2, "0")}`;

          // Determine the target locationId for this candidate slot.
          // Priority: (1) direct locationId on the availability record, (2) the court's location
          // (resolved via courtLocationMap), (3) the params.locationId filter the caller supplied.
          // Wildcard availability rows (locationId = null, courtId = null) often match any location,
          // so when the player has filtered by a specific location we use params.locationId as the
          // authoritative target — this is the location the player is browsing for, and it is what
          // the booking-confirmation guard would check the new session against.
          const slotLocationId: string | null =
            availability.locationId
            ?? (availability.courtId ? (courtLocationMap.get(availability.courtId) ?? null) : null)
            ?? params.locationId
            ?? null;

          // Check coach-level session conflict (same coach) — with cross-location travel buffer
          const hasConflict = existingSessions.some(session => {
            if (session.coachId !== availability.coachId) return false;
            if (!session.startTime || !session.endTime) return false;

            // Direct time overlap (same or unknown location)
            const directOverlap = slotStart < session.endTime && slotEnd > session.startTime;
            if (directOverlap) return true;

            // Cross-location travel-time buffer check (scoped to this coach's travel config)
            if (slotLocationId && session.courtId) {
              const sessionLocationId = courtLocationMap.get(session.courtId) ?? null;
              if (sessionLocationId && sessionLocationId !== slotLocationId) {
                const travelMins = getTravelMinutes(availability.coachId, sessionLocationId, slotLocationId);
                if (travelMins > 0) {
                  const bufferAfterSession = new Date(session.endTime.getTime() + travelMins * 60000);
                  if (slotStart < bufferAfterSession && slotEnd > session.endTime) return true;
                  const bufferBeforeSession = new Date(session.startTime.getTime() - travelMins * 60000);
                  if (slotEnd > bufferBeforeSession && slotStart < session.startTime) return true;
                }
              }
            }
            return false;
          });
          
          // Check coach-level pending request conflict (same coach) — with cross-location travel buffer
          const hasPendingConflict = pendingRequests.some(req => {
            if (req.coachId !== availability.coachId) return false;
            if (!req.requestedStart || !req.requestedEnd) return false;

            // Direct time overlap (same or unknown location)
            const directOverlap = slotStart < req.requestedEnd && slotEnd > req.requestedStart;
            if (directOverlap) return true;

            // Cross-location travel-time buffer check (scoped to this coach's travel config)
            if (slotLocationId && req.courtId) {
              const reqLocationId = courtLocationMap.get(req.courtId) ?? null;
              if (reqLocationId && reqLocationId !== slotLocationId) {
                const travelMins = getTravelMinutes(availability.coachId, reqLocationId, slotLocationId);
                if (travelMins > 0) {
                  const bufferAfterReq = new Date(req.requestedEnd.getTime() + travelMins * 60000);
                  if (slotStart < bufferAfterReq && slotEnd > req.requestedEnd) return true;
                  const bufferBeforeReq = new Date(req.requestedStart.getTime() - travelMins * 60000);
                  if (slotEnd > bufferBeforeReq && slotStart < req.requestedStart) return true;
                }
              }
            }
            return false;
          });

          // Check court-level conflict via courtAvailability (blocked/booked by ANY coach)
          const hasCourtBlock = availability.courtId ? courtBlocks.some(block =>
            block.courtId === availability.courtId &&
            block.date === dateStr &&
            block.startTime < slotEndTime && block.endTime > slotStartTime
          ) : false;

          // Check court-level conflict via sessions with courts (cross-coach)
          const hasCourtSessionConflict = availability.courtId ? sessionCourtConflicts.some(session =>
            session.courtId === availability.courtId &&
            session.startTime && session.endTime &&
            slotStart < session.endTime && slotEnd > session.startTime
          ) : false;

          // Check if another player has temporarily reserved this exact coach+slot
          const hasReservationConflict = activeReservations.some(res =>
            res.coachId === availability.coachId &&
            slotStart < res.endTime && slotEnd > res.startTime
          );
          
          if (!hasConflict && !hasPendingConflict && !hasCourtBlock && !hasCourtSessionConflict && !hasReservationConflict) {
            availableSlots.push({
              coachId: availability.coachId,
              locationId: availability.locationId,
              courtId: availability.courtId,
              startTime: new Date(slotStart),
              endTime: new Date(slotEnd),
            });
          }
          
          slotStart.setTime(slotStart.getTime() + slotDuration * 60000);
        }
      }
      
      currentDayUtcMs += 24 * 60 * 60 * 1000;
    }
    
    return availableSlots;
  },

  // ==================== PARENT PORTAL ====================

  // Get children linked to a parent user
  async getParentChildren(parentUserId: string): Promise<Array<{
    id: string;
    name: string;
    academyId: string | null;
    relationship: string;
  }>> {
    const relations = await db.select({
      playerId: parentPlayerRelations.playerId,
      relationship: parentPlayerRelations.relationship,
    }).from(parentPlayerRelations)
      .where(eq(parentPlayerRelations.parentUserId, parentUserId));
    
    const children = await Promise.all(relations.map(async (rel) => {
      const player = await db.select({ id: players.id, name: players.name, academyId: players.academyId })
        .from(players).where(eq(players.id, rel.playerId));
      return {
        id: rel.playerId,
        name: player[0]?.name || "Unknown",
        academyId: player[0]?.academyId || null,
        relationship: rel.relationship || "parent",
      };
    }));
    
    return children;
  },

  // Check if a parent has access to a player
  async checkParentPlayerAccess(parentUserId: string, playerId: string): Promise<boolean> {
    const result = await db.select({ id: parentPlayerRelations.id })
      .from(parentPlayerRelations)
      .where(and(
        eq(parentPlayerRelations.parentUserId, parentUserId),
        eq(parentPlayerRelations.playerId, playerId),
        eq(parentPlayerRelations.canViewInvoices, true)
      ));
    return result.length > 0;
  },

  // Get invoices for a specific player
  async getPlayerInvoices(playerId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(eq(invoices.playerId, playerId))
      .orderBy(desc(invoices.createdAt));
  },

  // Get payments for a specific player
  async getPlayerPayments(playerId: string): Promise<Payment[]> {
    return db.select().from(payments)
      .where(eq(payments.playerId, playerId))
      .orderBy(desc(payments.createdAt));
  },

  // Get lesson summary for a player in a specific month/year
  async getPlayerLessonSummary(playerId: string, month: number, year: number): Promise<{
    scheduled: number;
    attended: number;
    missed: number;
    cancelled: number;
    makeUps: number;
  }> {
    // Get all session_players for this player in the given month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const sessionData = await db.select({
      sessionId: sessionPlayers.sessionId,
      attendanceStatus: sessionPlayers.attendanceStatus,
    }).from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));
    
    // Get session dates to filter by month
    const sessionsInMonth = await db.select({
      id: sessions.id,
      startTime: sessions.startTime,
      status: sessions.status,
    }).from(sessions)
      .where(and(
        gte(sessions.startTime, startDate),
        lte(sessions.startTime, endDate)
      ));
    
    const sessionIdsInMonth = new Set(sessionsInMonth.map(s => s.id));
    const relevantData = sessionData.filter(sp => sp.sessionId && sessionIdsInMonth.has(sp.sessionId));
    
    // Count by attendance status
    const attended = relevantData.filter(d => d.attendanceStatus === "present" || d.attendanceStatus === "late").length;
    const missed = relevantData.filter(d => d.attendanceStatus === "absent").length;
    const cancelled = sessionsInMonth.filter(s => s.status === "cancelled").length;
    
    return {
      scheduled: sessionsInMonth.length,
      attended,
      missed,
      cancelled,
      makeUps: 0, // TODO: Track make-up sessions separately if needed
    };
  },

  // Get session-based billing summary for a player
  async getPlayerSessionBilling(playerId: string): Promise<{
    unpaidCount: number;
    unpaidTotal: number;
    paidCount: number;
    paidTotal: number;
  }> {
    try {
      // Get all session player records for this player
      const sessionPlayerRecords = await db.select({
        sessionId: sessionPlayers.sessionId,
        attendanceStatus: sessionPlayers.attendanceStatus,
      }).from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, playerId));
      
      if (sessionPlayerRecords.length === 0) {
        return { unpaidCount: 0, unpaidTotal: 0, paidCount: 0, paidTotal: 0 };
      }
      
      // Filter for attended sessions
      const attendedSessionIds = sessionPlayerRecords
        .filter(sp => sp.attendanceStatus === "present" || sp.attendanceStatus === "late")
        .map(sp => sp.sessionId)
        .filter((id): id is string => id !== null);
      
      if (attendedSessionIds.length === 0) {
        return { unpaidCount: 0, unpaidTotal: 0, paidCount: 0, paidTotal: 0 };
      }
      
      // Get sessions with their prices and payment status
      const sessionData = await db.select({
        id: sessions.id,
        price: sessions.price,
        paymentStatus: sessions.paymentStatus,
      }).from(sessions)
        .where(inArray(sessions.id, attendedSessionIds));
      
      let unpaidCount = 0;
      let unpaidTotal = 0;
      let paidCount = 0;
      let paidTotal = 0;
      
      for (const s of sessionData) {
        const price = parseFloat(s.price || "0");
        if (s.paymentStatus === "paid") {
          paidCount++;
          paidTotal += price;
        } else if (s.paymentStatus === "unpaid" && price > 0) {
          unpaidCount++;
          unpaidTotal += price;
        }
      }
      
      return { unpaidCount, unpaidTotal, paidCount, paidTotal };
    } catch (error) {
      console.error("Error in getPlayerSessionBilling:", error);
      return { unpaidCount: 0, unpaidTotal: 0, paidCount: 0, paidTotal: 0 };
    }
  },

  // Get parent settings
  async getParentSettings(userId: string): Promise<ParentSettings | undefined> {
    const result = await db.select().from(parentSettings)
      .where(eq(parentSettings.userId, userId));
    return result[0];
  },

  // Create parent settings with defaults
  async createParentSettings(data: { userId: string }): Promise<ParentSettings> {
    const result = await db.insert(parentSettings).values({
      userId: data.userId,
    }).returning();
    return result[0];
  },

  // Update parent settings
  async updateParentSettings(userId: string, updates: Partial<InsertParentSettings>): Promise<ParentSettings | undefined> {
    const result = await db.update(parentSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(parentSettings.userId, userId))
      .returning();
    return result[0];
  },

  // Create a parent-player relationship
  async createParentPlayerRelation(data: InsertParentPlayerRelation): Promise<ParentPlayerRelation> {
    const result = await db.insert(parentPlayerRelations).values(data).returning();
    return result[0];
  },

  // Create a payment reminder
  async createPaymentReminder(data: InsertPaymentReminder): Promise<PaymentReminder> {
    const result = await db.insert(paymentReminders).values(data).returning();
    return result[0];
  },

  // Get pending payment reminders
  async getPendingPaymentReminders(): Promise<PaymentReminder[]> {
    return db.select().from(paymentReminders)
      .where(and(
        eq(paymentReminders.status, "pending"),
        lte(paymentReminders.scheduledFor, new Date())
      ));
  },

  // Update payment reminder status
  async updatePaymentReminder(id: string, updates: Partial<InsertPaymentReminder>): Promise<PaymentReminder | undefined> {
    const result = await db.update(paymentReminders)
      .set(updates)
      .where(eq(paymentReminders.id, id))
      .returning();
    return result[0];
  },

  // ==================== COACH EARNINGS ====================

  // Get coach payment rule
  async getCoachPaymentRule(coachId: string): Promise<any | undefined> {
    const result = await db.select().from(coachPaymentRules)
      .where(and(
        eq(coachPaymentRules.coachId, coachId),
        eq(coachPaymentRules.isActive, true)
      ));
    return result[0];
  },

  // Get coach's completed sessions for a specific month
  // A session is considered "completed" if:
  // 1. Its status is explicitly "completed", OR
  // 2. It's a past session (end time has passed) regardless of status
  async getCoachCompletedSessionsForMonth(coachId: string, month: number, year: number): Promise<Session[]> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const now = new Date();
    
    return db.select().from(sessions)
      .where(and(
        eq(sessions.coachId, coachId),
        gte(sessions.startTime, startOfMonth),
        lte(sessions.startTime, endOfMonth),
        or(
          eq(sessions.status, "completed"),
          lte(sessions.endTime, now) // Past sessions count as completed
        )
      ))
      .orderBy(desc(sessions.startTime));
  },

  // Get coach's upcoming sessions for current month (scheduled and in the future)
  async getCoachUpcomingSessionsForMonth(coachId: string, month: number, year: number): Promise<Session[]> {
    const now = new Date();
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    
    return db.select().from(sessions)
      .where(and(
        eq(sessions.coachId, coachId),
        eq(sessions.status, "scheduled"),
        gte(sessions.endTime, now), // Session hasn't ended yet
        lte(sessions.startTime, endOfMonth)
      ))
      .orderBy(asc(sessions.startTime));
  },

  // Create coach payment rule (for academy owners)
  async createCoachPaymentRule(data: any): Promise<any> {
    const result = await db.insert(coachPaymentRules).values(data).returning();
    return result[0];
  },

  // Update coach payment rule
  async updateCoachPaymentRule(coachId: string, updates: any): Promise<any | undefined> {
    const result = await db.update(coachPaymentRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(coachPaymentRules.coachId, coachId))
      .returning();
    return result[0];
  },

  // ==================== COACH REVIEW SYSTEM ====================

  // Get count of completed sessions between player and coach
  async getPlayerCoachSessionCount(playerId: string, coachId: string): Promise<number> {
    const result = await db.select({ count: count() })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        eq(sessions.coachId, coachId),
        eq(sessionPlayers.attendanceStatus, "present")
      ));
    return result[0]?.count || 0;
  },

  // Check if player has already reviewed a coach
  async hasPlayerReviewedCoach(playerId: string, coachId: string): Promise<boolean> {
    const result = await db.select({ id: coachReviews.id })
      .from(coachReviews)
      .where(and(
        eq(coachReviews.playerId, playerId),
        eq(coachReviews.coachId, coachId)
      ))
      .limit(1);
    return result.length > 0;
  },

  // Get pending review prompt for player-coach pair
  async getPendingReviewPrompt(playerId: string, coachId: string): Promise<ReviewPrompt | undefined> {
    const result = await db.select()
      .from(reviewPrompts)
      .where(and(
        eq(reviewPrompts.playerId, playerId),
        eq(reviewPrompts.coachId, coachId),
        eq(reviewPrompts.status, "pending")
      ))
      .limit(1);
    return result[0];
  },

  // Get all pending review prompts for a player
  async getPlayerReviewPrompts(playerId: string): Promise<ReviewPrompt[]> {
    return db.select()
      .from(reviewPrompts)
      .where(and(
        eq(reviewPrompts.playerId, playerId),
        eq(reviewPrompts.status, "pending"),
        lte(reviewPrompts.triggerAt, new Date())
      ))
      .orderBy(desc(reviewPrompts.triggerAt));
  },

  // Create a coach review
  async createCoachReview(data: {
    coachId: string;
    playerId: string;
    academyId?: string | null;
    coachingQuality: number;
    communication: number;
    withKidsBeginners: number;
    reliability: number;
    feedbackMotivation: number;
    overallScore: string;
    whatDoesWell?: string | null;
    bestForPlayerType?: string | null;
    reviewerAgeCategory?: string | null;
    reviewerLevel?: string | null;
    sessionCountAtReview: number;
  }): Promise<CoachReview> {
    const result = await db.insert(coachReviews).values(data).returning();
    return result[0];
  },

  // Get a coach review by ID
  async getCoachReview(id: string): Promise<CoachReview | undefined> {
    const result = await db.select()
      .from(coachReviews)
      .where(eq(coachReviews.id, id));
    return result[0];
  },

  // Get coach review stats
  async getCoachReviewStats(coachId: string): Promise<CoachReviewStats | undefined> {
    const result = await db.select()
      .from(coachReviewStats)
      .where(eq(coachReviewStats.coachId, coachId));
    return result[0];
  },

  // Update coach review stats (recalculate from all reviews)
  async updateCoachReviewStats(coachId: string): Promise<void> {
    // Get all non-hidden reviews for this coach
    const reviews = await db.select()
      .from(coachReviews)
      .where(and(
        eq(coachReviews.coachId, coachId),
        eq(coachReviews.isHidden, false)
      ));

    if (reviews.length === 0) {
      // Delete stats if no reviews
      await db.delete(coachReviewStats).where(eq(coachReviewStats.coachId, coachId));
      return;
    }

    const totalReviews = reviews.length;
    const visibleReviews = reviews.length >= 3 ? reviews.length : 0;

    // Calculate averages
    const avgOverall = reviews.reduce((sum, r) => sum + parseFloat(r.overallScore.toString()), 0) / totalReviews;
    const avgCoachingQuality = reviews.reduce((sum, r) => sum + r.coachingQuality, 0) / totalReviews;
    const avgCommunication = reviews.reduce((sum, r) => sum + r.communication, 0) / totalReviews;
    const avgWithKidsBeginners = reviews.reduce((sum, r) => sum + r.withKidsBeginners, 0) / totalReviews;
    const avgReliability = reviews.reduce((sum, r) => sum + r.reliability, 0) / totalReviews;
    const avgFeedbackMotivation = reviews.reduce((sum, r) => sum + r.feedbackMotivation, 0) / totalReviews;

    // Count by age category
    const kidReviewCount = reviews.filter(r => r.reviewerAgeCategory === "kid").length;
    const teenReviewCount = reviews.filter(r => r.reviewerAgeCategory === "teen").length;
    const adultReviewCount = reviews.filter(r => r.reviewerAgeCategory === "adult").length;

    // Count by level
    const redLevelCount = reviews.filter(r => r.reviewerLevel === "red").length;
    const orangeLevelCount = reviews.filter(r => r.reviewerLevel === "orange").length;
    const greenLevelCount = reviews.filter(r => r.reviewerLevel === "green").length;
    const yellowLevelCount = reviews.filter(r => r.reviewerLevel === "yellow").length;

    // Generate best-for tags based on high scores
    const bestForTags: string[] = [];
    if (avgWithKidsBeginners >= 4.5 && kidReviewCount >= 2) bestForTags.push("Great with kids");
    if (avgWithKidsBeginners >= 4.0 && redLevelCount >= 2) bestForTags.push("Perfect for beginners");
    if (avgCoachingQuality >= 4.5) bestForTags.push("High coaching quality");
    if (avgCommunication >= 4.5) bestForTags.push("Excellent communicator");
    if (avgReliability >= 4.5) bestForTags.push("Very reliable");

    // Mark reviews as visible if we have 3+ reviews
    if (reviews.length >= 3) {
      await db.update(coachReviews)
        .set({ isVisible: true })
        .where(and(
          eq(coachReviews.coachId, coachId),
          eq(coachReviews.isHidden, false)
        ));
    }

    // Upsert stats
    const existing = await db.select().from(coachReviewStats)
      .where(eq(coachReviewStats.coachId, coachId));

    const statsData = {
      totalReviews,
      visibleReviews,
      averageOverall: avgOverall.toFixed(2),
      avgCoachingQuality: avgCoachingQuality.toFixed(2),
      avgCommunication: avgCommunication.toFixed(2),
      avgWithKidsBeginners: avgWithKidsBeginners.toFixed(2),
      avgReliability: avgReliability.toFixed(2),
      avgFeedbackMotivation: avgFeedbackMotivation.toFixed(2),
      kidReviewCount,
      teenReviewCount,
      adultReviewCount,
      redLevelCount,
      orangeLevelCount,
      greenLevelCount,
      yellowLevelCount,
      bestForTags,
      lastUpdated: new Date(),
    };

    if (existing.length > 0) {
      await db.update(coachReviewStats)
        .set(statsData)
        .where(eq(coachReviewStats.coachId, coachId));
    } else {
      await db.insert(coachReviewStats).values({ coachId, ...statsData });
    }
  },

  // Update coach average rating from session ratings
  async updateCoachSessionRatingStats(coachId: string): Promise<void> {
    const result = await db
      .select({
        avg: sql<string>`AVG(${sessionRatings.rating})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sessionRatings)
      .where(eq(sessionRatings.coachId, coachId));

    const avg = result[0]?.avg ? parseFloat(result[0].avg) : null;
    const count = result[0]?.count ?? 0;

    await db.update(coaches)
      .set({
        averageRating: avg !== null ? avg.toFixed(2) : null,
        totalRatings: count,
      })
      .where(eq(coaches.id, coachId));
  },

  // Update academy aggregate rating from session ratings
  async updateAcademyRatingStats(academyId: string): Promise<void> {
    const result = await db
      .select({
        avg: sql<string>`AVG(${sessionRatings.rating})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sessionRatings)
      .where(eq(sessionRatings.academyId, academyId));

    const avg = result[0]?.avg ? parseFloat(result[0].avg) : null;
    const count = result[0]?.count ?? 0;

    await db.update(academies)
      .set({
        averageRating: avg !== null ? avg.toFixed(2) : null,
        totalRatings: count,
      })
      .where(eq(academies.id, academyId));
  },

  // Get visible reviews for a coach (public display)
  async getVisibleCoachReviews(coachId: string, limit: number = 10): Promise<Array<CoachReview & { response?: ReviewResponse }>> {
    const reviews = await db.select()
      .from(coachReviews)
      .where(and(
        eq(coachReviews.coachId, coachId),
        eq(coachReviews.isVisible, true),
        eq(coachReviews.isHidden, false)
      ))
      .orderBy(desc(coachReviews.createdAt))
      .limit(limit);

    // Get responses for these reviews
    const reviewIds = reviews.map(r => r.id);
    const responses = reviewIds.length > 0 
      ? await db.select().from(reviewResponses)
          .where(and(
            inArray(reviewResponses.reviewId, reviewIds),
            eq(reviewResponses.isHidden, false)
          ))
      : [];

    const responseMap = new Map(responses.map(r => [r.reviewId, r]));

    return reviews.map(r => ({
      ...r,
      response: responseMap.get(r.id),
    }));
  },

  // Get all reviews for a coach (coach's own view)
  async getCoachReviewsForCoach(coachId: string): Promise<Array<CoachReview & { response?: ReviewResponse }>> {
    const reviews = await db.select()
      .from(coachReviews)
      .where(eq(coachReviews.coachId, coachId))
      .orderBy(desc(coachReviews.createdAt));

    const reviewIds = reviews.map(r => r.id);
    const responses = reviewIds.length > 0 
      ? await db.select().from(reviewResponses)
          .where(inArray(reviewResponses.reviewId, reviewIds))
      : [];

    const responseMap = new Map(responses.map(r => [r.reviewId, r]));

    return reviews.map(r => ({
      ...r,
      response: responseMap.get(r.id),
    }));
  },

  // Complete a review prompt
  async completeReviewPrompt(playerId: string, coachId: string, reviewId: string): Promise<void> {
    await db.update(reviewPrompts)
      .set({ 
        status: "completed", 
        completedAt: new Date(),
        reviewId,
      })
      .where(and(
        eq(reviewPrompts.playerId, playerId),
        eq(reviewPrompts.coachId, coachId),
        eq(reviewPrompts.status, "pending")
      ));
  },

  // Dismiss a review prompt
  async dismissReviewPrompt(promptId: string, playerId: string): Promise<void> {
    await db.update(reviewPrompts)
      .set({ 
        status: "dismissed", 
        dismissedAt: new Date(),
      })
      .where(and(
        eq(reviewPrompts.id, promptId),
        eq(reviewPrompts.playerId, playerId)
      ));
  },

  // Create a review response (coach reply)
  async createReviewResponse(data: { reviewId: string; coachId: string; responseText: string }): Promise<ReviewResponse> {
    const result = await db.insert(reviewResponses).values(data).returning();
    return result[0];
  },

  // Get review response
  async getReviewResponse(reviewId: string): Promise<ReviewResponse | undefined> {
    const result = await db.select()
      .from(reviewResponses)
      .where(eq(reviewResponses.reviewId, reviewId));
    return result[0];
  },

  // Create a review flag
  async createReviewFlag(data: { reviewId: string; flaggedBy: string; reason: string; details?: string | null }): Promise<ReviewFlag> {
    const result = await db.insert(reviewFlags).values(data).returning();
    return result[0];
  },

  // Get review flags for moderation
  async getReviewFlags(status: string = "pending"): Promise<Array<ReviewFlag & { review: CoachReview }>> {
    const flags = await db.select()
      .from(reviewFlags)
      .where(eq(reviewFlags.status, status))
      .orderBy(desc(reviewFlags.createdAt));

    const reviewIds = [...new Set(flags.map(f => f.reviewId))];
    const reviews = reviewIds.length > 0
      ? await db.select().from(coachReviews).where(inArray(coachReviews.id, reviewIds))
      : [];

    const reviewMap = new Map(reviews.map(r => [r.id, r]));

    return flags.map(f => ({
      ...f,
      review: reviewMap.get(f.reviewId)!,
    })).filter(f => f.review);
  },

  // Hide a review
  async hideReview(reviewId: string, hiddenBy: string, reason: string): Promise<void> {
    await db.update(coachReviews)
      .set({ 
        isHidden: true, 
        hiddenBy,
        hiddenReason: reason,
        hiddenAt: new Date(),
      })
      .where(eq(coachReviews.id, reviewId));
  },

  // Unhide a review
  async unhideReview(reviewId: string): Promise<void> {
    await db.update(coachReviews)
      .set({ 
        isHidden: false, 
        hiddenBy: null,
        hiddenReason: null,
        hiddenAt: null,
      })
      .where(eq(coachReviews.id, reviewId));
  },

  // Dismiss review flags
  async dismissReviewFlags(reviewId: string, reviewedBy: string, internalNote?: string): Promise<void> {
    await db.update(reviewFlags)
      .set({ 
        status: "dismissed",
        reviewedBy,
        reviewedAt: new Date(),
        internalNote: internalNote || null,
      })
      .where(and(
        eq(reviewFlags.reviewId, reviewId),
        eq(reviewFlags.status, "pending")
      ));
  },

  // Create a review prompt (called after 3 sessions or package completion)
  async createReviewPrompt(data: {
    playerId: string;
    coachId: string;
    triggerType: string;
    triggerAt: Date;
  }): Promise<ReviewPrompt> {
    // Check if prompt already exists
    const existing = await db.select()
      .from(reviewPrompts)
      .where(and(
        eq(reviewPrompts.playerId, data.playerId),
        eq(reviewPrompts.coachId, data.coachId),
        inArray(reviewPrompts.status, ["pending", "shown"])
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const result = await db.insert(reviewPrompts).values(data).returning();
    return result[0];
  },

  // ==================== COURT BOOKING MARKETPLACE ====================

  // Search courts with filters
  async searchCourts(filters: {
    userId?: string;
    userAcademyId?: string | null;
    date?: string;
    surface?: string;
    visibility?: string;
    minPrice?: number;
    maxPrice?: number;
    location?: string;
    limit: number;
    offset: number;
  }): Promise<Array<Court & { academy?: Academy; location?: Location }>> {
    const conditions = [eq(courts.isActive, true)];

    // Visibility filter: public courts OR user's academy courts
    if (filters.userAcademyId) {
      conditions.push(
        or(
          eq(courts.visibility, "public"),
          and(
            eq(courts.visibility, "academy"),
            eq(courts.academyId, filters.userAcademyId)
          )
        )!
      );
    } else {
      conditions.push(eq(courts.visibility, "public"));
    }

    if (filters.surface) {
      conditions.push(eq(courts.surface, filters.surface));
    }

    if (filters.minPrice !== undefined) {
      conditions.push(gte(courts.pricePerHour, filters.minPrice.toString()));
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(lte(courts.pricePerHour, filters.maxPrice.toString()));
    }

    const result = await db.select()
      .from(courts)
      .leftJoin(academies, eq(courts.academyId, academies.id))
      .leftJoin(locations, eq(courts.locationId, locations.id))
      .where(and(...conditions))
      .limit(filters.limit)
      .offset(filters.offset);

    return result.map(r => ({
      ...r.courts,
      academy: r.academies || undefined,
      location: r.locations || undefined,
    }));
  },

  // Get court with full details
  async getCourtWithDetails(courtId: string, userId?: string, userAcademyId?: string | null): Promise<(Court & { academy?: Academy; location?: Location; canBook: boolean }) | null> {
    const result = await db.select()
      .from(courts)
      .leftJoin(academies, eq(courts.academyId, academies.id))
      .leftJoin(locations, eq(courts.locationId, locations.id))
      .where(eq(courts.id, courtId))
      .limit(1);

    if (result.length === 0) return null;

    const court = result[0];
    const visibilityAllowed = court.courts.visibility === "public" || 
      (court.courts.visibility === "academy" && court.courts.academyId === userAcademyId);
    const canBook = visibilityAllowed && (court.courts.bookingEnabled !== false);

    return {
      ...court.courts,
      academy: court.academies || undefined,
      location: court.locations || undefined,
      canBook,
    };
  },

  // Get court availability for a specific date
  async getCourtAvailability(courtId: string, date: string): Promise<CourtAvailability[]> {
    return db.select()
      .from(courtAvailability)
      .where(and(
        eq(courtAvailability.courtId, courtId),
        eq(courtAvailability.date, date)
      ))
      .orderBy(asc(courtAvailability.startTime));
  },

  // Get court availability for a date range
  async getCourtAvailabilityRange(courtId: string, startDate: string, endDate: string): Promise<CourtAvailability[]> {
    return db.select()
      .from(courtAvailability)
      .where(and(
        eq(courtAvailability.courtId, courtId),
        gte(courtAvailability.date, startDate),
        lte(courtAvailability.date, endDate)
      ))
      .orderBy(asc(courtAvailability.date), asc(courtAvailability.startTime));
  },

  // Check if court is available for a time slot
  async checkCourtAvailability(courtId: string, date: string, startTime: string, endTime: string): Promise<boolean> {
    // Check court_availability for blocked/booked slots
    const blocked = await db.select()
      .from(courtAvailability)
      .where(and(
        eq(courtAvailability.courtId, courtId),
        eq(courtAvailability.date, date),
        ne(courtAvailability.status, "available"),
        or(
          and(lte(courtAvailability.startTime, startTime), gte(courtAvailability.endTime, startTime)),
          and(lte(courtAvailability.startTime, endTime), gte(courtAvailability.endTime, endTime)),
          and(gte(courtAvailability.startTime, startTime), lte(courtAvailability.endTime, endTime))
        )
      ))
      .limit(1);

    if (blocked.length > 0) return false;

    // Check court_bookings for existing bookings
    const existingBooking = await db.select()
      .from(courtBookings)
      .where(and(
        eq(courtBookings.courtId, courtId),
        eq(courtBookings.date, date),
        inArray(courtBookings.status, ["pending", "confirmed"]),
        or(
          and(lte(courtBookings.startTime, startTime), gte(courtBookings.endTime, startTime)),
          and(lte(courtBookings.startTime, endTime), gte(courtBookings.endTime, endTime)),
          and(gte(courtBookings.startTime, startTime), lte(courtBookings.endTime, endTime))
        )
      ))
      .limit(1);

    if (existingBooking.length > 0) return false;

    // Check sessions (tennis lessons) that use this court
    const sessionStartTime = new Date(`${date}T${startTime}:00`);
    const sessionEndTime = new Date(`${date}T${endTime}:00`);
    
    const sessionConflict = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.courtId, courtId),
        inArray(sessions.status, ["scheduled", "in_progress"]),
        or(
          and(lt(sessions.startTime, sessionEndTime), gt(sessions.endTime, sessionStartTime))
        )
      ))
      .limit(1);

    return sessionConflict.length === 0;
  },

  // Get all blocked time slots for a court on a specific date (includes sessions, bookings, and availability blocks)
  async getCourtBlockedSlots(courtId: string, date: string): Promise<Array<{ startTime: string; endTime: string; status: string; reason?: string }>> {
    const blockedSlots: Array<{ startTime: string; endTime: string; status: string; reason?: string }> = [];
    
    // Get court_availability blocks
    const availabilityBlocks = await db.select()
      .from(courtAvailability)
      .where(and(
        eq(courtAvailability.courtId, courtId),
        eq(courtAvailability.date, date),
        ne(courtAvailability.status, "available")
      ));
    
    for (const block of availabilityBlocks) {
      blockedSlots.push({
        startTime: block.startTime,
        endTime: block.endTime,
        status: block.status,
        reason: "blocked"
      });
    }
    
    // Get court bookings
    const bookings = await db.select()
      .from(courtBookings)
      .where(and(
        eq(courtBookings.courtId, courtId),
        eq(courtBookings.date, date),
        inArray(courtBookings.status, ["pending", "confirmed"])
      ));
    
    for (const booking of bookings) {
      blockedSlots.push({
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: "booked",
        reason: "player_booking"
      });
    }
    
    // Get sessions (tennis lessons) that use this court
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    
    const sessionBlocks = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.courtId, courtId),
        inArray(sessions.status, ["scheduled", "in_progress"]),
        gte(sessions.startTime, dayStart),
        lte(sessions.startTime, dayEnd)
      ));
    
    for (const session of sessionBlocks) {
      const sessionStart = new Date(session.startTime);
      const sessionEnd = new Date(session.endTime);
      // Convert to Dubai time (UTC+4) for display
      const DUBAI_OFFSET = 4;
      const dubaiStart = new Date(sessionStart.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const dubaiEnd = new Date(sessionEnd.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      blockedSlots.push({
        startTime: dubaiStart.toISOString().slice(11, 16),
        endTime: dubaiEnd.toISOString().slice(11, 16),
        status: "booked",
        reason: "tennis_lesson"
      });
    }
    
    return blockedSlots;
  },

  // Create a court booking
  async createCourtBooking(data: Omit<InsertCourtBooking, "id" | "createdAt">): Promise<CourtBooking> {
    const result = await db.insert(courtBookings).values({
      ...data,
      confirmedAt: data.status === "confirmed" ? new Date() : null,
    }).returning();
    return result[0];
  },

  // Get a court booking by ID
  async getCourtBooking(bookingId: string): Promise<CourtBooking | undefined> {
    const result = await db.select()
      .from(courtBookings)
      .where(eq(courtBookings.id, bookingId));
    return result[0];
  },

  // Get user's court bookings
  async getUserCourtBookings(userId: string, filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Array<CourtBooking & { court: Court }>> {
    const conditions = [eq(courtBookings.userId, userId)];

    if (filters.status) {
      conditions.push(eq(courtBookings.status, filters.status));
    }
    if (filters.startDate) {
      conditions.push(gte(courtBookings.date, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(courtBookings.date, filters.endDate));
    }

    const result = await db.select()
      .from(courtBookings)
      .leftJoin(courts, eq(courtBookings.courtId, courts.id))
      .where(and(...conditions))
      .orderBy(desc(courtBookings.date), desc(courtBookings.startTime));

    return result.map(r => ({
      ...r.court_bookings,
      court: r.courts!,
    }));
  },

  // Cancel a court booking
  async cancelCourtBooking(bookingId: string, cancelledBy: string, reason?: string): Promise<void> {
    await db.update(courtBookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: reason || null,
      })
      .where(eq(courtBookings.id, bookingId));
  },

  // Update court availability status
  async updateCourtAvailabilityStatus(courtId: string, date: string, startTime: string, endTime: string, status: string): Promise<void> {
    // Check if slot exists
    const existing = await db.select()
      .from(courtAvailability)
      .where(and(
        eq(courtAvailability.courtId, courtId),
        eq(courtAvailability.date, date),
        eq(courtAvailability.startTime, startTime),
        eq(courtAvailability.endTime, endTime)
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(courtAvailability)
        .set({ status })
        .where(eq(courtAvailability.id, existing[0].id));
    } else {
      await db.insert(courtAvailability).values({
        courtId,
        date,
        startTime,
        endTime,
        status,
      });
    }
  },

  // Block a court time slot
  async blockCourtTimeSlot(data: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    blockedReason: string;
    blockedBy?: string;
  }): Promise<void> {
    await db.insert(courtAvailability).values(data);
  },

  // Get academy's court bookings
  async getAcademyCourtBookings(academyId: string, filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
    courtId?: string;
  }): Promise<Array<CourtBooking & { court: Court; user?: User }>> {
    const conditions = [eq(courtBookings.academyId, academyId)];

    if (filters.status) {
      conditions.push(eq(courtBookings.status, filters.status));
    }
    if (filters.startDate) {
      conditions.push(gte(courtBookings.date, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(courtBookings.date, filters.endDate));
    }
    if (filters.courtId) {
      conditions.push(eq(courtBookings.courtId, filters.courtId));
    }

    const result = await db.select()
      .from(courtBookings)
      .leftJoin(courts, eq(courtBookings.courtId, courts.id))
      .leftJoin(users, eq(courtBookings.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(courtBookings.date), desc(courtBookings.startTime));

    return result.map(r => ({
      ...r.court_bookings,
      court: r.courts!,
      user: r.users || undefined,
    }));
  },

  // Approve a court booking
  async approveCourtBooking(bookingId: string): Promise<void> {
    await db.update(courtBookings)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
      })
      .where(eq(courtBookings.id, bookingId));
  },

  // Decline a court booking
  async declineCourtBooking(bookingId: string, reason?: string): Promise<void> {
    await db.update(courtBookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason || "Declined by academy",
      })
      .where(eq(courtBookings.id, bookingId));
  },

  // Update court booking settings
  async updateCourtBookingSettings(courtId: string, settings: {
    visibility?: string;
    pricePerHour?: string;
    peakPricePerHour?: string;
    memberPricePerHour?: string;
    currency?: string;
    maxBookingDurationHours?: number;
    minBookingDurationMinutes?: number;
    cancelWindowHours?: number;
    guestsAllowed?: boolean;
    requiresApproval?: boolean;
    operatingHours?: any;
    xpRewardPerHour?: number;
  }): Promise<Court> {
    const updateData: any = {};
    
    if (settings.visibility !== undefined) updateData.visibility = settings.visibility;
    if (settings.pricePerHour !== undefined) updateData.pricePerHour = settings.pricePerHour;
    if (settings.peakPricePerHour !== undefined) updateData.peakPricePerHour = settings.peakPricePerHour;
    if (settings.memberPricePerHour !== undefined) updateData.memberPricePerHour = settings.memberPricePerHour;
    if (settings.currency !== undefined) updateData.currency = settings.currency;
    if (settings.maxBookingDurationHours !== undefined) updateData.maxBookingDurationHours = settings.maxBookingDurationHours;
    if (settings.minBookingDurationMinutes !== undefined) updateData.minBookingDurationMinutes = settings.minBookingDurationMinutes;
    if (settings.cancelWindowHours !== undefined) updateData.cancelWindowHours = settings.cancelWindowHours;
    if (settings.guestsAllowed !== undefined) updateData.guestsAllowed = settings.guestsAllowed;
    if (settings.requiresApproval !== undefined) updateData.requiresApproval = settings.requiresApproval;
    if (settings.operatingHours !== undefined) updateData.operatingHours = settings.operatingHours;
    if (settings.xpRewardPerHour !== undefined) updateData.xpRewardPerHour = settings.xpRewardPerHour;

    const result = await db.update(courts)
      .set(updateData)
      .where(eq(courts.id, courtId))
      .returning();

    return result[0];
  },

  // ==================== PUBLIC PLAYER PROFILE FUNCTIONS ====================

  // Get all skill domains
  async getSkillDomains(): Promise<SkillDomain[]> {
    return db.select().from(skillDomains).orderBy(skillDomains.sortOrder);
  },

  // Get player match stats
  async getPlayerMatchStats(playerId: string): Promise<{
    totalMatches: number;
    wins: number;
    losses: number;
    sessionsAttended: number;
  }> {
    // Get all completed matches for this player
    const allMatches = await db.select()
      .from(playerMatches)
      .where(and(
        or(
          eq(playerMatches.initiatorId, playerId),
          eq(playerMatches.receiverId, playerId)
        ),
        eq(playerMatches.status, "completed")
      ));

    const totalMatches = allMatches.length;
    
    // Calculate wins/losses based on resultNotes which contains score like "6-3, 6-4"
    // If resultNotes contains "win" or if we can parse the score, determine winner
    // Convention: resultNotes format could be "initiator_win", "receiver_win", or scores
    let wins = 0;
    let losses = 0;
    
    for (const match of allMatches) {
      const isInitiator = match.initiatorId === playerId;
      const resultNotes = match.resultNotes?.toLowerCase() || "";
      
      // Check for explicit win/loss markers
      if (resultNotes.includes("initiator_win") || resultNotes.includes("initiator won")) {
        if (isInitiator) wins++;
        else losses++;
      } else if (resultNotes.includes("receiver_win") || resultNotes.includes("receiver won")) {
        if (!isInitiator) wins++;
        else losses++;
      } else if (match.resultStatus === "played") {
        // If no explicit winner but match was played, count as a completed match
        // For now, assume even split if no winner data (this is realistic for friendly matches)
        // TODO: Add proper win/loss tracking to match schema
      }
    }

    // Count sessions attended (using sessionPlayers for attendance)
    const sessionsResult = await db.select({ count: sql<number>`count(*)` })
      .from(sessionPlayers)
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        eq(sessionPlayers.attendanceStatus, "present")
      ));

    return {
      totalMatches,
      wins,
      losses,
      sessionsAttended: Number(sessionsResult[0]?.count || 0),
    };
  },

  // Get recent matches for a player
  async getPlayerRecentMatches(playerId: string, limit: number = 5): Promise<any[]> {
    const matches = await db.select()
      .from(playerMatches)
      .where(and(
        or(
          eq(playerMatches.initiatorId, playerId),
          eq(playerMatches.receiverId, playerId)
        ),
        eq(playerMatches.status, "completed")
      ))
      .orderBy(desc(playerMatches.proposedDate))
      .limit(limit);

    // Enrich with opponent data
    const enrichedMatches = await Promise.all(matches.map(async (match) => {
      const opponentId = match.initiatorId === playerId ? match.receiverId : match.initiatorId;
      let opponentData = null;
      if (opponentId) {
        const opponent = await db.select().from(players).where(eq(players.id, opponentId));
        opponentData = opponent[0];
      }
      return {
        ...match,
        opponentName: opponentData?.displayName || opponentData?.name || "Unknown",
        opponentPhotoUrl: opponentData?.profilePhotoUrl,
        opponentLevel: opponentData?.level || 1,
        score: match.resultNotes, // Use resultNotes for score display
      };
    }));

    return enrichedMatches;
  },

  // Get upcoming matches for a player
  async getPlayerUpcomingMatches(playerId: string, limit: number = 3): Promise<any[]> {
    const now = new Date();
    const matches = await db.select()
      .from(playerMatches)
      .where(and(
        or(
          eq(playerMatches.initiatorId, playerId),
          eq(playerMatches.receiverId, playerId)
        ),
        eq(playerMatches.status, "accepted"),
        gte(playerMatches.proposedDate, now)
      ))
      .orderBy(playerMatches.proposedDate)
      .limit(limit);

    // Enrich with opponent data
    const enrichedMatches = await Promise.all(matches.map(async (match) => {
      const opponentId = match.initiatorId === playerId ? match.receiverId : match.initiatorId;
      let opponentData = null;
      if (opponentId) {
        const opponent = await db.select().from(players).where(eq(players.id, opponentId));
        opponentData = opponent[0];
      }
      return {
        ...match,
        opponentName: opponentData?.displayName || opponentData?.name || "Unknown",
        opponentPhotoUrl: opponentData?.profilePhotoUrl,
        opponentLevel: opponentData?.level || 1,
      };
    }));

    return enrichedMatches;
  },

  // Get player connections
  async getPlayerConnections(playerId: string): Promise<PlayerConnection[]> {
    return db.select()
      .from(playerConnections)
      .where(or(
        eq(playerConnections.player1Id, playerId),
        eq(playerConnections.player2Id, playerId)
      ))
      .orderBy(desc(playerConnections.lastPlayedAt));
  },

  // Get player weekly ranking (position based on XP)
  async getPlayerWeeklyRanking(playerId: string): Promise<number> {
    const player = await db.select().from(players).where(eq(players.id, playerId));
    if (!player[0]) return 0;

    const playerXp = player[0].totalXp || 0;
    
    // Count how many players have more XP
    const higherRanked = await db.select({ count: sql<number>`count(*)` })
      .from(players)
      .where(gt(players.totalXp, playerXp));

    return Number(higherRanked[0]?.count || 0) + 1;
  },

  // ==================== UNIFIED COACH TIME BLOCKS ====================

  // Check if a coach has a time block conflict across ALL academies
  async checkUnifiedCoachConflict(coachId: string, date: string, startTime: string, endTime: string, excludeSessionId?: string, viewerAcademyId?: string): Promise<{ hasConflict: boolean; isOwnAcademy: boolean; }> {
    // Calculate UTC minutes for precise timezone-safe comparison
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startUtcMins = startHour * 60 + startMin;
    const endUtcMins = endHour * 60 + endMin;
    
    // Use UTC minutes for comparison (with fallback to time extraction for legacy data without UTC columns)
    const result = await db.execute(sql`
      SELECT id, source_academy_id, source_session_id 
      FROM coach_time_blocks 
      WHERE coach_id = ${coachId}
        AND date = ${date}
        AND status = 'confirmed'
        AND (
          COALESCE(start_utc_minutes, EXTRACT(HOUR FROM start_time::time)::int * 60 + EXTRACT(MINUTE FROM start_time::time)::int) < ${endUtcMins}
          AND COALESCE(end_utc_minutes, EXTRACT(HOUR FROM end_time::time)::int * 60 + EXTRACT(MINUTE FROM end_time::time)::int) > ${startUtcMins}
        )
        ${excludeSessionId ? sql`AND (source_session_id IS NULL OR source_session_id != ${excludeSessionId})` : sql``}
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return { hasConflict: false, isOwnAcademy: false };
    }
    
    const conflictingBlock = result.rows[0] as { source_academy_id: string | null };
    const isOwnAcademy = viewerAcademyId ? conflictingBlock.source_academy_id === viewerAcademyId : false;
    
    return { hasConflict: true, isOwnAcademy };
  },

  // Create a time block when a session is booked
  async createCoachTimeBlock(data: {
    coachId: string;
    sourceType: 'session' | 'personal' | 'travel';
    sourceAcademyId?: string;
    sourceSessionId?: string;
    date: string;
    startTime: string;
    endTime: string;
    isPrivate?: boolean;
    blockReason?: string;
  }): Promise<void> {
    // Calculate UTC minutes from HH:MM strings for timezone-safe comparisons
    const [startHour, startMin] = data.startTime.split(':').map(Number);
    const [endHour, endMin] = data.endTime.split(':').map(Number);
    const startUtcMinutes = startHour * 60 + startMin;
    const endUtcMinutes = endHour * 60 + endMin;
    
    await db.execute(sql`
      INSERT INTO coach_time_blocks (id, coach_id, source_type, source_academy_id, source_session_id, date, start_time, end_time, start_utc_minutes, end_utc_minutes, status, is_private, block_reason)
      VALUES (
        gen_random_uuid(),
        ${data.coachId},
        ${data.sourceType},
        ${data.sourceAcademyId || null},
        ${data.sourceSessionId || null},
        ${data.date},
        ${data.startTime},
        ${data.endTime},
        ${startUtcMinutes},
        ${endUtcMinutes},
        'confirmed',
        ${data.isPrivate ?? true},
        ${data.blockReason || null}
      )
    `);
  },

  // Delete a time block when a session is cancelled
  async deleteCoachTimeBlockBySession(sessionId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM coach_time_blocks WHERE source_session_id = ${sessionId}
    `);
  },

  // Get coach's time blocks for a date (shows "Busy" for other academies)
  // Only returns blocks from OTHER academies - own-academy sessions are already in ownSessions
  // For platform owners (no viewerAcademyId), returns ALL blocks with anonymized academy info
  async getCoachTimeBlocksForDate(coachId: string, date: string, viewerAcademyId?: string): Promise<any[]> {
    if (!viewerAcademyId) {
      // Platform owner view - return ALL blocks with anonymized academy info
      const result = await db.execute(sql`
        SELECT 
          id,
          source_type,
          NULL as source_academy_id,
          NULL as source_session_id,
          date,
          start_time,
          end_time,
          status,
          true as is_private,
          true as is_external
        FROM coach_time_blocks 
        WHERE coach_id = ${coachId}
          AND date = ${date}
          AND status = 'confirmed'
        ORDER BY start_time::time
      `);
      return result.rows;
    }
    
    const result = await db.execute(sql`
      SELECT 
        id,
        source_type,
        source_academy_id,
        source_session_id,
        date,
        start_time,
        end_time,
        status,
        is_private,
        true as is_external
      FROM coach_time_blocks 
      WHERE coach_id = ${coachId}
        AND date = ${date}
        AND status = 'confirmed'
        AND (source_academy_id IS NULL OR source_academy_id != ${viewerAcademyId})
      ORDER BY start_time::time
    `);
    return result.rows;
  },

  // Get coach's external time blocks for a date range (for calendar view)
  // Only returns blocks from OTHER academies
  async getCoachExternalBlocksForRange(coachId: string, startDate: Date, endDate: Date, viewerAcademyId: string): Promise<any[]> {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const result = await db.execute(sql`
      SELECT 
        id,
        source_type,
        date,
        start_time,
        end_time
      FROM coach_time_blocks 
      WHERE coach_id = ${coachId}
        AND date >= ${startDateStr}
        AND date <= ${endDateStr}
        AND status = 'confirmed'
        AND (source_academy_id IS NULL OR source_academy_id != ${viewerAcademyId})
      ORDER BY date, start_time::time
    `);
    return result.rows;
  },

  // ==================== 3-LAYER PRICING SYSTEM ====================

  // Academy Pricing (Layer 1) - What players pay
  // Enforces single active version per (academyId, sessionType)
  // Future-dated versions are created as scheduled (isActive=false) and activated lazily
  async createAcademyPricing(data: InsertAcademyPricing): Promise<AcademyPricing> {
    const today = new Date().toISOString().split('T')[0];
    const effectiveFrom = data.effectiveFrom || today;
    const startsToday = effectiveFrom <= today;
    
    // Calculate the day before the new pricing starts
    const dayBefore = new Date(effectiveFrom);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];
    
    // Insert new pricing FIRST to get its ID
    // - If starts today: isActive=true
    // - If starts in future: isActive=false (scheduled, will be activated lazily)
    const result = await db.insert(academyPricing).values({
      ...data,
      effectiveFrom,
      isActive: startsToday,
    }).returning();
    const newRecord = result[0];
    
    if (startsToday) {
      // New version starts today: fully deactivate all existing active versions (except new one)
      await db.update(academyPricing)
        .set({ effectiveUntil: dayBeforeStr, isActive: false, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, data.academyId),
          eq(academyPricing.sessionType, data.sessionType),
          ne(academyPricing.id, newRecord.id),
          eq(academyPricing.isActive, true)
        ));
      
      // Terminate scheduled versions that would start BEFORE this one (superseded)
      // Same-day and future scheduled versions are left intact for later activation
      await db.update(academyPricing)
        .set({ isActive: false, effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, data.academyId),
          eq(academyPricing.sessionType, data.sessionType),
          ne(academyPricing.id, newRecord.id),
          eq(academyPricing.isActive, false),
          lt(academyPricing.effectiveFrom, effectiveFrom),
          isNull(academyPricing.effectiveUntil)
        ));
    } else {
      // New version starts in FUTURE
      // 1. Set effectiveUntil on active version (keep active until end date)
      await db.update(academyPricing)
        .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, data.academyId),
          eq(academyPricing.sessionType, data.sessionType),
          ne(academyPricing.id, newRecord.id),
          eq(academyPricing.isActive, true),
          or(
            isNull(academyPricing.effectiveUntil),
            gte(academyPricing.effectiveUntil, effectiveFrom)
          )
        ));
      
      // 2. Close any existing scheduled versions with earlier/same effectiveFrom (except new one)
      await db.update(academyPricing)
        .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, data.academyId),
          eq(academyPricing.sessionType, data.sessionType),
          ne(academyPricing.id, newRecord.id),
          eq(academyPricing.isActive, false),
          lte(academyPricing.effectiveFrom, effectiveFrom),
          isNull(academyPricing.effectiveUntil)
        ));
    }
    
    return newRecord;
  },
  
  // Lazy activation: Activate scheduled pricing that should now be active
  // Also deactivates any old versions that have expired
  // Ensures exactly one active row per scope
  async activateScheduledPricing(academyId: string, sessionType: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // First: Deactivate any expired active pricing (effectiveUntil < today)
    await db.update(academyPricing)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.sessionType, sessionType),
        eq(academyPricing.isActive, true),
        lt(academyPricing.effectiveUntil, today)
      ));
    
    // Check if there's already an active version
    const currentActive = await db.select().from(academyPricing)
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.sessionType, sessionType),
        eq(academyPricing.isActive, true)
      ))
      .limit(1);
    
    // Find scheduled pricing that should activate today (or was overdue)
    // "Scheduled" means: isActive=false AND effectiveUntil IS NULL
    // Order by effectiveFrom DESC, then createdAt DESC for deterministic tie-breaking
    const toActivate = await db.select().from(academyPricing)
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.sessionType, sessionType),
        eq(academyPricing.isActive, false),
        lte(academyPricing.effectiveFrom, today),
        isNull(academyPricing.effectiveUntil)  // Only truly scheduled, not terminated
      ))
      .orderBy(desc(academyPricing.effectiveFrom), desc(academyPricing.createdAt))
      .limit(1);
    
    if (toActivate.length > 0) {
      const candidate = toActivate[0];
      
      // Skip if current active has same or later effectiveFrom (already newest)
      if (currentActive.length > 0 && currentActive[0].effectiveFrom >= candidate.effectiveFrom) {
        // Just stamp the candidate as closed since it's superseded
        const dayBefore = new Date(currentActive[0].effectiveFrom);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        await db.update(academyPricing)
          .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
          .where(eq(academyPricing.id, candidate.id));
        return;
      }
      
      // Calculate day before new version starts for predecessors
      const dayBefore = new Date(candidate.effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      // Stamp effectiveUntil on ALL predecessors (active or inactive with null/overlapping effectiveUntil)
      await db.update(academyPricing)
        .set({ isActive: false, effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, academyId),
          eq(academyPricing.sessionType, sessionType),
          ne(academyPricing.id, candidate.id),
          lt(academyPricing.effectiveFrom, candidate.effectiveFrom),
          or(
            isNull(academyPricing.effectiveUntil),
            gte(academyPricing.effectiveUntil, candidate.effectiveFrom)
          )
        ));
      
      // Stamp any other scheduled rows with same or earlier effectiveFrom (except candidate)
      await db.update(academyPricing)
        .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, academyId),
          eq(academyPricing.sessionType, sessionType),
          ne(academyPricing.id, candidate.id),
          eq(academyPricing.isActive, false),
          lte(academyPricing.effectiveFrom, candidate.effectiveFrom),
          isNull(academyPricing.effectiveUntil)
        ));
      
      // Activate the newest scheduled version
      await db.update(academyPricing)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(academyPricing.id, candidate.id));
    }
  },

  // Bulk lazy activation for all pricing in an academy
  // Processes each session type individually to ensure single-active-row per scope
  async activateAllScheduledPricing(academyId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // First: Deactivate all expired pricing
    await db.update(academyPricing)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.isActive, true),
        lt(academyPricing.effectiveUntil, today)
      ));
    
    // Get all current active pricing by session type
    const currentActives = await db.select().from(academyPricing)
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.isActive, true)
      ));
    const activeBySessionType = new Map<string, typeof currentActives[0]>();
    for (const active of currentActives) {
      activeBySessionType.set(active.sessionType, active);
    }
    
    // Find all scheduled pricing that should activate today (or was overdue)
    // "Scheduled" means: isActive=false AND effectiveUntil IS NULL
    // Order by effectiveFrom DESC, then createdAt DESC for deterministic tie-breaking
    const toActivate = await db.select().from(academyPricing)
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.isActive, false),
        lte(academyPricing.effectiveFrom, today),
        isNull(academyPricing.effectiveUntil)  // Only truly scheduled, not terminated
      ))
      .orderBy(desc(academyPricing.effectiveFrom), desc(academyPricing.createdAt));
    
    // Group by sessionType and take the newest for each
    const candidatesBySessionType = new Map<string, typeof toActivate[0]>();
    for (const pricing of toActivate) {
      if (!candidatesBySessionType.has(pricing.sessionType)) {
        candidatesBySessionType.set(pricing.sessionType, pricing);
      }
    }
    
    // Process each candidate
    for (const [sessionType, candidate] of candidatesBySessionType) {
      const currentActive = activeBySessionType.get(sessionType);
      
      // Skip if current active has same or later effectiveFrom (already newest)
      if (currentActive && currentActive.effectiveFrom >= candidate.effectiveFrom) {
        // Just stamp the candidate as closed since it's superseded
        const dayBefore = new Date(currentActive.effectiveFrom);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        await db.update(academyPricing)
          .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
          .where(eq(academyPricing.id, candidate.id));
        continue;
      }
      
      // Calculate day before new version starts
      const dayBefore = new Date(candidate.effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      // Stamp effectiveUntil on ALL predecessors (active or inactive with null effectiveUntil)
      await db.update(academyPricing)
        .set({ isActive: false, effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, academyId),
          eq(academyPricing.sessionType, sessionType),
          ne(academyPricing.id, candidate.id),
          lt(academyPricing.effectiveFrom, candidate.effectiveFrom),
          or(
            isNull(academyPricing.effectiveUntil),
            gte(academyPricing.effectiveUntil, candidate.effectiveFrom)
          )
        ));
      
      // Stamp any other scheduled rows with same or earlier effectiveFrom (except candidate)
      await db.update(academyPricing)
        .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(academyPricing.academyId, academyId),
          eq(academyPricing.sessionType, sessionType),
          ne(academyPricing.id, candidate.id),
          eq(academyPricing.isActive, false),
          lte(academyPricing.effectiveFrom, candidate.effectiveFrom),
          isNull(academyPricing.effectiveUntil)
        ));
      
      // Activate the newest
      await db.update(academyPricing)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(academyPricing.id, candidate.id));
    }
  },

  // Get current active pricing for an academy (with lazy activation)
  async getAcademyPricing(academyId: string): Promise<AcademyPricing[]> {
    const today = new Date().toISOString().split('T')[0];
    
    // Lazy activation before listing
    await this.activateAllScheduledPricing(academyId);
    
    return db.select().from(academyPricing)
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.isActive, true),
        lte(academyPricing.effectiveFrom, today),
        or(
          isNull(academyPricing.effectiveUntil),
          gte(academyPricing.effectiveUntil, today)
        )
      ))
      .orderBy(academyPricing.sessionType);
  },

  async getAcademyPricingByType(academyId: string, sessionType: string): Promise<AcademyPricing | null> {
    const today = new Date().toISOString().split('T')[0];
    
    // Lazy activation: activate any scheduled pricing that should now be active
    await this.activateScheduledPricing(academyId, sessionType);
    
    const result = await db.select().from(academyPricing)
      .where(and(
        eq(academyPricing.academyId, academyId),
        eq(academyPricing.sessionType, sessionType),
        eq(academyPricing.isActive, true),
        lte(academyPricing.effectiveFrom, today),
        or(
          isNull(academyPricing.effectiveUntil),
          gte(academyPricing.effectiveUntil, today)
        )
      ))
      .limit(1);
    return result[0] || null;
  },

  async updateAcademyPricing(id: string, data: Partial<InsertAcademyPricing>): Promise<AcademyPricing | null> {
    const result = await db.update(academyPricing)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(academyPricing.id, id))
      .returning();
    return result[0] || null;
  },

  // Soft-delete: set isActive=false and effectiveUntil=today (preserves history)
  async deleteAcademyPricing(id: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await db.update(academyPricing)
      .set({ isActive: false, effectiveUntil: today, updatedAt: new Date() })
      .where(eq(academyPricing.id, id));
  },

  // Coach Contracts (Layer 2) - What coaches earn
  // Enforces single active version per (academyId, coachId)
  // Future-dated versions are created as scheduled and activated lazily
  async createCoachContract(data: InsertCoachContract): Promise<CoachContract> {
    const today = new Date().toISOString().split('T')[0];
    const effectiveFrom = data.effectiveFrom || today;
    const startsToday = effectiveFrom <= today;
    
    // Calculate the day before the new contract starts
    const dayBefore = new Date(effectiveFrom);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];
    
    // Insert new contract FIRST to get its ID
    // - If starts today: status="active"
    // - If starts in future: status="scheduled" (will be activated lazily)
    const result = await db.insert(coachContracts).values({
      ...data,
      effectiveFrom,
      status: startsToday ? "active" : "scheduled",
    }).returning();
    const newRecord = result[0];
    
    if (startsToday) {
      // New version starts today: fully terminate all active contracts (except new one)
      await db.update(coachContracts)
        .set({ effectiveUntil: dayBeforeStr, status: "terminated", updatedAt: new Date() })
        .where(and(
          eq(coachContracts.academyId, data.academyId),
          eq(coachContracts.coachId, data.coachId),
          ne(coachContracts.id, newRecord.id),
          eq(coachContracts.status, "active")
        ));
      
      // Terminate scheduled contracts that would start BEFORE this one (superseded)
      // Same-day and future scheduled contracts are left intact for later activation
      await db.update(coachContracts)
        .set({ status: "terminated", effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(coachContracts.academyId, data.academyId),
          eq(coachContracts.coachId, data.coachId),
          ne(coachContracts.id, newRecord.id),
          eq(coachContracts.status, "scheduled"),
          lt(coachContracts.effectiveFrom, effectiveFrom),
          isNull(coachContracts.effectiveUntil)
        ));
    } else {
      // New version starts in FUTURE
      // 1. Set effectiveUntil on active contract (keep active until end date)
      await db.update(coachContracts)
        .set({ effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(coachContracts.academyId, data.academyId),
          eq(coachContracts.coachId, data.coachId),
          ne(coachContracts.id, newRecord.id),
          eq(coachContracts.status, "active"),
          or(
            isNull(coachContracts.effectiveUntil),
            gte(coachContracts.effectiveUntil, effectiveFrom)
          )
        ));
      
      // 2. Close any existing scheduled contracts with earlier/same effectiveFrom (except new one)
      await db.update(coachContracts)
        .set({ effectiveUntil: dayBeforeStr, status: "terminated", updatedAt: new Date() })
        .where(and(
          eq(coachContracts.academyId, data.academyId),
          eq(coachContracts.coachId, data.coachId),
          ne(coachContracts.id, newRecord.id),
          eq(coachContracts.status, "scheduled"),
          lte(coachContracts.effectiveFrom, effectiveFrom),
          isNull(coachContracts.effectiveUntil)
        ));
    }
    
    return newRecord;
  },
  
  // Lazy activation: Activate scheduled contracts that should now be active
  // Also terminates any old contracts that have expired
  // Ensures exactly one active contract per scope
  async activateScheduledContract(coachId: string, academyId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // First: Terminate any expired active contracts (effectiveUntil < today)
    await db.update(coachContracts)
      .set({ status: "terminated", updatedAt: new Date() })
      .where(and(
        eq(coachContracts.coachId, coachId),
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "active"),
        lt(coachContracts.effectiveUntil, today)
      ));
    
    // Check if there's already an active contract
    const currentActive = await db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.coachId, coachId),
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "active")
      ))
      .limit(1);
    
    // Second: Find scheduled contracts that should activate today
    // Order by effectiveFrom DESC, then createdAt DESC for deterministic tie-breaking
    const toActivate = await db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.coachId, coachId),
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "scheduled"),
        lte(coachContracts.effectiveFrom, today),
        or(
          isNull(coachContracts.effectiveUntil),
          gte(coachContracts.effectiveUntil, today)
        )
      ))
      .orderBy(desc(coachContracts.effectiveFrom), desc(coachContracts.createdAt))
      .limit(1);
    
    if (toActivate.length > 0) {
      const candidate = toActivate[0];
      
      // Skip if current active has same or later effectiveFrom (already newest)
      if (currentActive.length > 0 && currentActive[0].effectiveFrom >= candidate.effectiveFrom) {
        // Just stamp the candidate as closed since it's superseded
        const dayBefore = new Date(currentActive[0].effectiveFrom);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        await db.update(coachContracts)
          .set({ effectiveUntil: dayBeforeStr, status: "terminated", updatedAt: new Date() })
          .where(eq(coachContracts.id, candidate.id));
        return;
      }
      
      // Calculate day before new version starts
      const dayBefore = new Date(candidate.effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      // Stamp effectiveUntil on ALL predecessors (active, terminated, or scheduled with null effectiveUntil)
      await db.update(coachContracts)
        .set({ status: "terminated", effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(coachContracts.coachId, coachId),
          eq(coachContracts.academyId, academyId),
          ne(coachContracts.id, candidate.id),
          lt(coachContracts.effectiveFrom, candidate.effectiveFrom),
          or(
            isNull(coachContracts.effectiveUntil),
            gte(coachContracts.effectiveUntil, candidate.effectiveFrom)
          )
        ));
      
      // Stamp any other scheduled rows with same or earlier effectiveFrom (except candidate)
      await db.update(coachContracts)
        .set({ effectiveUntil: dayBeforeStr, status: "terminated", updatedAt: new Date() })
        .where(and(
          eq(coachContracts.coachId, coachId),
          eq(coachContracts.academyId, academyId),
          ne(coachContracts.id, candidate.id),
          eq(coachContracts.status, "scheduled"),
          lte(coachContracts.effectiveFrom, candidate.effectiveFrom),
          isNull(coachContracts.effectiveUntil)
        ));
      
      // Activate the newest scheduled contract
      await db.update(coachContracts)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(coachContracts.id, candidate.id));
    }
  },

  // Bulk lazy activation for all contracts in an academy
  // Processes each coach individually to ensure single-active-row per scope
  async activateAllScheduledContracts(academyId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // First: Terminate all expired contracts
    await db.update(coachContracts)
      .set({ status: "terminated", updatedAt: new Date() })
      .where(and(
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "active"),
        lt(coachContracts.effectiveUntil, today)
      ));
    
    // Get all current active contracts by coach
    const currentActives = await db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "active")
      ));
    const activeByCoachId = new Map<string, typeof currentActives[0]>();
    for (const active of currentActives) {
      activeByCoachId.set(active.coachId, active);
    }
    
    // Find all scheduled contracts that should activate today
    // Order by effectiveFrom DESC, then createdAt DESC for deterministic tie-breaking
    const toActivate = await db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "scheduled"),
        lte(coachContracts.effectiveFrom, today),
        or(
          isNull(coachContracts.effectiveUntil),
          gte(coachContracts.effectiveUntil, today)
        )
      ))
      .orderBy(desc(coachContracts.effectiveFrom), desc(coachContracts.createdAt));
    
    // Group by coachId and take the newest for each
    const candidatesByCoachId = new Map<string, typeof toActivate[0]>();
    for (const contract of toActivate) {
      if (!candidatesByCoachId.has(contract.coachId)) {
        candidatesByCoachId.set(contract.coachId, contract);
      }
    }
    
    // Process each candidate
    for (const [coachId, candidate] of candidatesByCoachId) {
      const currentActive = activeByCoachId.get(coachId);
      
      // Skip if current active has same or later effectiveFrom (already newest)
      if (currentActive && currentActive.effectiveFrom >= candidate.effectiveFrom) {
        // Just stamp the candidate as closed since it's superseded
        const dayBefore = new Date(currentActive.effectiveFrom);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        await db.update(coachContracts)
          .set({ effectiveUntil: dayBeforeStr, status: "terminated", updatedAt: new Date() })
          .where(eq(coachContracts.id, candidate.id));
        continue;
      }
      
      // Calculate day before new version starts
      const dayBefore = new Date(candidate.effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      // Stamp effectiveUntil on ALL predecessors (active, terminated, or scheduled with null effectiveUntil)
      await db.update(coachContracts)
        .set({ status: "terminated", effectiveUntil: dayBeforeStr, updatedAt: new Date() })
        .where(and(
          eq(coachContracts.academyId, academyId),
          eq(coachContracts.coachId, coachId),
          ne(coachContracts.id, candidate.id),
          lt(coachContracts.effectiveFrom, candidate.effectiveFrom),
          or(
            isNull(coachContracts.effectiveUntil),
            gte(coachContracts.effectiveUntil, candidate.effectiveFrom)
          )
        ));
      
      // Stamp any other scheduled rows with same or earlier effectiveFrom (except candidate)
      await db.update(coachContracts)
        .set({ effectiveUntil: dayBeforeStr, status: "terminated", updatedAt: new Date() })
        .where(and(
          eq(coachContracts.coachId, coachId),
          eq(coachContracts.academyId, academyId),
          ne(coachContracts.id, candidate.id),
          eq(coachContracts.status, "scheduled"),
          lte(coachContracts.effectiveFrom, candidate.effectiveFrom),
          isNull(coachContracts.effectiveUntil)
        ));
      
      // Activate the newest
      await db.update(coachContracts)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(coachContracts.id, candidate.id));
    }
  },

  // Get current active contracts for an academy (with lazy activation)
  async getCoachContracts(academyId: string): Promise<CoachContract[]> {
    const today = new Date().toISOString().split('T')[0];
    
    // Lazy activation before listing
    await this.activateAllScheduledContracts(academyId);
    
    return db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "active"),
        lte(coachContracts.effectiveFrom, today),
        or(
          isNull(coachContracts.effectiveUntil),
          gte(coachContracts.effectiveUntil, today)
        )
      ));
  },

  async getCoachContract(coachId: string, academyId: string): Promise<CoachContract | null> {
    const today = new Date().toISOString().split('T')[0];
    
    // Lazy activation: activate any scheduled contract that should now be active
    await this.activateScheduledContract(coachId, academyId);
    
    const result = await db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.coachId, coachId),
        eq(coachContracts.academyId, academyId),
        eq(coachContracts.status, "active"),
        lte(coachContracts.effectiveFrom, today),
        or(
          isNull(coachContracts.effectiveUntil),
          gte(coachContracts.effectiveUntil, today)
        )
      ))
      .limit(1);
    return result[0] || null;
  },

  async getCoachContractsByCoach(coachId: string): Promise<CoachContract[]> {
    return db.select().from(coachContracts)
      .where(and(
        eq(coachContracts.coachId, coachId),
        eq(coachContracts.status, "active")
      ));
  },

  async updateCoachContract(id: string, data: Partial<InsertCoachContract>): Promise<CoachContract | null> {
    const result = await db.update(coachContracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(coachContracts.id, id))
      .returning();
    return result[0] || null;
  },

  // Soft-delete: set status=terminated and effectiveUntil=today (preserves history)
  async deleteCoachContract(id: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await db.update(coachContracts)
      .set({ status: "terminated", effectiveUntil: today, updatedAt: new Date() })
      .where(eq(coachContracts.id, id));
  },

  // Calculate session pricing (Layer 3) - Snapshot at booking time
  // Throws error if currencies don't match to prevent incorrect margins
  async calculateSessionPricing(academyId: string, coachId: string, sessionType: string, durationMinutes: number): Promise<{
    academyPrice: number;
    coachPayout: number;
    academyMargin: number;
    currency: string;
  }> {
    // Get academy price for this session type
    const pricing = await this.getAcademyPricingByType(academyId, sessionType);
    let academyPrice = 0;
    let academyCurrency = "AED";
    
    if (pricing) {
      academyCurrency = pricing.currency || "AED";
      if (pricing.pricePerHour && durationMinutes) {
        academyPrice = Number(pricing.pricePerHour) * (durationMinutes / 60);
      } else {
        academyPrice = Number(pricing.pricePerSession);
      }
    }
    
    // Get coach contract for this academy
    const contract = await this.getCoachContract(coachId, academyId);
    let coachPayout = 0;
    
    if (contract) {
      const contractCurrency = contract.currency || academyCurrency;
      
      // HARD ENFORCEMENT: Throw error if currencies don't match
      if (contractCurrency !== academyCurrency) {
        throw new Error(`Currency mismatch: Academy pricing in ${academyCurrency}, contract in ${contractCurrency}. Please align currencies before creating sessions.`);
      }
      
      // Check for session-type specific rate first
      if (sessionType === "private" && contract.privateRate) {
        coachPayout = Number(contract.privateRate);
      } else if (sessionType === "semi_private" && contract.semiPrivateRate) {
        coachPayout = Number(contract.semiPrivateRate);
      } else if (sessionType === "group" && contract.groupRate) {
        coachPayout = Number(contract.groupRate);
      } else {
        // Use default rate based on pay type
        switch (contract.payType) {
          case "hourly":
            coachPayout = Number(contract.hourlyRate || 0) * (durationMinutes / 60);
            break;
          case "per_session":
            coachPayout = Number(contract.sessionRate || 0);
            break;
          case "percentage":
            coachPayout = academyPrice * (Number(contract.percentageRate || 0) / 100);
            break;
        }
      }
    }
    
    const academyMargin = academyPrice - coachPayout;
    
    return {
      academyPrice: Math.round(academyPrice * 100) / 100,
      coachPayout: Math.round(coachPayout * 100) / 100,
      academyMargin: Math.round(academyMargin * 100) / 100,
      currency: academyCurrency,
    };
  },

  // ==================== DEEP ASSESSMENT ====================
  async getDeepAssessmentSkills(pillar?: string): Promise<DeepAssessmentSkill[]> {
    if (pillar) {
      return db.select().from(deepAssessmentSkills)
        .where(and(eq(deepAssessmentSkills.pillar, pillar), eq(deepAssessmentSkills.isActive, true)))
        .orderBy(asc(deepAssessmentSkills.category), asc(deepAssessmentSkills.sortOrder));
    }
    return db.select().from(deepAssessmentSkills)
      .where(eq(deepAssessmentSkills.isActive, true))
      .orderBy(asc(deepAssessmentSkills.pillar), asc(deepAssessmentSkills.category), asc(deepAssessmentSkills.sortOrder));
  },

  async getDeepAssessmentSkillsByBallLevel(ballLevel: string): Promise<DeepAssessmentSkill[]> {
    const allSkills = await db.select().from(deepAssessmentSkills)
      .where(eq(deepAssessmentSkills.isActive, true))
      .orderBy(asc(deepAssessmentSkills.pillar), asc(deepAssessmentSkills.category), asc(deepAssessmentSkills.sortOrder));
    
    return allSkills.filter(skill => {
      const levels = skill.applicableBallLevels as string[] || [];
      return levels.includes(ballLevel);
    });
  },

  async getPlayerDeepAssessments(playerId: string): Promise<PlayerDeepAssessment[]> {
    return db.select().from(playerDeepAssessments)
      .where(eq(playerDeepAssessments.playerId, playerId))
      .orderBy(desc(playerDeepAssessments.updatedAt));
  },

  async getPlayerDeepAssessmentBySkill(playerId: string, skillId: string): Promise<PlayerDeepAssessment | undefined> {
    const result = await db.select().from(playerDeepAssessments)
      .where(and(eq(playerDeepAssessments.playerId, playerId), eq(playerDeepAssessments.skillId, skillId)));
    return result[0];
  },

  async upsertPlayerDeepAssessment(data: InsertPlayerDeepAssessment): Promise<PlayerDeepAssessment> {
    const existing = await this.getPlayerDeepAssessmentBySkill(data.playerId, data.skillId);
    
    if (existing) {
      const result = await db.update(playerDeepAssessments).set({
        score: data.score,
        confidence: data.confidence || "medium",
        notes: data.notes,
        evidenceUrl: data.evidenceUrl,
        coachId: data.coachId,
        sessionId: data.sessionId,
        previousScore: existing.score,
        assessmentCount: (existing.assessmentCount || 0) + 1,
        updatedAt: new Date(),
      }).where(eq(playerDeepAssessments.id, existing.id)).returning();
      return result[0];
    } else {
      const result = await db.insert(playerDeepAssessments).values({
        ...data,
        assessmentCount: 1,
      }).returning();
      return result[0];
    }
  },

  async getPlayerDeepAssessmentSummary(playerId: string): Promise<{
    pillar: string;
    totalSkills: number;
    assessedSkills: number;
    averageScore: number | null;
    percentComplete: number;
  }[]> {
    const allSkills = await this.getDeepAssessmentSkills();
    const playerAssessments = await this.getPlayerDeepAssessments(playerId);
    
    const assessmentMap = new Map(playerAssessments.map(a => [a.skillId, a]));
    const pillarStats: Record<string, { total: number; assessed: number; scoreSum: number; scoredCount: number }> = {};
    
    for (const skill of allSkills) {
      if (!pillarStats[skill.pillar]) {
        pillarStats[skill.pillar] = { total: 0, assessed: 0, scoreSum: 0, scoredCount: 0 };
      }
      pillarStats[skill.pillar].total++;
      
      const assessment = assessmentMap.get(skill.id);
      if (assessment && assessment.score !== null) {
        pillarStats[skill.pillar].assessed++;
        pillarStats[skill.pillar].scoreSum += assessment.score;
        pillarStats[skill.pillar].scoredCount++;
      }
    }
    
    return Object.entries(pillarStats).map(([pillar, stats]) => ({
      pillar,
      totalSkills: stats.total,
      assessedSkills: stats.assessed,
      averageScore: stats.scoredCount > 0 ? Math.round((stats.scoreSum / stats.scoredCount) * 100) / 100 : null,
      percentComplete: Math.round((stats.assessed / stats.total) * 100),
    }));
  },

  // Auto-assign coach to player based on session attendance
  // If player has no assigned coach, assigns the coach from the session they attended
  async autoAssignCoachFromSession(playerId: string, sessionId: string): Promise<{ assigned: boolean; coachId?: string }> {
    try {
      // Get the player to check if they already have a coach assigned
      const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
      if (!player.length) {
        return { assigned: false };
      }
      
      // If player already has a coach, do not override
      if (player[0].coachId) {
        return { assigned: false };
      }
      
      // Get the session to find the coach
      const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session.length || !session[0].coachId) {
        // Try to get coach from the series
        if (session[0]?.seriesId) {
          const series = await db.select().from(coachingSeries).where(eq(coachingSeries.id, session[0].seriesId)).limit(1);
          if (series.length && series[0].coachId) {
            await db.update(players).set({ coachId: series[0].coachId }).where(eq(players.id, playerId));
            console.log(`[AutoAssign] Assigned coach ${series[0].coachId} to player ${playerId} from series ${series[0].id}`);
            return { assigned: true, coachId: series[0].coachId };
          }
        }
        return { assigned: false };
      }
      
      // Assign the sessions coach to the player
      await db.update(players).set({ coachId: session[0].coachId }).where(eq(players.id, playerId));
      console.log(`[AutoAssign] Assigned coach ${session[0].coachId} to player ${playerId} from session ${sessionId}`);
      return { assigned: true, coachId: session[0].coachId };
    } catch (error) {
      console.error(`[AutoAssign] Error assigning coach to player ${playerId}:`, error);
      return { assigned: false };
    }
  },

  // REPAIR JOB: Fix credit data for a player
  // This repairs:
  // 1. packages.remainingCredits based on actual debit transactions
  // 2. Marks debts with packageId as settled via metadata (but keeps packageId for legacy)
  // 3. Fixes session_players.creditDeductedAt where transactions exist
  async repairPlayerCredits(playerId: string): Promise<{
    success: boolean;
    packagesRepaired: number;
    debtsMarkedSettled: number;
    sessionPlayersFixed: number;
    details: string[];
  }> {
    const details: string[] = [];
    let packagesRepaired = 0;
    let debtsMarkedSettled = 0;
    let sessionPlayersFixed = 0;
    
    try {
      // Step 1: Get all packages for this player
      const playerPackages = await db.select().from(packages).where(eq(packages.playerId, playerId));
      
      for (const pkg of playerPackages) {
        const debits = await db.select({
          amount: creditTransactions.amount,
          reason: creditTransactions.reason,
          metadata: creditTransactions.metadata,
        }).from(creditTransactions)
          .where(and(
            eq(creditTransactions.packageId, pkg.id),
            eq(creditTransactions.playerId, playerId)
          ));
        
        let totalDebited = 0;
        for (const d of debits) {
          const meta = d.metadata as { cancelled?: boolean; expired?: boolean } | null;
          if (meta?.cancelled === true || meta?.expired === true) continue;
          if (Number(d.amount) < 0) {
            totalDebited += Math.abs(Number(d.amount));
          }
        }
        const correctRemaining = Number(pkg.totalCredits) - totalDebited;
        
        // Only decrease remaining_credits (ghost credit correction), never increase it.
        // Increasing would create phantom credits when there are unlinked debits
        // (e.g. legacy session_booking transactions with no packageId).
        // Inflation is handled by reconcilePackageCredits which accounts for all debit types.
        if (correctRemaining < Number(pkg.remainingCredits)) {
          details.push(`Package ${pkg.id}: ${pkg.remainingCredits} -> ${correctRemaining} (debited ${totalDebited} of ${pkg.totalCredits})`);
          await db.update(packages).set({
            remainingCredits: correctRemaining,
            status: correctRemaining <= 0 ? "depleted" : "active",
          }).where(eq(packages.id, pkg.id));
          packagesRepaired++;
        }
      }
      
      // Step 2: Mark debts that have packageId as settled (legacy fix)
      const debtsWithPackageId = await db.select().from(creditTransactions)
        .where(and(
          eq(creditTransactions.playerId, playerId),
          or(
          eq(creditTransactions.reason, "session_join_debt"),
          eq(creditTransactions.reason, "session_debt")
        ),
          isNotNull(creditTransactions.packageId)
        ));
      
      for (const debt of debtsWithPackageId) {
        const meta = (debt.metadata as Record<string, unknown>) || {};
        if (!meta.settled) {
          await db.update(creditTransactions).set({
            packageId: null, // Clear packageId - debts should never have it
            metadata: {
              ...meta,
              settled: true,
              settledAt: new Date().toISOString(),
              legacyRepair: true,
              originalPackageId: debt.packageId,
            },
          }).where(eq(creditTransactions.id, debt.id));
          debtsMarkedSettled++;
          details.push(`Debt ${debt.id}: marked as settled, cleared packageId`);
        }
      }
      
      // Step 3: Fix session_players.creditDeductedAt where debit transactions exist but creditDeductedAt is null
      const sessionsWithDebits = await db.select({
        sessionId: creditTransactions.sessionId,
        transactionId: creditTransactions.id,
      }).from(creditTransactions)
        .where(and(
          eq(creditTransactions.playerId, playerId),
          eq(creditTransactions.type, "debit"),
          isNotNull(creditTransactions.sessionId),
          inArray(creditTransactions.reason, ["session_join", "retrospective_settlement"])
        ));
      
      for (const item of sessionsWithDebits) {
        if (!item.sessionId) continue;
        
        const sp = await db.select().from(sessionPlayers)
          .where(and(
            eq(sessionPlayers.sessionId, item.sessionId),
            eq(sessionPlayers.playerId, playerId),
            isNull(sessionPlayers.creditDeductedAt)
          ));
        
        if (sp.length > 0) {
          await db.update(sessionPlayers).set({
            creditDeductedAt: new Date(),
            creditTransactionId: item.transactionId,
          }).where(eq(sessionPlayers.id, sp[0].id));
          sessionPlayersFixed++;
          details.push(`SessionPlayer ${sp[0].id}: set creditDeductedAt`);
        }
      }
      
      // Step 4: Reconcile package remainingCredits with actual transaction-based balance
      // This catches unlinked debts (session_debt with no packageId) that the per-package repair misses
      const balanceByType = await storage.getPlayerCreditBalanceByType(playerId);
      const updatedPackages = await db.select().from(packages).where(eq(packages.playerId, playerId));
      
      const remainingByType: Record<string, number> = { group: 0, semi_private: 0, private: 0 };
      for (const pkg of updatedPackages) {
        const ct = (pkg.creditType || "group") as string;
        remainingByType[ct] = (remainingByType[ct] || 0) + Number(pkg.remainingCredits);
      }
      
      for (const creditType of ["group", "semi_private", "private"] as const) {
        const txBalance = Math.max(0, balanceByType[creditType]);
        const pkgRemaining = remainingByType[creditType] || 0;
        
        if (pkgRemaining > txBalance) {
          const excess = pkgRemaining - txBalance;
          const activeOfType = updatedPackages
            .filter(p => (p.creditType || "group") === creditType && Number(p.remainingCredits) > 0)
            .sort((a, b) => Number(a.remainingCredits) - Number(b.remainingCredits));
          
          let toReduce = excess;
          for (const pkg of activeOfType) {
            if (toReduce <= 0) break;
            const currentRemaining = Number(pkg.remainingCredits);
            const reduction = Math.min(toReduce, currentRemaining);
            const newRemaining = currentRemaining - reduction;
            
            await db.update(packages).set({
              remainingCredits: newRemaining,
              status: newRemaining <= 0 ? "depleted" : "active",
            }).where(eq(packages.id, pkg.id));
            
            details.push(`Package ${pkg.id} (${creditType}): reconciled ${currentRemaining} -> ${newRemaining} (unlinked debts: ${reduction})`);
            packagesRepaired++;
            toReduce -= reduction;
          }
        }
      }
      
      // Step 5: Backfill — convert session_booking/session_consumed transactions linked to
      // non-active (depleted) packages into session_debt records so they surface as debt.
      // This fixes existing players like Alex whose sessions became invisible after their
      // package was exhausted without being explicitly deleted.
      const nonActivePlayerPackages = await db.select({ id: packages.id, creditType: packages.creditType })
        .from(packages)
        .where(and(
          eq(packages.playerId, playerId),
          ne(packages.status, "active"),
        ));

      for (const pkg of nonActivePlayerPackages) {
        try {
          const { converted } = await storage.convertPackageConsumptionToDebt(pkg.id, playerId);
          if (converted > 0) {
            details.push(`Package ${pkg.id} (${pkg.creditType}): backfilled ${converted} depleted session(s) as debt`);
          }
        } catch (err) {
          details.push(`Package ${pkg.id}: backfill failed — ${err}`);
        }
      }

      console.log(`[RepairCredits] Player ${playerId}: ${packagesRepaired} packages, ${debtsMarkedSettled} debts, ${sessionPlayersFixed} session_players`);
      
      return {
        success: true,
        packagesRepaired,
        debtsMarkedSettled,
        sessionPlayersFixed,
        details,
      };
    } catch (error) {
      console.error(`[RepairCredits] Error repairing player ${playerId}:`, error);
      return {
        success: false,
        packagesRepaired,
        debtsMarkedSettled,
        sessionPlayersFixed,
        details: [...details, `Error: ${error}`],
      };
    }
  },
};

// Dynamic session type conversion based on player count
// 1 player = private, 2 players = semi_private, 3+ players = group
function getSessionTypeByPlayerCount(playerCount: number): "private" | "semi_private" | "group" {
  if (playerCount <= 1) return "private";
  if (playerCount === 2) return "semi_private";
  return "group";
}

// Update series and all its future sessions to a new session type
// Returns info about the type change and any credit adjustments needed
async function updateSeriesSessionType(
  seriesId: string, 
  newSessionType: "private" | "semi_private" | "group"
): Promise<{ 
  previousType: string; 
  newType: string; 
  sessionsUpdated: number;
}> {
  // Get current series
  const [series] = await db.select().from(coachingSeries).where(eq(coachingSeries.id, seriesId));
  if (!series) {
    throw new Error("Series not found");
  }
  
  const previousType = series.sessionType || "group";
  
  // Update the series itself
  await db.update(coachingSeries).set({ 
    sessionType: newSessionType,
    maxPlayers: newSessionType === "private" ? 1 : newSessionType === "semi_private" ? 2 : (series.maxPlayers && series.maxPlayers > 2 ? series.maxPlayers : 6),
  }).where(eq(coachingSeries.id, seriesId));
  
  // Update all future sessions in this series
  const now = new Date();
  const result = await db.update(sessions).set({
    sessionType: newSessionType,
    maxPlayers: newSessionType === "private" ? 1 : newSessionType === "semi_private" ? 2 : 6,
  }).where(
    and(
      eq(sessions.seriesId, seriesId),
      gt(sessions.startTime, now)
    )
  );
  
  console.log(`[SessionTypeConversion] Series ${seriesId}: ${previousType} -> ${newSessionType}`);
  
  return {
    previousType,
    newType: newSessionType,
    sessionsUpdated: 0, // We can't easily get row count from drizzle update
  };
}

// Recalculate credits when session type changes
// For each player in the series: refund old credit type, charge new credit type for future sessions
async function recalculateSeriesCredits(
  seriesId: string,
  oldSessionType: string,
  newSessionType: string,
  academyId: string
): Promise<{ playersAffected: number; creditsAdjusted: number }> {
  if (oldSessionType === newSessionType) {
    return { playersAffected: 0, creditsAdjusted: 0 };
  }
  
  // Get all active players in the series
  const seriesPlayersList = await db.select().from(seriesPlayers)
    .where(and(
      eq(seriesPlayers.seriesId, seriesId),
      eq(seriesPlayers.status, "active")
    ));
  
  // Get count of future sessions
  const now = new Date();
  const futureSessions = await db.select().from(sessions)
    .where(and(
      eq(sessions.seriesId, seriesId),
      gt(sessions.startTime, now)
    ));
  const futureSessionCount = futureSessions.length;
  
  if (futureSessionCount === 0) {
    return { playersAffected: 0, creditsAdjusted: 0 };
  }
  
  let totalCreditsAdjusted = 0;
  
  for (const sp of seriesPlayersList) {
    // For each player, we need to adjust their credits
    // Old type credits are refunded (per future session), new type credits are charged
    // This is a zero-sum operation within the player's account
    
    // Create a credit adjustment transaction (informational)
    await storage.createCreditTransaction({
      playerId: sp.playerId,
      academyId,
      type: "credit",
      amount: 0, // Net zero - this is informational
      reason: "session_type_change",
      metadata: JSON.stringify({
        seriesId,
        oldSessionType,
        newSessionType,
        futureSessionCount,
        note: `Session type changed from ${oldSessionType} to ${newSessionType}. Credit requirements updated.`,
      }),
    });
    
    totalCreditsAdjusted++;
  }
  
  console.log(`[CreditRecalc] Series ${seriesId}: ${seriesPlayersList.length} players notified of type change (${oldSessionType} -> ${newSessionType})`);
  
  return {
    playersAffected: seriesPlayersList.length,
    creditsAdjusted: totalCreditsAdjusted,
  };
}

/**
 * BULLETPROOF CREDIT PROCESSING - Single Entrypoint
 * 
 * All attendance flows MUST call this function to process credits.
 * This ensures:
 * 1. FOR UPDATE lock prevents race conditions
 * 2. Double idempotency check (creditDeductedAt + creditTransactionId)
 * 3. Unique constraint on session_player_id in credit_transactions
 * 4. Either consumes credit OR creates debt - never both
 * 
 * @param sessionPlayerId - The specific session_player record to process
 * @returns Result with success status and details
 */
/**
 * Per-session-type credit-charging policy (Task #624).
 *
 * Used by both `ensureCreditProcessed` (live charging) and
 * `fullCreditRebuildForAcademy` (re-derives charges from attendance history)
 * so that the rules stay in lock-step.
 *
 * | session_type        | present/late | absent                                   |
 * |---------------------|--------------|------------------------------------------|
 * | group               | charge       | charge   (lesson ran)                    |
 * | semi_private        | charge       | NOT charged  (other player → private_adj)|
 * | private             | charge       | charge   (no-show = late cancel)         |
 * | private_adjusted    | charge       | depends on isOriginallyPrivate:          |
 * |                     |              |   true  → charge (genuine private)       |
 * |                     |              |   false → NOT charged (came from semi)   |
 *
 * Early cancels (≥24h) DELETE the session_player row entirely
 * (server/routes/player-booking.ts:1734) so they cannot reach this function.
 * If a session_player row exists with attendance_status='absent', the player
 * either did not cancel at all (no-show) or cancelled <24h before — both are
 * "late cancels" and credit must be retained per the academy policy.
 */
export function shouldChargeCredit(args: {
  sessionType: string | null | undefined;
  attendanceStatus: string | null | undefined;
  isOriginallyPrivate: boolean;
}): boolean {
  const status = (args.attendanceStatus || "").toLowerCase();
  if (status === "present" || status === "late") return true;
  if (status !== "absent") return false;

  const st = (args.sessionType || "")
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/ /g, "_");

  if (st === "group" || st === "group_adjusted") return true;
  if (st === "semi" || st === "semi_private" || st === "semi_private_adjusted") return false;
  if (st === "private") return true;
  if (st === "private_adjusted") return args.isOriginallyPrivate;

  // Unknown type defaults to safe behaviour: treat as group (charge absent).
  // This matches normalizeSessionTypeToCreditType which defaults to "group".
  return true;
}

async function ensureCreditProcessed(sessionPlayerId: string): Promise<{
  success: boolean;
  action: "consumed" | "debt_created" | "already_processed" | "not_attended" | "error";
  transactionId?: string;
  packageId?: string;
  creditType?: string;
  error?: string;
}> {
  try {
    // Phase 3 — Task #651. If this academy has been switched to the new
    // Credit Engine V2, route the consume through the engine and freeze
    // the legacy package/credit_transactions write-path entirely. The
    // engine handles attendance + chargeability internally and is
    // idempotent on `consume:<sessionPlayerId>`.
    const acadLookup = await db.execute(sql`
      SELECT s.academy_id
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.id = ${sessionPlayerId}
      LIMIT 1
    `);
    const acadRow = acadLookup.rows[0] as { academy_id: string | null } | undefined;
    const academyIdForGate = acadRow?.academy_id ?? null;

    if (academyIdForGate) {
      const { isV2EnabledForAcademy } = await import("./services/credit-feature-flag");
      const v2 = await isV2EnabledForAcademy(academyIdForGate);
      if (v2) {
        const { consumeCredit } = await import("./services/credit-engine");
        try {
          const v2Result = await consumeCredit({
            sessionPlayerId,
            actorRole: "system",
          });
          if (v2Result.alreadyApplied) {
            return { success: true, action: "already_processed" as const };
          }
          if (!v2Result.charged) {
            return { success: true, action: "not_attended" as const };
          }
          // V2 always charges from lots first; if the balance went negative
          // we surface that as `debt_created` to keep the legacy contract
          // for downstream callers (auto-attendance summaries, etc.).
          const action = v2Result.newBalance !== null && v2Result.newBalance < 0
            ? "debt_created" as const
            : "consumed" as const;
          return {
            success: true,
            action,
            creditType: v2Result.type ?? undefined,
          };
        } catch (v2Err: any) {
          console.error(`[EnsureCredit][V2] consume failed for ${sessionPlayerId}:`, v2Err);
          return { success: false, action: "error" as const, error: v2Err?.message ?? String(v2Err) };
        }
      }
    }

    const txResult = await db.transaction(async (tx) => {
      // STEP 1: Lock the session_player row with FOR UPDATE
      const spResult = await tx.execute(sql`
        SELECT 
          sp.id, sp.session_id, sp.player_id, sp.attendance_status, 
          sp.credit_deducted_at, sp.credit_transaction_id,
          s.session_type, s.series_id, s.academy_id, s.duration
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id
        WHERE sp.id = ${sessionPlayerId}
        FOR UPDATE OF sp
      `);
      
      if (spResult.rows.length === 0) {
        return { success: false, action: "error" as const, error: "Session player not found" };
      }
      
      const sp = spResult.rows[0] as any;
      
      // STEP 2: Check attendance status
      // For PRIVATE sessions (originally booked as private): absent = still charged (coach was there)
      // For SEMI-PRIVATE sessions: absent = NOT charged (only the present player gets charged as private)
      // For GROUP sessions: absent = still charged (lesson happened regardless)
      const attendanceStatus = sp.attendance_status?.toLowerCase();
      const sessionType = (sp.session_type || "group").toLowerCase();
      
      // CRITICAL: Check if this session was originally semi_private by looking at the series
      // When a semi-private has 1 absent player, session gets adjusted to private_adjusted
      // But the absent player should NOT be charged - only truly private sessions charge absent
      let isOriginallyPrivate = sessionType === "private";
      if (sessionType === "private_adjusted" && sp.series_id) {
        const seriesResult = await tx.execute(sql`
          SELECT session_type FROM coaching_series WHERE id = ${sp.series_id} LIMIT 1
        `);
        const seriesType = (seriesResult.rows[0] as any)?.session_type;
        if (seriesType === "semi_private") {
          isOriginallyPrivate = false;
        } else {
          isOriginallyPrivate = true;
        }
      } else if (sessionType === "private_adjusted") {
        const playerCountResult = await tx.execute(sql`
          SELECT COUNT(*) as count FROM session_players WHERE session_id = ${sp.session_id}
        `);
        const playerCount = parseInt((playerCountResult.rows[0] as any)?.count || '1');
        isOriginallyPrivate = playerCount <= 1;
      }
      
      // Charge rules by session type (Task #624 — see shouldChargeCredit below):
      //   GROUP:        present/late/absent → CHARGED (lesson ran regardless)
      //   SEMI-PRIVATE: present/late only   → CHARGED (the other player is auto-converted
      //                                       to private_adjusted so the absent player
      //                                       MUST NOT be charged again)
      //   PRIVATE:      present/late + absent → CHARGED (no-show = late cancel; an early
      //                                       cancel would have removed the session_player
      //                                       row entirely via /api/sessions/:id/cancel)
      //   PRIVATE_ADJUSTED that came from a SEMI_PRIVATE series: treated as semi-private
      //   for the absent player (isOriginallyPrivate=false ⇒ absent NOT charged).
      const isChargeable = shouldChargeCredit({
        sessionType,
        attendanceStatus: attendanceStatus || null,
        isOriginallyPrivate,
      });

      if (!isChargeable) {
        return { success: true, action: "not_attended" as const };
      }
      
      // STEP 3: Check for existing debit transaction for this player+session
      // This runs BEFORE the credit_deducted_at check because old-style session_booking
      // transactions never set credit_deducted_at/credit_transaction_id on session_players.
      // Detecting them here prevents double-charging and normalizes session_player state.
      const existingDebitResult = await tx.execute(sql`
        SELECT id FROM credit_transactions
        WHERE player_id = ${sp.player_id}
          AND session_id = ${sp.session_id}
          AND amount < 0
          AND (metadata->>'cancelled')::text IS DISTINCT FROM 'true'
        LIMIT 1
      `);
      if (existingDebitResult.rows.length > 0) {
        const existingTxId = (existingDebitResult.rows[0] as any).id;
        console.log(`[EnsureCredit] Session player ${sessionPlayerId} already has debit tx ${existingTxId} — marking processed`);
        await tx.execute(sql`
          UPDATE session_players 
          SET credit_deducted_at = COALESCE(credit_deducted_at, NOW()),
              credit_transaction_id = COALESCE(credit_transaction_id, ${existingTxId})
          WHERE id = ${sessionPlayerId}
        `);
        return { 
          success: true, 
          action: "already_processed" as const, 
          transactionId: existingTxId 
        };
      }
      
      // STEP 3b: NOTE — we used to short-circuit "already_processed" here whenever both
      // credit_deducted_at AND credit_transaction_id were set. That was wrong: if the
      // linked transaction was later cancelled (e.g. package deleted, debt reset script),
      // STEP 3 above already proved no LIVE debit exists, so we MUST fall through and
      // charge again. The early return caused Task #636 (Alex −17 → −18) by silently
      // refusing to recharge cancelled-debit rows. Falling through is safe: STEP 5 below
      // is itself idempotent (it checks for an existing live debit inside the per-package
      // transaction before consuming).
      if (sp.credit_deducted_at) {
        console.log(`[EnsureCredit] Session player ${sessionPlayerId} has credit_deducted_at but no live debit — retrying charge (linked tx may be cancelled or NULL)`);
      }
      
      // STEP 4: Determine credit type needed (sessionType already defined in step 2)
      const normalizeType = (type: string): string => {
        const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
        if (normalized === "semi" || normalized === "semi_private" || normalized === "semi_private_adjusted") return "semi_private";
        if (normalized === "private" || normalized === "private_adjusted") return "private";
        return "group";
      };
      const requiredCreditType = normalizeType(sessionType);
      const playerId = sp.player_id;
      const sessionId = sp.session_id;
      const academyId = sp.academy_id;
      const seriesId = sp.series_id;
      const creditCost = ((sp as any).duration || 60) / 60;
      
      // STEP 4b: Check idempotency for corporate debit — if already debited for this session_player, skip
      const existingCorpDebitResult = await tx.execute(sql`
        SELECT id FROM corporate_credit_transactions
        WHERE session_player_id = ${sessionPlayerId}
        LIMIT 1
      `);
      if (existingCorpDebitResult.rows.length > 0) {
        const existingCorpTxId = (existingCorpDebitResult.rows[0] as any).id;
        console.log(`[EnsureCredit] Corporate debit already exists for session_player ${sessionPlayerId} — marking processed`);
        await tx.execute(sql`
          UPDATE session_players 
          SET credit_deducted_at = COALESCE(credit_deducted_at, NOW()),
              credit_transaction_id = COALESCE(credit_transaction_id, ${existingCorpTxId})
          WHERE id = ${sessionPlayerId}
        `);
        return { success: true, action: "already_processed" as const, transactionId: existingCorpTxId };
      }

      // Check if player has an active corporate membership with sufficient credits
      // Corporate credits are used BEFORE personal package credits.
      // IMPORTANT: constrain by academyId to enforce tenant isolation (no cross-academy credit usage).
      const corpMemberResult = await tx.execute(sql`
        SELECT cm.id as member_id, ca.id as account_id, ca.credit_balance, ca.academy_id as corp_academy_id
        FROM corporate_members cm
        JOIN corporate_accounts ca ON ca.id = cm.corporate_account_id
        WHERE cm.player_id = ${playerId}
          AND cm.invite_status = 'accepted'
          AND ca.is_active = true
          AND ca.academy_id = ${academyId}
          AND ca.credit_balance >= ${creditCost}
        LIMIT 1
        FOR UPDATE OF ca
      `);

      // BULLETPROOF: Use eventKey for unique constraint
      const consumeEventKey = `consume:${sessionPlayerId}`;
      const debtEventKey = `debt:${sessionPlayerId}`;

      if (corpMemberResult.rows.length > 0) {
        // Use corporate credits first
        // Corporate credits are whole integers; round up to nearest whole credit
        const corpCreditCost = Math.max(1, Math.round(creditCost));
        const corpRow = corpMemberResult.rows[0] as any;
        const corpBalanceBefore = Number(corpRow.credit_balance);
        const corpBalanceAfter = corpBalanceBefore - corpCreditCost;

        // Re-check if we still have enough after rounding up
        if (corpBalanceAfter < 0) {
          // Not enough corporate credits after rounding — fall through to personal credits
        } else {
        const corpTxId = crypto.randomUUID();

        try {
          await tx.execute(sql`
            INSERT INTO corporate_credit_transactions (
              id, corporate_account_id, academy_id, player_id, session_id, session_player_id,
              type, amount, balance_before, balance_after, reason, notes
            )
            VALUES (
              ${corpTxId}, ${corpRow.account_id}, ${academyId}, ${playerId}, ${sessionId}, ${sessionPlayerId},
              'debit', ${-corpCreditCost}, ${corpBalanceBefore}, ${corpBalanceAfter},
              'session_debit', ${`Credit used for ${sessionType} session`}
            )
          `);
        } catch (corpInsertErr: any) {
          if (corpInsertErr.code === '23505') {
            // Duplicate insert — already processed by concurrent request
            console.log(`[EnsureCredit] Duplicate corporate debit detected for session_player ${sessionPlayerId}`);
            return { success: true, action: "already_processed" as const };
          }
          throw corpInsertErr;
        }

        // Decrement corporate account balance
        await tx.execute(sql`
          UPDATE corporate_accounts SET credit_balance = ${corpBalanceAfter}, updated_at = NOW()
          WHERE id = ${corpRow.account_id}
        `);

        // Update session_player — use the corporate tx id so idempotency checks work
        await tx.execute(sql`
          UPDATE session_players 
          SET credit_deducted_at = NOW(),
              credit_transaction_id = ${corpTxId}
          WHERE id = ${sessionPlayerId}
        `);

        console.log(`[EnsureCredit] Corporate credit used: ${corpCreditCost} from account ${corpRow.account_id} for session_player ${sessionPlayerId}`);
        return {
          success: true,
          action: "consumed" as const,
          transactionId: corpTxId,
          creditType: requiredCreditType,
        };
        } // end else (corpBalanceAfter >= 0)
      } // end if (corpMemberResult.rows.length > 0)

      // STEP 5: No (usable) corporate credits — find a personal package with matching credits
      const packageResult = await tx.execute(sql`
        SELECT id, remaining_credits, credit_type, academy_id
        FROM packages 
        WHERE player_id = ${playerId} 
          AND status = 'active' 
          AND remaining_credits >= ${creditCost}
          AND (credit_type = ${requiredCreditType} OR credit_type IS NULL)
        ORDER BY expiry_date ASC NULLS LAST
        FOR UPDATE
        LIMIT 1
      `);
      
      if (packageResult.rows.length === 0) {
        // STEP 6A: No credits available - create debt transaction
        console.log(`[EnsureCredit] No ${requiredCreditType} credits for player ${playerId}, creating debt`);

        // Task #636: Pre-check for an existing debt row at this event_key. The unique index
        // on event_key INCLUDES cancelled rows, so a prior reset-script's cancelled row
        // would otherwise blow up our INSERT with 23505 and abort the whole transaction.
        // If a cancelled row exists, revive it. If a live row exists, treat as already_processed.
        const existingByEventKey = await tx.execute(sql`
          SELECT id, COALESCE(metadata->>'cancelled', 'false') AS cancelled
          FROM credit_transactions
          WHERE event_key = ${debtEventKey}
          LIMIT 1
        `);
        if (existingByEventKey.rows.length > 0) {
          const ex = existingByEventKey.rows[0] as any;
          if (ex.cancelled === 'true') {
            console.log(`[EnsureCredit] Reviving cancelled debt ${ex.id} for session_player ${sessionPlayerId}`);
            await tx.execute(sql`
              UPDATE credit_transactions
              SET amount = ${-creditCost},
                  balance_after = ${-creditCost},
                  credit_type = ${requiredCreditType},
                  session_player_id = ${sessionPlayerId},
                  metadata = COALESCE(metadata, '{}'::jsonb)
                             - 'cancelled' - 'cancellation_reason' - 'cancelled_at'
                             || ${JSON.stringify({
                               seriesId,
                               sessionType,
                               description: `Debt: No ${requiredCreditType} credits available`,
                               isDebt: true,
                               revivedAt: new Date().toISOString(),
                               revivedBy: 'task-636-repair'
                             })}::jsonb
              WHERE id = ${ex.id}
            `);
            await tx.execute(sql`
              UPDATE session_players
              SET credit_deducted_at = COALESCE(credit_deducted_at, NOW()),
                  credit_transaction_id = NULL
              WHERE id = ${sessionPlayerId}
            `);
            return { success: true, action: "debt_created" as const, creditType: requiredCreditType };
          }
          console.log(`[EnsureCredit] Live debt already exists at event_key for session_player ${sessionPlayerId}`);
          return { success: true, action: "already_processed" as const };
        }

        const debtTxId = crypto.randomUUID();
        try {
          await tx.execute(sql`
            INSERT INTO credit_transactions (
              id, player_id, academy_id, session_id, session_player_id, package_id,
              type, credit_type, amount, reason, event_key, balance_before, balance_after, metadata
            )
            VALUES (
              ${debtTxId}, ${playerId}, ${academyId}, ${sessionId}, ${sessionPlayerId}, NULL,
              'debit', ${requiredCreditType}, ${-creditCost}, 'session_debt', ${debtEventKey}, 0, ${-creditCost},
              ${JSON.stringify({ 
                seriesId, 
                sessionType, 
                description: `Debt: No ${requiredCreditType} credits available`,
                isDebt: true 
              })}::jsonb
            )
          `);
        } catch (insertError: any) {
          if (insertError.code === '23505') {
            // Race: another concurrent caller inserted the same debtEventKey between our
            // pre-check and our insert. Safe to treat as already_processed.
            console.log(`[EnsureCredit] Duplicate debt detected (race) for session_player ${sessionPlayerId}`);
            return { success: true, action: "already_processed" as const };
          }
          throw insertError;
        }
        
        // Update session_player - mark as processed but leave creditTransactionId null for debt
        await tx.execute(sql`
          UPDATE session_players 
          SET credit_deducted_at = NOW()
          WHERE id = ${sessionPlayerId}
        `);
        
        return {
          success: true,
          action: "debt_created" as const,
          creditType: requiredCreditType,
        };
      }
      
      // STEP 6B: Credits available - consume from package
      const pkg = packageResult.rows[0] as any;
      const balanceBefore = Number(pkg.remaining_credits);
      const balanceAfter = balanceBefore - creditCost;
      const creditType = pkg.credit_type || requiredCreditType;
      
      // Task #636: Pre-check by event_key to avoid 23505 transaction-aborts when a
      // cancelled consume row already occupies this key. If found cancelled → revive
      // (refresh amount/credit_type/package_id/session_player_id, clear cancelled metadata)
      // and decrement the package balance accordingly. If found live → already_processed.
      const existingConsume = await tx.execute(sql`
        SELECT id, COALESCE(metadata->>'cancelled', 'false') AS cancelled
        FROM credit_transactions
        WHERE event_key = ${consumeEventKey}
        LIMIT 1
      `);
      if (existingConsume.rows.length > 0) {
        const exC = existingConsume.rows[0] as any;
        if (exC.cancelled === 'true') {
          console.log(`[EnsureCredit] Reviving cancelled consume ${exC.id} for session_player ${sessionPlayerId} (package ${pkg.id})`);
          await tx.execute(sql`
            UPDATE credit_transactions
            SET amount = ${-creditCost},
                balance_before = ${balanceBefore},
                balance_after = ${balanceAfter},
                credit_type = ${creditType},
                package_id = ${pkg.id},
                session_player_id = ${sessionPlayerId},
                metadata = COALESCE(metadata, '{}'::jsonb)
                           - 'cancelled' - 'cancellation_reason' - 'cancelled_at'
                           || ${JSON.stringify({
                             seriesId,
                             sessionType,
                             packageId: pkg.id,
                             description: `Credit consumed for ${sessionType} session`,
                             revivedAt: new Date().toISOString(),
                             revivedBy: 'task-636-repair'
                           })}::jsonb
            WHERE id = ${exC.id}
          `);
          // Mirror the normal consume path: update balance + status and signal depletion
          // so the post-commit hook converts depleted-package consumptions into debts.
          await tx.execute(sql`
            UPDATE packages
            SET remaining_credits = GREATEST(0, ${balanceAfter}::numeric),
                status = CASE WHEN ${balanceAfter} <= 0 THEN 'depleted' ELSE status END
            WHERE id = ${pkg.id}
          `);
          await tx.execute(sql`
            UPDATE session_players
            SET credit_deducted_at = COALESCE(credit_deducted_at, NOW()),
                credit_transaction_id = ${exC.id}
            WHERE id = ${sessionPlayerId}
          `);
          return {
            success: true,
            action: "consumed" as const,
            transactionId: exC.id,
            packageId: pkg.id,
            creditType,
            _depleted: balanceAfter <= 0,
          } as any;
        }
        console.log(`[EnsureCredit] Live consume already exists at event_key for session_player ${sessionPlayerId}`);
        return { success: true, action: "already_processed" as const, transactionId: exC.id };
      }

      // Create consumption transaction with unique eventKey
      const consumeTxId = crypto.randomUUID();
      try {
        await tx.execute(sql`
          INSERT INTO credit_transactions (
            id, player_id, academy_id, session_id, session_player_id, package_id,
            type, credit_type, amount, reason, event_key, balance_before, balance_after, metadata
          )
          VALUES (
            ${consumeTxId}, ${playerId}, ${academyId}, ${sessionId}, ${sessionPlayerId}, ${pkg.id},
            'debit', ${creditType}, ${-creditCost}, 'session_consumed', ${consumeEventKey}, ${balanceBefore}, ${balanceAfter},
            ${JSON.stringify({ 
              seriesId, 
              sessionType,
              packageId: pkg.id,
              description: `Credit consumed for ${sessionType} session` 
            })}::jsonb
          )
        `);
      } catch (insertError: any) {
        // Unique constraint violation - concurrent insert (race after our pre-check).
        if (insertError.code === '23505') {
          console.log(`[EnsureCredit] Duplicate consume detected (race) for session_player ${sessionPlayerId}`);
          return { success: true, action: "already_processed" as const };
        }
        throw insertError;
      }
      
      // Decrement package credits — GREATEST(0, ...) ensures we never write a negative value
      await tx.execute(sql`
        UPDATE packages 
        SET remaining_credits = GREATEST(0, ${balanceAfter}::numeric),
            status = CASE WHEN ${balanceAfter} <= 0 THEN 'depleted' ELSE status END
        WHERE id = ${pkg.id}
      `);
      
      // Update session_player with credit info
      await tx.execute(sql`
        UPDATE session_players 
        SET credit_deducted_at = NOW(),
            credit_transaction_id = ${consumeTxId}
        WHERE id = ${sessionPlayerId}
      `);
      
      console.log(`[EnsureCredit] Consumed ${creditCost} ${creditType} credit(s) from package ${pkg.id} for session_player ${sessionPlayerId}`);
      
      return {
        success: true,
        action: "consumed" as const,
        transactionId: consumeTxId,
        packageId: pkg.id,
        creditType,
        _depleted: balanceAfter <= 0,
      };
    });

    // After the transaction commits: if the package just depleted, convert all its consumption
    // transactions (including the one just written) into session_debt records so they surface
    // correctly in the player's balance calculation. The guard inside the function skips
    // non-depleted packages, making this safe to call for every "consumed" result.
    if (txResult.action === "consumed" && txResult.packageId && txResult._depleted) {
      storage.convertPackageConsumptionToDebt(txResult.packageId).catch(err => {
        console.error(`[EnsureCredit] Failed to convert depleted package ${txResult.packageId} to debt:`, err);
      });
    }

    const { _depleted: _, ...resultToReturn } = txResult;

    // Phase 2 — Credit shadow-mode (Task #650). Fire-and-forget; never
    // blocks or affects the legacy result. Off by default — enable via
    // env `CREDIT_SHADOW_MODE=on`. We only reach this branch on the
    // legacy path (V2 academies short-circuit above), so shadow runs
    // here will not double-apply against the V2 engine.
    if (resultToReturn.success && resultToReturn.action !== "error") {
      import("./services/credit-shadow").then(({ isShadowModeEnabled, shadowConsumeAfterLegacy }) => {
        if (!isShadowModeEnabled()) return;
        return shadowConsumeAfterLegacy(sessionPlayerId, resultToReturn);
      }).catch((err) => {
        console.error(`[EnsureCredit] shadow consume failed for ${sessionPlayerId}:`, err);
      });
    }

    return resultToReturn;
  } catch (error: any) {
    console.error(`[EnsureCredit] Error processing session_player ${sessionPlayerId}:`, error);
    return { success: false, action: "error" as const, error: error.message };
  }
}

/**
 * BULK REPAIR: Re-process all session_players with attendance but no credit processing
 * This finds all session_players where:
 * 1. attendanceStatus = present/late
 * 2. creditDeductedAt IS NULL
 * And runs ensureCreditProcessed on each
 */
async function repairAllPlayerCredits(): Promise<{
  processed: number;
  consumed: number;
  debts: number;
  alreadyProcessed: number;
  notAttended: number;
  errors: string[];
}> {
  const results = { processed: 0, consumed: 0, debts: 0, alreadyProcessed: 0, notAttended: 0, errors: [] as string[] };
  
  // Find all unprocessed session_players with chargeable attendance:
  // - present/late for any session type
  // - absent ONLY for private sessions (coach showed up, player pays)
  const unprocessed = await db.execute(sql`
    SELECT sp.id, sp.player_id, sp.session_id, sp.attendance_status, p.name as player_name, s.session_type
    FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.credit_deducted_at IS NULL
      AND s.status != 'cancelled'
      AND (
        sp.attendance_status IN ('present', 'late')
        OR sp.attendance_status = 'absent'
      )
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions ct
        WHERE ct.player_id = sp.player_id
          AND ct.session_id = sp.session_id
          AND ct.amount < 0
          AND (ct.metadata->>'cancelled')::text IS DISTINCT FROM 'true'
      )
    ORDER BY sp.id
  `);
  
  console.log(`[RepairCredits] Found ${unprocessed.rows.length} unprocessed session_players`);
  
  for (const row of unprocessed.rows) {
    const sp = row as any;
    results.processed++;
    
    try {
      const result = await ensureCreditProcessed(sp.id);
      
      if (result.action === "consumed") {
        results.consumed++;
        console.log(`[RepairCredits] ${sp.player_name}: Consumed credit from package ${result.packageId}`);
      } else if (result.action === "debt_created") {
        results.debts++;
        console.log(`[RepairCredits] ${sp.player_name}: Created debt (no ${result.creditType} credits)`);
      } else if (result.action === "already_processed") {
        results.alreadyProcessed++;
      } else if (result.action === "not_attended") {
        results.notAttended++;
        await db.execute(sql`
          UPDATE session_players SET credit_deducted_at = NOW() WHERE id = ${sp.id}
        `);
      } else if (result.action === "error") {
        results.errors.push(`${sp.player_name}: ${result.error}`);
      }
    } catch (error: any) {
      results.errors.push(`${sp.player_name}: ${error.message}`);
    }
  }
  
  // Also re-link any session_players that have creditDeductedAt but no creditTransactionId
  // Exclude session_players that already have any transaction linked via session_player_id
  const needsRelink = await db.execute(sql`
    SELECT sp.id, sp.player_id, sp.session_id
    FROM session_players sp
    WHERE sp.credit_deducted_at IS NOT NULL
      AND sp.credit_transaction_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions ct 
        WHERE ct.session_player_id = sp.id
      )
  `);
  
  console.log(`[RepairCredits] Found ${needsRelink.rows.length} session_players needing transaction re-link`);
  
  let relinked = 0;
  for (const row of needsRelink.rows) {
    const sp = row as any;
    
    // First try to find by session_player_id (more reliable)
    let txResult = await db.execute(sql`
      SELECT id FROM credit_transactions
      WHERE session_player_id = ${sp.id}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    // Fallback: find matching consume transaction by player_id + session_id
    if (txResult.rows.length === 0) {
      txResult = await db.execute(sql`
        SELECT id FROM credit_transactions
        WHERE player_id = ${sp.player_id}
          AND session_id = ${sp.session_id}
          AND amount = -1
          AND package_id IS NOT NULL
          AND reason IN ('session_join', 'session_consumed', 'session_booking')
        ORDER BY created_at DESC
        LIMIT 1
      `);
    }
    
    if (txResult.rows.length > 0) {
      const txId = (txResult.rows[0] as any).id;
      await db.execute(sql`
        UPDATE session_players 
        SET credit_transaction_id = ${txId}
        WHERE id = ${sp.id}
      `);
      relinked++;
      console.log(`[RepairCredits] Re-linked session_player ${sp.id} to transaction ${txId}`);
    }
  }
  
  console.log(`[RepairCredits] Re-linked ${relinked} of ${needsRelink.rows.length} session_players`);

  // SECOND PASS: Re-run ensureCreditProcessed for sessions that have credit_deducted_at set
  // but NO credit_transaction_id and also no existing debit transaction in credit_transactions.
  // These are "stuck" sessions — the system previously set the timestamp (e.g. no package existed)
  // but never created a real transaction. Now that ensureCreditProcessed's idempotency guard is
  // fixed (requires BOTH fields), these will be properly charged if a package now exists.
  const stuckSessions = await db.execute(sql`
    SELECT sp.id, sp.player_id, sp.session_id, p.name as player_name, s.session_type
    FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.credit_deducted_at IS NOT NULL
      AND sp.credit_transaction_id IS NULL
      AND s.status != 'cancelled'
      AND sp.attendance_status IN ('present', 'late', 'absent')
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions ct
        WHERE ct.player_id = sp.player_id
          AND ct.session_id = sp.session_id
          AND ct.amount < 0
          AND (ct.metadata->>'cancelled')::text IS DISTINCT FROM 'true'
      )
    ORDER BY sp.id
  `);

  console.log(`[RepairCredits] Found ${stuckSessions.rows.length} stuck session_players (credit_deducted_at set but no transaction) — re-processing`);

  let stuckConsumed = 0;
  let stuckDebts = 0;
  let stuckErrors = 0;
  for (const row of stuckSessions.rows) {
    const sp = row as any;
    try {
      const result = await ensureCreditProcessed(sp.id);
      if (result.action === "consumed") {
        stuckConsumed++;
        console.log(`[RepairCredits] Stuck session healed: ${sp.player_name} → consumed from package ${result.packageId}`);
      } else if (result.action === "debt_created") {
        stuckDebts++;
        console.log(`[RepairCredits] Stuck session: ${sp.player_name} → still no package, debt created`);
      } else if (result.action === "already_processed") {
        // Re-linked in the first pass above
      }
    } catch (err: any) {
      stuckErrors++;
      console.error(`[RepairCredits] Stuck session error for ${sp.player_name}:`, err.message);
    }
  }

  console.log(`[RepairCredits] Stuck sessions: ${stuckConsumed} consumed, ${stuckDebts} debts, ${stuckErrors} errors`);

  // THIRD PASS: Backfill credit_deducted_at/credit_transaction_id for session_players where
  // credit_deducted_at IS NULL but a matching non-cancelled debit transaction already EXISTS.
  // These were excluded from the first pass by the NOT EXISTS guard but still need stamping.
  const needsStamp = await db.execute(sql`
    SELECT sp.id, sp.player_id, sp.session_id
    FROM session_players sp
    WHERE sp.credit_deducted_at IS NULL
      AND sp.credit_transaction_id IS NULL
      AND sp.attendance_status IN ('present', 'late', 'absent')
      AND EXISTS (
        SELECT 1 FROM credit_transactions ct
        WHERE ct.player_id = sp.player_id
          AND ct.session_id = sp.session_id
          AND ct.amount < 0
          AND (ct.metadata->>'cancelled')::text IS DISTINCT FROM 'true'
      )
    ORDER BY sp.id
    LIMIT 500
  `);

  let stampedCount = 0;
  for (const row of needsStamp.rows) {
    const sp = row as any;
    try {
      // ensureCreditProcessed detects the existing transaction and links credit_deducted_at
      const result = await ensureCreditProcessed(sp.id);
      if (result.action === "already_processed" || result.action === "consumed") {
        stampedCount++;
      }
    } catch (err: any) {
      // Non-fatal — best-effort backfill
      console.error(`[RepairCredits] Stamp backfill error for session_player ${sp.id}:`, err.message);
    }
  }
  if (needsStamp.rows.length > 0) {
    console.log(`[RepairCredits] Stamp backfill: ${stampedCount} of ${needsStamp.rows.length} session_players linked`);
  }

  // FOURTH PASS (Task #636): Re-charge sessions where credit_deducted_at AND
  // credit_transaction_id are BOTH set, but the linked transaction was later cancelled
  // (package deleted, debt-reset script, attendance toggled, etc.) leaving NO live debit.
  // The first three passes filter on `credit_deducted_at IS NULL` or `credit_transaction_id IS NULL`,
  // so this case slipped through and players were silently under-billed (Alex showed -17 instead of -18).
  // Mirror shouldChargeCredit semantics in the SQL filter so semi-private absent is excluded.
  const cancelledLinks = await db.execute(sql`
    SELECT sp.id, sp.player_id, sp.session_id, p.name as player_name, s.session_type
    FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    JOIN sessions s ON s.id = sp.session_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE sp.credit_deducted_at IS NOT NULL
      AND sp.credit_transaction_id IS NOT NULL
      AND s.status != 'cancelled'
      AND (
        sp.attendance_status IN ('present', 'late')
        OR (
          sp.attendance_status = 'absent'
          AND (
            LOWER(REPLACE(REPLACE(COALESCE(s.session_type, 'group'), '-', '_'), ' ', '_'))
              IN ('group', 'group_adjusted', 'private')
            OR (
              LOWER(REPLACE(REPLACE(COALESCE(s.session_type, 'group'), '-', '_'), ' ', '_')) = 'private_adjusted'
              AND COALESCE(LOWER(REPLACE(REPLACE(cs.session_type, '-', '_'), ' ', '_')), 'private') != 'semi_private'
            )
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions ct
        WHERE ct.player_id = sp.player_id
          AND ct.session_id = sp.session_id
          AND ct.amount < 0
          AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
      )
    ORDER BY sp.id
  `);

  console.log(`[RepairCredits] Found ${cancelledLinks.rows.length} session_players whose linked debit was cancelled — re-charging`);

  let cancelledConsumed = 0;
  let cancelledDebts = 0;
  let cancelledErrors = 0;
  for (const row of cancelledLinks.rows) {
    const sp = row as any;
    try {
      const result = await ensureCreditProcessed(sp.id);
      if (result.action === "consumed") {
        cancelledConsumed++;
        console.log(`[RepairCredits] Cancelled-link healed: ${sp.player_name} → consumed from package ${result.packageId}`);
      } else if (result.action === "debt_created") {
        cancelledDebts++;
        console.log(`[RepairCredits] Cancelled-link: ${sp.player_name} → no package, fresh debt created`);
      } else if (result.action === "error") {
        cancelledErrors++;
        console.error(`[RepairCredits] Cancelled-link error for ${sp.player_name}: ${result.error}`);
      }
    } catch (err: any) {
      cancelledErrors++;
      console.error(`[RepairCredits] Cancelled-link exception for ${sp.player_name}:`, err.message);
    }
  }
  console.log(`[RepairCredits] Cancelled-link pass: ${cancelledConsumed} consumed, ${cancelledDebts} debts, ${cancelledErrors} errors`);
  results.consumed += cancelledConsumed;
  results.debts += cancelledDebts;
  results.processed += cancelledLinks.rows.length;

  console.log(`[RepairCredits] Summary: ${results.processed} processed, ${results.consumed} consumed, ${results.debts} debts, ${results.notAttended} not_attended, ${results.alreadyProcessed} already_processed, ${results.errors.length} errors`);
  
  return results;
}

async function auditAllPlayerCredits(): Promise<{
  playersChecked: number;
  ghostCreditsFound: number;
  playersWithIssues: string[];
}> {
  const results = { playersChecked: 0, ghostCreditsFound: 0, playersWithIssues: [] as string[] };
  
  // Get all players
  const allPlayers = await db.select({ id: players.id, name: players.name }).from(players);
  results.playersChecked = allPlayers.length;
  
  if (allPlayers.length === 0) return results;
  
  const playerIds = allPlayers.map(p => p.id);
  const playerNameMap = new Map(allPlayers.map(p => [p.id, p.name]));
  
  // Get ALL package IDs that exist in the database (any status)
  const allPackagesList = await db.select({
    id: packages.id,
    playerId: packages.playerId,
    status: packages.status,
  }).from(packages)
    .where(inArray(packages.playerId, playerIds));
  
  // ALL existing package IDs - ghost credits are only for DELETED packages (not in DB at all)
  const existingPackageIds = new Set(allPackagesList.map(pkg => pkg.id));
  // Active package IDs - used for Phase 3 balance sync
  const activePackageIds = new Set(
    allPackagesList
      .filter(pkg => pkg.status === "active")
      .map(pkg => pkg.id)
  );
  
  // Find all credit transactions for these players
  const allPositiveTransactions = await db.select({
    id: creditTransactions.id,
    playerId: creditTransactions.playerId,
    amount: creditTransactions.amount,
    packageId: creditTransactions.packageId,
    creditType: creditTransactions.creditType,
    reason: creditTransactions.reason,
    metadata: creditTransactions.metadata,
  }).from(creditTransactions)
    .where(inArray(creditTransactions.playerId, playerIds));
  
  // Ghost credits: positive amounts referencing a packageId that NO LONGER EXISTS in the database
  // Depleted/expired packages are REAL packages - their purchases are valid, not ghosts
  const ghostPurchases = allPositiveTransactions.filter(tx => {
    if (Number(tx.amount) <= 0) return false;
    if (!tx.packageId) return false;
    if (existingPackageIds.has(tx.packageId)) return false;
    return true;
  });
  
  // Mark ghost transactions as expired
  for (const tx of ghostPurchases) {
    
    const meta = tx.metadata as { settled?: boolean; cancelled?: boolean; expired?: boolean } | null;
    if (meta?.settled === true || meta?.cancelled === true || meta?.expired === true) continue;
    
    // This is a ghost credit - mark it as expired
    results.ghostCreditsFound++;
    const playerName = playerNameMap.get(tx.playerId) || tx.playerId;
    
    const existingMeta = (tx.metadata || {}) as Record<string, unknown>;
    await db.update(creditTransactions)
      .set({ 
        metadata: { ...existingMeta, expired: true, expiredReason: "package_not_active" } 
      })
      .where(eq(creditTransactions.id, tx.id));
    
    if (!results.playersWithIssues.includes(playerName)) {
      results.playersWithIssues.push(playerName);
    }
    
    console.log(`[CreditAudit] Ghost credit found: ${playerName} - ${tx.amount} ${tx.creditType} credits from package ${tx.packageId}`);
  }
  
  // NOTE: Orphan purchase marking was removed — transactions without packageId may be
  // legitimate credits from old code paths. Marking them expired caused negative balances.

  console.log(`[CreditAudit] Checked ${results.playersChecked} players, found ${results.ghostCreditsFound} ghost credits for ${results.playersWithIssues.length} players`);
  if (results.playersWithIssues.length > 0) {
    console.log(`[CreditAudit] Players with issues fixed: ${results.playersWithIssues.join(", ")}`);
  }
  
  return results;
}

async function repairGroupSessionTypes(): Promise<{ fixed: number; errors: string[] }> {
  const results = { fixed: 0, errors: [] as string[] };

  const wrongSessions = await db.execute(sql`
    SELECT s.id, s.session_type, s.series_id
    FROM sessions s
    WHERE s.session_type IN ('group_adjusted', 'semi_private_adjusted')
      AND s.status = 'completed'
  `);

  console.log(`[RepairGroupTypes] Found ${wrongSessions.rows.length} group sessions wrongly converted`);

  for (const row of wrongSessions.rows) {
    const s = row as any;
    try {
      await db.update(sessions).set({ sessionType: "group" }).where(eq(sessions.id, s.id));

      const sessionPlayers = await db.execute(sql`
        SELECT sp.id, sp.player_id, sp.attendance_status, ct.id as tx_id, ct.credit_type, ct.package_id
        FROM session_players sp
        LEFT JOIN credit_transactions ct ON ct.session_player_id = sp.id AND ct.type = 'debit'
        WHERE sp.session_id = ${s.id}
      `);

      for (const sp of sessionPlayers.rows) {
        const spData = sp as any;
        if (spData.tx_id && spData.credit_type !== "group") {
          await db.execute(sql`
            UPDATE credit_transactions 
            SET credit_type = 'group'
            WHERE id = ${spData.tx_id}
          `);

          if (spData.package_id) {
            const pkg = await db.execute(sql`
              SELECT credit_type FROM player_credit_packages WHERE id = ${spData.package_id}
            `);
            if (pkg.rows.length > 0 && (pkg.rows[0] as any).credit_type !== "group") {
              await db.execute(sql`
                UPDATE player_credit_packages 
                SET remaining_credits = remaining_credits + 1
                WHERE id = ${spData.package_id}
              `);
              console.log(`[RepairGroupTypes] Refunded 1 ${spData.credit_type} credit to package ${spData.package_id}`);
            }
          }

          console.log(`[RepairGroupTypes] Fixed session ${s.id}: ${s.session_type} -> group, tx ${spData.tx_id} credit_type -> group`);
          results.fixed++;
        }
      }
    } catch (error: any) {
      results.errors.push(`Session ${s.id}: ${error.message}`);
    }
  }

  return results;
}

async function cleanupGhostSessions(): Promise<{ cancelled: number }> {
  const endedSeriesIds = await db
    .select({ id: coachingSeries.id })
    .from(coachingSeries)
    .where(or(
      eq(coachingSeries.status, "ended"),
      eq(coachingSeries.status, "completed"),
      eq(coachingSeries.status, "deleted")
    ));
  
  if (endedSeriesIds.length === 0) return { cancelled: 0 };
  
  const ids = endedSeriesIds.map(s => s.id);
  
  // Only cancel sessions that were pre-scheduled BEFORE the series ended (true ghosts).
  // Sessions created AFTER the series ended_at are intentional coach-created sessions
  // and must not be touched, even if they reference the same series slot.
  const ghostSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(
      or(
        inArray(sessions.seriesId, ids),
        inArray(sessions.recurringGroupId, ids)
      ),
      eq(sessions.status, "scheduled"),
      gte(sessions.startTime, new Date()),
      sql`COALESCE(
        (SELECT ended_at FROM coaching_series
         WHERE id = COALESCE(${sessions.seriesId}, ${sessions.recurringGroupId})
         LIMIT 1),
        ${sessions.createdAt}
      ) >= ${sessions.createdAt}`
    ));
  
  if (ghostSessions.length === 0) return { cancelled: 0 };
  
  const ghostIds = ghostSessions.map(s => s.id);
  console.log(`[GhostCleanup] Found ${ghostIds.length} ghost sessions from ${endedSeriesIds.length} ended/deleted series`);
  
  await db.delete(creditTransactions).where(inArray(creditTransactions.sessionId, ghostIds));
  await db.delete(sessionPlayers).where(inArray(sessionPlayers.sessionId, ghostIds));
  await db.update(sessions).set({ status: "cancelled" }).where(inArray(sessions.id, ghostIds));
  
  return { cancelled: ghostIds.length };
}

/**
 * STARTUP RECONCILIATION: Correct packages.remaining_credits for any drifted packages.
 * 
 * Correct remaining = total_credits
 *   - debits charged directly from this package (session_consumed, retrospective_settlement, etc.)
 *   - debts settled against this package (settlePlayerDebts marks them with settledByPackage)
 *
 * This is safe to run repeatedly — only updates packages where remaining_credits is wrong.
 */
async function reconcilePackageCredits(): Promise<{ checked: number; fixed: number; errors: string[] }> {
  const result = { checked: 0, fixed: 0, errors: [] as string[] };

  const drifted = await db.execute(sql`
    SELECT
      p.id,
      p.player_id,
      p.total_credits::numeric AS total,
      p.remaining_credits::numeric AS current_remaining,
      COALESCE(pkg_debits.deducted, 0) AS deducted_from_package,
      COALESCE(settled.settled_amount, 0) AS settled_debts,
      (
        p.total_credits::numeric
        - COALESCE(pkg_debits.deducted, 0)
        - COALESCE(settled.settled_amount, 0)
      ) AS expected_remaining
    FROM packages p
    LEFT JOIN (
      SELECT package_id, ABS(SUM(amount::numeric)) AS deducted
      FROM credit_transactions
      WHERE package_id IS NOT NULL
        AND amount::numeric < 0
        AND COALESCE(metadata->>'cancelled', 'false') != 'true'
        AND COALESCE(metadata->>'expired', 'false') != 'true'
      GROUP BY package_id
    ) pkg_debits ON pkg_debits.package_id = p.id
    LEFT JOIN (
      SELECT
        metadata->>'settledByPackage' AS package_id,
        ABS(SUM(amount::numeric)) AS settled_amount
      FROM credit_transactions
      WHERE COALESCE(metadata->>'isDebt', 'false') = 'true'
        AND COALESCE(metadata->>'settled', 'false') = 'true'
        AND metadata->>'settledByPackage' IS NOT NULL
        AND COALESCE(metadata->>'cancelled', 'false') != 'true'
      GROUP BY metadata->>'settledByPackage'
    ) settled ON settled.package_id = p.id
    WHERE ABS(
        p.remaining_credits::numeric - (
          p.total_credits::numeric
          - COALESCE(pkg_debits.deducted, 0)
          - COALESCE(settled.settled_amount, 0)
        )
      ) > 0.01
  `);

  result.checked = drifted.rows.length;
  console.log(`[CreditReconcile] Found ${drifted.rows.length} packages with drifted remaining_credits`);

  interface ReconcileRow {
    id: string;
    player_id: string;
    total: string;
    current_remaining: string;
    deducted_from_package: string;
    settled_debts: string;
    expected_remaining: string;
  }

  for (const row of drifted.rows) {
    const r = row as ReconcileRow;
    const expected = Math.max(0, Number(r.expected_remaining));
    const current = Number(r.current_remaining);

    try {
      await db.execute(sql`
        UPDATE packages
        SET remaining_credits = ${expected}::numeric,
            status = CASE WHEN ${expected}::numeric <= 0 THEN 'depleted' ELSE 'active' END
        WHERE id = ${r.id}
      `);
      console.log(`[CreditReconcile] Fixed package ${r.id} (player ${r.player_id}): ${current} -> ${expected} (total: ${r.total}, from_pkg: ${r.deducted_from_package}, settled: ${r.settled_debts})`);
      result.fixed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${r.id}: ${message}`);
      console.error(`[CreditReconcile] Error fixing package ${r.id}:`, message);
    }
  }

  console.log(`[CreditReconcile] Complete: ${result.checked} checked, ${result.fixed} fixed, ${result.errors.length} errors`);
  return result;
}

interface OrphanedSPMembership {
  player_id: string;
  series_id: string;
  joined_at: string;
}

interface OrphanedSPSession {
  id: string;
  session_type: string;
  duration: number;
  academy_id: string;
}

interface OrphanedSPInsertResult {
  id: string;
}

interface OrphanRepairFailure {
  playerId: string;
  sessionId: string;
  reason: string;
}

// Idempotent repair: find completed series sessions AFTER a player's joinedAt where no session_players record exists.
// Creates records as 'present' and immediately calls ensureCreditProcessed to create the debt transaction.
async function repairOrphanedSessionPlayers(): Promise<{ created: number; failures: OrphanRepairFailure[] }> {
  let created = 0;
  const failures: OrphanRepairFailure[] = [];

  const memberships = await db.execute(sql`
    SELECT sp.player_id, sp.series_id,
           COALESCE(sp.joined_at, sp.created_at) AS joined_at
    FROM series_players sp
    WHERE sp.status = 'active'
  `);

  for (const row of memberships.rows) {
    const m = row as OrphanedSPMembership;

    const orphaned = await db.execute(sql`
      SELECT s.id, s.session_type, s.duration, s.academy_id
      FROM sessions s
      WHERE s.series_id = ${m.series_id}
        AND s.status = 'completed'
        AND s.start_time >= ${m.joined_at}
        AND NOT EXISTS (
          SELECT 1 FROM session_players sp2
          WHERE sp2.session_id = s.id AND sp2.player_id = ${m.player_id}
        )
    `);

    for (const sess of orphaned.rows) {
      const s = sess as OrphanedSPSession;
      // Insert as 'present'; ON CONFLICT DO NOTHING ensures idempotency
      const inserted = await db.execute(sql`
        INSERT INTO session_players (id, session_id, player_id, attendance_status)
        VALUES (gen_random_uuid(), ${s.id}, ${m.player_id}, 'present')
        ON CONFLICT (session_id, player_id) DO NOTHING
        RETURNING id
      `);

      if ((inserted as { rowCount: number }).rowCount > 0) {
        const newSpId = (inserted.rows[0] as OrphanedSPInsertResult).id;
        created++;
        console.log(`[OrphanedSPRepair] Created session_player ${newSpId}: player=${m.player_id} session=${s.id}`);

        // Process credit immediately so the debt transaction is created
        const creditResult = await ensureCreditProcessed(newSpId).catch((err: Error) => {
          failures.push({ playerId: m.player_id, sessionId: s.id, reason: `ensureCreditProcessed: ${err.message}` });
          return null;
        });
        if (creditResult === null) {
          console.error(`[OrphanedSPRepair] Credit processing failed for session_player ${newSpId} (player=${m.player_id} session=${s.id})`);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`[OrphanedSPRepair] Completed with ${failures.length} credit-processing failure(s):`, JSON.stringify(failures));
  }
  console.log(`[OrphanedSPRepair] Done: ${created} created, ${failures.length} failures`);
  return { created, failures };
}

/**
 * Canonical session-type → credit-type normalizer.
 * Used by ensureCreditProcessed, auto-completion debt creation, and any other
 * code path that needs to map a raw session_type string to one of the three
 * credit bucket keys ("group" | "semi_private" | "private").
 *
 * Handles null/undefined/empty and hyphen/space variants safely.
 * IMPORTANT: defaults to "group" for any unrecognised type — never "private".
 */
export function normalizeSessionTypeToCreditType(sessionType: string | null | undefined): "group" | "semi_private" | "private" {
  const st = (sessionType || "").toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
  if (st === "semi_private" || st === "semi" || st === "semi_private_adjusted") return "semi_private";
  if (st === "private" || st === "private_adjusted") return "private";
  return "group";
}

interface RebuildAttendanceRow {
  id: string;
  player_id: string;
  player_name: string;
  session_type: string;
  start_time: string;
}

/**
 * Full Credit Rebuild for an entire academy.
 * (a) Deletes all credit_transactions for all players in the academy.
 * (b) Resets session_players.credit_deducted_at and credit_transaction_id to NULL for all
 *     attendance records belonging to sessions in that academy.
 * (c) Resets packages.remaining_credits = packages.total_credits for all packages of
 *     players in that academy. Only previously-depleted packages that still have a valid
 *     expiry (or no expiry) have their status reset to 'active'; truly expired packages
 *     keep status='expired' so ensureCreditProcessed (which filters status='active') cannot
 *     accidentally consume from them.
 * (d) Fetches all chargeable attendance records ordered by session date ascending.
 * (e) Calls ensureCreditProcessed for each one in order so credits are consumed /
 *     debt is created correctly according to actual packages held at the time.
 */
async function fullCreditRebuildForAcademy(academyId: string): Promise<{
  debts: number;
  consumed: number;
  errors: string[];
  playersProcessed: number;
}> {
  const result: { debts: number; consumed: number; errors: string[]; playersProcessed: number } = {
    debts: 0,
    consumed: 0,
    errors: [],
    playersProcessed: 0,
  };

  console.log(`[FullCreditRebuild] Starting full rebuild for academy ${academyId}`);

  // --- Step (a): Delete all credit_transactions for players in this academy ---
  await db.execute(sql`
    DELETE FROM credit_transactions
    WHERE player_id IN (
      SELECT id FROM players WHERE academy_id = ${academyId}
    )
  `);
  console.log(`[FullCreditRebuild] Deleted credit transactions for academy ${academyId}`);

  // --- Step (b): Reset session_players for all sessions in this academy ---
  await db.execute(sql`
    UPDATE session_players
    SET credit_deducted_at = NULL,
        credit_transaction_id = NULL
    WHERE session_id IN (
      SELECT id FROM sessions WHERE academy_id = ${academyId}
    )
  `);
  console.log(`[FullCreditRebuild] Reset session_players for academy ${academyId}`);

  // --- Step (c): Reset remaining_credits = total_credits for all academy packages ---
  // Only set status='active' for packages that are NOT past their expiry date.
  // ensureCreditProcessed selects packages with status='active' only — it does not
  // apply an additional expiry_date filter in its SQL. So a blanket status reset to
  // 'active' would allow genuinely expired packages to be consumed during rebuild,
  // which would be incorrect. We therefore preserve 'expired' for past-expiry packages.
  await db.execute(sql`
    UPDATE packages
    SET remaining_credits = total_credits,
        status = CASE
          WHEN total_credits > 0
               AND (expiry_date IS NULL OR expiry_date > NOW())
          THEN 'active'
          WHEN total_credits > 0
               AND expiry_date <= NOW()
          THEN 'expired'
          ELSE status
        END
    WHERE player_id IN (
      SELECT id FROM players WHERE academy_id = ${academyId}
    )
  `);
  console.log(`[FullCreditRebuild] Reset package balances for academy ${academyId}`);

  // --- Step (d): Fetch all chargeable attendance records ordered by session date ---
  const attendanceRows = await db.execute(sql`
    SELECT sp.id, sp.player_id, p.name as player_name, s.session_type, s.start_time
    FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    JOIN sessions s ON s.id = sp.session_id
    WHERE p.academy_id = ${academyId}
      AND s.status != 'cancelled'
      AND (
        sp.attendance_status IN ('present', 'late')
        OR sp.attendance_status = 'absent'
      )
    ORDER BY s.start_time ASC, sp.id ASC
  `);

  const playerIds = new Set<string>();
  console.log(`[FullCreditRebuild] Processing ${attendanceRows.rows.length} chargeable attendance records`);

  // --- Step (e): Call ensureCreditProcessed for each record in chronological order ---
  for (const row of attendanceRows.rows) {
    const sp = row as RebuildAttendanceRow;
    playerIds.add(sp.player_id);
    try {
      const creditResult = await ensureCreditProcessed(sp.id);
      if (creditResult.action === "consumed") {
        result.consumed++;
      } else if (creditResult.action === "debt_created") {
        result.debts++;
      } else if (creditResult.action === "error") {
        result.errors.push(`${sp.player_name}: ${creditResult.error ?? "unknown error"}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${sp.player_name}: ${message}`);
    }
  }

  result.playersProcessed = playerIds.size;
  console.log(`[FullCreditRebuild] Complete: ${result.consumed} consumed, ${result.debts} debts, ${result.errors.length} errors, ${result.playersProcessed} players`);
  return result;
}

export { getSessionTypeByPlayerCount, updateSeriesSessionType, recalculateSeriesCredits, ensureCreditProcessed, repairAllPlayerCredits, auditAllPlayerCredits, repairGroupSessionTypes, cleanupGhostSessions, reconcilePackageCredits, repairOrphanedSessionPlayers, fullCreditRebuildForAcademy };

// ==================== VIDEO FEEDBACK ====================
import { videoFeedback, type VideoFeedback, type InsertVideoFeedback } from "@shared/schema";

export async function createVideoFeedback(data: InsertVideoFeedback): Promise<VideoFeedback> {
  const result = await db.insert(videoFeedback).values(data).returning();
  return result[0];
}

export async function getVideoFeedbackById(id: string): Promise<VideoFeedback | undefined> {
  const result = await db.select().from(videoFeedback).where(eq(videoFeedback.id, id));
  return result[0];
}

export async function getVideoFeedbackForPlayer(playerId: string): Promise<VideoFeedback[]> {
  return db.select().from(videoFeedback)
    .where(eq(videoFeedback.playerId, playerId))
    .orderBy(desc(videoFeedback.createdAt));
}

export async function getVideoFeedbackByCoach(coachId: string): Promise<VideoFeedback[]> {
  return db.select().from(videoFeedback)
    .where(eq(videoFeedback.coachId, coachId))
    .orderBy(desc(videoFeedback.createdAt));
}

export async function updateVideoFeedbackMessageId(id: string, messageId: string, conversationId: string): Promise<void> {
  await db.update(videoFeedback).set({ messageId, conversationId }).where(eq(videoFeedback.id, id));
}

// ==================== CORPORATE ACCOUNTS ====================

export const corporateStorage = {
  async getCorporateAccounts(academyId: string): Promise<CorporateAccount[]> {
    return db.select().from(corporateAccounts).where(eq(corporateAccounts.academyId, academyId)).orderBy(desc(corporateAccounts.createdAt));
  },

  async getCorporateAccount(id: string): Promise<CorporateAccount | undefined> {
    const result = await db.select().from(corporateAccounts).where(eq(corporateAccounts.id, id)).limit(1);
    return result[0];
  },

  async getCorporateAccountByContactEmail(academyId: string, email: string): Promise<CorporateAccount | undefined> {
    const result = await db.select().from(corporateAccounts)
      .where(and(eq(corporateAccounts.academyId, academyId), eq(corporateAccounts.contactEmail, email.toLowerCase())))
      .limit(1);
    return result[0];
  },

  async createCorporateAccount(data: InsertCorporateAccount): Promise<CorporateAccount> {
    const result = await db.insert(corporateAccounts).values({ ...data, contactEmail: data.contactEmail.toLowerCase() }).returning();
    return result[0];
  },

  async updateCorporateAccount(id: string, data: Partial<InsertCorporateAccount>): Promise<CorporateAccount | undefined> {
    const result = await db.update(corporateAccounts).set({ ...data, updatedAt: new Date() }).where(eq(corporateAccounts.id, id)).returning();
    return result[0];
  },

  async addCorporateCredits(corporateAccountId: string, academyId: string, amount: number, reason: string, notes?: string, actorId?: string): Promise<CorporateAccount> {
    const account = await this.getCorporateAccount(corporateAccountId);
    if (!account) throw new Error("Corporate account not found");
    const balanceBefore = account.creditBalance;
    const balanceAfter = balanceBefore + amount;
    const [updated] = await db.update(corporateAccounts).set({ creditBalance: balanceAfter, updatedAt: new Date() }).where(eq(corporateAccounts.id, corporateAccountId)).returning();
    await db.insert(corporateCreditTransactions).values({
      corporateAccountId,
      academyId,
      type: "credit",
      amount,
      balanceBefore,
      balanceAfter,
      reason,
      notes,
    });
    return updated;
  },

  async deductCorporateCredits(corporateAccountId: string, academyId: string, playerId: string, sessionId: string | undefined, amount: number, reason: string, notes?: string): Promise<CorporateAccount> {
    const account = await this.getCorporateAccount(corporateAccountId);
    if (!account) throw new Error("Corporate account not found");
    const balanceBefore = account.creditBalance;
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const [updated] = await db.update(corporateAccounts).set({ creditBalance: balanceAfter, updatedAt: new Date() }).where(eq(corporateAccounts.id, corporateAccountId)).returning();
    await db.insert(corporateCreditTransactions).values({
      corporateAccountId,
      academyId,
      playerId,
      sessionId,
      type: "debit",
      amount: -amount,
      balanceBefore,
      balanceAfter,
      reason,
      notes,
    });
    return updated;
  },

  async getCorporateTransactions(corporateAccountId: string): Promise<CorporateCreditTransaction[]> {
    return db.select().from(corporateCreditTransactions)
      .where(eq(corporateCreditTransactions.corporateAccountId, corporateAccountId))
      .orderBy(desc(corporateCreditTransactions.createdAt));
  },

  async getCorporateMembers(corporateAccountId: string): Promise<CorporateMember[]> {
    return db.select().from(corporateMembers)
      .where(eq(corporateMembers.corporateAccountId, corporateAccountId))
      .orderBy(desc(corporateMembers.createdAt));
  },

  async getCorporateMemberByEmail(corporateAccountId: string, email: string): Promise<CorporateMember | undefined> {
    const result = await db.select().from(corporateMembers)
      .where(and(eq(corporateMembers.corporateAccountId, corporateAccountId), eq(corporateMembers.inviteEmail, email.toLowerCase())))
      .limit(1);
    return result[0];
  },

  async getCorporateMemberByToken(token: string): Promise<CorporateMember | undefined> {
    const result = await db.select().from(corporateMembers)
      .where(eq(corporateMembers.inviteToken, token))
      .limit(1);
    return result[0];
  },

  async getCorporateMemberByPlayerId(playerId: string): Promise<CorporateMember | undefined> {
    const result = await db.select().from(corporateMembers)
      .where(and(eq(corporateMembers.playerId, playerId), eq(corporateMembers.inviteStatus, "accepted")))
      .limit(1);
    return result[0];
  },

  async createCorporateMember(data: InsertCorporateMember): Promise<CorporateMember> {
    const result = await db.insert(corporateMembers).values({ ...data, inviteEmail: data.inviteEmail.toLowerCase() }).returning();
    return result[0];
  },

  async updateCorporateMember(id: string, data: Partial<InsertCorporateMember & { acceptedAt: Date }>): Promise<CorporateMember | undefined> {
    const result = await db.update(corporateMembers).set(data).where(eq(corporateMembers.id, id)).returning();
    return result[0];
  },

  async acceptCorporateInvite(token: string, playerId: string): Promise<CorporateMember | undefined> {
    const result = await db.update(corporateMembers)
      .set({ inviteStatus: "accepted", playerId, acceptedAt: new Date(), inviteToken: null })
      .where(and(eq(corporateMembers.inviteToken, token), eq(corporateMembers.inviteStatus, "pending")))
      .returning();
    return result[0];
  },

  async getCorporateUsageReport(corporateAccountId: string): Promise<{
    totalCreditsUsed: number;
    memberUsage: { playerId: string; inviteEmail: string; creditsUsed: number; sessionCount: number }[];
  }> {
    const transactions = await db.select().from(corporateCreditTransactions)
      .where(and(
        eq(corporateCreditTransactions.corporateAccountId, corporateAccountId),
        eq(corporateCreditTransactions.type, "debit"),
      ));
    const totalCreditsUsed = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const byPlayer: Record<string, { playerId: string; inviteEmail: string; creditsUsed: number; sessionCount: number }> = {};
    for (const tx of transactions) {
      if (tx.playerId) {
        if (!byPlayer[tx.playerId]) {
          byPlayer[tx.playerId] = { playerId: tx.playerId, inviteEmail: "", creditsUsed: 0, sessionCount: 0 };
        }
        byPlayer[tx.playerId].creditsUsed += Math.abs(tx.amount);
        if (tx.sessionId) byPlayer[tx.playerId].sessionCount++;
      }
    }
    const members = await db.select().from(corporateMembers).where(eq(corporateMembers.corporateAccountId, corporateAccountId));
    for (const m of members) {
      if (m.playerId && byPlayer[m.playerId]) {
        byPlayer[m.playerId].inviteEmail = m.inviteEmail;
      }
    }
    return { totalCreditsUsed, memberUsage: Object.values(byPlayer) };
  },
};
