import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface JoinRequest {
  id: string;
  academyId: string;
  academyName?: string;
  status: "pending" | "approved" | "rejected";
  message?: string;
  createdAt: string;
}

interface AcademyHubCardProps {
  hasAcademy: boolean;
  academyName?: string;
  onBrowsePress?: () => void;
}

export function AcademyHubCard({ hasAcademy, academyName, onBrowsePress }: AcademyHubCardProps) {
  const navigation = useNavigation<any>();

  const { data: joinRequests, isLoading } = useQuery<JoinRequest[]>({
    queryKey: ["/api/join-requests/my"],
    enabled: !hasAcademy,
  });

  if (hasAcademy) {
    return null;
  }

  const requestsArray = Array.isArray(joinRequests) ? joinRequests : [];
  const pendingRequests = requestsArray.filter(r => r.status === "pending");
  const rejectedRequests = requestsArray.filter(r => r.status === "rejected");
  const hasPendingRequests = pendingRequests.length > 0;

  const handleBrowsePress = () => {
    if (onBrowsePress) {
      onBrowsePress();
    } else {
      navigation.navigate("AcademyBrowser");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="school-outline" size={24} color={Colors.dark.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Find Your Academy</Text>
          <Text style={styles.subtitle}>Join an academy to start your training journey</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Checking requests...</Text>
        </View>
      ) : (
        <>
          {hasPendingRequests ? (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionLabel}>Pending Requests</Text>
              {pendingRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestInfo}>
                    <View style={styles.pendingDot} />
                    <Text style={styles.requestAcademy}>{request.academyName || "Academy"}</Text>
                  </View>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pending</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.hintText}>
                Your coach will review and approve your request soon
              </Text>
            </View>
          ) : null}

          {rejectedRequests.length > 0 && !hasPendingRequests ? (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionLabel}>Request Updates</Text>
              {rejectedRequests.slice(0, 2).map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestInfo}>
                    <View style={styles.rejectedDot} />
                    <Text style={styles.requestAcademy}>{request.academyName || "Academy"}</Text>
                  </View>
                  <View style={styles.rejectedBadge}>
                    <Text style={styles.rejectedBadgeText}>Not Accepted</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {!hasPendingRequests ? (
            <Pressable style={styles.browseButton} onPress={handleBrowsePress}>
              <Ionicons name="search" size={18} color={Colors.dark.buttonText} />
              <Text style={styles.browseButtonText}>Browse Academies</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.browseButtonSecondary} onPress={handleBrowsePress}>
              <Ionicons name="add" size={18} color={Colors.dark.primary} />
              <Text style={styles.browseButtonTextSecondary}>Request Another Academy</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(0, 200, 200, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  requestsSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  requestInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.orange,
  },
  rejectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
  },
  requestAcademy: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  pendingBadge: {
    backgroundColor: "rgba(255, 165, 0, 0.12)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  pendingBadgeText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  rejectedBadge: {
    backgroundColor: "rgba(255, 68, 68, 0.12)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  rejectedBadgeText: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  hintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
    textAlign: "center",
    fontStyle: "italic",
  },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  browseButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  browseButtonSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  browseButtonTextSecondary: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
}));
