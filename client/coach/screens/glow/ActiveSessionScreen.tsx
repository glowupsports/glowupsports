import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withTiming 
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, apiFetch } from "@/lib/query-client";

interface DrillBlock {
  id: string;
  name: string;
  durationMinutes: number;
  coachInstructions: string;
  playerInstructions: string;
  skillTags: string[];
  equipment: string[];
  successCriteria: string;
  sequence: number;
}

interface SessionPlan {
  id: string;
  templateName: string;
  blocks: DrillBlock[];
  totalDuration: number;
}

type BlockStatus = "pending" | "in_progress" | "completed" | "skipped";

export default function ActiveSessionScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();

  const { sessionId, planId } = route.params || {};

  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockStatus>>({});
  const [sessionTimer, setSessionTimer] = useState(0);
  const [blockTimer, setBlockTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progressWidth = useSharedValue(0);

  const { data: sessionPlan } = useQuery<SessionPlan>({
    queryKey: ["/api/sessions", sessionId, "plan"],
    queryFn: async () => {
      const res = await apiFetch(`/api/sessions/${sessionId}/plan`);
      if (!res.ok) throw new Error("Failed to fetch plan");
      return res.json();
    },
    enabled: !!sessionId,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (data: { blockIndex: number; status: BlockStatus }) => {
      return apiRequest("PATCH", `/api/sessions/${sessionId}/plan/blocks/${data.blockIndex}`, { status: data.status });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/sessions/${sessionId}/plan/complete`, { 
        coachNotes: `Total duration: ${Math.floor(sessionTimer / 60)} minutes`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions/today"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate("CoachHQ");
    },
  });

  const currentBlock = sessionPlan?.blocks[currentBlockIndex];
  const completedBlocks = Object.values(blockStatuses).filter(s => s === "completed").length;
  const totalBlocks = sessionPlan?.blocks.length || 0;

  useEffect(() => {
    if (sessionPlan?.blocks) {
      const initialStatuses: Record<string, BlockStatus> = {};
      sessionPlan.blocks.forEach((block, index) => {
        initialStatuses[block.id] = index === 0 ? "in_progress" : "pending";
      });
      setBlockStatuses(initialStatuses);
      
      if (sessionPlan.blocks[0]) {
        setBlockTimer(sessionPlan.blocks[0].durationMinutes * 60);
      }
    }
  }, [sessionPlan]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setSessionTimer(prev => prev + 1);
        setBlockTimer(prev => {
          if (prev <= 1) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, isPaused]);

  useEffect(() => {
    if (totalBlocks > 0) {
      const progress = (completedBlocks / totalBlocks) * 100;
      progressWidth.value = withTiming(progress, { duration: 300 });
    }
  }, [completedBlocks, totalBlocks]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartSession = () => {
    setIsRunning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCompleteBlock = useCallback(() => {
    if (!currentBlock || !sessionPlan) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setBlockStatuses(prev => ({
      ...prev,
      [currentBlock.id]: "completed",
    }));

    updateProgressMutation.mutate({ blockIndex: currentBlockIndex, status: "completed" });

    if (currentBlockIndex < sessionPlan.blocks.length - 1) {
      const nextIndex = currentBlockIndex + 1;
      const nextBlock = sessionPlan.blocks[nextIndex];
      
      setCurrentBlockIndex(nextIndex);
      setBlockStatuses(prev => ({
        ...prev,
        [nextBlock.id]: "in_progress",
      }));
      setBlockTimer(nextBlock.durationMinutes * 60);
    } else {
      setIsRunning(false);
      Alert.alert(
        "Session Complete",
        "All blocks have been completed. Would you like to finish the session?",
        [
          { text: "Continue", style: "cancel" },
          { text: "Finish", onPress: () => completeSessionMutation.mutate() },
        ]
      );
    }
  }, [currentBlock, currentBlockIndex, sessionPlan, updateProgressMutation, completeSessionMutation]);

  const handleSkipBlock = useCallback(() => {
    if (!currentBlock || !sessionPlan) return;

    Alert.alert(
      "Skip Block?",
      "Are you sure you want to skip this drill block?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: () => {
            setBlockStatuses(prev => ({
              ...prev,
              [currentBlock.id]: "skipped",
            }));
            updateProgressMutation.mutate({ blockIndex: currentBlockIndex, status: "skipped" });

            if (currentBlockIndex < sessionPlan.blocks.length - 1) {
              const nextIndex = currentBlockIndex + 1;
              const nextBlock = sessionPlan.blocks[nextIndex];
              setCurrentBlockIndex(nextIndex);
              setBlockStatuses(prev => ({
                ...prev,
                [nextBlock.id]: "in_progress",
              }));
              setBlockTimer(nextBlock.durationMinutes * 60);
            }
          },
        },
      ]
    );
  }, [currentBlock, currentBlockIndex, sessionPlan, updateProgressMutation]);

  const handleCaptureEvidence = () => {
    if (!currentBlock) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("EvidenceCapture", { 
      skillTags: currentBlock.skillTags,
      sessionId,
      blockId: currentBlock.id,
    });
  };

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const getStatusColor = (status: BlockStatus) => {
    switch (status) {
      case "completed": return Colors.dark.successNeon;
      case "in_progress": return Colors.dark.primary;
      case "skipped": return Colors.dark.orange;
      default: return Colors.dark.disabled;
    }
  };

  if (!sessionPlan) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ThemedText>Loading session...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.timerHeader, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.sessionTimerRow}>
          <ThemedText style={styles.sessionTimerLabel}>Session Time</ThemedText>
          <ThemedText style={styles.sessionTimerValue}>{formatTime(sessionTimer)}</ThemedText>
        </View>

        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
        </View>
        <ThemedText style={styles.progressText}>
          {completedBlocks} of {totalBlocks} blocks completed
        </ThemedText>

        {currentBlock ? (
          <View style={styles.blockTimerContainer}>
            <ThemedText style={styles.blockTimerLabel}>Block Timer</ThemedText>
            <ThemedText style={[
              styles.blockTimerValue,
              blockTimer < 60 && { color: Colors.dark.error }
            ]}>
              {formatTime(blockTimer)}
            </ThemedText>
          </View>
        ) : null}

        {!isRunning ? (
          <Pressable style={styles.startButton} onPress={handleStartSession}>
            <Ionicons name="play" size={24} color={Colors.dark.text} />
            <ThemedText style={styles.startButtonText}>Start Session</ThemedText>
          </Pressable>
        ) : (
          <Pressable style={styles.pauseButton} onPress={handlePauseResume}>
            <Ionicons name={isPaused ? "play" : "pause"} size={20} color={Colors.dark.text} />
            <ThemedText style={styles.pauseButtonText}>
              {isPaused ? "Resume" : "Pause"}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.blocksContainer}
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <View style={styles.blocksList}>
          {sessionPlan.blocks.map((block, index) => {
            const status = blockStatuses[block.id] || "pending";
            const isCurrent = index === currentBlockIndex;

            return (
              <Card
                key={block.id}
                style={[
                  styles.blockCard,
                  isCurrent ? styles.currentBlockCard : null,
                  status === "completed" ? styles.completedBlockCard : null,
                ].filter(Boolean)}
              >
                <View style={styles.blockHeader}>
                  <View style={[styles.blockIndicator, { backgroundColor: getStatusColor(status) }]}>
                    {status === "completed" ? (
                      <Ionicons name="checkmark" size={14} color={Colors.dark.text} />
                    ) : status === "skipped" ? (
                      <Ionicons name="arrow-forward" size={14} color={Colors.dark.text} />
                    ) : (
                      <ThemedText style={styles.blockNumber}>{index + 1}</ThemedText>
                    )}
                  </View>
                  <View style={styles.blockInfo}>
                    <ThemedText style={styles.blockName}>{block.name}</ThemedText>
                    <ThemedText style={styles.blockDuration}>{block.durationMinutes} min</ThemedText>
                  </View>
                </View>

                {isCurrent && isRunning ? (
                  <>
                    <View style={styles.instructionBox}>
                      <ThemedText style={styles.instructionLabel}>Coach Focus</ThemedText>
                      <ThemedText style={styles.instructionText}>{block.coachInstructions}</ThemedText>
                    </View>

                    <View style={styles.instructionBox}>
                      <ThemedText style={styles.instructionLabel}>Player Cue</ThemedText>
                      <ThemedText style={styles.instructionText}>{block.playerInstructions}</ThemedText>
                    </View>

                    <View style={styles.successBox}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                      <ThemedText style={styles.successText}>{block.successCriteria}</ThemedText>
                    </View>

                    <View style={styles.blockActions}>
                      <Pressable style={styles.evidenceButton} onPress={handleCaptureEvidence}>
                        <Ionicons name="videocam" size={18} color={Colors.dark.xpCyan} />
                        <ThemedText style={styles.evidenceButtonText}>Evidence</ThemedText>
                      </Pressable>

                      <Pressable style={styles.skipButton} onPress={handleSkipBlock}>
                        <Ionicons name="play-skip-forward" size={18} color={Colors.dark.orange} />
                        <ThemedText style={styles.skipButtonText}>Skip</ThemedText>
                      </Pressable>

                      <Pressable style={styles.completeButton} onPress={handleCompleteBlock}>
                        <Ionicons name="checkmark" size={18} color={Colors.dark.text} />
                        <ThemedText style={styles.completeButtonText}>Done</ThemedText>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </Card>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable 
          style={styles.endSessionButton}
          onPress={() => {
            Alert.alert(
              "End Session?",
              "Are you sure you want to end this session early?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "End Session", style: "destructive", onPress: () => completeSessionMutation.mutate() },
              ]
            );
          }}
        >
          <Ionicons name="stop-circle" size={20} color={Colors.dark.error} />
          <ThemedText style={styles.endSessionText}>End Session</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centerContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  timerHeader: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomLeftRadius: BorderRadius["2xl"],
    borderBottomRightRadius: BorderRadius["2xl"],
  },
  sessionTimerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sessionTimerLabel: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  sessionTimerValue: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.dark.text,
    fontVariant: ["tabular-nums"],
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  blockTimerContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  blockTimerLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.xs,
  },
  blockTimerValue: {
    fontSize: 48,
    fontWeight: "700",
    color: Colors.dark.primary,
    fontVariant: ["tabular-nums"],
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    gap: Spacing.sm,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  pauseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  pauseButtonText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  blocksContainer: {
    flex: 1,
  },
  blocksList: {
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  blockCard: {
    padding: Spacing.md,
  },
  currentBlockCard: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  completedBlockCard: {
    opacity: 0.6,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  blockIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  blockNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  blockInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  blockName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  blockDuration: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  instructionBox: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  instructionLabel: {
    fontSize: 10,
    color: Colors.dark.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.successNeon + "15",
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  successText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.successNeon,
    lineHeight: 16,
  },
  blockActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  evidenceButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.xpCyan + "20",
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  evidenceButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  skipButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.orange + "20",
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  skipButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.orange,
  },
  completeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  completeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  bottomBar: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  endSessionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  endSessionText: {
    fontSize: 14,
    color: Colors.dark.error,
  },
});
