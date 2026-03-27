import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors } from "@/constants/theme";

export const getDomainIcon = (iconName: string | null): keyof typeof Ionicons.glyphMap => {
  switch (iconName) {
    case "tennisball-outline": return "tennisball-outline";
    case "brain-outline": return "bulb-outline";
    case "fitness-outline": return "fitness-outline";
    case "people-outline": return "people-outline";
    case "bulb-outline": return "flash-outline";
    default: return "star-outline";
  }
};

export const getTrendIcon = (trend: string | null): keyof typeof Ionicons.glyphMap => {
  switch (trend) {
    case "improving": return "trending-up";
    case "focus": return "trending-down";
    default: return "remove";
  }
};

export const getTrendColor = (trend: string | null) => {
  switch (trend) {
    case "improving": return Colors.dark.primary;
    case "focus": return Colors.dark.error;
    default: return Colors.dark.tabIconDefault;
  }
};

export const getMomentumColor = (momentum: string | null) => {
  switch (momentum) {
    case "strong": return Colors.dark.primary;
    case "slowing": return Colors.dark.orange;
    default: return Colors.dark.xpCyan;
  }
};

export const getProgressColor = (value: number) => {
  if (value >= 70) return Colors.dark.primary;
  if (value >= 40) return Colors.dark.xpCyan;
  if (value >= 20) return Colors.dark.gold;
  return Colors.dark.tabIconDefault;
};

export const getAssessmentBadge = (status: string | null) => {
  switch (status) {
    case "above": return { label: "Above", color: Colors.dark.primary };
    case "meets": return { label: "Meets", color: Colors.dark.xpCyan };
    case "developing": return { label: "Developing", color: Colors.dark.gold };
    case "not_yet": return { label: "Not Yet", color: Colors.dark.orange };
    default: return { label: "No Assessment", color: Colors.dark.textMuted };
  }
};

export const getLevelColor = (level: string | null) => {
  switch (level?.toLowerCase()) {
    case "red": return "#FF4444";
    case "orange": return "#FF851B";
    case "green": return "#2ECC40";
    case "yellow": return "#FFDC00";
    case "glow": return "#00D4FF";
    default: return Colors.dark.disabled;
  }
};

export const formatSessionTime = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} - ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

export const formatSessionDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export const getSessionTypeLabel = (type: string) => {
  switch (type) {
    case "private": return "Private";
    case "semi_private": return "Semi-Private";
    case "group": return "Group";
    case "camp": return "Camp";
    default: return type;
  }
};
