import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  Modal} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

interface ProgramTemplate {
  id: string;
  name: string;
  description?: string;
  sessionType?: string;
  ballLevel?: string;
  programCategory?: string;
  defaultDuration?: number;
  defaultMaxPlayers?: number;
  defaultWeekCount?: number;
  defaultPrice?: string;
  currency?: string;
  rules?: string[];
  enrollmentType?: string;
  isActive?: boolean;
}

const PROGRAM_CATEGORIES = [
  { id: "junior", label: "Junior" },
  { id: "adult", label: "Adult" },
  { id: "competitive", label: "Competitive" },
  { id: "social", label: "Social" },
];

const BALL_LEVELS = [
  { id: "adult_beginner", label: "Adult Beginner", color: "#E040FB" },
  { id: "adult_intermediate", label: "Adult Intermediate", color: "#AB47BC" },
  { id: "adult_advanced", label: "Adult Advanced", color: "#7B1FA2" },
  { id: "adult_competitive", label: "Adult Competitive", color: "#F50057" },
  { id: "yellow", label: "Yellow Ball", color: "#EAB308" },
  { id: "green", label: "Green Ball", color: "#22C55E" },
  { id: "orange", label: "Orange Ball", color: "#F97316" },
  { id: "red", label: "Red Ball", color: "#EF4444" },
  { id: "blue", label: "Blue Ball", color: "#3B82F6" },
];

function getBallLevelColor(level?: string): string {
  if (!level) return Colors.dark.primary;
  return BALL_LEVELS.find((b) => b.id === level)?.color || Colors.dark.primary;
}

function CreateTemplateModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [programCategory, setProgramCategory] = useState("junior");
  const [ballLevel, setBallLevel] = useState("yellow");
  const [defaultWeekCount, setDefaultWeekCount] = useState("12");
  const [defaultMaxPlayers, setDefaultMaxPlayers] = useState("6");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [ruleInput, setRuleInput] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [enrollmentType, setEnrollmentType] = useState<"open" | "approval" | "closed">("open");

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/coach/program-templates", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/program-templates"] });
      onCreated();
      setName(""); setDescription(""); setRules([]); setRuleInput("");
    },
    onError: (err: any) => Alert.alert("Error", err.message || "Could not create template"),
  });

  const handleAddRule = () => {
    const t = ruleInput.trim();
    if (!t || rules.length >= 15) return;
    setRules((prev) => [...prev, t]);
    setRuleInput("");
  };

  const handleCreate = () => {
    if (!name.trim()) { Alert.alert("Name required"); return; }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      programCategory,
      ballLevel,
      defaultWeekCount: Number(defaultWeekCount) || 12,
      defaultMaxPlayers: Number(defaultMaxPlayers) || 6,
      defaultPrice: defaultPrice.trim() || null,
      rules,
      enrollmentType,
      sessionType: "group",
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={ptStyles.modalContainer} contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={ptStyles.modalHeader}>
          <Text style={ptStyles.modalTitle}>New Program Template</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        <View style={ptStyles.field}>
          <Text style={ptStyles.label}>Template Name *</Text>
          <TextInput style={ptStyles.input} value={name} onChangeText={setName} placeholder="e.g. Summer Junior Academy" placeholderTextColor={Colors.dark.textMuted} />
        </View>

        <View style={ptStyles.field}>
          <Text style={ptStyles.label}>Description</Text>
          <TextInput style={[ptStyles.input, { height: 72, textAlignVertical: "top" }]} value={description} onChangeText={setDescription} placeholder="Brief description..." placeholderTextColor={Colors.dark.textMuted} multiline />
        </View>

        <View style={ptStyles.field}>
          <Text style={ptStyles.label}>Category</Text>
          <View style={ptStyles.chipRow}>
            {PROGRAM_CATEGORIES.map((c) => (
              <Pressable key={c.id} style={[ptStyles.chip, programCategory === c.id && ptStyles.chipActive]} onPress={() => setProgramCategory(c.id)}>
                <Text style={[ptStyles.chipText, programCategory === c.id && ptStyles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={ptStyles.field}>
          <Text style={ptStyles.label}>Ball Level</Text>
          <View style={ptStyles.chipRow}>
            {BALL_LEVELS.slice(0, 5).map((b) => (
              <Pressable key={b.id} style={[ptStyles.chip, ballLevel === b.id && { borderColor: b.color, backgroundColor: b.color + "20" }]} onPress={() => setBallLevel(b.id)}>
                <View style={[ptStyles.levelDot, { backgroundColor: b.color }]} />
                <Text style={[ptStyles.chipText, ballLevel === b.id && { color: b.color, fontWeight: "700" }]}>{b.label.replace(" Ball", "").replace("Adult ", "")}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={ptStyles.rowFields}>
          <View style={[ptStyles.field, { flex: 1 }]}>
            <Text style={ptStyles.label}>Weeks</Text>
            <TextInput style={ptStyles.input} value={defaultWeekCount} onChangeText={setDefaultWeekCount} keyboardType="number-pad" placeholder="12" placeholderTextColor={Colors.dark.textMuted} />
          </View>
          <View style={[ptStyles.field, { flex: 1 }]}>
            <Text style={ptStyles.label}>Max Players</Text>
            <TextInput style={ptStyles.input} value={defaultMaxPlayers} onChangeText={setDefaultMaxPlayers} keyboardType="number-pad" placeholder="6" placeholderTextColor={Colors.dark.textMuted} />
          </View>
          <View style={[ptStyles.field, { flex: 1 }]}>
            <Text style={ptStyles.label}>Price (AED)</Text>
            <TextInput style={ptStyles.input} value={defaultPrice} onChangeText={setDefaultPrice} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor={Colors.dark.textMuted} />
          </View>
        </View>

        <View style={ptStyles.field}>
          <Text style={ptStyles.label}>Enrollment</Text>
          <View style={ptStyles.chipRow}>
            {(["open", "approval", "closed"] as const).map((type) => (
              <Pressable key={type} style={[ptStyles.chip, enrollmentType === type && ptStyles.chipActive]} onPress={() => setEnrollmentType(type)}>
                <Text style={[ptStyles.chipText, enrollmentType === type && ptStyles.chipTextActive]}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={ptStyles.field}>
          <Text style={ptStyles.label}>Program Rules (optional)</Text>
          {rules.map((r, i) => (
            <View key={i} style={ptStyles.ruleRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={Colors.dark.primary} />
              <Text style={ptStyles.ruleText}>{r}</Text>
              <Pressable onPress={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}>
                <Ionicons name="close-circle" size={16} color={Colors.dark.error} />
              </Pressable>
            </View>
          ))}
          {rules.length < 15 ? (
            <View style={ptStyles.ruleInputRow}>
              <TextInput style={[ptStyles.input, { flex: 1, marginBottom: 0 }]} value={ruleInput} onChangeText={setRuleInput} placeholder="Add a rule..." placeholderTextColor={Colors.dark.textMuted} onSubmitEditing={handleAddRule} returnKeyType="done" />
              <Pressable onPress={handleAddRule} style={ptStyles.addRuleBtn}>
                <Ionicons name="add" size={20} color={Colors.dark.primary} />
              </Pressable>
            </View>
          ) : null}
        </View>

        <Pressable style={ptStyles.createBtn} onPress={handleCreate} disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
          ) : (
            <Text style={ptStyles.createBtnText}>Create Template</Text>
          )}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

export function TemplatesTab({ insets: _insets, tabBarHeight }: TabProps) {
  const navigation = useNavigation<any>();
  const onScroll = useCoachingScroll();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/lesson-templates"],
  });

  const { data: programTemplates = [], isLoading: loadingProgramTemplates } = useQuery<ProgramTemplate[]>({
    queryKey: ["/api/coach/program-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/coach/program-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/coach/program-templates"] }),
    onError: () => Alert.alert("Error", "Could not delete template"),
  });

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete Template", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const ballLevels = [
    { key: "blue", label: "Blue Ball", ages: "2-4 jaar", desc: "Pre-tennis foundation", color: "#3B82F6", icon: "star" },
    { key: "red", label: "Red Ball", ages: "4-8 jaar", desc: "First strokes & rallies", color: "#EF4444", icon: "tennisball" },
    { key: "orange", label: "Orange Ball", ages: "7-10 jaar", desc: "Bigger court, faster ball", color: "#F97316", icon: "tennisball" },
    { key: "green", label: "Green Ball", ages: "9-12 jaar", desc: "Full court transition", color: "#22C55E", icon: "tennisball" },
    { key: "yellow", label: "Yellow Ball", ages: "11+ jaar", desc: "Competition ready", color: "#EAB308", icon: "tennisball" },
  ];

  const getCounts = () => {
    if (!templates || !Array.isArray(templates)) return { blue: 0, red: 0, orange: 0, green: 0, yellow: 0, adult: 0 };
    const grouped: Record<string, number> = { blue: 0, red: 0, orange: 0, green: 0, yellow: 0, adult: 0 };
    templates.forEach((t: any) => {
      const level = t.ballLevel?.toLowerCase() || "adult";
      if (grouped[level] !== undefined) grouped[level]++;
    });
    return grouped;
  };

  const counts = getCounts();
  const totalTemplates = templates?.length || 0;

  if (isLoading) {
    return (
      <View style={templatesStyles.container}>
        <TennisBallSpinner size="large" color={Colors.dark.xpCyan} />
      </View>
    );
  }

  return (
    <>
      <ScrollView 
        style={templatesStyles.container}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={templatesStyles.header}>
          <Text style={templatesStyles.title}>Lesson Templates</Text>
          <Text style={templatesStyles.subtitle}>{totalTemplates} templates across {ballLevels.length} ball levels</Text>
          
          <View style={templatesStyles.countBadges}>
            {ballLevels.map(level => (
              <View key={level.key} style={templatesStyles.countBadge}>
                <View style={[templatesStyles.countDot, { backgroundColor: level.color }]} />
                <Text style={templatesStyles.countText}>{counts[level.key as keyof typeof counts]}</Text>
                <Text style={templatesStyles.countLabel}>{level.key.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>

        {ballLevels.map(level => (
          <Pressable
            key={level.key}
            style={[templatesStyles.levelCard, { backgroundColor: level.color }]}
            onPress={() => navigation.navigate("LessonTemplateLibrary", { initialLevel: level.key })}
          >
            <View style={templatesStyles.levelIcon}>
              <Ionicons name={level.icon as any} size={28} color="#fff" />
            </View>
            <View style={templatesStyles.levelInfo}>
              <Text style={templatesStyles.levelTitle}>{level.label}</Text>
              <Text style={templatesStyles.levelSubtitle}>{level.ages} • {counts[level.key as keyof typeof counts]} templates</Text>
              <Text style={templatesStyles.levelDesc}>{level.desc}</Text>
            </View>
            <Ionicons name="chevron-down" size={24} color="#fff" style={{ opacity: 0.7 }} />
          </Pressable>
        ))}

        {/* Season Program Templates */}
        <View style={ptStyles.sectionHeader}>
          <View style={ptStyles.sectionTitleRow}>
            <Ionicons name="calendar-number-outline" size={18} color={Colors.dark.primary} />
            <Text style={ptStyles.sectionTitle}>Season Program Templates</Text>
          </View>
          <Text style={ptStyles.sectionSubtitle}>Reusable blueprints for recurring programs (terms, rules, defaults)</Text>
          <Pressable style={ptStyles.createTemplateBtnSmall} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add-circle-outline" size={16} color={Colors.dark.primary} />
            <Text style={ptStyles.createTemplateBtnSmallText}>New Template</Text>
          </Pressable>
        </View>

        {loadingProgramTemplates ? (
          <View style={{ padding: Spacing.lg, alignItems: "center" }}>
            <TennisBallSpinner size="small" color={Colors.dark.primary} />
          </View>
        ) : programTemplates.length === 0 ? (
          <View style={ptStyles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={Colors.dark.disabled} />
            <Text style={ptStyles.emptyTitle}>No program templates yet</Text>
            <Text style={ptStyles.emptySubtitle}>Create a template to quickly set up new season programs with pre-configured rules and settings.</Text>
            <Pressable style={ptStyles.createBtn} onPress={() => setShowCreateModal(true)}>
              <Ionicons name="add" size={18} color={Colors.dark.buttonText} />
              <Text style={ptStyles.createBtnText}>Create First Template</Text>
            </Pressable>
          </View>
        ) : (
          <View style={ptStyles.templateList}>
            {programTemplates.map((tmpl) => (
              <View key={tmpl.id} style={ptStyles.templateCard}>
                <View style={[ptStyles.templateColorBar, { backgroundColor: getBallLevelColor(tmpl.ballLevel) }]} />
                <View style={ptStyles.templateBody}>
                  <View style={ptStyles.templateTopRow}>
                    <Text style={ptStyles.templateName}>{tmpl.name}</Text>
                    <Pressable onPress={() => handleDelete(tmpl.id, tmpl.name)} style={ptStyles.deleteBtn}>
                      <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                    </Pressable>
                  </View>
                  {tmpl.description ? (
                    <Text style={ptStyles.templateDesc}>{tmpl.description}</Text>
                  ) : null}
                  <View style={ptStyles.templateMeta}>
                    {tmpl.programCategory ? (
                      <View style={ptStyles.metaChip}>
                        <Text style={ptStyles.metaChipText}>{tmpl.programCategory}</Text>
                      </View>
                    ) : null}
                    {tmpl.ballLevel ? (
                      <View style={[ptStyles.metaChip, { borderColor: getBallLevelColor(tmpl.ballLevel) + "60" }]}>
                        <View style={[ptStyles.levelDot, { backgroundColor: getBallLevelColor(tmpl.ballLevel) }]} />
                        <Text style={[ptStyles.metaChipText, { color: getBallLevelColor(tmpl.ballLevel) }]}>
                          {BALL_LEVELS.find((b) => b.id === tmpl.ballLevel)?.label || tmpl.ballLevel}
                        </Text>
                      </View>
                    ) : null}
                    {tmpl.defaultWeekCount ? (
                      <View style={ptStyles.metaChip}>
                        <Text style={ptStyles.metaChipText}>{tmpl.defaultWeekCount}w</Text>
                      </View>
                    ) : null}
                    {tmpl.defaultMaxPlayers ? (
                      <View style={ptStyles.metaChip}>
                        <Text style={ptStyles.metaChipText}>max {tmpl.defaultMaxPlayers}</Text>
                      </View>
                    ) : null}
                    {tmpl.enrollmentType && tmpl.enrollmentType !== "open" ? (
                      <View style={[ptStyles.metaChip, { borderColor: Colors.dark.warning + "60" }]}>
                        <Text style={[ptStyles.metaChipText, { color: Colors.dark.warning }]}>{tmpl.enrollmentType}</Text>
                      </View>
                    ) : null}
                  </View>
                  {tmpl.rules && tmpl.rules.length > 0 ? (
                    <View style={ptStyles.rulesPreview}>
                      <Ionicons name="document-text-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={ptStyles.rulesPreviewText}>{tmpl.rules.length} rule{tmpl.rules.length !== 1 ? "s" : ""}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <CreateTemplateModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => setShowCreateModal(false)}
      />
    </>
  );
}

const templatesStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled, marginBottom: Spacing.md },
  countBadges: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  countBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  countDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs },
  countText: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, marginRight: Spacing.xs },
  countLabel: { fontSize: 12, color: Colors.dark.disabled },
  levelCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.lg, flexDirection: "row", alignItems: "center" },
  levelIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginRight: Spacing.md },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 2 },
  levelSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginBottom: 2 },
  levelDesc: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
});

const ptStyles = StyleSheet.create({
  sectionHeader: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  createTemplateBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  createTemplateBtnSmallText: {
    color: Colors.dark.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyState: {
    margin: Spacing.lg,
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  emptySubtitle: { fontSize: 13, color: Colors.dark.textMuted, textAlign: "center" },
  templateList: {
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  templateCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  templateColorBar: {
    width: 4,
  },
  templateBody: {
    flex: 1,
    padding: Spacing.md,
  },
  templateTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  templateName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  deleteBtn: { padding: 4 },
  templateDesc: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  templateMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.xs,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  metaChipText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  rulesPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  rulesPreviewText: { fontSize: 12, color: Colors.dark.textMuted },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  createBtnText: { color: Colors.dark.buttonText, fontSize: 15, fontWeight: "700" },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
    paddingTop: Spacing.md,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  field: { marginBottom: Spacing.md },
  rowFields: { flexDirection: "row", gap: Spacing.sm },
  label: { fontSize: 13, fontWeight: "600", color: Colors.dark.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.dark.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 0,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  chipText: { color: Colors.dark.textMuted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: Colors.dark.primary },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  ruleText: { flex: 1, color: Colors.dark.text, fontSize: 13 },
  ruleInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  addRuleBtn: { padding: 4 },
});

// Level Cards Tab - Skill definitions inline
