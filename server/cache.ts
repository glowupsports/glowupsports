interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly defaultTTL = 30 * 1000; // 30 seconds default

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTL;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  invalidate(keyPattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(keyPattern)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs);
    return data;
  }
}

export const apiCache = new InMemoryCache();

export const CACHE_KEYS = {
  // Coach cache keys (using function format for route compatibility)
  COACH_EARNINGS: (coachId: string) => `earnings:${coachId}`,
  COACH_SERIES: (coachId: string, status?: string) => `series:${coachId}:${status || 'all'}`,
  COACH_STATS: (coachId: string) => `stats:${coachId}`,
  COACH_CALENDAR: (coachId: string, date?: string) => `calendar:${coachId}:${date || 'default'}`,
  COACH_CONVERSATIONS: (coachId: string) => `conversations:${coachId}`,
  COACH_UNREAD_COUNT: (coachId: string) => `unread:${coachId}`,
  // Legacy aliases (camelCase)
  coachEarnings: (coachId: string) => `earnings:${coachId}`,
  coachSeries: (coachId: string) => `series:${coachId}`,
  coachStats: (coachId: string) => `stats:${coachId}`,
  coachCalendar: (coachId: string, date?: string) => `calendar:${coachId}:${date || 'default'}`,
  coachConversations: (coachId: string) => `conversations:${coachId}`,
  coachUnreadCount: (coachId: string) => `unread:${coachId}`,
  // Player/academy cache keys
  players: (academyId: string) => `players:${academyId}`,
  playerPackages: (playerId: string) => `packages:${playerId}`,
  playerCredits: (playerId: string) => `credits:${playerId}`,
};

export const CACHE_TTL = {
  // Specific endpoint TTLs
  COACH_EARNINGS: 5 * 60 * 1000,  // 5 minutes - earnings calculation is heavy
  COACH_SERIES: 5 * 60 * 1000,    // 5 minutes - series list is heavy
  CONVERSATIONS: 2 * 60 * 1000,   // 2 minutes - conversations change more often
  // Generic TTLs
  short: 15 * 1000,      // 15 seconds - for frequently changing data
  medium: 30 * 1000,     // 30 seconds - default
  long: 60 * 1000,       // 1 minute - for rarely changing data
  veryLong: 5 * 60 * 1000, // 5 minutes - for static data
};
