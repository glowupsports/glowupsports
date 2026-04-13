function formatLocalDateTime(date: Date, timezone: string): { 
  year: number; 
  month: number; 
  day: number; 
  hour: number; 
  minute: number; 
  dayOfWeek: number 
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? part.value : "";
  };
  
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  
  let hour = parseInt(getPart("hour"), 10);
  if (hour === 24) hour = 0;
  
  return {
    year: parseInt(getPart("year"), 10),
    month: parseInt(getPart("month"), 10),
    day: parseInt(getPart("day"), 10),
    hour,
    minute: parseInt(getPart("minute"), 10),
    dayOfWeek: dayMap[getPart("weekday")] ?? 0,
  };
}

function toLocalMinutes(local: { hour: number; minute: number }): number {
  return local.hour * 60 + local.minute;
}

function targetMatches(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  year: number, month: number, day: number, hours: number, minutes: number
): boolean {
  return local.year === year && local.month === month && local.day === day &&
         local.hour === hours && local.minute === minutes;
}

export type LocalTimeResolution = 
  | { status: "ok"; utcDate: Date }
  | { status: "gap"; suggestedTime: string; suggestedUtc: Date }
  | { status: "ambiguous"; utcDate: Date; alternateUtc: Date; note: string }
  | { status: "error"; message: string };

export function resolveLocalTimeToUTC(
  dateStr: string,
  timeStr: string,
  timezone: string
): LocalTimeResolution {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  const targetMinutes = hours * 60 + minutes;
  
  const startUtc = new Date(Date.UTC(year, month - 1, day - 1, 0, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month - 1, day + 2, 0, 0, 0, 0));
  
  const matches: Date[] = [];
  
  for (let ms = startUtc.getTime(); ms < endUtc.getTime(); ms += 60000) {
    const candidate = new Date(ms);
    const local = formatLocalDateTime(candidate, timezone);
    
    if (targetMatches(local, year, month, day, hours, minutes)) {
      matches.push(candidate);
    }
  }
  
  if (matches.length === 1) {
    return { status: "ok", utcDate: matches[0] };
  }
  
  if (matches.length > 1) {
    return { 
      status: "ambiguous", 
      utcDate: matches[0],
      alternateUtc: matches[1],
      note: `Time occurs twice due to DST. First occurrence selected.`
    };
  }
  
  let closestAfter: { suggestedUtc: Date; suggestedTime: string } | null = null;
  
  for (let ms = startUtc.getTime(); ms < endUtc.getTime(); ms += 60000) {
    const candidate = new Date(ms);
    const local = formatLocalDateTime(candidate, timezone);
    
    if (local.year === year && local.month === month && local.day === day) {
      const localMinutes = toLocalMinutes(local);
      if (localMinutes > targetMinutes) {
        if (!closestAfter || localMinutes < toLocalMinutes(formatLocalDateTime(closestAfter.suggestedUtc, timezone))) {
          const h = String(local.hour).padStart(2, "0");
          const m = String(local.minute).padStart(2, "0");
          closestAfter = { suggestedUtc: candidate, suggestedTime: `${h}:${m}` };
        }
      }
    }
  }
  
  if (closestAfter) {
    return {
      status: "gap",
      suggestedTime: closestAfter.suggestedTime,
      suggestedUtc: closestAfter.suggestedUtc,
    };
  }
  
  return { status: "error", message: `Cannot resolve ${timeStr} on ${dateStr} in ${timezone}` };
}

export class TimezoneGapError extends Error {
  constructor(
    public readonly requestedTime: string,
    public readonly requestedDate: string,
    public readonly suggestedTime: string,
    public readonly timezone: string
  ) {
    super(`Time ${requestedTime} does not exist on ${requestedDate} in ${timezone}. Suggested: ${suggestedTime}`);
    this.name = "TimezoneGapError";
  }
}

export class TimezoneAmbiguousError extends Error {
  constructor(
    public readonly requestedTime: string,
    public readonly requestedDate: string,
    public readonly timezone: string
  ) {
    super(`Time ${requestedTime} on ${requestedDate} is ambiguous in ${timezone} (DST fall-back)`);
    this.name = "TimezoneAmbiguousError";
  }
}

export function localTimeToUTC(
  dateStr: string,
  timeStr: string,
  timezone: string,
  options?: { allowAmbiguous?: boolean }
): Date {
  const result = resolveLocalTimeToUTC(dateStr, timeStr, timezone);
  
  if (result.status === "error") {
    throw new Error(result.message);
  }
  
  if (result.status === "gap") {
    throw new TimezoneGapError(timeStr, dateStr, result.suggestedTime, timezone);
  }
  
  if (result.status === "ambiguous") {
    if (!options?.allowAmbiguous) {
      throw new TimezoneAmbiguousError(timeStr, dateStr, timezone);
    }
    return result.utcDate;
  }
  
  return result.utcDate;
}


export function utcToLocalTime(
  utcDate: Date,
  timezone: string
): { date: string; time: string; dayOfWeek: number } {
  try {
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    
    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const local = formatLocalDateTime(utcDate, timezone);
    
    return {
      date: dateFormatter.format(utcDate),
      time: timeFormatter.format(utcDate),
      dayOfWeek: local.dayOfWeek,
    };
  } catch {
    return {
      date: `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, "0")}-${String(utcDate.getUTCDate()).padStart(2, "0")}`,
      time: `${String(utcDate.getUTCHours()).padStart(2, "0")}:${String(utcDate.getUTCMinutes()).padStart(2, "0")}`,
      dayOfWeek: utcDate.getUTCDay(),
    };
  }
}

export function getLocalDayOfWeek(dateStr: string, timezone: string): number {
  const result = resolveLocalTimeToUTC(dateStr, "12:00", timezone);
  if (result.status === "ok") {
    const local = formatLocalDateTime(result.utcDate, timezone);
    return local.dayOfWeek;
  }
  if (result.status === "ambiguous") {
    const local = formatLocalDateTime(result.utcDate, timezone);
    return local.dayOfWeek;
  }
  if (result.status === "gap") {
    const local = formatLocalDateTime(result.suggestedUtc, timezone);
    return local.dayOfWeek;
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDaysToLocalDate(dateStr: string, daysToAdd: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0));
  
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export type FirstSessionResult = 
  | { status: "ok"; dateStr: string; utcDate: Date }
  | { status: "gap"; dateStr: string; suggestedTime: string }
  | { status: "error"; message: string };

export function getFirstSessionDate(
  seriesStartDate: string,
  targetDayOfWeek: number,
  timeStr: string,
  timezone: string
): FirstSessionResult {
  const startDayOfWeek = getLocalDayOfWeek(seriesStartDate, timezone);
  
  let daysUntilTarget = (targetDayOfWeek - startDayOfWeek + 7) % 7;
  
  let firstDateStr = daysUntilTarget === 0 
    ? seriesStartDate 
    : addDaysToLocalDate(seriesStartDate, daysUntilTarget);
  
  const firstResolution = resolveLocalTimeToUTC(firstDateStr, timeStr, timezone);
  if (firstResolution.status === "gap") {
    return { status: "gap", dateStr: firstDateStr, suggestedTime: firstResolution.suggestedTime };
  }
  if (firstResolution.status === "error") {
    return { status: "error", message: firstResolution.message };
  }
  
  let firstUtcDate = firstResolution.utcDate;
  
  const seriesStartResolution = resolveLocalTimeToUTC(seriesStartDate, timeStr, timezone);
  if (seriesStartResolution.status === "ok" || seriesStartResolution.status === "ambiguous") {
    if (firstUtcDate.getTime() < seriesStartResolution.utcDate.getTime()) {
      firstDateStr = addDaysToLocalDate(firstDateStr, 7);
      const nextResolution = resolveLocalTimeToUTC(firstDateStr, timeStr, timezone);
      if (nextResolution.status === "gap") {
        return { status: "gap", dateStr: firstDateStr, suggestedTime: nextResolution.suggestedTime };
      }
      if (nextResolution.status === "error") {
        return { status: "error", message: nextResolution.message };
      }
      firstUtcDate = nextResolution.utcDate;
    }
  }
  
  return {
    status: "ok",
    dateStr: firstDateStr,
    utcDate: firstUtcDate,
  };
}

/**
 * Convert a local HH:MM time on a specific calendar date in a given IANA timezone to a UTC Date.
 * month is 0-indexed (consistent with Date.UTC and getUTCMonth).
 * Uses the robust resolveLocalTimeToUTC minute-search to handle DST transitions and
 * any timezone offset including date-boundary edge cases.
 */
export function localHHMMToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const dateStr = `${year}-${monthStr}-${dayStr}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const resolution = resolveLocalTimeToUTC(dateStr, timeStr, timezone);
  if (resolution.status === 'ok') return resolution.utcDate;
  if (resolution.status === 'ambiguous') return resolution.utcDate;
  if (resolution.status === 'gap') return resolution.suggestedUtc;
  // Fallback: treat as UTC (should never reach here)
  return new Date(Date.UTC(year, month, day, hour, minute));
}

export function getTimezoneOffset(timezone: string): number {
  const now = new Date();
  const local = formatLocalDateTime(now, timezone);
  const utc = formatLocalDateTime(now, "UTC");
  
  const localMinutes = local.hour * 60 + local.minute;
  const utcMinutes = utc.hour * 60 + utc.minute;
  
  let diffMinutes = localMinutes - utcMinutes;
  
  if (local.day !== utc.day) {
    if (local.day > utc.day || (local.month > utc.month) || (local.year > utc.year)) {
      diffMinutes += 24 * 60;
    } else {
      diffMinutes -= 24 * 60;
    }
  }
  
  return diffMinutes / 60;
}

export function getLocalDateParts(dateStr: string, timezone: string): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
} {
  const [year, month, day] = dateStr.split("-").map(Number);
  return {
    year,
    month,
    day,
    dayOfWeek: getLocalDayOfWeek(dateStr, timezone),
  };
}

export type EnsureResolvableResult = 
  | { ok: true; utcDate: Date; ambiguity?: { alternateUtc: Date; note: string } }
  | { ok: false; error: { code: "TIME_UNRESOLVABLE"; requestedTime: string; date: string; suggestedTime: string; message: string } };

export function ensureResolvableLocalTime(
  dateStr: string,
  timeStr: string,
  timezone: string
): EnsureResolvableResult {
  const resolution = resolveLocalTimeToUTC(dateStr, timeStr, timezone);
  
  if (resolution.status === "ok") {
    return { ok: true, utcDate: resolution.utcDate };
  }
  
  if (resolution.status === "ambiguous") {
    return { 
      ok: true, 
      utcDate: resolution.utcDate,
      ambiguity: {
        alternateUtc: resolution.alternateUtc,
        note: resolution.note
      }
    };
  }
  
  if (resolution.status === "gap") {
    return {
      ok: false,
      error: {
        code: "TIME_UNRESOLVABLE",
        requestedTime: timeStr,
        date: dateStr,
        suggestedTime: resolution.suggestedTime,
        message: `Time ${timeStr} does not exist on ${dateStr} in ${timezone} (DST transition). Please use ${resolution.suggestedTime} instead.`
      }
    };
  }
  
  return {
    ok: false,
    error: {
      code: "TIME_UNRESOLVABLE",
      requestedTime: timeStr,
      date: dateStr,
      suggestedTime: timeStr,
      message: resolution.message
    }
  };
}
