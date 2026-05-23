import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

const COACH_ROLES = [
  { value: "head_coach", label: "Head Coach", color: Colors.dark.gold },
  { value: "coach", label: "Coach", color: Colors.dark.primary },
  { value: "assistant", label: "Assistant Coach", color: "#A855F7" },
  { value: "intern", label: "Intern", color: Colors.dark.textSecondary },
] as const;

const CURRENCIES = ["AED", "EUR", "USD", "GBP", "SAR", "QAR"];

interface TierRow {
  role: string;
  price60min: string;
  price90min: string;
  price120min: string;
  currency: string;
}

interface ApiTier {
  id: string;
  academyId: string;
  role: string;
  price60min: string | null;
  price90min: string | null;
  price120min: string | null;
  currency: string | null;
}

export default function CoachTierPricingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<TierRow[]>(
    COACH_ROLES.map((r) => ({
      role: r.value,
      price60min: "",
      price90min: "",
      price120min: "",
      currency: "AED",
    })),
  );
  const [currency, setCurrency] = useState("AED");
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<{ tiers: ApiTier[] }>({
    queryKey: ["/api/owner/tier-pricing"],
  });

  useEffect(() => {
    if (!data?.tiers) return;
    const apiCurrency = data.tiers.find((t) => t.currency)?.currency || "AED";
    setCurrency(apiCurrency);
    setRows(
      COACH_ROLES.map((r) => {
        const apiTier = data.tiers.find((t) => t.role === r.value);
        return {
          role: r.value,
          price60min: apiTier?.price60min ?? "",
          price90min: apiTier?.price90min ?? "",
          price120min: apiTier?.price120min ?? "",
          currency: apiCurrency,
        };
      }),
    );
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/owner/tier-pricing", {
        tiers: rows.map((r) => ({
          role: r.role,
          price60min: r.price60min || null,
          price90min: r.price90min || null,
          price120min: r.price120min || null,
          currency,
        })),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/owner/tier-pricing"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (_err: Error) => {
      Alert.alert("Save failed", "Could not save tier pricing. Please try again.");
    },
  });

  const updateRow = (role: string, field: keyof TierRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.role === role ? { ...r, [field]: value } : r)),
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
        <TennisBallSpinner size="large" color={Colors.dark.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Coach Rates</Text>
          <Text style={styles.headerSub}>Set private lesson prices per coach tier</Text>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Currency */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Currency</Text>
          <Pressable
            style={styles.currencyBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCurrencyPicker(!showCurrencyPicker);
            }}
          >
            <Ionicons name="cash-outline" size={18} color={Colors.dark.gold} />
            <Text style={styles.currencyValue}>{currency}</Text>
            <Ionicons
              name={showCurrencyPicker ? "chevron-up" : "chevron-down"}
              size={16}
              color={Colors.dark.textMuted}
            />
          </Pressable>
          {showCurrencyPicker && (
            <View style={styles.currencyList}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.currencyOption, c === currency && styles.currencyOptionSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCurrency(c);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.currencyOptionText,
                      c === currency && styles.currencyOptionTextSelected,
                    ]}
                  >
                    {c}
                  </Text>
                  {c === currency && (
                    <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.dark.xpCyan} />
          <Text style={styles.infoText}>
            Players see these rates when booking a private lesson. Leave a field empty if that
            duration is not offered at that tier.
          </Text>
        </View>

        {/* Duration header */}
        <View style={styles.tableHeader}>
          <View style={styles.roleHeaderCell}>
            <Text style={styles.tableHeaderText}>Tier</Text>
          </View>
          {["60 min", "90 min", "120 min"].map((d) => (
            <View key={d} style={styles.priceHeaderCell}>
              <Text style={styles.tableHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Tier rows */}
        {COACH_ROLES.map((roleConfig) => {
          const row = rows.find((r) => r.role === roleConfig.value);
          if (!row) return null;
          return (
            <View key={roleConfig.value} style={styles.tierRow}>
              <View style={styles.roleCell}>
                <View
                  style={[styles.roleDot, { backgroundColor: roleConfig.color + "30" }]}
                >
                  <View
                    style={[styles.roleDotInner, { backgroundColor: roleConfig.color }]}
                  />
                </View>
                <Text style={[styles.roleLabel, { color: roleConfig.color }]}>
                  {roleConfig.label}
                </Text>
              </View>
              <View style={styles.priceCell}>
                <TextInput
                  style={styles.priceInput}
                  value={row.price60min}
                  onChangeText={(v) => updateRow(roleConfig.value, "price60min", v)}
                  placeholder="—"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.priceCell}>
                <TextInput
                  style={styles.priceInput}
                  value={row.price90min}
                  onChangeText={(v) => updateRow(roleConfig.value, "price90min", v)}
                  placeholder="—"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.priceCell}>
                <TextInput
                  style={styles.priceInput}
                  value={row.price120min}
                  onChangeText={(v) => updateRow(roleConfig.value, "price120min", v)}
                  placeholder="—"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              </View>
            </View>
          );
        })}

        <Text style={styles.hint}>
          Prices are per session. Leave empty to hide that duration for a tier.
        </Text>
      </KeyboardAwareScrollViewCompat>

      {/* Save button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons
                name={saved ? "checkmark-circle" : "save-outline"}
                size={20}
                color={Colors.dark.buttonText}
              />
              <Text style={styles.saveBtnText}>{saved ? "Saved!" : "Save Rates"}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  headerSub: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  currencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  currencyValue: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
    fontWeight: "600",
  },
  currencyList: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  currencyOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  currencyOptionSelected: {
    backgroundColor: Colors.dark.primary + "15",
  },
  currencyOptionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  currencyOptionTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan + "12",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  infoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  roleHeaderCell: {
    flex: 2,
  },
  priceHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  tableHeaderText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "600",
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border + "60",
    gap: Spacing.xs,
  },
  roleCell: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  roleDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roleDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  roleLabel: {
    ...Typography.small,
    fontWeight: "600",
    flex: 1,
  },
  priceCell: {
    flex: 1,
    alignItems: "center",
  },
  priceInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
    width: "100%",
    textAlign: "center",
    fontSize: 14,
  },
  hint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  saveBtnSuccess: {
    backgroundColor: Colors.dark.primary,
  },
  saveBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: 16,
  },
});
