import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Payment {
  id: string;
  amount: string;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
}

type RouteParams = {
  ParentPayments: { playerId: string };
};

export default function ParentPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "ParentPayments">>();
  const { playerId } = route.params;

  const { data, isLoading } = useQuery<{ payments: Payment[] }>({
    queryKey: [`/api/parent/payments/${playerId}`],
    enabled: !!playerId,
  });

  const payments = data?.payments || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "#22C55E";
      case "pending":
        return "#FBBF24";
      case "rejected":
        return "#EF4444";
      default:
        return Colors.dark.textMuted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return "checkmark-circle";
      case "pending":
        return "time";
      case "rejected":
        return "close-circle";
      default:
        return "ellipse";
    }
  };

  const getMethodIcon = (method: string | null) => {
    switch (method) {
      case "cash":
        return "cash-outline";
      case "bank_transfer":
        return "swap-horizontal-outline";
      default:
        return "card-outline";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatMethod = (method: string | null) => {
    if (!method) return "—";
    return method.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment History</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.text} />
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="card-outline" size={64} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No Payments</Text>
          <Text style={styles.emptySubtitle}>Your payment history will appear here</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {payments.map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.paymentRow}>
                <View style={styles.methodIcon}>
                  <Ionicons 
                    name={getMethodIcon(payment.paymentMethod) as any} 
                    size={24} 
                    color={Colors.dark.text} 
                  />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentAmount}>
                    {payment.currency} {parseFloat(payment.amount).toFixed(2)}
                  </Text>
                  <Text style={styles.paymentMethod}>{formatMethod(payment.paymentMethod)}</Text>
                </View>
                <View style={styles.paymentStatus}>
                  <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(payment.status)}20` }]}>
                    <Ionicons 
                      name={getStatusIcon(payment.status) as any} 
                      size={14} 
                      color={getStatusColor(payment.status)} 
                    />
                    <Text style={[styles.statusText, { color: getStatusColor(payment.status) }]}>
                      {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.paymentDate}>{formatDate(payment.paymentDate || payment.createdAt)}</Text>
                </View>
              </View>
              {payment.notes ? (
                <View style={styles.notesContainer}>
                  <Text style={styles.notesText}>{payment.notes}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  paymentCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentAmount: {
    ...Typography.subtitle,
    color: Colors.dark.text,
  },
  paymentMethod: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  paymentStatus: {
    alignItems: "flex-end",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  paymentDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  notesContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  notesText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
}));
