import { db } from "./db";
import { randomUUID } from "node:crypto";
import { eq, and, gte, lte, lt, ne, or, inArray, ilike, sql, count, gt, isNull } from "drizzle-orm";
import { desc, asc } from "drizzle-orm";
import {
  // Auth tables
  users,
  type User,
  type InsertUser,
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
  }): Promise<User> {
    const result = await db.insert(users).values({
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      password: data.password,
      role: data.role,
      academyId: data.academyId || null,
      coachId: data.coachId || null,
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
    
    return {
      ...academy[0],
      coachCount: coachResult[0]?.count || 0,
      playerCount: playerResult[0]?.count || 0,
      coaches: coachList,
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
    const result = await db.select().from(invites).where(eq(invites.token, token));
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

  async getAllPlayers(academyId?: string): Promise<Player[]> {
    if (academyId) {
      return db.select().from(players).where(eq(players.academyId, academyId));
    }
    return db.select().from(players);
  },
  
  async getAllPlayersWithCredits(academyId?: string): Promise<(Player & { remainingCredits: number; totalCredits: number })[]> {
    const playerList = academyId 
      ? await db.select().from(players).where(eq(players.academyId, academyId))
      : await db.select().from(players);
    
    if (playerList.length === 0) return [];
    
    // Fetch active packages for all players in one query - scoped by academy for multi-tenant safety
    const playerIds = playerList.map(p => p.id);
    const packageConditions = [
      inArray(packages.playerId, playerIds),
      eq(packages.status, "active")
    ];
    if (academyId) {
      packageConditions.push(eq(packages.academyId, academyId));
    }
    const activePackages = await db.select()
      .from(packages)
      .where(and(...packageConditions));
    
    // Aggregate credits per player
    const creditsByPlayer = new Map<string, { remaining: number; total: number }>();
    for (const pkg of activePackages) {
      const playerId = pkg.playerId;
      if (!playerId) continue;
      const current = creditsByPlayer.get(playerId) || { remaining: 0, total: 0 };
      current.remaining += pkg.remainingCredits || 0;
      current.total += pkg.totalCredits || 0;
      creditsByPlayer.set(playerId, current);
    }
    
    return playerList.map(player => ({
      ...player,
      remainingCredits: creditsByPlayer.get(player.id)?.remaining || 0,
      totalCredits: creditsByPlayer.get(player.id)?.total || 0,
    }));
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

  async deletePlayer(id: string, academyId: string): Promise<boolean> {
    // First verify the player belongs to this academy
    const player = await db.select().from(players).where(
      and(eq(players.id, id), eq(players.academyId, academyId))
    );
    if (player.length === 0) return false;
    
    // Use a transaction to ensure atomicity
    try {
      // Delete all related records in order to satisfy foreign key constraints
      // First batch: tables with no further dependencies
      await Promise.all([
        // Player invites (MUST be deleted to avoid FK constraint errors)
        db.delete(playerInvites).where(eq(playerInvites.playerId, id)),
        // Progress Engine V2 tables
        db.delete(sessionSkillObservations).where(eq(sessionSkillObservations.playerId, id)),
        db.delete(playerSkillState).where(eq(playerSkillState.playerId, id)),
        db.delete(playerProgressFlags).where(eq(playerProgressFlags.playerId, id)),
        db.delete(domainAssessments).where(eq(domainAssessments.playerId, id)),
        db.delete(xpTransactions).where(eq(xpTransactions.playerId, id)),
        // Core tables (sessionFeedback has no playerId - it's session-level)
        db.delete(playerNotes).where(eq(playerNotes.playerId, id)),
        db.delete(playerProgress).where(eq(playerProgress.playerId, id)),
        db.delete(playerHolidays).where(eq(playerHolidays.playerId, id)),
        db.delete(sessionPlayers).where(eq(sessionPlayers.playerId, id)),
        db.delete(playerSessionCancellations).where(eq(playerSessionCancellations.playerId, id)),
        // Booking and transfers (academyApplications has no playerId - it's for academy applications)
        db.delete(bookingRequests).where(eq(bookingRequests.playerId, id)),
        db.delete(joinRequests).where(eq(joinRequests.playerId, id)),
        db.delete(academyTransferRequests).where(eq(academyTransferRequests.playerId, id)),
        // Chat - participants and reactions
        db.delete(conversationParticipants).where(eq(conversationParticipants.playerId, id)),
        db.delete(messageReactions).where(eq(messageReactions.reactorPlayerId, id)),
        // Coach reviews and prompts
        db.delete(coachReviews).where(eq(coachReviews.playerId, id)),
        db.delete(reviewPrompts).where(eq(reviewPrompts.playerId, id)),
        // Player matches (initiator or receiver)
        db.delete(playerMatches).where(
          or(eq(playerMatches.initiatorId, id), eq(playerMatches.receiverId, id))
        ),
        // Player connections (either party)
        db.delete(playerConnections).where(
          or(eq(playerConnections.player1Id, id), eq(playerConnections.player2Id, id))
        ),
        // Court bookings
        db.delete(courtBookings).where(eq(courtBookings.playerId, id)),
        // Note: coachEarnings has no playerId - it's coach-level
      ]);
      
      // Second batch: chat messages and parent relations
      await Promise.all([
        db.delete(messages).where(eq(messages.senderPlayerId, id)),
        db.delete(parentPlayerRelations).where(eq(parentPlayerRelations.playerId, id)),
      ]);
      
      // Third batch: billing tables (order matters due to FKs)
      await db.delete(paymentReminders).where(eq(paymentReminders.playerId, id));
      await db.delete(refunds).where(
        inArray(refunds.paymentId, 
          db.select({ id: payments.id }).from(payments).where(eq(payments.playerId, id))
        )
      );
      await db.delete(payments).where(eq(payments.playerId, id));
      await db.delete(invoices).where(eq(invoices.playerId, id));
      await db.delete(playerSubscriptions).where(eq(playerSubscriptions.playerId, id));
      await db.delete(packages).where(eq(packages.playerId, id));
      
      // Update users table to unlink the player
      await db.update(users).set({ playerId: null }).where(eq(users.playerId, id));
      
      // Finally delete the player
      const result = await db
        .delete(players)
        .where(and(eq(players.id, id), eq(players.academyId, academyId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in deletePlayer transaction:", error);
      throw error;
    }
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
    return db.select().from(packages).where(eq(packages.playerId, playerId));
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
    
    const availableCredits = matchingPackages.reduce((sum, pkg) => sum + pkg.remainingCredits, 0);
    
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

  async deletePackage(id: string, academyId?: string, force: boolean = false): Promise<{ success: boolean; error?: string; creditsUsed?: number }> {
    const pkg = await this.getPackage(id, academyId);
    if (!pkg) {
      return { success: false, error: "Package not found" };
    }
    
    const creditsUsed = pkg.totalCredits - pkg.remainingCredits;
    
    if (creditsUsed > 0 && !force) {
      return { 
        success: false, 
        error: `Cannot delete: ${creditsUsed} credit(s) already used from this package`,
        creditsUsed 
      };
    }
    
    // Use transaction to cascade delete all dependent records
    // Dependency chain: packages → invoices → payments → refunds
    await db.transaction(async (tx) => {
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

  async usePackageCredit(packageId: string, academyId?: string): Promise<Package | undefined> {
    const pkg = await this.getPackage(packageId, academyId);
    if (!pkg || pkg.remainingCredits <= 0) return undefined;
    
    const result = await db
      .update(packages)
      .set({ remainingCredits: pkg.remainingCredits - 1 })
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

  async deductTypedCreditsForSession(
    playerId: string,
    sessionType: string,
    sessionId: string,
    academyId?: string,
    sessionPlayerId?: string // Optional: target specific session_player record
  ): Promise<{ success: boolean; package?: Package; creditType?: string; transactionId?: string; reason?: string }> {
    // Map session types to credit types
    const sessionToCreditType: Record<string, string> = {
      private: "private",
      semi: "semi_private",
      semi_private: "semi_private",
      group: "group",
    };
    
    const requiredCreditType = sessionToCreditType[sessionType] || "group";
    const activePackages = await this.getActivePlayerPackages(playerId, academyId);
    
    // Filter packages with matching credit type
    const matchingPackages = activePackages.filter(pkg => {
      const pkgCreditType = pkg.creditType || "group";
      return pkgCreditType === requiredCreditType && pkg.remainingCredits > 0;
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
    const balanceBefore = packageToUse.remainingCredits;
    const balanceAfter = balanceBefore - 1;
    
    // Deduct credit from package
    const updatedPackage = await this.usePackageCredit(packageToUse.id, academyId);
    
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
      amount: -1,
      reason: "session_booking",
      sessionId,
      balanceBefore,
      balanceAfter,
      metadata: JSON.stringify({
        sessionType,
        bookedBy: "coach",
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
        creditTransactionId: transaction.id,
      })
      .where(whereClause);
    
    return { 
      success: true, 
      package: updatedPackage, 
      creditType: requiredCreditType,
      transactionId: transaction.id,
    };
  },

  async refundCreditsForSession(
    playerId: string,
    sessionId: string,
    academyId?: string
  ): Promise<{ success: boolean; creditType?: string; reason?: string; alreadyRefunded?: boolean; debtRemoved?: boolean }> {
    // Find the original debit transaction for this session
    const transactions = await this.getCreditTransactionsBySession(sessionId);
    
    // First check for regular session_booking transactions
    let originalDebit = transactions.find(
      t => t.playerId === playerId && t.type === "debit" && t.reason === "session_booking"
    );
    
    // If no session_booking found, check for session_join_debt (players without packages)
    if (!originalDebit) {
      const debtTransaction = transactions.find(
        t => t.playerId === playerId && t.type === "debit" && t.reason === "session_join_debt"
      );
      
      if (debtTransaction) {
        // Remove the debt transaction (no package to refund to)
        await db.delete(creditTransactions).where(eq(creditTransactions.id, debtTransaction.id));
        
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
        
        console.log(`[Refund] Removed debt transaction for player ${playerId} in session ${sessionId}`);
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
    
    // Refund credit to package
    const balanceBefore = pkg.remainingCredits;
    const balanceAfter = balanceBefore + 1;
    
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
      amount: 1,
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
    const result = await db
      .update(sessions)
      .set(data)
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
    return result[0];
  },

  // Conflict checking
  async checkCoachConflict(coachId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string): Promise<boolean> {
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
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
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
    
    const conflicts = await db.select().from(sessions).where(and(...conditions));
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
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
    
    if (existing.length > 0) {
      // Update existing record
      const result = await db
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
      return result[0];
    } else {
      // Insert new record
      const result = await db
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
      console.log(`[Attendance] Created new session_player record for session ${sessionId}, player ${playerId}, status ${status}`);
      return result[0];
    }
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
    const result = await db
      .update(coachingSeries)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(coachingSeries.id, id))
      .returning();
    return result[0];
  },

  async deleteCoachingSeries(id: string): Promise<void> {
    // First delete all series players
    await db.delete(seriesPlayers).where(eq(seriesPlayers.seriesId, id));
    // Then delete the series
    await db.delete(coachingSeries).where(eq(coachingSeries.id, id));
  },

  // ==================== SERIES PLAYERS ====================
  async getSeriesPlayers(seriesId: string): Promise<SeriesPlayer[]> {
    return db
      .select()
      .from(seriesPlayers)
      .where(eq(seriesPlayers.seriesId, seriesId))
      .orderBy(asc(seriesPlayers.joinedAt));
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

  // ==================== COACH UPDATE ====================
  async updateCoach(id: string, data: Partial<InsertCoach>): Promise<Coach> {
    const result = await db.update(coaches).set(data).where(eq(coaches.id, id)).returning();
    return result[0];
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

  async getPlayerDomainXpSummary(playerId: string): Promise<{ domainId: string; totalXp: number; observationCount: number; avgDelta: number; lastObservation: Date | null }[]> {
    const allDomains = await db.select().from(skillDomains);
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.playerId, playerId));
    
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
            gte(messages.createdAt, lastRead),
            ne(messages.senderCoachId, coachId),
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
            gte(messages.createdAt, lastRead),
            ne(messages.senderPlayerId, playerId),
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

  async getConversationForPlayer(conversationId: string, playerId: string, academyId: string): Promise<Conversation | undefined> {
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
    
    if (participant.length === 0) {
      const conv = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.playerId, playerId),
            eq(conversations.academyId, academyId)
          )
        );
      return conv[0];
    }
    
    const conv = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.academyId, academyId)
        )
      );
    return conv[0];
  },

  async getMessagesForPlayer(conversationId: string, playerId: string, academyId: string, limit: number = 50): Promise<Message[]> {
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
            gte(messages.createdAt, lastRead),
            ne(messages.senderPlayerId, playerId),
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
    // Check if token already exists, update if so
    const existing = await db.select().from(pushDeviceTokens).where(eq(pushDeviceTokens.token, data.token));
    if (existing.length > 0) {
      const updated = await db.update(pushDeviceTokens)
        .set({ isActive: true, lastUsedAt: new Date(), coachId: data.coachId })
        .where(eq(pushDeviceTokens.token, data.token))
        .returning();
      return updated[0];
    }
    const result = await db.insert(pushDeviceTokens).values(data).returning();
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
    return result[0];
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
  async createCreditTransaction(data: InsertCreditTransaction): Promise<CreditTransaction> {
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
            if (linked.rows[0] && (linked.rows[0] as any).remaining_credits > 0) {
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
                AND remaining_credits > 0
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
          const balanceBefore = packageToUse.remainingCredits;
          const balanceAfter = balanceBefore - 1;
          
          // STEP 1: Try to claim the ledger entry FIRST using ON CONFLICT with the partial unique index
          // The index credit_transactions_unique_session_join enforces uniqueness on (player_id, session_id) where reason='session_join'
          // This is the authoritative race-condition guard at the database level
          try {
            const insertResult = await tx.execute(sql`
              INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
              VALUES (${member.playerId}, ${academyId}, ${sessionId}, ${packageToUse.id}, 'debit', ${creditType}, -1, 'session_join', ${balanceBefore}, ${balanceAfter}, 
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
  // For semi-private sessions: if only 1 player present, charge private credits instead
  async consumeCreditsForClassSessionWithAttendance(
    seriesId: string, 
    sessionId: string, 
    sessionDate: Date, 
    presentPlayerIds: string[],
    presentCount: number
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
    
    // Map session type to credit type with dynamic override
    const normalizeType = (type: string | undefined): string => {
      if (!type) return "group";
      const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
      if (normalized === "semi" || normalized === "semi_private") return "semi_private";
      if (normalized === "private") return "private";
      return "group";
    };
    
    let requiredCreditType = normalizeType(series?.sessionType);
    
    // Dynamic credit type: semi-private with only 1 player becomes private
    if ((requiredCreditType === "semi_private") && presentCount === 1) {
      requiredCreditType = "private";
      console.log(`[Credits] Session ${sessionId}: Semi-private with 1 player, charging as private`);
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
              AND remaining_credits > 0
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
            // No package found - create a DEBT transaction (negative balance)
            // This allows players to attend without credits and tracks what they owe
            try {
              const debtResult = await tx.execute(sql`
                INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
                VALUES (${playerId}, ${academyId}, ${sessionId}, NULL, 'debit', ${requiredCreditType}, -1, 'session_join_debt', 0, -1, 
                       ${JSON.stringify({ seriesId, description: `Debt: ${requiredCreditType} credit owed (no package)`, isDebt: true, actualCreditType: requiredCreditType })}::jsonb)
                ON CONFLICT DO NOTHING
                RETURNING id
              `);
              
              if (debtResult.rowCount === 0) {
                results.skipped++;
              } else {
                results.consumed++;
                console.log(`[Credits] Player ${playerId}: Created debt transaction for ${requiredCreditType} credit`);
              }
            } catch (debtError: any) {
              if (debtError.code === '23505') {
                results.skipped++;
              } else {
                console.error(`[Credits] Debt transaction error for player ${playerId}:`, debtError);
                results.errors.push(`Debt transaction failed for player ${playerId}`);
              }
            }
            return;
          }
          
          creditType = packageToUse.creditType || requiredCreditType;
          const balanceBefore = packageToUse.remainingCredits;
          const balanceAfter = balanceBefore - 1;
          
          // STEP 1: Try to claim the ledger entry FIRST using ON CONFLICT
          try {
            const insertResult = await tx.execute(sql`
              INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
              VALUES (${playerId}, ${academyId}, ${sessionId}, ${packageToUse.id}, 'debit', ${creditType}, -1, 'session_join', ${balanceBefore}, ${balanceAfter}, 
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
    
    const total = playerPackages.reduce((sum, p) => sum + p.remainingCredits, 0);
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
  async getPlayerCreditBalanceByType(playerId: string): Promise<{
    group: number;
    semi_private: number;
    private: number;
    totalDebt: number;
    hasDebt: boolean;
  }> {
    // Get available credits from active packages grouped by type
    const playerPackages = await db.select().from(packages)
      .where(and(
        eq(packages.playerId, playerId),
        eq(packages.status, "active")
      ));
    
    const credits = { group: 0, semi_private: 0, private: 0 };
    for (const pkg of playerPackages) {
      const creditType = (pkg.creditType || "group") as keyof typeof credits;
      if (credits[creditType] !== undefined) {
        credits[creditType] += pkg.remainingCredits;
      }
    }
    
    // Get debt transactions (session_join_debt where package_id is NULL)
    const debtTransactions = await db.select().from(creditTransactions)
      .where(and(
        eq(creditTransactions.playerId, playerId),
        eq(creditTransactions.reason, "session_join_debt")
      ));
    
    const debts = { group: 0, semi_private: 0, private: 0 };
    for (const tx of debtTransactions) {
      const creditType = (tx.creditType || "group") as keyof typeof debts;
      if (debts[creditType] !== undefined) {
        debts[creditType] += Math.abs(tx.amount); // Transactions are negative, convert to positive debt count
      }
    }
    
    // Calculate net balance per type (credits - debts)
    const totalDebt = debts.group + debts.semi_private + debts.private;
    
    return {
      group: credits.group - debts.group,
      semi_private: credits.semi_private - debts.semi_private,
      private: credits.private - debts.private,
      totalDebt,
      hasDebt: totalDebt > 0,
    };
  },

  // Get credit balances for multiple players (batch query for efficiency)
  async getPlayersCreditBalances(playerIds: string[]): Promise<Record<string, {
    group: number;
    semi_private: number;
    private: number;
    totalDebt: number;
    hasDebt: boolean;
  }>> {
    if (playerIds.length === 0) return {};
    
    const result: Record<string, { group: number; semi_private: number; private: number; totalDebt: number; hasDebt: boolean }> = {};
    
    // Initialize all players
    for (const id of playerIds) {
      result[id] = { group: 0, semi_private: 0, private: 0, totalDebt: 0, hasDebt: false };
    }
    
    // Get all active packages for these players
    const playerPackages = await db.select().from(packages)
      .where(and(
        inArray(packages.playerId, playerIds),
        eq(packages.status, "active")
      ));
    
    for (const pkg of playerPackages) {
      const creditType = (pkg.creditType || "group") as "group" | "semi_private" | "private";
      if (result[pkg.playerId] && result[pkg.playerId][creditType] !== undefined) {
        result[pkg.playerId][creditType] += pkg.remainingCredits;
      }
    }
    
    // Get debt transactions for these players
    const debtTransactions = await db.select().from(creditTransactions)
      .where(and(
        inArray(creditTransactions.playerId, playerIds),
        eq(creditTransactions.reason, "session_join_debt")
      ));
    
    for (const tx of debtTransactions) {
      const creditType = (tx.creditType || "group") as "group" | "semi_private" | "private";
      if (result[tx.playerId] && result[tx.playerId][creditType] !== undefined) {
        const debtAmount = Math.abs(tx.amount);
        result[tx.playerId][creditType] -= debtAmount;
        result[tx.playerId].totalDebt += debtAmount;
        result[tx.playerId].hasDebt = true;
      }
    }
    
    return result;
  },

  // Consume a single credit for a specific player+session (used for backfilling attendance)
  // Returns true if credit was consumed, false if no credits available or already consumed
  // linkedPackageId: If provided, prefer this package first (from series membership)
  // sessionType: The type of session (group, private, semi_private) - credits must match
  async consumeSingleCreditForSession(playerId: string, sessionId: string, academyId?: string, linkedPackageId?: string | null, sessionType?: string): Promise<boolean> {
    try {
      // Map session types to credit types (normalize naming)
      const normalizeType = (type: string | undefined): string => {
        if (!type) return "group"; // default
        const normalized = type.toLowerCase().replace("-", "_").replace(" ", "_");
        if (normalized === "semi" || normalized === "semi_private") return "semi_private";
        if (normalized === "private") return "private";
        return "group"; // default for group, physical, activity, etc.
      };
      
      const requiredCreditType = normalizeType(sessionType);
      
      return await db.transaction(async (tx) => {
        let packageToUse = null;
        
        // Priority 1: Check linkedPackageId first if provided AND has matching credit type
        if (linkedPackageId) {
          const linkedResult = await tx.execute(sql`
            SELECT * FROM packages 
            WHERE id = ${linkedPackageId} 
              AND status = 'active' 
              AND remaining_credits > 0
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
              AND remaining_credits > 0
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
        
        const balanceBefore = packageToUse.remaining_credits;
        const balanceAfter = balanceBefore - 1;
        const creditType = packageToUse.credit_type || requiredCreditType;
        
        // Try to insert ledger entry (prevents duplicate deductions)
        try {
          const insertResult = await tx.execute(sql`
            INSERT INTO credit_transactions (player_id, academy_id, session_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
            VALUES (${playerId}, ${academyId || null}, ${sessionId}, ${packageToUse.id}, 'debit', ${creditType}, -1, 'session_join', ${balanceBefore}, ${balanceAfter}, 
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
        
        console.log(`[Credits] Consumed 1 ${creditType} credit for player ${playerId}, session ${sessionId}. Balance: ${balanceBefore} -> ${balanceAfter}`);
        return true;
      });
    } catch (error) {
      console.error(`[Credits] Error consuming credit for player ${playerId}:`, error);
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
      await db.select().from(users).limit(1);
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
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
  
  async isUserAcademyOwner(userId: string, academyId: string): Promise<boolean> {
    // Check multiple ownership paths:
    
    // 1. Direct ownership via academies.ownerId -> coaches -> users
    const directOwnership = await db
      .select({ id: academies.id })
      .from(academies)
      .innerJoin(coaches, eq(academies.ownerId, coaches.id))
      .innerJoin(users, eq(coaches.userId, users.id))
      .where(and(eq(users.id, userId), eq(academies.id, academyId)))
      .limit(1);
    if (directOwnership.length > 0) return true;
    
    // 2. Membership via coachAcademyMemberships with role academy_owner
    const membershipOwnership = await db
      .select({ id: coachAcademyMemberships.id })
      .from(coachAcademyMemberships)
      .innerJoin(coaches, eq(coachAcademyMemberships.coachId, coaches.id))
      .innerJoin(users, eq(coaches.userId, users.id))
      .where(and(
        eq(users.id, userId),
        eq(coachAcademyMemberships.academyId, academyId),
        eq(coachAcademyMemberships.role, "academy_owner"),
        eq(coachAcademyMemberships.isActive, true)
      ))
      .limit(1);
    if (membershipOwnership.length > 0) return true;
    
    // 3. User's default academy with academy_owner role
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
      
      const sessionData: InsertSession = {
        academyId: bookingData.academyId,
        coachId: bookingData.coachId || coachId,
        locationId: bookingData.locationId,
        courtId: bookingData.courtId,
        startTime: bookingData.requestedStart,
        endTime: bookingData.requestedEnd,
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
  }): Promise<Array<{
    coachId: string;
    locationId: string | null;
    courtId: string | null;
    startTime: Date;
    endTime: Date;
  }>> {
    const conditions: any[] = [eq(coachAvailability.academyId, params.academyId), eq(coachAvailability.isActive, true)];
    
    if (params.coachId) {
      conditions.push(eq(coachAvailability.coachId, params.coachId));
    }
    if (params.locationId) {
      conditions.push(eq(coachAvailability.locationId, params.locationId));
    }
    
    const availabilitySlots = await db.select().from(coachAvailability)
      .where(and(...conditions));
    
    const sessionConditions: any[] = [
      eq(sessions.academyId, params.academyId),
      gte(sessions.startTime, params.startDate),
      lte(sessions.endTime, params.endDate),
      ne(sessions.status, "cancelled"),
    ];
    
    if (params.coachId) {
      sessionConditions.push(eq(sessions.coachId, params.coachId));
    }
    
    const existingSessions = await db.select().from(sessions)
      .where(and(...sessionConditions));
    
    const pendingConditions: any[] = [
      eq(bookingRequests.academyId, params.academyId),
      eq(bookingRequests.status, "pending"),
      gte(bookingRequests.requestedStart, params.startDate),
      lte(bookingRequests.requestedEnd, params.endDate),
    ];
    
    if (params.coachId) {
      pendingConditions.push(eq(bookingRequests.coachId, params.coachId));
    }
    
    const pendingRequests = await db.select().from(bookingRequests)
      .where(and(...pendingConditions));
    
    const availableSlots: Array<{
      coachId: string;
      locationId: string | null;
      courtId: string | null;
      startTime: Date;
      endTime: Date;
    }> = [];
    
    const currentDate = new Date(params.startDate);
    while (currentDate <= params.endDate) {
      const weekday = currentDate.getDay();
      
      const dayAvailability = availabilitySlots.filter(a => a.weekday === weekday);
      
      for (const availability of dayAvailability) {
        const [startHour, startMin] = availability.startTime.split(':').map(Number);
        const [endHour, endMin] = availability.endTime.split(':').map(Number);
        
        const slotStart = new Date(currentDate);
        slotStart.setHours(startHour, startMin, 0, 0);
        
        const availabilityEnd = new Date(currentDate);
        availabilityEnd.setHours(endHour, endMin, 0, 0);
        
        const slotDuration = availability.slotDuration || params.duration;
        
        while (slotStart.getTime() + slotDuration * 60000 <= availabilityEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
          
          const hasConflict = existingSessions.some(session => 
            session.coachId === availability.coachId &&
            session.startTime && session.endTime &&
            slotStart < session.endTime && slotEnd > session.startTime
          );
          
          const hasPendingConflict = pendingRequests.some(req =>
            req.coachId === availability.coachId &&
            req.requestedStart && req.requestedEnd &&
            slotStart < req.requestedEnd && slotEnd > req.requestedStart
          );
          
          if (!hasConflict && !hasPendingConflict) {
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
      
      currentDate.setDate(currentDate.getDate() + 1);
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
    const canBook = court.courts.visibility === "public" || 
      (court.courts.visibility === "academy" && court.courts.academyId === userAcademyId);

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

    return existingBooking.length === 0;
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
};
