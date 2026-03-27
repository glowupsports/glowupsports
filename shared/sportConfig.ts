export type Sport = "tennis" | "padel" | "pickleball";
export type SportOrMulti = Sport | "multi";

export const SPORTS: Sport[] = ["tennis", "padel", "pickleball"];
export const VALID_SPORTS: Sport[] = ["tennis", "padel", "pickleball"];

export interface SportSkillLevel {
  key: string;
  label: string;
  order: number;
  color?: string;
}

export type SportProfileField = "ballLevel" | "category" | "rating";

export interface SportConfig {
  key: SportOrMulti;
  displayName: string;
  icon: string;
  color: string;
  skillLevels: SportSkillLevel[];
  skillLevelLabel: string;
  profileField: SportProfileField;
}

export const sportConfig: Record<SportOrMulti, SportConfig> = {
  tennis: {
    key: "tennis",
    displayName: "Tennis",
    icon: "tennisball",
    color: "#2ECC71",
    skillLevels: [
      { key: "red", label: "Red Ball", order: 1 },
      { key: "orange", label: "Orange Ball", order: 2 },
      { key: "green", label: "Green Ball", order: 3 },
      { key: "yellow", label: "Yellow Ball", order: 4 },
    ],
    skillLevelLabel: "Ball Level",
    profileField: "ballLevel",
  },
  padel: {
    key: "padel",
    displayName: "Padel",
    icon: "grid",
    color: "#9B59B6",
    skillLevels: [
      { key: "c7", label: "C7 (Beginner)", order: 1, color: "#A8D5A2" },
      { key: "c6", label: "C6", order: 2, color: "#66BB6A" },
      { key: "c5", label: "C5", order: 3, color: "#42A5F5" },
      { key: "c4", label: "C4 (Intermediate)", order: 4, color: "#7E57C2" },
      { key: "c3", label: "C3", order: 5, color: "#9B59B6" },
      { key: "c2", label: "C2 (Advanced)", order: 6, color: "#E91E63" },
      { key: "c1", label: "C1 (Elite)", order: 7, color: "#F44336" },
    ],
    skillLevelLabel: "Category",
    profileField: "category",
  },
  pickleball: {
    key: "pickleball",
    displayName: "Pickleball",
    icon: "disc",
    color: "#FF851B",
    skillLevels: [
      { key: "beginner", label: "Beginner", order: 1, color: "#81C784" },
      { key: "2.5", label: "2.5", order: 2, color: "#AED581" },
      { key: "3.0", label: "3.0", order: 3, color: "#FFB74D" },
      { key: "3.5", label: "3.5", order: 4, color: "#FF7043" },
      { key: "4.0+", label: "4.0+", order: 5, color: "#F44336" },
    ],
    skillLevelLabel: "Rating",
    profileField: "rating",
  },
  multi: {
    key: "multi",
    displayName: "Multi-Sport",
    icon: "apps",
    color: "#F4A31E",
    skillLevels: [],
    skillLevelLabel: "Level",
    profileField: "ballLevel",
  },
};

export function getSportConfig(sport?: string | null): SportConfig {
  if (sport && sport in sportConfig) {
    return sportConfig[sport as SportOrMulti];
  }
  return sportConfig.tennis;
}

export function getSportDisplayName(sport?: string | null): string {
  return getSportConfig(sport).displayName;
}

export function getSportIcon(sport?: string | null): string {
  return getSportConfig(sport).icon;
}

export function getSportColor(sport?: string | null): string {
  return getSportConfig(sport).color;
}

export function getSportSkillLevels(sport?: string | null): SportSkillLevel[] {
  return getSportConfig(sport).skillLevels;
}

const PICKLEBALL_LEGACY_MAP: Record<string, string> = {
  intermediate: "3.0",
  advanced: "3.5",
  open: "4.0+",
};

function normalizeLevelKey(sport: string | null | undefined, key: string): string {
  if (sport === "pickleball") {
    return PICKLEBALL_LEGACY_MAP[key.toLowerCase()] ?? key;
  }
  return key.toLowerCase();
}

export function formatSportSkillLevel(sport?: string | null, skillKey?: string | null): string {
  if (!skillKey) return "Not Set";
  const config = getSportConfig(sport);
  const resolvedKey = normalizeLevelKey(sport, skillKey);
  const level = config.skillLevels.find(l => l.key === resolvedKey || l.key === skillKey);
  return level?.label ?? skillKey;
}

export function getSportSkillLevelColor(sport?: string | null, skillKey?: string | null): string {
  if (!skillKey || !sport || sport === "tennis") {
    return getSportConfig(sport).color;
  }
  const config = getSportConfig(sport);
  const resolvedKey = normalizeLevelKey(sport, skillKey);
  const level = config.skillLevels.find(l => l.key === resolvedKey || l.key === skillKey);
  return level?.color ?? config.color;
}

export function validateSport(sport: unknown): Sport {
  if (typeof sport === "string" && VALID_SPORTS.includes(sport as Sport)) {
    return sport as Sport;
  }
  return "tennis";
}

export function getSportProfileField(sport?: string | null): SportProfileField {
  return getSportConfig(sport).profileField;
}
