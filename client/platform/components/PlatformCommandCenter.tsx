import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Updates from "expo-updates";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import {
  useUpdateController,
  type OtaCheckResult,
} from "@/components/UpdateController";

const PLATFORM_PURPLE = "#9B59B6";
const PLATFORM_VIOLET = "#8E44AD";

interface PlatformCommandCenterProps {
  platformName: string;
  totalMrr: number;
  activeAcademies: number;
  totalPlayers: number;
  currency: string;
  onLogoutPress?: () => void;
  onSettingsPress?: () => void;
}

export function PlatformCommandCenter({
  platformName,
  totalMrr,
  activeAcademies,
  totalPlayers,
  currency,
  onLogoutPress,
  onSettingsPress,
}: PlatformCommandCenterProps) {
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: glowOpacity.value,
  }));

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  // Task #1372 — Temporary OTA diagnostics line. Visible only on the
  // Platform Center card (platform owners only). Reads what the running
  // binary actually thinks it is — runtime, channel, and currently
  // installed update id — so we can confirm the dual-runtime OTA fix
  // is actually reaching this device. Remove once 1.3.6 binary is the
  // dominant Android install (tracked in Task #1370).
  const otaRuntime = String(Updates.runtimeVersion ?? "unknown");
  const otaChannel = String(Updates.channel ?? "unknown");
  const otaUpdateId = String(Updates.updateId ?? "embedded");
  const otaUpdateShort =
    otaUpdateId.length > 8 ? otaUpdateId.slice(0, 8) : otaUpdateId;
  const otaDebugLine = `runtime ${otaRuntime} • channel ${otaChannel} • update ${otaUpdateShort}`;

  // Task #1373 — On-demand OTA check. Pulls the controller from context,
  // which is null on web AND on any binary built before the Provider was
  // added. Both cases simply hide the button — no broken affordance, no
  // crash on old installs.
  const updateController = useUpdateController();
  const showOtaTestButton =
    Platform.OS !== "web" && updateController !== null;
  const otaCheckLabel = updateController?.isChecking
    ? "Checking…"
    : "Check for update now";
  const otaStatusLine = updateController
    ? formatOtaStatus(updateController.lastCheckResult)
    : null;

  const handleTriggerCheck = async () => {
    if (!updateController || updateController.isChecking) return;
    await updateController.triggerCheckNow();
    // No further UI work needed: the controller's own state drives the
    // status line below the button, and an "update_ready" result mounts
    // the existing UpdateSheet automatically.
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[
          "#FF000035",
          "#FF7F0030",
          "#FFFF0028",
          "#00FF0022",
          "#0000FF1C",
          "#4B008218",
          "#9400D310",
          "transparent",
        ]}
        style={styles.gradientBg}
      />
      
      <View style={styles.borderContainer}>
        <LinearGradient
          colors={[
            "#FF0000",
            "#FF7F00",
            "#FFFF00",
            "#00FF00",
            "#0000FF",
            "#4B0082",
            "#9400D3",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        />
        
        <View style={styles.innerContainer}>
          <View style={styles.header}>
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <Animated.View style={[styles.logoPulse, pulseStyle]} />
                <Ionicons name="globe" size={28} color={PLATFORM_PURPLE} />
              </View>
              <View>
                <Text style={styles.label}>PLATFORM CENTER</Text>
                <Text style={styles.platformName}>{platformName}</Text>
              </View>
            </View>
            
            <View style={styles.actionButtons}>
              <Pressable style={styles.actionBtn} onPress={onSettingsPress}>
                <Ionicons name="settings-outline" size={20} color={PLATFORM_PURPLE} />
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={onLogoutPress}>
                <Ionicons name="log-out-outline" size={20} color={PLATFORM_PURPLE} />
              </Pressable>
            </View>
          </View>

          <View style={styles.mrrSection}>
            <View style={styles.mrrLabel}>
              <Ionicons name="cash-outline" size={16} color={PLATFORM_PURPLE} />
              <Text style={styles.mrrLabelText}>Monthly Recurring Revenue</Text>
            </View>
            <View style={styles.mrrValueRow}>
              <Text style={styles.currencySymbol}>{currency}</Text>
              <Text style={styles.mrrValue}>{formatCurrency(totalMrr)}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={[styles.statIconBg, { backgroundColor: PLATFORM_PURPLE + "20" }]}>
                <Ionicons name="business" size={18} color={PLATFORM_PURPLE} />
              </View>
              <Text style={styles.statValue}>{activeAcademies}</Text>
              <Text style={styles.statLabel}>Active Academies</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statBox}>
              <View style={[styles.statIconBg, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                <Ionicons name="people" size={18} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.statValue}>{formatCurrency(totalPlayers)}</Text>
              <Text style={styles.statLabel}>Total Players</Text>
            </View>
          </View>

          <Text style={styles.otaDebugLine} numberOfLines={1}>
            {otaDebugLine}
          </Text>

          {showOtaTestButton ? (
            <View style={styles.otaTestBlock}>
              <Pressable
                onPress={handleTriggerCheck}
                disabled={updateController?.isChecking}
                style={({ pressed }) => [
                  styles.otaTestButton,
                  pressed ? styles.otaTestButtonPressed : null,
                  updateController?.isChecking
                    ? styles.otaTestButtonDisabled
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Check for OTA update now"
                accessibilityState={{
                  disabled: !!updateController?.isChecking,
                }}
              >
                <Ionicons
                  name="cloud-download-outline"
                  size={14}
                  color={PLATFORM_PURPLE}
                />
                <Text style={styles.otaTestButtonText}>{otaCheckLabel}</Text>
              </Pressable>
              {otaStatusLine ? (
                <Text style={styles.otaTestStatus} numberOfLines={2}>
                  {otaStatusLine}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatOtaStatus(result: OtaCheckResult): string | null {
  switch (result.status) {
    case "idle":
      return null;
    case "checking":
      return "Checking for update…";
    case "no_update":
      return "Up to date";
    case "update_ready":
      return "Update ready — see banner";
    case "kill_switch":
      return "OTA disabled by server";
    case "disabled":
      return "OTA not available on this build";
    case "error":
      return `Check failed (${result.code ?? "unknown"})`;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  gradientBg: {
    position: "absolute",
    top: -70,
    left: -40,
    right: -40,
    height: 250,
    borderRadius: 125,
  },
  borderContainer: {
    borderRadius: BorderRadius.xl,
    padding: 2,
    overflow: "hidden",
  },
  gradientBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  innerContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl - 2,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: PLATFORM_PURPLE + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PLATFORM_PURPLE + "40",
  },
  logoPulse: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: PLATFORM_PURPLE,
  },
  label: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  platformName: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontSize: 18,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: PLATFORM_PURPLE + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  mrrSection: {
    backgroundColor: PLATFORM_PURPLE + "10",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: PLATFORM_PURPLE + "30",
  },
  mrrLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  mrrLabelText: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontWeight: "600",
  },
  mrrValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  currencySymbol: {
    ...Typography.h3,
    color: PLATFORM_PURPLE,
    marginRight: 6,
  },
  mrrValue: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 36,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
    textAlign: "center",
  },
  divider: {
    width: 1,
    height: 50,
    backgroundColor: Colors.dark.border,
  },
  otaDebugLine: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontFamily: "Courier",
    marginTop: Spacing.md,
    textAlign: "center",
    opacity: 0.6,
  },
  otaTestBlock: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  otaTestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: PLATFORM_PURPLE + "15",
    borderWidth: 1,
    borderColor: PLATFORM_PURPLE + "40",
  },
  otaTestButtonPressed: {
    opacity: 0.7,
  },
  otaTestButtonDisabled: {
    opacity: 0.5,
  },
  otaTestButtonText: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontSize: 11,
    fontWeight: "600",
  },
  otaTestStatus: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
    opacity: 0.7,
  },
});
