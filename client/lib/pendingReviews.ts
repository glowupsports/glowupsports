import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_REVIEWS_KEY = "coach-pending-reviews-v1";

export interface PendingReviewEntry {
  sessionId: string;
  startTime: string;
  sessionType: string;
  players: { id: string; name: string; attendanceStatus?: string; ballLevel?: string | null }[];
  playerCount: number;
  needsGroupDynamics: boolean;
  cardType: "private" | "semi_private" | "group";
  savedAt: string;
  /** Expo notification identifier for the 20:00 reminder, so it can be cancelled on completion. */
  reminderNotificationId?: string;
}

export async function getPendingReviews(): Promise<PendingReviewEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_REVIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addPendingReview(entry: PendingReviewEntry): Promise<void> {
  const existing = await getPendingReviews();
  const filtered = existing.filter((e) => e.sessionId !== entry.sessionId);
  await AsyncStorage.setItem(PENDING_REVIEWS_KEY, JSON.stringify([...filtered, entry]));
}

/**
 * Remove a pending review by sessionId.
 * Returns the removed entry (including any reminderNotificationId) so the caller
 * can cancel the scheduled Expo notification if one was registered.
 */
export async function removePendingReview(sessionId: string): Promise<PendingReviewEntry | null> {
  const existing = await getPendingReviews();
  const removed = existing.find((e) => e.sessionId === sessionId) ?? null;
  const filtered = existing.filter((e) => e.sessionId !== sessionId);
  await AsyncStorage.setItem(PENDING_REVIEWS_KEY, JSON.stringify(filtered));
  return removed;
}
