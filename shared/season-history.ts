export type ClosingCreditSnapshot = {
  group: number;
  semi_private: number;
  private: number;
};

export type ClosingCreditSnapshotRow = {
  key: keyof ClosingCreditSnapshot;
  label: string;
  value: number;
  detail: string;
  isOutstanding: boolean;
};

export type SeasonSelection = {
  enrollmentId: string;
};

export function selectSeasonEnrollment<T extends SeasonSelection>(
  currentSeason: T | null,
  history: T[],
  selectedEnrollmentId: string | null,
): T | null {
  if (selectedEnrollmentId) {
    const selected =
      currentSeason?.enrollmentId === selectedEnrollmentId
        ? currentSeason
        : history.find((season) => season.enrollmentId === selectedEnrollmentId);
    if (selected) return selected;
  }
  return currentSeason ?? history[0] ?? null;
}

const CREDIT_TYPES: { key: keyof ClosingCreditSnapshot; label: string }[] = [
  { key: "group", label: "Group" },
  { key: "semi_private", label: "Semi-private" },
  { key: "private", label: "Private" },
];

/**
 * A season-close snapshot is immutable historical state. A partial legacy
 * object is not safe to display because missing values must never be filled
 * from the current wallet.
 */
export function normalizeClosingCreditSnapshot(
  value: unknown,
): ClosingCreditSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (
    !Number.isFinite(candidate.group) ||
    !Number.isFinite(candidate.semi_private) ||
    !Number.isFinite(candidate.private)
  ) {
    return null;
  }

  return {
    group: Number(candidate.group),
    semi_private: Number(candidate.semi_private),
    private: Number(candidate.private),
  };
}

export function closingCreditSnapshotRows(
  snapshot: unknown,
): ClosingCreditSnapshotRow[] | null {
  const normalized = normalizeClosingCreditSnapshot(snapshot);
  if (!normalized) return null;

  return CREDIT_TYPES.map(({ key, label }) => {
    const value = normalized[key];
    return {
      key,
      label,
      value,
      isOutstanding: value < 0,
      detail:
        value < 0
          ? `${Math.abs(value)} credits outstanding`
          : value > 0
            ? `${value} remaining`
            : "No credits remaining",
    };
  });
}

export function canManageAcademySeasons(role: string | null | undefined) {
  return role === "admin" || role === "academy_owner" || role === "owner";
}

export const ACADEMY_SEASON_TRANSITION_MESSAGE =
  "This closes the current season and saves each player's attendance and closing credit snapshot to Season History.\n\n" +
  "Players keep their exact current credits — including positive, zero, and outstanding negative balances. A new season starts with clean season statistics. Historical data is not deleted.";

export const PER_PLAYER_SEASON_TRANSITION_MESSAGE =
  "This closes the player's current season enrollment and saves their attendance and closing credit snapshot to Season History.\n\n" +
  "The player remains in the academy and is not archived or removed. Their positive, zero, and outstanding negative credits stay unchanged.";

export const BULK_PLAYER_SEASON_TRANSITION_MESSAGE =
  "This closes the selected players' current season enrollments and saves each player's attendance and closing credit snapshot to Season History.\n\n" +
  "Players remain in the academy. Positive, zero, and outstanding negative credits carry forward unchanged.";

export function seasonManagementErrorMessage(status: number | undefined, fallback: string) {
  return status === 403 ? "You don't have permission to manage seasons." : fallback;
}