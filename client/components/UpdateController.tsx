import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Updates from "expo-updates";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface UpdateControllerProps {
  children: React.ReactNode;
}

const MAX_RETRY_ATTEMPTS = 3;

export function UpdateController({ children }: UpdateControllerProps) {
  const [showUpdateScreen, setShowUpdateScreen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showContinueOption, setShowContinueOption] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (__DEV__ || Platform.OS === "web") {
      return;
    }

    checkForUpdates();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      console.log("[UpdateController] Checking for updates...");
      console.log("[UpdateController] Updates.isEnabled:", Updates.isEnabled);
      console.log("[UpdateController] Updates.channel:", Updates.channel);
      console.log("[UpdateController] Updates.runtimeVersion:", Updates.runtimeVersion);
      console.log("[UpdateController] Updates.updateId:", Updates.updateId);
      
      const update = await Updates.checkForUpdateAsync();
      console.log("[UpdateController] Check result:", JSON.stringify(update));
      
      if (update.isAvailable) {
        console.log("[UpdateController] Update available! Showing update screen...");
        setShowUpdateScreen(true);
        downloadUpdate();
      } else {
        console.log("[UpdateController] No update available");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log("[UpdateController] Error checking for updates:", errorMessage);
    }
  };

  const downloadUpdate = async () => {
    try {
      setIsDownloading(true);
      setUpdateError(null);

      const listener = Updates.addListener((event) => {
        if (event.type === Updates.UpdateEventType.UPDATE_AVAILABLE) {
          setIsUpdateReady(true);
          setIsDownloading(false);
        } else if (event.type === Updates.UpdateEventType.ERROR) {
          const eventError = (event as { error?: Error }).error;
          console.error("[UpdateController] Listener error:", eventError?.message || "Unknown error");
          handleDownloadError(eventError?.message || "Update download failed");
        }
      });

      let progress = 0;
      progressIntervalRef.current = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 95) {
          progress = 95;
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }
        setDownloadProgress(progress);
      }, 200);

      console.log("[UpdateController] Starting fetchUpdateAsync...");
      const result = await Updates.fetchUpdateAsync();
      console.log("[UpdateController] fetchUpdateAsync result:", JSON.stringify(result));

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setDownloadProgress(100);

      if (result.isNew) {
        setIsUpdateReady(true);
        setIsDownloading(false);
        console.log("[UpdateController] Update downloaded, auto-reloading...");
        await Updates.reloadAsync();
      }

      listener.remove();
    } catch (error: unknown) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string }).code;
      
      console.error("[UpdateController] Download error:", {
        message: errorMessage,
        code: errorCode,
        fullError: error,
      });
      
      handleDownloadError(errorMessage);
    }
  };

  const handleDownloadError = (errorMessage: string) => {
    const newRetryCount = retryCount + 1;
    setRetryCount(newRetryCount);
    setIsDownloading(false);
    
    if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
      setUpdateError(`Download failed after ${MAX_RETRY_ATTEMPTS} attempts. You can continue without the update.`);
      setShowContinueOption(true);
    } else {
      setUpdateError(`Download failed (attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS}). Check your network connection.`);
    }
    
    console.log(`[UpdateController] Retry count: ${newRetryCount}/${MAX_RETRY_ATTEMPTS}`);
  };

  const retryDownload = () => {
    setDownloadProgress(0);
    downloadUpdate();
  };

  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[UpdateController] Error applying update:", errorMessage);
    }
  };

  const skipUpdate = () => {
    console.log("[UpdateController] User skipped update");
    setShowUpdateScreen(false);
  };

  const continueWithoutUpdate = () => {
    console.log("[UpdateController] User continuing without update after failures");
    setShowUpdateScreen(false);
  };

  if (!showUpdateScreen) {
    return <>{children}</>;
  }

  return (
    <LinearGradient
      colors={[Colors.dark.background, "#0a1a2e", Colors.dark.background]}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.accent]}
            style={styles.iconGradient}
          >
            <Feather name="download-cloud" size={48} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={styles.title}>
          {isDownloading
            ? "Downloading Update"
            : isUpdateReady
              ? "Update Ready!"
              : updateError
                ? "Update Failed"
                : "New Update Available"}
        </Text>

        <Text style={styles.subtitle}>
          {isDownloading
            ? "Please wait while we download the latest version..."
            : isUpdateReady
              ? "Tap the button below to apply the update"
              : updateError
                ? "There was a problem downloading the update"
                : "A new version of Glow Up Sports is available"}
        </Text>

        {(isDownloading || isUpdateReady) && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.progressFill,
                  { width: `${Math.min(downloadProgress, 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(downloadProgress)}%
            </Text>
          </View>
        )}

        {updateError ? <Text style={styles.errorText}>{updateError}</Text> : null}

        {isDownloading ? (
          <ActivityIndicator
            size="large"
            color={Colors.dark.primary}
            style={styles.loader}
          />
        ) : null}

        {isUpdateReady ? (
          <Pressable style={styles.applyButton} onPress={applyUpdate}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Feather
                name="refresh-cw"
                size={20}
                color="#fff"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>Restart App</Text>
            </LinearGradient>
          </Pressable>
        ) : null}

        {!isDownloading && !isUpdateReady && !updateError ? (
          <View style={styles.buttonRow}>
            <Pressable style={styles.skipButton} onPress={skipUpdate}>
              <Text style={styles.skipButtonText}>Later</Text>
            </Pressable>
            <Pressable style={styles.downloadButton} onPress={downloadUpdate}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Feather
                  name="download"
                  size={20}
                  color="#fff"
                  style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>Download Now</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {updateError && !showContinueOption ? (
          <View style={styles.errorButtonRow}>
            <Pressable style={styles.skipButton} onPress={skipUpdate}>
              <Text style={styles.skipButtonText}>Later</Text>
            </Pressable>
            <Pressable style={styles.retryButtonAlt} onPress={retryDownload}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Feather
                  name="refresh-cw"
                  size={20}
                  color="#fff"
                  style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>Try Again</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {showContinueOption ? (
          <View style={styles.continueContainer}>
            <Pressable style={styles.continueButton} onPress={continueWithoutUpdate}>
              <LinearGradient
                colors={["#444", "#333"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Feather
                  name="arrow-right"
                  size={20}
                  color="#fff"
                  style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>Continue Without Update</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.retryButton} onPress={retryDownload}>
              <Text style={styles.retryButtonText}>Try Again Anyway</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Feather name="zap" size={16} color={Colors.dark.primary} />
        <Text style={styles.footerText}>Glow Up Sports</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    maxWidth: 400,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  progressContainer: {
    width: "100%",
    marginBottom: Spacing.xl,
  },
  progressBar: {
    height: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  progressText: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.primary,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  loader: {
    marginTop: Spacing.lg,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  errorButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  applyButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  downloadButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  buttonIcon: {
    marginRight: Spacing.sm,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  skipButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  retryButtonAlt: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  retryButtonText: {
    fontSize: 14,
    color: Colors.dark.primary,
  },
  continueContainer: {
    alignItems: "center",
  },
  continueButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  footer: {
    position: "absolute",
    bottom: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
});
