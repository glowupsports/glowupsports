import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Colors, Spacing } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const ProTennisColors = {
  backgroundPrimary: "#0B0D10",
  backgroundSecondary: "#12151A",
  cardBackground: "#171B22",
  electricGreen: "#C8FF3D",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A8B8",
  textMuted: "#6B7280",
  border: "#2A2E36",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
};

function getBallLevelColor(level: string): string {
  const l = level?.toLowerCase() || "";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  return ProTennisColors.electricGreen;
}

interface GroupSession {
  id: string;
  type: string;
  date: string;
  time: string;
  endTime?: string;
  spotsLeft: number;
  maxPlayers: number;
  coachName?: string;
  coachId?: string;
  courtName?: string;
  ballLevel?: string;
  currentPlayers?: number;
  isEnrolled?: boolean;
}

export default function BrowseGroupLessonsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<{ sessions: GroupSession[] }>({
    queryKey: ["/api/player/available-group-sessions"],
  });

  const enrollMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest("POST", `/api/player/sessions/${sessionId}/enroll`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/available-group-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Enrolled!", "You have successfully joined this group lesson. 1 credit has been used.");
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "Failed to enroll in session");
    },
    onSettled: () => {
      setEnrollingId(null);
    },
  });

  const handleEnroll = (session: GroupSession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      "Join Group Lesson",
      `Join ${session.coachName ? `${session.coachName}'s` : "this"} group session on ${session.date} at ${session.time}?\n\nThis will use 1 group credit.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Join", 
          onPress: () => {
            setEnrollingId(session.id);
            enrollMutation.mutate(session.id);
          }
        },
      ]
    );
  };

  const sessions = data?.sessions || [];
  const groupSessions = sessions.filter(s => s.type === "group");

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={ProTennisColors.electricGreen}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ProTennisColors.electricGreen} />
            <Text style={styles.loadingText}>Loading available lessons...</Text>
          </View>
        ) : groupSessions.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Feather name="calendar" size={48} color={ProTennisColors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Group Lessons Available</Text>
            <Text style={styles.emptySubtitle}>
              There are no upcoming group sessions at your level right now. Check back later or ask your coach about scheduling.
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.sessionsList}>
            <Text style={styles.sectionTitle}>
              {groupSessions.length} Available Group Lesson{groupSessions.length !== 1 ? "s" : ""}
            </Text>
            
            {groupSessions.map((session, index) => {
              const levelColor = session.ballLevel ? getBallLevelColor(session.ballLevel) : ProTennisColors.electricGreen;
              const spotsLeft = session.spotsLeft;
              const isFull = spotsLeft <= 0;
              const isEnrolling = enrollingId === session.id;
              
              return (
                <Animated.View 
                  key={session.id}
                  entering={FadeInUp.delay(index * 60).duration(300)}
                >
                  <View style={[styles.sessionCard, session.isEnrolled && styles.enrolledCard]}>
                    <View style={[styles.levelStrip, { backgroundColor: levelColor }]} />
                    
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <View style={styles.titleSection}>
                          <Text style={styles.coachName}>
                            {session.coachName ? `${session.coachName}'s Session` : "Group Session"}
                          </Text>
                          <View style={styles.levelBadge}>
                            <Text style={[styles.levelText, { color: levelColor }]}>
                              {session.ballLevel || "All Levels"}
                            </Text>
                          </View>
                        </View>
                        
                        {session.isEnrolled ? (
                          <View style={styles.enrolledBadge}>
                            <Feather name="check" size={14} color={ProTennisColors.success} />
                            <Text style={styles.enrolledText}>Joined</Text>
                          </View>
                        ) : isFull ? (
                          <View style={styles.fullBadge}>
                            <Text style={styles.fullText}>Full</Text>
                          </View>
                        ) : (
                          <Pressable
                            style={[styles.joinButton, isEnrolling && styles.joinButtonDisabled]}
                            onPress={() => handleEnroll(session)}
                            disabled={isEnrolling}
                          >
                            {isEnrolling ? (
                              <ActivityIndicator size="small" color="#000" />
                            ) : (
                              <Text style={styles.joinButtonText}>Join</Text>
                            )}
                          </Pressable>
                        )}
                      </View>
                      
                      <View style={styles.detailsRow}>
                        <View style={styles.detailItem}>
                          <Feather name="calendar" size={14} color={ProTennisColors.textSecondary} />
                          <Text style={styles.detailText}>{session.date}</Text>
                        </View>
                        <View style={styles.detailItem}>
                          <Feather name="clock" size={14} color={ProTennisColors.textSecondary} />
                          <Text style={styles.detailText}>
                            {session.time}{session.endTime ? ` - ${session.endTime}` : ""}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.detailsRow}>
                        {session.courtName && (
                          <View style={styles.detailItem}>
                            <Feather name="map-pin" size={14} color={ProTennisColors.textSecondary} />
                            <Text style={styles.detailText}>{session.courtName}</Text>
                          </View>
                        )}
                        <View style={styles.detailItem}>
                          <Feather name="users" size={14} color={levelColor} />
                          <Text style={[styles.detailText, { color: isFull ? ProTennisColors.error : levelColor }]}>
                            {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProTennisColors.backgroundPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: ProTennisColors.textSecondary,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: ProTennisColors.cardBackground,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: ProTennisColors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: ProTennisColors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  sessionsList: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
    marginBottom: Spacing.sm,
  },
  sessionCard: {
    backgroundColor: ProTennisColors.cardBackground,
    borderRadius: 12,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  enrolledCard: {
    borderColor: ProTennisColors.success,
    borderWidth: 1,
  },
  levelStrip: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  titleSection: {
    flex: 1,
    marginRight: Spacing.md,
  },
  coachName: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.textPrimary,
    marginBottom: 4,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  levelText: {
    fontSize: 12,
    fontWeight: "600",
  },
  joinButton: {
    backgroundColor: ProTennisColors.electricGreen,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center",
  },
  joinButtonDisabled: {
    opacity: 0.7,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  enrolledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  enrolledText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.success,
  },
  fullBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  fullText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.error,
  },
  detailsRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: 6,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: ProTennisColors.textSecondary,
  },
});
