import React, { useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, Linking, ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Props {
  visible: boolean;
  onClose: () => void;
  callCount?: number;
  limit?: number;
  onSubscribed?: () => void;
}

export default function AiProUpgradeModal({ visible, onClose, callCount = 5, limit = 5, onSubscribed }: Props) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/ai-pro/checkout");
      const data = await response.json();
      if (data.url) {
        await Linking.openURL(data.url);
        onSubscribed?.();
        onClose();
      }
    } catch (error) {
      console.error("[AiProUpgradeModal] Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="flash" size={28} color="#000" />
            </View>
          </View>

          <Text style={styles.title}>AI Pro</Text>
          <Text style={styles.subtitle}>
            Je hebt {callCount} van je {limit} gratis AI-gesprekken gebruikt deze maand.
          </Text>

          <View style={styles.featureList}>
            {[
              "Onbeperkte AI-gesprekken per maand",
              "Persoonlijke AI-coach inzichten",
              "AI sessie-samenvattingen",
              "Match voorbereiding & strategie",
              "Quest begeleiding van AI",
            ].map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>€4,99</Text>
            <Text style={styles.priceUnit}>/maand</Text>
          </View>

          <Pressable
            style={[styles.upgradeButton, loading && styles.upgradeButtonDisabled]}
            onPress={handleUpgrade}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.upgradeButtonText}>Upgraden naar AI Pro</Text>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Misschien later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#161D28",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconRow: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  featureList: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  featureText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    gap: 4,
  },
  price: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  priceUnit: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  upgradeButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  upgradeButtonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
});
