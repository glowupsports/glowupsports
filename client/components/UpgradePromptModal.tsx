import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

const TIER_COLORS: Record<string, string> = {
  starter: Colors.dark.textMuted,
  pro: "#6C63FF",
  elite: Colors.dark.gold,
};

const TIER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  starter: "star-outline",
  pro: "rocket-outline",
  elite: "diamond-outline",
};

const FEATURE_LABELS: Record<string, string> = {
  ai_coach_basic: "AI Coach (Basic)",
  ai_coach_unlimited: "AI Coach (Unlimited)",
  video_feedback: "Video Feedback",
  match_analytics: "Match Analytics",
  tournaments: "Tournaments & Ladders",
  custom_roles: "Custom Roles",
  white_labeling: "White Labeling",
  advanced_invoicing: "Advanced Invoicing",
  maxCoaches: "More Coaches",
  maxPlayers: "More Players",
  maxLocations: "More Locations",
};

export interface UpgradePromptData {
  featureName?: string;
  limitName?: string;
  currentTier?: string;
  requiredTier?: string;
}

interface Props {
  visible: boolean;
  data: UpgradePromptData | null;
  onDismiss: () => void;
}

export default function UpgradePromptModal({ visible, data, onDismiss }: Props) {
  const queryClient = useQueryClient();
  const requiredTier = data?.requiredTier || "pro";
  const featureKey = data?.featureName || data?.limitName || "";
  const featureLabel = FEATURE_LABELS[featureKey] || featureKey;
  const tierColor = TIER_COLORS[requiredTier] || Colors.dark.gold;
  const tierIcon = TIER_ICONS[requiredTier] || "rocket-outline";
  const tierLabel = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);

  const tierPrices: Record<string, string> = {
    pro: "€49/maand",
    elite: "€99/maand",
    starter: "Gratis",
  };
  const price = tierPrices[requiredTier] || "";

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const plansRes = await apiRequest("GET", "/api/academy/subscription");
      const plansData = await plansRes.json();
      const plan = plansData.plans?.find(
        (p: any) => p.name.toLowerCase() === requiredTier,
      );
      if (!plan) throw new Error("Plan not found");

      const res = await apiRequest("POST", "/api/academy/subscription/checkout", {
        planId: plan.id,
      });
      const json = await res.json();
      return json.url as string;
    },
    onSuccess: async (url) => {
      onDismiss();
      if (url) {
        await Linking.openURL(url);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/academy/subscription"] });
        }, 3000);
      }
    },
  });

  if (!visible || !data) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          <LinearGradient
            colors={[`${tierColor}22`, `${tierColor}05`]}
            style={styles.gradient}
          />

          <View style={styles.iconRow}>
            <View style={[styles.iconContainer, { backgroundColor: `${tierColor}20` }]}>
              <Ionicons name={tierIcon} size={36} color={tierColor} />
            </View>
          </View>

          <View style={[styles.badge, { backgroundColor: `${tierColor}20`, borderColor: `${tierColor}40` }]}>
            <Text style={[styles.badgeText, { color: tierColor }]}>
              {tierLabel} Plan
            </Text>
          </View>

          <Text style={styles.title}>Upgrade vereist</Text>

          {featureLabel ? (
            <Text style={styles.subtitle}>
              <Text style={[styles.highlight, { color: tierColor }]}>{featureLabel}</Text> is beschikbaar op het{" "}
              <Text style={[styles.highlight, { color: tierColor }]}>{tierLabel}</Text> abonnement voor{" "}
              <Text style={styles.highlight}>{price}</Text>.
            </Text>
          ) : (
            <Text style={styles.subtitle}>
              Je huidige abonnement heeft de limiet bereikt. Upgrade naar{" "}
              <Text style={[styles.highlight, { color: tierColor }]}>{tierLabel}</Text> voor {price}.
            </Text>
          )}

          <Pressable
            style={[styles.upgradeBtn, { backgroundColor: tierColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              checkoutMutation.mutate();
            }}
            disabled={checkoutMutation.isPending}
          >
            {checkoutMutation.isPending ? (
              <Text style={styles.upgradeBtnText}>Laden...</Text>
            ) : (
              <>
                <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
                <Text style={styles.upgradeBtnText}>Upgraden naar {tierLabel}</Text>
              </>
            )}
          </Pressable>

          {checkoutMutation.isError ? (
            <Text style={styles.errorText}>
              Kon checkout niet starten. Controleer uw verbinding.
            </Text>
          ) : null}

          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissText}>Niet nu</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  iconRow: {
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  highlight: {
    fontWeight: "700",
    color: Colors.dark.text,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    width: "100%",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  upgradeBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  dismissBtn: {
    paddingVertical: Spacing.sm,
  },
  dismissText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dark.error,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});
