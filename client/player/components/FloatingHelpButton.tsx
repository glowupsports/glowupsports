// This component is mounted as a sibling of PlayerStackNavigator (see PlayerNavigator.tsx),
// so useNavigation() resolves to an outer scope that doesn't know the PlayerHelp route and
// silently no-ops. We use the global navigationRef registered in App.tsx (exposed via
// useTabNavigation().getNavigation()) which dispatches at the root NavigationContainer level
// and CAN resolve nested screen names like "PlayerHelp". For the same reason, we read the
// current route name from the global ref + a state listener instead of useNavigationState().
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Colors, GlowColors } from "@/constants/theme";
import { useTabNavigation } from "@/components/TabNavigationContext";

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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { getNavigation } = useTabNavigation();

  const [currentRouteName, setCurrentRouteName] = useState<string | null>(() => {
    const ref = getNavigation();
    return ref?.getCurrentRoute?.()?.name ?? null;
  });

  useEffect(() => {
    const ref = getNavigation();
    if (!ref) return;
    setCurrentRouteName(ref.getCurrentRoute?.()?.name ?? null);
    const unsubscribe = ref.addListener("state", () => {
      setCurrentRouteName(ref.getCurrentRoute?.()?.name ?? null);
    });
    return unsubscribe;
  }, [getNavigation]);

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
          const ref = getNavigation();
          if (ref?.isReady?.()) {
            ref.navigate("PlayerHelp" as never);
          }
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
