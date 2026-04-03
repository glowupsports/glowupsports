import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { Colors, Spacing, Typography, BorderRadius, FontSizes } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import CreateFamilyMemberFlow from "./CreateFamilyMemberFlow";

interface Props {
  visible: boolean;
  onDone: () => void;
}

export default function AddFamilyMemberPrompt({ visible, onDone }: Props) {
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  const handleAddMember = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateFlow(true);
  };

  const handleMemberCreated = (_playerId: string, playerName: string) => {
    setShowCreateFlow(false);
    setAddedCount((prev) => prev + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDone();
  };

  return (
    <>
      <Modal visible={visible && !showCreateFlow} transparent animationType="fade" onRequestClose={handleDone}>
        <View style={styles.overlay}>
          <Animated.View entering={ZoomIn.duration(400)} style={styles.card}>
            <LinearGradient
              colors={[`${Colors.dark.xpCyan}20`, "transparent"]}
              style={styles.gradient}
            />

            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.iconRow}>
              <View style={styles.iconBg}>
                <Ionicons name="people" size={48} color={Colors.dark.xpCyan} />
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <Text style={styles.title}>
                {addedCount === 0 ? "Familie toevoegen?" : "Nog een familielid?"}
              </Text>
              <Text style={styles.subtitle}>
                {addedCount === 0
                  ? "Speel je tennis met je gezin? Voeg direct een profiel toe voor elk familielid — geen apart account nodig."
                  : `${addedCount} familielid${addedCount > 1 ? "en" : ""} toegevoegd. Wil je nog iemand toevoegen?`}
              </Text>
            </Animated.View>

            {addedCount > 0 ? (
              <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.addedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
                <Text style={styles.addedText}>{addedCount} profiel{addedCount > 1 ? "en" : ""} aangemaakt</Text>
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.buttons}>
              <Pressable
                style={styles.addBtn}
                onPress={handleAddMember}
                accessibilityRole="button"
                accessibilityLabel="Familielid toevoegen"
              >
                <Ionicons name="person-add" size={20} color={Colors.dark.backgroundRoot} />
                <Text style={styles.addBtnText}>Ja, voeg toe</Text>
              </Pressable>

              <Pressable
                style={styles.doneBtn}
                onPress={handleDone}
                accessibilityRole="button"
                accessibilityLabel="Klaar, ga naar home"
              >
                <Text style={styles.doneBtnText}>
                  {addedCount === 0 ? "Nee, klaar" : "Klaar"}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>

      <CreateFamilyMemberFlow
        visible={showCreateFlow}
        onClose={() => setShowCreateFlow(false)}
        onComplete={handleMemberCreated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 24,
    padding: Spacing.xl,
    gap: Spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  iconRow: {
    alignItems: "center",
  },
  iconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginTop: Spacing.xs,
  },
  addedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    justifyContent: "center",
    backgroundColor: `${Colors.dark.primary}15`,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignSelf: "center",
  },
  addedText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  buttons: {
    gap: Spacing.md,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2,
  },
  addBtnText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  doneBtnText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
});
