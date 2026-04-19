import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface TransferRequest {
  id: string;
  playerId: string;
  fromAcademyId: string;
  toAcademyId: string;
  reason: string | null;
  status: string;
  fromAcademyStatus: string;
  toAcademyStatus: string;
  fromAcademyNote: string | null;
  toAcademyNote: string | null;
  createdAt: string;
  completedAt: string | null;
  fromAcademyName?: string;
  toAcademyName?: string;
}

interface Academy {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "approved":
      return Colors.dark.primary;
    case "rejected":
      return Colors.dark.error;
    default:
      return Colors.dark.orange;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Declined";
    default:
      return "Pending";
  }
}

function TransferRequestCard({ request }: { request: TransferRequest }) {
  const statusColor = getStatusColor(request.status);
  
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <View style={styles.academyFlow}>
          <View style={styles.academyBadge}>
            <Text style={styles.academyBadgeText}>{request.fromAcademyName?.charAt(0) || "?"}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={Colors.dark.textMuted} />
          <View style={[styles.academyBadge, styles.toAcademyBadge]}>
            <Text style={styles.academyBadgeText}>{request.toAcademyName?.charAt(0) || "?"}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{getStatusLabel(request.status)}</Text>
        </View>
      </View>

      <View style={styles.requestDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>From</Text>
          <Text style={styles.detailValue}>{request.fromAcademyName || "Unknown"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>To</Text>
          <Text style={styles.detailValue}>{request.toAcademyName || "Unknown"}</Text>
        </View>
        {request.reason ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reason</Text>
            <Text style={styles.detailValue}>{request.reason}</Text>
          </View>
        ) : null}
      </View>

      {request.status !== "pending" ? (
        <View style={styles.approvalStatus}>
          <View style={styles.approvalRow}>
            <Text style={styles.approvalLabel}>Current Academy</Text>
            <View style={[
              styles.miniStatus, 
              { backgroundColor: `${getStatusColor(request.fromAcademyStatus)}20` }
            ]}>
              <Text style={[styles.miniStatusText, { color: getStatusColor(request.fromAcademyStatus) }]}>
                {getStatusLabel(request.fromAcademyStatus)}
              </Text>
            </View>
          </View>
          <View style={styles.approvalRow}>
            <Text style={styles.approvalLabel}>New Academy</Text>
            <View style={[
              styles.miniStatus, 
              { backgroundColor: `${getStatusColor(request.toAcademyStatus)}20` }
            ]}>
              <Text style={[styles.miniStatusText, { color: getStatusColor(request.toAcademyStatus) }]}>
                {getStatusLabel(request.toAcademyStatus)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {request.fromAcademyNote || request.toAcademyNote ? (
        <View style={styles.notesSection}>
          {request.fromAcademyNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>From current academy:</Text>
              <Text style={styles.noteText}>"{request.fromAcademyNote}"</Text>
            </View>
          ) : null}
          {request.toAcademyNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>From new academy:</Text>
              <Text style={styles.noteText}>"{request.toAcademyNote}"</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.timestamp}>
        Requested {new Date(request.createdAt).toLocaleDateString()}
      </Text>
    </View>
  );
}

export default function TransferRequestScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const toAcademyId = route.params?.academyId;
  const toAcademyName = route.params?.academyName;

  const [reason, setReason] = useState("");

  const { data: requestsData, isLoading: requestsLoading } = useQuery<{ requests: TransferRequest[] }>({
    queryKey: ["/api/player/transfer-requests"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/player/transfer-request", { 
        toAcademyId,
        reason: reason.trim() || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/transfer-requests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Transfer Request Submitted",
        "Your transfer request has been submitted. Both your current academy and the new academy must approve the transfer.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to submit transfer request");
    },
  });

  const myRequests = requestsData?.requests || [];
  const hasPendingTransfer = myRequests.some(r => r.status === "pending");
  const hasRequestForThisAcademy = toAcademyId && myRequests.some(r => r.toAcademyId === toAcademyId);

  if (requestsLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading transfer requests...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Academy Transfer</Text>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {toAcademyId ? (
          <View style={styles.newRequestSection}>
            <Text style={styles.sectionTitle}>Request Transfer</Text>
            <View style={styles.targetAcademy}>
              <View style={styles.academyIcon}>
                <Ionicons name="school" size={24} color={Colors.dark.primary} />
              </View>
              <View style={styles.academyInfo}>
                <Text style={styles.academyName}>{toAcademyName || "Selected Academy"}</Text>
                <Text style={styles.academySubtext}>You want to transfer to this academy</Text>
              </View>
            </View>

            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Why do you want to transfer? (optional)"
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {hasPendingTransfer ? (
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={20} color={Colors.dark.orange} />
                <Text style={styles.warningText}>
                  You already have a pending transfer request. Wait for it to be processed before submitting a new one.
                </Text>
              </View>
            ) : hasRequestForThisAcademy ? (
              <View style={styles.warningBox}>
                <Ionicons name="information-circle" size={20} color={Colors.dark.primary} />
                <Text style={styles.warningText}>
                  You already have a transfer request for this academy.
                </Text>
              </View>
            ) : (
              <Pressable
                style={[styles.submitButton, createMutation.isPending && styles.buttonDisabled]}
                onPress={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color={Colors.dark.buttonText} />
                    <Text style={styles.submitButtonText}>Submit Transfer Request</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        ) : null}

        {myRequests.length > 0 ? (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>
              {toAcademyId ? "Your Transfer History" : "Transfer Requests"}
            </Text>
            {myRequests.map((request) => (
              <TransferRequestCard key={request.id} request={request} />
            ))}
          </View>
        ) : !toAcademyId ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="swap-horizontal-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Transfer Requests</Text>
            <Text style={styles.emptyText}>
              Browse academies to find a new one to transfer to
            </Text>
            <Pressable
              style={styles.browseButton}
              onPress={() => navigation.navigate("AcademyBrowser")}
            >
              <Text style={styles.browseButtonText}>Browse Academies</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  newRequestSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  targetAcademy: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  academyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 200, 200, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  academyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  reasonInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    minHeight: 80,
    marginBottom: Spacing.md,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 165, 0, 0.1)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  warningText: {
    ...Typography.small,
    color: Colors.dark.orange,
    flex: 1,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  submitButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  historySection: {
    marginTop: Spacing.md,
  },
  requestCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  academyFlow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  academyBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  toAcademyBadge: {
    backgroundColor: "rgba(0, 200, 200, 0.2)",
  },
  academyBadgeText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  requestDetails: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  detailValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  approvalStatus: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    gap: Spacing.xs,
  },
  approvalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  approvalLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  miniStatus: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  miniStatusText: {
    ...Typography.caption,
    fontWeight: "500",
  },
  notesSection: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  noteBox: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  noteLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  noteText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  timestamp: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    textAlign: "right",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  browseButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  browseButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
}));
