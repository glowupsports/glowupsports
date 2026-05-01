import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { Skeleton } from "@/components/SkeletonLoader";
import { Spacing, Colors, BorderRadius, GlowColors } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";

interface DashboardData {
  player: {
    id: string;
    name: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
    profilePhotoUrl?: string | null;
  };
  academy: { id: string; name: string } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
  nextSession?: {
    id: string;
    date: string;
    type: string;
    endTime?: string;
  } | null;
}

export default function ProPlayerHomeDiagnosticScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    staleTime: 60 * 1000,
    refetchOnMount: false,
  });

  const playerName = data?.player?.name ?? user?.displayName ?? user?.username ?? "";
  const level = data?.player?.level ?? 1;
  const xp = data?.player?.xp ?? 0;
  const totalCredits = data?.credits?.total ?? 0;
  const academyName = data?.academy?.name ?? null;

  const XP_PER_LEVEL = 1000;
  const xpProgress = Math.min((xp % XP_PER_LEVEL) / XP_PER_LEVEL, 1);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.headerCard}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            {isLoading && !data ? (
              <Skeleton width={44} height={44} borderRadius={22} />
            ) : (
              <Text style={styles.avatarInitial}>
                {playerName.charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </View>

          <View style={styles.nameBlock}>
            {isLoading && !data ? (
              <>
                <Skeleton width={120} height={16} />
                <Skeleton width={80} height={12} style={{ marginTop: 4 }} />
              </>
            ) : (
              <>
                <Text style={styles.playerName} numberOfLines={1}>
                  {playerName}
                </Text>
                {academyName ? (
                  <Text style={styles.academyName} numberOfLines={1}>
                    {academyName}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          <View style={styles.creditBadge}>
            {isLoading && !data ? (
              <Skeleton width={48} height={22} borderRadius={11} />
            ) : (
              <>
                <Text style={styles.creditValue}>{totalCredits}</Text>
                <Text style={styles.creditLabel}>credits</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.xpRow}>
          <Text style={styles.levelLabel}>Lv {level}</Text>
          <View style={styles.xpBar}>
            {isLoading && !data ? (
              <Skeleton width="100%" height={6} borderRadius={3} />
            ) : (
              <View
                style={[
                  styles.xpFill,
                  { width: `${Math.max(xpProgress * 100, 2)}%` as unknown as `${number}%` },
                ]}
              />
            )}
          </View>
          {!isLoading || data ? (
            <Text style={styles.xpLabel}>{xp} XP</Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => navigation.navigate("LessonBooking")}
            accessibilityLabel="Book session"
          >
            <Ionicons name="add-circle-outline" size={18} color={GlowColors.primary} />
            <Text style={styles.actionBtnText}>Book</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => navigation.navigate("ParentCreditStore")}
            accessibilityLabel="Wallet"
          >
            <Ionicons name="wallet-outline" size={18} color={Colors.dark.textSubtle} />
            <Text style={styles.actionBtnText}>Wallet</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => navigation.navigate("PlayerNotifications")}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={18} color={Colors.dark.textSubtle} />
            <Text style={styles.actionBtnText}>Meldingen</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.diagnosticBox}>
        <Text style={styles.diagnosticLabel}>Diagnostische modus</Text>
        <Text style={styles.diagnosticSub}>
          Task #1498 — cold-start test. Alle andere modules zijn uitgeschakeld.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  headerCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  academyName: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  creditBadge: {
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  creditValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  creditLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GlowColors.primary,
    minWidth: 28,
  },
  xpBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 3,
    overflow: "hidden",
  },
  xpFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
  },
  xpLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    minWidth: 44,
    textAlign: "right",
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSubtle,
  },
  diagnosticBox: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: GlowColors.primary + "44",
    backgroundColor: GlowColors.primary + "0A",
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  diagnosticLabel: {
    color: GlowColors.primary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  diagnosticSub: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
});
