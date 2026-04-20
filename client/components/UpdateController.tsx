import logger from "@/lib/logger";
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
import { Colors, Spacing, BorderRadius, GlowColors, TextColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface UpdateControllerProps {
  children: React.ReactNode;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

export function UpdateController({ children }: UpdateControllerProps) {
  const [showUpdateScreen, setShowUpdateScreen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showContinueOption, setShowContinueOption] = useState(false);
  const [cdnStatus, setCdnStatus] = useState<string | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const testCdnConnectivity = async (): Promise<boolean> => {
    try {
      logger.log("[UpdateController] Testing CDN connectivity...");
      const testUrl = "https://u.expo.dev/ce3ccb00-0553-4abc-a038-1a93b7483738";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(testUrl, { 
        method: 'HEAD',
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      logger.log("[UpdateController] CDN test response:", response.status);
      setCdnStatus(`CDN: ${response.status}`);
      return response.ok || response.status === 404;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.log("[UpdateController] CDN test failed:", errorMsg);
      setCdnStatus(`CDN: ${errorMsg}`);
      return false;
    }
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
      logger.log("[UpdateController] Checking for updates...");
      logger.log("[UpdateController] Updates.isEnabled:", Updates.isEnabled);
      logger.log("[UpdateController] Updates.channel:", Updates.channel);
      logger.log("[UpdateController] Updates.runtimeVersion:", Updates.runtimeVersion);
      logger.log("[UpdateController] Updates.updateId:", Updates.updateId);
      
      const update = await Updates.checkForUpdateAsync();
      logger.log("[UpdateController] Check result:", JSON.stringify(update));
      
      if (update.isAvailable) {
        logger.log("[UpdateController] Update available! Showing update screen...");
        setShowUpdateScreen(true);
        downloadUpdate();
      } else {
        logger.log("[UpdateController] No update available");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.log("[UpdateController] Error checking for updates:", errorMessage);
    }
  };

  const downloadUpdate = async () => {
    try {
      setIsDownloading(true);
      setUpdateError(null);
      setTechnicalError(null);

      await testCdnConnectivity();

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

      logger.log("[UpdateController] Starting fetchUpdateAsync...");
      const result = await Updates.fetchUpdateAsync();
      logger.log("[UpdateController] fetchUpdateAsync result:", JSON.stringify(result));

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setDownloadProgress(100);

      if (result.isNew) {
        setIsUpdateReady(true);
        setIsDownloading(false);
        logger.log("[UpdateController] Update downloaded, auto-reloading...");
        await Updates.reloadAsync();
      }
    } catch (error: unknown) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string }).code || "UNKNOWN";
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error("[UpdateController] Download error:", {
        message: errorMessage,
        code: errorCode,
        stack: errorStack,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      
      handleDownloadError(errorMessage, errorCode);
    }
  };

  const handleDownloadError = (errorMessage: string, errorCode: string) => {
    const newRetryCount = retryCount + 1;
    setRetryCount(newRetryCount);
    setIsDownloading(false);
    setTechnicalError(`[${errorCode}] ${errorMessage}`);
    
    if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
      setUpdateError(`Download failed after ${MAX_RETRY_ATTEMPTS} attempts.`);
      setShowContinueOption(true);
    } else {
      setUpdateError(`Download failed (attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      delay(RETRY_DELAY_MS).then(() => {
        setDownloadProgress(0);
        downloadUpdate();
      });
    }
    
    logger.log(`[UpdateController] Retry count: ${newRetryCount}/${MAX_RETRY_ATTEMPTS}, error: ${errorCode} - ${errorMessage}`);
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
    logger.log("[UpdateController] User skipped update");
    setShowUpdateScreen(false);
  };

  const continueWithoutUpdate = () => {
    logger.log("[UpdateController] User continuing without update after failures");
    setShowUpdateScreen(false);
  };

  if (!showUpdateScreen) {
    return <>{children}</>;
  }

  return (
    <LinearGradient
      colors={["rgba(255, 255, 255, 0.06)", "#0a1a2e", "rgba(255, 255, 255, 0.06)"]}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.accent]}
            style={styles.iconGradient}
          >
            <Feather name="download-cloud" size={48} color={TextColors.primary} />
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
        
        {technicalError ? (
          <Text style={styles.technicalErrorText}>{technicalError}</Text>
        ) : null}
        
        {cdnStatus ? (
          <Text style={styles.cdnStatusText}>{cdnStatus}</Text>
        ) : null}

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
                color={TextColors.primary}
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
                  color={TextColors.primary}
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
                  color={TextColors.primary}
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
                colors={["rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.06)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Feather
                  name="arrow-right"
                  size={20}
                  color={TextColors.primary}
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

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  technicalErrorText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cdnStatusText: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
    opacity: 0.7,
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
    color: TextColors.primary,
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
}));
