import React, { useState, useEffect } from "react";
import { reloadAppAsync } from "expo";
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  Text,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Fonts, Colors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const { theme } = useTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [userComment, setUserComment] = useState("");
  const [errorId] = useState(() => generateErrorId());

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error("Failed to restart app:", restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  const collectDiagnostics = () => {
    return {
      errorId,
      message: error.message,
      stack: error.stack,
      severity: "error",
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || "unknown",
      deviceInfo: Device.modelName || "unknown",
      context: {
        platform: Platform.OS,
        osVersion: Platform.Version,
        deviceBrand: Device.brand,
        deviceModel: Device.modelName,
        isDevice: Device.isDevice,
        expoVersion: Constants.expoConfig?.sdkVersion,
        appVersion: Constants.expoConfig?.version,
        timestamp: new Date().toISOString(),
      },
      userComment: userComment.trim() || undefined,
    };
  };

  const handleSendDiagnostics = async () => {
    if (isSending || isSent) return;

    setIsSending(true);
    try {
      const diagnostics = collectDiagnostics();
      const apiUrl = getApiUrl();
      const token = getAuthToken();

      const response = await fetch(new URL("/api/diagnostics/report", apiUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(diagnostics),
      });

      if (response.ok) {
        setIsSent(true);
      } else {
        console.error("Failed to send diagnostics:", await response.text());
      }
    } catch (sendError) {
      console.error("Error sending diagnostics:", sendError);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {__DEV__ ? (
        <Pressable
          onPress={() => setIsModalVisible(true)}
          style={({ pressed }) => [
            styles.topButton,
            {
              backgroundColor: Colors.dark.backgroundDefault,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons name="alert-circle-outline" size={20} color={Colors.dark.text} />
        </Pressable>
      ) : null}

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning-outline" size={64} color={Colors.dark.orange} />
        </View>
        <ThemedText type="h1" style={styles.title}>
          Game Over!
        </ThemedText>

        <ThemedText type="body" style={styles.message}>
          Glow Up Sports hit an unexpected error. Our team can fix this faster if you send diagnostics.
        </ThemedText>

        {!isSent ? (
          <View style={styles.commentContainer}>
            <TextInput
              style={styles.commentInput}
              placeholder="What were you doing? (optional)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={userComment}
              onChangeText={setUserComment}
              multiline
              maxLength={200}
            />
          </View>
        ) : null}

        {!isSent ? (
          <Pressable
            onPress={handleSendDiagnostics}
            disabled={isSending}
            style={({ pressed }) => [
              styles.button,
              styles.sendButton,
              {
                backgroundColor: Colors.dark.accentInfo,
                opacity: isSending ? 0.6 : pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="send-outline" size={20} color={Colors.dark.buttonText} />
                <ThemedText
                  type="body"
                  style={[styles.buttonText, { color: Colors.dark.buttonText }]}
                >
                  Send Diagnostics
                </ThemedText>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.sentConfirmation}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
            <ThemedText type="body" style={styles.sentText}>
              Diagnostics sent. Thank you!
            </ThemedText>
          </View>
        )}

        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: Colors.dark.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Ionicons name="refresh-outline" size={20} color={Colors.dark.buttonText} />
          <ThemedText
            type="body"
            style={[styles.buttonText, { color: Colors.dark.buttonText }]}
          >
            Restart Match
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={resetError}
          style={({ pressed }) => [
            styles.dismissButton,
            { opacity: pressed ? 0.6 : 0.7 },
          ]}
        >
          <ThemedText type="caption" style={styles.dismissText}>
            Dismiss
          </ThemedText>
        </Pressable>
      </View>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <ThemedView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <ThemedText type="h2" style={styles.modalTitle}>
                  Error Details
                </ThemedText>
                <Pressable
                  onPress={() => setIsModalVisible(false)}
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Ionicons name="close-outline" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator
              >
                <View
                  style={[
                    styles.errorContainer,
                    { backgroundColor: Colors.dark.backgroundDefault },
                  ]}
                >
                  <Text
                    style={[
                      styles.errorText,
                      {
                        color: Colors.dark.text,
                        fontFamily: Fonts?.mono || "monospace",
                      },
                    ]}
                    selectable
                  >
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </ThemedView>
          </View>
        </Modal>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    width: "100%",
    maxWidth: 600,
  },
  iconContainer: {
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    color: Colors.dark.text,
  },
  message: {
    textAlign: "center",
    opacity: 0.7,
    color: Colors.dark.text,
  },
  topButton: {
    position: "absolute",
    top: Spacing["2xl"] + Spacing.lg,
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  commentContainer: {
    width: "100%",
    paddingHorizontal: Spacing.md,
  },
  commentInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing["2xl"],
    minWidth: 200,
    justifyContent: "center",
  },
  sendButton: {
    marginTop: Spacing.sm,
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  sentConfirmation: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  sentText: {
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  dismissButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  dismissText: {
    color: Colors.dark.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  modalTitle: {
    fontWeight: "600",
    color: Colors.dark.text,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
  },
  errorContainer: {
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    padding: Spacing.lg,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    width: "100%",
  },
});
