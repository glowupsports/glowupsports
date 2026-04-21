import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable, DimensionValue, Modal, InteractionManager } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiRequest, getStaticAssetsUrl } from "@/lib/query-client";
import { Image as ExpoImage } from "expo-image";
import { Spacing, GlowColors, Backgrounds, BorderRadius, Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useSport, SPORT_DEFINITIONS, getSportColor, getSportLabel, type Sport } from "@/player/context/SportContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { GuestPromptModal, useGuestGuard } from "@/components/GuestPromptModal";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PrimaryActionsRow } from "@/player/components/PrimaryActionsRow";
import { PlayersNearYouRow } from "@/player/components/DiscoveryRows";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { MiniFeed } from "@/player/components/MiniFeed";
import { HeroCarousel } from "@/player/components/HeroCarousel";
import { NewsTicker } from "@/player/components/NewsTicker";
import { BetaFeedbackButton } from "@/player/components/BetaFeedbackButton";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import PinEntryModal from "@/components/PinEntryModal";
import ChooseUsernameModal from "@/player/components/ChooseUsernameModal";
import { BirthdayConfettiOverlay } from "@/player/components/BirthdayThemeOverlay";
import { BirthdayBanner, BirthdayXPBonusCard } from "@/player/components/BirthdayThemeOverlay";
import { RamadanConfettiOverlay, RamadanBanner, RamadanBonusCard } from "@/player/components/RamadanCelebrationOverlay";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { FeedbackToast } from "@/player/components/FeedbackToast";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import SpotlightNominationModal from "@/player/components/SpotlightNominationModal";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuests, Quest } from "@/player/hooks/useQuests";
import { DailyBriefingModal } from "@/player/components/DailyBriefingModal";
import { UpcomingProviderSessionCard } from "@/player/components/UpcomingProviderSessionCard";
import { UpcomingAppointmentCard } from "@/player/components/UpcomingAppointmentCard";
import { FreePlayerDiscoverySections, JoinAcademySoftCard } from "@/player/components/FreePlayerDiscovery";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
interface DashboardData {
  player: {
    id: string;
    name: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
    profilePhotoUrl?: string | null;
    dateOfBirth?: string | null;
    playStyle?: string | null;
  };
  coach: {
    id: string;
    name: string;
  } | null;
  academy: {
    id: string;
    name: string;
  } | null;
  nextSession: {
    id: string;
    date: string;
    type: string;
    courtName?: string;
    endTime?: string;
    isLive?: boolean;
    coachName?: string;
  } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
  isFreePlayer?: boolean;
  lastFeedback?: { message: string; date: string } | null;
}


const _unusedAiCardStyles = makeReactiveStyles(() => StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg + 1,
    overflow: "hidden",
  },
  gradientBorder: {
    padding: 1.5,
    borderRadius: BorderRadius.lg + 1,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sub: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexShrink: 0,
  },
  layersBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  layersDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  layersBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(139,92,246,0.1)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  focusText: {
    flex: 1,
    fontSize: 11,
    color: Colors.dark.textSubtle,
    fontStyle: "italic",
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  limitText: {
    fontSize: 11,
    color: Colors.dark.error,
    fontWeight: "600",
  },
}));

function QuestMiniTile({ quest, questType, onPress }: { quest: Quest | null; questType: "daily" | "weekly" | null; onPress: () => void }) {
  if (!quest) {
    return (
      <MiniTile
        label="QUEST"
        icon="flame-outline"
        iconColor={GlowColors.orange}
        accentBg="rgba(255,133,27,0.06)"
        accentBorder="rgba(255,133,27,0.2)"
        accessibilityLabel="View quests"
        onPress={onPress}
        footer={<Text style={miniTileStyles.footerText} numberOfLines={1}>View all</Text>}
      >
        <Text style={miniTileStyles.questEmptyText} numberOfLines={2}>
          No active quest
        </Text>
      </MiniTile>
    );
  }

  const progress = quest.targetProgress > 0 ? Math.min(quest.currentProgress / quest.targetProgress, 1) : 0;
  const typeLabel = questType === "weekly" ? "WEEKLY" : "DAILY";

  return (
    <MiniTile
      label={typeLabel}
      icon="flame"
      iconColor={GlowColors.orange}
      accentBg="rgba(255,133,27,0.06)"
      accentBorder="rgba(255,133,27,0.2)"
      accessibilityLabel={`Quest ${quest.name}`}
      onPress={onPress}
      footer={
        <View style={miniTileStyles.footerRow}>
          <Ionicons name="flash" size={10} color={Colors.dark.gold} />
          <Text style={miniTileStyles.xpFooterText} numberOfLines={1}>+{quest.xpReward ?? 0} XP</Text>
        </View>
      }
    >
      <Text style={miniTileStyles.questName} numberOfLines={2}>{quest.name}</Text>
      <View style={miniTileStyles.progressBar}>
        <View
          style={[
            miniTileStyles.progressFill,
            {
              width: `${Math.max(progress * 100, 2)}%` as DimensionValue,
              backgroundColor: quest.iconColor || GlowColors.primary,
            },
          ]}
        />
      </View>
      <Text style={miniTileStyles.progressText}>{quest.currentProgress}/{quest.targetProgress}</Text>
    </MiniTile>
  );
}

interface SpotlightNomineeMini {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  totalVotes: number;
}
interface SpotlightCurrentWeekMini {
  weekStart: string;
  nominations: SpotlightNomineeMini[];
  myNomination: { nominatedPlayerId: string; reason: string } | null;
  daysRemaining: number;
  totalVotes: number;
}
interface SpotlightWeeklyWinnerMini {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
}

function SpotlightTileAvatar({ photoUrl, borderColor = Colors.dark.gold }: { photoUrl?: string | null; borderColor?: string }) {
  const baseUrl = getStaticAssetsUrl();
  const fullUrl = photoUrl ? (photoUrl.startsWith("http") ? photoUrl : `${baseUrl}${photoUrl}`) : null;
  return (
    <View style={[miniTileStyles.spotAvatar, { borderColor }]}>
      {fullUrl ? (
        <ExpoImage source={{ uri: fullUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
        </View>
      )}
    </View>
  );
}

function SpotlightMiniTile({ onNominate, onViewDetails }: { onNominate: () => void; onViewDetails: () => void }) {
  const { user } = useAuth();

  const { data: currentWeek } = useQuery<SpotlightCurrentWeekMini>({
    queryKey: ["/api/player/spotlight/current-week"],
    enabled: !!user?.playerId,
  });
  const { data: weeklyWinner } = useQuery<{ winner: SpotlightWeeklyWinnerMini | null }>({
    queryKey: ["/api/player/spotlight/weekly-winner"],
    enabled: !!user?.playerId,
  });

  const hasVoted = !!currentWeek?.myNomination;
  const topNominee = currentWeek?.nominations?.[0] ?? null;
  const lastWinner = weeklyWinner?.winner ?? null;
  const daysRemaining = currentWeek?.daysRemaining;
  const chipText = daysRemaining === undefined ? null : daysRemaining <= 0 ? "Ends today!" : `${daysRemaining}d left`;

  // State A: voting open + has top nominee + I haven't voted -> show nominee + Vote pill
  // State B: I have voted -> show top nominee (if any) + "You voted" footer; tap opens details
  // State C: no nominees this week -> show last winner OR fully empty "be the first" CTA
  const stateA = !!topNominee && !hasVoted;
  const stateB = hasVoted;
  const stateC = !stateA && !stateB;

  const handleTilePress = () => {
    // Empty-no-winner state: tile tap nominates directly (only meaningful action).
    // All other states: tile tap routes to spotlight details; the Vote/Nominate
    // pill is the explicit one-tap nominate entry point.
    if (stateC && !lastWinner) {
      onNominate();
    } else {
      onViewDetails();
    }
  };

  const headerRight = chipText ? (
    <View style={miniTileStyles.urgencyChip}>
      <Text style={miniTileStyles.urgencyChipText} numberOfLines={1}>{chipText}</Text>
    </View>
  ) : null;

  let footer: React.ReactNode = null;
  if (stateA || (stateC && !lastWinner)) {
    footer = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={stateA ? "Vote for spotlight nominee" : "Nominate spotlight player"}
        onPress={(e) => {
          e.stopPropagation?.();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNominate();
        }}
        style={miniTileStyles.votePill}
      >
        <Ionicons name="star" size={10} color={Colors.dark.buttonText} />
        <Text style={miniTileStyles.votePillText}>{stateA ? "Vote" : "Nominate"}</Text>
      </Pressable>
    );
  } else if (stateB) {
    footer = (
      <View style={miniTileStyles.votedRow}>
        <Ionicons name="checkmark-circle" size={12} color={Colors.dark.accentText} />
        <Text style={miniTileStyles.votedFooterText} numberOfLines={1}>You voted</Text>
      </View>
    );
  } else if (stateC && lastWinner) {
    footer = (
      <View style={miniTileStyles.footerRow}>
        <Ionicons name="ribbon" size={10} color={Colors.dark.gold} />
        <Text style={miniTileStyles.footerText} numberOfLines={1}>Winner</Text>
      </View>
    );
  }

  let body: React.ReactNode = null;
  if ((stateA || stateB) && topNominee) {
    body = (
      <>
        <SpotlightTileAvatar photoUrl={topNominee.profilePhotoUrl} />
        <Text style={miniTileStyles.spotName} numberOfLines={1}>
          {topNominee.playerName.split(" ")[0]}
        </Text>
        <View style={miniTileStyles.starRow}>
          <Ionicons name="star" size={10} color={Colors.dark.gold} />
          <Text style={miniTileStyles.starCountText}>{topNominee.totalVotes}</Text>
        </View>
      </>
    );
  } else if (stateB && !topNominee) {
    // Edge: voted but no nominee data; just show muted text
    body = <Text style={miniTileStyles.questEmptyText} numberOfLines={2}>Vote recorded</Text>;
  } else if (stateC && lastWinner) {
    body = (
      <>
        <SpotlightTileAvatar photoUrl={lastWinner.profilePhotoUrl} />
        <Text style={miniTileStyles.spotName} numberOfLines={1}>
          {lastWinner.playerName.split(" ")[0]}
        </Text>
      </>
    );
  } else {
    body = <Text style={miniTileStyles.questEmptyText} numberOfLines={2}>Be the first to nominate</Text>;
  }

  return (
    <MiniTile
      label="SPOTLIGHT"
      icon="trophy"
      iconColor={Colors.dark.gold}
      accentBg="rgba(255,215,0,0.08)"
      accentBorder="rgba(255,215,0,0.25)"
      accessibilityLabel="Player spotlight"
      onPress={handleTilePress}
      headerRight={headerRight}
      footer={footer}
    >
      {body}
    </MiniTile>
  );
}

interface MiniTileProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  accentBg: string;
  accentBorder: string;
  onPress: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  headerRight?: React.ReactNode;
  accessibilityLabel?: string;
}

function MiniTile({
  label,
  icon,
  iconColor,
  accentBg,
  accentBorder,
  onPress,
  children,
  footer,
  headerRight,
  accessibilityLabel,
}: MiniTileProps) {
  // Root is a plain View so the footer slot can host its own interactive
  // elements (e.g. Spotlight's Vote/Nominate pill) without nesting a
  // <button> inside another <button>, which React refuses to hydrate on
  // web and causes a fully white screen.
  return (
    <View
      style={[
        miniTileStyles.tile,
        { backgroundColor: accentBg, borderColor: accentBorder },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          miniTileStyles.tileTapArea,
          pressed && miniTileStyles.tilePressed,
        ]}
      >
        <View style={miniTileStyles.header}>
          <View style={miniTileStyles.headerLeft}>
            <Ionicons name={icon} size={11} color={iconColor} />
            <Text style={[miniTileStyles.label, { color: iconColor }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {headerRight}
        </View>
        <View style={miniTileStyles.body}>{children}</View>
      </Pressable>
      {footer ? <View style={miniTileStyles.footer}>{footer}</View> : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified IMPROVE card — AI Coach (top) + Tennis IQ / Quest (2 cols) + Spotlight (bottom)
// All interactive elements are SIBLING Pressables, never nested. Replaces the
// old AICoachEntryCard + MiniTile row, including the buggy nested-Pressable
// inside SpotlightMiniTile that caused a "<button> cannot contain a nested
// <button>" white screen on web.
// ─────────────────────────────────────────────────────────────────────────────

const TENNIS_IQ_SCORE_KEY_INLINE = "@glow_tennis_iq_score";

interface IQQuestionInline {
  q: string;
  opts: string[];
  correct: string;
  explanation: string;
}

function IQQuizModal({
  visible,
  onClose,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: (score: number) => void;
}) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const { data: quizData, isLoading: quizLoading } = useQuery<{ questions: IQQuestionInline[] }>({
    queryKey: ["/api/quiz/tennis-iq"],
    staleTime: 24 * 60 * 60 * 1000,
  });
  const questions = quizData?.questions ?? [];

  // Reset internal state whenever the modal is opened.
  useEffect(() => {
    if (visible) {
      setCurrentQ(0);
      setAnswers([]);
      setSelectedAnswer(null);
    }
  }, [visible]);

  const handleSelectAnswer = (answer: string) => {
    if (selectedAnswer !== null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAnswer(answer);
  };

  const handleNext = () => {
    if (selectedAnswer === null || questions.length === 0) return;
    const newAnswers = [...answers, selectedAnswer];
    setAnswers(newAnswers);
    setSelectedAnswer(null);
    if (currentQ < questions.length - 1) {
      setCurrentQ((prev) => prev + 1);
    } else {
      const finalScore = newAnswers.filter((a, i) => a === questions[i].correct).length;
      onComplete(finalScore);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const quizComplete = questions.length > 0 && answers.length === questions.length;
  const liveScore = answers.filter((a, i) => a === questions[i]?.correct).length;
  const currentQuestion = questions[currentQ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={iqCardStyles.modalOverlay}>
        <View style={iqCardStyles.modalSheet}>
          <View style={iqCardStyles.modalHandle} />
          <Text style={iqCardStyles.modalTitle}>Tennis IQ Quiz</Text>

          {quizLoading ? (
            <View style={iqCardStyles.loadingWrap}>
              <ActivityIndicator color={Colors.dark.gold} size="small" />
              <Text style={iqCardStyles.loadingText}>Loading questions...</Text>
            </View>
          ) : quizComplete ? (
            <View style={iqCardStyles.resultWrap}>
              <View style={iqCardStyles.resultCircle}>
                <Text style={iqCardStyles.resultScore}>{liveScore}/{questions.length}</Text>
              </View>
              <Text style={iqCardStyles.resultLabel}>
                {liveScore === questions.length
                  ? "Perfect score!"
                  : liveScore >= questions.length * 0.6
                  ? "Well done!"
                  : "Keep learning!"}
              </Text>
              <Pressable style={iqCardStyles.doneBtn} onPress={onClose}>
                <Text style={iqCardStyles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : currentQuestion ? (
            <View style={iqCardStyles.quizBody}>
              <Text style={iqCardStyles.questionNum}>Question {currentQ + 1} of {questions.length}</Text>
              <Text style={iqCardStyles.question}>{currentQuestion.q}</Text>
              {currentQuestion.opts.map((opt) => {
                const isSelected = selectedAnswer === opt;
                const revealed = selectedAnswer !== null;
                const isCorrect = opt === currentQuestion.correct;
                let optStyle = iqCardStyles.optionBtn;
                if (revealed && isCorrect) optStyle = iqCardStyles.optionCorrect;
                else if (revealed && isSelected && !isCorrect) optStyle = iqCardStyles.optionWrong;
                else if (revealed) optStyle = iqCardStyles.optionLocked;
                return (
                  <Pressable key={opt} style={optStyle} onPress={() => handleSelectAnswer(opt)}>
                    <Text style={[iqCardStyles.optionText, revealed && isCorrect && { color: "#22c55e", fontWeight: "700" }, revealed && isSelected && !isCorrect && { color: "#f87171" }]}>{opt}</Text>
                  </Pressable>
                );
              })}
              {selectedAnswer !== null ? (
                <>
                  <Text style={iqCardStyles.explanation}>{currentQuestion.explanation}</Text>
                  <Pressable style={iqCardStyles.nextBtn} onPress={handleNext}>
                    <Text style={iqCardStyles.nextBtnText}>
                      {currentQ < questions.length - 1 ? "Next Question" : "See Results"}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function UnifiedImproveCard({
  quest,
  questType,
  onQuestPress,
  onSpotlightNominate,
  onSpotlightDetails,
}: {
  quest: Quest | null;
  questType: "daily" | "weekly" | null;
  onQuestPress: () => void;
  onSpotlightNominate: () => void;
  onSpotlightDetails: () => void;
}) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // ── AI Coach data
  const { data: aiStatus } = useQuery<{
    isPro: boolean;
    isCoach: boolean;
    callCount: number;
    limit: number;
  }>({
    queryKey: ["/api/ai-pro/status"],
    staleTime: 60 * 1000,
    retry: false,
  });
  const { data: aiCoachContext } = useQuery<{
    glowMirrorLayers?: { sessionCheckins: boolean; monthlyVoice: boolean; perceptionGaps: boolean };
  }>({
    queryKey: ["/api/player/me/ai-coach/context"],
    staleTime: 60 * 1000,
  });
  const { data: weeklyDigest } = useQuery<{ data: { focusArea?: string } | null } | null>({
    queryKey: ["/api/player/me/weekly-digest"],
    staleTime: 5 * 60 * 1000,
  });
  const layers = aiCoachContext?.glowMirrorLayers;
  const activeCount = layers
    ? [layers.sessionCheckins, layers.monthlyVoice, layers.perceptionGaps].filter(Boolean).length
    : 0;
  const focusPreview = weeklyDigest?.data?.focusArea;
  const isNearLimit = aiStatus && aiStatus.limit > 0 && aiStatus.callCount / aiStatus.limit >= 0.9;

  // ── Tennis IQ
  const [iqScore, setIqScore] = useState<number | null>(null);
  const [iqLoaded, setIqLoaded] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const { data: profileData } = useQuery<{ player: { quizScore?: number | null } | null }>({
    queryKey: ["/api/player/me/profile"],
    staleTime: 5 * 60 * 1000,
  });
  const { data: quizData } = useQuery<{ questions: IQQuestionInline[] }>({
    queryKey: ["/api/quiz/tennis-iq"],
    staleTime: 24 * 60 * 60 * 1000,
  });
  const totalIQ = quizData?.questions?.length || 5;

  useEffect(() => {
    AsyncStorage.getItem(TENNIS_IQ_SCORE_KEY_INLINE).then((val) => {
      const serverScore = profileData?.player?.quizScore ?? null;
      if (serverScore !== null && serverScore !== undefined) {
        setIqScore(serverScore);
        AsyncStorage.setItem(TENNIS_IQ_SCORE_KEY_INLINE, String(serverScore));
      } else if (val !== null) {
        setIqScore(parseInt(val, 10));
      }
      setIqLoaded(true);
    });
  }, [profileData]);

  // ── Spotlight
  const { data: currentWeek } = useQuery<SpotlightCurrentWeekMini>({
    queryKey: ["/api/player/spotlight/current-week"],
    enabled: !!user?.playerId,
  });
  const { data: weeklyWinner } = useQuery<{ winner: SpotlightWeeklyWinnerMini | null }>({
    queryKey: ["/api/player/spotlight/weekly-winner"],
    enabled: !!user?.playerId,
  });
  const hasVoted = !!currentWeek?.myNomination;
  const topNominee = currentWeek?.nominations?.[0] ?? null;
  const lastWinner = weeklyWinner?.winner ?? null;
  const daysRemaining = currentWeek?.daysRemaining;
  const chipText =
    daysRemaining === undefined ? null : daysRemaining <= 0 ? "Ends today!" : `${daysRemaining}d left`;

  const stateA = !!topNominee && !hasVoted;
  const stateB = hasVoted;
  const stateC = !stateA && !stateB;

  const spotPlayer: { profilePhotoUrl: string | null; playerName: string } | null =
    (stateA || stateB) && topNominee
      ? topNominee
      : stateC && lastWinner
      ? lastWinner
      : null;
  const spotName = spotPlayer ? spotPlayer.playerName.split(" ")[0] : null;
  const spotSecondary = stateA && topNominee
    ? `${topNominee.totalVotes} votes`
    : stateB
    ? "You voted this week"
    : stateC && lastWinner
    ? "Last week's winner"
    : "Vote for your favourite player";
  const ctaLabel = stateA ? "Vote" : stateB ? "Voted" : stateC && !lastWinner ? "Nominate" : "View";

  const handleSpotlightCTA = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (stateA || (stateC && !lastWinner)) onSpotlightNominate();
    else onSpotlightDetails();
  };
  const handleSpotlightRow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (stateC && !lastWinner) onSpotlightNominate();
    else onSpotlightDetails();
  };

  const questProgress = quest && quest.targetProgress > 0 ? Math.min(quest.currentProgress / quest.targetProgress, 1) : 0;

  return (
    <View style={u.wrapper}>
      <LinearGradient
        colors={[Colors.dark.accentTextSoft, "rgba(167,139,250,0.08)", "rgba(0,229,255,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={u.gradientBorder}
      >
        <View style={u.card}>
          {/* AI COACH TOP SECTION */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open AI Coach"
            style={({ pressed }) => [u.aiSection, pressed && u.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("PlayerAICoach");
            }}
          >
            <View style={u.aiTopRow}>
              <View style={u.aiLeft}>
                <View style={u.aiIconWrap}>
                  <Ionicons name="sparkles" size={18} color={Colors.dark.buttonText} />
                </View>
                <View style={u.aiTextWrap}>
                  <Text style={u.aiTitle}>AI Coach</Text>
                  <Text style={u.aiSub} numberOfLines={1}>
                    Ask about your game, progress and strategy
                  </Text>
                </View>
              </View>
              <View style={u.aiRight}>
                <View style={u.layersBadge}>
                  <View
                    style={[
                      u.layersDot,
                      { backgroundColor: activeCount > 0 ? GlowColors.primary : Colors.dark.textMuted },
                    ]}
                  />
                  <Text style={u.layersBadgeText}>{activeCount}/3</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
              </View>
            </View>
            {focusPreview ? (
              <View style={u.focusRow}>
                <Ionicons name="flag" size={11} color="#8B5CF6" />
                <Text style={u.focusText} numberOfLines={1}>
                  {focusPreview}
                </Text>
              </View>
            ) : null}
            {isNearLimit && aiStatus ? (
              <View style={u.limitRow}>
                <Ionicons name="warning-outline" size={11} color={Colors.dark.error} />
                <Text style={u.limitText}>
                  {Math.max(aiStatus.limit - aiStatus.callCount, 0)} messages left this month
                </Text>
              </View>
            ) : null}
          </Pressable>

          <View style={u.hDivider} />

          {/* IQ + QUEST TWO-COLUMN ROW */}
          <View style={u.middleRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tennis IQ quiz"
              style={({ pressed }) => [u.col, pressed && u.pressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (!iqLoaded) return;
                setShowQuiz(true);
              }}
            >
              <View style={u.colHeader}>
                <Ionicons name="bulb-outline" size={11} color={Colors.dark.gold} />
                <Text style={[u.colLabel, { color: Colors.dark.gold }]} numberOfLines={1}>
                  TENNIS IQ
                </Text>
              </View>
              <Text style={u.iqScore} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {iqScore !== null ? `${iqScore}/${totalIQ}` : "—"}
              </Text>
              <View style={u.dotsRow}>
                {Array.from({ length: totalIQ }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      u.dot,
                      iqScore !== null && i < iqScore
                        ? { backgroundColor: Colors.dark.gold }
                        : { backgroundColor: Colors.dark.chipBackgroundStrong },
                    ]}
                  />
                ))}
              </View>
              <Text style={u.colFooter} numberOfLines={1}>
                {iqScore !== null ? "Tap to retake" : "Take quiz"}
              </Text>
            </Pressable>

            <View style={u.vDivider} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={quest ? `Quest ${quest.name}` : "View quests"}
              style={({ pressed }) => [u.col, pressed && u.pressed]}
              onPress={onQuestPress}
            >
              <View style={u.colHeader}>
                <Ionicons name={quest ? "flame" : "flame-outline"} size={11} color={GlowColors.orange} />
                <Text style={[u.colLabel, { color: GlowColors.orange }]} numberOfLines={1}>
                  {quest ? (questType === "weekly" ? "WEEKLY" : "DAILY") : "QUEST"}
                </Text>
              </View>
              {quest ? (
                <>
                  <Text style={u.questName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {quest.name}
                  </Text>
                  <View style={u.progressBar}>
                    <View
                      style={[
                        u.progressFill,
                        {
                          width: `${Math.max(questProgress * 100, 2)}%` as DimensionValue,
                          backgroundColor: quest.iconColor || GlowColors.primary,
                        },
                      ]}
                    />
                  </View>
                  <View style={u.questFooterRow}>
                    <Text style={u.progressText} numberOfLines={1}>
                      {quest.currentProgress}/{quest.targetProgress}
                    </Text>
                    <View style={u.xpRow}>
                      <Ionicons name="flash" size={10} color={Colors.dark.gold} />
                      <Text style={u.xpText} numberOfLines={1}>
                        +{quest.xpReward ?? 0} XP
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={u.questEmpty} numberOfLines={2}>
                    No active quest
                  </Text>
                  <Text style={u.colFooter} numberOfLines={1}>
                    View all
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={u.hDivider} />

          {/* SPOTLIGHT FULL-WIDTH ROW — main row + CTA are SIBLING Pressables */}
          <View style={u.spotWrap}>
            <View style={u.spotHeaderRow}>
              <Ionicons name="trophy" size={11} color={Colors.dark.gold} />
              <Text style={[u.colLabel, { color: Colors.dark.gold }]} numberOfLines={1}>
                PLAYER OF THE WEEK
              </Text>
              {chipText ? (
                <View style={u.urgencyChip}>
                  <Text style={u.urgencyChipText} numberOfLines={1}>
                    {chipText}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={u.spotRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open spotlight details"
                style={({ pressed }) => [u.spotMain, pressed && u.pressed]}
                onPress={handleSpotlightRow}
              >
                {spotPlayer ? (
                  <SpotlightTileAvatar photoUrl={spotPlayer.profilePhotoUrl} />
                ) : (
                  <View style={u.spotAvatarFallback}>
                    <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
                  </View>
                )}
                <View style={u.spotTextWrap}>
                  <Text style={u.spotName} numberOfLines={1}>
                    {spotName ?? "Be the first to nominate"}
                  </Text>
                  <Text style={u.spotSecondary} numberOfLines={1}>
                    {spotSecondary}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
                style={({ pressed }) => [
                  u.spotCTA,
                  stateB && u.spotCTAGhost,
                  pressed && u.pressed,
                ]}
                onPress={handleSpotlightCTA}
              >
                <Ionicons
                  name={stateB ? "checkmark-circle" : "star"}
                  size={12}
                  color={stateB ? GlowColors.primary : Colors.dark.buttonText}
                />
                <Text style={[u.spotCTAText, stateB && { color: Colors.dark.accentText }]}>
                  {ctaLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </LinearGradient>

      <IQQuizModal
        visible={showQuiz}
        onClose={() => setShowQuiz(false)}
        onComplete={(s) => {
          setIqScore(s);
          AsyncStorage.setItem(TENNIS_IQ_SCORE_KEY_INLINE, String(s));
          apiRequest("PATCH", "/api/player/me/info", { quizScore: s }).catch(() => {});
        }}
      />
    </View>
  );
}

const u = makeReactiveStyles(() => StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg + 1,
    overflow: "hidden",
  },
  gradientBorder: {
    padding: 1.5,
    borderRadius: BorderRadius.lg + 1,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.85,
  },
  hDivider: {
    height: 1,
    backgroundColor: Colors.dark.chipBackground,
    marginHorizontal: Spacing.md,
  },
  // AI section
  aiSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  aiTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  aiLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  aiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  aiTextWrap: { flex: 1 },
  aiTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  aiSub: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 1 },
  aiRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexShrink: 0,
  },
  layersBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  layersDot: { width: 6, height: 6, borderRadius: 3 },
  layersBadgeText: { fontSize: 10, fontWeight: "600", color: Colors.dark.textMuted },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(139,92,246,0.1)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  focusText: { flex: 1, fontSize: 11, color: Colors.dark.textSubtle, fontStyle: "italic" },
  limitRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  limitText: { fontSize: 11, color: Colors.dark.error, fontWeight: "600" },
  // Middle row (IQ + Quest)
  middleRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  vDivider: {
    width: 1,
    backgroundColor: Colors.dark.chipBackground,
    marginVertical: Spacing.sm,
  },
  col: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 6,
    minWidth: 0,
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  colLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  colFooter: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  iqScore: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    lineHeight: 26,
  },
  dotsRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  questName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    lineHeight: 15,
    minHeight: 30,
  },
  questEmpty: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    minHeight: 30,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: {
    fontSize: 10,
    color: Colors.dark.textSubtle,
    fontWeight: "700",
  },
  questFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  xpRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  xpText: { fontSize: 10, color: Colors.dark.gold, fontWeight: "700" },
  // Spotlight
  spotWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 8,
  },
  spotHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  spotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  spotMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minWidth: 0,
  },
  spotAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,215,0,0.4)",
    backgroundColor: Colors.dark.chipBackground,
    justifyContent: "center",
    alignItems: "center",
  },
  spotTextWrap: { flex: 1, minWidth: 0 },
  spotName: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  spotSecondary: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 1 },
  spotCTA: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    flexShrink: 0,
  },
  spotCTAGhost: {
    backgroundColor: Colors.dark.accentTextSoft,
    borderWidth: 1,
    borderColor: Colors.dark.accentText,
  },
  spotCTAText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
  urgencyChip: {
    backgroundColor: "rgba(255,215,0,0.18)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    marginLeft: "auto",
  },
  urgencyChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.gold,
    letterSpacing: 0.3,
  },
}));

function PlayerHomeContent() {
  useThemeReactivity();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const track = useTrackFeature();
  const { user, isGuest } = useAuth();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const { guardAction, promptProps } = useGuestGuard();
  const { isMultiSport, activeSports, activeSport } = useSport();
  const { state: playerState } = usePlayerState();
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingWizardSport, setBookingWizardSport] = useState<string | undefined>(undefined);
  const [showBookingSportPicker, setShowBookingSportPicker] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [ramadanDismissed, setRamadanDismissed] = useState(false);
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const [showWelcome, setShowWelcome] = useState(false);

  // Defer below-the-fold heavy widgets (IMPROVE, COMMUNITY, SHOP) until after
  // the first frame settles. The home screen mounts ~10 useQuery-driven
  // sections at once, which has caused 2s+ main-thread freezes on slower
  // devices (Sentry REACT-NATIVE-1A). InteractionManager lets the initial
  // paint + scroll be responsive before we hydrate secondary content.
  const [secondaryReady, setSecondaryReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setSecondaryReady(true);
    });
    // Safety fallback: never wait longer than 1.2s.
    const fallback = setTimeout(() => setSecondaryReady(true), 1200);
    return () => {
      handle.cancel?.();
      clearTimeout(fallback);
    };
  }, []);

  const guestDashboard: DashboardData = useMemo(() => ({
    player: {
      id: "guest",
      name: "Guest",
      level: 1,
      xp: 0,
      glowScore: 0,
      ballLevel: null,
      streak: 0,
    },
    coach: null,
    academy: null,
    nextSession: null,
    isFreePlayer: true,
  }), []);

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 10 * 60 * 1000,
  });

  // Quests/social/shop only feed deferred below-the-fold sections, so gate
  // their network + JSON work on `secondaryReady` to keep the first frame
  // light (Sentry REACT-NATIVE-1A — 2s app hang).
  const { data: questsData } = useQuests(!isGuest && secondaryReady);

  const { data: socialPosts } = useQuery<any[]>({
    queryKey: ["/api/social/feed", "dashboard-preview"],
    queryFn: async () => {
      const response = await apiFetch("/api/social/feed?filter=for_you");
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !isGuest && secondaryReady,
    staleTime: 60000,
  });

  const { data: shopData } = useQuery<{ featuredProducts?: any[] }>({
    queryKey: ["/api/player/shop"],
    enabled: !isGuest && secondaryReady,
    staleTime: 5 * 60 * 1000,
  });

  const effectiveData = isGuest ? guestDashboard : dashboardData;

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/player/me/notifications/unread-count"],
    enabled: !!user?.playerId && !isGuest,
    refetchInterval: 120000,
  });
  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    if (effectiveData && !hasSeenScreen("Home")) {
      const timer = setTimeout(() => {
        startWalkthrough("Home");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [effectiveData, hasSeenScreen, startWalkthrough]);


  useFocusEffect(
    useCallback(() => {
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      }
    }, [user?.playerId, queryClient])
  );

  const isBirthday = useMemo(() => {
    const dateOfBirth = effectiveData?.player?.dateOfBirth;
    if (!dateOfBirth) return false;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    return today.getMonth() === dob.getMonth() && today.getDate() === dob.getDate();
  }, [effectiveData?.player?.dateOfBirth]);

  const playerAge = useMemo(() => {
    const dateOfBirth = effectiveData?.player?.dateOfBirth;
    if (!dateOfBirth) return undefined;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }, [effectiveData?.player?.dateOfBirth]);

  const isRamadan = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const ramadanDates: Record<number, { start: [number, number]; end: [number, number] }> = {
      2025: { start: [2, 1], end: [2, 30] },
      2026: { start: [1, 18], end: [2, 19] },
      2027: { start: [1, 8], end: [1, 6] },
      2028: { start: [11, 27], end: [0, 25] },
    };
    const dates = ramadanDates[year];
    if (!dates) return false;
    const start = new Date(year, dates.start[0], dates.start[1]);
    const end = new Date(year, dates.end[0], dates.end[1]);
    if (end < start) {
      return today >= start || today <= end;
    }
    return today >= start && today <= end;
  }, []);

  useEffect(() => {
    if (isRamadan) {
      const key = `@glow_ramadan_dismissed_${new Date().getFullYear()}`;
      AsyncStorage.getItem(key).then((val) => {
        if (val === "true") setRamadanDismissed(true);
      });
    }
  }, [isRamadan]);

  const handleDismissRamadan = useCallback(() => {
    setRamadanDismissed(true);
    const key = `@glow_ramadan_dismissed_${new Date().getFullYear()}`;
    AsyncStorage.setItem(key, "true");
  }, []);

  const isFreePlayer = effectiveData?.isFreePlayer ?? !effectiveData?.academy;

  const playerChecklistSteps = useMemo(() => {
    const hasAcademy = !!effectiveData?.academy;
    const hasCoach = !!effectiveData?.coach;
    const hasNextSession = !!effectiveData?.nextSession;
    const hasProfile = !!effectiveData?.player?.profilePhotoUrl;
    
    if (isGuest) {
      return [
        {
          id: "create_account",
          icon: "person-add" as const,
          title: "Create Your Account",
          description: "Sign up to unlock all features and track your progress",
          actionLabel: "Sign Up",
          onAction: () => guardAction(() => {}),
          isCompleted: false,
        },
        {
          id: "browse_courts",
          icon: "tennisball" as const,
          title: "Browse Courts",
          description: "Explore available courts near you",
          actionLabel: "Browse",
          onAction: () => guardAction(() => navigation.navigate("CourtBooking" as never)),
          isCompleted: false,
        },
      ];
    }

    const steps = [
      {
        id: "complete_profile",
        icon: "person-circle" as const,
        title: t("player.home.completeProfile"),
        description: t("player.home.completeProfileDesc"),
        actionLabel: t("player.home.goToProfile"),
        onAction: () => navigateToTab("Profile"),
        isCompleted: hasProfile,
      },
    ];

    if (isFreePlayer) {
      steps.push({
        id: "book_court",
        icon: "tennisball" as const,
        title: "Book a Court",
        description: "Find and book a court near you",
        actionLabel: "Browse Courts",
        onAction: () => navigation.navigate("CourtBooking" as never),
        isCompleted: false,
      });
      steps.push({
        id: "join_academy",
        icon: "business" as const,
        title: t("player.home.joinAcademy"),
        description: "Optional - join an academy for coaching and training sessions",
        actionLabel: t("player.home.browseAcademies"),
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      });
    } else {
      steps.push({
        id: "join_academy",
        icon: "business" as const,
        title: t("player.home.joinAcademy"),
        description: t("player.home.joinAcademyDesc"),
        actionLabel: t("player.home.browseAcademies"),
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      });
      steps.push({
        id: "book_session",
        icon: "calendar" as const,
        title: t("player.home.bookFirstSession"),
        description: t("player.home.bookFirstSessionDesc"),
        actionLabel: t("player.home.bookSession"),
        onAction: () => setShowBookingWizard(true),
        isCompleted: hasNextSession,
      });
    }

    steps.push({
      id: "check_progress",
      icon: "trending-up" as const,
      title: t("player.home.checkProgress"),
      description: t("player.home.checkProgressDesc"),
      actionLabel: t("player.home.viewProgress"),
      onAction: () => navigateToTab("Growth"),
      isCompleted: false,
    });

    return steps;
  }, [effectiveData, navigation, setShowBookingWizard, isFreePlayer]);

  const [showSpotlightNomination, setShowSpotlightNomination] = useState(false);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });

  const playerFeatureUsage = useMemo(() => [
    { id: "profile", name: t("player.home.profileSetup"), icon: "person", isUsed: true },
    { id: "sessions", name: t("player.home.sessionBooking"), icon: "calendar", isUsed: false },
    { id: "feedback", name: t("player.home.feedbackCenter"), icon: "chatbubble-ellipses", isUsed: false },
    { id: "community", name: t("player.community.title"), icon: "people", isUsed: false },
    { id: "progress", name: t("player.home.progressTracking"), icon: "trending-up", isUsed: true },
    { id: "shop", name: t("player.home.glowMarket"), icon: "cart", isUsed: false },
  ], [t]);

  const playerTips = [
    { id: "tip_xp", icon: "star", text: t("player.home.tipXp") },
    { id: "tip_profile", icon: "person", text: t("player.home.tipProfile") },
    { id: "tip_community", icon: "people", text: t("player.home.tipCommunity") },
    { id: "tip_feedback", icon: "chatbubble", text: t("player.home.tipFeedback") },
    { id: "tip_credits", icon: "card", text: t("player.home.tipCredits") },
  ];


  const playerWelcomeSlides = [
    {
      icon: "tennisball",
      iconColor: "#2ECC40",
      title: t("player.home.welcomeTitle"),
      description: t("player.home.welcomeDesc"),
    },
    {
      icon: "trending-up",
      iconColor: "#00BCD4",
      title: t("player.home.trackProgressTitle"),
      description: t("player.home.trackProgressDesc"),
    },
    {
      icon: "people",
      iconColor: "#FF9800",
      title: t("player.home.connectCompeteTitle"),
      description: t("player.home.connectCompeteDesc"),
    },
    {
      icon: "rocket",
      iconColor: "#9B59B6",
      title: t("player.home.readyToPlayTitle"),
      description: t("player.home.readyToPlayDesc"),
    },
  ];

  const { activeQuest, activeQuestType } = useMemo(() => {
    if (!questsData) return { activeQuest: null, activeQuestType: null };
    const dailyActive = questsData.daily.filter(q => q.status === "active" || q.status === "in_progress");
    const weeklyActive = questsData.weekly.filter(q => q.status === "active" || q.status === "in_progress");
    const tagged: { quest: Quest; type: "daily" | "weekly" }[] = [
      ...dailyActive.map(q => ({ quest: q, type: "daily" as const })),
      ...weeklyActive.map(q => ({ quest: q, type: "weekly" as const })),
    ];
    if (tagged.length === 0) return { activeQuest: null, activeQuestType: null };
    const sorted = tagged.sort((a, b) => {
      const aRatio = a.quest.targetProgress > 0 ? a.quest.currentProgress / a.quest.targetProgress : 0;
      const bRatio = b.quest.targetProgress > 0 ? b.quest.currentProgress / b.quest.targetProgress : 0;
      return bRatio - aRatio;
    });
    return { activeQuest: sorted[0].quest, activeQuestType: sorted[0].type };
  }, [questsData]);

  if (!isGuest && (isLoading || !effectiveData)) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.accentText} />
      </View>
    );
  }

  const { player, credits } = effectiveData!;
  
  const handleAvatarPress = () => {
    guardAction(() => openDrawer());
  };

  const handleWalletPress = () => {
    guardAction(() => setShowPinModal(true));
  };

  const handleSquadPress = () => {
    guardAction(() => {
      track("home:family_lobby");
      navigation.navigate("FamilyLobby");
    });
  };

  const handleBookLesson = () => {
    guardAction(() => {
      if (isMultiSport && activeSports.length > 1) {
        setBookingWizardSport(activeSport);
        setShowBookingSportPicker(true);
      } else {
        setBookingWizardSport(activeSport);
        setShowBookingWizard(true);
      }
    });
  };

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      {isBirthday && <BirthdayConfettiOverlay />}
      {isRamadan && !isBirthday && !ramadanDismissed && <RamadanConfettiOverlay />}
      
      <FeedbackToast />
      <ChooseUsernameModal />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.accentText}
            colors={[GlowColors.primary]}
          />
        }
      >
        {/* GREETING + PRIMARY ACTIONS — first visible anchor: "what do I do right now?" */}
        <PrimaryActionsRow
          firstName={player.name}
          onBook={handleBookLesson}
          onTrain={() =>
            guardAction(() => {
              navigation.navigate(isFreePlayer ? "AcademyBrowser" : "Training");
            })
          }
          onCompete={() =>
            guardAction(() => {
              navigateToTab("PlayStack", { screen: "OpenMatches" });
            })
          }
          onFindMatch={() =>
            guardAction(() => {
              navigateToTab("PlayStack", {
                screen: "Play",
                params: { initialTab: "Players" },
              });
            })
          }
        />

        {/* BIRTHDAY BANNER - Festive celebration on birthday */}
        {isBirthday && (
          <BirthdayBanner 
            playerName={player.name || "Champion"} 
            playerAge={playerAge}
          />
        )}

        {/* RAMADAN BANNER - Festive celebration during Ramadan */}
        {isRamadan && !isBirthday && !ramadanDismissed && (
          <RamadanBanner playerName={player.name || "Champion"} onDismiss={handleDismissRamadan} />
        )}

        {/* GETTING STARTED CHECKLIST */}
        <GettingStartedChecklist
          role="player"
          steps={playerChecklistSteps}
        />

        <QuickTipsBanner role="player" tips={playerTips} />

        <PlatformUsageProgress
          role="player"
          features={playerFeatureUsage}
        />

        {/* PLAYER HEADER - Identity card */}
        <View style={styles.headerSection}>
            <ProPlayerCard
              player={player}
              credits={credits}
              academyName={effectiveData?.academy?.name}
              onAvatarPress={handleAvatarPress}
              onWalletPress={handleWalletPress}
              onSquadPress={handleSquadPress}
              showSquadSwitch={true}
              onNotificationPress={() => {
                guardAction(() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("PlayerNotifications");
                });
              }}
              unreadNotificationCount={unreadCount}
              accessibilityLabel={`Player card for ${player.name}, ${t("player.home.glowLevel")} ${player.level}, ${player.xp} ${t("player.home.xpPoints")}`}
            />
          </View>

        {/* PLAYER DNA BANNER - shows profile completion progress */}
        {!isGuest && player?.id ? <PlayerDNABanner playerId={player.id} /> : null}

        {/* BIRTHDAY XP BONUS - 2x XP message on birthday */}
        {isBirthday && <BirthdayXPBonusCard />}

        {/* RAMADAN BONUS CARD - Blessings card during Ramadan */}
        {isRamadan && !isBirthday && !ramadanDismissed && <RamadanBonusCard onDismiss={handleDismissRamadan} />}

        {/* TENNIS NEWS - Below header, above Today is Open */}
        <NewsTicker />

        <HeroCarousel onBookSession={handleBookLesson} />

        {/* UPCOMING PROVIDER SESSION - Smart card for booked provider services */}
        {!isGuest ? <UpcomingProviderSessionCard /> : null}

        {/* ── PLAY SECTION ── Book, find players, join matches */}
        <View style={styles.playDivider}>
          <View style={styles.playDividerLeft}>
            <View style={styles.playIconGlow}>
              <Ionicons name="tennisball" size={14} color={Colors.dark.accentText} />
            </View>
            <Text style={styles.playDividerText}>PLAY</Text>
          </View>
          <View style={styles.playDividerLine} />
        </View>

        {/* FREE PLAYER DISCOVERY — Suggested clubs, open matches, players near you */}
        {isFreePlayer && !isGuest ? (
          <FreePlayerDiscoverySections />
        ) : (
          <PlayersNearYouRow />
        )}

        {/* ── IMPROVE SECTION ── always shown for logged-in players (AI Coach is the entry point) */}
        {secondaryReady && !isGuest ? (
          <>
            <View style={styles.sectionDivider}>
              <Ionicons name="trending-up" size={12} color={Colors.dark.accentText} />
              <Text style={[styles.sectionDividerText, { color: Colors.dark.accentText }]}>IMPROVE</Text>
            </View>

            <UnifiedImproveCard
              quest={activeQuest}
              questType={activeQuestType}
              onQuestPress={() => {
                track("home:quest_tracker");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("Growth", { screen: "QuestsMain" });
              }}
              onSpotlightNominate={() => setShowSpotlightNomination(true)}
              onSpotlightDetails={() => navigation.navigate("SpotlightDetail" as never)}
            />

            {/* RecentFeedback & UpcomingAppointment are academy-only — hide for free players */}
            {!isFreePlayer && (!!effectiveData?.lastFeedback || !!effectiveData?.player?.ballLevel) ? (
              <>
                <RecentFeedbackCard />
                <UpcomingAppointmentCard />
              </>
            ) : null}
          </>
        ) : null}

        {/* ── COMMUNITY ── only show when there are real social posts */}
        {secondaryReady && !isGuest && socialPosts && socialPosts.length > 0 ? <MiniFeed /> : null}

        {/* ── SHOP ── only show when there are marketplace products */}
        {secondaryReady && !isGuest && shopData?.featuredProducts && shopData.featuredProducts.length > 0 ? <GlowMarketSpotlight /> : null}

        {/* ── JOIN ACADEMY (free players only) — soft CTA at the very bottom, after universal modules */}
        {isFreePlayer && !isGuest ? <JoinAcademySoftCard /> : null}
      </ScrollView>

      <BetaFeedbackButton
        playerId={player?.id}
        playerName={player?.name}
        bottomOffset={145}
      />
      
      {/* MODE SWITCHER - Dashboard switching button (top left) */}
      <CollapsibleModeSwitcher />
      
      {/* SPORT PICKER before booking wizard */}
      <Modal
        visible={showBookingSportPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookingSportPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: Colors.dark.modalScrim }}
          onPress={() => setShowBookingSportPicker(false)}
        >
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: Backgrounds.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: Spacing.xl }}>
            <Text style={{ color: Colors.dark.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: Spacing.md }}>
              Book Lesson In
            </Text>
            {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sportDef => {
              const isSelected = bookingWizardSport === sportDef.key;
              return (
                <Pressable
                  key={sportDef.key}
                  style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: 12, borderWidth: 1.5, borderColor: isSelected ? getSportColor(sportDef.key) : Colors.dark.chipBackgroundStrong, marginBottom: Spacing.sm, backgroundColor: isSelected ? getSportColor(sportDef.key) + "15" : "transparent" }}
                  onPress={() => {
                    setBookingWizardSport(sportDef.key);
                    setShowBookingSportPicker(false);
                    setTimeout(() => setShowBookingWizard(true), 350);
                  }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: getSportColor(sportDef.key) }} />
                  <Text style={{ color: isSelected ? getSportColor(sportDef.key) : Colors.dark.text, fontSize: 16, fontWeight: "600", flex: 1 }}>
                    {getSportLabel(sportDef.key)}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={18} color={getSportColor(sportDef.key)} />
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              style={{ marginTop: Spacing.xs, padding: Spacing.sm, alignItems: "center" }}
              onPress={() => setShowBookingSportPicker(false)}
            >
              <Text style={{ color: Colors.dark.textMuted, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* BOOKING WIZARD MODAL */}
      <PlayerBookingWizard
        visible={showBookingWizard}
        onClose={() => setShowBookingWizard(false)}
        onBookingSuccess={handleBookingSuccess}
        playerId={player?.id}
        playerBallLevel={player?.ballLevel}
        sport={bookingWizardSport}
      />
      
      {/* PIN ENTRY MODAL for Credit Store */}
      <PinEntryModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={() => {
          setShowPinModal(false);
          navigation.navigate("ParentCreditStore", { playerId: player?.id });
        }}
      />

      <WelcomeIntroModal
        role="player"
        slides={playerWelcomeSlides}
        onComplete={() => {}}
      />
      <NotificationGuideModal
        visible={showNotificationGuide}
        onClose={() => setShowNotificationGuide(false)}
        role="player"
      />
      <FirstActionCelebration
        visible={showFirstCelebration}
        onClose={() => setShowFirstCelebration(false)}
        title={celebrationData.title}
        description={celebrationData.description}
        icon={celebrationData.icon}
        xpReward={celebrationData.xpReward}
      />
      <SpotlightNominationModal
        visible={showSpotlightNomination}
        onClose={() => setShowSpotlightNomination(false)}
      />
      <GuestPromptModal {...promptProps} />

      {/* DAILY BRIEFING SPLASH - Cinematic daily opener (once per calendar day) */}
      <DailyBriefingModal
        player={isGuest ? null : (effectiveData?.player ?? null)}
        nextSession={effectiveData?.nextSession ?? null}
        coachName={effectiveData?.coach?.name ?? null}
        isGuest={isGuest}
      />
    </View>
  );
}

const TENNIS_IQ_SCORE_KEY = "@glow_tennis_iq_score";

interface IQQuestion {
  q: string;
  opts: string[];
  correct: string;
  explanation: string;
}

function TennisIQMiniTile() {
  const [score, setScore] = useState<number | null>(null);
  const [scoreLoaded, setScoreLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const { data: profileData } = useQuery<{ player: { quizScore?: number | null } | null }>({
    queryKey: ["/api/player/me/profile"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: quizData, isLoading: quizLoading } = useQuery<{ questions: IQQuestion[] }>({
    queryKey: ["/api/quiz/tennis-iq"],
    staleTime: 24 * 60 * 60 * 1000,
  });

  const questions: IQQuestion[] = quizData?.questions ?? [];

  useEffect(() => {
    AsyncStorage.getItem(TENNIS_IQ_SCORE_KEY).then(val => {
      const serverScore = profileData?.player?.quizScore ?? null;
      if (serverScore !== null && serverScore !== undefined) {
        setScore(serverScore);
        AsyncStorage.setItem(TENNIS_IQ_SCORE_KEY, String(serverScore));
      } else if (val !== null) {
        setScore(parseInt(val, 10));
      }
      setScoreLoaded(true);
    });
  }, [profileData]);

  const handleSelectAnswer = (answer: string) => {
    if (selectedAnswer !== null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAnswer(answer);
  };

  const handleNext = () => {
    if (selectedAnswer === null || questions.length === 0) return;
    const newAnswers = [...answers, selectedAnswer];
    setAnswers(newAnswers);
    setSelectedAnswer(null);
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
    } else {
      const finalScore = newAnswers.filter((a, i) => a === questions[i].correct).length;
      setScore(finalScore);
      AsyncStorage.setItem(TENNIS_IQ_SCORE_KEY, String(finalScore));
      apiRequest("PATCH", "/api/player/me/info", { quizScore: finalScore }).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleRetake = () => {
    setCurrentQ(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowModal(true);
  };

  const quizComplete = questions.length > 0 && answers.length === questions.length;
  const liveScore = answers.filter((a, i) => a === questions[i]?.correct).length;
  const totalQ = questions.length || 5;

  if (!scoreLoaded) return null;

  const currentQuestion = questions[currentQ];

  return (
    <>
      <MiniTile
        label="TENNIS IQ"
        icon="bulb-outline"
        iconColor={Colors.dark.gold}
        accentBg="rgba(255,215,0,0.06)"
        accentBorder="rgba(255,215,0,0.2)"
        accessibilityLabel="Test your tennis IQ"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (score !== null) {
            handleRetake();
          } else {
            setShowModal(true);
          }
        }}
        footer={
          <Text style={miniTileStyles.footerText} numberOfLines={1}>
            {score !== null ? "Tap to retake" : "Take quiz"}
          </Text>
        }
      >
        <Text style={miniTileStyles.bigScore}>
          {score !== null ? `${score}/${totalQ}` : "—"}
        </Text>
        <View style={miniTileStyles.dotsRow}>
          {Array.from({ length: totalQ }).map((_, i) => (
            <View
              key={i}
              style={[
                miniTileStyles.dot,
                score !== null && i < score
                  ? { backgroundColor: Colors.dark.gold }
                  : { backgroundColor: Colors.dark.chipBackgroundStrong },
              ]}
            />
          ))}
        </View>
      </MiniTile>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={iqCardStyles.modalOverlay}>
          <View style={iqCardStyles.modalSheet}>
            <View style={iqCardStyles.modalHandle} />
            <Text style={iqCardStyles.modalTitle}>Tennis IQ Quiz</Text>

            {quizLoading ? (
              <View style={iqCardStyles.loadingWrap}>
                <ActivityIndicator color={Colors.dark.gold} size="small" />
                <Text style={iqCardStyles.loadingText}>Loading questions...</Text>
              </View>
            ) : quizComplete ? (
              <View style={iqCardStyles.resultWrap}>
                <View style={iqCardStyles.resultCircle}>
                  <Text style={iqCardStyles.resultScore}>{liveScore}/{questions.length}</Text>
                </View>
                <Text style={iqCardStyles.resultLabel}>
                  {liveScore === questions.length ? "Perfect score!" : liveScore >= questions.length * 0.6 ? "Well done!" : "Keep learning!"}
                </Text>
                <Pressable
                  style={iqCardStyles.doneBtn}
                  onPress={() => { setShowModal(false); setCurrentQ(0); setAnswers([]); setSelectedAnswer(null); }}
                >
                  <Text style={iqCardStyles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            ) : currentQuestion ? (
              <View style={iqCardStyles.quizBody}>
                <Text style={iqCardStyles.questionNum}>Question {currentQ + 1} of {questions.length}</Text>
                <Text style={iqCardStyles.question}>{currentQuestion.q}</Text>
                {currentQuestion.opts.map(opt => {
                  const isSelected = selectedAnswer === opt;
                  const revealed = selectedAnswer !== null;
                  const isCorrect = opt === currentQuestion.correct;
                  let optStyle = iqCardStyles.optionBtn;
                  if (revealed && isCorrect) optStyle = iqCardStyles.optionCorrect;
                  else if (revealed && isSelected && !isCorrect) optStyle = iqCardStyles.optionWrong;
                  else if (revealed) optStyle = iqCardStyles.optionLocked;
                  return (
                    <Pressable key={opt} style={optStyle} onPress={() => handleSelectAnswer(opt)}>
                      <Text style={[iqCardStyles.optionText, revealed && isCorrect && { color: "#22c55e", fontWeight: "700" }, revealed && isSelected && !isCorrect && { color: "#f87171" }]}>{opt}</Text>
                    </Pressable>
                  );
                })}
                {selectedAnswer !== null ? (
                  <>
                    <Text style={iqCardStyles.explanation}>{currentQuestion.explanation}</Text>
                    <Pressable style={iqCardStyles.nextBtn} onPress={handleNext}>
                      <Text style={iqCardStyles.nextBtnText}>
                        {currentQ < questions.length - 1 ? "Next Question" : "See Results"}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const iqCardStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(255,215,0,0.06)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.2)",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,215,0,0.12)",
    justifyContent: "center", alignItems: "center",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  sub: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  scoreRow: { flexDirection: "row", gap: 6, paddingTop: 2 },
  scoreDot: { width: 8, height: 8, borderRadius: 4 },
  scoreDotFilled: { backgroundColor: Colors.dark.gold },
  scoreDotEmpty: { backgroundColor: Colors.dark.chipBorder },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: Colors.dark.modalScrim },
  modalSheet: {
    backgroundColor: Backgrounds.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.xl, paddingBottom: 48, gap: Spacing.lg,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.chipBackgroundStrong, alignSelf: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.dark.text, textAlign: "center" },
  loadingWrap: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.xl },
  loadingText: { fontSize: 13, color: Colors.dark.textMuted },
  resultWrap: { alignItems: "center", gap: Spacing.lg },
  resultCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,215,0,0.15)",
    borderWidth: 2, borderColor: Colors.dark.gold,
    justifyContent: "center", alignItems: "center",
  },
  resultScore: { fontSize: 22, fontWeight: "800", color: Colors.dark.gold },
  resultLabel: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  doneBtn: {
    backgroundColor: GlowColors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, alignSelf: "stretch",
  },
  doneBtnText: { textAlign: "center", fontWeight: "700", fontSize: 15, color: "#000" },
  quizBody: { gap: Spacing.md },
  questionNum: { fontSize: 11, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  question: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, lineHeight: 22 },
  optionBtn: {
    backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong,
  },
  optionCorrect: {
    backgroundColor: "rgba(34,197,94,0.12)", borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: "#22c55e",
  },
  optionWrong: {
    backgroundColor: "rgba(248,113,113,0.12)", borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: "#f87171",
  },
  optionLocked: {
    backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.chipBackground,
  },
  optionText: { fontSize: 14, color: Colors.dark.text, fontWeight: "500" },
  explanation: {
    fontSize: 13, color: Colors.dark.textMuted, lineHeight: 19,
    backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  nextBtn: {
    backgroundColor: GlowColors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: "center",
  },
  nextBtnText: { fontSize: 14, fontWeight: "700", color: "#000" },
}));

function PlayerDNABanner({ playerId }: { playerId: string }) {
  const navigation = useNavigation<NavigationProp<PlayerStackParamList>>();

  const { data: profileData } = useQuery<{ player: Record<string, unknown> | null }>({
    queryKey: ["/api/player/me/profile"],
    enabled: !!playerId,
    staleTime: 60000,
  });

  const p = profileData?.player as Record<string, unknown> | null | undefined;
  if (!p) return null;

  // 11 DNA fields that define a complete player profile
  const DNA_FIELDS = [
    !!p.dominantHand,
    !!p.backhandType,
    !!p.height,
    !!p.tshirtSize,
    !!p.playStyle,
    !!p.tennisIdol,
    Array.isArray(p.enjoymentTags) && (p.enjoymentTags as unknown[]).length > 0,
    !!p.shortTermGoal,
    !!p.longTermDream,
    Array.isArray(p.typicalPlayTimes) && (p.typicalPlayTimes as unknown[]).length > 0,
    !!p.profilePhotoUrl,
  ];
  const filled = DNA_FIELDS.filter(Boolean).length;
  const total = DNA_FIELDS.length;
  const pct = Math.round((filled / total) * 100);

  // Banner auto-hides when 100% complete — no manual dismiss
  if (pct >= 100) return null;

  const fillWidth: DimensionValue = `${pct}%`;

  return (
    <Pressable
      style={dnaBannerStyles.card}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate("PlayerDNAWizard");
      }}
      accessibilityLabel="Complete your player DNA profile"
    >
      <View style={dnaBannerStyles.row}>
        <View style={dnaBannerStyles.iconWrap}>
          <Ionicons name="analytics-outline" size={20} color={Colors.dark.accentText} />
        </View>
        <View style={dnaBannerStyles.textWrap}>
          <Text style={dnaBannerStyles.title}>Complete Your Player DNA</Text>
          <Text style={dnaBannerStyles.sub}>{filled}/{total} fields complete — {pct}%</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.accentText} />
      </View>
      <View style={dnaBannerStyles.progressTrack}>
        <View style={[dnaBannerStyles.progressFill, { width: fillWidth }]} />
      </View>
      <Text style={dnaBannerStyles.cta}>Tap to build your profile</Text>
    </Pressable>
  );
}

const dnaBannerStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextSoft,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sub: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 2,
  },
  cta: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.accentText,
  },
}));

export default function ProPlayerHomeScreen() {
  return (
    <PlayerStateProvider>
      <PlayerHomeContent />
    </PlayerStateProvider>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.xl,
  },
  headerSection: {
    position: "relative",
  },
  onAirBadge: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
  },
  playDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.lg,
    marginTop: 8,
    marginBottom: 4,
  },
  playDividerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playIconGlow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.accentTextSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  playDividerText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    color: Colors.dark.accentText,
    textTransform: "uppercase" as const,
  },
  playDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.accentTextSoft,
  },
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    marginTop: 4,
    marginBottom: 2,
  },
  sectionDividerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  freePlayerCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accentTextSoft,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  freePlayerCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  freePlayerCtaContent: {
    flex: 1,
  },
  freePlayerCtaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  freePlayerCtaSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
}));

const improveTilesRowStyles = makeReactiveStyles(() => StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: "stretch",
  },
}));

const MINI_TILE_HEIGHT = 138;

const miniTileStyles = makeReactiveStyles(() => StyleSheet.create({
  tile: {
    flex: 1,
    height: MINI_TILE_HEIGHT,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  tilePressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  tileTapArea: {
    flex: 1,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  footerText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  // Tennis IQ
  bigScore: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    lineHeight: 26,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // Quest
  questName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    lineHeight: 15,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    color: Colors.dark.textSubtle,
    fontWeight: "700",
  },
  questEmptyText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  xpFooterText: {
    fontSize: 10,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  // Spotlight
  urgencyChip: {
    backgroundColor: "rgba(255,215,0,0.18)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    maxWidth: 70,
  },
  urgencyChipText: {
    fontSize: 8,
    fontWeight: "800",
    color: Colors.dark.gold,
    letterSpacing: 0.3,
  },
  spotAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: Colors.dark.chipBackground,
  },
  spotName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  starCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  votePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  votePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
  votedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  votedFooterText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
}));
