import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface CreditStoreModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
}

type CreditType = "group" | "semi_private" | "private";
type CreditQuantity = 1 | 5 | 10 | 20;

const CREDIT_TYPES: { key: CreditType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "group", label: "Group", icon: "people", color: Colors.dark.xpCyan },
  { key: "semi_private", label: "Semi-Private", icon: "person-add", color: Colors.dark.primary },
  { key: "private", label: "Private", icon: "person", color: Colors.dark.orange },
];

const QUANTITIES: CreditQuantity[] = [1, 5, 10, 20];

export default function CreditStoreModal({ visible, onClose, playerId, playerName }: CreditStoreModalProps) {
  const [selectedType, setSelectedType] = useState<CreditType>("group");
  const [selectedQuantity, setSelectedQuantity] = useState<CreditQuantity>(5);
  const queryClient = useQueryClient();

  const grantCreditsMutation = useMutation({
    mutationFn: async (data: { playerId: string; creditType: CreditType; quantity: number }) => {
      return apiRequest("POST", "/api/packages", {
        playerId: data.playerId,
        totalCredits: data.quantity,
        creditType: data.creditType,
        expiryMonths: 12,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    },
    onError: (error) => {
      console.error("Failed to grant credits:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleGrantCredits = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    grantCreditsMutation.mutate({
      playerId,
      creditType: selectedType,
      quantity: selectedQuantity,
    });
  };

  const selectedTypeInfo = CREDIT_TYPES.find(t => t.key === selectedType);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={[Backgrounds.card, Colors.dark.backgroundRoot]}
            style={styles.content}
          >
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={styles.iconContainer}>
                  <Ionicons name="ticket" size={24} color={Colors.dark.primary} />
                </View>
                <View>
                  <Text style={styles.title}>Grant Credits</Text>
                  <Text style={styles.subtitle}>{playerName}</Text>
                </View>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Credit Type</Text>
              <View style={styles.typeRow}>
                {CREDIT_TYPES.map((type) => (
                  <Pressable
                    key={type.key}
                    style={[
                      styles.typeCard,
                      selectedType === type.key && { borderColor: type.color, backgroundColor: `${type.color}15` },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedType(type.key);
                    }}
                  >
                    <View style={[styles.typeIcon, { backgroundColor: `${type.color}20` }]}>
                      <Ionicons name={type.icon} size={20} color={type.color} />
                    </View>
                    <Text style={[styles.typeLabel, selectedType === type.key && { color: type.color }]}>
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quantity</Text>
              <View style={styles.quantityRow}>
                {QUANTITIES.map((qty) => (
                  <Pressable
                    key={qty}
                    style={[
                      styles.quantityCard,
                      selectedQuantity === qty && { 
                        borderColor: selectedTypeInfo?.color, 
                        backgroundColor: `${selectedTypeInfo?.color}15` 
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedQuantity(qty);
                    }}
                  >
                    <Text style={[
                      styles.quantityValue, 
                      selectedQuantity === qty && { color: selectedTypeInfo?.color }
                    ]}>
                      {qty}
                    </Text>
                    <Text style={styles.quantityLabel}>credits</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Adding</Text>
                <Text style={[styles.summaryValue, { color: selectedTypeInfo?.color }]}>
                  {selectedQuantity} {CREDIT_TYPES.find(t => t.key === selectedType)?.label} Credits
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>For Player</Text>
                <Text style={styles.summaryValue}>{playerName}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[
                  styles.grantButton, 
                  { backgroundColor: selectedTypeInfo?.color },
                  grantCreditsMutation.isPending && styles.buttonDisabled,
                ]} 
                onPress={handleGrantCredits}
                disabled={grantCreditsMutation.isPending}
              >
                {grantCreditsMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.backgroundRoot} size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color={Colors.dark.backgroundRoot} />
                    <Text style={styles.grantButtonText}>Grant Credits</Text>
                  </>
                )}
              </Pressable>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  container: {
    maxHeight: "90%",
  },
  content: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing["2xl"],
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  typeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: Backgrounds.card,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  typeLabel: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  quantityRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  quantityCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: Backgrounds.card,
  },
  quantityValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  quantityLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  summaryValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  grantButton: {
    flex: 2,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  grantButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
