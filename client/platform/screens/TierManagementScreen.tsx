import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

const PLATFORM_COLOR = "#9B59B6";

const TIER_COLORS: Record<string, string> = {
  starter: Colors.dark.textMuted,
  pro: "#6C63FF",
  elite: Colors.dark.gold,
};

const ALL_FEATURES: Array<{ key: string; label: string; description: string }> = [
  { key: "ai_coach_basic", label: "AI Coach (Basis)", description: "Beperkte AI coaching suggesties" },
  { key: "ai_coach_unlimited", label: "AI Coach (Onbeperkt)", description: "Onbeperkte AI coaching" },
  { key: "video_feedback", label: "Video Feedback", description: "Upload en annoteer video feedback" },
  { key: "match_analytics", label: "Match Analytics", description: "Gedetailleerde wedstrijd statistieken" },
  { key: "tournaments", label: "Toernooien & Ladders", description: "Toernooi- en laddersbeheer" },
  { key: "custom_roles", label: "Aangepaste Rollen", description: "Aangepaste coach-rollen aanmaken" },
  { key: "white_labeling", label: "White Labeling", description: "Eigen branding in de app" },
  { key: "advanced_invoicing", label: "Geavanceerde Facturatie", description: "Uitgebreide factuurmogelijkheden" },
];

interface TierPlan {
  id: string;
  name: string;
  description?: string;
  stripePriceId?: string;
  stripeProductId?: string;
  monthlyPrice: number;
  currency: string;
  maxCoaches: number;
  maxPlayers: number;
  maxLocations: number;
  features: Record<string, boolean>;
  isActive: boolean;
  sortOrder: number;
  academyCount: number;
  updatedAt?: string;
}

interface EditState {
  name: string;
  description: string;
  monthlyPrice: string;
  maxCoaches: string;
  maxPlayers: string;
  maxLocations: string;
  features: Record<string, boolean>;
  stripePriceId: string;
}

function tierColor(plan: TierPlan): string {
  return TIER_COLORS[plan.name.toLowerCase()] || PLATFORM_COLOR;
}

function TierCard({
  plan,
  onEdit,
}: {
  plan: TierPlan;
  onEdit: (plan: TierPlan) => void;
}) {
  const color = tierColor(plan);
  const tierIcon: keyof typeof Ionicons.glyphMap =
    plan.name.toLowerCase() === "elite"
      ? "diamond"
      : plan.name.toLowerCase() === "pro"
        ? "rocket"
        : "star-outline";

  const enabledFeatures = Object.entries(plan.features).filter(([, v]) => v).length;

  return (
    <Pressable
      style={[styles.tierCard, { borderColor: `${color}40` }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onEdit(plan);
      }}
    >
      <LinearGradient colors={[`${color}15`, "transparent"]} style={styles.tierGradient} />

      <View style={styles.tierHeader}>
        <View style={[styles.tierIcon, { backgroundColor: `${color}20` }]}>
          <Ionicons name={tierIcon} size={22} color={color} />
        </View>
        <View style={styles.tierInfo}>
          <Text style={[styles.tierName, { color }]}>{plan.name}</Text>
          <Text style={styles.tierPrice}>
            {plan.monthlyPrice === 0 ? "Gratis" : `€${plan.monthlyPrice}/maand`}
          </Text>
        </View>
        <View style={styles.tierMeta}>
          <View style={[styles.countBadge, { backgroundColor: `${color}20` }]}>
            <Ionicons name="business-outline" size={12} color={color} />
            <Text style={[styles.countText, { color }]}>{plan.academyCount}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tierStats}>
        <View style={styles.tierStat}>
          <Ionicons name="people-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.tierStatLabel}>
            {plan.maxCoaches === -1 ? "∞" : plan.maxCoaches} coaches
          </Text>
        </View>
        <View style={styles.tierStat}>
          <Ionicons name="person-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.tierStatLabel}>
            {plan.maxPlayers === -1 ? "∞" : plan.maxPlayers} spelers
          </Text>
        </View>
        <View style={styles.tierStat}>
          <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.tierStatLabel}>
            {plan.maxLocations === -1 ? "∞" : plan.maxLocations} locaties
          </Text>
        </View>
        <View style={styles.tierStat}>
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.tierStatLabel}>{enabledFeatures} functies</Text>
        </View>
      </View>

      <View style={styles.editHint}>
        <Ionicons name="create-outline" size={14} color={Colors.dark.textMuted} />
        <Text style={styles.editHintText}>Tik om te bewerken</Text>
      </View>
    </Pressable>
  );
}

function EditModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: TierPlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const color = tierColor(plan);

  const [form, setForm] = useState<EditState>({
    name: plan.name,
    description: plan.description || "",
    monthlyPrice: String(plan.monthlyPrice),
    maxCoaches: String(plan.maxCoaches),
    maxPlayers: String(plan.maxPlayers),
    maxLocations: String(plan.maxLocations),
    features: { ...plan.features },
    stripePriceId: plan.stripePriceId || "",
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const price = parseFloat(form.monthlyPrice);
      const maxCoaches = parseInt(form.maxCoaches, 10);
      const maxPlayers = parseInt(form.maxPlayers, 10);
      const maxLocations = parseInt(form.maxLocations, 10);

      if (isNaN(price) || price < 0) throw new Error("Ongeldige prijs");
      if (isNaN(maxCoaches)) throw new Error("Ongeldig max coaches");
      if (isNaN(maxPlayers)) throw new Error("Ongeldig max spelers");
      if (isNaN(maxLocations)) throw new Error("Ongeldig max locaties");

      await apiRequest("PUT", `/api/platform/subscription-plans/${plan.id}`, {
        name: form.name.trim(),
        description: form.description.trim(),
        monthlyPrice: price,
        maxCoaches,
        maxPlayers,
        maxLocations,
        features: form.features,
        stripePriceId: form.stripePriceId.trim() || null,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/subscription-plans"] });
      onSaved();
      onClose();
    },
    onError: (err: any) => {
      if (Platform.OS === "web") {
        window.alert(err.message || "Opslaan mislukt");
      } else {
        Alert.alert("Fout", err.message || "Opslaan mislukt");
      }
    },
  });

  const toggleFeature = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }));
  };

  return (
    <View style={styles.editOverlay}>
      <View style={styles.editCard}>
        <View style={styles.editHeader}>
          <Pressable onPress={onClose} style={styles.editCloseBtn}>
            <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
          </Pressable>
          <Text style={[styles.editTitle, { color }]}>Bewerk {plan.name}</Text>
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={[styles.editSaveBtn, { backgroundColor: color }]}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.editSaveBtnText}>Opslaan</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat
          style={styles.editScroll}
          contentContainerStyle={styles.editContent}
        >
          <Text style={styles.editSectionTitle}>Algemeen</Text>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Naam</Text>
            <TextInput
              style={styles.editInput}
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Omschrijving</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMulti]}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              placeholder="Omschrijving van het plan..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
            />
          </View>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Maandprijs (EUR)</Text>
            <TextInput
              style={styles.editInput}
              value={form.monthlyPrice}
              onChangeText={(v) => setForm((p) => ({ ...p, monthlyPrice: v }))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>
          <View style={styles.editField}>
            <Text style={styles.editLabel}>Stripe Price ID</Text>
            <TextInput
              style={styles.editInput}
              value={form.stripePriceId}
              onChangeText={(v) => setForm((p) => ({ ...p, stripePriceId: v }))}
              placeholder="price_..."
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="none"
            />
          </View>

          <Text style={[styles.editSectionTitle, { marginTop: Spacing.lg }]}>Capaciteitslimieten</Text>
          <Text style={styles.editHint}>Gebruik -1 voor onbeperkt</Text>
          <View style={styles.limitsRow}>
            <View style={[styles.editField, styles.limitField]}>
              <Text style={styles.editLabel}>Max Coaches</Text>
              <TextInput
                style={styles.editInput}
                value={form.maxCoaches}
                onChangeText={(v) => setForm((p) => ({ ...p, maxCoaches: v }))}
                keyboardType="number-pad"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
            <View style={[styles.editField, styles.limitField]}>
              <Text style={styles.editLabel}>Max Spelers</Text>
              <TextInput
                style={styles.editInput}
                value={form.maxPlayers}
                onChangeText={(v) => setForm((p) => ({ ...p, maxPlayers: v }))}
                keyboardType="number-pad"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
            <View style={[styles.editField, styles.limitField]}>
              <Text style={styles.editLabel}>Max Locaties</Text>
              <TextInput
                style={styles.editInput}
                value={form.maxLocations}
                onChangeText={(v) => setForm((p) => ({ ...p, maxLocations: v }))}
                keyboardType="number-pad"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
          </View>

          <Text style={[styles.editSectionTitle, { marginTop: Spacing.lg }]}>Functies</Text>
          {ALL_FEATURES.map((feat) => {
            const enabled = form.features[feat.key] === true;
            return (
              <Pressable
                key={feat.key}
                style={styles.featureRow}
                onPress={() => toggleFeature(feat.key)}
              >
                <View style={styles.featureInfo}>
                  <Text style={styles.featureLabel}>{feat.label}</Text>
                  <Text style={styles.featureDesc}>{feat.description}</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={() => toggleFeature(feat.key)}
                  trackColor={{ false: Colors.dark.backgroundRoot, true: color }}
                  thumbColor={Colors.dark.text}
                />
              </Pressable>
            );
          })}
        </KeyboardAwareScrollViewCompat>
      </View>
    </View>
  );
}

export default function TierManagementScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [editingPlan, setEditingPlan] = useState<TierPlan | null>(null);

  const { data: plans, isLoading, refetch } = useQuery<TierPlan[]>({
    queryKey: ["/api/platform/subscription-plans"],
  });

  const totalAcademies = plans?.reduce((sum, p) => sum + p.academyCount, 0) ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Tier Beheer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Ionicons name="layers-outline" size={20} color={PLATFORM_COLOR} />
          <Text style={styles.summaryText}>
            {plans?.length ?? 0} abonnementen{" "}
            <Text style={styles.summaryMuted}>·</Text>{" "}
            <Text style={styles.summaryHighlight}>{totalAcademies} academies actief</Text>
          </Text>
        </View>

        {plans && plans.length > 0 ? (
          <View style={styles.tierSummaryRow}>
            {plans.map((plan) => {
              const color = tierColor(plan);
              return (
                <View key={plan.id} style={[styles.tierSummaryChip, { borderColor: `${color}40` }]}>
                  <Text style={[styles.tierSummaryName, { color }]}>{plan.name}</Text>
                  <Text style={styles.tierSummaryCount}>{plan.academyCount}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Abonnementstiers</Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={PLATFORM_COLOR} />
            <Text style={styles.loadingText}>Tiers laden...</Text>
          </View>
        ) : plans && plans.length > 0 ? (
          plans.map((plan) => (
            <TierCard key={plan.id} plan={plan} onEdit={setEditingPlan} />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="layers-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>Geen abonnementstiers gevonden</Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>Opnieuw proberen</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {editingPlan ? (
        <EditModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={() => setEditingPlan(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
  },
  topBarTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  scrollView: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  summaryText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  summaryMuted: { color: Colors.dark.textMuted },
  summaryHighlight: { color: PLATFORM_COLOR, fontWeight: "700" },
  tierSummaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  tierSummaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tierSummaryName: { fontWeight: "700", fontSize: 13 },
  tierSummaryCount: { ...Typography.small, color: Colors.dark.textMuted },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  tierCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  tierGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tierIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  tierInfo: { flex: 1 },
  tierName: { fontSize: 18, fontWeight: "800" },
  tierPrice: { ...Typography.small, color: Colors.dark.textMuted },
  tierMeta: {},
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  countText: { fontSize: 13, fontWeight: "700" },
  tierStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tierStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  tierStatLabel: { ...Typography.caption, color: Colors.dark.textSecondary },
  editHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  editHintText: { ...Typography.caption, color: Colors.dark.textMuted },
  loadingContainer: {
    alignItems: "center",
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  loadingText: { ...Typography.body, color: Colors.dark.textMuted },
  emptyContainer: {
    alignItems: "center",
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyText: { ...Typography.body, color: Colors.dark.textMuted },
  retryBtn: {
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  editCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  editCloseBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  editTitle: { fontSize: 18, fontWeight: "800" },
  editSaveBtn: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minWidth: 70,
    alignItems: "center",
  },
  editSaveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  editScroll: { maxHeight: 500 },
  editContent: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  editSectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  editHint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    marginTop: -Spacing.xs,
  },
  editField: { marginBottom: Spacing.sm },
  editLabel: { ...Typography.small, color: Colors.dark.textSecondary, marginBottom: 4, fontWeight: "600" },
  editInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: 15,
  },
  editInputMulti: { minHeight: 64, textAlignVertical: "top" },
  limitsRow: { flexDirection: "row", gap: Spacing.sm },
  limitField: { flex: 1 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  featureInfo: { flex: 1, marginRight: Spacing.md },
  featureLabel: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  featureDesc: { ...Typography.caption, color: Colors.dark.textMuted },
});
