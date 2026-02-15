import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";

interface CoachMembership {
  id: string;
  coachId: string;
  academyId: string;
  role: string;
  isActive: boolean;
  academy: { id: string; name: string; slug: string; isFreelance?: boolean } | null;
}

export function AcademySwitcher() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const [showModal, setShowModal] = useState(false);

  const { data: academies = [], isLoading } = useQuery<CoachMembership[]>({
    queryKey: ["/api/coach/academies"],
  });

  const switchMutation = useMutation({
    mutationFn: async (academyId: string) => {
      return apiRequest("POST", "/api/coach/switch-academy", { academyId });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      queryClient.invalidateQueries();
    },
    onError: () => {
      Alert.alert("Error", "Failed to switch academy");
    },
  });

  const handleSwitch = (academyId: string) => {
    if (academyId === academy?.id) {
      setShowModal(false);
      return;
    }
    switchMutation.mutate(academyId);
  };

  const activeAcademies = academies
    .filter((m) => m.isActive && m.academy)
    .sort((a, b) => {
      if (a.academy?.isFreelance && !b.academy?.isFreelance) return -1;
      if (!a.academy?.isFreelance && b.academy?.isFreelance) return 1;
      return 0;
    });

  if (activeAcademies.length <= 1) {
    return (
      <View style={styles.container}>
        <Text style={styles.academyName}>
          {academy?.name || "My Academy"}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable style={styles.container} onPress={() => setShowModal(true)}>
        <Text style={styles.academyName}>
          {academy?.name || "My Academy"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.dark.disabled} />
      </Pressable>

      <Modal visible={showModal} animationType="fade" transparent>
        <View style={styles.overlay}>
          <Pressable style={styles.backdropTouchable} onPress={() => setShowModal(false)} />
          <View style={[styles.dropdown, { marginTop: insets.top + 60 }]}>
            <Text style={styles.dropdownTitle}>Switch Academy</Text>
            
            {isLoading ? (
              <ActivityIndicator color={Colors.dark.primary} style={{ padding: Spacing.lg }} />
            ) : (
              activeAcademies.map((membership) => (
                <Pressable
                  key={membership.id}
                  style={[
                    styles.academyOption,
                    membership.academyId === academy?.id && styles.academyOptionActive,
                  ]}
                  onPress={() => handleSwitch(membership.academyId)}
                  disabled={switchMutation.isPending}
                >
                  <View style={styles.academyInfo}>
                    <View style={[
                      styles.academyIcon,
                      membership.academyId === academy?.id && styles.academyIconActive,
                      membership.academy?.isFreelance && styles.freelanceIcon,
                    ]}>
                      {membership.academy?.isFreelance ? (
                        <Ionicons name="ribbon" size={18} color={Colors.dark.primary} />
                      ) : (
                        <Text style={styles.academyInitial}>
                          {membership.academy?.name?.charAt(0).toUpperCase() || "A"}
                        </Text>
                      )}
                    </View>
                    <View style={styles.academyDetails}>
                      <View style={styles.academyNameRow}>
                        <Text style={styles.academyOptionName}>
                          {membership.academy?.name || "Academy"}
                        </Text>
                        {membership.academy?.isFreelance ? (
                          <View style={styles.freelanceBadge}>
                            <Text style={styles.freelanceBadgeText}>FREELANCE</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.academyRole}>
                        {membership.academy?.isFreelance ? "Owner" : membership.role}
                      </Text>
                    </View>
                  </View>
                  {membership.academyId === academy?.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
  },
  backdropTouchable: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dropdown: {
    backgroundColor: Colors.dark.backgroundDefault,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  dropdownTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundTertiary,
  },
  academyOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundTertiary,
  },
  academyOptionActive: {
    backgroundColor: "rgba(46, 204, 64, 0.08)",
  },
  academyInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  academyIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  academyIconActive: {
    backgroundColor: "rgba(46, 204, 64, 0.2)",
  },
  academyInitial: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  academyDetails: {
    flex: 1,
  },
  academyOptionName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  academyRole: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "capitalize",
  },
  academyNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  freelanceIcon: {
    backgroundColor: Colors.dark.primary + "20",
  },
  freelanceBadge: {
    backgroundColor: Colors.dark.primary + "25",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  freelanceBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
});
