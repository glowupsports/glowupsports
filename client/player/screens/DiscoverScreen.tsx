import React from "react";
import { ScrollView, StyleSheet, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import PlayerLayout from "@/player/components/PlayerLayout";
import { DiscoverSections } from "@/player/components/FreePlayerDiscovery";
import {
  DiscoverScopeProvider,
  useDiscoverScope,
} from "@/player/context/DiscoverScopeContext";
import { usePlayerCountry } from "@/player/hooks/usePlayerCountry";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";

function DiscoverHeader() {
  useThemeReactivity();
  const scopeCtx = useDiscoverScope();
  // Reuse the same country resolver the coaches rail used so the chip label
  // matches: profile country → GPS reverse-geocode → device locale.
  const { country: resolvedCountry } = usePlayerCountry(null);
  const scope = scopeCtx?.scope ?? "country";

  const setScope = (next: "country" | "global") => {
    if (scope === next) return;
    Haptics.selectionAsync();
    scopeCtx?.setScope(next);
  };

  return (
    <View style={headerStyles.wrap}>
      <Text style={headerStyles.title}>Discover</Text>
      <Text style={headerStyles.subtitle}>Lessons, matches, tournaments and players near you.</Text>
      <View style={headerStyles.chipRow}>
        <Pressable
          style={[headerStyles.chip, scope === "country" && headerStyles.chipActive]}
          onPress={() => setScope("country")}
        >
          <Ionicons
            name="location"
            size={13}
            color={scope === "country" ? Colors.dark.buttonText : Colors.dark.textMuted}
          />
          <Text style={[headerStyles.chipText, scope === "country" && headerStyles.chipTextActive]}>
            {resolvedCountry || "My country"}
          </Text>
        </Pressable>
        <Pressable
          style={[headerStyles.chip, scope === "global" && headerStyles.chipActive]}
          onPress={() => setScope("global")}
        >
          <Ionicons
            name="globe-outline"
            size={13}
            color={scope === "global" ? Colors.dark.buttonText : Colors.dark.textMuted}
          />
          <Text style={[headerStyles.chipText, scope === "global" && headerStyles.chipTextActive]}>
            Worldwide
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DiscoverScreen() {
  useThemeReactivity();
  const insets = useSafeAreaInsets();

  return (
    <DiscoverScopeProvider initialScope="country">
      <PlayerLayout>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: Spacing.lg, paddingBottom: insets.bottom + 96 },
          ]}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          <DiscoverHeader />
          <DiscoverSections />
        </ScrollView>
      </PlayerLayout>
    </DiscoverScopeProvider>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 0 },
}));

const headerStyles = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: Spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  chipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.textMuted,
    letterSpacing: 0.2,
  },
  chipTextActive: {
    color: Colors.dark.buttonText,
  },
}));
