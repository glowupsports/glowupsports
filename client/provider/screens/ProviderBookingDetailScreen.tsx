import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import { apiRequest, getStaticAssetsUrl } from "@/lib/query-client";
import { Colors, Spacing } from "@/constants/theme";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  notes: string | null;
  totalAmount: string;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: string;
    service?: {
      id: string;
      name: string;
      iconName: string;
      durationMinutes: number | null;
      description?: string;
    };
  }>;
  player?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  confirmed: Colors.dark.primary,
  completed: Colors.dark.textSecondary,
  cancelled: Colors.dark.error,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "No time set";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconContainer}>
        <Ionicons name={icon as any} size={16} color={Colors.dark.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProviderBookingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const booking: Booking = route.params?.booking;

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/provider/bookings/${booking.id}/status`, {
        status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me/bookings"] });
      setTimeout(() => navigation.goBack(), 350);
    },
    onError: () =>
      Alert.alert("Error", "Failed to update booking status. Please try again."),
  });

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Pressable
          style={[styles.backButton, { marginLeft: Spacing.lg }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Booking not found</Text>
        </View>
      </View>
    );
  }

  const service = booking.items?.[0]?.service;
  const serviceName = service?.name ?? "Service Booking";
  const serviceIcon = (service?.iconName as any) ?? "build-outline";
  const statusColor = STATUS_COLORS[booking.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
  const price = `AED ${parseFloat(booking.totalAmount).toFixed(0)}`;

  const handleConfirm = () => {
    Alert.alert("Confirm Booking", "Confirm this booking for the player?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: () => statusMutation.mutate("confirmed"),
      },
    ]);
  };

  const handleDecline = () => {
    Alert.alert("Decline Booking", "Are you sure you want to decline this booking?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => statusMutation.mutate("cancelled"),
      },
    ]);
  };

  const handleComplete = () => {
    Alert.alert("Mark Complete", "Mark this booking as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Complete",
        onPress: () => statusMutation.mutate("completed"),
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert("Cancel Booking", "Are you sure you want to cancel this booking?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Booking",
        style: "destructive",
        onPress: () => statusMutation.mutate("cancelled"),
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <View style={styles.orderHeader}>
            <View style={styles.serviceIconLarge}>
              <Ionicons name={serviceIcon} size={32} color={Colors.dark.primary} />
            </View>
            <View style={styles.orderHeaderInfo}>
              <Text style={styles.serviceName}>{serviceName}</Text>
              <Text style={styles.orderNumber}>Order #{booking.orderNumber}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </Animated.View>

        {booking.player ? (
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PLAYER</Text>
              <View style={styles.playerCard}>
                {booking.player.profilePhotoUrl ? (
                  <Image
                    source={{
                      uri: booking.player.profilePhotoUrl.startsWith("/")
                        ? getStaticAssetsUrl() + booking.player.profilePhotoUrl
                        : booking.player.profilePhotoUrl,
                    }}
                    style={styles.playerPhoto}
                  />
                ) : (
                  <View style={styles.playerPhotoPlaceholder}>
                    <Ionicons name="person" size={24} color={Colors.dark.textSecondary} />
                  </View>
                )}
                <View style={styles.playerCardInfo}>
                  <Text style={styles.playerCardName}>{booking.player.name}</Text>
                  <View style={styles.levelBadge}>
                    <Ionicons name="flash" size={11} color={Colors.dark.primary} />
                    <Text style={styles.levelText}>Level {booking.player.level}</Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(150).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BOOKING INFO</Text>
            <View style={styles.infoCard}>
              <InfoRow
                icon="calendar-outline"
                label="Scheduled"
                value={formatDateTime(booking.scheduledAt)}
              />
              <View style={styles.infoDivider} />
              <InfoRow
                icon="cash-outline"
                label="Amount"
                value={price}
              />
              {service?.durationMinutes ? (
                <>
                  <View style={styles.infoDivider} />
                  <InfoRow
                    icon="time-outline"
                    label="Duration"
                    value={`${service.durationMinutes} minutes`}
                  />
                </>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {booking.notes ? (
          <Animated.View entering={FadeInUp.delay(200).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES FROM PLAYER</Text>
              <View style={styles.notesCard}>
                <Text style={styles.notesText}>{booking.notes}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {service?.description ? (
          <Animated.View entering={FadeInUp.delay(240).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SERVICE DETAILS</Text>
              <View style={styles.notesCard}>
                <Text style={styles.notesText}>{service.description}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      {(booking.status === "pending" || booking.status === "confirmed") ? (
        <Animated.View
          entering={FadeInUp.delay(300).duration(300)}
          style={[styles.actionBar, { paddingBottom: insets.bottom + Spacing.md }]}
        >
          {booking.status === "pending" ? (
            <>
              <Pressable
                style={[styles.actionButton, styles.actionButtonOutline]}
                onPress={handleDecline}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="close" size={18} color={Colors.dark.error} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.error }]}>
                  Decline
                </Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleConfirm}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="checkmark" size={18} color={Colors.dark.backgroundDefault} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.backgroundDefault }]}>
                  Confirm Booking
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.actionButton, styles.actionButtonOutline]}
                onPress={handleCancel}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="close" size={18} color={Colors.dark.error} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.error }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleComplete}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="checkmark-done" size={18} color={Colors.dark.backgroundDefault} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.backgroundDefault }]}>
                  Mark Complete
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  serviceIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  orderHeaderInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  orderNumber: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  playerPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  playerPhotoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  playerCardInfo: {
    flex: 1,
    gap: 4,
  },
  playerCardName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  levelText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  infoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.md,
  },
  notesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  notesText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  actionButtonPrimary: {
    backgroundColor: Colors.dark.primary,
    flex: 2,
  },
  actionButtonOutline: {
    borderWidth: 1,
    borderColor: Colors.dark.error + "60",
    backgroundColor: Colors.dark.error + "10",
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
