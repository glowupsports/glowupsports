import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
}

type FilterType = "all" | "private" | "semi_private" | "group";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.95, { damping: 15 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 15 });
    }, 100);
    onPress();
  };

  return (
    <AnimatedPressable style={animatedStyle} onPress={handlePress}>
      {isActive ? (
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.filterChipActive}
        >
          <Text style={styles.filterChipTextActive}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.filterChip}>
          <Text style={styles.filterChipText}>{label}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { calendarData, isLoading } = useCoach();
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const pastSessions = useMemo(() => {
    if (!calendarData?.ownSessions) return [];
    const now = new Date();
    return calendarData.ownSessions
      .filter((session) => {
        const endTime = new Date(session.endTime);
        return endTime < now && session.status !== "cancelled";
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [calendarData?.ownSessions]);

  const filteredSessions = useMemo(() => {
    if (filterType === "all") return pastSessions;
    return pastSessions.filter((s) => s.sessionType === filterType);
  }, [pastSessions, filterType]);

  const groupedSessions = useMemo(() => {
    const groups: { [key: string]: Session[] } = {};
    filteredSessions.forEach((session) => {
      const date = new Date(session.startTime).toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });
    return groups;
  }, [filteredSessions]);

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private":
        return "Private";
      case "semi_private":
        return "Semi-Private";
      case "group":
        return "Group";
      case "physical":
        return "Physical";
      case "activity":
        return "Activity";
      default:
        return type;
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "private":
        return Colors.dark.xpCyan;
      case "semi_private":
        return Colors.dark.gold;
      case "group":
        return Colors.dark.primary;
      default:
        return Colors.dark.primary;
    }
  };

  const handleSelectSession = (session: Session) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSession(session);
  };

  if (selectedSession) {
    return (
      <SessionDetailView
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
        insets={insets}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradientLine}
        />
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={handleGoBack}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.title}>HISTORY</Text>
            <Text style={styles.subtitle}>{pastSessions.length} completed lessons</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {([
            { value: "all", label: "All" },
            { value: "private", label: "Private" },
            { value: "semi_private", label: "Semi-Private" },
            { value: "group", label: "Group" },
          ] as const).map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              isActive={filterType === filter.value}
              onPress={() => setFilterType(filter.value)}
            />
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : Object.keys(groupedSessions).length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="time-outline" size={48} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.emptyText}>No completed lessons</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {Object.entries(groupedSessions).map(([date, sessions]) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>{date}</Text>
              {sessions.map((session) => (
                <Pressable
                  key={session.id}
                  style={styles.sessionCard}
                  onPress={() => handleSelectSession(session)}
                >
                  <View style={[styles.sessionCardBorder, { borderColor: getSessionTypeColor(session.sessionType) + "40" }]}>
                    <View style={styles.sessionCardInner}>
                      <View style={styles.sessionTime}>
                        <Text style={styles.sessionTimeText}>{formatTime(session.startTime)}</Text>
                        <View style={[styles.durationBadge, { backgroundColor: getSessionTypeColor(session.sessionType) + "20" }]}>
                          <Text style={[styles.sessionDuration, { color: getSessionTypeColor(session.sessionType) }]}>{session.duration}m</Text>
                        </View>
                      </View>
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionType}>
                          {getSessionTypeLabel(session.sessionType)}
                        </Text>
                      </View>
                      <View style={styles.chevronContainer}>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
          <View style={{ height: insets.bottom + Spacing.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

function SessionDetailView({
  session,
  onBack,
  insets,
}: {
  session: Session;
  onBack: () => void;
  insets: { top: number; bottom: number };
}) {
  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private":
        return "Private";
      case "semi_private":
        return "Semi-Private";
      case "group":
        return "Group";
      case "physical":
        return "Physical";
      case "activity":
        return "Activity";
      default:
        return type;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.detailHeader}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradientLine}
        />
        <View style={styles.detailHeaderRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.detailTitle}>SESSION DETAILS</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        style={styles.detailContent}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionDateText}>{formatDate(session.startTime)}</Text>
          <Text style={styles.sessionTimeRange}>
            {formatTime(session.startTime)} - {formatTime(session.endTime)}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>TYPE</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoCardInner}>
              <View style={styles.neonBadge}>
                <Ionicons name="tennisball" size={16} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.infoValue}>{getSessionTypeLabel(session.sessionType)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>DURATION</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoCardInner}>
              <View style={[styles.neonBadge, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="time" size={16} color={Colors.dark.gold} />
              </View>
              <Text style={styles.infoValue}>{session.duration} minutes</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>PLAYERS</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoCardInner}>
              <Text style={styles.placeholderText}>No player data available</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>FEEDBACK</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoCardInner}>
              <Text style={styles.placeholderText}>No feedback available</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: Spacing.md,
  },
  headerGradientLine: {
    height: 3,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  headerTitles: {
    flex: 1,
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: Typography.h1.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.xpCyan,
    marginTop: 2,
  },
  filterContainer: {
    paddingLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterChip: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  filterChipActive: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    marginRight: Spacing.sm,
  },
  filterChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  filterChipTextActive: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  dateGroup: {
    marginBottom: Spacing.lg,
  },
  dateHeader: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sessionCard: {
    marginBottom: Spacing.sm,
  },
  sessionCardBorder: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  sessionCardInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sessionTime: {
    alignItems: "center",
    minWidth: 60,
  },
  sessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  durationBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginTop: 4,
  },
  sessionDuration: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  detailHeader: {
    paddingBottom: Spacing.md,
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  detailTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  detailContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  sessionHeader: {
    marginBottom: Spacing.xl,
  },
  sessionDateText: {
    ...Typography.h2,
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  sessionTimeRange: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.xpCyan,
    marginTop: Spacing.xs,
  },
  infoSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  infoCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
    overflow: "hidden",
  },
  infoCardInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  neonBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  infoValue: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  placeholderText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
  },
});
