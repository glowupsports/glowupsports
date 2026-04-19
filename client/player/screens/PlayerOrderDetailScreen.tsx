import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface UpsellRequest {
  id: string;
  orderId: string;
  label: string;
  price: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  serviceId: string | null;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  itemType: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  subtotal: string;
  scheduledAt: string | null;
  notes: string | null;
  contactName: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  confirmed: Colors.dark.primary,
  processing: "#3B82F6",
  ready: "#10B981",
  completed: Colors.dark.textSecondary,
  cancelled: Colors.dark.error,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Confirmation",
  confirmed: "Confirmed",
  processing: "In Progress",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PlayerOrderDetailScreen() {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const orderId: string = route.params?.orderId;
  const [responding, setResponding] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ order: OrderDetail; items: OrderItem[] }>({
    queryKey: [`/api/player/shop/orders/${orderId}`],
  });

  const { data: upsells, refetch: refetchUpsells } = useQuery<UpsellRequest[]>({
    queryKey: [`/api/player/shop/orders/${orderId}/upsells`],
    enabled: data?.order.status === "confirmed",
    refetchInterval: 15000,
  });

  const pendingUpsells = upsells?.filter((u) => u.status === "pending") ?? [];
  const respondedUpsells = upsells?.filter((u) => u.status !== "pending") ?? [];

  const handleRespond = async (upsell: UpsellRequest, action: "approve" | "decline") => {
    setResponding(upsell.id);
    try {
      const res = await apiRequest("POST", `/api/player/shop/orders/${orderId}/upsells/${upsell.id}/respond`, { action });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      refetchUpsells();
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/pending-upsells"] });
      Alert.alert(
        action === "approve" ? "Extra Added" : "Declined",
        action === "approve"
          ? `"${upsell.label}" has been added to your booking.`
          : `You've declined the "${upsell.label}" extra.`
      );
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to respond.");
    } finally {
      setResponding(null);
    }
  };

  if (isLoading || !data) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight + Spacing.xl }]}>
        <ActivityIndicator color={Colors.dark.primary} />
      </View>
    );
  }

  const { order, items } = data;
  const statusColor = STATUS_COLORS[order.status] ?? Colors.dark.textSecondary;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.statusCard}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNumber}>Booking #{order.orderNumber}</Text>
          <Text style={[styles.statusLabel, { color: statusColor }]}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalAmount}>AED {parseFloat(order.total).toFixed(0)}</Text>
        </View>
      </View>

      {order.scheduledAt ? (
        <View style={styles.infoCard}>
          <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
          <Text style={styles.infoText}>{formatDate(order.scheduledAt)}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>SERVICES</Text>
      <View style={styles.itemsCard}>
        {items.map((item, idx) => (
          <View key={item.id}>
            {idx > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.itemRow}>
              <View style={styles.itemIcon}>
                <Ionicons name="build-outline" size={14} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.quantity > 1 ? <Text style={styles.itemQty}>x{item.quantity}</Text> : null}
              </View>
              <Text style={styles.itemPrice}>AED {parseFloat(item.unitPrice).toFixed(0)}</Text>
            </View>
          </View>
        ))}
      </View>

      {pendingUpsells.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { color: "#FFD700" }]}>EXTRAS PROPOSED</Text>
          {pendingUpsells.map((upsell) => (
            <View key={upsell.id} style={styles.upsellCard}>
              <View style={styles.upsellTop}>
                <Ionicons name="add-circle-outline" size={18} color="#FFD700" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.upsellLabel}>{upsell.label}</Text>
                  <Text style={styles.upsellPrice}>AED {parseFloat(upsell.price).toFixed(0)}</Text>
                </View>
              </View>
              <Text style={styles.upsellHint}>Your provider suggested this extra. Accept to add it to your booking.</Text>
              <View style={styles.upsellActions}>
                <Pressable
                  style={[styles.declineBtn, responding === upsell.id && { opacity: 0.5 }]}
                  onPress={() => handleRespond(upsell, "decline")}
                  disabled={responding === upsell.id}
                >
                  {responding === upsell.id ? (
                    <ActivityIndicator size="small" color={Colors.dark.error} />
                  ) : (
                    <>
                      <Ionicons name="close" size={16} color={Colors.dark.error} />
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.approveBtn, responding === upsell.id && { opacity: 0.5 }]}
                  onPress={() => handleRespond(upsell, "approve")}
                  disabled={responding === upsell.id}
                >
                  {responding === upsell.id ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundDefault} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color={Colors.dark.backgroundDefault} />
                      <Text style={styles.approveBtnText}>Accept Extra</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {respondedUpsells.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>EXTRA HISTORY</Text>
          <View style={styles.itemsCard}>
            {respondedUpsells.map((upsell, idx) => (
              <View key={upsell.id}>
                {idx > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{upsell.label}</Text>
                  </View>
                  <Text style={styles.itemPrice}>AED {parseFloat(upsell.price).toFixed(0)}</Text>
                  <View style={[styles.historyBadge, { backgroundColor: upsell.status === "approved" ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
                    <Text style={[styles.historyBadgeText, { color: upsell.status === "approved" ? Colors.dark.primary : Colors.dark.error }]}>
                      {upsell.status === "approved" ? "Added" : "Declined"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {order.notes ? (
        <>
          <Text style={styles.sectionLabel}>NOTES</Text>
          <View style={styles.notesCard}>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  orderNumber: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  statusLabel: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  totalBadge: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  totalAmount: { fontSize: 15, fontWeight: "800", color: Colors.dark.primary },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  infoText: { fontSize: 14, color: Colors.dark.text, fontWeight: "500" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  itemsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  itemIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  itemQty: { fontSize: 12, color: Colors.dark.textSecondary },
  itemPrice: { fontSize: 14, fontWeight: "700", color: Colors.dark.primary },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginHorizontal: Spacing.md },
  upsellCard: {
    backgroundColor: "#1A1A00",
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#FFD70040",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  upsellTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  upsellLabel: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  upsellPrice: { fontSize: 13, color: "#FFD700", fontWeight: "600" },
  upsellHint: { fontSize: 12, color: Colors.dark.textSecondary, lineHeight: 17 },
  upsellActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  declineBtnText: { fontSize: 14, fontWeight: "600", color: Colors.dark.error },
  approveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary,
  },
  approveBtnText: { fontSize: 14, fontWeight: "700", color: Colors.dark.backgroundDefault },
  historyBadge: {
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  historyBadgeText: { fontSize: 11, fontWeight: "600" },
  notesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
  },
  notesText: { fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 20 },
}));
