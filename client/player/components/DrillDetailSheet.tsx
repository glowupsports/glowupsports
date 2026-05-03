import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { DrillLogModal } from "@/player/components/DrillLogModal";
import type { DrillItem } from "@/player/screens/PlayerDrillsScreen";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

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

interface Props {
  drill: DrillItem;
  onClose: () => void;
  onSave: () => void;
  onLogged?: () => void;
}

interface DrillPerStats {
  totalLogs: number;
  bestDuration: number | null;
  avgRating: number | null;
}

export function DrillDetailSheet({ drill, onClose, onSave, onLogged }: Props) {
  const insets = useSafeAreaInsets();
  const [showLog, setShowLog] = useState(false);

  const { data: drillStats } = useQuery<DrillPerStats>({
    queryKey: ["/api/player/me/drills", drill.id, "stats"],
    queryFn: async () => {
      const url = new URL(`/api/player/me/drills/${drill.id}/stats`, getApiUrl());
      const res = await fetch(url.toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch drill stats");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const cat = drill.category ?? "Other";
  const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG["Other"];
  const diffColor = DIFFICULTY_COLORS[drill.difficulty ?? "Intermediate"] ?? "#F59E0B";
  const steps = drill.steps ?? [];
  const skillTags = drill.skillTags ?? [];

  const description = drill.description ?? drill.instruction;

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={[s.catIcon, { backgroundColor: cfg.color + "22" }]}>
              <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
            </View>
            <View style={s.headerText}>
              <Text style={[s.catLabel, { color: cfg.color }]}>{cat.toUpperCase()}</Text>
              <Text style={s.drillName} numberOfLines={2}>{drill.name}</Text>
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
              style={s.saveBtn}
            >
              <Ionicons
                name={drill.isSaved ? "bookmark" : "bookmark-outline"}
                size={24}
                color={drill.isSaved ? GlowColors.primary : Colors.dark.textMuted}
              />
            </Pressable>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          {/* Meta chips */}
          <View style={s.metaRow}>
            <View style={[s.diffChip, { backgroundColor: diffColor + "22" }]}>
              <Text style={[s.diffText, { color: diffColor }]}>{drill.difficulty ?? "Intermediate"}</Text>
            </View>
            <View style={s.durationChip}>
              <Ionicons name="time-outline" size={12} color={Colors.dark.textMuted} />
              <Text style={s.durationText}>{drill.durationMinutes ?? 15} min</Text>
            </View>
            {drill.repRange ? (
              <View style={s.durationChip}>
                <Ionicons name="repeat-outline" size={12} color={Colors.dark.textMuted} />
                <Text style={s.durationText}>{drill.repRange}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            style={s.body}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
          >
            {/* Personal stats */}
            {drillStats && drillStats.totalLogs > 0 ? (
              <View style={s.statsSection}>
                <View style={s.statsRow}>
                  <View style={s.statsCell}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={s.statsCellValue}>{drillStats.totalLogs}</Text>
                    <Text style={s.statsCellLabel}>{drillStats.totalLogs === 1 ? "session" : "sessions"}</Text>
                  </View>
                  {drillStats.bestDuration !== null ? (
                    <View style={s.statsCell}>
                      <Ionicons name="time" size={14} color={GlowColors.primary} />
                      <Text style={s.statsCellValue}>{drillStats.bestDuration}m</Text>
                      <Text style={s.statsCellLabel}>best session</Text>
                    </View>
                  ) : null}
                  {drillStats.avgRating !== null ? (
                    <View style={s.statsCell}>
                      <Ionicons name="star" size={14} color="#FFD700" />
                      <Text style={s.statsCellValue}>{drillStats.avgRating.toFixed(1)}</Text>
                      <Text style={s.statsCellLabel}>avg rating</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Description */}
            {description ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>About this Drill</Text>
                <Text style={s.description}>{description}</Text>
              </View>
            ) : null}

            {/* Steps */}
            {steps.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>How to Do It</Text>
                {steps.map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNum}>
                      <Text style={s.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Tips */}
            {drill.tips ? (
              <View style={[s.section, s.tipsSection]}>
                <View style={s.tipsHeader}>
                  <Ionicons name="bulb-outline" size={16} color="#F59E0B" />
                  <Text style={s.tipsSectionTitle}>Tips</Text>
                </View>
                <Text style={s.tipsText}>{drill.tips}</Text>
              </View>
            ) : null}

            {/* Skill Tags */}
            {skillTags.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Skills Developed</Text>
                <View style={s.tagsRow}>
                  {skillTags.map((tag, i) => (
                    <View key={i} style={s.tag}>
                      <Text style={s.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Log button */}
          <Pressable
            style={({ pressed }) => [s.logBtn, pressed && s.logBtnPressed]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowLog(true); }}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#000" />
            <Text style={s.logBtnText}>Log This Drill</Text>
          </Pressable>
        </View>
      </View>

      {showLog ? (
        <DrillLogModal
          drill={drill}
          onClose={() => setShowLog(false)}
          onLogged={() => {
            setShowLog(false);
            onLogged?.();
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingTop: 12,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  catIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, gap: 2 },
  catLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  drillName: { fontSize: 17, fontWeight: "800", color: Colors.dark.text, lineHeight: 21 },
  saveBtn: { padding: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" },
  diffChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  diffText: { fontSize: 12, fontWeight: "700" },
  durationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  durationText: { fontSize: 12, color: Colors.dark.textMuted, fontWeight: "500" },
  body: { flex: 1 },
  section: { gap: Spacing.sm, marginBottom: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: Colors.dark.text, letterSpacing: 0.3 },
  description: { fontSize: 14, color: Colors.dark.textSubtle, lineHeight: 20 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GlowColors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: { fontSize: 12, fontWeight: "800", color: GlowColors.primary },
  stepText: { flex: 1, fontSize: 14, color: Colors.dark.textSubtle, lineHeight: 20 },
  tipsSection: {
    backgroundColor: "rgba(245,158,11,0.07)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  tipsHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipsSectionTitle: { fontSize: 13, fontWeight: "800", color: "#F59E0B" },
  tipsText: { fontSize: 14, color: Colors.dark.textSubtle, lineHeight: 20 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  tagText: { fontSize: 12, color: Colors.dark.textMuted, fontWeight: "500" },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
    marginTop: Spacing.sm,
  },
  logBtnPressed: { opacity: 0.8 },
  logBtnText: { fontSize: 16, fontWeight: "800", color: "#000" },

  // Per-drill stats
  statsSection: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statsCell: {
    alignItems: "center",
    gap: 3,
    flex: 1,
  },
  statsCellValue: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.dark.text,
  },
  statsCellLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
});
