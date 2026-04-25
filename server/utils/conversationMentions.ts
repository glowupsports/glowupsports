// Task #1320 — Shared helper for resolving @mentions inside player/coach
// conversation messages. Lives in `server/utils/` so both the player chat
// route (player senders) and the coach management route (coach senders) can
// share one implementation. Mirrors the pattern in chat-rooms.ts but works
// against the regular `conversations` table instead of world rooms.

import { inArray } from "drizzle-orm";
import { db } from "../db";
import { coaches, players } from "../../shared/schema";
import { storage } from "../storage";

export type ResolvedConversationMention = {
  handle: string;
  playerId: string | null;
  coachId: string | null;
  name: string;
};

const HANDLE_RE = /@([\w][\w._-]{1,30})/g;

export function extractMentionHandles(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  for (const match of body.matchAll(HANDLE_RE)) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

export async function resolveConversationMentions(params: {
  conversationId: string;
  rawHandles: string[];
  senderPlayerId?: string | null;
  academyId?: string | null;
}): Promise<ResolvedConversationMention[]> {
  const handles = Array.from(
    new Set(
      params.rawHandles
        .map((h) => h.replace(/^@/, "").trim())
        .filter((h) => h.length > 0 && h.length <= 64),
    ),
  ).slice(0, 20);
  if (handles.length === 0) return [];
  const lower = new Set(handles.map((h) => h.toLowerCase()));

  // SECURITY: Mention resolution is restricted to actual conversation
  // participants. Friends are surfaced in the client-side picker as a
  // typing convenience only — if a sender @-tags someone outside the
  // conversation, the tag is dropped here so it never becomes a stored
  // mention or triggers a push notification (which would leak message
  // preview text to non-participants).
  const parts = await storage.getConversationParticipants(
    params.conversationId,
    undefined,
    params.academyId ?? undefined,
  );
  const candidatePlayerIds = new Set<string>(
    parts.filter((p) => p.playerId).map((p) => p.playerId as string),
  );
  const candidateCoachIds = new Set<string>(
    parts.filter((p) => p.coachId).map((p) => p.coachId as string),
  );

  const matched = new Map<string, ResolvedConversationMention>();
  if (candidatePlayerIds.size > 0) {
    const rows = await db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(inArray(players.id, Array.from(candidatePlayerIds)));
    for (const r of rows) {
      if (!r.name) continue;
      const key = r.name.replace(/\s+/g, "").toLowerCase();
      if (lower.has(key) && !matched.has(key)) {
        matched.set(key, {
          handle: key,
          playerId: r.id,
          coachId: null,
          name: r.name,
        });
      }
    }
  }
  if (candidateCoachIds.size > 0) {
    const rows = await db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(inArray(coaches.id, Array.from(candidateCoachIds)));
    for (const r of rows) {
      if (!r.name) continue;
      const key = r.name.replace(/\s+/g, "").toLowerCase();
      // Player matches win on collision — keeps behavior deterministic.
      if (lower.has(key) && !matched.has(key)) {
        matched.set(key, {
          handle: key,
          playerId: null,
          coachId: r.id,
          name: r.name,
        });
      }
    }
  }

  const out: ResolvedConversationMention[] = [];
  for (const original of handles) {
    const m = matched.get(original.toLowerCase());
    if (m) out.push({ ...m, handle: original });
  }
  return out;
}
