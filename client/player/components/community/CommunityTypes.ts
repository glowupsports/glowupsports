import { Dimensions } from "react-native";

export const TAB_BAR_HEIGHT = 80;

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
export const DRAWER_HEIGHT = Math.min(SCREEN_HEIGHT * 0.55, 450);

export type FeedFilter = "for_you" | "news" | "academy" | "moments" | "events";
export type MainTab = "feed" | "friends" | "groups";

export interface Post {
  id: string;
  authorId: string;
  academyId: string;
  contextType: string;
  contextId?: string;
  caption?: string;
  mediaUrls: string[];
  mediaTypes: string[];
  visibility: string;
  cheerCount: number;
  commentCount: number;
  createdAt: string;
  author: {
    id: string;
    username?: string;
    name?: string;
    photoUrl?: string;
    ballLevel?: string;
    isCoach?: boolean;
    level?: number;
    title?: string;
  };
  userReaction: string | null;
}

export type ContextType = "training" | "match" | "event" | "group" | "achievement" | "free_play";

export interface ContextOption {
  type: ContextType;
  label: string;
  icon: string;
  color: string;
}

export const CONTEXT_OPTIONS: ContextOption[] = [
  { type: "training", label: "Training", icon: "tennisball", color: "#9AE66E" },
  { type: "match", label: "Match", icon: "trophy", color: "#FFD700" },
  { type: "event", label: "At Event", icon: "calendar", color: "#FF6B35" },
  { type: "group", label: "Group", icon: "people", color: "#4ECDC4" },
  { type: "achievement", label: "Achievement", icon: "ribbon", color: "#E040FB" },
  { type: "free_play", label: "Free Play", icon: "basketball", color: "#00D9FF" },
];

export const CHEER_REACTIONS = [
  { emoji: "\u{1F525}", type: "fire" },
  { emoji: "\u26A1", type: "star" },
  { emoji: "\u{1F3BE}", type: "tennis" },
  { emoji: "\u{1F4AA}", type: "muscle" },
  { emoji: "\u{1F3C6}", type: "clap" },
];

export const CONTEXT_BADGE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  training: { bg: "#9AE66E20", text: "#9AE66E", icon: "tennisball" },
  match: { bg: "#FFD70020", text: "#FFD700", icon: "trophy" },
  event: { bg: "#FF6B3520", text: "#FF6B35", icon: "calendar" },
  group: { bg: "#4ECDC420", text: "#4ECDC4", icon: "people" },
  achievement: { bg: "#E040FB20", text: "#E040FB", icon: "ribbon" },
  free_play: { bg: "#00D9FF20", text: "#00D9FF", icon: "basketball" },
  session_completed: { bg: "#9AE66E20", text: "#9AE66E", icon: "checkmark-circle" },
  level_up: { bg: "#FFD70020", text: "#FFD700", icon: "arrow-up-circle" },
  badge_earned: { bg: "#E040FB20", text: "#E040FB", icon: "ribbon" },
  streak: { bg: "#FF6B3520", text: "#FF6B35", icon: "flame" },
  milestone: { bg: "#00D9FF20", text: "#00D9FF", icon: "flag" },
};

export interface Friend {
  id: string;
  name: string;
  username?: string;
  photoUrl?: string;
  ballLevel?: string;
  skillLevel?: number;
  glowRating?: number;
  openToPlay?: boolean;
  lastActive?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  type: string;
  memberCount: number;
  imageUrl?: string;
  isJoined?: boolean;
  isMember?: boolean;
  isPrivate?: boolean;
  role?: string | null;
}

export interface Achievement {
  id: string;
  type: "match_won" | "level_up" | "badge" | "streak" | "milestone" | "rating_up";
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
  value?: string;
  shareImage?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  thumbnail?: string;
  publishedAt: string;
}

export interface FriendActivity {
  id: string;
  playerId: string;
  playerName: string;
  level: number;
  type: string;
  caption: string;
  time: string;
  cheers: number;
  photoUrl?: string;
}

export type GroupFilter = "all" | "training" | "social";

export const GROUP_FILTERS: { key: GroupFilter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "apps" },
  { key: "training", label: "Training", icon: "tennisball" },
  { key: "social", label: "Social", icon: "people" },
];

export function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString();
}

export function getBallLevelColor(level?: string): string {
  const colors: Record<string, string> = {
    blue: "#3B82F6",
    red: "#EF4444",
    orange: "#F97316",
    green: "#22C55E",
    yellow: "#EAB308",
    adult: "#00E5FF",
    glow: "#00E5FF",
  };
  return colors[level?.toLowerCase() || ""] || "#8E8E93";
}
