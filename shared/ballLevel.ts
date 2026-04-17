export type BallLevelId = "blue" | "red" | "orange" | "green" | "yellow" | "glow";

export function calculateAgeFromDOB(dateOfBirth: string): number {
  // Parse YYYY-MM-DD by components so timezone never shifts the birthday.
  // Falls back to Date parsing for any non-conforming input (e.g. ISO with time).
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  let birthY: number, birthM: number, birthD: number;
  if (match) {
    birthY = Number(match[1]);
    birthM = Number(match[2]);
    birthD = Number(match[3]);
  } else {
    const d = new Date(dateOfBirth);
    birthY = d.getUTCFullYear();
    birthM = d.getUTCMonth() + 1;
    birthD = d.getUTCDate();
  }
  const today = new Date();
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  let age = ty - birthY;
  if (tm < birthM || (tm === birthM && td < birthD)) {
    age--;
  }
  return age;
}

export function getBallLevelFromAge(age: number): BallLevelId {
  if (age < 4) return "blue";
  if (age <= 6) return "red";
  if (age <= 8) return "orange";
  if (age <= 10) return "green";
  if (age <= 17) return "yellow";
  return "glow";
}

export function getBallLevelFromDOB(dateOfBirth: string): BallLevelId {
  return getBallLevelFromAge(calculateAgeFromDOB(dateOfBirth));
}

const DOB_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDOB(dateOfBirth: string): { valid: boolean; error?: string } {
  if (!dateOfBirth) return { valid: false, error: "Date of birth is required" };
  const match = DOB_REGEX.exec(dateOfBirth);
  if (!match) return { valid: false, error: "Date must be in YYYY-MM-DD format" };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return { valid: false, error: "Impossible date" };
  if (day < 1 || day > 31) return { valid: false, error: "Impossible date" };

  // Strict round-trip: build the date and confirm components survive intact.
  // This catches Feb 30, Apr 31, etc. that JS would otherwise silently roll over.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { valid: false, error: "Impossible date" };
  }

  // Reject future dates outright.
  const todayUTC = new Date();
  const todayMidnight = Date.UTC(
    todayUTC.getUTCFullYear(),
    todayUTC.getUTCMonth(),
    todayUTC.getUTCDate(),
  );
  if (date.getTime() > todayMidnight) {
    return { valid: false, error: "Date of birth cannot be in the future" };
  }

  const age = calculateAgeFromDOB(dateOfBirth);
  if (age < 3) return { valid: false, error: "Minimum age is 3 years" };
  if (age > 100) return { valid: false, error: "Please enter a valid date of birth" };
  return { valid: true };
}
