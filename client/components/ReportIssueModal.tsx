import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useUIInteraction } from "@/contexts/UIInteractionContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface ReportIssueModalProps {
  visible: boolean;
  onClose: () => void;
  currentScreen?: string;
}

const RATE_LIMIT_KEY = "ui_report_timestamps";
const MAX_REPORTS_PER_HOUR = 3;

export function ReportIssueModal({ visible, onClose, currentScreen }: ReportIssueModalProps) {
  const insets = useSafeAreaInsets();
  const { lastInteraction } = useUIInteraction();
  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [remainingReports, setRemainingReports] = useState(MAX_REPORTS_PER_HOUR);

  useEffect(() => {
    if (visible) {
      checkRateLimit();
    }
  }, [visible]);

  const checkRateLimit = async () => {
    try {
      const stored = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const timestamps: number[] = stored ? JSON.parse(stored) : [];
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const recentReports = timestamps.filter(t => t > oneHourAgo);
      const remaining = MAX_REPORTS_PER_HOUR - recentReports.length;
      setRemainingReports(remaining);
      setIsRateLimited(remaining <= 0);
    } catch (e) {
      setIsRateLimited(false);
      setRemainingReports(MAX_REPORTS_PER_HOUR);
    }
  };

  const recordReport = async () => {
    try {
      const stored = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const timestamps: number[] = stored ? JSON.parse(stored) : [];
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const recentReports = timestamps.filter(t => t > oneHourAgo);
      recentReports.push(Date.now());
      await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recentReports));
    } catch (e) {
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const reportData = {
        severity: "ui_issue",
        message: description || "UI issue reported by user",
        screen: lastInteraction?.screenName || currentScreen || "Unknown",
        context: {
          type: "ui_issue",
          lastInteraction: lastInteraction ? {
            elementType: lastInteraction.elementType,
            elementLabel: lastInteraction.elementLabel,
            screenName: lastInteraction.screenName,
            timestamp: lastInteraction.timestamp.toISOString(),
          } : null,
          expectedBehavior,
          currentScreen,
        },
        userComment: `Element: ${lastInteraction?.elementLabel || "Unknown"}\nExpected: ${expectedBehavior}\nDescription: ${description}`,
      };
      
      const response = await apiRequest("POST", "/api/diagnostics/ui-issue", reportData);
      return response.json();
    },
    onSuccess: async () => {
      await recordReport();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const msg = "Your report has been submitted. Thank you for helping us improve the app!";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Report Sent", msg);
      }
      setDescription("");
      setExpectedBehavior("");
      onClose();
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to submit report. Please try again.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    },
  });

  const handleSubmit = () => {
    if (isRateLimited) {
      const msg = "You've reached the maximum number of reports for this hour. Please try again later.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Rate Limited", msg);
      }
      return;
    }
    
    if (!description.trim()) {
      const msg = "Please describe the issue you encountered.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Missing Information", msg);
      }
      return;
    }
    
    submitMutation.mutate();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Report an Issue</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {lastInteraction ? (
            <View style={styles.lastActionCard}>
              <View style={styles.lastActionIcon}>
                <Ionicons name="finger-print" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.lastActionInfo}>
                <Text style={styles.lastActionLabel}>Last Action</Text>
                <Text style={styles.lastActionValue}>
                  Tapped "{lastInteraction.elementLabel}" on {lastInteraction.screenName}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.lastActionCard}>
              <View style={styles.lastActionIcon}>
                <Ionicons name="information-circle" size={20} color={Colors.dark.textMuted} />
              </View>
              <View style={styles.lastActionInfo}>
                <Text style={styles.lastActionLabel}>No recent action tracked</Text>
                <Text style={styles.lastActionValue}>
                  Reporting from: {currentScreen || "Unknown screen"}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.label}>What went wrong?</Text>
          <TextInput
            style={styles.textInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue you experienced..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.label}>What did you expect to happen?</Text>
          <TextInput
            style={styles.textInput}
            value={expectedBehavior}
            onChangeText={setExpectedBehavior}
            placeholder="Describe what you expected..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          <Text style={styles.rateInfo}>
            {remainingReports} report{remainingReports !== 1 ? "s" : ""} remaining this hour
          </Text>

          <Pressable
            style={[
              styles.submitButton,
              (isRateLimited || submitMutation.isPending) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isRateLimited || submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.submitButtonText}>
                {isRateLimited ? "Rate Limited" : "Submit Report"}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  lastActionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  lastActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  lastActionInfo: {
    flex: 1,
  },
  lastActionLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  lastActionValue: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  label: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    marginBottom: Spacing.md,
    minHeight: 80,
  },
  rateInfo: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  submitButton: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: Colors.dark.textMuted,
  },
  submitButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
}));
