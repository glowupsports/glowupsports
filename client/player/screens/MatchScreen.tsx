import React, { useState, useEffect } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, ProTennisColors, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { apiRequest } from "@/lib/query-client";
import type { PlayerStackParamList, ScheduleStackParamList } from "@/player/navigation/PlayerNavigator";
import { LockedScreen } from "../components/LockedScreen";

interface Opponent {
  id: string;
  name: string;
  club?: string;
  playstyleTags?: string[];
  strongerSide?: string;
  weakerSide?: string;
  winRate?: number;
}

interface MatchPlan {
  id: string;
  scheduledDate: string;
  venue?: string;
  opponent?: Opponent;
  primaryTactic?: string;
  mentalCue?: string;
  energyFocus?: string;
  status: string;
}

interface Match {
  id: string;
  matchDate: string;
  result: string;
  score: string;
  opponent?: Opponent;
  glowRankChange?: number;
}

const PLAYSTYLE_LABELS: Record<string, string> = {
  baseline_grinder: "Baseline Grinder",
  aggressive_hitter: "Aggressive Hitter",
  serve_focused: "Serve Focused",
  consistent_defender: "Consistent Defender",
  net_player: "Net Player",
  counterpuncher: "Counterpuncher",
  all_court: "All-Court",
  pusher: "Pusher",
  big_server: "Big Server",
  touch_player: "Touch Player",
};

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const route = useRoute<NativeStackScreenProps<ScheduleStackParamList, "Match">["route"]>();
  const { player } = usePlayer();
  const queryClient = useQueryClient();
  const track = useTrackFeature();
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">(
    route.params?.initialTab ?? "upcoming"
  );

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<MatchPlan | null>(null);

  const { data: upcomingMatches, isLoading: loadingUpcoming } = useQuery<MatchPlan[]>({
    queryKey: [`/api/match-intelligence/upcoming?playerId=${player?.id}`],
    enabled: !!player?.id,
  });

  const { data: matchHistory, isLoading: loadingHistory } = useQuery<Match[]>({
    queryKey: [`/api/match-intelligence/matches?playerId=${player?.id}`],
    enabled: !!player?.id,
  });

  const { data: opponents } = useQuery<Opponent[]>({
    queryKey: [`/api/match-intelligence/opponents?playerId=${player?.id}`],
    enabled: !!player?.id,
  });

  const renderUpcomingCard = (plan: MatchPlan) => (
    <Pressable
      key={plan.id}
      style={styles.matchCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      <LinearGradient
        colors={[Colors.dark.xpCyan + "20", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.matchCardGradient}
      >
        <View style={styles.matchCardHeader}>
          <Text style={styles.matchDate}>
            {new Date(plan.scheduledDate).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Text>
          <View style={[styles.statusBadge, plan.status === "active" && styles.activeBadge]}>
            <Text style={styles.statusText}>
              {plan.status === "active" ? "Ready" : "Preparing"}
            </Text>
          </View>
        </View>

        {plan.opponent && (
          <View style={styles.opponentSection}>
            <Text style={styles.vsText}>vs</Text>
            <Text style={styles.opponentName}>{plan.opponent.name}</Text>
            {plan.opponent.club && (
              <Text style={styles.opponentClub}>{plan.opponent.club}</Text>
            )}
            {plan.opponent.playstyleTags && plan.opponent.playstyleTags.length > 0 && (
              <View style={styles.tagsRow}>
                {plan.opponent.playstyleTags.slice(0, 2).map((tag) => (
                  <View key={tag} style={styles.playstyleTag}>
                    <Text style={styles.playstyleTagText}>
                      {PLAYSTYLE_LABELS[tag] || tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {plan.primaryTactic && (
          <View style={styles.planSection}>
            <Text style={styles.planLabel}>Game Plan</Text>
            <Text style={styles.planTactic}>{plan.primaryTactic}</Text>
            {plan.mentalCue && (
              <Text style={styles.planCue}>{plan.mentalCue}</Text>
            )}
          </View>
        )}

        <View style={styles.cardActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              (navigation as any).navigate("MatchPrep", { planId: plan.id });
            }}
          >
            <Ionicons name="create-outline" size={18} color={Colors.dark.primary} />
            <Text style={styles.actionText}>Edit Plan</Text>
          </Pressable>
          <Pressable 
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSelectedPlan(plan);
              setShowResultModal(true);
            }}
          >
            <Ionicons name="play" size={18} color={Colors.dark.buttonText} />
            <Text style={styles.primaryButtonText}>Enter Result</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Pressable>
  );

  const renderHistoryCard = (match: Match) => (
    <Pressable
      key={match.id}
      style={styles.historyCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("MatchDetail", { matchId: match.id });
      }}
    >
      <View style={styles.historyLeft}>
        <View style={[
          styles.resultIndicator,
          match.result === "win" ? styles.winIndicator : styles.lossIndicator,
        ]} />
        <View>
          <Text style={styles.historyOpponent}>
            vs {match.opponent?.name || "Unknown"}
          </Text>
          <Text style={styles.historyDate}>
            {new Date(match.matchDate).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <View style={styles.historyRight}>
        <Text style={[
          styles.historyResult,
          match.result === "win" ? styles.winText : styles.lossText,
        ]}>
          {match.result === "win" ? "W" : "L"}
        </Text>
        <Text style={styles.historyScore}>{match.score}</Text>
        {match.glowRankChange !== undefined && match.glowRankChange !== 0 && (
          <Text style={[
            styles.rankChange,
            match.glowRankChange > 0 ? styles.positiveChange : styles.negativeChange,
          ]}>
            {match.glowRankChange > 0 ? "+" : ""}{match.glowRankChange}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <LockedScreen featureKey="match_preparation">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Matches</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => {
              track("match:log_match");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowPrepareModal(true);
            }}
          >
            <Ionicons name="add" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "upcoming" && styles.activeTab]}
          onPress={() => setActiveTab("upcoming")}
        >
          <Text style={[styles.tabText, activeTab === "upcoming" && styles.activeTabText]}>
            Upcoming
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "history" && styles.activeTab]}
          onPress={() => { track("match:history"); setActiveTab("history"); }}
        >
          <Text style={[styles.tabText, activeTab === "history" && styles.activeTabText]}>
            History
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "upcoming" ? (
          loadingUpcoming ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : upcomingMatches && upcomingMatches.length > 0 ? (
            upcomingMatches.map(renderUpcomingCard)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>No upcoming matches</Text>
              <Text style={styles.emptySubtitle}>
                Tap + to prepare for your next match
              </Text>
            </View>
          )
        ) : loadingHistory ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : matchHistory && matchHistory.length > 0 ? (
          matchHistory.map(renderHistoryCard)
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>No match history</Text>
            <Text style={styles.emptySubtitle}>
              Your match results will appear here
            </Text>
          </View>
        )}
      </ScrollView>

      <MatchPrepareModal
        visible={showPrepareModal}
        onClose={() => setShowPrepareModal(false)}
        playerId={player?.id || ""}
        opponents={opponents || []}
      />

      <MatchResultModal
        visible={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          setSelectedPlan(null);
        }}
        playerId={player?.id || ""}
        plan={selectedPlan}
        onSuccess={(matchId) => {
          setShowResultModal(false);
          setSelectedPlan(null);
          navigation.navigate("MatchDetail", { matchId });
        }}
      />
      </View>
    </LockedScreen>
  );
}

interface MatchPrepareModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  opponents: Opponent[];
}

function MatchPrepareModal({ visible, onClose, playerId, opponents }: MatchPrepareModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedOpponent, setSelectedOpponent] = useState<Opponent | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [venue, setVenue] = useState("");
  const [primaryTactic, setPrimaryTactic] = useState("");
  const [mentalCue, setMentalCue] = useState("");
  const [energyFocus, setEnergyFocus] = useState("");
  const [energy, setEnergy] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(5);

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/match-intelligence/plans", {
        method: "POST",
        body: JSON.stringify({
          playerId,
          opponentId: selectedOpponent?.id,
          scheduledDate,
          venue,
          primaryTactic,
          mentalCue,
          energyFocus,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/upcoming`] });
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setStep(1);
    setSelectedOpponent(null);
    setScheduledDate("");
    setVenue("");
    setPrimaryTactic("");
    setMentalCue("");
    setEnergyFocus("");
    setEnergy(null);
    setMood(null);
    setConfidence(5);
  };

  if (!visible) return null;

  const suggestedTactics = [
    "Rally crosscourt to backhand",
    "High margin shots early",
    "Attack second serve",
    "Stay patient first 5 shots",
    "Move forward on short balls",
  ];

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.modalTitle}>Prepare Match</Text>
          <Text style={styles.stepIndicator}>Step {step}/3</Text>
        </View>

        <ScrollView style={styles.modalBody}>
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Match Details</Text>

              <Text style={styles.inputLabel}>Date</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textSecondary}
                value={scheduledDate}
                onChangeText={setScheduledDate}
              />

              <Text style={styles.inputLabel}>Venue</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Tennis club, court..."
                placeholderTextColor={Colors.textSecondary}
                value={venue}
                onChangeText={setVenue}
              />

              <Text style={styles.inputLabel}>Opponent</Text>
              {opponents.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {opponents.map((opp) => (
                    <Pressable
                      key={opp.id}
                      style={[
                        styles.opponentChip,
                        selectedOpponent?.id === opp.id && styles.selectedChip,
                      ]}
                      onPress={() => setSelectedOpponent(opp)}
                    >
                      <Text style={[
                        styles.opponentChipText,
                        selectedOpponent?.id === opp.id && styles.selectedChipText,
                      ]}>
                        {opp.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.noOpponents}>
                  No opponents saved yet. You can add one later.
                </Text>
              )}
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Game Plan</Text>
              <Text style={styles.stepSubtitle}>
                Choose up to 3 focus points for your match
              </Text>

              <Text style={styles.inputLabel}>Primary Tactic</Text>
              <View style={styles.tacticsGrid}>
                {suggestedTactics.map((tactic) => (
                  <Pressable
                    key={tactic}
                    style={[
                      styles.tacticChip,
                      primaryTactic === tactic && styles.selectedTacticChip,
                    ]}
                    onPress={() => setPrimaryTactic(tactic)}
                  >
                    <Text style={[
                      styles.tacticChipText,
                      primaryTactic === tactic && styles.selectedTacticText,
                    ]}>
                      {tactic}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Mental Cue</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Stay calm, reset after each point"
                placeholderTextColor={Colors.textSecondary}
                value={mentalCue}
                onChangeText={setMentalCue}
              />

              <Text style={styles.inputLabel}>Energy Focus</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Full effort on break points"
                placeholderTextColor={Colors.textSecondary}
                value={energyFocus}
                onChangeText={setEnergyFocus}
              />
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Pre-Match Check-In</Text>
              <Text style={styles.stepSubtitle}>
                How are you feeling before the match?
              </Text>

              <Text style={styles.inputLabel}>Energy Level</Text>
              <View style={styles.optionsRow}>
                {["low", "ok", "high"].map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.optionButton,
                      energy === level && styles.selectedOption,
                    ]}
                    onPress={() => setEnergy(level)}
                  >
                    <Text style={[
                      styles.optionText,
                      energy === level && styles.selectedOptionText,
                    ]}>
                      {level === "low" ? "Low" : level === "ok" ? "OK" : "High"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Mood</Text>
              <View style={styles.optionsRow}>
                {["neutral", "positive", "fired_up"].map((m) => (
                  <Pressable
                    key={m}
                    style={[
                      styles.optionButton,
                      mood === m && styles.selectedOption,
                    ]}
                    onPress={() => setMood(m)}
                  >
                    <Text style={[
                      styles.optionText,
                      mood === m && styles.selectedOptionText,
                    ]}>
                      {m === "neutral" ? "Neutral" : m === "positive" ? "Positive" : "Fired Up"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Confidence: {confidence}/10</Text>
              <View style={styles.confidenceRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <Pressable
                    key={n}
                    style={[
                      styles.confidenceDot,
                      confidence >= n && styles.confidenceDotFilled,
                    ]}
                    onPress={() => setConfidence(n)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.modalFooter}>
          {step > 1 && (
            <Pressable
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.nextButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (step < 3) {
                setStep(step + 1);
              } else {
                createPlanMutation.mutate();
              }
            }}
          >
            <Text style={styles.nextButtonText}>
              {step < 3 ? "Next" : "Save Plan"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface MatchResultModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  plan: MatchPlan | null;
  onSuccess: (matchId: string) => void;
}

const CHALLENGE_OPTIONS = [
  { id: "nerves", label: "Nerves" },
  { id: "opponent_level", label: "Opponent Level" },
  { id: "focus", label: "Focus" },
  { id: "fatigue", label: "Fatigue" },
  { id: "tactics", label: "Tactics" },
  { id: "serve", label: "Serve" },
  { id: "return", label: "Return" },
  { id: "consistency", label: "Consistency" },
];

const WHAT_WORKED_OPTIONS = [
  { id: "serve", label: "Serve" },
  { id: "return", label: "Return" },
  { id: "forehand", label: "Forehand" },
  { id: "backhand", label: "Backhand" },
  { id: "movement", label: "Movement" },
  { id: "volleys", label: "Volleys" },
  { id: "mental_game", label: "Mental Game" },
  { id: "consistency", label: "Consistency" },
];

function MatchResultModal({ visible, onClose, playerId, plan, onSuccess }: MatchResultModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [result, setResult] = useState<"win" | "loss" | null>(null);
  const [score, setScore] = useState("");
  const [whatWorked, setWhatWorked] = useState<string[]>([]);
  const [whatDidntWork, setWhatDidntWork] = useState<string[]>([]);
  const [biggestChallenge, setBiggestChallenge] = useState<string | null>(null);
  const [postEnergy, setPostEnergy] = useState<string | null>(null);
  const [postMood, setPostMood] = useState<string | null>(null);
  const [keyTakeaway, setKeyTakeaway] = useState("");

  const createMatchMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/match-intelligence/matches", {
        method: "POST",
        body: JSON.stringify({
          playerId,
          planId: plan?.id,
          opponentId: plan?.opponent?.id,
          matchDate: new Date().toISOString(),
          result,
          score,
          whatWorked,
          whatDidntWork,
          biggestChallenge,
          postMatchEnergy: postEnergy,
          postMatchMood: postMood,
          keyTakeaway,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/matches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/upcoming`] });
      resetForm();
      onSuccess(data.id);
    },
  });

  const resetForm = () => {
    setStep(1);
    setResult(null);
    setScore("");
    setWhatWorked([]);
    setWhatDidntWork([]);
    setBiggestChallenge(null);
    setPostEnergy(null);
    setPostMood(null);
    setKeyTakeaway("");
  };

  const toggleSelection = (id: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(id)) {
      setter(current.filter((i) => i !== id));
    } else if (current.length < 3) {
      setter([...current, id]);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.modalTitle}>Match Result</Text>
          <Text style={styles.stepIndicator}>Step {step}/2</Text>
        </View>

        <ScrollView style={styles.modalBody}>
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Score Entry</Text>
              {plan?.opponent && (
                <Text style={styles.stepSubtitle}>vs {plan.opponent.name}</Text>
              )}

              <Text style={styles.inputLabel}>Result</Text>
              <View style={styles.optionsRow}>
                <Pressable
                  style={[
                    styles.resultOption,
                    result === "win" && styles.winOption,
                  ]}
                  onPress={() => setResult("win")}
                >
                  <Ionicons 
                    name="trophy" 
                    size={24} 
                    color={result === "win" ? Colors.success : Colors.textSecondary} 
                  />
                  <Text style={[
                    styles.resultOptionText,
                    result === "win" && styles.winOptionText,
                  ]}>
                    Win
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.resultOption,
                    result === "loss" && styles.lossOption,
                  ]}
                  onPress={() => setResult("loss")}
                >
                  <Ionicons 
                    name="close-circle" 
                    size={24} 
                    color={result === "loss" ? Colors.error : Colors.textSecondary} 
                  />
                  <Text style={[
                    styles.resultOptionText,
                    result === "loss" && styles.lossOptionText,
                  ]}>
                    Loss
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Score</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., 6-4, 3-6, 7-5"
                placeholderTextColor={Colors.textSecondary}
                value={score}
                onChangeText={setScore}
              />
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Quick Reflection</Text>
              <Text style={styles.stepSubtitle}>
                Tap to select (max 3 each)
              </Text>

              <Text style={styles.inputLabel}>What worked?</Text>
              <View style={styles.chipGrid}>
                {WHAT_WORKED_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[
                      styles.reflectionChip,
                      whatWorked.includes(option.id) && styles.selectedGoodChip,
                    ]}
                    onPress={() => toggleSelection(option.id, whatWorked, setWhatWorked)}
                  >
                    <Text style={[
                      styles.reflectionChipText,
                      whatWorked.includes(option.id) && styles.selectedGoodChipText,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>What needs work?</Text>
              <View style={styles.chipGrid}>
                {WHAT_WORKED_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[
                      styles.reflectionChip,
                      whatDidntWork.includes(option.id) && styles.selectedBadChip,
                    ]}
                    onPress={() => toggleSelection(option.id, whatDidntWork, setWhatDidntWork)}
                  >
                    <Text style={[
                      styles.reflectionChipText,
                      whatDidntWork.includes(option.id) && styles.selectedBadChipText,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Biggest challenge?</Text>
              <View style={styles.chipGrid}>
                {CHALLENGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[
                      styles.reflectionChip,
                      biggestChallenge === option.id && styles.selectedChallenge,
                    ]}
                    onPress={() => setBiggestChallenge(option.id)}
                  >
                    <Text style={[
                      styles.reflectionChipText,
                      biggestChallenge === option.id && styles.selectedChallengeText,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>How do you feel now?</Text>
              <View style={styles.optionsRow}>
                {["drained", "ok", "energized"].map((e) => (
                  <Pressable
                    key={e}
                    style={[
                      styles.optionButton,
                      postEnergy === e && styles.selectedOption,
                    ]}
                    onPress={() => setPostEnergy(e)}
                  >
                    <Text style={[
                      styles.optionText,
                      postEnergy === e && styles.selectedOptionText,
                    ]}>
                      {e === "drained" ? "Drained" : e === "ok" ? "OK" : "Energized"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Key takeaway (optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="What will you remember from this match?"
                placeholderTextColor={Colors.textSecondary}
                value={keyTakeaway}
                onChangeText={setKeyTakeaway}
                multiline
              />
            </View>
          )}
        </ScrollView>

        <View style={styles.modalFooter}>
          {step > 1 && (
            <Pressable
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.nextButton, (!result || !score) && step === 1 && styles.disabledButton]}
            disabled={step === 1 && (!result || !score)}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (step < 2) {
                setStep(step + 1);
              } else {
                createMatchMutation.mutate();
              }
            }}
          >
            <Text style={styles.nextButtonText}>
              {step < 2 ? "Next" : createMatchMutation.isPending ? "Saving..." : "Save Match"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProTennisColors.midnightBlue,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.title,
    color: ProTennisColors.white,
  },
  addButton: {
    padding: Spacing.sm,
    backgroundColor: ProTennisColors.electricGreen,
    borderRadius: BorderRadius.full,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: ProTennisColors.surfaceCard,
    borderWidth: 1,
    borderColor: ProTennisColors.borderSubtle,
  },
  activeTab: {
    backgroundColor: ProTennisColors.electricGreen,
    borderColor: ProTennisColors.electricGreen,
  },
  tabText: {
    ...Typography.body,
    color: ProTennisColors.textMuted,
  },
  activeTabText: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  contentContainer: {
    paddingBottom: Spacing.xl,
  },
  matchCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: ProTennisColors.neonCyan + "40",
    backgroundColor: ProTennisColors.surfaceCard,
  },
  matchCardGradient: {
    padding: Spacing.lg,
  },
  matchCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  matchDate: {
    ...Typography.subtitle,
    color: ProTennisColors.white,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: ProTennisColors.surfaceElevated,
  },
  activeBadge: {
    backgroundColor: ProTennisColors.electricGreen + "30",
  },
  statusText: {
    ...Typography.caption,
    color: ProTennisColors.textMuted,
  },
  opponentSection: {
    marginBottom: Spacing.md,
  },
  vsText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  opponentName: {
    ...Typography.title,
    color: Colors.text,
  },
  opponentClub: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  tagsRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  playstyleTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
  },
  playstyleTagText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  planSection: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  planLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  planTactic: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
  },
  planCue: {
    ...Typography.caption,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  cardActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  actionText: {
    ...Typography.caption,
    color: Colors.primary,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    ...Typography.caption,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  historyCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  resultIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  winIndicator: {
    backgroundColor: Colors.success,
  },
  lossIndicator: {
    backgroundColor: Colors.error,
  },
  historyOpponent: {
    ...Typography.body,
    color: Colors.text,
  },
  historyDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  historyRight: {
    alignItems: "flex-end",
  },
  historyResult: {
    ...Typography.title,
    fontWeight: "700",
  },
  winText: {
    color: Colors.success,
  },
  lossText: {
    color: Colors.error,
  },
  historyScore: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  rankChange: {
    ...Typography.small,
    fontWeight: "600",
  },
  positiveChange: {
    color: Colors.success,
  },
  negativeChange: {
    color: Colors.error,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
  },
  emptyTitle: {
    ...Typography.subtitle,
    color: ProTennisColors.white,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    ...Typography.body,
    color: ProTennisColors.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: ProTennisColors.surfaceDark,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: ProTennisColors.borderSubtle,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.borderSubtle,
  },
  modalTitle: {
    ...Typography.subtitle,
    color: ProTennisColors.white,
  },
  stepIndicator: {
    ...Typography.caption,
    color: ProTennisColors.neonCyan,
  },
  modalBody: {
    padding: Spacing.lg,
    maxHeight: 400,
  },
  stepContent: {},
  stepTitle: {
    ...Typography.title,
    color: ProTennisColors.white,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    ...Typography.body,
    color: ProTennisColors.textMuted,
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.caption,
    color: ProTennisColors.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: ProTennisColors.surfaceCard,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    color: ProTennisColors.white,
    borderWidth: 1,
    borderColor: ProTennisColors.borderSubtle,
    ...Typography.body,
  },
  opponentChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: ProTennisColors.borderSubtle,
  },
  selectedChip: {
    backgroundColor: ProTennisColors.electricGreen,
    borderColor: ProTennisColors.electricGreen,
  },
  opponentChipText: {
    ...Typography.body,
    color: ProTennisColors.white,
  },
  selectedChipText: {
    color: ProTennisColors.midnightBlue,
  },
  noOpponents: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  tacticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  tacticChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
  },
  selectedTacticChip: {
    backgroundColor: Colors.primary,
  },
  tacticChipText: {
    ...Typography.caption,
    color: Colors.text,
  },
  selectedTacticText: {
    color: Colors.dark.buttonText,
  },
  optionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  optionButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
  },
  selectedOption: {
    backgroundColor: Colors.primary,
  },
  optionText: {
    ...Typography.body,
    color: Colors.text,
  },
  selectedOptionText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  confidenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  confidenceDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
  },
  confidenceDotFilled: {
    backgroundColor: Colors.primary,
  },
  modalFooter: {
    flexDirection: "row",
    padding: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  backButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.textSecondary,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  nextButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: ProTennisColors.electricGreen,
  },
  nextButtonText: {
    ...Typography.body,
    color: ProTennisColors.midnightBlue,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  resultOption: {
    flex: 1,
    padding: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  winOption: {
    backgroundColor: Colors.success + "20",
    borderWidth: 2,
    borderColor: Colors.success,
  },
  lossOption: {
    backgroundColor: Colors.error + "20",
    borderWidth: 2,
    borderColor: Colors.error,
  },
  resultOptionText: {
    ...Typography.body,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  winOptionText: {
    color: Colors.success,
  },
  lossOptionText: {
    color: Colors.error,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  reflectionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selectedGoodChip: {
    backgroundColor: Colors.success + "20",
    borderColor: Colors.success,
  },
  selectedBadChip: {
    backgroundColor: Colors.error + "20",
    borderColor: Colors.error,
  },
  selectedChallenge: {
    backgroundColor: Colors.warning + "20",
    borderColor: Colors.warning,
  },
  reflectionChipText: {
    ...Typography.caption,
    color: Colors.text,
  },
  selectedGoodChipText: {
    color: Colors.success,
    fontWeight: "600",
  },
  selectedBadChipText: {
    color: Colors.error,
    fontWeight: "600",
  },
  selectedChallengeText: {
    color: Colors.warning,
    fontWeight: "600",
  },
});
