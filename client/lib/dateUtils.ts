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
