export type TabType = "series" | "weekPlanner" | "roster" | "today" | "progress" | "plans" | "levels" | "templates" | "levelCards" | "matchLog" | "sessionPlan" | "feedback" | "drillBank";

export interface SessionPlayer {
  id: string;
  playerId: string;
  player: { id: string; name: string; ballLevel: string | null };
}

export type ProgressTrend = "up" | "stable" | "down";
export type EffortLevel = "high" | "normal" | "low";
export type Intensity = "light" | "normal" | "intense";

export interface ProgressSummary {
  skillArea: string;
  avgRating: number;
  trend: string;
}

export interface PlayerWithProgress {
  id: string;
  name: string;
  ballLevel: string | null;
  progressSummary: ProgressSummary[];
  totalNotes: number;
  totalXp: number;
  recentNote?: {
    content: string;
    category: string | null;
    createdAt: string | null;
  };
}

export interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
}

export interface SessionFeedback {
  sessionId: string;
  intensity: Intensity;
  focusTags: string[];
  generalNote: string;
  playerFeedback: PlayerFeedback[];
}

export interface PlayerFeedback {
  playerId: string;
  playerName: string;
  progressTrend: ProgressTrend;
  effortLevel: EffortLevel;
  note: string;
}

export interface SkillDomain {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string | null;
  sortOrder: number | null;
}

export interface PlayerSkillState {
  id: string;
  playerId: string;
  domainId: string;
  progressValue: number;
  trend: string | null;
  momentum: string | null;
  confidenceScore: number | null;
  assessmentStatus: string | null;
  isFrozen: boolean | null;
  domain: SkillDomain | null;
  domainXp: number;
  observationCount: number;
  avgDelta: number;
  lastObservation: string | null;
}

export interface PlayerXpData {
  totalXp: number;
  transactions: { id: string; xpAmount: number; source: string; description: string | null; createdAt: string }[];
}

export interface ObservationTrend {
  domainId: string;
  history: { date: string; delta: number; direction: string }[];
  streakUp: number;
  streakDown: number;
  hasSpeedrunWarning: boolean;
  improvementRate: number;
  hasData: boolean;
  domain?: SkillDomain | null;
}

export type SkillChipState = "stable" | "up" | "down";

export interface SkillProgress {
  [skill: string]: SkillChipState;
}

export type QuickSignal = "focused" | "smart_decisions" | "good_teammate" | "took_initiative" | "showed_respect" | "listened_well" | "fair_play";
export type SocialIssue = "disruptive" | "poor_attitude" | "disrespect";

export interface PlayerFeedbackState {
  playerId: string;
  playerName: string;
  progressTrend: ProgressTrend;
  effortLevel: EffortLevel;
  note: string;
  skillProgress: SkillProgress;
  quickSignals: QuickSignal[];
  socialIssue: SocialIssue | null;
}

export interface DomainImpact {
  technical: "up" | "stable" | "down";
  mental: "up" | "stable" | "down";
  physical: "up" | "stable" | "down";
  social: "up" | "stable" | "down";
  tactical: "up" | "stable" | "down";
}

export interface TabProps {
  insets: { bottom: number };
  tabBarHeight: number;
}

export interface BallLevel {
  id: string;
  stage: string;
  rank: number;
  displayNamePlayer: string;
  displayNameCoach: string;
  identity: string;
  courtType: string;
  ballType: string;
  promotionRequirements: {
    skillAchievedCount: number;
    pillarMinimum: Record<string, number>;
    tests: string[];
    evidenceMin: number;
    matchEvents: number;
    matchWins?: number;
  };
  skillsByPillar?: Record<string, LevelSkill[]>;
}

export interface LevelSkill {
  id: string;
  name: string;
  pillar: string;
  description?: string;
  targetScore: number;
  weight: string;
  isRequired: boolean;
  rubric?: { score: number; observable: string }[];
}

export interface SessionTemplate {
  id: string;
  name: string;
  sessionType: string;
  duration: number;
  ballLevel: string | null;
  skillLevel: number | null;
  notes: string | null;
}

export type AssessmentStatus = "not_yet" | "developing" | "meets" | "above";
