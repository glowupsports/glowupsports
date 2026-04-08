import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface BookingRequest {
  id: string;
  coachId: string | null;
  coachName?: string;
  requestedStart: string;
  requestedEnd: string;
  duration: number;
  sessionType: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  playerNote?: string | null;
  coachNote?: string | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: Colors.dark.orange, icon: "time" },
  approved: { label: "Approved", color: Colors.dark.primary, icon: "checkmark-circle" },
  declined: { label: "Declined", color: Colors.dark.error, icon: "close-circle" },
  cancelled: { label: "Cancelled", color: Colors.dark.textMuted, icon: "ban" },
};

export default function MyLessonRequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery<BookingRequest[]>({
    queryKey: ["/api/player/booking-requests"],
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/player/booking-requests/${requestId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-requests"] });
      Alert.alert("Cancelled", "Your booking request has been cancelled.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to cancel request");
    },
  });

  const handleCancel = (request: BookingRequest) => {
    Alert.alert(
      "Cancel Request?",
      "Are you sure you want to cancel this booking request?",
      [
        { text: "No", style: "cancel" },
        { text: "Yes, Cancel", style: "destructive", onPress: () => cancelMutation.mutate(request.id) },
      ]
    );
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
    };
  };

  const renderRequest = ({ item }: { item: BookingRequest }) => {
    const statusConfig = STATUS_CONFIG[item.status];
    const startDT = formatDateTime(item.requestedStart);
    const endDT = formatDateTime(item.requestedEnd);

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "20" }]}>
            <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          </View>
          <Text style={styles.sessionType}>{item.sessionType.replace("_", " ").toUpperCase()}</Text>
        </View>

        <View style={styles.requestDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.detailText}>{startDT.date}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.detailText}>{startDT.time} - {endDT.time}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="hourglass-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.detailText}>{item.duration} min</Text>
          </View>
          {item.coachName ? (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.textMuted} />
              <Text style={styles.detailText}>{item.coachName}</Text>
            </View>
          ) : null}
        </View>

        {item.playerNote ? (
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>Your Note:</Text>
            <Text style={styles.noteText}>{item.playerNote}</Text>
          </View>
        ) : null}

        {item.coachNote ? (
          <View style={[styles.noteContainer, { backgroundColor: Colors.dark.primary + "10" }]}>
            <Text style={styles.noteLabel}>Coach's Response:</Text>
            <Text style={styles.noteText}>{item.coachNote}</Text>
          </View>
        ) : null}

        {item.status === "pending" ? (
          <Pressable
            style={styles.cancelButton}
            onPress={() => handleCancel(item)}
            disabled={cancelMutation.isPending}
          >
            <Ionicons name="close" size={18} color={Colors.dark.error} />
            <Text style={styles.cancelButtonText}>Cancel Request</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>No Requests Yet</Text>
        <Text style={styles.emptySubtitle}>Your lesson booking requests will appear here</Text>
        <Pressable style={styles.bookButton} onPress={() => navigation.navigate("LessonBooking")}>
          <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
          <Text style={styles.bookButtonText}>Book a Lesson</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      renderItem={renderRequest}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.lg }]}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  requestCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  sessionType: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  requestDetails: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  noteContainer: {
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  noteLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  noteText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    borderRadius: BorderRadius.md,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  bookButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
