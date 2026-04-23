import React from "react";
import { Pressable, StyleSheet, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Colors, GlowColors } from "@/constants/theme";

const HIDDEN_ROUTES = new Set([
  "PlayerHelp",
  "PlayerGuide",
  "PlayerOnboarding",
  "PlayerOnboardingV2",
  "PrivacySettings",
  "ReportIssue",
  "PlayerBookingChat",
]);

export function FloatingHelpButton() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const currentRouteName = useNavigationState((state) => {
    if (!state) return null;
    const findActive = (s: any): string | null => {
      const route = s.routes[s.index];
      if (route?.state) return findActive(route.state);
      return route?.name ?? null;
    };
    return findActive(state);
  });

  if (currentRouteName && HIDDEN_ROUTES.has(currentRouteName)) {
    return null;
  }

  const top = Math.max(insets.top, 8) + 4;

  return (
    <View
      style={[styles.container, { top }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("PlayerHelp");
        }}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={t("playerGuide.helpButton.a11y")}
        hitSlop={10}
      >
        <Ionicons name="help" size={18} color={Colors.dark.buttonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 12,
    zIndex: 9999,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
});

export default FloatingHelpButton;
