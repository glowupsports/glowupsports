import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Linking,
  Platform,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react-native";

import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  Backgrounds,
  TextColors,
  Shadows,
} from "@/constants/theme";
import {
  useAppVersionCheck,
  type AppVersionStatus,
} from "@/hooks/useAppVersionCheck";

const SOFT_DISMISS_PREFIX = "@glow_app_version_soft_dismissed_";
const SOFT_DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

function safeSentry(fn: () => void): void {
  try {
    fn();
  } catch {
    // never let telemetry crash the gate
  }
}

async function readSoftDismissedAt(version: string): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(`${SOFT_DISMISS_PREFIX}${version}`);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function writeSoftDismissed(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${SOFT_DISMISS_PREFIX}${version}`,
      String(Date.now()),
    );
  } catch {
    // best-effort
  }
}

async function openStore(url: string | null): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch (err) {
    safeSentry(() => Sentry.captureException(err));
  }
}

/**
 * Wraps the app and renders the soft-update prompt or the blocking
 * force-update screen on top of `children` based on the server-side
 * version config (Task #1321). On web this is a no-op.
 *
 * Re-checks the version on cold start and on `AppState` background →
 * active transitions, throttled to once per hour per session.
 */
export function ForceUpdateGate() {
  const isWeb = Platform.OS === "web";
  const {
    status,
    latestVersion,
    storeUrl,
    releaseNotes,
    isLoading,
    refetch,
  } = useAppVersionCheck();

  const [softDismissedAt, setSoftDismissedAt] = useState<number | null>(null);
  const [softLoaded, setSoftLoaded] = useState(false);
  const lastForegroundCheckRef = useRef<number>(Date.now());

  // Hydrate the soft-dismissed timestamp from AsyncStorage whenever the
  // server-side `latestVersion` becomes known. Keying on latestVersion
  // means a new release automatically clears the prior dismissal.
  useEffect(() => {
    if (!latestVersion) {
      setSoftLoaded(true);
      return;
    }
    let cancelled = false;
    void readSoftDismissedAt(latestVersion).then((ts) => {
      if (cancelled) return;
      setSoftDismissedAt(ts);
      setSoftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [latestVersion]);

  // Throttled re-check on background → active. After more than 1h in
  // the background we explicitly refetch the server config (so a freshly
  // shipped force-update lands on long-running sessions) and re-read the
  // soft-dismissal timestamp (so a user who dismissed >24h ago is shown
  // the prompt again).
  useEffect(() => {
    if (isWeb) return;
    const handler = (next: AppStateStatus) => {
      if (next !== "active") return;
      const now = Date.now();
      if (now - lastForegroundCheckRef.current < REFRESH_THROTTLE_MS) return;
      lastForegroundCheckRef.current = now;
      safeSentry(() =>
        Sentry.addBreadcrumb({
          category: "app-version",
          level: "info",
          message: "[app-version] foreground >1h · refetching server config",
        }),
      );
      void refetch();
      if (latestVersion) {
        void readSoftDismissedAt(latestVersion).then(setSoftDismissedAt);
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [isWeb, latestVersion, refetch]);

  const handleOpenStore = useCallback(() => {
    safeSentry(() =>
      Sentry.addBreadcrumb({
        category: "app-version",
        level: "info",
        message: `[app-version] open store · status=${status}`,
      }),
    );
    void openStore(storeUrl);
  }, [storeUrl, status]);

  const handleSoftLater = useCallback(async () => {
    if (!latestVersion) return;
    await writeSoftDismissed(latestVersion);
    setSoftDismissedAt(Date.now());
    safeSentry(() =>
      Sentry.addBreadcrumb({
        category: "app-version",
        level: "info",
        message: `[app-version] soft prompt dismissed for 24h · v=${latestVersion}`,
      }),
    );
  }, [latestVersion]);

  // Web / loading-before-soft-storage / endpoint failure → no overlay.
  if (isWeb) return null;
  if (isLoading || !softLoaded) return null;

  if (status === "force") {
    return <ForceUpdateScreen onOpenStore={handleOpenStore} />;
  }

  if (status === "soft") {
    const dismissedRecently =
      softDismissedAt !== null &&
      Date.now() - softDismissedAt < SOFT_DISMISS_WINDOW_MS;
    if (dismissedRecently) return null;
    return (
      <SoftUpdatePrompt
        version={latestVersion || ""}
        releaseNotes={releaseNotes}
        onUpdate={handleOpenStore}
        onLater={handleSoftLater}
      />
    );
  }

  return null;
}

/* -------------------------------------------------------------------- */
/* Soft prompt: dismissible bottom sheet                                */
/* -------------------------------------------------------------------- */

function SoftUpdatePrompt({
  version,
  releaseNotes,
  onUpdate,
  onLater,
}: {
  version: string;
  releaseNotes: string | null;
  onUpdate: () => void;
  onLater: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onLater}
    >
      <View style={styles.softBackdrop}>
        <View
          style={[
            styles.softSheet,
            { paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          <View style={styles.softHandle} />
          <View style={styles.softIconCircle}>
            <Feather
              name="download-cloud"
              size={28}
              color={GlowColors.primary}
            />
          </View>
          <Text style={styles.softTitle}>
            {t("appUpdate.soft.title", { defaultValue: "Update available" })}
          </Text>
          <Text style={styles.softSubtitle}>
            {version
              ? t("appUpdate.soft.subtitleVersion", {
                  defaultValue:
                    "A new version (v{{version}}) is available in the store.",
                  version,
                })
              : t("appUpdate.soft.subtitle", {
                  defaultValue: "A new version is available in the store.",
                })}
          </Text>
          {releaseNotes ? (
            <Text style={styles.softReleaseNotes}>{releaseNotes}</Text>
          ) : null}

          <Pressable
            onPress={onUpdate}
            style={({ pressed }) => [
              styles.softPrimaryButton,
              pressed ? styles.softPrimaryButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("appUpdate.soft.updateNow", {
              defaultValue: "Update now",
            })}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.softPrimaryButtonGradient}
            >
              <Text style={styles.softPrimaryButtonText}>
                {t("appUpdate.soft.updateNow", { defaultValue: "Update now" })}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={onLater}
            style={styles.softSecondaryButton}
            accessibilityRole="button"
            accessibilityLabel={t("appUpdate.soft.later", {
              defaultValue: "Later",
            })}
          >
            <Text style={styles.softSecondaryButtonText}>
              {t("appUpdate.soft.later", { defaultValue: "Later" })}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------- */
/* Force update: full-screen blocking gate                              */
/* -------------------------------------------------------------------- */

function ForceUpdateScreen({ onOpenStore }: { onOpenStore: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
      <View
        style={[
          styles.forceContainer,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <LinearGradient
          colors={[Colors.dark.accentTextSoft || GlowColors.shadow, "transparent"]}
          style={styles.forceGradient}
        />
        <View style={styles.forceContent}>
          <View style={styles.forceIconCircle}>
            <Feather name="refresh-cw" size={56} color={GlowColors.primary} />
          </View>
          <Text style={styles.forceTitle}>
            {t("appUpdate.force.title", {
              defaultValue: "Update required to continue",
            })}
          </Text>
          <Text style={styles.forceBody}>
            {t("appUpdate.force.body", {
              defaultValue:
                "This version of Glow Up Sports is no longer supported. Please update from the store to keep playing.",
            })}
          </Text>
        </View>
        <View style={styles.forceFooter}>
          <Pressable
            onPress={onOpenStore}
            style={({ pressed }) => [
              styles.softPrimaryButton,
              pressed ? styles.softPrimaryButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("appUpdate.force.openStore", {
              defaultValue: "Open store",
            })}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.softPrimaryButtonGradient}
            >
              <Text style={styles.softPrimaryButtonText}>
                {t("appUpdate.force.openStore", { defaultValue: "Open store" })}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Silence unused-import warnings for status type re-exports.
export type { AppVersionStatus };

const styles = StyleSheet.create({
  /* soft */
  softBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  softSheet: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    alignItems: "center",
    ...Shadows.glow,
  },
  softHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.lg,
  },
  softIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  softTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  softSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  softReleaseNotes: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  softPrimaryButton: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  softPrimaryButtonPressed: {
    opacity: 0.9,
  },
  softPrimaryButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  softPrimaryButtonText: {
    color: TextColors.primary,
    fontWeight: "700",
    fontSize: 16,
  },
  softSecondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  softSecondaryButtonText: {
    color: Colors.dark.textMuted,
    fontWeight: "500",
    fontSize: 14,
  },
  /* force */
  forceContainer: {
    flex: 1,
    backgroundColor: Backgrounds.root,
    paddingHorizontal: Spacing.xl,
    justifyContent: "space-between",
  },
  forceGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 360,
  },
  forceContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  forceIconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
    ...Shadows.glow,
  },
  forceTitle: {
    ...Typography.h1,
    fontSize: 26,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  forceBody: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.md,
    lineHeight: 22,
  },
  forceFooter: {
    width: "100%",
    alignItems: "center",
  },
});
