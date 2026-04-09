import React, { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  GlowColors,
  Spacing,
  Shadows,
Colors, } from "@/constants/theme";
import {
  HelpCenterModal,
  PLATFORM_GLOSSARY,
} from "@/components/HelpCenterModal";
import type { FAQItem, VideoTutorial } from "@/components/HelpCenterModal";

export type { FAQItem, VideoTutorial };

interface HelpButtonProps {
  role: string;
  faqs: FAQItem[];
  tutorials?: VideoTutorial[];
  supportEmail?: string;
  whatsAppNumber?: string;
  bottomOffset?: number;
}

export function HelpButton({
  role,
  faqs,
  tutorials = [],
  supportEmail,
  whatsAppNumber,
  bottomOffset = 100,
}: HelpButtonProps) {
  const [visible, setVisible] = useState(false);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(true);
  };

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(400)}
        style={[
          styles.container,
          { bottom: bottomOffset, right: Spacing.lg },
        ]}
      >
        <Pressable style={styles.button} onPress={handlePress}>
          <Ionicons name="help-circle" size={24} color={GlowColors.primary} />
        </Pressable>
      </Animated.View>

      <HelpCenterModal
        visible={visible}
        onClose={() => setVisible(false)}
        role={role}
        faqs={faqs}
        glossary={PLATFORM_GLOSSARY}
        tutorials={tutorials}
        supportEmail={supportEmail}
        whatsAppNumber={whatsAppNumber}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 999,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${GlowColors.primary}25`,
    justifyContent: "center",
    alignItems: "center",
    ...Shadows.glowSubtle,
  },
});

export default HelpButton;
