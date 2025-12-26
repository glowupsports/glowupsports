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
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

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
      const date = new Date(session.startTime).toLocaleDateString("nl-NL", {
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
        return "Prive";
      case "semi_private":
        return "Semi-Prive";
      case "group":
        return "Groep";
      case "physical":
        return "Fysiek";
      case "activity":
        return "Activiteit";
      default:
        return type;
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
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={handleGoBack}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.title}>Geschiedenis</Text>
            <Text style={styles.subtitle}>{pastSessions.length} afgeronde lessen</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {([
            { value: "all", label: "Alle" },
            { value: "private", label: "Prive" },
            { value: "semi_private", label: "Semi-Prive" },
            { value: "group", label: "Groep" },
          ] as const).map((filter) => (
            <Pressable
              key={filter.value}
              style={[styles.filterChip, filterType === filter.value && styles.filterChipActive]}
              onPress={() => setFilterType(filter.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterType === filter.value && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : Object.keys(groupedSessions).length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color={Colors.dark.disabled} />
          <Text style={styles.emptyText}>Geen afgeronde lessen</Text>
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
                  <View style={styles.sessionTime}>
                    <Text style={styles.sessionTimeText}>{formatTime(session.startTime)}</Text>
                    <Text style={styles.sessionDuration}>{session.duration}m</Text>
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionType}>
                      {getSessionTypeLabel(session.sessionType)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
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
    return new Date(date).toLocaleDateString("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private":
        return "Prive";
      case "semi_private":
        return "Semi-Prive";
      case "group":
        return "Groep";
      case "physical":
        return "Fysiek";
      case "activity":
        return "Activiteit";
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
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.detailTitle}>Sessie Details</Text>
        <View style={{ width: 40 }} />
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
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoValue}>{getSessionTypeLabel(session.sessionType)}</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Duur</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoValue}>{session.duration} minuten</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Spelers</Text>
          <View style={styles.infoCard}>
            <Text style={styles.placeholderText}>Geen spelerdata beschikbaar</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Feedback</Text>
          <View style={styles.infoCard}>
            <Text style={styles.placeholderText}>Geen feedback beschikbaar</Text>
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    ...Typography.h1,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  filterContainer: {
    paddingLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  filterChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
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
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textTransform: "capitalize",
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  sessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  sessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  detailTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
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
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
  },
  infoSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
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
