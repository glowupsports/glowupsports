import { db } from "./db";
import { sessions, sessionPlayers, sessionWaitlist } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export type EnrolResult =
  | { ok: true; alreadyIn: boolean }
  | { ok: false; reason: "session_gone" | "session_cancelled" | "full" };

// Tx type is intentionally loose: the optional onEnrolled callback runs inside
// the same drizzle transaction as the enrolment insert, so the caller can
// piggyback atomic side-effects (e.g. flipping a booking_request to approved).
type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Atomically enrol a player into a group session.
 *
 * This is the single canonical enrolment path for adding a player to an
 * existing group session — used by both the manual "join session" route and
 * the auto-accept-on-timeout branch of the booking expiry job. Credits are
 * NOT deducted here: they are charged later when the coach marks attendance,
 * matching the project-wide credit-on-attendance rule.
 *
 * Capacity is re-checked inside the transaction to avoid TOCTOU races against
 * a concurrent join. Offered waitlist seats count as taken.
 */
export async function enrollPlayerInGroupSession(
  sessionId: string,
  playerId: string,
  onEnrolled?: (tx: TxLike) => Promise<void>,
): Promise<EnrolResult> {
  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (!session) {
        return { ok: false, reason: "session_gone" } as const;
      }
      if (session.status === "cancelled") {
        return { ok: false, reason: "session_cancelled" } as const;
      }

      const enrolledRows = await tx
        .select({ playerId: sessionPlayers.playerId })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, sessionId));

      const alreadyIn = enrolledRows.some((r) => r.playerId === playerId);
      if (alreadyIn) {
        return { ok: true, alreadyIn: true } as const;
      }

      const offeredRows = await tx
        .select({ id: sessionWaitlist.id })
        .from(sessionWaitlist)
        .where(
          and(
            eq(sessionWaitlist.sessionId, sessionId),
            eq(sessionWaitlist.status, "offered"),
          ),
        );

      const maxPlayers = session.maxPlayers ?? 6;
      if (enrolledRows.length + offeredRows.length >= maxPlayers) {
        return { ok: false, reason: "full" } as const;
      }

      // Match the manual join insert shape: only sessionId + playerId.
      // Attendance + credit fields are populated later by the coach flow.
      await tx.insert(sessionPlayers).values({
        sessionId,
        playerId,
      });

      if (onEnrolled) {
        // Runs inside the same transaction. If it throws, the insert above is
        // rolled back, so callers can never end up enrolled-but-not-marked.
        await onEnrolled(tx);
      }

      return { ok: true, alreadyIn: false } as const;
    });
  } catch (err) {
    console.error(
      `[SessionEnrolment] enrollPlayerInGroupSession(session=${sessionId}, player=${playerId}) failed:`,
      err,
    );
    return { ok: false, reason: "session_gone" } as const;
  }
}
