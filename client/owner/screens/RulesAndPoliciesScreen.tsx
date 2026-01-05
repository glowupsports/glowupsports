import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Switch } from "react-native";
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
      return apiRequest("/api/owner/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
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
          
          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Cancellation Window</Text>
                <Text style={styles.settingDescription}>
                  Hours before session for free cancellation
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  style={styles.numberInput}
                  value={String(formData.cancellationHours)}
                  onChangeText={(text) => setFormData(prev => ({ 
                    ...prev, 
                    cancellationHours: parseInt(text) || 0 
                  }))}
                  keyboardType="number-pad"
                />
              ) : (
                <Text style={styles.settingValue}>{displaySettings.cancellationHours}h</Text>
              )}
            </View>
          </View>

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

          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Attendance Threshold</Text>
                <Text style={styles.settingDescription}>
                  Minimum attendance percentage to maintain status
                </Text>
              </View>
              {isEditing ? (
                <View style={styles.percentInput}>
                  <TextInput
                    style={styles.numberInput}
                    value={String(formData.attendanceThreshold)}
                    onChangeText={(text) => setFormData(prev => ({ 
                      ...prev, 
                      attendanceThreshold: parseInt(text) || 0 
                    }))}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.percentSign}>%</Text>
                </View>
              ) : (
                <Text style={styles.settingValue}>{displaySettings.attendanceThreshold}%</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>Penalty Rules</Text>
          </View>
          
          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>No-Show Penalty</Text>
                <Text style={styles.settingDescription}>
                  XP deduction for missing without notice
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  style={styles.numberInput}
                  value={String(formData.noShowPenalty)}
                  onChangeText={(text) => setFormData(prev => ({ 
                    ...prev, 
                    noShowPenalty: parseInt(text) || 0 
                  }))}
                  keyboardType="number-pad"
                />
              ) : (
                <Text style={[styles.settingValue, styles.penaltyValue]}>
                  -{displaySettings.noShowPenalty} XP
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Late Cancellation Penalty</Text>
                <Text style={styles.settingDescription}>
                  XP deduction for cancelling after window
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  style={styles.numberInput}
                  value={String(formData.lateCancellationPenalty)}
                  onChangeText={(text) => setFormData(prev => ({ 
                    ...prev, 
                    lateCancellationPenalty: parseInt(text) || 0 
                  }))}
                  keyboardType="number-pad"
                />
              ) : (
                <Text style={[styles.settingValue, styles.penaltyValue]}>
                  -{displaySettings.lateCancellationPenalty} XP
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>XP Rules</Text>
          </View>
          
          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>XP Per Session</Text>
                <Text style={styles.settingDescription}>
                  Base XP awarded for attending a session
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  style={styles.numberInput}
                  value={String(formData.xpPerSession)}
                  onChangeText={(text) => setFormData(prev => ({ 
                    ...prev, 
                    xpPerSession: parseInt(text) || 0 
                  }))}
                  keyboardType="number-pad"
                />
              ) : (
                <Text style={[styles.settingValue, styles.xpValue]}>
                  +{displaySettings.xpPerSession} XP
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Streak Bonus</Text>
                <Text style={styles.settingDescription}>
                  Extra XP for consecutive session attendance
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  style={styles.numberInput}
                  value={String(formData.xpBonusStreak)}
                  onChangeText={(text) => setFormData(prev => ({ 
                    ...prev, 
                    xpBonusStreak: parseInt(text) || 0 
                  }))}
                  keyboardType="number-pad"
                />
              ) : (
                <Text style={[styles.settingValue, styles.xpValue]}>
                  +{displaySettings.xpBonusStreak} XP
                </Text>
              )}
            </View>
          </View>
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

          <View style={[styles.settingCard, CardStyles.elevated]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Max Waitlist Size</Text>
                <Text style={styles.settingDescription}>
                  Maximum players on waitlist per session
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  style={styles.numberInput}
                  value={String(formData.maxWaitlistSize)}
                  onChangeText={(text) => setFormData(prev => ({ 
                    ...prev, 
                    maxWaitlistSize: parseInt(text) || 0 
                  }))}
                  keyboardType="number-pad"
                />
              ) : (
                <Text style={styles.settingValue}>{displaySettings.maxWaitlistSize}</Text>
              )}
            </View>
          </View>
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
    ...Typography.h3,
    color: Colors.dark.text,
  },
  penaltyValue: {
    color: Colors.dark.error,
  },
  xpValue: {
    color: Colors.dark.primary,
  },
  numberInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    minWidth: 60,
    textAlign: "center",
  },
  percentInput: {
    flexDirection: "row",
    alignItems: "center",
  },
  percentSign: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.xs,
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
});
