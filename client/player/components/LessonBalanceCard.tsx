import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface CreditsResponse {
  credits: {
    group: number;
    private: number;
    semi_private: number;
    court: number;
  };
}

interface LessonBalanceCardProps {
  playerId: string | null;
  onBuyCredits: () => void;
}

type Status = "ok" | "low" | "empty";

function getStatus(total: number): Status {
  if (total <= 0) return "empty";
  if (total < 5) return "low";
  return "ok";
}

export default function LessonBalanceCard({ playerId, onBuyCredits }: LessonBalanceCardProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<CreditsResponse>({
    queryKey: [`/api/players/${playerId}/credits-summary`],
    enabled: !!playerId,
  });

  const credits = data?.credits ?? { group: 0, private: 0, semi_private: 0, court: 0 };
  const lessonTotal = credits.group + credits.private + credits.semi_private;
  const status = getStatus(lessonTotal);

  const accentColor =
    status === "ok" ? "#00E676" : status === "low" ? "#FFC107" : "#FF4D4D";

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBuyCredits();
  };

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.wrapper}>
      <View style={[styles.card, { borderColor: accentColor + "55" }]}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <View style={styles.contentRow}>
          <View style={[styles.iconCircle, { backgroundColor: accentColor + "22" }]}>
            <Feather name="credit-card" size={22} color={accentColor} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.label}>{t("player.schedule.lessonBalance")}</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={accentColor} style={{ marginTop: 4 }} />
            ) : (
              <>
                <Text style={[styles.bigNumber, { color: accentColor }]}>
                  {lessonTotal} <Text style={styles.unit}>{t(lessonTotal === 1 ? "player.schedule.lessonSingular" : "player.schedule.lessonPlural")}</Text>
                </Text>
                <Text style={styles.subline}>
                  {status === "empty"
                    ? t("player.schedule.balanceEmpty")
                    : status === "low"
                    ? t("player.schedule.balanceLow")
                    : t("player.schedule.balanceOk")}
                </Text>
                {(credits.group > 0 || credits.private > 0 || credits.semi_private > 0) ? (
                  <View style={styles.breakdown}>
                    {credits.group > 0 ? (
                      <Text style={styles.breakdownItem}>
                        {credits.group} {t("player.schedule.creditTypeGroup")}
                      </Text>
                    ) : null}
                    {credits.private > 0 ? (
                      <Text style={styles.breakdownItem}>
                        {credits.private} {t("player.schedule.creditTypePrivate")}
                      </Text>
                    ) : null}
                    {credits.semi_private > 0 ? (
                      <Text style={styles.breakdownItem}>
                        {credits.semi_private} {t("player.schedule.creditTypeSemiPrivate")}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
        {!isLoading && status !== "ok" ? (
          <Pressable
            onPress={handlePress}
            style={[styles.buyButton, { backgroundColor: accentColor }]}
          >
            <Feather name="plus-circle" size={16} color="#0A0A0A" />
            <Text style={styles.buyButtonText}>{t("player.schedule.buyMore")}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 4,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 2,
  },
  unit: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  subline: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  breakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  breakdownItem: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    backgroundColor: Backgrounds.elevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  buyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  buyButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: "#0A0A0A",
  },
}));
