import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ObservationTrendChart } from "@/components/ObservationTrendChart";
import { NeoLoadoutPanel, NeoGlowBadge } from "@/components/NeoLoadoutPanel";
import { PlayerAIInsightsCard } from "@/components/PlayerAIInsightsCard";
import type { TabProps, PlayerSkillState, PlayerXpData, ObservationTrend, SkillDomain, PlayerWithProgress, AssessmentStatus } from "./types";
import { styles } from "./coachingStyles";
import { getDomainIcon, getTrendIcon, getTrendColor, getMomentumColor, getProgressColor, getAssessmentBadge, getLevelColor, formatSessionTime, formatSessionDate, getSessionTypeLabel } from "./progressUtils";
import { useCoachingScroll } from "./CoachingScrollContext";

export function ProgressTab({ insets: _insets, tabBarHeight }: TabProps) {
  const onScroll = useCoachingScroll();
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithProgress | null>(null);
  const [assessmentMode, setAssessmentMode] = useState(false);
  const [pendingAssessments, setPendingAssessments] = useState<Record<string, AssessmentStatus>>({});
  const [feedbackSession, setFeedbackSession] = useState<any>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const queryClient = useQueryClient();
  const { calendarData } = useCoach();

  // Get coachId from calendar data (coach's own sessions)
  const coachId = calendarData?.ownSessions?.[0]?.coachId;
  
  const { data: players = [], isLoading: playersLoading } = useQuery<PlayerWithProgress[]>({
    queryKey: ["/api/coach/players/progress"],
  });

  const { data: domains = [] } = useQuery<SkillDomain[]>({
    queryKey: ["/api/progress/domains"],
  });

  const { data: skillStates = [], isLoading: statesLoading } = useQuery<PlayerSkillState[]>({
    queryKey: [`/api/players/${selectedPlayer?.id}/skill-state`],
    enabled: !!selectedPlayer,
  });

  const { data: xpData } = useQuery<PlayerXpData>({
    queryKey: [`/api/players/${selectedPlayer?.id}/xp`],
    enabled: !!selectedPlayer,
  });

  const { data: observationTrends = [] } = useQuery<ObservationTrend[]>({
    queryKey: [`/api/players/${selectedPlayer?.id}/observation-trends`],
    enabled: !!selectedPlayer,
  });

  const submitAssessmentMutation = useMutation({
    mutationFn: async (data: { playerId: string; domainId: string; status: AssessmentStatus }) => {
      return apiRequest("POST", `/api/players/${data.playerId}/assessments`, {
        domainId: data.domainId,
        status: data.status,
        coachId: coachId,
        notes: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${selectedPlayer?.id}/skill-state`] });
    },
  });

  const toggleAssessment = (domainId: string, status: AssessmentStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingAssessments(prev => {
      if (prev[domainId] === status) {
        const { [domainId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [domainId]: status };
    });
  };

  const saveAssessments = async () => {
    if (!selectedPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    for (const [domainId, status] of Object.entries(pendingAssessments)) {
      await submitAssessmentMutation.mutateAsync({
        playerId: selectedPlayer.id,
        domainId,
        status,
      });
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingAssessments({});
    setAssessmentMode(false);
  };


  ;

  if (playersLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading progress...</Text>
      </View>
    );
  }

  // Player Detail View
  if (selectedPlayer) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <Pressable
          style={styles.backRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedPlayer(null);
          }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.dark.primary} />
          <Text style={styles.backText}>All Players</Text>
        </Pressable>

        <View style={styles.playerDetailHeader}>
          <View style={styles.playerAvatarLarge}>
            <Text style={styles.playerInitialLarge}>{selectedPlayer.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.playerDetailInfo}>
            <Text style={styles.playerDetailName}>{selectedPlayer.name}</Text>
            <View style={styles.playerDetailMeta}>
              {selectedPlayer.ballLevel ? (
                <View style={[styles.levelBadgeLarge, { borderColor: getLevelColor(selectedPlayer.ballLevel) }]}>
                  <View style={[styles.levelDotLarge, { backgroundColor: getLevelColor(selectedPlayer.ballLevel) }]} />
                  <Text style={[styles.levelBadgeTextLarge, { color: getLevelColor(selectedPlayer.ballLevel) }]}>
                    {selectedPlayer.ballLevel} Ball
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            style={[styles.assessmentToggle, assessmentMode && styles.assessmentToggleActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAssessmentMode(!assessmentMode);
              if (assessmentMode) {
                setPendingAssessments({});
              }
            }}
          >
            <Ionicons 
              name={assessmentMode ? "close" : "clipboard-outline"} 
              size={18} 
              color={assessmentMode ? Colors.dark.text : Colors.dark.gold} 
            />
          </Pressable>
        </View>

        {assessmentMode ? (
          <View style={styles.assessmentBanner}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.dark.gold} />
            <Text style={styles.assessmentBannerText}>Assessment Mode - Tap domains to set levels</Text>
          </View>
        ) : null}

        {/* XP Display */}
        {xpData ? (
          <View style={styles.xpCard}>
            <View style={styles.xpHeader}>
              <Ionicons name="star" size={24} color={Colors.dark.gold} />
              <Text style={styles.xpTotal}>{xpData.totalXp} XP</Text>
            </View>
            {xpData.transactions.length > 0 ? (
              <View style={styles.xpHistory}>
                <Text style={styles.xpHistoryTitle}>Recent XP</Text>
                {xpData.transactions.slice(0, 3).map((tx) => (
                  <View key={tx.id} style={styles.xpTransaction}>
                    <Text style={styles.xpAmount}>+{tx.xpAmount}</Text>
                    <Text style={styles.xpSource}>{tx.description || tx.source}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* AI Progress Insights */}
        <PlayerAIInsightsCard playerId={selectedPlayer.id} />

        {/* Observation Trends */}
        {observationTrends.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Progress Trends</Text>
            <View style={styles.trendsContainer}>
              {observationTrends.map((trend) => (
                <ObservationTrendChart
                  key={trend.domainId}
                  trend={trend}
                  width={320}
                  height={90}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Skill Domains */}
        <Text style={styles.sectionTitle}>Skill Domains</Text>
        {statesLoading ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        ) : (
          <View style={styles.domainGrid}>
            {skillStates.map((state) => {
              const assessment = getAssessmentBadge(state.assessmentStatus);
              return (
                <View key={state.id} style={styles.domainCard}>
                  <View style={styles.domainHeader}>
                    <Ionicons
                      name={getDomainIcon(state.domain?.icon || null)}
                      size={20}
                      color={getProgressColor(state.progressValue)}
                    />
                    <Text style={styles.domainName}>{state.domain?.displayName || "Unknown"}</Text>
                    {state.isFrozen ? (
                      <Ionicons name="snow-outline" size={14} color={Colors.dark.xpCyan} />
                    ) : null}
                  </View>
                  
                  {/* Progress Bar */}
                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarBg}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { 
                            width: `${state.progressValue}%`,
                            backgroundColor: getProgressColor(state.progressValue)
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.progressValue, { color: getProgressColor(state.progressValue) }]}>
                      {state.progressValue}%
                    </Text>
                  </View>

                  {assessmentMode ? (
                    <View style={styles.assessmentOptions}>
                      {(["not_yet", "developing", "meets", "above"] as AssessmentStatus[]).map((status) => {
                        const badge = getAssessmentBadge(status);
                        const isSelected = pendingAssessments[state.domainId] === status;
                        const isCurrent = state.assessmentStatus === status;
                        return (
                          <Pressable
                            key={status}
                            style={[
                              styles.assessmentOption,
                              isSelected && { backgroundColor: badge.color + "30", borderColor: badge.color },
                              isCurrent && !isSelected && { opacity: 0.6 },
                            ]}
                            onPress={() => toggleAssessment(state.domainId, status)}
                          >
                            <Text style={[styles.assessmentOptionText, { color: isSelected ? badge.color : Colors.dark.tabIconDefault }]}>
                              {badge.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <>
                      {state.domainXp > 0 || state.observationCount > 0 ? (
                        <View style={styles.domainXpRow}>
                          <View style={styles.domainXpBadge}>
                            <Ionicons name="star" size={10} color={Colors.dark.gold} />
                            <Text style={styles.domainXpText}>{state.domainXp} XP</Text>
                          </View>
                          <Text style={styles.domainObsCount}>
                            {state.observationCount} obs
                          </Text>
                          {state.avgDelta !== 0 ? (
                            <Text style={[
                              styles.domainAvgDelta,
                              { color: state.avgDelta > 0 ? Colors.dark.primary : state.avgDelta < 0 ? Colors.dark.error : Colors.dark.tabIconDefault }
                            ]}>
                              {state.avgDelta > 0 ? "+" : ""}{state.avgDelta}/obs
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={styles.domainMeta}>
                        <View style={styles.trendBadge}>
                          <Ionicons
                            name={getTrendIcon(state.trend)}
                            size={12}
                            color={getTrendColor(state.trend)}
                          />
                          <Text style={[styles.trendText, { color: getTrendColor(state.trend) }]}>
                            {state.trend === "improving" ? "Improving" : state.trend === "focus" ? "Needs Focus" : "Stable"}
                          </Text>
                        </View>
                        <View style={[styles.assessmentBadge, { backgroundColor: assessment.color + "20" }]}>
                          <Text style={[styles.assessmentText, { color: assessment.color }]}>{assessment.label}</Text>
                        </View>
                      </View>

                      {state.momentum ? (
                        <View style={styles.momentumRow}>
                          <Ionicons name="flash-outline" size={12} color={getMomentumColor(state.momentum)} />
                          <Text style={[styles.momentumText, { color: getMomentumColor(state.momentum) }]}>
                            Momentum: {state.momentum.charAt(0).toUpperCase() + state.momentum.slice(1)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {assessmentMode && Object.keys(pendingAssessments).length > 0 ? (
          <Pressable
            style={[styles.saveAssessmentsButton, submitAssessmentMutation.isPending && { opacity: 0.6 }]}
            onPress={saveAssessments}
            disabled={submitAssessmentMutation.isPending}
          >
            {submitAssessmentMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.saveAssessmentsText}>
                  Save {Object.keys(pendingAssessments).length} Assessment{Object.keys(pendingAssessments).length > 1 ? "s" : ""}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  // Session-based Feedback View - show sessions that need feedback
  const allSessions = calendarData?.ownSessions || [];
  
  // Group sessions by date and feedback status
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const needsFeedbackSessions = allSessions.filter((s: any) => {
    const sessionEnd = new Date(s.endTime);
    return sessionEnd < new Date() && s.status !== "completed" && s.status !== "cancelled";
  });
  
  const todaySessions = needsFeedbackSessions.filter((s: any) => {
    const sessionDate = new Date(s.startTime);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });
  
  const yesterdaySessions = needsFeedbackSessions.filter((s: any) => {
    const sessionDate = new Date(s.startTime);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === yesterday.getTime();
  });
  
  const earlierSessions = needsFeedbackSessions.filter((s: any) => {
    const sessionDate = new Date(s.startTime);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() < yesterday.getTime();
  }).slice(0, 20); // Limit to last 20


;

  const renderSessionCard = (session: any, showDate = false) => (
    <Pressable
      key={session.id}
      style={styles.feedbackSessionCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFeedbackSession(session);
        setShowFeedbackModal(true);
      }}
    >
      <View style={styles.feedbackSessionLeft}>
        <View style={styles.feedbackSessionIcon}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.gold} />
        </View>
        <View>
          <Text style={styles.feedbackSessionType}>{getSessionTypeLabel(session.sessionType)}</Text>
          <Text style={styles.feedbackSessionTime}>
            {showDate ? formatSessionDate(session.startTime) + ' · ' : ''}{formatSessionTime(session.startTime, session.endTime)}
          </Text>
        </View>
      </View>
      <View style={styles.feedbackSessionRight}>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>Needs Feedback</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.gold} />
      </View>
    </Pressable>
  );

  if (needsFeedbackSessions.length === 0) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.feedbackHeader}>
          <Text style={styles.feedbackSectionTitle}>Session Feedback</Text>
          <Text style={styles.feedbackSectionSubtitle}>All caught up!</Text>
        </View>
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>No pending feedback</Text>
          <Text style={styles.emptySubtext}>
            All sessions have been reviewed
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.feedbackHeader}>
        <Text style={styles.feedbackSectionTitle}>Session Feedback</Text>
        <View style={styles.feedbackCountBadge}>
          <Text style={styles.feedbackCountText}>{needsFeedbackSessions.length} pending</Text>
        </View>
      </View>

      {todaySessions.length > 0 ? (
        <View style={styles.feedbackGroup}>
          <Text style={styles.feedbackGroupTitle}>Today</Text>
          {todaySessions.map((s: any) => renderSessionCard(s))}
        </View>
      ) : null}

      {yesterdaySessions.length > 0 ? (
        <View style={styles.feedbackGroup}>
          <Text style={styles.feedbackGroupTitle}>Yesterday</Text>
          {yesterdaySessions.map((s: any) => renderSessionCard(s))}
        </View>
      ) : null}

      {earlierSessions.length > 0 ? (
        <View style={styles.feedbackGroup}>
          <Text style={styles.feedbackGroupTitle}>Earlier</Text>
          {earlierSessions.map((s: any) => renderSessionCard(s, true))}
        </View>
      ) : null}

      <QuickFeedbackModal
        visible={showFeedbackModal}
        session={feedbackSession}
        onClose={() => {
          setShowFeedbackModal(false);
          setFeedbackSession(null);
        }}
        onComplete={() => {
          setShowFeedbackModal(false);
          setFeedbackSession(null);
          queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
        }}
      />
    </ScrollView>
  );
}
