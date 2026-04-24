import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import SquadVsSquadWidget from "@/components/SquadVsSquadWidget";

type SquadGroupRoute = RouteProp<{ SquadGroup: { squadId: string; squadName?: string } }, "SquadGroup">;

interface SquadInfo {
  squads: Array<{ id: string; name: string; academyId: string | null }>;
}

export default function SquadGroupScreen() {
  const route = useRoute<SquadGroupRoute>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { squadId, squadName: nameParam } = route.params ?? { squadId: "" };

  const { data, isLoading } = useQuery<SquadInfo>({
    queryKey: ["/api/leaderboards/coach/squads"],
    staleTime: 5 * 60_000,
  });

  const squad = data?.squads?.find((s) => s.id === squadId) ?? null;
  const displayName = squad?.name ?? nameParam ?? "Squad";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={styles.heroCard}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={26} color={Colors.dark.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SQUAD</Text>
          <Text style={styles.title} numberOfLines={2}>
            {displayName}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color={Colors.dark.tint} />
        </View>
      ) : null}

      <SquadVsSquadWidget pinnedSquadAId={squadId} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(86, 196, 173, 0.18)",
  },
  eyebrow: {
    color: Colors.dark.tint,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700",
    marginTop: 2,
  },
  loader: { padding: Spacing.lg, alignItems: "center" },
});
