function formatLocalDateTime(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number } {
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

export interface LocalTimeToUTCResult {
  utcDate: Date;
  wasAdjusted: boolean;
  adjustedLocalTime?: string;
}

export function localTimeToUTC(
  dateStr: string,
  timeStr: string,
  timezone: string
): Date {
  const result = localTimeToUTCWithValidation(dateStr, timeStr, timezone);
  return result.utcDate;
}

export function localTimeToUTCWithValidation(
  dateStr: string,
  timeStr: string,
  timezone: string
): LocalTimeToUTCResult {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  
  const startOfDayUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const targetMinutes = hours * 60 + minutes;
  
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidateUtc = new Date(startOfDayUtc.getTime() + targetMinutes * 60 * 1000 - offsetMinutes * 60 * 1000);
    const local = formatLocalDateTime(candidateUtc, timezone);
    
    if (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === hours &&
      local.minute === minutes
    ) {
      return { utcDate: candidateUtc, wasAdjusted: false };
    }
  }
  
  for (let searchMinutes = targetMinutes; searchMinutes < 24 * 60; searchMinutes++) {
    for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
      const candidateUtc = new Date(startOfDayUtc.getTime() + searchMinutes * 60 * 1000 - offsetMinutes * 60 * 1000);
      const local = formatLocalDateTime(candidateUtc, timezone);
      
      if (
        local.year === year &&
        local.month === month &&
        local.day === day
      ) {
        const localMinutes = local.hour * 60 + local.minute;
        if (localMinutes >= targetMinutes) {
          const adjustedHour = String(local.hour).padStart(2, "0");
          const adjustedMin = String(local.minute).padStart(2, "0");
          return {
            utcDate: candidateUtc,
            wasAdjusted: true,
            adjustedLocalTime: `${adjustedHour}:${adjustedMin}`,
          };
        }
      }
    }
  }
  
  const fallbackUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  return { utcDate: fallbackUtc, wasAdjusted: false };
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
  const utcDate = localTimeToUTC(dateStr, "12:00", timezone);
  const local = formatLocalDateTime(utcDate, timezone);
  return local.dayOfWeek;
}

export function addDaysToLocalDate(dateStr: string, daysToAdd: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0));
  
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getFirstSessionDate(
  seriesStartDate: string,
  targetDayOfWeek: number,
  timeStr: string,
  timezone: string
): { dateStr: string; utcDate: Date } {
  const startDayOfWeek = getLocalDayOfWeek(seriesStartDate, timezone);
  
  let daysUntilTarget = (targetDayOfWeek - startDayOfWeek + 7) % 7;
  
  let firstDateStr = daysUntilTarget === 0 
    ? seriesStartDate 
    : addDaysToLocalDate(seriesStartDate, daysUntilTarget);
  
  let firstUtcDate = localTimeToUTC(firstDateStr, timeStr, timezone);
  
  const seriesStartUtc = localTimeToUTC(seriesStartDate, timeStr, timezone);
  if (firstUtcDate.getTime() < seriesStartUtc.getTime()) {
    firstDateStr = addDaysToLocalDate(firstDateStr, 7);
    firstUtcDate = localTimeToUTC(firstDateStr, timeStr, timezone);
  }
  
  return {
    dateStr: firstDateStr,
    utcDate: firstUtcDate,
  };
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
