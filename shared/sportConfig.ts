export type Sport = "tennis" | "padel" | "pickleball";
export type SportOrMulti = Sport | "multi";

export const SPORTS: Sport[] = ["tennis", "padel", "pickleball"];
export const VALID_SPORTS: Sport[] = ["tennis", "padel", "pickleball"];

export interface SportSkillLevel {
  key: string;
  label: string;
  order: number;
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
      { key: "c7", label: "C7 (Beginner)", order: 1 },
      { key: "c6", label: "C6", order: 2 },
      { key: "c5", label: "C5", order: 3 },
      { key: "c4", label: "C4 (Intermediate)", order: 4 },
      { key: "c3", label: "C3", order: 5 },
      { key: "c2", label: "C2 (Advanced)", order: 6 },
      { key: "c1", label: "C1 (Elite)", order: 7 },
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
      { key: "beginner", label: "Beginner", order: 1 },
      { key: "intermediate", label: "Intermediate", order: 2 },
      { key: "advanced", label: "Advanced", order: 3 },
      { key: "open", label: "Open", order: 4 },
    ],
    skillLevelLabel: "DUPR Rating",
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

export function formatSportSkillLevel(sport?: string | null, skillKey?: string | null): string {
  if (!skillKey) return "Not Set";
  const config = getSportConfig(sport);
  const level = config.skillLevels.find(l => l.key === skillKey);
  return level?.label ?? skillKey;
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
