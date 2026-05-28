import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { usePlayer } from "@/player/context/PlayerContext";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

type MatchType = "friendly" | "ladder" | "tournament";
type Verification = "self_reported" | "coach_verified";
type MatchMode = "singles" | "doubles";

interface SetScoreEntry {
  p: string;
  o: string;
}

interface SearchedPlayer {
  id: string;
  name: string;
}

interface MatchResult {
  success: boolean;
  playerId?: string;
  previousMmr: number;
  newMmr: number;
  mmrDelta: number;
  previousRank: number;
  newRank: number;
  promoted: boolean;
  demoted: boolean;
  blockedByGates: string[];
  warnings: string[];
  explanation?: string;
  // doubles
  matchType?: string;
  team1?: { players: string[]; won: boolean; mmrDeltas: number[]; explanation?: string };
  team2?: { players: string[]; won: boolean; mmrDeltas: number[]; explanation?: string };
}

const EMPTY_SET: SetScoreEntry = { p: "", o: "" };

function parseSetScoreToJson(sets: SetScoreEntry[]): Array<{ p: number; o: number }> {
  return sets
    .map((s) => ({ p: parseInt(s.p || "0", 10), o: parseInt(s.o || "0", 10) }))
    .filter((s) => s.p > 0 || s.o > 0);
}

function PlayerSearchInput({
  label,
  value,
  onChangeText,
  selectedPlayer,
  onSelectPlayer,
  onClear,
  placeholder = "Zoek speler op naam",
  currentPlayerId,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  selectedPlayer: SearchedPlayer | null;
  onSelectPlayer: (p: SearchedPlayer) => void;
  onClear: () => void;
  placeholder?: string;
  currentPlayerId?: string;
}) {
  const [results, setResults] = useState<SearchedPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setShowDrop(false);
        return;
      }
      setSearching(true);
      try {
        const url = new URL("/api/player/search-players", getApiUrl());
        url.searchParams.set("q", q.trim());
        const res = await fetch(url.toString());
        const data = await res.json();
        const filtered = (data.players ?? []).filter(
          (p: SearchedPlayer) => p.id !== currentPlayerId,
        );
        setResults(filtered);
        setShowDrop(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [currentPlayerId],
  );

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => search(text), 350);
    },
    [onChangeText, search],
  );

  return (
    <View style={searchStyles.container}>
      <ThemedText style={searchStyles.label}>{label}</ThemedText>
      <View style={searchStyles.row}>
        <TextInput
          style={[searchStyles.input, searchStyles.flex]}
          placeholder={placeholder}
          placeholderTextColor={Colors.dark.disabled}
          value={value}
          onChangeText={handleChange}
          autoCorrect={false}
        />
        {searching ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginLeft: 8 }} />
        ) : value.length > 0 ? (
          <Pressable onPress={onClear} hitSlop={10} style={{ padding: Spacing.xs }}>
            <Feather name="x-circle" size={18} color={Colors.dark.disabled} />
          </Pressable>
        ) : null}
      </View>

      {selectedPlayer ? (
        <View style={searchStyles.badge}>
          <Feather name="user-check" size={13} color={Colors.dark.primary} />
          <ThemedText style={searchStyles.badgeText}>{selectedPlayer.name} (in-app)</ThemedText>
        </View>
      ) : null}

      {showDrop && results.length > 0 ? (
        <View style={searchStyles.dropdown}>
          {results.map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [searchStyles.dropItem, pressed && { opacity: 0.7 }]}
              onPress={() => {
                onSelectPlayer(p);
                setShowDrop(false);
                setResults([]);
              }}
            >
              <Feather name="user" size={13} color={Colors.dark.disabled} />
              <ThemedText style={searchStyles.dropText}>{p.name}</ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function RecordAdultMatchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { playerId, isLoading: playerLoading } = usePlayer();

  // Match mode
  const [matchMode, setMatchMode] = useState<MatchMode>("singles");

  // Singles fields
  const [opponentName, setOpponentName] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<SearchedPlayer | null>(null);

  // Doubles fields
  const [partnerName, setPartnerName] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<SearchedPlayer | null>(null);
  const [opponent2Name, setOpponent2Name] = useState("");
  const [selectedOpponent2, setSelectedOpponent2] = useState<SearchedPlayer | null>(null);

  // Common fields
  const [didWin, setDidWin] = useState<boolean | null>(null);
  const [sets, setSets] = useState<SetScoreEntry[]>([{ ...EMPTY_SET }]);
  const [matchType, setMatchType] = useState<MatchType>("friendly");
  const [verification, setVerification] = useState<Verification>("self_reported");
  const [showResult, setShowResult] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sets management
  const updateSet = useCallback((idx: number, field: "p" | "o", value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value.replace(/\D/g, "").slice(0, 2) };
      return next;
    });
  }, []);

  const addSet = useCallback(() => {
    if (sets.length < 5) setSets((prev) => [...prev, { ...EMPTY_SET }]);
  }, [sets.length]);

  const removeSet = useCallback((idx: number) => {
    if (sets.length > 1) setSets((prev) => prev.filter((_, i) => i !== idx));
  }, [sets.length]);

  const handleSubmit = async () => {
    if (!playerId) {
      Alert.alert("Error", "You must be logged in to record a match.");
      return;
    }
    if (didWin === null) {
      Alert.alert("Missing Information", "Please select if you won or lost.");
      return;
    }

    // Validate score: at least one set must have valid entries
    const validSets = sets.filter((s) => {
      const p = parseInt(s.p, 10);
      const o = parseInt(s.o, 10);
      return !isNaN(p) && !isNaN(o) && (p > 0 || o > 0);
    });
    if (validSets.length === 0) {
      Alert.alert("Score Required", "Please enter the score for at least one set (e.g. Set 1: 6 — 4).");
      return;
    }

    // Validate score is consistent with the declared result
    const setsWonByPlayer = validSets.filter((s) => parseInt(s.p, 10) > parseInt(s.o, 10)).length;
    const setsWonByOpponent = validSets.filter((s) => parseInt(s.o, 10) > parseInt(s.p, 10)).length;
    if (setsWonByPlayer !== setsWonByOpponent) {
      const scoreSaysWin = setsWonByPlayer > setsWonByOpponent;
      if (scoreSaysWin !== didWin) {
        Alert.alert(
          "Score / Result Mismatch",
          didWin
            ? "Your sets show a loss. Please check the score or change the result to 'Lost'."
            : "Your sets show a win. Please check the score or change the result to 'Won'.",
        );
        return;
      }
    }

    if (matchMode === "singles") {
      if (!opponentName.trim()) {
        Alert.alert("Missing Information", "Please enter the opponent's name.");
        return;
      }
      await submitSingles();
    } else {
      if (!opponentName.trim()) {
        Alert.alert("Missing Information", "Please enter the first opponent's name.");
        return;
      }
      if (!partnerName.trim()) {
        Alert.alert("Missing Information", "Please enter your partner's name.");
        return;
      }
      if (!opponent2Name.trim()) {
        Alert.alert("Missing Information", "Please enter the second opponent's name.");
        return;
      }
      await submitDoubles();
    }
  };

  const submitSingles = async () => {
    setIsSubmitting(true);
    try {
      const opponentRes = await apiRequest("POST", "/api/adult-glow/find-or-create-opponent", {
        name: selectedOpponent?.name ?? opponentName.trim(),
      });
      const opponentData = await opponentRes.json();

      if (!opponentData.opponent?.id) {
        Alert.alert("Error", "Could not find or create opponent.");
        setIsSubmitting(false);
        return;
      }

      const scoreJson = parseSetScoreToJson(sets);
      const gamesDiff = scoreJson.reduce((sum, s) => sum + (s.p - s.o), 0);

      const res = await apiRequest("POST", "/api/adult-glow/match", {
        playerId,
        opponentId: selectedOpponent?.id ?? opponentData.opponent.id,
        didWin,
        gamesDiff: didWin ? Math.abs(gamesDiff) : -Math.abs(gamesDiff),
        setScore: scoreJson.map((s) => `${s.p}-${s.o}`).join(", ") || "Unknown",
        scoreJson: scoreJson.length > 0 ? scoreJson : undefined,
        matchType,
        verification,
      });

      const result: MatchResult = await res.json();
      setMatchResult(result);
      setShowResult(true);
      queryClient.invalidateQueries({ queryKey: [`/api/adult-glow/player/${playerId}/full-profile`] });
    } catch (error) {
      Alert.alert("Error", "Failed to record match. Please try again.");
      console.error("Match recording error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDoubles = async () => {
    setIsSubmitting(true);
    try {
      const [partnerData, opp1Data, opp2Data] = await Promise.all([
        apiRequest("POST", "/api/adult-glow/find-or-create-opponent", {
          name: selectedPartner?.name ?? partnerName.trim(),
        }).then((r) => r.json()),
        apiRequest("POST", "/api/adult-glow/find-or-create-opponent", {
          name: selectedOpponent?.name ?? opponentName.trim(),
        }).then((r) => r.json()),
        apiRequest("POST", "/api/adult-glow/find-or-create-opponent", {
          name: selectedOpponent2?.name ?? opponent2Name.trim(),
        }).then((r) => r.json()),
      ]);

      if (!partnerData.opponent?.id || !opp1Data.opponent?.id || !opp2Data.opponent?.id) {
        Alert.alert("Error", "Could not resolve all players.");
        setIsSubmitting(false);
        return;
      }

      const scoreJson = parseSetScoreToJson(sets);

      const res = await apiRequest("POST", "/api/adult-glow/doubles-match", {
        team1Player1Id: playerId,
        team1Player2Id: selectedPartner?.id ?? partnerData.opponent.id,
        team2Player1Id: selectedOpponent?.id ?? opp1Data.opponent.id,
        team2Player2Id: selectedOpponent2?.id ?? opp2Data.opponent.id,
        team1Won: didWin,
        setScore: scoreJson.map((s) => `${s.p}-${s.o}`).join(", ") || "Unknown",
        scoreJson: scoreJson.length > 0 ? scoreJson : undefined,
        matchType,
        verification,
      });

      const result: MatchResult = await res.json();
      setMatchResult(result);
      setShowResult(true);
      queryClient.invalidateQueries({ queryKey: [`/api/adult-glow/player/${playerId}/full-profile`] });
    } catch (error) {
      Alert.alert("Error", "Failed to record doubles match. Please try again.");
      console.error("Doubles match error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewMatch = () => {
    setShowResult(false);
    setMatchResult(null);
    setOpponentName("");
    setSelectedOpponent(null);
    setPartnerName("");
    setSelectedPartner(null);
    setOpponent2Name("");
    setSelectedOpponent2(null);
    setDidWin(null);
    setSets([{ ...EMPTY_SET }]);
    setMatchType("friendly");
    setVerification("self_reported");
  };

  if (playerLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <TennisBallSpinner size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (!playerId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.orange} />
        <ThemedText style={styles.errorTitle}>Not Available</ThemedText>
        <ThemedText style={styles.errorText}>
          You need to be logged in as a player to record matches.
        </ThemedText>
      </View>
    );
  }

  // ---- Result screen ----
  if (showResult && matchResult) {
    const isDoubles = matchResult.matchType === "doubles";
    const mmrDelta = isDoubles
      ? (matchResult.team1?.mmrDeltas[0] ?? 0)
      : matchResult.mmrDelta;
    const explanation = isDoubles
      ? (didWin ? matchResult.team1?.explanation : matchResult.team2?.explanation) ?? matchResult.explanation
      : matchResult.explanation;

    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
            paddingHorizontal: Spacing.lg,
            alignItems: "center",
          }}
        >
          <View
            style={[
              styles.resultIcon,
              mmrDelta >= 0 ? styles.resultWin : styles.resultLoss,
            ]}
          >
            <Ionicons
              name={mmrDelta >= 0 ? "trending-up" : "trending-down"}
              size={48}
              color={Colors.dark.buttonText}
            />
          </View>

          <ThemedText style={styles.resultTitle}>
            {isDoubles ? "Doubles Match Recorded!" : "Match Recorded!"}
          </ThemedText>

          {/* Explanation card */}
          {explanation ? (
            <Card elevation={2} style={styles.explanationCard}>
              <View style={styles.explanationRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={mmrDelta >= 0 ? Colors.dark.primary : Colors.dark.error}
                />
                <ThemedText style={styles.explanationText}>{explanation}</ThemedText>
              </View>
            </Card>
          ) : null}

          {isDoubles ? (
            <Card elevation={2} style={styles.resultCard}>
              <View style={styles.resultRow}>
                <ThemedText style={styles.resultLabel}>Your Team</ThemedText>
                <ThemedText
                  style={[
                    styles.resultValue,
                    mmrDelta >= 0 ? styles.gainText : styles.lossText,
                  ]}
                >
                  {mmrDelta >= 0 ? "+" : ""}
                  {mmrDelta} MMR each
                </ThemedText>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultRow}>
                <ThemedText style={styles.resultLabel}>Result</ThemedText>
                <ThemedText style={[styles.resultValue, didWin ? styles.gainText : styles.lossText]}>
                  {didWin ? "Win" : "Loss"}
                </ThemedText>
              </View>
            </Card>
          ) : (
            <Card elevation={2} style={styles.resultCard}>
              <View style={styles.resultRow}>
                <ThemedText style={styles.resultLabel}>MMR Change</ThemedText>
                <ThemedText
                  style={[
                    styles.resultValue,
                    matchResult.mmrDelta >= 0 ? styles.gainText : styles.lossText,
                  ]}
                >
                  {matchResult.mmrDelta >= 0 ? "+" : ""}
                  {matchResult.mmrDelta}
                </ThemedText>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultRow}>
                <ThemedText style={styles.resultLabel}>New MMR</ThemedText>
                <ThemedText style={styles.resultValue}>{matchResult.newMmr}</ThemedText>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultRow}>
                <ThemedText style={styles.resultLabel}>Rank</ThemedText>
                <ThemedText style={styles.resultValue}>
                  {matchResult.newRank}
                  {matchResult.promoted ? (
                    <ThemedText style={styles.promotedText}> (Promoted!)</ThemedText>
                  ) : null}
                  {matchResult.demoted ? (
                    <ThemedText style={styles.demotedText}> (Demoted)</ThemedText>
                  ) : null}
                </ThemedText>
              </View>
            </Card>
          )}

          {!isDoubles && matchResult.warnings && matchResult.warnings.length > 0 ? (
            <Card elevation={1} style={styles.warningCard}>
              <View style={styles.warningHeader}>
                <Ionicons name="alert-circle-outline" size={20} color={Colors.dark.xpCyan} />
                <ThemedText style={styles.warningTitle}>Notes</ThemedText>
              </View>
              {matchResult.warnings.map((warning, i) => (
                <ThemedText key={i} style={styles.warningItem}>
                  {warning}
                </ThemedText>
              ))}
            </Card>
          ) : null}

          <View style={styles.resultActions}>
            <Pressable style={styles.recordAnotherBtn} onPress={handleNewMatch}>
              <ThemedText style={styles.recordAnotherBtnText}>Record Another Match</ThemedText>
            </Pressable>
            <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
              <ThemedText style={styles.backLinkText}>Back to Glow Rank</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ---- Form ----
  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {/* Match Mode Toggle */}
        <ThemedText style={styles.sectionTitle}>Match Type</ThemedText>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, matchMode === "singles" && styles.modeBtnActive]}
            onPress={() => setMatchMode("singles")}
          >
            <Feather
              name="user"
              size={16}
              color={matchMode === "singles" ? Colors.dark.buttonText : Colors.dark.text}
            />
            <ThemedText
              style={[styles.modeBtnText, matchMode === "singles" && styles.modeBtnTextActive]}
            >
              Singles
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, matchMode === "doubles" && styles.modeBtnActive]}
            onPress={() => setMatchMode("doubles")}
          >
            <Feather
              name="users"
              size={16}
              color={matchMode === "doubles" ? Colors.dark.buttonText : Colors.dark.text}
            />
            <ThemedText
              style={[styles.modeBtnText, matchMode === "doubles" && styles.modeBtnTextActive]}
            >
              Doubles
            </ThemedText>
          </Pressable>
        </View>

        {/* Player fields */}
        {matchMode === "doubles" ? (
          <>
            <PlayerSearchInput
              label="Your Partner"
              value={partnerName}
              onChangeText={(t) => { setPartnerName(t); setSelectedPartner(null); }}
              selectedPlayer={selectedPartner}
              onSelectPlayer={(p) => { setSelectedPartner(p); setPartnerName(p.name); }}
              onClear={() => { setPartnerName(""); setSelectedPartner(null); }}
              placeholder="Partner name"
              currentPlayerId={playerId}
            />
            <PlayerSearchInput
              label="Opponent 1"
              value={opponentName}
              onChangeText={(t) => { setOpponentName(t); setSelectedOpponent(null); }}
              selectedPlayer={selectedOpponent}
              onSelectPlayer={(p) => { setSelectedOpponent(p); setOpponentName(p.name); }}
              onClear={() => { setOpponentName(""); setSelectedOpponent(null); }}
              placeholder="First opponent name"
              currentPlayerId={playerId}
            />
            <PlayerSearchInput
              label="Opponent 2"
              value={opponent2Name}
              onChangeText={(t) => { setOpponent2Name(t); setSelectedOpponent2(null); }}
              selectedPlayer={selectedOpponent2}
              onSelectPlayer={(p) => { setSelectedOpponent2(p); setOpponent2Name(p.name); }}
              onClear={() => { setOpponent2Name(""); setSelectedOpponent2(null); }}
              placeholder="Second opponent name"
              currentPlayerId={playerId}
            />
          </>
        ) : (
          <>
            <ThemedText style={styles.sectionTitle}>Opponent</ThemedText>
            <Card elevation={1} style={styles.inputCard}>
              <TextInput
                style={styles.textInput}
                placeholder="Opponent's name"
                placeholderTextColor={Colors.dark.disabled}
                value={opponentName}
                onChangeText={setOpponentName}
              />
            </Card>
          </>
        )}

        <ThemedText style={styles.sectionTitle}>Result</ThemedText>
        <View style={styles.resultButtons}>
          <Pressable
            style={[styles.resultButton, didWin === true && styles.resultButtonWinActive]}
            onPress={() => setDidWin(true)}
          >
            <Ionicons
              name="trophy"
              size={24}
              color={didWin === true ? Colors.dark.buttonText : Colors.dark.successNeon}
            />
            <ThemedText
              style={[styles.resultButtonText, didWin === true && styles.resultButtonTextActive]}
            >
              {matchMode === "doubles" ? "My Team Won" : "Won"}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.resultButton, didWin === false && styles.resultButtonLossActive]}
            onPress={() => setDidWin(false)}
          >
            <Ionicons
              name="close-circle"
              size={24}
              color={didWin === false ? Colors.dark.buttonText : Colors.dark.error}
            />
            <ThemedText
              style={[styles.resultButtonText, didWin === false && styles.resultButtonTextActive]}
            >
              {matchMode === "doubles" ? "My Team Lost" : "Lost"}
            </ThemedText>
          </Pressable>
        </View>

        {/* Score Entry (per set — required) */}
        <ThemedText style={styles.sectionTitle}>Score</ThemedText>
        <Card elevation={1} style={styles.setsCard}>
          <View style={styles.setsHeader}>
            <ThemedText style={[styles.setsColLabel, { flex: 1 }]}>Set</ThemedText>
            <ThemedText style={[styles.setsColLabel, { width: 64, textAlign: "center" }]}>
              {matchMode === "doubles" ? "Us" : "Me"}
            </ThemedText>
            <ThemedText style={[styles.setsColLabel, { width: 64, textAlign: "center" }]}>
              Opp
            </ThemedText>
            <View style={{ width: 28 }} />
          </View>
          {sets.map((s, i) => (
            <View key={i} style={styles.setRow}>
              <ThemedText style={[styles.setLabel, { flex: 1 }]}>Set {i + 1}</ThemedText>
              <TextInput
                style={[styles.setInput, { width: 64 }]}
                value={s.p}
                onChangeText={(v) => updateSet(i, "p", v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={Colors.dark.disabled}
                textAlign="center"
              />
              <TextInput
                style={[styles.setInput, { width: 64 }]}
                value={s.o}
                onChangeText={(v) => updateSet(i, "o", v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={Colors.dark.disabled}
                textAlign="center"
              />
              <Pressable
                onPress={() => removeSet(i)}
                hitSlop={8}
                style={[styles.removeSetBtn, sets.length === 1 && { opacity: 0.3 }]}
                disabled={sets.length === 1}
              >
                <Feather name="minus-circle" size={18} color={Colors.dark.disabled} />
              </Pressable>
            </View>
          ))}
          {sets.length < 5 ? (
            <Pressable style={styles.addSetBtn} onPress={addSet}>
              <Feather name="plus" size={15} color={Colors.dark.primary} />
              <ThemedText style={styles.addSetText}>Add Set</ThemedText>
            </Pressable>
          ) : null}
        </Card>

        <ThemedText style={styles.sectionTitle}>Match Category</ThemedText>
        <View style={styles.chipRow}>
          {(["friendly", "ladder", "tournament"] as MatchType[]).map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, matchType === type && styles.chipActive]}
              onPress={() => setMatchType(type)}
            >
              <ThemedText
                style={[styles.chipText, matchType === type && styles.chipTextActive]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ThemedText style={styles.sectionTitle}>Verification</ThemedText>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, verification === "self_reported" && styles.chipActive]}
            onPress={() => setVerification("self_reported")}
          >
            <Feather
              name="user"
              size={16}
              color={verification === "self_reported" ? Colors.dark.buttonText : Colors.dark.text}
            />
            <ThemedText
              style={[styles.chipText, verification === "self_reported" && styles.chipTextActive]}
            >
              Self Reported
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.chip, verification === "coach_verified" && styles.chipActive]}
            onPress={() => setVerification("coach_verified")}
          >
            <Feather
              name="check-circle"
              size={16}
              color={verification === "coach_verified" ? Colors.dark.buttonText : Colors.dark.text}
            />
            <ThemedText
              style={[styles.chipText, verification === "coach_verified" && styles.chipTextActive]}
            >
              Coach Verified
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.trustNote}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.dark.xpCyan} />{" "}
          Score-gebaseerde MMR update — dominante overwinning geeft meer punten. Coach-verified
          heeft hogere betrouwbaarheid.
        </ThemedText>

        <View style={styles.submitSection}>
          {isSubmitting ? (
            <TennisBallSpinner size="large" color={Colors.dark.primary} />
          ) : (
            <Pressable style={styles.recordMatchBtn} onPress={handleSubmit}>
              <ThemedText style={styles.recordMatchBtnText}>
                {matchMode === "doubles" ? "Record Doubles Match" : "Record Match"}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const searchStyles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: Spacing.md,
  },
  flex: { flex: 1 },
  input: {
    flex: 1,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.dark.text,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  dropItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  dropText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  modeBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  modeBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  modeBtnTextActive: {
    color: Colors.dark.buttonText,
  },
  inputCard: {
    padding: 0,
  },
  textInput: {
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
  },
  resultButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  resultButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  resultButtonWinActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  resultButtonLossActive: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  resultButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  resultButtonTextActive: {
    color: Colors.dark.buttonText,
  },
  setsCard: {
    padding: Spacing.md,
  },
  setsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  setsColLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.disabled,
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  setLabel: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  setInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    paddingVertical: 8,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 4,
  },
  removeSetBtn: {
    padding: 4,
    marginLeft: 4,
  },
  addSetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 6,
  },
  addSetText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.full,
  },
  chipActive: {
    backgroundColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  chipTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
  },
  trustNote: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
  submitSection: {
    marginTop: Spacing.xl,
  },
  // Result screen
  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  resultWin: {
    backgroundColor: Colors.dark.primary,
  },
  resultLoss: {
    backgroundColor: Colors.dark.error,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  explanationCard: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  explanationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  explanationText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
    fontWeight: "500",
  },
  resultCard: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  resultDivider: {
    height: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  resultLabel: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  resultValue: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  gainText: {
    color: Colors.dark.successNeon,
  },
  lossText: {
    color: Colors.dark.error,
  },
  promotedText: {
    color: Colors.dark.gold,
    fontSize: 14,
  },
  demotedText: {
    color: Colors.dark.error,
    fontSize: 14,
  },
  warningCard: {
    width: "100%",
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  warningItem: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.7,
    marginLeft: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  resultActions: {
    width: "100%",
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  backLink: {
    alignItems: "center",
    padding: Spacing.md,
  },
  backLinkText: {
    fontSize: 14,
    color: Colors.dark.xpCyan,
  },
  recordAnotherBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 8,
  },
  recordAnotherBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  recordMatchBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  recordMatchBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
