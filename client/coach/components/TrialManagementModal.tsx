import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, getPlayerLevelColor, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface Test {
  id: string;
  name: string;
  testType: string;
  description: string | null;
  metrics: Record<string, any> | null;
  result: {
    passed: boolean;
    score?: number;
    notes?: string;
    recordedAt?: string;
  } | null;
  passed: boolean;
}

interface ActiveTrial {
  id: string;
  playerId: string;
  fromLevelId: string;
  toLevelId: string;
  status: string;
  endsAt: string;
  startedAt: string;
  fromLevel: { id: string; displayNamePlayer: string };
  toLevel: { id: string; displayNamePlayer: string };
  tests: Test[];
  daysRemaining: number;
  testsPassed: number;
  testsTotal: number;
  allTestsPassed: boolean;
}

interface TrialManagementModalProps {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
  onComplete: () => void;
}

const TEST_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  COACH_OBSERVED: "eye",
  MATCH_LOG: "trophy",
  AUTO_TRACKED: "analytics",
};

export default function TrialManagementModal({
  visible,
  player,
  onClose,
  onComplete,
}: TrialManagementModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [testNotes, setTestNotes] = useState("");

  const { data: activeTrial, isLoading } = useQuery<ActiveTrial | null>({
    queryKey: ["/api/glow/players", player?.id, "active-trial"],
    queryFn: async () => {
      if (!player) return null;
      const url = new URL(`/api/glow/players/${player.id}/active-trial`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: visible && !!player?.id,
  });

  const recordTestMutation = useMutation({
    mutationFn: async ({ testId, passed }: { testId: string; passed: boolean }) => {
      if (!activeTrial) throw new Error("No active trial");
      const res = await apiRequest("POST", `/api/glow/trials/${activeTrial.id}/tests/${testId}`, {
        passed,
        notes: testNotes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/glow/players", player?.id, "active-trial"] });
      setSelectedTest(null);
      setTestNotes("");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to record test result");
    },
  });

  const completeTrialMutation = useMutation({
    mutationFn: async (passed: boolean) => {
      if (!activeTrial) throw new Error("No active trial");
      const res = await apiRequest("POST", `/api/glow/trials/${activeTrial.id}/complete`, {
        passed,
      });
      return res.json();
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/glow/players", player?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      Alert.alert(
        data.passed ? "Trial Passed!" : "Trial Failed",
        data.passed 
          ? `${player?.name} has been promoted to ${data.newLevel}!` 
          : `${player?.name} will remain at their current level.`,
        [{ text: "OK", onPress: () => { onComplete(); onClose(); } }]
      );
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to complete trial");
    },
  });

  const handleRecordTest = (passed: boolean) => {
    if (!selectedTest) return;
    recordTestMutation.mutate({ testId: selectedTest.id, passed });
  };

  const handleCompleteTrial = (passed: boolean) => {
    Alert.alert(
      passed ? "Confirm Promotion" : "Confirm Trial Failure",
      passed 
        ? `Are you sure ${player?.name} has passed all requirements and should be promoted?`
        : `Are you sure ${player?.name} has not met the requirements and should return to their previous level?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: passed ? "Promote" : "Fail Trial", style: passed ? "default" : "destructive", onPress: () => completeTrialMutation.mutate(passed) }
      ]
    );
  };

  if (!visible || !player) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]} style={StyleSheet.absoluteFill} />
        
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>Trial Management</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.playerCard}>
            {player.ballLevel ? (
              <View style={[styles.levelBadge, { backgroundColor: getPlayerLevelColor(player.ballLevel) }]}>
                <Text style={styles.levelText}>{player.ballLevel}</Text>
              </View>
            ) : null}
            <Text style={styles.playerName}>{player.name}</Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          ) : !activeTrial ? (
            <View style={styles.noTrialContainer}>
              <Ionicons name="checkmark-circle-outline" size={64} color={Colors.dark.disabled} />
              <Text style={styles.noTrialText}>No active trial</Text>
              <Text style={styles.noTrialSubtext}>This player is not currently in a trial period</Text>
            </View>
          ) : (
            <>
              <View style={styles.trialInfoCard}>
                <View style={styles.trialHeader}>
                  <View style={styles.trialLevels}>
                    <View style={[styles.levelPill, { backgroundColor: getPlayerLevelColor(activeTrial.fromLevel.id) + "30" }]}>
                      <Text style={[styles.levelPillText, { color: getPlayerLevelColor(activeTrial.fromLevel.id) }]}>
                        {activeTrial.fromLevel.displayNamePlayer}
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={20} color={Colors.dark.disabled} />
                    <View style={[styles.levelPill, { backgroundColor: getPlayerLevelColor(activeTrial.toLevel.id) + "30" }]}>
                      <Text style={[styles.levelPillText, { color: getPlayerLevelColor(activeTrial.toLevel.id) }]}>
                        {activeTrial.toLevel.displayNamePlayer}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.trialStats}>
                  <View style={styles.trialStat}>
                    <Ionicons name="time-outline" size={20} color={activeTrial.daysRemaining <= 3 ? Colors.dark.error : Colors.dark.orange} />
                    <Text style={styles.trialStatValue}>{activeTrial.daysRemaining}</Text>
                    <Text style={styles.trialStatLabel}>days left</Text>
                  </View>
                  <View style={styles.trialStatDivider} />
                  <View style={styles.trialStat}>
                    <Ionicons name="checkbox-outline" size={20} color={Colors.dark.primary} />
                    <Text style={styles.trialStatValue}>{activeTrial.testsPassed}/{activeTrial.testsTotal}</Text>
                    <Text style={styles.trialStatLabel}>gates passed</Text>
                  </View>
                </View>

                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${(activeTrial.testsPassed / Math.max(activeTrial.testsTotal, 1)) * 100}%`,
                          backgroundColor: activeTrial.allTestsPassed ? Colors.dark.primary : Colors.dark.orange,
                        }
                      ]} 
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Trial Gates</Text>
              <Text style={styles.sectionSubtitle}>Complete all gates to pass the trial</Text>

              <View style={styles.testsList}>
                {activeTrial.tests.map(test => (
                  <Pressable
                    key={test.id}
                    style={[
                      styles.testCard,
                      test.passed && styles.testCardPassed,
                      selectedTest?.id === test.id && styles.testCardSelected,
                    ]}
                    onPress={() => {
                      setSelectedTest(test);
                      setTestNotes(test.result?.notes || "");
                    }}
                  >
                    <View style={styles.testHeader}>
                      <Ionicons 
                        name={test.passed ? "checkmark-circle" : TEST_TYPE_ICONS[test.testType] || "help-circle"} 
                        size={24} 
                        color={test.passed ? Colors.dark.primary : Colors.dark.disabled} 
                      />
                      <View style={styles.testInfo}>
                        <Text style={[styles.testName, test.passed && styles.testNamePassed]}>{test.name}</Text>
                        <Text style={styles.testType}>{test.testType.replace(/_/g, " ")}</Text>
                      </View>
                      <Ionicons 
                        name="chevron-forward" 
                        size={20} 
                        color={Colors.dark.disabled} 
                      />
                    </View>
                    {test.description ? (
                      <Text style={styles.testDescription}>{test.description}</Text>
                    ) : null}
                    {test.result?.recordedAt ? (
                      <Text style={styles.testRecordedAt}>
                        Recorded: {new Date(test.result.recordedAt).toLocaleDateString()}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>

              {selectedTest ? (
                <View style={styles.recordPanel}>
                  <View style={styles.recordHeader}>
                    <Text style={styles.recordTitle}>{selectedTest.name}</Text>
                    <Pressable onPress={() => setSelectedTest(null)}>
                      <Ionicons name="close" size={20} color={Colors.dark.disabled} />
                    </Pressable>
                  </View>
                  
                  {selectedTest.description ? (
                    <Text style={styles.recordDescription}>{selectedTest.description}</Text>
                  ) : null}

                  <TextInput
                    style={styles.notesInput}
                    placeholder="Add notes (optional)..."
                    placeholderTextColor={Colors.dark.disabled}
                    value={testNotes}
                    onChangeText={setTestNotes}
                    multiline
                    numberOfLines={3}
                  />

                  <View style={styles.recordActions}>
                    <Pressable 
                      style={[styles.recordButton, styles.recordButtonFail]}
                      onPress={() => handleRecordTest(false)}
                      disabled={recordTestMutation.isPending}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors.dark.text} />
                      <Text style={styles.recordButtonTextError}>Not Passed</Text>
                    </Pressable>
                    <Pressable 
                      style={[styles.recordButton, styles.recordButtonPass]}
                      onPress={() => handleRecordTest(true)}
                      disabled={recordTestMutation.isPending}
                    >
                      {recordTestMutation.isPending ? (
                        <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
                          <Text style={styles.recordButtonTextPrimary}>Passed</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.completeSection}>
                <Text style={styles.completeSectionTitle}>Complete Trial</Text>
                <Text style={styles.completeSectionSubtitle}>
                  {activeTrial.allTestsPassed 
                    ? "All gates passed! Ready to promote."
                    : `${activeTrial.testsTotal - activeTrial.testsPassed} gate(s) remaining.`}
                </Text>
                <View style={styles.completeActions}>
                  <Pressable 
                    style={[styles.completeButton, styles.completeButtonFail]}
                    onPress={() => handleCompleteTrial(false)}
                    disabled={completeTrialMutation.isPending}
                  >
                    <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
                    <Text style={styles.completeButtonTextError}>Fail Trial</Text>
                  </Pressable>
                  <Pressable 
                    style={[
                      styles.completeButton, 
                      styles.completeButtonPass,
                      !activeTrial.allTestsPassed && styles.completeButtonDisabled,
                    ]}
                    onPress={() => handleCompleteTrial(true)}
                    disabled={completeTrialMutation.isPending || !activeTrial.allTestsPassed}
                  >
                    {completeTrialMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                    ) : (
                      <>
                        <Ionicons name="arrow-up" size={20} color={Colors.dark.buttonText} />
                        <Text style={styles.completeButtonTextPrimary}>Promote</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={{ height: 40 }} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
    textTransform: "uppercase",
  },
  playerName: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  noTrialContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  noTrialText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  noTrialSubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
  trialInfoCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  trialHeader: {
    marginBottom: Spacing.md,
  },
  trialLevels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  levelPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  levelPillText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
  },
  trialStats: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
  },
  trialStat: {
    alignItems: "center",
    gap: 4,
  },
  trialStatValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  trialStatLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
  },
  trialStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressContainer: {
    marginTop: Spacing.md,
  },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.xl,
  },
  sectionSubtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  testsList: {
    gap: Spacing.sm,
  },
  testCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  testCardPassed: {
    borderColor: Colors.dark.primary + "40",
  },
  testCardSelected: {
    borderColor: Colors.dark.xpCyan,
  },
  testHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  testInfo: {
    flex: 1,
  },
  testName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  testNamePassed: {
    color: Colors.dark.primary,
  },
  testType: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    textTransform: "capitalize",
  },
  testDescription: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
    marginLeft: 32,
  },
  testRecordedAt: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.disabled,
    marginTop: Spacing.xs,
    marginLeft: 32,
  },
  recordPanel: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  recordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  recordTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  recordDescription: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  notesInput: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  recordActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  recordButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  recordButtonPass: {
    backgroundColor: GlowColors.primary,
  },
  recordButtonFail: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  recordButtonTextPrimary: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  recordButtonTextError: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  completeSection: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  completeSectionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  completeSectionSubtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    marginBottom: Spacing.md,
  },
  completeActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  completeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  completeButtonPass: {
    backgroundColor: GlowColors.primary,
  },
  completeButtonFail: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  completeButtonDisabled: {
    opacity: 0.5,
  },
  completeButtonTextPrimary: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  completeButtonTextError: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
