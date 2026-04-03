import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TouchableOpacity,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Colors, Spacing, getPlayerLevelTextColor } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";

const BALL_LEVEL_FILTERS = [
  { id: "my_level", label: "My Level", color: "dynamic" },
  { id: "all", label: "All Levels", color: "#A0A8B8" },
  { id: "blue", label: "Blue", color: "#3B82F6" },
  { id: "red", label: "Red", color: "#EF4444" },
  { id: "orange", label: "Orange", color: "#F97316" },
  { id: "green", label: "Green", color: "#22C55E" },
  { id: "yellow", label: "Yellow", color: "#EAB308" },
  { id: "glow", label: "Glow", color: "#E040FB" },
];

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
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return ProTennisColors.electricGreen;
}

interface Participant {
  id: string;
  name: string;
  profilePhotoUrl?: string;
  level?: number;
  ballLevel?: string;
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
  participants?: Participant[];
}

export default function BrowseGroupLessonsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<GroupSession | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("my_level");

  const { data, isLoading, refetch, isRefetching } = useQuery<{ sessions: GroupSession[] }>({
    queryKey: ["/api/player/available-group-sessions"],
  });

  const { data: profileData } = useQuery<{ player: { ballLevel?: string } }>({
    queryKey: ["/api/player/me/profile"],
  });

  const playerBallLevel = profileData?.player?.ballLevel?.toLowerCase() || "glow";

  const enrollMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest("POST", `/api/player/sessions/${sessionId}/enroll`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/available-group-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedSession(null);
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

  const handleCardPress = (session: GroupSession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSession(session);
  };

  const handleEnroll = (session: GroupSession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEnrollingId(session.id);
    enrollMutation.mutate(session.id);
  };

  const sessions = data?.sessions || [];
  const groupSessions = sessions.filter(s => s.type === "group");
  
  const filteredSessions = useMemo(() => {
    if (selectedFilter === "all") return groupSessions;
    
    const filterLevel = selectedFilter === "my_level" ? playerBallLevel : selectedFilter;
    return groupSessions.filter(s => {
      const sessionLevel = s.ballLevel?.toLowerCase() || "";
      return sessionLevel.includes(filterLevel) || filterLevel.includes(sessionLevel);
    });
  }, [groupSessions, selectedFilter, playerBallLevel]);

  const handleFilterPress = (filterId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFilter(filterId);
  };

  const renderParticipantAvatar = (participant: Participant, index: number) => {
    const hasPhoto = participant.profilePhotoUrl;
    return (
      <View key={participant.id} style={styles.participantItem}>
        <View style={styles.participantAvatar}>
          {hasPhoto ? (
            <Image
              source={{ uri: buildPhotoUrl(participant.profilePhotoUrl)! }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {participant.name?.charAt(0)?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.participantInfo}>
          <Text style={styles.participantName}>{participant.name}</Text>
          {participant.ballLevel && (
            <Text style={[styles.participantLevel, { color: getBallLevelColor(participant.ballLevel) }]}>
              {participant.ballLevel}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.modalOverlayContainer}>
      <Pressable style={styles.modalBackdrop} onPress={() => navigation.goBack()} />
      
      <Animated.View 
        entering={FadeInDown.duration(300)}
        style={[styles.modalSheet, { paddingBottom: insets.bottom + 80 }]}
      >
        <View style={styles.modalDragHandle} />
        
        <View style={styles.modalHeader}>
          <Text style={styles.modalHeaderTitle}>Group Lessons</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.modalCloseBtn}>
            <Feather name="x" size={24} color={ProTennisColors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Spacing.sm, paddingBottom: Spacing.xl }
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={ProTennisColors.electricGreen}
            />
          }
        >
        <View style={styles.filterContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {BALL_LEVEL_FILTERS.map((filter) => {
              const isSelected = selectedFilter === filter.id;
              const chipColor = filter.id === "my_level" ? getBallLevelColor(playerBallLevel) : filter.color;
              const displayLabel = filter.id === "my_level" 
                ? `My Level (${playerBallLevel.charAt(0).toUpperCase() + playerBallLevel.slice(1)})`
                : filter.label;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => handleFilterPress(filter.id)}
                  style={[
                    styles.filterChip,
                    isSelected && { backgroundColor: chipColor + "30", borderColor: chipColor }
                  ]}
                >
                  <View style={[styles.filterDot, { backgroundColor: chipColor }]} />
                  <Text style={[
                    styles.filterLabel,
                    isSelected && { color: chipColor, fontWeight: "700" }
                  ]}>
                    {displayLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ProTennisColors.electricGreen} />
            <Text style={styles.loadingText}>Loading available lessons...</Text>
          </View>
        ) : filteredSessions.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Feather name="calendar" size={48} color={ProTennisColors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Group Lessons Available</Text>
            <Text style={styles.emptySubtitle}>
              {selectedFilter === "my_level" || selectedFilter !== "all"
                ? `No sessions available for ${selectedFilter === "my_level" ? playerBallLevel : selectedFilter} level. Try selecting "All Levels" to see more.`
                : "There are no upcoming group sessions right now. Check back later or ask your coach about scheduling."
              }
            </Text>
            <TouchableOpacity
              style={styles.requestGroupButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert(
                  "Request Group Lesson",
                  `Would you like to request a ${selectedFilter === "my_level" ? playerBallLevel : selectedFilter} level group lesson from your coach?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { 
                      text: "Send Request", 
                      onPress: () => {
                        apiRequest("POST", "/api/player/request-group-lesson", {
                          ballLevel: selectedFilter === "my_level" ? playerBallLevel : selectedFilter,
                          sessionType: "group"
                        }).then(() => {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert("Request Sent!", "Your coach will be notified about your interest in a group lesson.");
                        }).catch((err: any) => {
                          Alert.alert("Error", err.message || "Failed to send request");
                        });
                      }
                    }
                  ]
                );
              }}
            >
              <Feather name="send" size={18} color="#000" />
              <Text style={styles.requestGroupButtonText}>Request Group Lesson</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.inviteFriendsButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("PlayerTabs", { screen: "PlayStack", params: { screen: "Players" } });
              }}
            >
              <Feather name="user-plus" size={18} color={ProTennisColors.electricGreen} />
              <Text style={styles.inviteFriendsButtonText}>Find friends to join</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.sessionsList}>
            <Text style={styles.sectionTitle}>
              {filteredSessions.length} Available Group Lesson{filteredSessions.length !== 1 ? "s" : ""}
            </Text>
            
            {filteredSessions.map((session, index) => {
              const levelColor = session.ballLevel ? getBallLevelColor(session.ballLevel) : ProTennisColors.electricGreen;
              const effectiveMax = session.type === "semi_private" ? Math.min(session.maxPlayers, 2) : session.maxPlayers;
              const spotsLeft = Math.min(session.spotsLeft, effectiveMax - (session.participants?.length || 0));
              const isFull = spotsLeft <= 0;
              const isEnrolling = enrollingId === session.id;
              const participantCount = session.participants?.length || 0;
              
              return (
                <Animated.View 
                  key={session.id}
                  entering={FadeInUp.delay(index * 60).duration(300)}
                >
                  <Pressable onPress={() => handleCardPress(session)}>
                    <View style={[styles.sessionCard, session.isEnrolled && styles.enrolledCard]}>
                      <View style={[styles.levelStrip, { backgroundColor: levelColor }]} />
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                          <View style={styles.titleSection}>
                            <Text style={styles.coachName}>
                              {session.coachName 
                                ? `Group Class with Coach ${session.coachName.split(' ')[0]}` 
                                : "Group Session"}
                            </Text>
                            <View style={styles.levelBadge}>
                              <Text style={[styles.levelText, { color: getPlayerLevelTextColor(session.ballLevel) }]}>
                                {session.ballLevel || "All Levels"}
                              </Text>
                            </View>
                          </View>
                          
                          <View style={styles.chevronContainer}>
                            <Feather name="chevron-right" size={20} color={ProTennisColors.textMuted} />
                          </View>
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
                            <Text style={[styles.detailText, { color: isFull ? ProTennisColors.error : getPlayerLevelTextColor(session.ballLevel) }]}>
                              {participantCount}/{effectiveMax} players
                            </Text>
                          </View>
                        </View>

                        {participantCount > 0 && (
                          <View style={styles.avatarStack}>
                            {session.participants?.slice(0, 4).map((p, i) => (
                              <View key={p.id} style={[styles.stackedAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i }]}>
                                {p.profilePhotoUrl ? (
                                  <Image
                                    source={{ uri: buildPhotoUrl(p.profilePhotoUrl)! }}
                                    style={styles.miniAvatar}
                                  />
                                ) : (
                                  <View style={styles.miniAvatarPlaceholder}>
                                    <Text style={styles.miniAvatarInitial}>{p.name?.charAt(0) || "?"}</Text>
                                  </View>
                                )}
                              </View>
                            ))}
                            {participantCount > 4 && (
                              <View style={[styles.stackedAvatar, { marginLeft: -8 }]}>
                                <View style={styles.moreAvatar}>
                                  <Text style={styles.moreAvatarText}>+{participantCount - 4}</Text>
                                </View>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}
        </ScrollView>
      </Animated.View>

      <Modal
        visible={!!selectedSession}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedSession(null)}
      >
        <View style={styles.detailModalOverlay}>
          <Pressable style={styles.detailModalBackdrop} onPress={() => setSelectedSession(null)} />
          
          <Animated.View 
            entering={FadeInDown.duration(300)}
            style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}
          >
            {selectedSession && (
              <>
                <View style={styles.modalHandle} />
                
                <View style={styles.modalHeader}>
                  <TouchableOpacity 
                    style={styles.closeButton}
                    onPress={() => setSelectedSession(null)}
                  >
                    <Feather name="x" size={24} color={ProTennisColors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Session Details</Text>
                  <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
                  <View style={[
                    styles.sessionInfoCard,
                    { borderLeftColor: selectedSession.ballLevel ? getBallLevelColor(selectedSession.ballLevel) : ProTennisColors.electricGreen }
                  ]}>
                    <Text style={styles.sessionTitle}>
                      {selectedSession.coachName 
                        ? `Group Class with Coach ${selectedSession.coachName.split(' ')[0]}` 
                        : "Group Session"}
                    </Text>
                    <Text style={[
                      styles.sessionLevel,
                      { color: selectedSession.ballLevel ? getBallLevelColor(selectedSession.ballLevel) : ProTennisColors.electricGreen }
                    ]}>
                      {selectedSession.ballLevel || "All Levels"} Level
                    </Text>
                    
                    <View style={styles.sessionDetails}>
                      <View style={styles.sessionDetailRow}>
                        <Feather name="calendar" size={16} color={ProTennisColors.textSecondary} />
                        <Text style={styles.sessionDetailText}>{selectedSession.date}</Text>
                      </View>
                      <View style={styles.sessionDetailRow}>
                        <Feather name="clock" size={16} color={ProTennisColors.textSecondary} />
                        <Text style={styles.sessionDetailText}>
                          {selectedSession.time}{selectedSession.endTime ? ` - ${selectedSession.endTime}` : ""}
                        </Text>
                      </View>
                      {selectedSession.courtName && (
                        <View style={styles.sessionDetailRow}>
                          <Feather name="map-pin" size={16} color={ProTennisColors.textSecondary} />
                          <Text style={styles.sessionDetailText}>{selectedSession.courtName}</Text>
                        </View>
                      )}
                      <View style={styles.sessionDetailRow}>
                        <Feather name="users" size={16} color={ProTennisColors.electricGreen} />
                        <Text style={[styles.sessionDetailText, { color: ProTennisColors.electricGreen }]}>
                          {(() => {
                            const detailMax = selectedSession.type === "semi_private" ? Math.min(selectedSession.maxPlayers, 2) : selectedSession.maxPlayers;
                            const detailSpots = Math.min(selectedSession.spotsLeft, detailMax - (selectedSession.participants?.length || 0));
                            return `${Math.max(0, detailSpots)} spot${detailSpots !== 1 ? "s" : ""} left of ${detailMax}`;
                          })()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.participantsSection}>
                    <Text style={styles.participantsTitle}>
                      Players ({selectedSession.participants?.length || 0})
                    </Text>
                    
                    {(!selectedSession.participants || selectedSession.participants.length === 0) ? (
                      <View style={styles.noParticipants}>
                        <Feather name="user-plus" size={32} color={ProTennisColors.textMuted} />
                        <Text style={styles.noParticipantsText}>No players yet - be the first to join!</Text>
                      </View>
                    ) : (
                      <View style={styles.participantsList}>
                        {selectedSession.participants.map((p, i) => renderParticipantAvatar(p, i))}
                      </View>
                    )}
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  {selectedSession.isEnrolled ? (
                    <View style={styles.alreadyEnrolledBadge}>
                      <Feather name="check-circle" size={20} color={ProTennisColors.success} />
                      <Text style={styles.alreadyEnrolledText}>You're enrolled in this session</Text>
                    </View>
                  ) : selectedSession.spotsLeft <= 0 ? (
                    <View style={styles.sessionFullBadge}>
                      <Feather name="alert-circle" size={20} color={ProTennisColors.error} />
                      <Text style={styles.sessionFullText}>This session is full</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.enrollButton, enrollingId === selectedSession.id && styles.enrollButtonDisabled]}
                      onPress={() => handleEnroll(selectedSession)}
                      disabled={enrollingId === selectedSession.id}
                    >
                      {enrollingId === selectedSession.id ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <>
                          <Text style={styles.enrollButtonText}>Join Session</Text>
                          <Text style={styles.enrollCreditText}>Uses 1 group credit</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlayContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalSheet: {
    backgroundColor: ProTennisColors.backgroundPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    minHeight: "60%",
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: ProTennisColors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.textPrimary,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
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
  requestGroupButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ProTennisColors.electricGreen,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: Spacing.xl,
    gap: 8,
  },
  requestGroupButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  inviteFriendsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: ProTennisColors.electricGreen,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: Spacing.md,
    gap: 8,
  },
  inviteFriendsButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.electricGreen,
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
  chevronContainer: {
    padding: 4,
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
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  stackedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ProTennisColors.cardBackground,
    overflow: "hidden",
  },
  miniAvatar: {
    width: "100%",
    height: "100%",
  },
  miniAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: ProTennisColors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  miniAvatarInitial: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
  moreAvatar: {
    width: "100%",
    height: "100%",
    backgroundColor: ProTennisColors.electricGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  moreAvatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#000",
  },
  detailModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  detailModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: ProTennisColors.backgroundPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: ProTennisColors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.textPrimary,
  },
  modalScrollView: {
    paddingHorizontal: Spacing.lg,
  },
  sessionInfoCard: {
    backgroundColor: ProTennisColors.cardBackground,
    borderRadius: 12,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderLeftWidth: 4,
  },
  sessionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: ProTennisColors.textPrimary,
    marginBottom: 4,
  },
  sessionLevel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  sessionDetails: {
    gap: Spacing.sm,
  },
  sessionDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionDetailText: {
    fontSize: 14,
    color: ProTennisColors.textSecondary,
  },
  participantsSection: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  participantsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: ProTennisColors.textPrimary,
    marginBottom: Spacing.md,
  },
  noParticipants: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: ProTennisColors.cardBackground,
    borderRadius: 12,
  },
  noParticipantsText: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: ProTennisColors.textMuted,
    textAlign: "center",
  },
  participantsList: {
    gap: Spacing.sm,
  },
  participantItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.cardBackground,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: ProTennisColors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.textPrimary,
  },
  participantLevel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  modalFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: ProTennisColors.border,
  },
  alreadyEnrolledBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  alreadyEnrolledText: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.success,
  },
  sessionFullBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  sessionFullText: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.error,
  },
  enrollButton: {
    backgroundColor: ProTennisColors.electricGreen,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: "center",
  },
  enrollButtonDisabled: {
    opacity: 0.7,
  },
  enrollButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  enrollCreditText: {
    fontSize: 12,
    color: "rgba(0, 0, 0, 0.6)",
    marginTop: 2,
  },
  filterContainer: {
    marginBottom: Spacing.lg,
  },
  filterScroll: {
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
    backgroundColor: ProTennisColors.cardBackground,
    gap: 6,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: ProTennisColors.textSecondary,
  },
});
