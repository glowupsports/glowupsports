import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";

interface CoachSquad {
  id: string;
  name: string;
  academyId: string | null;
}

interface SquadStats {
  squadId: string;
  squadName: string;
  memberCount: number;
  xp: number;
  matchesPlayed: number;
  matchesWon: number;
  attendance: number;
}

interface VsResponse {
  window: "week" | "month";
  windowStart: string;
  a: SquadStats;
  b: SquadStats;
}

type WindowKind = "week" | "month";

function StatRow({
  label,
  aVal,
  bVal,
  unit,
}: {
  label: string;
  aVal: number;
  bVal: number;
  unit?: string;
}) {
  const aWins = aVal > bVal;
  const bWins = bVal > aVal;
  return (
    <View style={styles.statRow}>
      <View style={styles.statSide}>
        <Text
          style={[
            styles.statValue,
            aWins ? styles.winValue : null,
          ]}
        >
          {aVal}
          {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
        </Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={[styles.statSide, styles.statSideRight]}>
        <Text
          style={[
            styles.statValue,
            bWins ? styles.winValue : null,
          ]}
        >
          {bVal}
          {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function SquadPickerRow({
  squads,
  selectedId,
  onSelect,
  excludeId,
}: {
  squads: CoachSquad[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeId: string | null;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pickerRow}
    >
      {squads
        .filter((s) => s.id !== excludeId)
        .map((s) => {
          const active = s.id === selectedId;
          return (
            <Pressable
              key={s.id}
              onPress={() => onSelect(s.id)}
              style={[
                styles.pickerChip,
                active ? styles.pickerChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.pickerText,
                  active ? styles.pickerTextActive : null,
                ]}
                numberOfLines={1}
              >
                {s.name}
              </Text>
            </Pressable>
          );
        })}
    </ScrollView>
  );
}

interface SquadVsSquadWidgetProps {
  // Pin one side to a specific squad (used by squad group page).
  pinnedSquadAId?: string | null;
}

export default function SquadVsSquadWidget({ pinnedSquadAId = null }: SquadVsSquadWidgetProps = {}) {
  const [windowKind, setWindowKind] = useState<WindowKind>("month");
  const [aId, setAId] = useState<string | null>(pinnedSquadAId);
  const [bId, setBId] = useState<string | null>(null);

  const { data: squadsData, isLoading: loadingSquads } = useQuery<{
    squads: CoachSquad[];
  }>({
    queryKey: ["/api/leaderboards/coach/squads"],
    staleTime: 5 * 60_000,
  });

  const squads = squadsData?.squads ?? [];

  // Keep aId locked to pinnedSquadAId when provided.
  React.useEffect(() => {
    if (pinnedSquadAId && pinnedSquadAId !== aId) {
      setAId(pinnedSquadAId);
    }
  }, [pinnedSquadAId, aId]);

  // Auto-select the first two squads once available (when no pin).
  React.useEffect(() => {
    if (squads.length >= 2 && (!aId || !bId)) {
      const firstTwo = squads.slice(0, 2);
      setAId((prev) => prev ?? (pinnedSquadAId ?? firstTwo[0].id));
      setBId((prev) => prev ?? (firstTwo[0].id === (pinnedSquadAId ?? firstTwo[0].id) ? firstTwo[1].id : firstTwo[0].id));
    }
  }, [squads, aId, bId, pinnedSquadAId]);

  const compareKey = useMemo(
    () => (aId && bId ? [`/api/leaderboards/squad-vs-squad`, aId, bId, windowKind] : null),
    [aId, bId, windowKind],
  );

  const { data: vsData, isLoading: loadingVs } = useQuery<VsResponse>({
    queryKey: compareKey ?? ["/api/leaderboards/squad-vs-squad", "noop"],
    enabled: !!compareKey,
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        a: aId!,
        b: bId!,
        window: windowKind,
      });
      const { getApiUrl } = await import("@/lib/query-client");
      const { getAuthToken, getCurrentAcademyId } = await import("@/lib/auth");
      const token = await getAuthToken();
      const academyId = await getCurrentAcademyId();
      const url = new URL(
        `/api/leaderboards/squad-vs-squad?${params.toString()}`,
        getApiUrl(),
      );
      const res = await fetch(url.toString(), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(academyId ? { "x-academy-id": academyId } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to load squad-vs-squad");
      return res.json();
    },
  });

  if (loadingSquads) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="small" color={Colors.dark.tint} />
      </View>
    );
  }

  if (!squads || squads.length < 2) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={18} color={Colors.dark.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SQUAD vs SQUAD</Text>
          <Text style={styles.title}>Friendly rivalry leaderboard</Text>
        </View>
        <View style={styles.windowToggle}>
          {(["week", "month"] as WindowKind[]).map((w) => (
            <Pressable
              key={w}
              onPress={() => setWindowKind(w)}
              style={[
                styles.windowChip,
                windowKind === w ? styles.windowChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.windowText,
                  windowKind === w ? styles.windowTextActive : null,
                ]}
              >
                {w === "week" ? "Wk" : "Mo"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.pickerLabelRow}>
        <Text style={styles.pickerLabel}>Squad A</Text>
        <Text style={styles.pickerLabel}>Squad B</Text>
      </View>

      <View style={styles.pickerStack}>
        <SquadPickerRow
          squads={squads}
          selectedId={aId}
          onSelect={setAId}
          excludeId={bId}
        />
        <SquadPickerRow
          squads={squads}
          selectedId={bId}
          onSelect={setBId}
          excludeId={aId}
        />
      </View>

      <View style={styles.divider} />

      {loadingVs && !vsData ? (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color={Colors.dark.tint} />
        </View>
      ) : vsData ? (
        <>
          <View style={styles.namesRow}>
            <Text style={styles.squadName} numberOfLines={1}>
              {vsData.a.squadName}
            </Text>
            <Text style={styles.vsText}>VS</Text>
            <Text
              style={[styles.squadName, styles.squadNameRight]}
              numberOfLines={1}
            >
              {vsData.b.squadName}
            </Text>
          </View>
          <StatRow label="XP" aVal={vsData.a.xp} bVal={vsData.b.xp} />
          <StatRow
            label="Matches"
            aVal={vsData.a.matchesPlayed}
            bVal={vsData.b.matchesPlayed}
          />
          <StatRow label="Wins" aVal={vsData.a.matchesWon} bVal={vsData.b.matchesWon} />
          <StatRow
            label="Attendance"
            aVal={vsData.a.attendance}
            bVal={vsData.b.attendance}
          />
          <StatRow
            label="Members"
            aVal={vsData.a.memberCount}
            bVal={vsData.b.memberCount}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  card: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: FontSizes.md,
    fontWeight: "700",
    marginTop: 2,
  },
  windowToggle: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  windowChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  windowChipActive: {
    backgroundColor: Colors.dark.tint,
  },
  windowText: {
    color: Colors.dark.text,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  windowTextActive: {
    color: "#000",
  },
  pickerLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: Spacing.sm,
  },
  pickerLabel: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  pickerStack: {
    gap: Spacing.xs,
  },
  pickerRow: {
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  pickerChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    maxWidth: 180,
  },
  pickerChipActive: {
    backgroundColor: Colors.dark.tint + "33",
    borderColor: Colors.dark.tint,
  },
  pickerText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  pickerTextActive: {
    color: Colors.dark.tint,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: Spacing.sm,
  },
  namesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  squadName: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  squadNameRight: {
    textAlign: "right",
  },
  vsText: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  statSide: {
    flex: 1,
  },
  statSideRight: {
    alignItems: "flex-end",
  },
  statValue: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    opacity: 0.7,
  },
  winValue: {
    color: Colors.dark.tint,
    opacity: 1,
  },
  statUnit: {
    color: Colors.dark.text,
    fontSize: FontSizes.xs,
    fontWeight: "600",
    opacity: 0.6,
  },
  statLabel: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.8,
    minWidth: 88,
    textAlign: "center",
  },
});
