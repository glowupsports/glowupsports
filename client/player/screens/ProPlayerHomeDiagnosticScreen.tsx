import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  DimensionValue,
  Modal,
  Platform,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { apiRequest, getStaticAssetsUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import type { AuthPlayer } from "@/coach/context/AuthContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import {
  useSport,
  SPORT_DEFINITIONS,
  getSportColor,
  getSportLabel,
} from "@/player/context/SportContext";
import { GuestPromptModal, useGuestGuard } from "@/components/GuestPromptModal";
import PinEntryModal from "@/components/PinEntryModal";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { Spacing, GlowColors, Backgrounds, BorderRadius, Colors } from "@/constants/theme";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PrimaryActionsRow } from "@/player/components/PrimaryActionsRow";
import { HeroCarousel } from "@/player/components/HeroCarousel";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import {
  LazyOnScroll,
  ScrollPositionContext,
  useScrollPositionController,
} from "@/player/components/LazyOnScroll";
import {
  BirthdayBanner,
  BirthdayXPBonusCard,
} from "@/player/components/BirthdayThemeOverlay";
import {
  RamadanBanner,
  RamadanBonusCard,
} from "@/player/components/RamadanCelebrationOverlay";
import { UpcomingProviderSessionCard } from "@/player/components/UpcomingProviderSessionCard";
import { WelcomeGuideCard } from "@/player/components/WelcomeGuideCard";
import { CoachesRail, JoinAcademySoftCard } from "@/player/components/CoachesRail";
import { PlayersNearYouRow, CountryLeaderboardsEntry } from "@/player/components/DiscoveryRows";
import { useQuests, Quest } from "@/player/hooks/useQuests";
import SpotlightNominationModal from "@/player/components/SpotlightNominationModal";
import { useTabNavigation } from "@/components/TabNavigationContext";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { UpcomingAppointmentCard } from "@/player/components/UpcomingAppointmentCard";
import { TennisNewsStrip } from "@/player/components/TennisNewsStrip";
import StreakRail from "@/components/StreakRail";
import SquadVsSquadWidget from "@/components/SquadVsSquadWidget";
import { MiniFeed } from "@/player/components/MiniFeed";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { DailyBriefingModal } from "@/player/components/DailyBriefingModal";
import { BetaFeedbackButton } from "@/player/components/BetaFeedbackButton";

// ─── Types (exact from ProPlayerHomeScreen) ────────────────────────────────
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
  coach: { id: string; name: string } | null;
  academy: { id: string; name: string } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
  nextSession?: {
    id: string;
    date: string;
    type: string;
    endTime?: string;
  } | null;
  isFreePlayer?: boolean;
}

// ─── Spotlight types (exact from ProPlayerHomeScreen) ─────────────────────
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
interface IQQuestionInline {
  q: string;
  opts: string[];
  correct: string;
  explanation: string;
}

const TENNIS_IQ_SCORE_KEY_INLINE = "@glow_tennis_iq_score";
const MINI_TILE_HEIGHT = 138;

// ─── SpotlightTileAvatar ──────────────────────────────────────────────────
function SpotlightTileAvatar({ photoUrl, borderColor = Colors.dark.gold }: { photoUrl?: string | null; borderColor?: string }) {
  const baseUrl = getStaticAssetsUrl();
  const fullUrl = photoUrl ? (photoUrl.startsWith("http") ? photoUrl : `${baseUrl}${photoUrl}`) : null;
  return (
    <View style={[diagMiniTileStyles.spotAvatar, { borderColor }]}>
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

// ─── IQQuizModal ──────────────────────────────────────────────────────────
function IQQuizModal({ visible, onClose, onComplete }: { visible: boolean; onClose: () => void; onComplete: (score: number) => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const { data: quizData, isLoading: quizLoading } = useQuery<{ questions: IQQuestionInline[] }>({
    queryKey: ["/api/quiz/tennis-iq"],
    staleTime: 24 * 60 * 60 * 1000,
  });
  const questions = quizData?.questions ?? [];

  useEffect(() => {
    if (visible) { setCurrentQ(0); setAnswers([]); setSelectedAnswer(null); }
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
      <View style={diagIQStyles.modalOverlay}>
        <View style={diagIQStyles.modalSheet}>
          <View style={diagIQStyles.modalHandle} />
          <Text style={diagIQStyles.modalTitle}>Tennis IQ Quiz</Text>
          {quizLoading ? (
            <View style={diagIQStyles.loadingWrap}>
              <ActivityIndicator color={Colors.dark.gold} size="small" />
              <Text style={diagIQStyles.loadingText}>Loading questions...</Text>
            </View>
          ) : quizComplete ? (
            <View style={diagIQStyles.resultWrap}>
              <View style={diagIQStyles.resultCircle}>
                <Text style={diagIQStyles.resultScore}>{liveScore}/{questions.length}</Text>
              </View>
              <Text style={diagIQStyles.resultLabel}>{liveScore === questions.length ? "Perfect score!" : liveScore >= questions.length * 0.6 ? "Well done!" : "Keep learning!"}</Text>
              <Pressable style={diagIQStyles.doneBtn} onPress={onClose}><Text style={diagIQStyles.doneBtnText}>Done</Text></Pressable>
            </View>
          ) : currentQuestion ? (
            <View style={diagIQStyles.quizBody}>
              <Text style={diagIQStyles.questionNum}>Question {currentQ + 1} of {questions.length}</Text>
              <Text style={diagIQStyles.question}>{currentQuestion.q}</Text>
              {currentQuestion.opts.map((opt) => {
                const isSelected = selectedAnswer === opt;
                const revealed = selectedAnswer !== null;
                const isCorrect = opt === currentQuestion.correct;
                let optStyle = diagIQStyles.optionBtn;
                if (revealed && isCorrect) optStyle = diagIQStyles.optionCorrect;
                else if (revealed && isSelected && !isCorrect) optStyle = diagIQStyles.optionWrong;
                else if (revealed) optStyle = diagIQStyles.optionLocked;
                return (
                  <Pressable key={opt} style={optStyle} onPress={() => handleSelectAnswer(opt)}>
                    <Text style={[diagIQStyles.optionText, revealed && isCorrect && { color: "#22c55e", fontWeight: "700" }, revealed && isSelected && !isCorrect && { color: "#f87171" }]}>{opt}</Text>
                  </Pressable>
                );
              })}
              {selectedAnswer !== null ? (
                <>
                  <Text style={diagIQStyles.explanation}>{currentQuestion.explanation}</Text>
                  <Pressable style={diagIQStyles.nextBtn} onPress={handleNext}><Text style={diagIQStyles.nextBtnText}>{currentQ < questions.length - 1 ? "Next Question" : "See Results"}</Text></Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── UnifiedImproveCard (exact from ProPlayerHomeScreen) ──────────────────
function UnifiedImproveCard({
  onQuestPress,
  onSpotlightNominate,
  onSpotlightDetails,
  aiStatus,
  aiCoachContext,
  weeklyDigest,
  spotlightCurrentWeek,
  spotlightWeeklyWinner,
  serverQuizScore,
}: {
  onQuestPress: () => void;
  onSpotlightNominate: () => void;
  onSpotlightDetails: () => void;
  aiStatus: { isPro: boolean; isCoach: boolean; callCount: number; limit: number } | null;
  aiCoachContext: { glowMirrorLayers?: { sessionCheckins: boolean; monthlyVoice: boolean; perceptionGaps: boolean } } | null;
  weeklyDigest: { data: { focusArea?: string } | null } | null;
  spotlightCurrentWeek: SpotlightCurrentWeekMini | null;
  spotlightWeeklyWinner: { winner: SpotlightWeeklyWinnerMini | null };
  serverQuizScore: number | null;
}) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const { data: questsData } = useQuests(!!user?.playerId);
  const { quest, questType } = useMemo(() => {
    if (!questsData) return { quest: null as Quest | null, questType: null as "daily" | "weekly" | null };
    const dailyActive = questsData.daily.filter((q) => q.status === "active" || q.status === "in_progress");
    const weeklyActive = questsData.weekly.filter((q) => q.status === "active" || q.status === "in_progress");
    const tagged: { quest: Quest; type: "daily" | "weekly" }[] = [
      ...dailyActive.map((q) => ({ quest: q, type: "daily" as const })),
      ...weeklyActive.map((q) => ({ quest: q, type: "weekly" as const })),
    ];
    if (tagged.length === 0) return { quest: null as Quest | null, questType: null as "daily" | "weekly" | null };
    const sorted = tagged.sort((a, b) => {
      const aRatio = a.quest.targetProgress > 0 ? a.quest.currentProgress / a.quest.targetProgress : 0;
      const bRatio = b.quest.targetProgress > 0 ? b.quest.currentProgress / b.quest.targetProgress : 0;
      return bRatio - aRatio;
    });
    return { quest: sorted[0].quest as Quest | null, questType: sorted[0].type as "daily" | "weekly" | null };
  }, [questsData]);

  const layers = aiCoachContext?.glowMirrorLayers;
  const activeCount = layers ? [layers.sessionCheckins, layers.monthlyVoice, layers.perceptionGaps].filter(Boolean).length : 0;
  const focusPreview = weeklyDigest?.data?.focusArea;
  const isNearLimit = aiStatus && aiStatus.limit > 0 && aiStatus.callCount / aiStatus.limit >= 0.9;

  const [iqScore, setIqScore] = useState<number | null>(null);
  const [iqLoaded, setIqLoaded] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const totalIQ = 5;

  useEffect(() => {
    AsyncStorage.getItem(TENNIS_IQ_SCORE_KEY_INLINE).then((val) => {
      if (serverQuizScore !== null && serverQuizScore !== undefined) {
        setIqScore(serverQuizScore);
        AsyncStorage.setItem(TENNIS_IQ_SCORE_KEY_INLINE, String(serverQuizScore));
      } else if (val !== null) {
        setIqScore(parseInt(val, 10));
      }
      setIqLoaded(true);
    });
  }, [serverQuizScore]);

  const currentWeek = spotlightCurrentWeek;
  const weeklyWinner = spotlightWeeklyWinner;
  const hasVoted = !!currentWeek?.myNomination;
  const topNominee = currentWeek?.nominations?.[0] ?? null;
  const lastWinner = weeklyWinner?.winner ?? null;
  const daysRemaining = currentWeek?.daysRemaining;
  const chipText = daysRemaining === undefined ? null : daysRemaining <= 0 ? "Ends today!" : `${daysRemaining}d left`;
  const stateA = !!topNominee && !hasVoted;
  const stateB = hasVoted;
  const stateC = !stateA && !stateB;
  const spotPlayer: { profilePhotoUrl: string | null; playerName: string } | null =
    (stateA || stateB) && topNominee ? topNominee : stateC && lastWinner ? lastWinner : null;
  const spotName = spotPlayer ? spotPlayer.playerName.split(" ")[0] : null;
  const spotSecondary = stateA && topNominee ? `${topNominee.totalVotes} votes` : stateB ? "You voted this week" : stateC && lastWinner ? "Last week's winner" : "Vote for your favourite player";
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
    <View style={diagUStyles.wrapper}>
      <LinearGradient colors={[Colors.dark.accentTextSoft, "rgba(167,139,250,0.08)", "rgba(0,229,255,0.06)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={diagUStyles.gradientBorder}>
        <View style={diagUStyles.card}>
          {/* AI COACH */}
          <Pressable accessibilityRole="button" accessibilityLabel="Open AI Coach" style={({ pressed }) => [diagUStyles.aiSection, pressed && diagUStyles.pressed]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("PlayerAICoach"); }}>
            <View style={diagUStyles.aiTopRow}>
              <View style={diagUStyles.aiLeft}>
                <View style={diagUStyles.aiIconWrap}><Ionicons name="sparkles" size={18} color={Colors.dark.buttonText} /></View>
                <View style={diagUStyles.aiTextWrap}>
                  <Text style={diagUStyles.aiTitle}>AI Coach</Text>
                  <Text style={diagUStyles.aiSub} numberOfLines={1}>Ask about your game, progress and strategy</Text>
                </View>
              </View>
              <View style={diagUStyles.aiRight}>
                <View style={diagUStyles.layersBadge}>
                  <View style={[diagUStyles.layersDot, { backgroundColor: activeCount > 0 ? GlowColors.primary : Colors.dark.textMuted }]} />
                  <Text style={diagUStyles.layersBadgeText}>{activeCount}/3</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
              </View>
            </View>
            {focusPreview ? (
              <View style={diagUStyles.focusRow}><Ionicons name="flag" size={11} color="#8B5CF6" /><Text style={diagUStyles.focusText} numberOfLines={1}>{focusPreview}</Text></View>
            ) : null}
            {isNearLimit && aiStatus ? (
              <View style={diagUStyles.limitRow}><Ionicons name="warning-outline" size={11} color={Colors.dark.error} /><Text style={diagUStyles.limitText}>{Math.max(aiStatus.limit - aiStatus.callCount, 0)} messages left this month</Text></View>
            ) : null}
          </Pressable>

          <View style={diagUStyles.hDivider} />

          {/* IQ + QUEST TWO-COLUMN */}
          <View style={diagUStyles.middleRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tennis IQ quiz" style={({ pressed }) => [diagUStyles.col, pressed && diagUStyles.pressed]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); if (!iqLoaded) return; setShowQuiz(true); }}>
              <View style={diagUStyles.colHeader}>
                <Ionicons name="bulb-outline" size={11} color={Colors.dark.gold} />
                <Text style={[diagUStyles.colLabel, { color: Colors.dark.gold }]} numberOfLines={1}>TENNIS IQ</Text>
              </View>
              <Text style={diagUStyles.iqScore} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{iqScore !== null ? `${iqScore}/${totalIQ}` : "—"}</Text>
              <View style={diagUStyles.dotsRow}>
                {Array.from({ length: totalIQ }).map((_, i) => (
                  <View key={i} style={[diagUStyles.dot, iqScore !== null && i < iqScore ? { backgroundColor: Colors.dark.gold } : { backgroundColor: Colors.dark.chipBackgroundStrong }]} />
                ))}
              </View>
              <Text style={diagUStyles.colFooter} numberOfLines={1}>{iqScore !== null ? "Tap to retake" : "Take quiz"}</Text>
            </Pressable>

            <View style={diagUStyles.vDivider} />

            <Pressable accessibilityRole="button" accessibilityLabel={quest ? `Quest ${quest.name}` : "View quests"} style={({ pressed }) => [diagUStyles.col, pressed && diagUStyles.pressed]} onPress={onQuestPress}>
              <View style={diagUStyles.colHeader}>
                <Ionicons name={quest ? "flame" : "flame-outline"} size={11} color={GlowColors.orange} />
                <Text style={[diagUStyles.colLabel, { color: GlowColors.orange }]} numberOfLines={1}>{quest ? (questType === "weekly" ? "WEEKLY" : "DAILY") : "QUEST"}</Text>
              </View>
              {quest ? (
                <>
                  <Text style={diagUStyles.questName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{quest.name}</Text>
                  <View style={diagUStyles.progressBar}>
                    <View style={[diagUStyles.progressFill, { width: `${Math.max(questProgress * 100, 2)}%` as DimensionValue, backgroundColor: quest.iconColor || GlowColors.primary }]} />
                  </View>
                  <View style={diagUStyles.questFooterRow}>
                    <Text style={diagUStyles.progressText} numberOfLines={1}>{quest.currentProgress}/{quest.targetProgress}</Text>
                    <View style={diagUStyles.xpRow}><Ionicons name="flash" size={10} color={Colors.dark.gold} /><Text style={diagUStyles.xpText} numberOfLines={1}>+{quest.xpReward ?? 0} XP</Text></View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={diagUStyles.questEmpty} numberOfLines={2}>No active quest</Text>
                  <Text style={diagUStyles.colFooter} numberOfLines={1}>View all</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={diagUStyles.hDivider} />

          {/* SPOTLIGHT */}
          <View style={diagUStyles.spotWrap}>
            <View style={diagUStyles.spotHeaderRow}>
              <Ionicons name="trophy" size={11} color={Colors.dark.gold} />
              <Text style={[diagUStyles.colLabel, { color: Colors.dark.gold }]} numberOfLines={1}>PLAYER OF THE WEEK</Text>
              {chipText ? (
                <View style={diagUStyles.urgencyChip}><Text style={diagUStyles.urgencyChipText} numberOfLines={1}>{chipText}</Text></View>
              ) : null}
            </View>
            <View style={diagUStyles.spotRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open spotlight details" style={({ pressed }) => [diagUStyles.spotMain, pressed && diagUStyles.pressed]} onPress={handleSpotlightRow}>
                {spotPlayer ? (
                  <SpotlightTileAvatar photoUrl={spotPlayer.profilePhotoUrl} />
                ) : (
                  <View style={diagUStyles.spotAvatarFallback}><Ionicons name="person" size={14} color={Colors.dark.textMuted} /></View>
                )}
                <View style={diagUStyles.spotTextWrap}>
                  <Text style={diagUStyles.spotName} numberOfLines={1}>{spotName ?? "Be the first to nominate"}</Text>
                  <Text style={diagUStyles.spotSecondary} numberOfLines={1}>{spotSecondary}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={ctaLabel} style={({ pressed }) => [diagUStyles.spotCTA, stateB && diagUStyles.spotCTAGhost, pressed && diagUStyles.pressed]} onPress={handleSpotlightCTA}>
                <Ionicons name={stateB ? "checkmark-circle" : "star"} size={12} color={stateB ? GlowColors.primary : Colors.dark.buttonText} />
                <Text style={[diagUStyles.spotCTAText, stateB && { color: Colors.dark.accentText }]}>{ctaLabel}</Text>
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

// ─── PlayerDNABanner (exact copy from ProPlayerHomeScreen) ─────────────────
function PlayerDNABanner({ playerId }: { playerId: string }) {
  const navigation = useNavigation<NavigationProp<PlayerStackParamList>>();

  const { data: profileData } = useQuery<{ player: Record<string, unknown> | null }>({
    queryKey: ["/api/player/me/profile"],
    enabled: !!playerId,
    staleTime: 60000,
  });

  const p = profileData?.player as Record<string, unknown> | null | undefined;
  if (!p) return null;

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

const dnaBannerStyles = StyleSheet.create({
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
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  sub: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: GlowColors.primary, borderRadius: 2 },
  cta: { fontSize: 12, fontWeight: "600", color: Colors.dark.accentText },
});

// ─── Inner content — wrapped by PlayerStateProvider below ─────────────────
function DiagnosticHomeContent() {
  const { user, isGuest, patchPlayer } = useAuth();
  const playerCtx = usePlayer();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const track = useTrackFeature();
  const { guardAction, promptProps } = useGuestGuard();
  const { isMultiSport, activeSports, activeSport } = useSport();
  const { navigateToTab } = useTabNavigation();

  // ── State (exact from ProPlayerHomeScreen) ────────────────────────────────
  const [showPinModal, setShowPinModal] = useState(false);
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingWizardSport, setBookingWizardSport] = useState<string | undefined>(undefined);
  const [showBookingSportPicker, setShowBookingSportPicker] = useState(false);
  const [ramadanDismissed, setRamadanDismissed] = useState(false);
  const [showSpotlightNomination, setShowSpotlightNomination] = useState(false);

  // ── Scroll position controller (drives LazyOnScroll) ─────────────────────
  const scrollController = useScrollPositionController();
  const onHomeScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollController.emit(
        e.nativeEvent.contentOffset.y,
        e.nativeEvent.layoutMeasurement.height,
      );
    },
    [scrollController],
  );

  // ── God-route query (exact from ProPlayerHomeScreen) ─────────────────────
  const { data: homeData, refetch } = useQuery<{
    dashboard: DashboardData | null;
    profile: Record<string, unknown> | null;
    unreadCount: { count: number };
    weeklyDigest: Record<string, unknown> | null;
    aiCoachContext: Record<string, unknown> | null;
    spotlightCurrentWeek: Record<string, unknown> | null;
    spotlightWeeklyWinner: { winner: Record<string, unknown> | null };
    tennisIq: { score: number | null; lastQuizAt: string | null } | null;
    aiProStatus: { isPro: boolean; isCoach: boolean; callCount: number; limit: number } | null;
  }>({
    queryKey: ["/api/player/me/home-data"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 0,
    refetchInterval: 120 * 1000,
  });

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // ── Derived data (exact from ProPlayerHomeScreen) ─────────────────────────
  const dashboardData = homeData?.dashboard ?? undefined;
  const unreadCount = homeData?.unreadCount?.count ?? 0;
  const effectiveData = dashboardData;

  // ── Player shape (exact from ProPlayerHomeScreen) ─────────────────────────
  const dashboardPlayer = effectiveData?.player;
  const player = {
    id: dashboardPlayer?.id ?? user?.playerId ?? "",
    name: dashboardPlayer?.name ?? user?.displayName ?? user?.username ?? "",
    level: dashboardPlayer?.level ?? playerCtx.level ?? 1,
    xp: dashboardPlayer?.xp ?? playerCtx.xp ?? 0,
    glowScore: dashboardPlayer?.glowScore ?? playerCtx.glowScore ?? 0,
    ballLevel: dashboardPlayer?.ballLevel ?? playerCtx.ballLevel ?? null,
    streak: dashboardPlayer?.streak ?? 0,
    profilePhotoUrl: dashboardPlayer?.profilePhotoUrl ?? user?.profilePhotoUrl ?? null,
    dateOfBirth: dashboardPlayer?.dateOfBirth ?? null,
    playStyle: dashboardPlayer?.playStyle ?? null,
  };
  const credits = effectiveData?.credits;
  const isFreePlayer = effectiveData?.isFreePlayer ?? !effectiveData?.academy;

  // ── Birthday detection (exact from ProPlayerHomeScreen) ───────────────────
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
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }, [effectiveData?.player?.dateOfBirth]);

  // ── Ramadan detection (exact from ProPlayerHomeScreen) ────────────────────
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
    if (end < start) return today >= start || today <= end;
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

  // ── Seed legacy query keys (exact from ProPlayerHomeScreen) ───────────────
  useEffect(() => {
    if (!homeData) return;
    if (homeData.dashboard) {
      queryClient.setQueryData(["/api/player/me/dashboard"], homeData.dashboard);
    }
    if (homeData.profile) {
      queryClient.setQueryData(["/api/player/me/profile"], homeData.profile);
    }
    queryClient.setQueryData(
      ["/api/player/me/notifications/unread-count"],
      homeData.unreadCount ?? { count: 0 },
    );
    queryClient.setQueryData(["/api/player/me/weekly-digest"], homeData.weeklyDigest ?? null);
    queryClient.setQueryData(["/api/player/me/ai-coach/context"], homeData.aiCoachContext ?? null);
    queryClient.setQueryData(
      ["/api/player/spotlight/current-week"],
      homeData.spotlightCurrentWeek ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/spotlight/weekly-winner"],
      homeData.spotlightWeeklyWinner ?? { winner: null },
    );
    queryClient.setQueryData(["/api/player/me/tennis-iq"], homeData.tennisIq ?? null);
    queryClient.setQueryData(
      ["/api/ai-pro/status"],
      homeData.aiProStatus ?? { isPro: false, isCoach: false, callCount: 0, limit: 5 },
    );
    // Mirror player numbers back into AuthContext
    const dp = homeData.dashboard?.player as
      | {
          level?: number; xp?: number; glowScore?: number; ballLevel?: string | null;
          dateOfBirth?: string | null; profilePhotoUrl?: string | null;
          glowMmr?: number; glowRank?: number; totalMatchesPlayed?: number;
        }
      | null | undefined;
    if (dp) {
      const patch: Partial<AuthPlayer> = {};
      if (typeof dp.level === "number") patch.level = dp.level;
      if (typeof dp.xp === "number") patch.xp = dp.xp;
      if (typeof dp.glowScore === "number") patch.glowScore = dp.glowScore;
      if (typeof dp.glowMmr === "number") patch.glowMmr = dp.glowMmr;
      if (typeof dp.glowRank === "number") patch.glowRank = dp.glowRank;
      if (typeof dp.totalMatchesPlayed === "number") patch.totalMatchesPlayed = dp.totalMatchesPlayed;
      if (dp.ballLevel !== undefined) patch.ballLevel = dp.ballLevel ?? null;
      if (dp.dateOfBirth !== undefined) patch.dateOfBirth = dp.dateOfBirth ?? null;
      if (dp.profilePhotoUrl !== undefined) patch.profilePhotoUrl = dp.profilePhotoUrl ?? null;
      if (Object.keys(patch).length > 0) patchPlayer(patch);
    }
  }, [homeData, queryClient, patchPlayer]);

  // ── Prefetch other tabs (exact from ProPlayerHomeScreen) ──────────────────
  useEffect(() => {
    if (!homeData || !user?.id) return;
    let cancelled = false;
    const handle = requestAnimationFrame(() => {
      if (cancelled) return;
      const queries = [
        ["/api/player/me/progress-data", "tennis"],
        ["/api/player/me/community-data"],
        ["/api/player/me/ai-coach-data"],
      ];
      for (const queryKey of queries) {
        queryClient.prefetchQuery({ queryKey }).catch(() => {});
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(handle); };
  }, [homeData, queryClient, user?.id]);

  // ── Focus invalidation (exact from ProPlayerHomeScreen) ──────────────────
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    }, [queryClient]),
  );

  // ── Auth-ready watcher (exact from ProPlayerHomeScreen #1495) ─────────────
  const homeDataFetchedOnAuthRef = useRef(false);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  useEffect(() => {
    if (!user?.playerId || isGuest) return;
    if (homeDataFetchedOnAuthRef.current) return;
    homeDataFetchedOnAuthRef.current = true;
    queryClientRef.current.refetchQueries({
      queryKey: ["/api/player/me/home-data"],
      type: "active",
    });
  }, [user?.playerId, isGuest]);

  // ── iOS cold-start retry timers (exact from ProPlayerHomeScreen #1491) ────
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const t1 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 800);
    const t2 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 1800);
    const t3 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 3000);
    const t4 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [queryClient]);

  // ── Handlers (exact from ProPlayerHomeScreen) ─────────────────────────────
  const handleAvatarPress = () => { guardAction(() => openDrawer()); };
  const handleWalletPress = () => { guardAction(() => setShowPinModal(true)); };
  const handleSquadPress = () => {
    guardAction(() => { track("home:family_lobby"); navigation.navigate("FamilyLobby"); });
  };

  const handleBookLesson = () => {
    guardAction(() => {
      if (isMultiSport && activeSports.length > 1) {
        setShowBookingSportPicker(true);
      } else {
        setBookingWizardSport(activeSport);
        setShowBookingWizard(true);
      }
    });
  };

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
  };

  return (
    <ScrollPositionContext.Provider value={scrollController.contextValue}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: insets.bottom + 180 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onHomeScroll}
          refreshControl={
            <RefreshControl
              refreshing={isManualRefreshing}
              onRefresh={handleManualRefresh}
              tintColor={Colors.dark.accentText}
              colors={[GlowColors.primary]}
            />
          }
        >
          {/* PLAYER HEADER */}
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
              accessibilityLabel={`Player card for ${player.name}, level ${player.level}, ${player.xp} XP`}
            />
          </View>

          {/* PLAYER DNA BANNER */}
          {!isGuest && player?.id ? <PlayerDNABanner playerId={player.id} /> : null}

          {/* PERSONALIZED GREETING */}
          <PrimaryActionsRow
            firstName={player.name}
            nextSessionDate={effectiveData?.nextSession?.date ?? null}
            nextSessionEndTime={effectiveData?.nextSession?.endTime ?? null}
          />

          {/* BIRTHDAY BANNER */}
          {isBirthday ? (
            <BirthdayBanner playerName={player.name || "Champion"} playerAge={playerAge} />
          ) : null}

          {/* BIRTHDAY XP BONUS */}
          {isBirthday ? <BirthdayXPBonusCard /> : null}

          {/* RAMADAN BANNER */}
          {isRamadan && !isBirthday && !ramadanDismissed ? (
            <RamadanBanner playerName={player.name || "Champion"} onDismiss={handleDismissRamadan} />
          ) : null}

          {/* RAMADAN BONUS CARD */}
          {isRamadan && !isBirthday && !ramadanDismissed ? (
            <RamadanBonusCard onDismiss={handleDismissRamadan} />
          ) : null}

          {/* HERO CAROUSEL */}
          <HeroCarousel onBookSession={handleBookLesson} />

          {/* UPCOMING PROVIDER SESSION */}
          {!isGuest ? (
            <LazyOnScroll prefetchOffset={400} minHeight={1}>
              <UpcomingProviderSessionCard />
            </LazyOnScroll>
          ) : null}

          {/* WELCOME / GUIDE */}
          <WelcomeGuideCard />

          {/* COACHES RAIL */}
          {!isGuest ? (
            <LazyOnScroll prefetchOffset={400} minHeight={180}>
              <CoachesRail />
            </LazyOnScroll>
          ) : null}

          {/* PLAYERS NEAR YOU */}
          {!isFreePlayer && !isGuest ? (
            <LazyOnScroll minHeight={160}>
              <PlayersNearYouRow />
            </LazyOnScroll>
          ) : null}

          {/* COUNTRY LEADERBOARDS */}
          {!isGuest ? (
            <LazyOnScroll minHeight={120}>
              <CountryLeaderboardsEntry />
            </LazyOnScroll>
          ) : null}

          {/* IMPROVE SECTION */}
          {!isGuest ? (
            <LazyOnScroll minHeight={240}>
              <View style={styles.sectionDivider}>
                <Ionicons name="trending-up" size={12} color={Colors.dark.accentText} />
                <Text style={styles.sectionDividerText}>IMPROVE</Text>
              </View>
              <UnifiedImproveCard
                onQuestPress={() => {
                  track("home:quest_tracker");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigateToTab("Growth", { screen: "QuestsMain" });
                }}
                onSpotlightNominate={() => setShowSpotlightNomination(true)}
                onSpotlightDetails={() => navigation.navigate("SpotlightDetail" as never)}
                aiStatus={homeData?.aiProStatus ?? null}
                aiCoachContext={homeData?.aiCoachContext ?? null}
                weeklyDigest={(homeData?.weeklyDigest ?? null) as any}
                spotlightCurrentWeek={(homeData?.spotlightCurrentWeek ?? null) as any}
                spotlightWeeklyWinner={(homeData?.spotlightWeeklyWinner ?? { winner: null }) as any}
                serverQuizScore={
                  ((homeData?.profile as { player?: { quizScore?: number | null } } | null)?.player?.quizScore) ?? null
                }
              />
              {/* RecentFeedback & UpcomingAppointment — academy-only */}
              {!isFreePlayer && !isGuest ? (
                <>
                  <RecentFeedbackCard />
                  <UpcomingAppointmentCard />
                </>
              ) : null}
            </LazyOnScroll>
          ) : null}

          {/* TENNIS NEWS */}
          {!isGuest ? (
            <LazyOnScroll minHeight={140}>
              <TennisNewsStrip />
            </LazyOnScroll>
          ) : null}

          {/* STREAKS */}
          {!isGuest ? (
            <LazyOnScroll minHeight={120}>
              <StreakRail />
            </LazyOnScroll>
          ) : null}

          {/* SQUAD VS SQUAD */}
          {!isGuest && !isFreePlayer ? (
            <LazyOnScroll minHeight={180}>
              <SquadVsSquadWidget />
            </LazyOnScroll>
          ) : null}

          {/* COMMUNITY */}
          {!isGuest ? (
            <LazyOnScroll>
              <MiniFeed />
            </LazyOnScroll>
          ) : null}

          {/* SHOP */}
          {!isGuest ? (
            <LazyOnScroll>
              <GlowMarketSpotlight />
            </LazyOnScroll>
          ) : null}

          {/* JOIN ACADEMY — free players only */}
          {isFreePlayer && !isGuest ? <JoinAcademySoftCard /> : null}
        </ScrollView>

        {/* MODE SWITCHER */}
        <CollapsibleModeSwitcher />

        {/* SPORT PICKER MODAL */}
        <Modal
          visible={showBookingSportPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBookingSportPicker(false)}
        >
          <Pressable
            style={styles.sportPickerScrim}
            onPress={() => setShowBookingSportPicker(false)}
          >
            <View style={styles.sportPickerSheet}>
              <Text style={styles.sportPickerTitle}>Book Lesson In</Text>
              {SPORT_DEFINITIONS.filter((s) => activeSports.includes(s.key)).map((sportDef) => {
                const isSelected = bookingWizardSport === sportDef.key;
                return (
                  <Pressable
                    key={sportDef.key}
                    style={[
                      styles.sportPickerRow,
                      {
                        borderColor: isSelected
                          ? getSportColor(sportDef.key)
                          : Colors.dark.chipBackgroundStrong,
                        backgroundColor: isSelected
                          ? getSportColor(sportDef.key) + "15"
                          : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setBookingWizardSport(sportDef.key);
                      setShowBookingSportPicker(false);
                      setTimeout(() => setShowBookingWizard(true), 350);
                    }}
                  >
                    <View
                      style={[
                        styles.sportDot,
                        { backgroundColor: getSportColor(sportDef.key) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.sportPickerLabel,
                        isSelected ? { color: getSportColor(sportDef.key) } : null,
                      ]}
                    >
                      {getSportLabel(sportDef.key)}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={18} color={getSportColor(sportDef.key)} />
                    ) : null}
                  </Pressable>
                );
              })}
              <Pressable
                style={styles.sportPickerCancel}
                onPress={() => setShowBookingSportPicker(false)}
              >
                <Text style={styles.sportPickerCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* BOOKING WIZARD */}
        <PlayerBookingWizard
          visible={showBookingWizard}
          onClose={() => setShowBookingWizard(false)}
          onBookingSuccess={handleBookingSuccess}
          sport={bookingWizardSport}
        />

        {/* PIN MODAL */}
        <PinEntryModal
          visible={showPinModal}
          onClose={() => setShowPinModal(false)}
          onSuccess={() => {
            setShowPinModal(false);
            navigation.navigate("ParentCreditStore", { playerId: player?.id });
          }}
        />

        {/* GUEST PROMPT */}
        <GuestPromptModal {...promptProps} />

        {/* SPOTLIGHT NOMINATION */}
        <SpotlightNominationModal
          visible={showSpotlightNomination}
          onClose={() => setShowSpotlightNomination(false)}
        />

        {/* BETA FEEDBACK */}
        <BetaFeedbackButton
          playerId={player?.id}
          playerName={player?.name}
          bottomOffset={145}
        />

        {/* DAILY BRIEFING */}
        <DailyBriefingModal
          player={isGuest ? null : (effectiveData?.player ?? null)}
          nextSession={effectiveData?.nextSession ?? null}
          coachName={effectiveData?.coach?.name ?? null}
          isGuest={isGuest}
        />
      </View>
    </ScrollPositionContext.Provider>
  );
}

// ─── Root — wraps content in PlayerStateProvider ───────────────────────────
export default function ProPlayerHomeDiagnosticScreen() {
  return (
    <PlayerStateProvider>
      <DiagnosticHomeContent />
    </PlayerStateProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: { flex: 1 },
  scrollContent: { gap: 0 },
  headerSection: { paddingHorizontal: 0 },
  // Sport picker modal
  sportPickerScrim: {
    flex: 1,
    backgroundColor: Colors.dark.modalScrim,
  },
  sportPickerSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  sportPickerTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  sportPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  sportDot: { width: 10, height: 10, borderRadius: 5 },
  sportPickerLabel: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  sportPickerCancel: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    alignItems: "center",
  },
  sportPickerCancelText: {
    color: Colors.dark.textMuted,
    fontSize: 15,
  },
  // Section divider (IMPROVE heading)
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionDividerText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Colors.dark.accentText,
  },
});

// ─── UnifiedImproveCard styles ────────────────────────────────────────────
const diagUStyles = StyleSheet.create({
  wrapper: { marginHorizontal: Spacing.lg, borderRadius: BorderRadius.lg + 1, overflow: "hidden" },
  gradientBorder: { padding: 1.5, borderRadius: BorderRadius.lg + 1 },
  card: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, overflow: "hidden" },
  pressed: { opacity: 0.85 },
  hDivider: { height: 1, backgroundColor: Colors.dark.chipBackground, marginHorizontal: Spacing.md },
  aiSection: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.xs },
  aiTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.sm },
  aiLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  aiIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: GlowColors.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  aiTextWrap: { flex: 1 },
  aiTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  aiSub: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 1 },
  aiRight: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, flexShrink: 0 },
  layersBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong, paddingHorizontal: 8, paddingVertical: 3 },
  layersDot: { width: 6, height: 6, borderRadius: 3 },
  layersBadgeText: { fontSize: 10, fontWeight: "600", color: Colors.dark.textMuted },
  focusRow: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(139,92,246,0.1)", borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 5 },
  focusText: { flex: 1, fontSize: 11, color: Colors.dark.textSubtle, fontStyle: "italic" },
  limitRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  limitText: { fontSize: 11, color: Colors.dark.error, fontWeight: "600" },
  middleRow: { flexDirection: "row", alignItems: "stretch" },
  vDivider: { width: 1, backgroundColor: Colors.dark.chipBackground, marginVertical: Spacing.sm },
  col: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: 6, minWidth: 0 },
  colHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  colLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2, flexShrink: 1 },
  colFooter: { fontSize: 10, color: Colors.dark.textMuted, fontWeight: "600" },
  iqScore: { fontSize: 22, fontWeight: "800", color: Colors.dark.text, lineHeight: 26 },
  dotsRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  questName: { fontSize: 12, fontWeight: "700", color: Colors.dark.text, lineHeight: 15, minHeight: 30 },
  questEmpty: { fontSize: 12, color: Colors.dark.textMuted, fontWeight: "500", minHeight: 30 },
  progressBar: { height: 4, backgroundColor: Colors.dark.chipBackgroundStrong, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontSize: 10, color: Colors.dark.textSubtle, fontWeight: "700" },
  questFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  xpRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  xpText: { fontSize: 10, color: Colors.dark.gold, fontWeight: "700" },
  spotWrap: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: 8 },
  spotHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  spotRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  spotMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm, minWidth: 0 },
  spotAvatarFallback: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,215,0,0.4)", backgroundColor: Colors.dark.chipBackground, justifyContent: "center", alignItems: "center" },
  spotTextWrap: { flex: 1, minWidth: 0 },
  spotName: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  spotSecondary: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 1 },
  spotCTA: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.dark.gold, paddingVertical: 6, paddingHorizontal: 12, borderRadius: BorderRadius.full, flexShrink: 0 },
  spotCTAGhost: { backgroundColor: Colors.dark.accentTextSoft, borderWidth: 1, borderColor: Colors.dark.accentText },
  spotCTAText: { fontSize: 12, fontWeight: "800", color: Colors.dark.buttonText },
  urgencyChip: { backgroundColor: "rgba(255,215,0,0.18)", paddingHorizontal: 6, paddingVertical: 1, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: "rgba(255,215,0,0.35)", marginLeft: "auto" },
  urgencyChipText: { fontSize: 9, fontWeight: "800", color: Colors.dark.gold, letterSpacing: 0.3 },
});

// ─── IQQuizModal styles ───────────────────────────────────────────────────
const diagIQStyles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: Colors.dark.modalScrim },
  modalSheet: { backgroundColor: Backgrounds.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.xl, paddingBottom: 48, gap: Spacing.lg },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.dark.chipBackgroundStrong, alignSelf: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.dark.text, textAlign: "center" },
  loadingWrap: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.xl },
  loadingText: { fontSize: 13, color: Colors.dark.textMuted },
  resultWrap: { alignItems: "center", gap: Spacing.lg },
  resultCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,215,0,0.15)", borderWidth: 2, borderColor: Colors.dark.gold, justifyContent: "center", alignItems: "center" },
  resultScore: { fontSize: 22, fontWeight: "800", color: Colors.dark.gold },
  resultLabel: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  doneBtn: { backgroundColor: GlowColors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignSelf: "stretch" },
  doneBtnText: { textAlign: "center", fontWeight: "700", fontSize: 15, color: "#000" },
  quizBody: { gap: Spacing.md },
  questionNum: { fontSize: 11, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  question: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, lineHeight: 22 },
  optionBtn: { backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  optionCorrect: { backgroundColor: "rgba(34,197,94,0.12)", borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: "#22c55e" },
  optionWrong: { backgroundColor: "rgba(248,113,113,0.12)", borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: "#f87171" },
  optionLocked: { backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.chipBackground },
  optionText: { fontSize: 14, color: Colors.dark.text, fontWeight: "500" },
  explanation: { fontSize: 13, color: Colors.dark.textMuted, lineHeight: 19, backgroundColor: Colors.dark.chipBackground, borderRadius: BorderRadius.md, padding: Spacing.md },
  nextBtn: { backgroundColor: GlowColors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: "center" },
  nextBtnText: { fontSize: 14, fontWeight: "700", color: "#000" },
});

// ─── MiniTile styles ──────────────────────────────────────────────────────
const diagMiniTileStyles = StyleSheet.create({
  tile: { flex: 1, height: MINI_TILE_HEIGHT, borderRadius: BorderRadius.md, borderWidth: 1, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, gap: Spacing.xs, justifyContent: "space-between", overflow: "hidden" },
  tilePressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  tileTapArea: { flex: 1, gap: Spacing.xs },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  label: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2, flexShrink: 1 },
  body: { flex: 1, justifyContent: "center", gap: 4 },
  footer: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  footerText: { fontSize: 10, color: Colors.dark.textMuted, fontWeight: "600" },
  bigScore: { fontSize: 22, fontWeight: "800", color: Colors.dark.text, lineHeight: 26 },
  dotsRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  questName: { fontSize: 12, fontWeight: "700", color: Colors.dark.text, lineHeight: 15 },
  progressBar: { height: 4, backgroundColor: Colors.dark.chipBackgroundStrong, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontSize: 10, color: Colors.dark.textSubtle, fontWeight: "700" },
  questEmptyText: { fontSize: 12, color: Colors.dark.textMuted, fontWeight: "500" },
  xpFooterText: { fontSize: 10, color: Colors.dark.gold, fontWeight: "700" },
  spotAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, overflow: "hidden", backgroundColor: Colors.dark.chipBackground },
  spotName: { fontSize: 12, fontWeight: "700", color: Colors.dark.text },
  urgencyChip: { backgroundColor: "rgba(255,215,0,0.18)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: "rgba(255,215,0,0.35)", maxWidth: 70 },
  urgencyChipText: { fontSize: 8, fontWeight: "800", color: Colors.dark.gold, letterSpacing: 0.3 },
});
