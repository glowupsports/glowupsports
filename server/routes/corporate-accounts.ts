import { Router, type Response } from "express";
import { db } from "../db";
import { corporateStorage } from "../storage";
import { eq, and, desc } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireAcademy,
  type AuthenticatedRequest,
} from "../auth";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";
import {
  corporateAccountInputSchema,
  addCorporateCreditsSchema,
  players,
  academies,
  users,
  corporateMembers,
  corporateAccounts,
} from "@shared/schema";
import { sendCorporateEmployeeInviteEmail, sendCorporateMonthlyReportEmail } from "../emailService";
import { storage } from "../storage";

const router = Router();

// ===== ACADEMY ADMIN: Corporate Accounts Management =====

// GET /api/corporate-accounts - list all corporate accounts for academy
router.get(
  "/api/corporate-accounts",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const accounts = await corporateStorage.getCorporateAccounts(academyId);
      res.json(accounts);
    } catch (error) {
      console.error("[Corporate] Error fetching accounts:", error);
      res.status(500).json({ error: "Failed to fetch corporate accounts" });
    }
  },
);

// POST /api/corporate-accounts - create a new corporate account
router.post(
  "/api/corporate-accounts",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const parsed = corporateAccountInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { companyName, contactName, contactEmail, creditBalance, notes } = parsed.data;

      // Always create with 0 balance; then top-up records a proper transaction
      const account = await corporateStorage.createCorporateAccount({
        academyId,
        companyName,
        contactName,
        contactEmail,
        creditBalance: 0,
        isActive: true,
        notes,
      });

      let finalAccount = account;
      if (creditBalance && creditBalance > 0) {
        finalAccount = await corporateStorage.addCorporateCredits(
          account.id,
          academyId,
          creditBalance,
          "top_up",
          "Initial credit balance",
          req.user!.userId,
        );
      }

      res.status(201).json(finalAccount);
    } catch (error) {
      console.error("[Corporate] Error creating account:", error);
      res.status(500).json({ error: "Failed to create corporate account" });
    }
  },
);

// GET /api/corporate-accounts/:id - get a single corporate account with members and transactions
router.get(
  "/api/corporate-accounts/:id",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }
      const members = await corporateStorage.getCorporateMembers(id);
      const transactions = await corporateStorage.getCorporateTransactions(id);
      const usageReport = await corporateStorage.getCorporateUsageReport(id);

      // Enrich members with player info
      const enrichedMembers = await Promise.all(
        members.map(async (m) => {
          if (m.playerId) {
            const player = await storage.getPlayer(m.playerId);
            return { ...m, playerName: player?.name };
          }
          return m;
        }),
      );

      res.json({ account, members: enrichedMembers, transactions, usageReport });
    } catch (error) {
      console.error("[Corporate] Error fetching account:", error);
      res.status(500).json({ error: "Failed to fetch corporate account" });
    }
  },
);

// PATCH /api/corporate-accounts/:id - update corporate account
router.patch(
  "/api/corporate-accounts/:id",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }
      const updateSchema = z.object({
        companyName: z.string().min(2).optional(),
        contactName: z.string().min(2).optional(),
        contactEmail: z.string().email().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const updated = await corporateStorage.updateCorporateAccount(id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("[Corporate] Error updating account:", error);
      res.status(500).json({ error: "Failed to update corporate account" });
    }
  },
);

// POST /api/corporate-accounts/:id/top-up - add credits to corporate account
router.post(
  "/api/corporate-accounts/:id/top-up",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }
      const parsed = addCorporateCreditsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { amount, notes } = parsed.data;
      const updated = await corporateStorage.addCorporateCredits(
        id,
        academyId,
        amount,
        "top_up",
        notes,
      );
      res.json(updated);
    } catch (error) {
      console.error("[Corporate] Error topping up credits:", error);
      res.status(500).json({ error: "Failed to top up credits" });
    }
  },
);

// POST /api/corporate-accounts/:id/invite - invite an employee
router.post(
  "/api/corporate-accounts/:id/invite",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const userId = req.user!.userId;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }

      const inviteSchema = z.object({
        email: z.string().email("Valid email is required"),
      });
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { email } = parsed.data;

      // Check if already invited
      const existing = await corporateStorage.getCorporateMemberByEmail(id, email);
      if (existing && existing.inviteStatus !== "declined") {
        return res.status(409).json({ error: "This email has already been invited" });
      }

      // Generate invite token
      const inviteToken = crypto.randomBytes(16).toString("hex");

      // Check if player already exists with this email
      const existingPlayer = await db.select().from(players).where(eq(players.email, email.toLowerCase())).limit(1);
      const playerId = existingPlayer.length > 0 ? existingPlayer[0].id : undefined;

      const member = await corporateStorage.createCorporateMember({
        corporateAccountId: id,
        playerId: playerId ?? null,
        inviteEmail: email,
        inviteToken,
        inviteStatus: "pending",
        invitedBy: userId,
      });

      // If player already exists, auto-accept (no token needed — they can join directly)
      if (playerId) {
        await corporateStorage.updateCorporateMember(member.id, {
          inviteStatus: "accepted",
          playerId,
          acceptedAt: new Date(),
          inviteToken: undefined,
        });
        res.status(201).json({ member, message: "Player automatically added as corporate member" });
        return;
      }

      // Player not in system yet — send invite email with token
      const academy = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, academyId)).limit(1);
      const academyName = academy[0]?.name ?? "your academy";

      try {
        await sendCorporateEmployeeInviteEmail({
          to: email,
          companyName: account.companyName,
          contactName: account.contactName,
          academyName,
          inviteToken,
        });
      } catch (emailErr) {
        console.error("[Corporate] Failed to send invite email:", emailErr);
      }

      res.status(201).json({ member, message: "Invitation sent" });
    } catch (error) {
      console.error("[Corporate] Error inviting employee:", error);
      res.status(500).json({ error: "Failed to invite employee" });
    }
  },
);

// GET /api/corporate-accounts/:id/report - get usage report
router.get(
  "/api/corporate-accounts/:id/report",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }
      const report = await corporateStorage.getCorporateUsageReport(id);
      const transactions = await corporateStorage.getCorporateTransactions(id);
      res.json({ account, report, transactions });
    } catch (error) {
      console.error("[Corporate] Error getting report:", error);
      res.status(500).json({ error: "Failed to get usage report" });
    }
  },
);

// GET /api/corporate-accounts/:id/export-csv - export usage as CSV
router.get(
  "/api/corporate-accounts/:id/export-csv",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }
      const report = await corporateStorage.getCorporateUsageReport(id);
      const members = await corporateStorage.getCorporateMembers(id);
      const transactions = await corporateStorage.getCorporateTransactions(id);

      // Build CSV for member usage
      const memberLines = report.memberUsage.map((u) => {
        const member = members.find((m) => m.inviteEmail === u.inviteEmail);
        return `"${u.inviteEmail}","${u.creditsUsed}","${u.sessionCount}"`;
      });
      const csvMembers = [
        `"Email","Credits Used","Sessions"`,
        ...memberLines,
      ].join("\n");

      // Build CSV for transactions
      const txLines = transactions.map((t) => {
        const date = new Date(t.createdAt!).toISOString().slice(0, 10);
        return `"${date}","${t.type}","${t.amount}","${t.reason}","${t.notes || ""}"`;
      });
      const csvTransactions = [
        `"Date","Type","Amount","Reason","Notes"`,
        ...txLines,
      ].join("\n");

      const csv = `Corporate Account: ${account.companyName}\nBalance: ${account.creditBalance}\n\nMember Usage\n${csvMembers}\n\nTransaction History\n${csvTransactions}`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${account.companyName.replace(/[^a-z0-9]/gi, "_")}_report.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("[Corporate] Error exporting CSV:", error);
      res.status(500).json({ error: "Failed to export report" });
    }
  },
);

// POST /api/corporate-accounts/:id/send-report - send monthly report email to company contact
router.post(
  "/api/corporate-accounts/:id/send-report",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner", "coach"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }

      const members = await corporateStorage.getCorporateMembers(id);
      const report = await corporateStorage.getCorporateUsageReport(id);
      const academy = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, academyId)).limit(1);
      const academyName = academy[0]?.name ?? "the academy";

      // Enrich member usage with player names
      const enrichedUsage = await Promise.all(
        report.memberUsage.map(async (u) => {
          const player = u.playerId ? await storage.getPlayer(u.playerId) : null;
          return { ...u, playerName: player?.name };
        }),
      );

      const activeMembers = members.filter((m) => m.inviteStatus === "accepted").length;
      const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

      const emailResult = await sendCorporateMonthlyReportEmail({
        to: account.contactEmail,
        companyName: account.companyName,
        academyName,
        month,
        creditBalance: account.creditBalance,
        totalCreditsUsed: report.totalCreditsUsed,
        activeMembers,
        memberUsage: enrichedUsage,
      });

      if (!emailResult.success) {
        return res.status(500).json({ error: "Failed to send email report" });
      }

      res.json({ success: true, message: `Report emailed to ${account.contactEmail}` });
    } catch (error) {
      console.error("[Corporate] Error sending report:", error);
      res.status(500).json({ error: "Failed to send report" });
    }
  },
);

// DELETE /api/corporate-accounts/:id - delete (deactivate) a corporate account
router.delete(
  "/api/corporate-accounts/:id",
  authMiddleware,
  requireAcademy,
  requireRole(["academy_owner"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const account = await corporateStorage.getCorporateAccount(id);
      if (!account || account.academyId !== academyId) {
        return res.status(404).json({ error: "Corporate account not found" });
      }
      await corporateStorage.updateCorporateAccount(id, { isActive: false });
      res.json({ success: true, message: "Corporate account deactivated" });
    } catch (error) {
      console.error("[Corporate] Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete corporate account" });
    }
  },
);

// ===== PLAYER / COMPANY CONTACT: Corporate Member Flow =====

// POST /api/corporate/accept-invite - employee accepts invite with token
router.post(
  "/api/corporate/accept-invite",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "You must have a player profile to accept a corporate invite" });
      }

      const schema = z.object({
        token: z.string().min(1, "Invite token is required"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { token } = parsed.data;

      const member = await corporateStorage.getCorporateMemberByToken(token);
      if (!member) {
        return res.status(404).json({ error: "Invalid or expired invite token" });
      }
      if (member.inviteStatus === "accepted") {
        return res.status(409).json({ error: "This invite has already been accepted" });
      }

      // Security: validate that the invite was sent to the logged-in user's email
      const userEmail = req.user!.email;
      if (member.inviteEmail.toLowerCase() !== userEmail.toLowerCase()) {
        return res.status(403).json({ error: "This invite was not sent to your email address" });
      }

      const accepted = await corporateStorage.acceptCorporateInvite(token, playerId);
      if (!accepted) {
        return res.status(400).json({ error: "Failed to accept invite" });
      }

      const account = await corporateStorage.getCorporateAccount(member.corporateAccountId);
      res.json({ success: true, corporateAccount: account });
    } catch (error) {
      console.error("[Corporate] Error accepting invite:", error);
      res.status(500).json({ error: "Failed to accept corporate invite" });
    }
  },
);

// GET /api/corporate/my-account - get the corporate account for the current player
router.get(
  "/api/corporate/my-account",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.json({ corporateAccount: null, member: null });
      }

      const member = await corporateStorage.getCorporateMemberByPlayerId(playerId);
      if (!member) {
        return res.json({ corporateAccount: null, member: null });
      }

      const account = await corporateStorage.getCorporateAccount(member.corporateAccountId);
      if (!account || !account.isActive) {
        return res.json({ corporateAccount: null, member: null });
      }

      const transactions = await corporateStorage.getCorporateTransactions(member.corporateAccountId);
      const myTransactions = transactions.filter((t) => t.playerId === playerId);

      res.json({
        corporateAccount: account,
        member,
        myTransactions,
        companyCreditsRemaining: account.creditBalance,
      });
    } catch (error) {
      console.error("[Corporate] Error fetching player corporate account:", error);
      res.status(500).json({ error: "Failed to fetch corporate account" });
    }
  },
);

// GET /api/corporate/company-dashboard - company contact dashboard
// Access is scoped by contactEmail match: only users whose verified email was registered
// as the corporate account contact by an academy admin can view this data.
router.get(
  "/api/corporate/company-dashboard",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      // Resolve the user's verified email from the database (not just session data)
      const userRow = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow[0]?.email) {
        return res.status(403).json({ error: "Could not verify user email" });
      }
      const userEmail = userRow[0].email.toLowerCase();

      // Find accounts where this verified email is the registered corporate contact
      const allAccounts = await db.select().from(corporateAccounts).where(eq(corporateAccounts.contactEmail, userEmail));
      if (allAccounts.length === 0) {
        return res.json({ accounts: [] });
      }

      const dashboards = await Promise.all(
        allAccounts.map(async (account) => {
          const members = await corporateStorage.getCorporateMembers(account.id);
          const usageReport = await corporateStorage.getCorporateUsageReport(account.id);
          const transactions = await corporateStorage.getCorporateTransactions(account.id);
          const recentTransactions = transactions.slice(0, 20);

          const enrichedMembers = await Promise.all(
            members.map(async (m) => {
              if (m.playerId) {
                const player = await storage.getPlayer(m.playerId);
                return { ...m, playerName: player?.name };
              }
              return m;
            }),
          );

          return {
            account,
            members: enrichedMembers,
            usageReport,
            recentTransactions,
          };
        }),
      );

      res.json({ accounts: dashboards });
    } catch (error) {
      console.error("[Corporate] Error fetching company dashboard:", error);
      res.status(500).json({ error: "Failed to fetch company dashboard" });
    }
  },
);

// POST /api/corporate/company-dashboard/:accountId/invite - company contact invites employees
router.post(
  "/api/corporate/company-dashboard/:accountId/invite",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { accountId } = req.params;

      // Verify user email from DB (not session cache) before granting write access
      const userRow = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow[0]?.email) {
        return res.status(403).json({ error: "Could not verify user email" });
      }
      const userEmail = userRow[0].email.toLowerCase();

      const account = await corporateStorage.getCorporateAccount(accountId);
      if (!account || account.contactEmail !== userEmail) {
        return res.status(403).json({ error: "Access denied" });
      }

      const inviteSchema = z.object({
        email: z.string().email("Valid email is required"),
      });
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { email } = parsed.data;

      const existing = await corporateStorage.getCorporateMemberByEmail(accountId, email);
      if (existing && existing.inviteStatus !== "declined") {
        return res.status(409).json({ error: "This email has already been invited" });
      }

      const inviteToken = crypto.randomBytes(16).toString("hex");
      const existingPlayer = await db.select().from(players).where(eq(players.email, email.toLowerCase())).limit(1);
      const playerId = existingPlayer.length > 0 ? existingPlayer[0].id : undefined;

      const member = await corporateStorage.createCorporateMember({
        corporateAccountId: accountId,
        playerId: playerId ?? null,
        inviteEmail: email,
        inviteToken,
        inviteStatus: "pending",
        invitedBy: userId,
      });

      // If player already exists, auto-accept (no token email needed)
      if (playerId) {
        await corporateStorage.updateCorporateMember(member.id, {
          inviteStatus: "accepted",
          playerId,
          acceptedAt: new Date(),
          inviteToken: undefined,
        });
        res.status(201).json({ member, message: "Player automatically added as corporate member" });
        return;
      }

      // Player not in system yet — send invite email with token
      const academy = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, account.academyId)).limit(1);
      const academyName = academy[0]?.name ?? "the academy";

      try {
        await sendCorporateEmployeeInviteEmail({
          to: email,
          companyName: account.companyName,
          contactName: account.contactName,
          academyName,
          inviteToken,
        });
      } catch (emailErr) {
        console.error("[Corporate] Failed to send invite email:", emailErr);
      }

      res.status(201).json({ member, message: "Invitation sent" });
    } catch (error) {
      console.error("[Corporate] Error inviting employee from company dashboard:", error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  },
);

export default router;
