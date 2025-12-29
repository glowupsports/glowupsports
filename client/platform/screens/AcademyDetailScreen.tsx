import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";

const PLATFORM_COLOR = "#9B59B6";

type AcademyDetailRouteProp = RouteProp<PlatformStackParamList, "AcademyDetail">;
type NavigationProp = NativeStackNavigationProp<PlatformStackParamList>;

interface AcademyDetails {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  coaches: { id: string; name: string; email: string }[];
  players: { id: string; name: string; ballLevel: string }[];
  createdAt: string;
}

export default function AcademyDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AcademyDetailRouteProp>();
  const { academyId, academyName } = route.params;
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(academyName);
  const [editCurrency, setEditCurrency] = useState("AED");
  const [editTimezone, setEditTimezone] = useState("Asia/Dubai");

  const { data: academy, isLoading } = useQuery<AcademyDetails>({
    queryKey: ["/api/platform/academies", academyId],
  });

  useEffect(() => {
    if (academy) {
      setEditName(academy.name);
      setEditCurrency(academy.currency || "AED");
      setEditTimezone(academy.timezone || "Asia/Dubai");
    }
  }, [academy]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; currency: string; timezone: string }) => {
      return apiRequest("PATCH", `/api/platform/academies/${academyId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/platform/academies/${academyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    const confirmDelete = () => {
      deleteMutation.mutate();
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to delete "${academyName}"? This action cannot be undone. All associated coaches and players will be removed.`);
      if (confirmed) confirmDelete();
    } else {
      Alert.alert(
        "Delete Academy",
        `Are you sure you want to delete "${academyName}"? This action cannot be undone. All associated coaches and players will be removed.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      name: editName,
      currency: editCurrency,
      timezone: editTimezone,
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading academy...</Text>
      </View>
    );
  }

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
        <Text style={styles.topBarTitle}>{academyName}</Text>
        <Pressable 
          style={styles.editButton} 
          onPress={() => setIsEditing(!isEditing)}
        >
          <Ionicons name={isEditing ? "close" : "create-outline"} size={24} color={PLATFORM_COLOR} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy Details</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.formRow}>
              <Text style={styles.label}>Name</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Academy name"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              ) : (
                <Text style={styles.value}>{academyName}</Text>
              )}
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Currency</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editCurrency}
                  onChangeText={setEditCurrency}
                  placeholder="AED"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              ) : (
                <Text style={styles.value}>{academy?.currency || "AED"}</Text>
              )}
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Timezone</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editTimezone}
                  onChangeText={setEditTimezone}
                  placeholder="Asia/Dubai"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              ) : (
                <Text style={styles.value}>{academy?.timezone || "Asia/Dubai"}</Text>
              )}
            </View>

            {isEditing ? (
              <Pressable 
                style={styles.saveButton}
                onPress={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coaches ({academy?.coaches?.length || 0})</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {academy?.coaches?.length ? (
              academy.coaches.map((coach) => (
                <View key={coach.id} style={styles.listItem}>
                  <View style={styles.listItemIcon}>
                    <Ionicons name="person" size={20} color={PLATFORM_COLOR} />
                  </View>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>{coach.name}</Text>
                    <Text style={styles.listItemSub}>{coach.email}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No coaches assigned</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players ({academy?.players?.length || 0})</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {academy?.players?.length ? (
              academy.players.slice(0, 10).map((player) => (
                <View key={player.id} style={styles.listItem}>
                  <View style={[styles.listItemIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                    <Ionicons name="tennisball" size={20} color={Colors.dark.xpCyan} />
                  </View>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>{player.name}</Text>
                    <Text style={styles.listItemSub}>{player.ballLevel || "No level"}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No players enrolled</Text>
            )}
            {(academy?.players?.length || 0) > 10 ? (
              <Text style={styles.moreText}>+{(academy?.players?.length || 0) - 10} more players</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <Pressable 
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
                <Text style={styles.deleteButtonText}>Delete Academy</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
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
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
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
    color: Colors.dark.text,
    flex: 1,
    textAlign: "center",
  },
  editButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
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
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  formRow: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  value: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  saveButton: {
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  listItemSub: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  moreText: {
    ...Typography.small,
    color: PLATFORM_COLOR,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  deleteButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
});
