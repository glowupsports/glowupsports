import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  academyName: string | null;
  lineItems: any;
  notes: string | null;
}

type RouteParams = {
  ParentInvoices: { playerId: string };
};

export default function ParentInvoicesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "ParentInvoices">>();
  const { playerId } = route.params;

  const { data, isLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: [`/api/parent/invoices/${playerId}`],
    enabled: !!playerId,
  });

  const invoices = data?.invoices || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "#22C55E";
      case "pending":
        return "#FBBF24";
      case "void":
      case "uncollectible":
        return "#EF4444";
      default:
        return Colors.dark.textMuted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return "checkmark-circle";
      case "pending":
        return "time";
      case "void":
      case "uncollectible":
        return "close-circle";
      default:
        return "ellipse";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isOverdue = (invoice: Invoice) => {
    if (invoice.status !== "pending" || !invoice.dueDate) return false;
    return new Date(invoice.dueDate) < new Date();
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const parseLineItems = (lineItems: any): Array<{ description: string; quantity: number; unitPrice: number; total: number }> => {
    if (!lineItems) return [];
    try {
      const parsed = typeof lineItems === "string" ? JSON.parse(lineItems) : lineItems;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const downloadInvoicePDF = async (invoice: Invoice) => {
    try {
      setDownloadingId(invoice.id);
      
      const token = await AsyncStorage.getItem("auth_token");
      const response = await fetch(
        new URL(`/api/parent/invoices/${playerId}/${invoice.id}/html`, getApiUrl()).toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch invoice");
      }
      
      const html = await response.text();
      const { uri } = await Print.printToFileAsync({ html });
      
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to generate PDF. Please try again.");
    } finally {
      setDownloadingId(null);
    }
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
        <Text style={styles.headerTitle}>Invoices</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.text} />
        </View>
      ) : invoices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No Invoices</Text>
          <Text style={styles.emptySubtitle}>You don't have any invoices yet</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {invoices.map((invoice) => (
            <Pressable 
              key={invoice.id} 
              style={({ pressed }) => [styles.invoiceCard, pressed && styles.invoiceCardPressed]}
              onPress={() => setSelectedInvoice(invoice)}
            >
              <View style={styles.invoiceHeader}>
                <View>
                  <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
                  <Text style={styles.academyText}>{invoice.academyName || "—"}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(invoice.status)}20` }]}>
                  <Ionicons 
                    name={getStatusIcon(invoice.status) as any} 
                    size={14} 
                    color={getStatusColor(invoice.status)} 
                  />
                  <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
                    {isOverdue(invoice) ? "Overdue" : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </Text>
                </View>
              </View>

              <View style={styles.invoiceBody}>
                <View style={styles.invoiceAmount}>
                  <Text style={styles.currency}>{invoice.currency}</Text>
                  <Text style={styles.amount}>{parseFloat(invoice.amount).toFixed(2)}</Text>
                </View>

                <View style={styles.invoiceDates}>
                  <View style={styles.dateRow}>
                    <Text style={styles.dateLabel}>Issued</Text>
                    <Text style={styles.dateValue}>{formatDate(invoice.createdAt)}</Text>
                  </View>
                  <View style={styles.dateRow}>
                    <Text style={styles.dateLabel}>Due</Text>
                    <Text style={[styles.dateValue, isOverdue(invoice) && { color: "#EF4444" }]}>
                      {formatDate(invoice.dueDate)}
                    </Text>
                  </View>
                  {invoice.paidAt ? (
                    <View style={styles.dateRow}>
                      <Text style={styles.dateLabel}>Paid</Text>
                      <Text style={[styles.dateValue, { color: "#22C55E" }]}>{formatDate(invoice.paidAt)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.invoiceFooter}>
                <View style={styles.tapHint}>
                  <Text style={styles.tapHintText}>Tap for details</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.dark.tabIconDefault} />
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!selectedInvoice} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invoice Details</Text>
              <Pressable 
                onPress={() => setSelectedInvoice(null)} 
                style={({ pressed }) => [styles.modalCloseButton, pressed && styles.buttonPressed]}
              >
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {selectedInvoice ? (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Invoice Number</Text>
                    <Text style={styles.detailValue}>{selectedInvoice.invoiceNumber}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Academy</Text>
                    <Text style={styles.detailValue}>{selectedInvoice.academyName || "—"}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(selectedInvoice.status)}20` }]}>
                      <Ionicons 
                        name={getStatusIcon(selectedInvoice.status) as any} 
                        size={14} 
                        color={getStatusColor(selectedInvoice.status)} 
                      />
                      <Text style={[styles.statusText, { color: getStatusColor(selectedInvoice.status) }]}>
                        {isOverdue(selectedInvoice) ? "Overdue" : selectedInvoice.status.charAt(0).toUpperCase() + selectedInvoice.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>Dates</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Issued</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedInvoice.createdAt)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Due Date</Text>
                    <Text style={[styles.detailValue, isOverdue(selectedInvoice) && { color: "#EF4444" }]}>
                      {formatDate(selectedInvoice.dueDate)}
                    </Text>
                  </View>
                  {selectedInvoice.paidAt ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Paid On</Text>
                      <Text style={[styles.detailValue, { color: "#22C55E" }]}>
                        {formatDate(selectedInvoice.paidAt)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {parseLineItems(selectedInvoice.lineItems).length > 0 ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Items</Text>
                    {parseLineItems(selectedInvoice.lineItems).map((item, index) => (
                      <View key={index} style={styles.lineItem}>
                        <View style={styles.lineItemInfo}>
                          <Text style={styles.lineItemDescription}>{item.description}</Text>
                          <Text style={styles.lineItemQty}>
                            {item.quantity} x {selectedInvoice.currency} {item.unitPrice.toFixed(2)}
                          </Text>
                        </View>
                        <Text style={styles.lineItemTotal}>
                          {selectedInvoice.currency} {item.total.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.totalSection}>
                  <Text style={styles.totalLabel}>Total Amount</Text>
                  <Text style={styles.totalValue}>
                    {selectedInvoice.currency} {parseFloat(selectedInvoice.amount).toFixed(2)}
                  </Text>
                </View>

                {selectedInvoice.notes ? (
                  <View style={styles.notesSection}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <Text style={styles.notesText}>{selectedInvoice.notes}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable 
                    style={({ pressed }) => [
                      styles.downloadButtonModal, 
                      pressed && styles.buttonPressed,
                      downloadingId === selectedInvoice.id && styles.downloadButtonDisabled,
                    ]} 
                    onPress={() => downloadInvoicePDF(selectedInvoice)}
                    disabled={downloadingId === selectedInvoice.id}
                  >
                    {downloadingId === selectedInvoice.id ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <Ionicons name="download-outline" size={20} color={Colors.dark.text} />
                    )}
                    <Text style={styles.downloadButtonText}>
                      {downloadingId === selectedInvoice.id ? "Generating..." : "Download PDF"}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
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
  invoiceCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  invoiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  invoiceNumber: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  academyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
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
  invoiceBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  invoiceAmount: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  currency: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  amount: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  invoiceDates: {
    gap: 4,
  },
  dateRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  dateLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 45,
  },
  dateValue: {
    ...Typography.caption,
    color: Colors.dark.text,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  downloadText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  invoiceCardPressed: {
    opacity: 0.8,
  },
  invoiceFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  tapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  tapHintText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBody: {
    padding: Spacing.lg,
  },
  detailSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  detailLabel: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  detailValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  lineItemInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  lineItemDescription: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  lineItemQty: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  lineItemTotal: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  totalLabel: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  totalValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  notesSection: {
    marginBottom: Spacing.xl,
  },
  notesText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  modalActions: {
    paddingBottom: Spacing.xl,
  },
  downloadButtonModal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  downloadButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
