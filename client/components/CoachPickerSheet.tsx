import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useSupervisorMode, SupervisorCoach } from "@/context/SupervisorModeContext";
import { useAppMode } from "@/context/AppModeContext";

interface ApiCoach {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  status?: string;
  role?: string;
  hourlyRate?: number;
  photoUrl?: string | null;
  academyId?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach",
  assistant: "Assistant",
  intern: "Intern",
  coach: "Coach",
};

const ROLE_COLORS: Record<string, string> = {
  head_coach: Colors.dark.gold,
  assistant: Colors.dark.orange,
  intern: Colors.dark.xpCyan,
  coach: Colors.dark.primary,
};

function getRoleLabel(role?: string) {
  if (!role) return "Coach";
  return ROLE_LABELS[role] || "Coach";
}

function getRoleColor(role?: string) {
  if (!role) return Colors.dark.primary;
  return ROLE_COLORS[role] || Colors.dark.primary;
}

interface CoachRowProps {
  coach: ApiCoach;
  onSelect: (coach: SupervisorCoach) => void;
}

function CoachRow({ coach, onSelect }: CoachRowProps) {
  const color = getRoleColor(coach.role);
  return (
    <Pressable
      style={styles.coachRow}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect({
          id: coach.id,
          name: coach.name,
          photoUrl: coach.photoUrl,
          role: coach.role,
          academyId: coach.academyId,
        });
      }}
    >
      <View style={[styles.avatarCircle, { backgroundColor: color + "20" }]}>
        <Ionicons name="person" size={22} color={color} />
      </View>
      <View style={styles.coachInfo}>
        <Text style={styles.coachName}>{coach.name}</Text>
        {coach.specialty ? (
          <Text style={styles.coachSpecialty}>{coach.specialty}</Text>
        ) : null}
      </View>
      <View style={[styles.roleBadge, { backgroundColor: color + "20" }]}>
        <Text style={[styles.roleText, { color }]}>{getRoleLabel(coach.role)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

export function CoachPickerSheet() {
  const insets = useSafeAreaInsets();
  const { showCoachPicker, setShowCoachPicker, setSupervisorCoach } = useSupervisorMode();
  const { setMode } = useAppMode();

  const { data: coaches = [], isLoading, error } = useQuery<ApiCoach[]>({
    queryKey: ["/api/coaches"],
    enabled: showCoachPicker,
  });

  const handleSelect = (coach: SupervisorCoach) => {
    setSupervisorCoach(coach);
    setShowCoachPicker(false);
    setMode("coach");
  };

  const handleDismiss = () => {
    setShowCoachPicker(false);
  };

  return (
    <Modal
      visible={showCoachPicker}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>View as Coach</Text>
          <Text style={styles.subtitle}>Select a coach to view their dashboard</Text>
          <Pressable style={styles.closeBtn} onPress={handleDismiss}>
            <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading coaches...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.dark.error} />
            <Text style={styles.errorText}>Failed to load coaches</Text>
          </View>
        ) : coaches.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="people-outline" size={40} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No coaches in this academy</Text>
          </View>
        ) : (
          <FlatList
            data={coaches}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CoachRow coach={item} onSelect={handleSelect} />
            )}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.lg,
    padding: Spacing.xs,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  listContent: {
    padding: Spacing.md,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  coachInfo: {
    flex: 1,
  },
  coachName: {
    ...Typography.bodyBold,
    color: Colors.dark.text,
  },
  coachSpecialty: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  roleText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  separator: {
    height: Spacing.sm,
  },
});
