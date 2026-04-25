import React from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import StandaloneSessionDetailDrawer from "@/coach/components/StandaloneSessionDetailDrawer";
import { styles } from "../coachingStyles";
import type { FeedbackTabState } from "./useFeedbackTab";
import { useCoachingScroll } from "../CoachingScrollContext";

type ViewPeriod = "week" | "month";

export function SessionListView(props: FeedbackTabState) {
  const onScroll = useCoachingScroll();
  const navigation = useNavigation<any>();
  const {
    viewPeriod, setViewPeriod,
    periodOffset, setPeriodOffset,
    handlePeriodChange,
    statusFilter, setStatusFilter,
    expandedDays, setExpandedDays,
    selectedSession, setSelectedSession,
    detailSession, setDetailSession,
    showDetailDrawer, setShowDetailDrawer,
    periodStatusCounts,
    periodSessions,
    sortedDays,
    groupedByDay,
    tabBarHeight,
    hasSessionFeedback,
    getSessionXp,
    formatTime,
  } = props;

  const { data: reviewsData } = useQuery<{ stats: { totalReviews: number; averageOverall: number | null } | null; reviews: any[] }>({
    queryKey: ["/api/coach/my-reviews"],
    staleTime: 120000,
  });

  // State for accordion expansion is defined as expandedDays below
  
  // Calculate the period's date range for display
  const getPeriodRange = (offset: number, period: ViewPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (offset * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return { start: weekStart, end: weekEnd };
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 1);
      return { start: monthStart, end: monthEnd };
    }
  };
  
  const periodRange = getPeriodRange(periodOffset, viewPeriod);
  
  const formatPeriodLabel = () => {
    const { start, end } = periodRange;
    if (viewPeriod === "month") {
      return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    // Week view
    const endForDisplay = new Date(end);
    endForDisplay.setDate(endForDisplay.getDate() - 1);
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endForDisplay.toLocaleDateString('en-US', { month: 'short' });
    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${endForDisplay.getDate()}`;
    }
    return `${startMonth} ${start.getDate()} - ${endMonth} ${endForDisplay.getDate()}`;
  };
  
  const isCurrentPeriod = periodOffset === 0;
  
  const toggleDay = (day: string | number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };
  
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];


  const hasReviews = (reviewsData?.stats?.totalReviews ?? 0) > 0;
  const avgRating = reviewsData?.stats?.averageOverall ?? 0;

  return (
    <>
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* E2: My Reviews Compact Card */}
      {hasReviews ? (
        <Pressable
          style={listLocalStyles.reviewsCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("MyReviews");
          }}
        >
          <View style={listLocalStyles.reviewsCardLeft}>
            <Ionicons name="star" size={16} color={Colors.dark.gold} />
            <Text style={listLocalStyles.reviewsRating}>
              {avgRating.toFixed(1)}
            </Text>
            <Text style={listLocalStyles.reviewsCount}>
              from {reviewsData!.stats!.totalReviews} review{reviewsData!.stats!.totalReviews !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={listLocalStyles.reviewsCardRight}>
            <Text style={listLocalStyles.reviewsSeeAll}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.xpCyan} />
          </View>
        </Pressable>
      ) : null}

      {/* Period Toggle (Week/Month) */}
      <View style={styles.periodToggleRow}>
        {(["week", "month"] as const).map((period) => {
          const isActive = viewPeriod === period;
          return (
            <Pressable
              key={period}
              style={[
                styles.periodToggleButton,
                isActive && styles.periodToggleButtonActive,
              ]}
              onPress={() => handlePeriodChange(period)}
            >
              <Text style={[
                styles.periodToggleText,
                isActive && styles.periodToggleTextActive,
              ]}>
                {period === "week" ? "Week" : "Month"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Period Navigation Header */}
      <View style={styles.weekNavHeader}>
        <Pressable 
          style={styles.weekNavArrow} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPeriodOffset(prev => prev - 1);
          }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.primary} />
        </Pressable>
        
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>
            {isCurrentPeriod 
              ? (viewPeriod === "week" ? "This Week" : "This Month") 
              : formatPeriodLabel()
            }
          </Text>
          {!isCurrentPeriod ? (
            <Pressable 
              style={styles.todayButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPeriodOffset(0);
              }}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          ) : null}
        </View>
        
        <Pressable 
          style={styles.weekNavArrow} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPeriodOffset(prev => prev + 1);
          }}
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {/* Status Filter Pills */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.calmStatusScroll}
        contentContainerStyle={styles.calmStatusContent}
      >
        {([
          { id: "all" as const, label: "All", count: periodStatusCounts.all, icon: null, color: Colors.dark.primary },
          { id: "open" as const, label: "Needs Feedback", count: periodStatusCounts.open, icon: "alert-circle" as const, color: Colors.dark.gold },
          { id: "complete" as const, label: "Completed", count: periodStatusCounts.complete, icon: "checkmark-circle" as const, color: Colors.dark.primary },
        ]).map((status) => {
          const isActive = statusFilter === status.id;
          return (
            <Pressable
              key={status.id}
              style={[
                styles.calmStatusPill,
                isActive && { backgroundColor: status.color + "20", borderColor: status.color },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStatusFilter(status.id);
              }}
            >
              {status.icon ? (
                <Ionicons 
                  name={status.icon} 
                  size={14} 
                  color={isActive ? status.color : Colors.dark.tabIconDefault}
                />
              ) : null}
              <Text style={[styles.calmStatusText, isActive && { color: status.color }]}>
                {status.label} ({status.count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Day Accordion Rows */}
      <View style={styles.dayAccordionContainer}>
        {sortedDays.length === 0 ? (
          <View style={styles.calmEmptyCard}>
            <View style={styles.calmEmptyIcon}>
              <Ionicons name="checkmark-done" size={26} color={Colors.dark.tabIconDefault} />
            </View>
            <Text style={styles.calmEmptyText}>
              {periodSessions.length === 0 
                ? `No standalone lessons this ${viewPeriod}`
                : "No matching lessons"
              }
            </Text>
            <Text style={styles.calmEmptySubtext}>
              {periodSessions.length === 0 
                ? "One-off lessons not part of a class appear here"
                : "Try selecting a different filter"
              }
            </Text>
          </View>
        ) : (
          sortedDays.map((dayKey) => {
            const daySessions = groupedByDay[dayKey] || [];
            const isExpanded = expandedDays.has(dayKey);
            const needsFeedbackCount = daySessions.filter(s => s.status !== "completed").length;
            
            // Format day header based on view period
            const getDayLabel = () => {
              if (viewPeriod === "week") {
                return DAY_NAMES[dayKey as number];
              } else {
                // For month view, show "Mon Jan 13" format
                const date = new Date(dayKey as string);
                return date.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                });
              }
            };
            
            return (
              <View key={String(dayKey)} style={styles.dayAccordion}>
                <Pressable 
                  style={styles.dayAccordionHeader}
                  onPress={() => toggleDay(dayKey)}
                >
                  <View style={styles.dayAccordionLeft}>
                    <Ionicons 
                      name={isExpanded ? "chevron-down" : "chevron-forward"} 
                      size={20} 
                      color={Colors.dark.gold} 
                    />
                    <Text style={styles.dayAccordionTitle}>{getDayLabel()}</Text>
                  </View>
                  <View style={styles.dayAccordionRight}>
                    {needsFeedbackCount > 0 ? (
                      <View style={styles.dayFeedbackBadge}>
                        <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
                        <Text style={styles.dayFeedbackBadgeText}>{needsFeedbackCount}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.dayAccordionCount}>{daySessions.length}</Text>
                    <Text style={styles.dayAccordionLabel}>
                      {daySessions.length === 1 ? "lesson" : "lessons"}
                    </Text>
                  </View>
                </Pressable>
                
                {isExpanded ? (
                  <View style={styles.dayAccordionContent}>
                    {daySessions.map((session) => {
                      const needsFeedback = session.status !== "completed";
                      const sessionXp = getSessionXp(session.sessionType);
                      const players = session.players || [];
                      
                      const getTypeColor = (type: string) => {
                        switch (type) {
                          case "private": return Colors.dark.sessionPrivate;
                          case "semi_private": return Colors.dark.sessionSemiPrivate;
                          case "group": return Colors.dark.sessionGroup;
                          case "physical": return Colors.dark.sessionPhysical;
                          case "activity": return Colors.dark.sessionActivity;
                          default: return Colors.dark.sessionPrivate;
                        }
                      };
                      
                      const getBallLevelColor = (level?: string) => {
                        switch (level?.toUpperCase()) {
                          case "BLUE": return "#3B82F6";
                          case "RED": return "#EF4444";
                          case "ORANGE": return "#F97316";
                          case "GREEN": return "#22C55E";
                          case "YELLOW": return "#EAB308";
                          case "ADULT":
                          case "GLOW": return "#00E5FF"; // Cyan for adult players
                          default: return Colors.dark.textMuted;
                        }
                      };
                      
                      const typeColor = getTypeColor(session.sessionType);
                      const primaryBallLevel = players[0]?.ballLevel;
                      const ballLevelColor = getBallLevelColor(primaryBallLevel);
                      
                      const sessionDate = session.sessionDate ? new Date(session.sessionDate) : null;
                      const formattedDate = sessionDate 
                        ? sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : null;
                      
                      const sessionStartTime = session.startTime ? new Date(session.startTime) : null;
                      const isPastSession = sessionStartTime ? sessionStartTime < new Date() : false;
                      const isScheduled = !isPastSession && session.status !== "completed";
                      const feedbackStatus = hasSessionFeedback(session) ? "done" : isScheduled ? "scheduled" : "pending";

                      return (
                        <Pressable
                          key={session.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setDetailSession(session);
                            setShowDetailDrawer(true);
                          }}
                          style={[
                            styles.richSessionCard,
                            needsFeedback && styles.richSessionCardNeedsFeedback,
                          ]}
                        >
                          <View style={[styles.richSessionHeader, { borderBottomColor: typeColor + '40' }]}>
                            <View style={styles.richSessionTimeRow}>
                              <View style={[styles.richSessionTimeBadge, { backgroundColor: typeColor + '20' }]}>
                                <Ionicons name="time-outline" size={12} color={typeColor} />
                                <Text style={[styles.richSessionTimeText, { color: typeColor }]}>
                                  {formatTime(session.startTime)}
                                </Text>
                              </View>
                              <View style={styles.richSessionTypeBadge}>
                                <Text style={styles.richSessionTypeText}>
                                  {session.sessionType === "private" ? "Private" 
                                    : session.sessionType === "semi_private" ? "Semi"
                                    : session.sessionType === "group" ? "Group"
                                    : session.sessionType === "physical" ? "Physical"
                                    : session.sessionType === "activity" ? "Activity"
                                    : session.sessionType}
                                </Text>
                              </View>
                              <Text style={styles.richSessionDuration}>{session.duration}m</Text>
                              {formattedDate ? (
                                <View style={styles.sessionDateBadge}>
                                  <Ionicons name="calendar-outline" size={10} color={Colors.dark.xpCyan} />
                                  <Text style={styles.sessionDateText}>{formattedDate}</Text>
                                </View>
                              ) : null}
                            </View>
                            {primaryBallLevel ? (
                              <View style={[styles.ballLevelBadge, { backgroundColor: ballLevelColor + '20', borderColor: ballLevelColor }]}>
                                <View style={[styles.ballLevelDot, { backgroundColor: ballLevelColor }]} />
                                <Text style={[styles.ballLevelText, { color: ballLevelColor }]}>
                                  {primaryBallLevel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          
                          <View style={styles.richSessionBody}>
                            <View style={styles.richSessionPlayersRow}>
                              <View style={styles.playerAvatarStack}>
                                {players.slice(0, 3).map((player: any, idx: number) => (
                                  <View 
                                    key={player.id || idx} 
                                    style={[
                                      styles.playerAvatarCircle,
                                      { marginLeft: idx > 0 ? -8 : 0, zIndex: 3 - idx }
                                    ]}
                                  >
                                    <Text style={styles.playerAvatarText}>
                                      {player.name?.charAt(0)?.toUpperCase() || "?"}
                                    </Text>
                                  </View>
                                ))}
                                {players.length > 3 ? (
                                  <View style={[styles.playerAvatarCircle, styles.playerAvatarMore, { marginLeft: -8 }]}>
                                    <Text style={styles.playerAvatarMoreText}>+{players.length - 3}</Text>
                                  </View>
                                ) : null}
                              </View>
                              <View style={styles.playerNamesContainer}>
                                <Text style={styles.playerNamesText} numberOfLines={1}>
                                  {players.length === 0 
                                    ? "No players" 
                                    : players.length <= 2 
                                      ? players.map((p: any) => p.name?.split(' ')[0]).join(', ')
                                      : `${players.slice(0, 2).map((p: any) => p.name?.split(' ')[0]).join(', ')} +${players.length - 2}`
                                  }
                                </Text>
                              </View>
                            </View>
                            
                            <View style={styles.richSessionFooter}>
                              {feedbackStatus === "scheduled" ? (
                                <View style={[styles.richCompletedBadge, { backgroundColor: Colors.dark.xpCyan + "15", borderColor: Colors.dark.xpCyan + "40" }]}>
                                  <Ionicons name="time-outline" size={14} color={Colors.dark.xpCyan} />
                                  <Text style={[styles.richCompletedText, { color: Colors.dark.xpCyan }]}>Scheduled</Text>
                                </View>
                              ) : feedbackStatus === "pending" ? (
                                <View style={styles.xpRewardBadge}>
                                  <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
                                  <Text style={styles.xpRewardText}>Needs Feedback</Text>
                                </View>
                              ) : (
                                <View style={styles.richCompletedBadge}>
                                  <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                                  <Text style={styles.richCompletedText}>Done</Text>
                                </View>
                              )}
                              <View style={styles.feedbackActionRow}>
                                <Text style={[styles.feedbackActionText, feedbackStatus === "done" && { color: Colors.dark.xpCyan }]}>
                                  {feedbackStatus === "done" ? "View Details" : feedbackStatus === "scheduled" ? "View Session" : "Add Feedback"}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={feedbackStatus === "done" ? Colors.dark.xpCyan : Colors.dark.gold} />
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
    
    <StandaloneSessionDetailDrawer
      visible={showDetailDrawer}
      session={detailSession}
      onClose={() => {
        setShowDetailDrawer(false);
        setDetailSession(null);
      }}
      onOpenFeedback={(session) => {
        setShowDetailDrawer(false);
        setDetailSession(null);
        setSelectedSession(session as any);
      }}
    />
  </>
  );
}

const listLocalStyles = StyleSheet.create({
  reviewsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  reviewsCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewsRating: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  reviewsCount: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  reviewsCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reviewsSeeAll: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
});
