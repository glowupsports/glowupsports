import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface Drill {
  id: string;
  name: string;
  skillArea: string;
  stageRange: string[];
  instruction: string;
  repRange: string | null;
  milestoneCriteria: string | null;
  source: string | null;
}

const SKILL_AREA_CONFIG: Record<string, { label: string; color: string; icon: IoniconsName }> = {
  TECHNIQUE: { label: "Technique", color: Colors.dark.xpCyan, icon: "flash-outline" },
  TACTICAL: { label: "Tactical", color: Colors.dark.primary, icon: "map-outline" },
  PHYSICAL: { label: "Physical", color: Colors.dark.successNeon, icon: "fitness-outline" },
  MENTAL: { label: "Mental", color: Colors.dark.gold, icon: "bulb-outline" },
  SERVE: { label: "Serve", color: "#FF8C00", icon: "arrow-up-circle-outline" },
  RETURN: { label: "Return", color: "#A855F7", icon: "arrow-down-circle-outline" },
  VOLLEYS: { label: "Volleys", color: "#EC4899", icon: "swap-horizontal-outline" },
  SOCIAL: { label: "Social", color: "#10B981", icon: "people-outline" },
};

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  RED: { label: "Red", color: "#EF4444" },
  ORANGE: { label: "Orange", color: "#F97316" },
  GREEN: { label: "Green", color: "#22C55E" },
  YELLOW: { label: "Yellow", color: "#EAB308" },
  GLOW: { label: "Glow", color: Colors.dark.primary },
};

export function DrillBankTab({ insets, tabBarHeight }: TabProps) {
  const onScroll = useCoachingScroll();
  const [searchText, setSearchText] = useState("");
  const [activeSkillArea, setActiveSkillArea] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyToNotes = async (drill: Drill) => {
    const text = [
      `Drill: ${drill.name}`,
      drill.repRange ? `Reps/Sets: ${drill.repRange}` : null,
      `\nInstructions:\n${drill.instruction}`,
      drill.milestoneCriteria ? `\nSuccess Criteria:\n${drill.milestoneCriteria}` : null,
    ].filter(Boolean).join("\n");
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const { data, isLoading, isError } = useQuery<{ drills: Drill[]; total: number }>({
    queryKey: ["/api/drills"],
  });

  const allDrills = data?.drills ?? [];

  const skillAreas = useMemo(() => {
    const areas = new Set<string>();
    allDrills.forEach(d => areas.add(d.skillArea));
    return Array.from(areas).sort();
  }, [allDrills]);

  const stages = useMemo(() => {
    const stagesSet = new Set<string>();
    allDrills.forEach(d => (d.stageRange ?? []).forEach(s => stagesSet.add(s)));
    return ["RED", "ORANGE", "GREEN", "YELLOW", "GLOW"].filter(s => stagesSet.has(s));
  }, [allDrills]);

  const filtered = useMemo(() => {
    return allDrills.filter(d => {
      if (activeSkillArea && d.skillArea !== activeSkillArea) return false;
      if (activeStage && !(d.stageRange ?? []).includes(activeStage)) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        if (
          !d.name.toLowerCase().includes(q) &&
          !d.instruction.toLowerCase().includes(q) &&
          !(d.milestoneCriteria ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [allDrills, activeSkillArea, activeStage, searchText]);

  const getSkillConfig = (area: string): { label: string; color: string; icon: IoniconsName } =>
    SKILL_AREA_CONFIG[area] ?? { label: area, color: Colors.dark.textMuted, icon: "grid-outline" as IoniconsName };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search drills..."
            placeholderTextColor={Colors.dark.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
          />
          {searchText.length > 0 ? (
            <Pressable onPress={() => setSearchText("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Skill Area Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        <Pressable
          style={[styles.filterChip, activeSkillArea === null && styles.filterChipActive]}
          onPress={() => setActiveSkillArea(null)}
        >
          <Text style={[styles.filterChipText, activeSkillArea === null && styles.filterChipTextActive]}>
            All Areas
          </Text>
        </Pressable>
        {skillAreas.map(area => {
          const cfg = getSkillConfig(area);
          const isActive = activeSkillArea === area;
          return (
            <Pressable
              key={area}
              style={[styles.filterChip, isActive && { borderColor: cfg.color, backgroundColor: cfg.color + "20" }]}
              onPress={() => setActiveSkillArea(isActive ? null : area)}
            >
              <Ionicons name={cfg.icon} size={12} color={isActive ? cfg.color : Colors.dark.textMuted} />
              <Text style={[styles.filterChipText, isActive && { color: cfg.color }]}>{cfg.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Stage Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        <Pressable
          style={[styles.filterChip, activeStage === null && styles.filterChipActive]}
          onPress={() => setActiveStage(null)}
        >
          <Text style={[styles.filterChipText, activeStage === null && styles.filterChipTextActive]}>
            All Stages
          </Text>
        </Pressable>
        {stages.map(stage => {
          const cfg = STAGE_CONFIG[stage] ?? { label: stage, color: Colors.dark.textMuted };
          const isActive = activeStage === stage;
          return (
            <Pressable
              key={stage}
              style={[styles.filterChip, isActive && { borderColor: cfg.color, backgroundColor: cfg.color + "20" }]}
              onPress={() => setActiveStage(isActive ? null : stage)}
            >
              <View style={[styles.stageDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.filterChipText, isActive && { color: cfg.color }]}>{cfg.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {isLoading ? "Loading..." : `${filtered.length} drills`}
          {(activeSkillArea || activeStage || searchText) ? " (filtered)" : ""}
        </Text>
      </View>

      {/* Drill List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading drills...</Text>
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={32} color={Colors.dark.error} />
            <Text style={styles.errorText}>Failed to load drills</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={32} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No drills found</Text>
            <Text style={styles.emptySubText}>Try adjusting your filters</Text>
          </View>
        ) : (
          filtered.map(drill => {
            const cfg = getSkillConfig(drill.skillArea);
            return (
              <Pressable
                key={drill.id}
                style={styles.drillCard}
                onPress={() => setSelectedDrill(drill)}
              >
                <View style={styles.drillCardHeader}>
                  <View style={[styles.drillIconBadge, { backgroundColor: cfg.color + "20" }]}>
                    <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                  </View>
                  <View style={styles.drillCardTitleBlock}>
                    <Text style={styles.drillCardName} numberOfLines={1}>{drill.name}</Text>
                    <View style={styles.drillCardMeta}>
                      <Text style={[styles.drillCardArea, { color: cfg.color }]}>{cfg.label}</Text>
                      {drill.repRange ? (
                        <>
                          <Text style={styles.metaDot}> · </Text>
                          <Text style={styles.drillCardRep}>{drill.repRange}</Text>
                        </>
                      ) : null}
                      {drill.source ? (
                        <>
                          <Text style={styles.metaDot}> · </Text>
                          <Text style={styles.drillCardSource}>{drill.source}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
                </View>

                {/* Stage Range Chips */}
                {(drill.stageRange ?? []).length > 0 ? (
                  <View style={styles.stagePillRow}>
                    {(drill.stageRange ?? []).map(s => {
                      const sc = STAGE_CONFIG[s] ?? { label: s, color: Colors.dark.textMuted };
                      return (
                        <View key={s} style={[styles.stagePill, { backgroundColor: sc.color + "25" }]}>
                          <Text style={[styles.stagePillText, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Instruction Preview */}
                <Text style={styles.drillCardInstruction} numberOfLines={2}>
                  {drill.instruction}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Drill Detail Modal */}
      {selectedDrill ? (
        <Modal
          visible={!!selectedDrill}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedDrill(null)}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Pressable style={styles.modalClose} onPress={() => setSelectedDrill(null)}>
                <Ionicons name="close" size={22} color={Colors.dark.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                const cfg = getSkillConfig(selectedDrill.skillArea);
                return (
                  <>
                    {/* Icon + Name */}
                    <View style={[styles.modalIconWrap, { backgroundColor: cfg.color + "20" }]}>
                      <Ionicons name={cfg.icon} size={28} color={cfg.color} />
                    </View>
                    <Text style={styles.modalTitle}>{selectedDrill.name}</Text>

                    {/* Meta Row */}
                    <View style={styles.modalMetaRow}>
                      <View style={[styles.modalMetaBadge, { backgroundColor: cfg.color + "20" }]}>
                        <Text style={[styles.modalMetaBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {selectedDrill.repRange ? (
                        <View style={styles.modalMetaBadge}>
                          <Ionicons name="repeat-outline" size={12} color={Colors.dark.textMuted} />
                          <Text style={styles.modalMetaBadgeText}>{selectedDrill.repRange}</Text>
                        </View>
                      ) : null}
                      {selectedDrill.source ? (
                        <View style={styles.modalMetaBadge}>
                          <Text style={styles.modalMetaBadgeText}>{selectedDrill.source}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Stage Range */}
                    {(selectedDrill.stageRange ?? []).length > 0 ? (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionLabel}>SUITABLE FOR</Text>
                        <View style={styles.stagePillRow}>
                          {(selectedDrill.stageRange ?? []).map(s => {
                            const sc = STAGE_CONFIG[s] ?? { label: s, color: Colors.dark.textMuted };
                            return (
                              <View key={s} style={[styles.stagePill, { backgroundColor: sc.color + "25" }]}>
                                <View style={[styles.stageDot, { backgroundColor: sc.color }]} />
                                <Text style={[styles.stagePillText, { color: sc.color }]}>{sc.label} Ball</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {/* Instructions */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionLabel}>INSTRUCTIONS</Text>
                      <Text style={styles.modalBody}>{selectedDrill.instruction}</Text>
                    </View>

                    {/* Milestone Criteria */}
                    {selectedDrill.milestoneCriteria ? (
                      <View style={[styles.modalSection, styles.milestoneSection]}>
                        <View style={styles.milestoneLabelRow}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
                          <Text style={[styles.modalSectionLabel, { color: Colors.dark.successNeon }]}>SUCCESS CRITERIA</Text>
                        </View>
                        <Text style={styles.milestoneText}>{selectedDrill.milestoneCriteria}</Text>
                      </View>
                    ) : null}

                    {/* Copy to Session Notes */}
                    <Pressable
                      style={[styles.copyButton, copied && styles.copyButtonCopied]}
                      onPress={() => handleCopyToNotes(selectedDrill)}
                    >
                      <Ionicons
                        name={copied ? "checkmark-circle-outline" : "copy-outline"}
                        size={16}
                        color={copied ? Colors.dark.successNeon : Colors.dark.text}
                      />
                      <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
                        {copied ? "Copied to clipboard" : "Copy to session notes"}
                      </Text>
                    </Pressable>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  searchRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterRow: {
    maxHeight: 40,
    marginBottom: 4,
  },
  filterContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  filterChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  filterChipText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
  },
  stageDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  countRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  countText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  center: {
    alignItems: "center",
    paddingTop: 60,
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 14,
  },
  emptyText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
  },
  drillCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  drillCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  drillIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  drillCardTitleBlock: {
    flex: 1,
  },
  drillCardName: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  drillCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 2,
  },
  drillCardArea: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaDot: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  drillCardRep: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  drillCardSource: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  stagePillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  stagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stagePillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  drillCardInstruction: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
    marginTop: 2,
  },
  // Modal
  modal: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    justifyContent: "center",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
  },
  modalClose: {
    position: "absolute",
    right: Spacing.md,
    top: Spacing.md,
    padding: 4,
  },
  modalContent: {
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.md,
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
  },
  modalMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  modalMetaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: 20,
  },
  modalMetaBadgeText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  modalSection: {
    width: "100%",
    gap: Spacing.xs,
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
  modalBody: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  milestoneSection: {
    backgroundColor: Colors.dark.successNeon + "10",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.successNeon,
  },
  milestoneLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  milestoneText: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: Spacing.sm,
  },
  copyButtonCopied: {
    borderColor: Colors.dark.successNeon,
    backgroundColor: Colors.dark.successNeon + "15",
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  copyButtonTextCopied: {
    color: Colors.dark.successNeon,
  },
});
