import React, { useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { usePlayer } from "@/player/context/PlayerContext";

type MatchType = "friendly" | "ladder" | "tournament";
type Verification = "self_reported" | "coach_verified";

interface MatchResult {
  success: boolean;
  playerId: string;
  previousMmr: number;
  newMmr: number;
  mmrDelta: number;
  previousRank: number;
  newRank: number;
  promoted: boolean;
  demoted: boolean;
  blockedByGates: string[];
  warnings: string[];
}

export default function RecordAdultMatchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { playerId, isLoading: playerLoading } = usePlayer();

  const [opponentName, setOpponentName] = useState("");
  const [didWin, setDidWin] = useState<boolean | null>(null);
  const [setScore, setSetScore] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("friendly");
  const [verification, setVerification] = useState<Verification>("self_reported");
  const [showResult, setShowResult] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recordMatchMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      opponentId: string;
      didWin: boolean;
      gamesDiff: number;
      setScore: string;
      matchType: string;
      verification: string;
    }) => {
      const res = await apiRequest("POST", "/api/adult-glow/match", data);
      return res.json();
    },
    onSuccess: (result: MatchResult) => {
      setMatchResult(result);
      setShowResult(true);
      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: [`/api/adult-glow/player/${playerId}/full-profile`] });
    },
    onError: (error) => {
      setIsSubmitting(false);
      Alert.alert("Error", "Failed to record match. Please try again.");
      console.error("Match recording error:", error);
    },
  });

  const parseGamesDiff = (score: string): number => {
    const sets = score.split(",").map((s) => s.trim());
    let totalDiff = 0;
    for (const set of sets) {
      const [p1, p2] = set.split("-").map((s) => parseInt(s.trim()) || 0);
      totalDiff += p1 - p2;
    }
    return didWin ? Math.abs(totalDiff) : -Math.abs(totalDiff);
  };

  const handleSubmit = async () => {
    if (!playerId) {
      Alert.alert("Error", "You must be logged in to record a match.");
      return;
    }
    if (!opponentName.trim()) {
      Alert.alert("Missing Information", "Please enter the opponent's name.");
      return;
    }
    if (didWin === null) {
      Alert.alert("Missing Information", "Please select if you won or lost.");
      return;
    }

    setIsSubmitting(true);

    try {
      const opponentRes = await apiRequest("POST", "/api/adult-glow/find-or-create-opponent", {
        name: opponentName.trim(),
      });
      const opponentData = await opponentRes.json();
      
      if (!opponentData.opponent?.id) {
        Alert.alert("Error", "Could not find or create opponent.");
        setIsSubmitting(false);
        return;
      }

      recordMatchMutation.mutate({
        playerId,
        opponentId: opponentData.opponent.id,
        didWin,
        gamesDiff: parseGamesDiff(setScore),
        setScore: setScore || "Unknown",
        matchType,
        verification,
      });
    } catch (error) {
      setIsSubmitting(false);
      Alert.alert("Error", "Failed to process opponent. Please try again.");
      console.error("Opponent lookup error:", error);
    }
  };

  const handleNewMatch = () => {
    setShowResult(false);
    setMatchResult(null);
    setOpponentName("");
    setDidWin(null);
    setSetScore("");
    setMatchType("friendly");
    setVerification("self_reported");
  };

  if (playerLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
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

  if (showResult && matchResult) {
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
              matchResult.mmrDelta >= 0 ? styles.resultWin : styles.resultLoss,
            ]}
          >
            <Ionicons
              name={matchResult.mmrDelta >= 0 ? "trending-up" : "trending-down"}
              size={48}
              color={Colors.dark.buttonText}
            />
          </View>

          <ThemedText style={styles.resultTitle}>Match Recorded!</ThemedText>

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
                {matchResult.promoted && (
                  <ThemedText style={styles.promotedText}> (Promoted!)</ThemedText>
                )}
                {matchResult.demoted && (
                  <ThemedText style={styles.demotedText}> (Demoted)</ThemedText>
                )}
              </ThemedText>
            </View>
          </Card>

          {matchResult.blockedByGates && matchResult.blockedByGates.length > 0 && (
            <Card elevation={1} style={styles.warningCard}>
              <View style={styles.warningHeader}>
                <Ionicons name="warning-outline" size={20} color={Colors.dark.orange} />
                <ThemedText style={styles.warningTitle}>Promotion Blocked</ThemedText>
              </View>
              <ThemedText style={styles.warningText}>
                Complete these skill gates to unlock promotion:
              </ThemedText>
              {matchResult.blockedByGates.map((gate, i) => (
                <ThemedText key={i} style={styles.warningItem}>
                  {gate}
                </ThemedText>
              ))}
            </Card>
          )}

          {matchResult.warnings && matchResult.warnings.length > 0 && (
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
          )}

          <View style={styles.resultActions}>
            <Button title="Record Another Match" onPress={handleNewMatch} />
            <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
              <ThemedText style={styles.backLinkText}>Back to Glow Rank</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
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
              style={[
                styles.resultButtonText,
                didWin === true && styles.resultButtonTextActive,
              ]}
            >
              Won
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
              style={[
                styles.resultButtonText,
                didWin === false && styles.resultButtonTextActive,
              ]}
            >
              Lost
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.sectionTitle}>Score (Optional)</ThemedText>
        <Card elevation={1} style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., 6-4, 6-3"
            placeholderTextColor={Colors.dark.disabled}
            value={setScore}
            onChangeText={setSetScore}
          />
        </Card>

        <ThemedText style={styles.sectionTitle}>Match Type</ThemedText>
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
              color={
                verification === "self_reported"
                  ? Colors.dark.buttonText
                  : Colors.dark.text
              }
            />
            <ThemedText
              style={[
                styles.chipText,
                verification === "self_reported" && styles.chipTextActive,
              ]}
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
              color={
                verification === "coach_verified"
                  ? Colors.dark.buttonText
                  : Colors.dark.text
              }
            />
            <ThemedText
              style={[
                styles.chipText,
                verification === "coach_verified" && styles.chipTextActive,
              ]}
            >
              Coach Verified
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.trustNote}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.dark.xpCyan} />{" "}
          Coach-verified matches have higher trust factor and affect MMR more.
        </ThemedText>

        <View style={styles.submitSection}>
          {isSubmitting || recordMatchMutation.isPending ? (
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          ) : (
            <Button title="Record Match" onPress={handleSubmit} disabled={!playerId} />
          )}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

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
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  resultButtonTextActive: {
    color: Colors.dark.buttonText,
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
    marginBottom: Spacing.xl,
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
  warningText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.8,
    marginBottom: Spacing.sm,
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
});
