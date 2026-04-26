/**
 * Parse a calendar-date value (either "YYYY-MM-DD" or an ISO timestamp like
 * "2026-04-26T00:00:00.000Z") into local-calendar { year, month, day } parts.
 *
 * Use this when consuming a date that represents a specific calendar day
 * (e.g. a match date), not a UTC timestamp. Returns null on unparseable input.
 */
export function parseCalendarDateParts(
  value: string | null | undefined
): { year: number; month: number; day: number } | null {
  if (!value) return null;
  // Strict YYYY-MM-DD only — anything longer (e.g. an ISO timestamp) falls
  // through to the Date-based path so we don't silently strip the timezone.
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if ([year, month, day].some((n) => Number.isNaN(n))) return null;
    return { year, month, day };
  }
  // For ISO timestamps (or any other parseable date string) convert to the
  // viewer's local calendar date — this matches what `toLocaleDateString`
  // would render on the same Date and avoids off-by-one shifts that would
  // otherwise occur if we only looked at the YYYY-MM-DD prefix.
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

export function formatCredits(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(2)).toString();
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

// Parse timestamps ensuring they're treated as UTC (add "Z" if missing timezone indicator)
// This is critical for handling API responses that may return timestamps without timezone suffix
export function parseUTCTimestamp(timestamp: string | Date): Date {
  if (timestamp instanceof Date) return timestamp;
  // If the timestamp doesn't have a timezone indicator, treat it as UTC
  if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
    return new Date(timestamp + 'Z');
  }
  return new Date(timestamp);
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
    const date = parseUTCTimestamp(isoDateString);
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

/**
 * Get the local date string (YYYY-MM-DD) for a UTC timestamp in a specific timezone.
 * This is critical for calendar filtering - ensures sessions are shown on the correct local day.
 */
export function getLocalDateString(isoDateString: string, timezone: string): string {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return "";
    
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    
    // en-CA format gives YYYY-MM-DD
    return formatter.format(date);
  } catch {
    return "";
  }
}

/**
 * Format a local Date object to YYYY-MM-DD string (preserving local date, not converting to UTC).
 * Use this for selectedDate in calendars where the date picker returns a local Date.
 */
export function formatLocalDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object to YYYY-MM-DD string in a specific timezone.
 * Use this when you need to format a local Date for comparison with session dates in the academy timezone.
 */
export function formatDateObjectInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    return formatLocalDateToString(date);
  }
}

/**
 * Get hours and minutes in a specific timezone from a UTC timestamp.
 * Returns { hours, minutes } in the target timezone.
 * Used for positioning sessions on the calendar grid.
 */
export function getTimeInTimezone(isoDateString: string, timezone: string): { hours: number; minutes: number } {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return { hours: 0, minutes: 0 };
    
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find(p => p.type === "hour");
    const minutePart = parts.find(p => p.type === "minute");
    
    return {
      hours: parseInt(hourPart?.value || "0", 10),
      minutes: parseInt(minutePart?.value || "0", 10),
    };
  } catch {
    return { hours: 0, minutes: 0 };
  }
}

/**
 * Check if a session's local date (in academy timezone) matches the selected local date string.
 */
export function sessionMatchesLocalDate(sessionStartTime: string, localDateString: string, timezone: string): boolean {
  const sessionLocalDate = getLocalDateString(sessionStartTime, timezone);
  return sessionLocalDate === localDateString;
}

/**
 * Get the day of week (0=Sun, 1=Mon, ..., 6=Sat) for a UTC timestamp in a specific timezone.
 */
export function getDayOfWeekFromTimestamp(isoDateString: string, timezone: string): number {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return 0;
    
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    
    const weekday = formatter.format(date);
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    
    return dayMap[weekday] ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Format a session time with Today/Tomorrow relative labels in a specific timezone.
 * Used for display in player-facing screens with Dubai timezone.
 */
export function formatSessionTimeWithRelativeDay(isoDateString: string, timezone: string): string {
  try {
    const date = parseUTCTimestamp(isoDateString);
    if (isNaN(date.getTime())) return "--:--";
    
    const now = new Date();
    
    // Get date strings in target timezone for comparison
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    
    const sessionDateStr = dateFormatter.format(date);
    const todayDateStr = dateFormatter.format(now);
    
    // Calculate tomorrow in the target timezone
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowDateStr = dateFormatter.format(tomorrow);
    
    // Format time in target timezone
    const timeStr = date.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    
    if (sessionDateStr === todayDateStr) return `Today ${timeStr}`;
    if (sessionDateStr === tomorrowDateStr) return `Tomorrow ${timeStr}`;
    
    // Get day of week
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    
    return `${weekdayFormatter.format(date)} ${timeStr}`;
  } catch {
    return "--:--";
  }
}

/**
 * Format a session date for display (e.g., "21 Jan (Tue)") in a specific timezone.
 */
export function formatSessionDateShort(isoDateString: string, timezone: string): string {
  try {
    const date = parseUTCTimestamp(isoDateString);
    if (isNaN(date.getTime())) return "";
    
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      day: "numeric",
    });
    
    const monthFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
    });
    
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    
    const day = dayFormatter.format(date);
    const month = monthFormatter.format(date);
    const weekday = weekdayFormatter.format(date);
    
    return `${day} ${month} (${weekday})`;
  } catch {
    return "";
  }
}
