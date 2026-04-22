import { db } from "../db";
import { playerConnections } from "@shared/schema";
import { and, eq, inArray, or } from "drizzle-orm";

export type FriendStatus = "friends" | "pending_sent" | "pending_received" | "none";

export interface FriendStatusInfo {
  status: Exclude<FriendStatus, "none">;
  connectionId: string;
}

/**
 * Build a map of `candidatePlayerId -> { status, connectionId }` describing the
 * viewer's friend connection with each candidate.
 *
 * Since Task #973 a unique index on the unordered (player1Id, player2Id) pair
 * (scoped to connectionType='friend') guarantees at most one row per pair, so
 * the conflict resolution below is effectively unreachable for new data. It is
 * kept as a defensive no-op in case any rows ever slip through (e.g. during a
 * future migration window): accepted > pending_received > pending_sent.
 *
 * Returns an empty map on any DB failure so the caller can still respond with
 * the players list (with friendStatus defaulting to "none").
 */
export async function buildFriendStatusMap(
  viewerPlayerId: string,
  candidatePlayerIds: string[],
): Promise<Map<string, FriendStatusInfo>> {
  const result = new Map<string, FriendStatusInfo>();
  if (!viewerPlayerId || candidatePlayerIds.length === 0) return result;

  try {
    const conns = await db
      .select({
        id: playerConnections.id,
        player1Id: playerConnections.player1Id,
        player2Id: playerConnections.player2Id,
        status: playerConnections.status,
      })
      .from(playerConnections)
      .where(
        and(
          eq(playerConnections.connectionType, "friend"),
          or(
            and(
              eq(playerConnections.player1Id, viewerPlayerId),
              inArray(playerConnections.player2Id, candidatePlayerIds),
            ),
            and(
              eq(playerConnections.player2Id, viewerPlayerId),
              inArray(playerConnections.player1Id, candidatePlayerIds),
            ),
          )!,
        ),
      );

    for (const c of conns) {
      const otherId = c.player1Id === viewerPlayerId ? c.player2Id : c.player1Id;
      const existing = result.get(otherId);
      // accepted always wins
      if (existing?.status === "friends") continue;
      if (c.status === "accepted") {
        result.set(otherId, { status: "friends", connectionId: c.id });
        continue;
      }
      if (c.status === "pending") {
        const iAmRequester = c.player1Id === viewerPlayerId;
        const next: FriendStatusInfo = {
          status: iAmRequester ? "pending_sent" : "pending_received",
          connectionId: c.id,
        };
        // pending_received > pending_sent (the user has actionable work)
        if (existing?.status === "pending_received" && next.status === "pending_sent") {
          continue;
        }
        result.set(otherId, next);
      }
    }
  } catch (err) {
    console.error("[friendStatus] batch query failed:", err);
  }

  return result;
}

