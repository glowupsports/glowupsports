import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface AcademySettings {
  cancellationHours?: number;
  noShowPenalty?: number;
  lateCancellationPenalty?: number;
  xpPerSession?: number;
  xpBonusStreak?: number;
  attendanceThreshold?: number;
  requireConfirmation?: boolean;
  allowWaitlist?: boolean;
  maxWaitlistSize?: number;
}

const CANCELLATION_HOURS_OPTIONS = [
  { value: 12, label: "12 hours" },
  { value: 24, label: "24 hours" },
  { value: 48, label: "48 hours" },
  { value: 72, label: "72 hours (3 days)" },
];

const PENALTY_XP_OPTIONS = [
  { value: 0, label: "No penalty" },
  { value: 25, label: "-25 XP" },
  { value: 50, label: "-50 XP" },
  { value: 75, label: "-75 XP" },
  { value: 100, label: "-100 XP" },
  { value: 150, label: "-150 XP" },
  { value: 200, label: "-200 XP" },
];

const XP_PER_SESSION_OPTIONS = [
  { value: 5, label: "+5 XP" },
  { value: 10, label: "+10 XP" },
  { value: 15, label: "+15 XP" },
  { value: 20, label: "+20 XP" },
  { value: 25, label: "+25 XP" },
  { value: 50, label: "+50 XP" },
];

const STREAK_BONUS_OPTIONS = [
  { value: 0, label: "No bonus" },
  { value: 2, label: "+2 XP per day" },
  { value: 5, label: "+5 XP per day" },
  { value: 10, label: "+10 XP per day" },
  { value: 15, label: "+15 XP per day" },
];

const ATTENDANCE_THRESHOLD_OPTIONS = [
  { value: 50, label: "50%" },
  { value: 60, label: "60%" },
  { value: 70, label: "70%" },
  { value: 75, label: "75%" },
  { value: 80, label: "80%" },
  { value: 85, label: "85%" },
  { value: 90, label: "90%" },
];

const WAITLIST_SIZE_OPTIONS = [
  { value: 1, label: "1 player" },
  { value: 2, label: "2 players" },
  { value: 3, label: "3 players" },
  { value: 5, label: "5 players" },
  { value: 10, label: "10 players" },
];

interface DropdownPickerProps {
  label: string;
  description: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
  disabled?: boolean;
  valuePrefix?: string;
  valueSuffix?: string;
  valueColor?: string;
}

function DropdownPicker({ 
  label, 
  description, 
  value, 
  options, 
  onChange, 
  disabled,
  valuePrefix = "",
  valueSuffix = "",
  valueColor
}: DropdownPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedOption = options.find(o => o.value === value) || options[0];
  
  return (
    <>
      <View style={[styles.settingCard, CardStyles.elevated]}>
        <Pressable 
          style={styles.settingRow} 
          onPress={() => !disabled && setShowPicker(true)}
          disabled={disabled}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>{label}</Text>
            <Text style={styles.settingDescription}>{description}</Text>
          </View>
          <View style={styles.dropdownValue}>
            <Text style={[
              styles.settingValue, 
              valueColor ? { color: valueColor } : null,
              disabled && styles.disabledText
            ]}>
              {valuePrefix}{selectedOption.label}{valueSuffix}
            </Text>
            {!disabled ? <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} /> : null}
          </View>
        </Pressable>
      </View>
      
      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{label}</Text>
              <Pressable onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.pickerOption,
                    option.value === value && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onChange(option.value);
                    setShowPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerOptionText,
                    option.value === value && styles.pickerOptionTextSelected,
                  ]}>{option.label}</Text>
                  {option.value === value ? (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.dark.gold} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function RulesAndPoliciesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<AcademySettings>({});

  const { data: settings, isLoading } = useQuery<AcademySettings>({
    queryKey: ["/api/owner/settings"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: AcademySettings) => {
      return apiRequest("PATCH", "/api/owner/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/settings"] });
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleEdit = () => {
    setFormData({
      cancellationHours: settings?.cancellationHours || 24,
      noShowPenalty: settings?.noShowPenalty || 100,
      lateCancellationPenalty: settings?.lateCancellationPenalty || 50,
      xpPerSession: settings?.xpPerSession || 10,
      xpBonusStreak: settings?.xpBonusStreak || 5,
      attendanceThreshold: settings?.attendanceThreshold || 80,
      requireConfirmation: settings?.requireConfirmation ?? true,
      allowWaitlist: settings?.allowWaitlist ?? true,
      maxWaitlistSize: settings?.maxWaitlistSize || 3,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }

  const displaySettings = isEditing ? formData : {
    cancellationHours: settings?.cancellationHours || 24,
    noShowPenalty: settings?.noShowPenalty || 100,
    lateCancellationPenalty: settings?.lateCancellationPenalty || 50,
    xpPerSession: settings?.xpPerSession || 10,
    xpBonusStreak: settings?.xpBonusStreak || 5,
    attendanceThreshold: settings?.attendanceThreshold || 80,
    requireConfirmation: settings?.requireConfirmation ?? true,
    allowWaitlist: settings?.allowWaitlist ?? true,
    maxWaitlistSize: settings?.maxWaitlistSize || 3,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Rules & Policies</Text>
        <Pressable 
          style={styles.actionButton} 
          onPress={isEditing ? handleSave : handleEdit}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.gold} />
          ) : (
            <Text style={styles.actionButtonText}>{isEditing ? "Save" : "Edit"}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>Attendance Rules</Text>
          </View>
          
          <DropdownPicker
            label="Cancellation Window"
            description="Hours before session for free cancellation"
            value={displaySettings.cancellationHours || 24}
            options={CANCELLATION_HOURS_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, cancellationHours: value }))}
            disabled={!isEditing}
          />

          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Require Session Confirmation</Text>
                <Text style={styles.settingDescription}>
                  Players must confirm attendance 24h before
                </Text>
              </View>
              <Switch
                value={displaySettings.requireConfirmation}
                onValueChange={(value) => isEditing && setFormData(prev => ({ 
                  ...prev, 
                  requireConfirmation: value 
                }))}
                disabled={!isEditing}
                trackColor={{ false: Colors.dark.backgroundRoot, true: Colors.dark.gold }}
                thumbColor={Colors.dark.text}
              />
            </View>
          </View>

          <DropdownPicker
            label="Attendance Threshold"
            description="Minimum attendance percentage to maintain status"
            value={displaySettings.attendanceThreshold || 80}
            options={ATTENDANCE_THRESHOLD_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, attendanceThreshold: value }))}
            disabled={!isEditing}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>Penalty Rules</Text>
          </View>
          
          <DropdownPicker
            label="No-Show Penalty"
            description="XP deduction for missing without notice"
            value={displaySettings.noShowPenalty || 100}
            options={PENALTY_XP_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, noShowPenalty: value }))}
            disabled={!isEditing}
            valueColor={Colors.dark.error}
          />

          <DropdownPicker
            label="Late Cancellation Penalty"
            description="XP deduction for cancelling after window"
            value={displaySettings.lateCancellationPenalty || 50}
            options={PENALTY_XP_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, lateCancellationPenalty: value }))}
            disabled={!isEditing}
            valueColor={Colors.dark.error}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>XP Rules</Text>
          </View>
          
          <DropdownPicker
            label="XP Per Session"
            description="Base XP awarded for attending a session"
            value={displaySettings.xpPerSession || 10}
            options={XP_PER_SESSION_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, xpPerSession: value }))}
            disabled={!isEditing}
            valueColor={Colors.dark.primary}
          />

          <DropdownPicker
            label="Streak Bonus"
            description="Extra XP for consecutive session attendance"
            value={displaySettings.xpBonusStreak || 5}
            options={STREAK_BONUS_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, xpBonusStreak: value }))}
            disabled={!isEditing}
            valueColor={Colors.dark.primary}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>Waitlist Rules</Text>
          </View>
          
          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Allow Waitlist</Text>
                <Text style={styles.settingDescription}>
                  Enable waitlist for full sessions
                </Text>
              </View>
              <Switch
                value={displaySettings.allowWaitlist}
                onValueChange={(value) => isEditing && setFormData(prev => ({ 
                  ...prev, 
                  allowWaitlist: value 
                }))}
                disabled={!isEditing}
                trackColor={{ false: Colors.dark.backgroundRoot, true: Colors.dark.gold }}
                thumbColor={Colors.dark.text}
              />
            </View>
          </View>

          <DropdownPicker
            label="Max Waitlist Size"
            description="Maximum players on waitlist per session"
            value={displaySettings.maxWaitlistSize || 3}
            options={WAITLIST_SIZE_OPTIONS}
            onChange={(value) => setFormData(prev => ({ ...prev, maxWaitlistSize: value }))}
            disabled={!isEditing}
          />
        </View>

        {isEditing ? (
          <Pressable style={styles.cancelButton} onPress={() => setIsEditing(false)}>
            <Text style={styles.cancelButtonText}>Cancel Changes</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  actionButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  actionButtonText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  settingCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
    marginBottom: 2,
  },
  settingDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  settingValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  disabledText: {
    opacity: 0.7,
  },
  dropdownValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  pickerModal: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    width: "100%",
    maxHeight: "60%",
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundDefault,
  },
  pickerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  pickerList: {
    padding: Spacing.md,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pickerOptionSelected: {
    backgroundColor: Colors.dark.gold + "20",
  },
  pickerOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  pickerOptionTextSelected: {
    color: Colors.dark.gold,
    fontWeight: "600",
  },
});
