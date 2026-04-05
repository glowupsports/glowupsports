// Types for SeriesDetailDrawer
export interface PlayerCredits {
  group: number;
  semi_private: number;
  private: number;
  totalDebt: number;
  groupDebt: number;
  semiPrivateDebt: number;
  privateDebt: number;
  hasDebt: boolean;
}

export interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
  status?: string; // active | paused | left
  sessionsAttended?: number;
  totalXpEarned?: number;
  joinedAt?: string;
  leftAt?: string | null;
  pauseFrom?: string | null;
  pauseUntil?: string | null;
  pauseReason?: string | null;
  linkedPackageId?: string | null;
  isGuest?: boolean;
  guestUntil?: string | null;
  credits?: PlayerCredits;
}

export interface FeedbackData {
  feedback: {
    id: string;
    sessionId: string;
    intensity: string | null;
    mood: string | null;
    coachNotes: string | null;
    sessionDate?: string;
  }[];
  playerFeedback: {
    id: string;
    playerId: string;
    sessionId: string;
    coachId: string;
    feedbackType: string;
    message: string;
    visibility: string;
    xpAwarded: number;
    pillarId?: string | null;
    createdAt: string;
  }[];
  summary: {
    total: number;
    withFeedback: number;
    intensity: Record<string, number>;
  };
}

export interface ProgressData {
  players: {
    id: string;
    name: string;
    xpEarned: number;
    sessionsAttended: number;
  }[];
  totalXp: number;
  sessionsCompleted: number;
  totalSessions: number;
}

export interface SessionInstance {
  id: string;
  startTime: string;
  endTime: string;
  status: string | null;
  weekNumber?: number;
}

export interface SeriesDetail {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  sessionType: string;
  status: string;
  weekCount: number | null;
  seriesStartDate: string;
  seriesEndDate: string | null;
  maxPlayers: number;
  xpPerSession: number;
  locationName?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  courtId?: string | null;
  courtName?: string;
  players: Player[];
  sessions: SessionInstance[];
  stats: {
    totalSessions: number;
    completedSessions: number;
    upcomingSessions: number;
    cancelledSessions: number;
    sessionsNeedingReview?: number;
  };
}

export interface SeriesDetailDrawerProps {
  visible: boolean;
  seriesId: string | null;
  onClose: () => void;
}

export interface MergeSuggestion {
  playerId: string;
  name: string;
  ballLevel?: string;
  homeSeriesName: string;
  pauseFrom?: string;
  pauseUntil?: string;
}

export interface CoachOption {
  id: string;
  name: string;
}

export interface PackageTemplate {
  id: string;
  name: string;
  credits: number;
  validityDays: number;
  currency: string;
  price: string;
}

export interface CreditPackageOption {
  creditType: string;
  credits: number;
  totalPrice: string;
  pricePerCredit: string;
  currency: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  coachBusy?: boolean;
  courtBusy?: boolean;
}

export interface CourtOption {
  id: string;
  name: string;
  color?: string;
}

export type TabId = "overview" | "timeline" | "feedback" | "progress" | "plan";
