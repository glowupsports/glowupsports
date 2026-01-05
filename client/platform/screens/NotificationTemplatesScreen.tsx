import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Switch, Alert, Platform } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface NotificationTemplate {
  id: string;
  name: string;
  type: "email" | "push";
  subject: string;
  body: string;
  enabled: boolean;
  variables: string[];
}

const AVAILABLE_VARIABLES = [
  { key: "{player_name}", description: "Player's full name" },
  { key: "{coach_name}", description: "Coach's full name" },
  { key: "{academy_name}", description: "Academy name" },
  { key: "{session_date}", description: "Session date" },
  { key: "{session_time}", description: "Session time" },
  { key: "{level}", description: "Player's current level" },
  { key: "{xp}", description: "XP amount" },
  { key: "{badge_name}", description: "Badge name" },
  { key: "{amount}", description: "Payment amount" },
];

const DEFAULT_TEMPLATES: NotificationTemplate[] = [
  {
    id: "1",
    name: "Welcome Email",
    type: "email",
    subject: "Welcome to {academy_name}!",
    body: "Hi {player_name},\n\nWelcome to {academy_name}! We're excited to have you join our tennis community.\n\nYour coach {coach_name} is looking forward to helping you improve your game.\n\nBest regards,\nThe {academy_name} Team",
    enabled: true,
    variables: ["{player_name}", "{academy_name}", "{coach_name}"],
  },
  {
    id: "2",
    name: "Session Reminder",
    type: "push",
    subject: "Session in 1 hour",
    body: "Your session with {coach_name} starts at {session_time}. See you on the court!",
    enabled: true,
    variables: ["{coach_name}", "{session_time}"],
  },
  {
    id: "3",
    name: "Level Up",
    type: "push",
    subject: "Congratulations! You leveled up!",
    body: "Amazing work, {player_name}! You've reached Level {level}. Keep up the great progress!",
    enabled: true,
    variables: ["{player_name}", "{level}"],
  },
  {
    id: "4",
    name: "Feedback Available",
    type: "push",
    subject: "New feedback from your coach",
    body: "{coach_name} has left feedback on your recent session. Check your progress to see what they said!",
    enabled: true,
    variables: ["{coach_name}"],
  },
  {
    id: "5",
    name: "Payment Receipt",
    type: "email",
    subject: "Payment Confirmation",
    body: "Hi {player_name},\n\nYour payment of {amount} has been received and confirmed.\n\nThank you for your continued support!\n\nBest regards,\n{academy_name}",
    enabled: true,
    variables: ["{player_name}", "{amount}", "{academy_name}"],
  },
  {
    id: "6",
    name: "Session Cancelled",
    type: "push",
    subject: "Session Cancelled",
    body: "Your session on {session_date} at {session_time} has been cancelled. Please contact your coach for more information.",
    enabled: true,
    variables: ["{session_date}", "{session_time}"],
  },
  {
    id: "7",
    name: "Weekly Progress",
    type: "email",
    subject: "Your Weekly Progress Report",
    body: "Hi {player_name},\n\nHere's your weekly progress summary:\n\n- Total XP earned: {xp}\n- Current Level: {level}\n\nKeep pushing forward!\n\nBest regards,\n{academy_name}",
    enabled: false,
    variables: ["{player_name}", "{xp}", "{level}", "{academy_name}"],
  },
  {
    id: "8",
    name: "Badge Earned",
    type: "push",
    subject: "You earned a new badge!",
    body: "Congratulations {player_name}! You've earned the {badge_name} badge. Check your profile to see it!",
    enabled: true,
    variables: ["{player_name}", "{badge_name}"],
  },
];

export default function NotificationTemplatesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [templates, setTemplates] = useState<NotificationTemplate[]>(DEFAULT_TEMPLATES);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const handleEditTemplate = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditBody(template.body);
    setEditEnabled(template.enabled);
    setShowEditor(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate) return;

    setTemplates(prev =>
      prev.map(t =>
        t.id === editingTemplate.id
          ? { ...t, subject: editSubject, body: editBody, enabled: editEnabled }
          : t
      )
    );
    setShowEditor(false);
    setEditingTemplate(null);
    setHasChanges(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleInsertVariable = (variable: string) => {
    setEditBody(prev => prev + variable);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleToggleEnabled = (id: string) => {
    setTemplates(prev =>
      prev.map(t => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
    setHasChanges(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveAll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("Notification templates saved successfully!");
    } else {
      Alert.alert("Success", "Notification templates saved successfully!");
    }
  };

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
        <Text style={styles.topBarTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Manage email and push notification templates</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Templates</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {templates.filter(t => t.type === "email").map((template) => (
              <Pressable
                key={template.id}
                style={styles.row}
                onPress={() => handleEditTemplate(template)}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                  <Ionicons name="mail" size={20} color={Colors.dark.xpCyan} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{template.name}</Text>
                  <Text style={styles.rowDescription} numberOfLines={1}>{template.subject}</Text>
                </View>
                <Pressable
                  style={styles.toggleContainer}
                  onPress={(e) => { e.stopPropagation(); handleToggleEnabled(template.id); }}
                >
                  <View style={[styles.statusBadge, !template.enabled && styles.statusBadgeDisabled]}>
                    <Text style={[styles.statusText, !template.enabled && styles.statusTextDisabled]}>
                      {template.enabled ? "Active" : "Disabled"}
                    </Text>
                  </View>
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notification Templates</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {templates.filter(t => t.type === "push").map((template) => (
              <Pressable
                key={template.id}
                style={styles.row}
                onPress={() => handleEditTemplate(template)}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${PLATFORM_COLOR}20` }]}>
                  <Ionicons name="notifications" size={20} color={PLATFORM_COLOR} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{template.name}</Text>
                  <Text style={styles.rowDescription} numberOfLines={1}>{template.subject}</Text>
                </View>
                <Pressable
                  style={styles.toggleContainer}
                  onPress={(e) => { e.stopPropagation(); handleToggleEnabled(template.id); }}
                >
                  <View style={[styles.statusBadge, !template.enabled && styles.statusBadgeDisabled]}>
                    <Text style={[styles.statusText, !template.enabled && styles.statusTextDisabled]}>
                      {template.enabled ? "Active" : "Disabled"}
                    </Text>
                  </View>
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        {hasChanges ? (
          <Pressable style={styles.saveButton} onPress={handleSaveAll}>
            <Text style={styles.saveButtonText}>Save All Changes</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={showEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditor(false)}
      >
        <View style={[styles.editorContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.editorHeader}>
            <Pressable style={styles.editorClose} onPress={() => setShowEditor(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.editorTitle}>{editingTemplate?.name}</Text>
            <Pressable style={styles.editorSave} onPress={handleSaveTemplate}>
              <Text style={styles.editorSaveText}>Save</Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.editorContent}
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.editorField}>
              <View style={styles.editorFieldHeader}>
                <Text style={styles.editorLabel}>Enabled</Text>
                <Switch
                  value={editEnabled}
                  onValueChange={setEditEnabled}
                  trackColor={{ false: Colors.dark.backgroundRoot, true: `${PLATFORM_COLOR}80` }}
                  thumbColor={editEnabled ? PLATFORM_COLOR : Colors.dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.editorField}>
              <Text style={styles.editorLabel}>Subject / Title</Text>
              <TextInput
                style={styles.editorInput}
                value={editSubject}
                onChangeText={setEditSubject}
                placeholder="Enter subject..."
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.editorField}>
              <Text style={styles.editorLabel}>Body / Message</Text>
              <TextInput
                style={[styles.editorInput, styles.editorTextArea]}
                value={editBody}
                onChangeText={setEditBody}
                placeholder="Enter message body..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.variablesSection}>
              <Text style={styles.editorLabel}>Insert Variables</Text>
              <Text style={styles.variablesHint}>Tap a variable to insert it into the body</Text>
              <View style={styles.variablesGrid}>
                {AVAILABLE_VARIABLES.map((v) => (
                  <Pressable
                    key={v.key}
                    style={styles.variableChip}
                    onPress={() => handleInsertVariable(v.key)}
                  >
                    <Text style={styles.variableKey}>{v.key}</Text>
                    <Text style={styles.variableDesc}>{v.description}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.previewSection}>
              <Text style={styles.editorLabel}>Preview</Text>
              <View style={styles.previewCard}>
                <Text style={styles.previewSubject}>{editSubject}</Text>
                <Text style={styles.previewBody}>{editBody}</Text>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rowDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  toggleContainer: {
    marginRight: Spacing.sm,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: `${Colors.dark.primary}20`,
    borderRadius: BorderRadius.full,
  },
  statusBadgeDisabled: {
    backgroundColor: `${Colors.dark.textMuted}20`,
  },
  statusText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  statusTextDisabled: {
    color: Colors.dark.textMuted,
  },
  saveButton: {
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  editorContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  editorClose: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  editorTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    flex: 1,
    textAlign: "center",
  },
  editorSave: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.md,
  },
  editorSaveText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  editorContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  editorField: {
    marginBottom: Spacing.lg,
  },
  editorFieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  editorInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundRoot,
  },
  editorTextArea: {
    minHeight: 150,
  },
  variablesSection: {
    marginBottom: Spacing.lg,
  },
  variablesHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  variablesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  variableChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: PLATFORM_COLOR + "40",
  },
  variableKey: {
    ...Typography.small,
    color: PLATFORM_COLOR,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  variableDesc: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  previewSection: {
    marginTop: Spacing.lg,
  },
  previewCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundRoot,
  },
  previewSubject: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  previewBody: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    lineHeight: 22,
  },
});
