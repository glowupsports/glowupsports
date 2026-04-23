import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
} from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const WELCOME_KEY = "@glow_player_welcome_dismissed";

export function WelcomeGuideCard() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(WELCOME_KEY);
        if (dismissed === "true") {
          if (!cancelled) {
            setVisible(false);
            setHydrated(true);
          }
          return;
        }
        // Migrate legacy walkthrough flag — players who already completed the
        // old walkthrough shouldn't see the new welcome card.
        const legacy = await AsyncStorage.getItem("@glow_walkthrough_completed");
        if (legacy) {
          await AsyncStorage.setItem(WELCOME_KEY, "true");
          if (!cancelled) {
            setVisible(false);
            setHydrated(true);
          }
          return;
        }
        if (!cancelled) {
          setVisible(true);
          setHydrated(true);
        }
      } catch {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenGuide = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AsyncStorage.setItem(WELCOME_KEY, "true").catch(() => {});
    setVisible(false);
    navigation.navigate("PlayerHelp", { initialTab: "start" });
  }, [navigation]);

  const handleLater = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
  }, []);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AsyncStorage.setItem(WELCOME_KEY, "true").catch(() => {});
    setVisible(false);
  }, []);

  if (!hydrated || !visible) return null;

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[`${GlowColors.primary}25`, `${GlowColors.primary}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={18} color={GlowColors.primary} />
          </View>
          <Text style={styles.title}>{t("playerGuide.welcome.title")}</Text>
          <Pressable onPress={handleDismiss} hitSlop={8} accessibilityLabel={t("playerGuide.welcome.dismissA11y")}>
            <Ionicons name="close" size={18} color={TextColors.muted} />
          </Pressable>
        </View>
        <Text style={styles.body}>
          {t("playerGuide.welcome.body")}
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.primaryBtn} onPress={handleOpenGuide}>
            <Ionicons name="rocket" size={14} color={Colors.dark.buttonText} />
            <Text style={styles.primaryBtnText}>{t("playerGuide.welcome.openGuide")}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={handleLater}>
            <Text style={styles.secondaryBtnText}>{t("playerGuide.welcome.later")}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    wrapper: {
      paddingHorizontal: Spacing.md,
      marginTop: Spacing.md,
    },
    card: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: `${GlowColors.primary}40`,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${GlowColors.primary}30`,
      justifyContent: "center",
      alignItems: "center",
    },
    title: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "700",
      flex: 1,
    },
    body: {
      ...Typography.small,
      color: TextColors.secondary,
      lineHeight: 18,
      marginBottom: Spacing.md,
    },
    actionRow: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: GlowColors.primary,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: BorderRadius.sm,
    },
    primaryBtnText: {
      ...Typography.caption,
      color: Colors.dark.buttonText,
      fontWeight: "700",
    },
    secondaryBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.dark.chipBackgroundStrong,
    },
    secondaryBtnText: {
      ...Typography.caption,
      color: TextColors.secondary,
      fontWeight: "600",
    },
  })
);

export default WelcomeGuideCard;
