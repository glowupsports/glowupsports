import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import {
  PROVIDER_SPECIALIZATIONS,
  SPECIALIZATION_KEYS,
  ProviderSpecialization,
} from "@/provider/constants/specializations";

export default function ProviderOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ProviderSpecialization[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback((key: ProviderSpecialization) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const handleConfirm = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/provider/me", {
        specializations: selected,
        isOnboarded: true,
      });
      if (!res.ok) throw new Error("Failed to save");
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
    } catch {
      Alert.alert("Error", "Could not save your specializations. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.heroSection}>
        <View style={styles.iconCircle}>
          <Ionicons name="construct" size={32} color={Colors.dark.primary} />
        </View>
        <Text style={styles.title}>What&apos;s your craft?</Text>
        <Text style={styles.subtitle}>
          Select everything that applies. You can always add more later.
        </Text>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {SPECIALIZATION_KEYS.map((key, idx) => {
          const spec = PROVIDER_SPECIALIZATIONS[key];
          const isSelected = selected.includes(key);
          return (
            <Animated.View
              key={key}
              entering={FadeInUp.delay(80 + idx * 30).duration(300)}
              style={styles.cardWrapper}
            >
              <Pressable
                style={[
                  styles.card,
                  isSelected && { borderColor: Colors.dark.primary, borderWidth: 2 },
                ]}
                onPress={() => toggle(key)}
              >
                {isSelected ? (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={12} color={Colors.dark.buttonText} />
                  </View>
                ) : null}
                <View
                  style={[
                    styles.specIconCircle,
                    { backgroundColor: spec.color + "20" },
                  ]}
                >
                  <Ionicons name={spec.icon} size={28} color={spec.color} />
                </View>
                <Text style={styles.specLabel} numberOfLines={1}>
                  {spec.label}
                </Text>
                <Text style={styles.specDesc} numberOfLines={2}>
                  {spec.description}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + Spacing.md },
        ]}
      >
        {selected.length > 0 ? (
          <Text style={styles.selectionCount}>
            {selected.length} craft{selected.length > 1 ? "s" : ""} selected
          </Text>
        ) : (
          <Text style={styles.selectionHint}>Select at least one to continue</Text>
        )}
        <Pressable
          style={[
            styles.ctaButton,
            selected.length === 0 && styles.ctaDisabled,
          ]}
          onPress={handleConfirm}
          disabled={selected.length === 0 || saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.dark.buttonText} size="small" />
          ) : (
            <Text style={styles.ctaText}>Let&apos;s Go</Text>
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
  heroSection: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  scroll: { flex: 1 },
  grid: {
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  cardWrapper: {
    width: "47.5%",
  },
  card: {
    backgroundColor: "#0F141B",
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    gap: Spacing.xs,
    minHeight: 130,
    position: "relative",
  },
  checkBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  specIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  specLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  specDesc: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    lineHeight: 15,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  selectionCount: {
    fontSize: 13,
    color: Colors.dark.primary,
    fontWeight: "600",
    textAlign: "center",
  },
  selectionHint: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  ctaButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
});
