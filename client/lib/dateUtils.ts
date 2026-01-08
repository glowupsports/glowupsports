export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

export function filterSessionsByDate<T extends { startTime: string; status?: string | null }>(
  sessions: T[],
  targetDate: Date,
  excludeCancelled = true
): T[] {
  if (!sessions || sessions.length === 0) return [];
  
  return sessions.filter((session) => {
    if (excludeCancelled && session.status === "cancelled") return false;
    const sessionDate = new Date(session.startTime);
    return isSameDay(sessionDate, targetDate);
  });
}

export function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatDateShort(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

export function formatTimeInTimezone(isoDateString: string, timezone: string): string {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return "--:--";
    
    return date.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--";
  }
}

export function formatDateInTimezone(isoDateString: string, timezone: string, format: "short" | "long" = "short"): string {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return "";
    
    if (format === "short") {
      return date.toLocaleDateString("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    
    return date.toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatDateTimeInTimezone(isoDateString: string, timezone: string): string {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return "";
    
    return date.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function getDayOfWeekInTimezone(isoDateString: string, timezone: string): number {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return 0;
    
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).formatToParts(date);
    
    const weekdayPart = parts.find(p => p.type === "weekday");
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    
    return dayMap[weekdayPart?.value || "Sun"] || 0;
  } catch {
    return 0;
  }
}

/**
 * Convert a UTC "HH:MM" time string to local time based on academy timezone.
 * Used for displaying series startTime which is stored as UTC.
 * 
 * Uses Intl.DateTimeFormat for accurate timezone conversion, handling:
 * - Half-hour offsets (e.g., Asia/Kolkata +05:30)
 * - DST transitions
 */
export function convertUTCTimeToLocal(utcTime: string, timezone: string): string {
  try {
    const [hours, minutes] = utcTime.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return utcTime;
    
    // Create a UTC date with the given time (using a fixed date to avoid DST ambiguity)
    // We use today's date to get the current DST offset for the timezone
    const today = new Date();
    const utcDate = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      hours,
      minutes,
      0
    ));
    
    // Use Intl.DateTimeFormat to get the local time in the target timezone
    // This correctly handles half-hour offsets and DST
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    return formatter.format(utcDate);
  } catch {
    return utcTime; // Return original if conversion fails
  }
}
