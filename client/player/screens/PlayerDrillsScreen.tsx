import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { FlashList } from "@shopify/flash-list";
import { DrillDetailSheet } from "@/player/components/DrillDetailSheet";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DrillItem {
  id: string;
  name: string;
  category: string | null;
  difficulty: string | null;
  durationMinutes: number | null;
  description: string | null;
  steps: string[] | null;
  tips: string | null;
  skillTags: string[] | null;
  instruction: string;
  repRange: string | null;
  skillArea: string;
  isSaved: boolean;
}

export interface AssignedDrill {
  id: string;
  drillId: string;
  coachName: string;
  message: string | null;
  assignedAt: string;
  drill: DrillItem;
}

interface DrillsData {
  drills: DrillItem[];
  grouped: Record<string, DrillItem[]>;
  assigned: AssignedDrill[];
  savedIds: string[];
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: string; color: string }> = {
  "Serve": { icon: "arrow-up-circle-outline", color: "#6366F1" },
  "Forehand": { icon: "flash-outline", color: "#F97316" },
  "Backhand": { icon: "swap-horizontal-outline", color: "#10B981" },
  "Footwork": { icon: "footsteps-outline", color: "#EC4899" },
  "Net Play": { icon: "contract-outline", color: "#0EA5E9" },
  "Match Tactics": { icon: "bulb-outline", color: "#8B5CF6" },
  "Fitness & Conditioning": { icon: "barbell-outline", color: "#F59E0B" },
  "Other": { icon: "ellipsis-horizontal-circle-outline", color: "#6B7280" },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  Beginner: "#22C55E",
  Intermediate: "#F59E0B",
  Advanced: "#EF4444",
};

// ─── DrillCard ───────────────────────────────────────────────────────────────

function DrillCard({
  drill,
  onPress,
  onSave,
}: {
  drill: DrillItem;
  onPress: (drill: DrillItem) => void;
  onSave: (drillId: string) => void;
}) {
  const cat = drill.category ?? "Other";
  const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG["Other"];
  const diffColor = DIFFICULTY_COLORS[drill.difficulty ?? "Intermediate"] ?? "#F59E0B";

  return (
    <Pressable
      style={({ pressed }) => [s.drillCard, pressed && s.pressed]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(drill); }}
    >
      <View style={[s.drillCardIconWrap, { backgroundColor: cfg.color + "22" }]}>
        <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
      </View>
      <View style={s.drillCardBody}>
        <Text style={s.drillCardName} numberOfLines={2}>{drill.name}</Text>
        <View style={s.drillCardMeta}>
          <View style={[s.diffBadge, { backgroundColor: diffColor + "22" }]}>
            <Text style={[s.diffText, { color: diffColor }]}>{drill.difficulty ?? "Intermediate"}</Text>
          </View>
          <View style={s.durationRow}>
            <Ionicons name="time-outline" size={11} color={Colors.dark.textMuted} />
            <Text style={s.durationText}>{drill.durationMinutes ?? 15} min</Text>
          </View>
        </View>
      </View>
      <Pressable
        hitSlop={10}
        onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(drill.id); }}
        accessibilityLabel={drill.isSaved ? "Unsave drill" : "Save drill"}
      >
        <Ionicons
          name={drill.isSaved ? "bookmark" : "bookmark-outline"}
          size={20}
          color={drill.isSaved ? GlowColors.primary : Colors.dark.textMuted}
        />
      </Pressable>
    </Pressable>
  );
}

// ─── AssignedDrillBanner ──────────────────────────────────────────────────────

function AssignedDrillBanner({
  assigned,
  onPress,
  onSave,
  onDismiss,
}: {
  assigned: AssignedDrill[];
  onPress: (drill: DrillItem) => void;
  onSave: (drillId: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (assigned.length === 0) return null;

  return (
    <View style={s.assignedSection}>
      <View style={s.assignedHeader}>
        <Ionicons name="star" size={14} color="#3B82F6" />
        <Text style={s.assignedTitle}>Assigned by Coach</Text>
      </View>
      {assigned.map(item => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [s.assignedCard, pressed && s.pressed]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(item.drill); }}
        >
          <View style={s.assignedCardTop}>
            <View style={s.assignedCardLeft}>
              <Text style={s.assignedCoach}>From {item.coachName}</Text>
              <Text style={s.assignedDrillName} numberOfLines={1}>{item.drill.name}</Text>
              {item.message ? (
                <Text style={s.assignedMessage} numberOfLines={2}>{item.message}</Text>
              ) : null}
            </View>
            <View style={s.assignedActions}>
              <Pressable
                hitSlop={8}
                onPress={(e) => { e.stopPropagation(); onSave(item.drill.id); }}
              >
                <Ionicons
                  name={item.drill.isSaved ? "bookmark" : "bookmark-outline"}
                  size={18}
                  color={item.drill.isSaved ? GlowColors.primary : Colors.dark.textMuted}
                />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={(e) => { e.stopPropagation(); onDismiss(item.id); }}
              >
                <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          </View>
          <View style={s.assignedMeta}>
            <View style={[s.diffBadge, { backgroundColor: DIFFICULTY_COLORS[item.drill.difficulty ?? "Intermediate"] + "22" }]}>
              <Text style={[s.diffText, { color: DIFFICULTY_COLORS[item.drill.difficulty ?? "Intermediate"] }]}>
                {item.drill.difficulty ?? "Intermediate"}
              </Text>
            </View>
            <View style={s.durationRow}>
              <Ionicons name="time-outline" size={11} color={Colors.dark.textMuted} />
              <Text style={s.durationText}>{item.drill.durationMinutes ?? 15} min</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ─── CategorySection ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  drills,
  onPressDrill,
  onSaveDrill,
}: {
  category: string;
  drills: DrillItem[];
  onPressDrill: (drill: DrillItem) => void;
  onSaveDrill: (drillId: string) => void;
}) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG["Other"];

  return (
    <View style={s.categorySection}>
      <View style={s.categoryHeader}>
        <View style={[s.categoryIcon, { backgroundColor: cfg.color + "22" }]}>
          <Ionicons name={cfg.icon as any} size={15} color={cfg.color} />
        </View>
        <Text style={[s.categoryTitle, { color: cfg.color }]}>{category}</Text>
        <Text style={s.categoryCount}>{drills.length}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryRow}
      >
        {drills.map(drill => (
          <DrillCard key={drill.id} drill={drill} onPress={onPressDrill} onSave={onSaveDrill} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── MyDrillsSection ─────────────────────────────────────────────────────────

function MyDrillsSection({
  drills,
  onPressDrill,
  onSaveDrill,
}: {
  drills: DrillItem[];
  onPressDrill: (drill: DrillItem) => void;
  onSaveDrill: (drillId: string) => void;
}) {
  if (drills.length === 0) return null;
  return (
    <View style={s.myDrillsSection}>
      <View style={s.myDrillsHeader}>
        <Ionicons name="bookmark" size={14} color={GlowColors.primary} />
        <Text style={s.myDrillsTitle}>My Drills</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
        {drills.map(drill => (
          <DrillCard key={drill.id} drill={{ ...drill, isSaved: true }} onPress={onPressDrill} onSave={onSaveDrill} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlayerDrillsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedDrill, setSelectedDrill] = useState<DrillItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<DrillsData>({
    queryKey: ["/api/player/me/drills", search],
    queryFn: async () => {
      const { getApiUrl, getAuthHeaders } = await import("@/lib/query-client");
      const url = new URL("/api/player/me/drills", getApiUrl());
      if (search) url.searchParams.set("search", search);
      const res = await fetch(url.toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch drills");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await refetch(); } finally { setIsRefreshing(false); }
  }, [refetch]);

  const handleSaveDrill = useCallback(async (drillId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { getApiUrl, getAuthHeaders } = await import("@/lib/query-client");
      const url = new URL(`/api/player/me/drills/${drillId}/save`, getApiUrl());
      await fetch(url.toString(), { method: "POST", headers: getAuthHeaders() });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/drills"] });
    } catch (e) {
      console.error("Save drill failed", e);
    }
  }, [queryClient]);

  const handleDismissAssigned = useCallback(async (assignmentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { getApiUrl, getAuthHeaders } = await import("@/lib/query-client");
      const url = new URL(`/api/player/me/drills/assigned/${assignmentId}/dismiss`, getApiUrl());
      await fetch(url.toString(), { method: "POST", headers: getAuthHeaders() });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/drills"] });
    } catch (e) {
      console.error("Dismiss assigned drill failed", e);
    }
  }, [queryClient]);

  const savedDrills = useMemo(() => {
    if (!data?.drills) return [];
    return data.drills.filter(d => d.isSaved);
  }, [data]);

  const categories = useMemo(() => {
    if (!data?.grouped) return [];
    return Object.entries(data.grouped);
  }, [data]);

  if (isLoading) {
    return (
      <View style={s.loadingWrap}>
        <Ionicons name="fitness-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={s.loadingText}>Loading drills...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={GlowColors.primary} />}
      >
        {/* Search bar */}
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.dark.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search drills..."
            placeholderTextColor={Colors.dark.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Assigned drills */}
        {data?.assigned && data.assigned.length > 0 ? (
          <AssignedDrillBanner
            assigned={data.assigned}
            onPress={setSelectedDrill}
            onSave={handleSaveDrill}
            onDismiss={handleDismissAssigned}
          />
        ) : null}

        {/* Saved drills */}
        {savedDrills.length > 0 && !search ? (
          <MyDrillsSection drills={savedDrills} onPressDrill={setSelectedDrill} onSaveDrill={handleSaveDrill} />
        ) : null}

        {/* Category sections */}
        {categories.length > 0 ? (
          categories.map(([cat, drillsInCat]) => (
            <CategorySection
              key={cat}
              category={cat}
              drills={drillsInCat}
              onPressDrill={setSelectedDrill}
              onSaveDrill={handleSaveDrill}
            />
          ))
        ) : (
          <View style={s.empty}>
            <Ionicons name="fitness-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={s.emptyText}>
              {search ? "No drills match your search" : "No drills available yet"}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Drill Detail Sheet */}
      {selectedDrill ? (
        <DrillDetailSheet
          drill={selectedDrill}
          onClose={() => setSelectedDrill(null)}
          onSave={() => handleSaveDrill(selectedDrill.id)}
          onLogged={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/player/me/drills"] });
          }}
        />
      ) : null}
    </>
  );
}

const s = makeReactiveStyles(() =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
    content: { gap: Spacing.md, paddingTop: Spacing.md },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md, backgroundColor: Colors.dark.backgroundRoot },
    loadingText: { fontSize: 14, color: Colors.dark.textMuted },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Colors.dark.chipBackground,
      borderRadius: BorderRadius.lg,
      marginHorizontal: Spacing.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.dark.chipBorder,
    },
    searchInput: { flex: 1, fontSize: 14, color: Colors.dark.text, padding: 0 },

    // Assigned section
    assignedSection: {
      marginHorizontal: Spacing.lg,
      gap: Spacing.sm,
    },
    assignedHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    assignedTitle: { fontSize: 13, fontWeight: "800", color: "#3B82F6", letterSpacing: 0.5 },
    assignedCard: {
      backgroundColor: "rgba(59,130,246,0.06)",
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: "rgba(59,130,246,0.25)",
      padding: Spacing.md,
      gap: Spacing.xs,
    },
    assignedCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    assignedCardLeft: { flex: 1, gap: 3 },
    assignedCoach: { fontSize: 11, fontWeight: "700", color: "#3B82F6", letterSpacing: 0.3 },
    assignedDrillName: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
    assignedMessage: { fontSize: 12, color: Colors.dark.textMuted, fontStyle: "italic" },
    assignedActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingLeft: Spacing.sm },
    assignedMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: 4 },

    // My Drills section
    myDrillsSection: { gap: Spacing.sm },
    myDrillsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.lg,
    },
    myDrillsTitle: { fontSize: 13, fontWeight: "800", color: GlowColors.primary, letterSpacing: 0.5 },

    // Category section
    categorySection: { gap: Spacing.sm },
    categoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.lg,
    },
    categoryIcon: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
    categoryTitle: { fontSize: 13, fontWeight: "800", flex: 1, letterSpacing: 0.5 },
    categoryCount: { fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" },
    categoryRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },

    // Drill card
    drillCard: {
      width: 180,
      backgroundColor: Colors.dark.chipBackground,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.dark.chipBorder,
      padding: Spacing.md,
      gap: Spacing.sm,
      flexDirection: "column",
      flexShrink: 0,
    },
    pressed: { opacity: 0.75 },
    drillCardIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    drillCardBody: { flex: 1, gap: 6 },
    drillCardName: { fontSize: 13, fontWeight: "700", color: Colors.dark.text, lineHeight: 17 },
    drillCardMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
    diffBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    diffText: { fontSize: 10, fontWeight: "700" },
    durationRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    durationText: { fontSize: 10, color: Colors.dark.textMuted, fontWeight: "500" },

    // Empty state
    empty: { alignItems: "center", justifyContent: "center", gap: Spacing.md, paddingVertical: 60, paddingHorizontal: Spacing.xl },
    emptyText: { fontSize: 14, color: Colors.dark.textMuted, textAlign: "center" },
  })
);
