import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { PlayerV2StackParamList } from "@/navigation/PlayerV2Navigator";

type SeasonWrapUpRouteProp = RouteProp<PlayerV2StackParamList, "SeasonWrapUp">;

export default function SeasonWrapUpScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<SeasonWrapUpRouteProp>();
  const {
    seasonName,
    sessionsAttended,
    xpEarned,
    levelLabel,
    levelFrom,
    levelTo,
    enrollmentStarted,
  } = route.params;

  useEffect(() => {
    if (Platform.OS !== "web") {
      StatusBar.setBarStyle("light-content", true);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const hasLevelProgression = !!levelFrom && !!levelTo && levelFrom !== levelTo;

  const formattedStartDate = React.useMemo(() => {
    if (!enrollmentStarted) return "";
    const d = new Date(enrollmentStarted);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [enrollmentStarted]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0A1628", "#0F2347", "#0A1628"]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl * 2 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.goBack();
              }}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.trophySection}>
          <LinearGradient
            colors={["#FFD700", "#FF9500"]}
            style={styles.trophyCircle}
          >
            <Ionicons name="trophy" size={48} color="#0A1628" />
          </LinearGradient>

          <Text style={styles.wrapLabel}>Season Complete</Text>
          <Text style={styles.seasonName}>{seasonName}</Text>
          {!!formattedStartDate ? (
            <Text style={styles.dateRange}>Since {formattedStartDate}</Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.statsGrid}>
          <StatCard
            icon="calendar"
            iconColor="#00E5FF"
            value={String(sessionsAttended)}
            label={sessionsAttended === 1 ? "Session Attended" : "Sessions Attended"}
          />
          <StatCard
            icon="flash"
            iconColor="#FFD700"
            value={`+${xpEarned}`}
            label="XP Earned"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(380).duration(600)} style={styles.levelCard}>
          <View style={styles.levelCardHeader}>
            <View style={[styles.levelIconCircle, { backgroundColor: "#E040FB20" }]}>
              <Ionicons name="trending-up" size={20} color="#E040FB" />
            </View>
            <Text style={styles.levelCardTitle}>Level Progression</Text>
          </View>

          {hasLevelProgression ? (
            <View style={styles.levelProgression}>
              <View style={styles.levelChip}>
                <Text style={styles.levelChipText}>{levelFrom}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.accentText} style={{ marginHorizontal: Spacing.sm }} />
              <View style={[styles.levelChip, styles.levelChipHighlight]}>
                <Text style={[styles.levelChipText, styles.levelChipTextHighlight]}>{levelTo}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.levelProgression}>
              <View style={[styles.levelChip, styles.levelChipHighlight]}>
                <Text style={[styles.levelChipText, styles.levelChipTextHighlight]}>{levelLabel}</Text>
              </View>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.messageCard}>
          <LinearGradient
            colors={["#00E5FF15", "#E040FB10"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.messageGradient}
          >
            <Text style={styles.messageTitle}>
              {sessionsAttended >= 20
                ? "Outstanding dedication!"
                : sessionsAttended >= 10
                ? "Great consistency this season!"
                : sessionsAttended >= 5
                ? "Solid effort this season!"
                : "Every court hour counts!"}
            </Text>
            <Text style={styles.messageBody}>
              {xpEarned >= 500
                ? "You've put in serious work earning all that XP. Keep pushing into the next season."
                : "Your next season starts now — keep showing up and the XP will follow."}
            </Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={SlideInUp.delay(600).duration(500)}>
          <Pressable
            style={styles.doneButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.goBack();
            }}
          >
            <LinearGradient
              colors={["#00E5FF", "#00B8CC"]}
              style={styles.doneGradient}
            >
              <Text style={styles.doneText}>Keep Glowing</Text>
              <Feather name="arrow-right" size={18} color="#0A1628" style={{ marginLeft: Spacing.xs }} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function StatCard({
  icon,
  iconColor,
  value,
  label,
}: {
  icon: string;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: iconColor + "30" }]}>
      <View style={[styles.statIconCircle, { backgroundColor: iconColor + "20" }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <Text style={[styles.statValue, { color: iconColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  trophySection: {
    alignItems: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  trophyCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  wrapLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  seasonName: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  dateRange: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: "center",
  },
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  levelCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "#E040FB30",
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  levelCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  levelIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  levelCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  levelProgression: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  levelChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  levelChipHighlight: {
    backgroundColor: "#E040FB20",
    borderColor: "#E040FB60",
  },
  levelChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  levelChipTextHighlight: {
    color: "#E040FB",
  },
  messageCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.15)",
  },
  messageGradient: {
    padding: Spacing.md,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  messageBody: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  doneButton: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginHorizontal: Spacing.md,
  },
  doneGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md + 2,
  },
  doneText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A1628",
  },
});
