import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { InvoiceViewerModal, type ViewableInvoice } from "@/components/billing/InvoiceViewerModal";

interface Invoice {
  id: string;
  academyId: string;
  playerId: string | null;
  packageId: string | null;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  lineItems: any;
  notes: string | null;
  createdAt: string;
}

interface Payment {
  id: string;
  academyId: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  stripePaymentId: string | null;
  createdAt: string;
}

interface BillingAccount {
  id: string;
  academyId: string;
  stripeCustomerId: string | null;
  stripeAccountId: string | null;
  billingEmail: string | null;
  billingName: string | null;
  isActive: boolean;
}

interface Player {
  id: string;
  name: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedButton({ onPress, style, children, disabled }: any) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.95, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 400 }); }}
      style={[animatedStyle, style]}
      disabled={disabled}
    >
      {children}
    </AnimatedPressable>
  );
}

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "payments" | "packages">("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [newPackageName, setNewPackageName] = useState("");
  const [newPackageCredits, setNewPackageCredits] = useState("");
  const [newPackagePrice, setNewPackagePrice] = useState("");
  const [newPackageCreditType, setNewPackageCreditType] = useState<"group" | "private" | "semi_private">("private");
  const [newPackageValidityDays, setNewPackageValidityDays] = useState("90");
  const [newInvoiceAmount, setNewInvoiceAmount] = useState("");
  const [newInvoiceNotes, setNewInvoiceNotes] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewerInvoice, setViewerInvoice] = useState<ViewableInvoice | null>(null);

  const openInvoice = (invoice: Invoice) => {
    setViewerInvoice({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      notes: invoice.notes,
      lineItems: invoice.lineItems,
    });
  };

  const { data: account, isLoading: accountLoading } = useQuery<BillingAccount>({
    queryKey: ["/api/billing/account"],
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/billing/payments"],
  });

  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });
  const players = Array.isArray(playersData) ? playersData : [];

  interface PackageTemplate {
    id: string;
    academyId: string;
    name: string;
    creditType: string;
    credits: number;
    pricePerCredit: string;
    currency: string;
    validityDays: number;
    isActive: boolean;
    createdAt: string;
  }

  const { data: packageTemplates = [], isLoading: packagesLoading } = useQuery<PackageTemplate[]>({
    queryKey: ["/api/billing/package-templates"],
  });

  const createPackageMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      creditType: string;
      credits: number;
      pricePerCredit: string;
      validityDays: number;
    }) => {
      return apiRequest("POST", "/api/billing/package-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      setShowPackageModal(false);
      setNewPackageName("");
      setNewPackageCredits("");
      setNewPackagePrice("");
      setNewPackageCreditType("private");
      setNewPackageValidityDays("90");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Credit package created!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to create package");
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/billing/package-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: { amount: number; notes?: string; playerId?: string }) => {
      return apiRequest("POST", "/api/billing/invoices", {
        amount: data.amount,
        notes: data.notes,
        playerId: data.playerId,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      setShowCreateModal(false);
      setNewInvoiceAmount("");
      setNewInvoiceNotes("");
      setSelectedPlayerId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Invoice created!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to create invoice");
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: { invoiceId: string; amount: number }) => {
      return apiRequest("POST", "/api/billing/payments", {
        invoiceId: data.invoiceId,
        amount: data.amount,
        paymentMethod: "cash",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Payment recorded!");
    },
  });

  const handleCreateInvoice = () => {
    const amount = parseFloat(newInvoiceAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    createInvoiceMutation.mutate({
      amount,
      notes: newInvoiceNotes || undefined,
      playerId: selectedPlayerId || undefined,
    });
  };

  const handleMarkAsPaid = (invoice: Invoice) => {
    Alert.alert(
      "Mark as Paid",
      `Record payment of ${invoice.currency} ${invoice.amount}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record Payment",
          onPress: () => recordPaymentMutation.mutate({ invoiceId: invoice.id, amount: invoice.amount }),
        },
      ]
    );
  };

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = invoices
    .filter((i) => i.status === "pending" || i.status === "sent")
    .reduce((sum, i) => sum + i.amount, 0);

  const currency = invoices[0]?.currency || payments[0]?.currency || "AED";

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.statsRow}>
        <LinearGradient
          colors={[`${Colors.dark.primary}20`, "rgba(18, 18, 22, 0.95)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <View style={styles.statIconContainer}>
            <Ionicons name="cash-outline" size={24} color={Colors.dark.primary} />
          </View>
          <Text style={styles.statValue}>{currency} {totalRevenue.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total Revenue</Text>
        </LinearGradient>
        <LinearGradient
          colors={[`${Colors.dark.orange}20`, "rgba(18, 18, 22, 0.95)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <View style={[styles.statIconContainer, { backgroundColor: `${Colors.dark.orange}20` }]}>
            <Ionicons name="time-outline" size={24} color={Colors.dark.orange} />
          </View>
          <Text style={[styles.statValue, { color: Colors.dark.orange }]}>{currency} {pendingAmount.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </LinearGradient>
      </View>

      <View style={styles.glassSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT INVOICES</Text>
          <Pressable onPress={() => setActiveTab("invoices")}>
            <Text style={styles.seeAllLink}>See All</Text>
          </Pressable>
        </View>
        
        {invoicesLoading ? (
          <ActivityIndicator color={Colors.dark.xpCyan} />
        ) : invoices.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-outline" size={40} color={Colors.dark.xpCyan} />
            <Text style={styles.emptyText}>No invoices yet</Text>
            <Text style={styles.emptySubtext}>Create your first invoice to get started</Text>
          </View>
        ) : (
          invoices.slice(0, 3).map((invoice) => (
            <Pressable
              key={invoice.id}
              onPress={() => openInvoice(invoice)}
              style={({ pressed }) => [styles.invoiceCard, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.invoiceInfo}>
                <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
                <Text style={styles.invoiceDate}>
                  {new Date(invoice.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.invoiceAmount}>
                <Text style={styles.amountText}>
                  {invoice.currency} {invoice.amount.toLocaleString()}
                </Text>
                <View style={[styles.statusBadge, invoice.status === "paid" ? styles.paidBadge : styles.pendingBadge]}>
                  <Text style={[styles.statusText, invoice.status === "paid" && styles.paidText]}>
                    {invoice.status}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.glassSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT PAYMENTS</Text>
          <Pressable onPress={() => setActiveTab("payments")}>
            <Text style={styles.seeAllLink}>See All</Text>
          </Pressable>
        </View>
        
        {paymentsLoading ? (
          <ActivityIndicator color={Colors.dark.xpCyan} />
        ) : payments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color={Colors.dark.xpCyan} />
            <Text style={styles.emptyText}>No payments yet</Text>
          </View>
        ) : (
          payments.slice(0, 3).map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.paymentIcon}>
                <Ionicons
                  name={payment.paymentMethod === "card" ? "card-outline" : "cash-outline"}
                  size={20}
                  color={Colors.dark.primary}
                />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentMethod}>
                  {payment.paymentMethod.charAt(0).toUpperCase() + payment.paymentMethod.slice(1)}
                </Text>
                <Text style={styles.paymentDate}>
                  {new Date(payment.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>
                +{payment.currency} {payment.amount.toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );

  const renderInvoicesTab = () => (
    <View style={styles.tabContent}>
      <AnimatedButton style={styles.createButton} onPress={() => setShowCreateModal(true)}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.createButtonGradient}
        >
          <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
          <Text style={styles.createButtonText}>Create Invoice</Text>
        </LinearGradient>
      </AnimatedButton>

      {invoicesLoading ? (
        <ActivityIndicator color={Colors.dark.xpCyan} style={{ marginTop: Spacing.xl }} />
      ) : invoices.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="document-text-outline" size={60} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.emptyStateTitle}>No invoices yet</Text>
          <Text style={styles.emptyStateText}>Create invoices to track payments from players</Text>
        </View>
      ) : (
        invoices.map((invoice) => (
          <Pressable
            key={invoice.id}
            onPress={() => openInvoice(invoice)}
            style={({ pressed }) => [styles.invoiceListCard, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.invoiceListHeader}>
              <Text style={styles.invoiceListNumber}>{invoice.invoiceNumber}</Text>
              <View style={[styles.statusBadge, invoice.status === "paid" ? styles.paidBadge : styles.pendingBadge]}>
                <Text style={[styles.statusText, invoice.status === "paid" && styles.paidText]}>
                  {invoice.status}
                </Text>
              </View>
            </View>
            <View style={styles.invoiceListDetails}>
              <Text style={styles.invoiceListAmount}>
                {invoice.currency} {invoice.amount.toLocaleString()}
              </Text>
              <Text style={styles.invoiceListDate}>
                Created: {new Date(invoice.createdAt).toLocaleDateString()}
              </Text>
              {invoice.dueDate ? (
                <Text style={styles.invoiceListDue}>
                  Due: {new Date(invoice.dueDate).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
            {invoice.notes ? <Text style={styles.invoiceNotes}>{invoice.notes}</Text> : null}
            {invoice.status !== "paid" ? (
              <Pressable
                style={styles.markPaidButton}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleMarkAsPaid(invoice);
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dark.primary} />
                <Text style={styles.markPaidText}>Mark as Paid</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))
      )}
    </View>
  );

  const renderPaymentsTab = () => (
    <View style={styles.tabContent}>
      {paymentsLoading ? (
        <ActivityIndicator color={Colors.dark.xpCyan} style={{ marginTop: Spacing.xl }} />
      ) : payments.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="wallet-outline" size={60} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.emptyStateTitle}>No payments yet</Text>
          <Text style={styles.emptyStateText}>Payments will appear here once recorded</Text>
        </View>
      ) : (
        payments.map((payment) => (
          <View key={payment.id} style={styles.paymentListCard}>
            <View style={styles.paymentListIcon}>
              <Ionicons
                name={payment.paymentMethod === "card" ? "card" : "cash"}
                size={24}
                color={Colors.dark.primary}
              />
            </View>
            <View style={styles.paymentListInfo}>
              <Text style={styles.paymentListAmount}>
                +{payment.currency} {payment.amount.toLocaleString()}
              </Text>
              <Text style={styles.paymentListMethod}>
                {payment.paymentMethod.charAt(0).toUpperCase() + payment.paymentMethod.slice(1)} Payment
              </Text>
              <Text style={styles.paymentListDate}>
                {new Date(payment.createdAt).toLocaleString()}
              </Text>
            </View>
            <View style={[styles.statusBadge, styles.paidBadge]}>
              <Text style={[styles.statusText, styles.paidText]}>{payment.status}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const handleCreatePackage = () => {
    const credits = parseInt(newPackageCredits);
    const price = parseFloat(newPackagePrice);
    const validityDays = parseInt(newPackageValidityDays);
    
    if (!newPackageName.trim()) {
      Alert.alert("Error", "Please enter a package name");
      return;
    }
    if (isNaN(credits) || credits <= 0) {
      Alert.alert("Error", "Please enter a valid number of credits");
      return;
    }
    if (isNaN(price) || price <= 0) {
      Alert.alert("Error", "Please enter a valid price per credit");
      return;
    }
    if (isNaN(validityDays) || validityDays <= 0) {
      Alert.alert("Error", "Please enter valid validity days");
      return;
    }
    
    createPackageMutation.mutate({
      name: newPackageName.trim(),
      creditType: newPackageCreditType,
      credits,
      pricePerCredit: price.toFixed(2),
      validityDays,
    });
  };

  const handleDeletePackage = (pkg: PackageTemplate) => {
    Alert.alert(
      "Delete Package",
      `Are you sure you want to delete "${pkg.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePackageMutation.mutate(pkg.id),
        },
      ]
    );
  };

  const getCreditTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "group": return Colors.dark.orange;
      case "semi_private": return Colors.dark.xpCyan;
      default: return Colors.dark.textMuted;
    }
  };

  const getCreditTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "group": return "Group";
      case "semi_private": return "Semi-Private";
      default: return type;
    }
  };

  const renderPackagesTab = () => (
    <View style={styles.tabContent}>
      <AnimatedButton style={styles.createButton} onPress={() => setShowPackageModal(true)}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.createButtonGradient}
        >
          <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
          <Text style={styles.createButtonText}>New Credit Package</Text>
        </LinearGradient>
      </AnimatedButton>

      {packagesLoading ? (
        <ActivityIndicator color={Colors.dark.xpCyan} style={{ marginTop: Spacing.xl }} />
      ) : packageTemplates.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="gift-outline" size={60} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.emptyStateTitle}>No credit packages yet</Text>
          <Text style={styles.emptyStateText}>Create packages that players can purchase in the Credit Store</Text>
        </View>
      ) : (
        packageTemplates.map((pkg) => (
          <View key={pkg.id} style={styles.packageCard}>
            <View style={styles.packageHeader}>
              <View style={styles.packageTitleRow}>
                <Text style={styles.packageName}>{pkg.name}</Text>
                <View style={[styles.creditTypeBadge, { backgroundColor: `${getCreditTypeColor(pkg.creditType)}20`, borderColor: getCreditTypeColor(pkg.creditType) }]}>
                  <Text style={[styles.creditTypeText, { color: getCreditTypeColor(pkg.creditType) }]}>
                    {getCreditTypeLabel(pkg.creditType)}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => handleDeletePackage(pkg)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              </Pressable>
            </View>
            <View style={styles.packageDetails}>
              <View style={styles.packageDetailItem}>
                <Text style={styles.packageDetailLabel}>Credits</Text>
                <Text style={styles.packageDetailValue}>{formatCredits(pkg.credits)}</Text>
              </View>
              <View style={styles.packageDetailItem}>
                <Text style={styles.packageDetailLabel}>Price/Credit</Text>
                <Text style={styles.packageDetailValue}>{pkg.currency} {pkg.pricePerCredit}</Text>
              </View>
              <View style={styles.packageDetailItem}>
                <Text style={styles.packageDetailLabel}>Total</Text>
                <Text style={[styles.packageDetailValue, { color: Colors.dark.primary }]}>
                  {pkg.currency} {(parseFloat(pkg.pricePerCredit) * pkg.credits).toFixed(2)}
                </Text>
              </View>
              <View style={styles.packageDetailItem}>
                <Text style={styles.packageDetailLabel}>Valid</Text>
                <Text style={styles.packageDetailValue}>{pkg.validityDays} days</Text>
              </View>
            </View>
          </View>
        ))
      )}

      <Modal
        visible={showPackageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPackageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Credit Package</Text>
              <Pressable onPress={() => setShowPackageModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>PACKAGE NAME</Text>
                <TextInput
                  style={styles.input}
                  value={newPackageName}
                  onChangeText={setNewPackageName}
                  placeholder="e.g., 10 Private Lessons"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>CREDIT TYPE</Text>
                <View style={styles.creditTypeRow}>
                  {(["group", "private", "semi_private"] as const).map((type) => (
                    <Pressable
                      key={type}
                      style={[
                        styles.creditTypeOption,
                        newPackageCreditType === type && { 
                          backgroundColor: `${getCreditTypeColor(type)}20`,
                          borderColor: getCreditTypeColor(type)
                        }
                      ]}
                      onPress={() => setNewPackageCreditType(type)}
                    >
                      <Text style={[
                        styles.creditTypeOptionText,
                        newPackageCreditType === type && { color: getCreditTypeColor(type) }
                      ]}>
                        {getCreditTypeLabel(type)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>NUMBER OF CREDITS</Text>
                <TextInput
                  style={styles.input}
                  value={newPackageCredits}
                  onChangeText={setNewPackageCredits}
                  placeholder="10"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>PRICE PER CREDIT (AED)</Text>
                <TextInput
                  style={styles.input}
                  value={newPackagePrice}
                  onChangeText={setNewPackagePrice}
                  placeholder="250.00"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>VALIDITY (DAYS)</Text>
                <TextInput
                  style={styles.input}
                  value={newPackageValidityDays}
                  onChangeText={setNewPackageValidityDays}
                  placeholder="90"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>

              {newPackageCredits && newPackagePrice ? (
                <View style={styles.totalPreview}>
                  <Text style={styles.totalPreviewLabel}>Total Package Price:</Text>
                  <Text style={styles.totalPreviewValue}>
                    AED {(parseInt(newPackageCredits) * parseFloat(newPackagePrice) || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </KeyboardAwareScrollViewCompat>

            <AnimatedButton
              style={[styles.modalButton, createPackageMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreatePackage}
              disabled={createPackageMutation.isPending}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalButtonGradient}
              >
                {createPackageMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.modalButtonText}>Create Package</Text>
                )}
              </LinearGradient>
            </AnimatedButton>
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.gamingHeader}
      >
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>BILLING</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <View style={styles.tabs}>
        {[
          { key: "overview", label: "Overview", icon: "pie-chart-outline" },
          { key: "invoices", label: "Invoices", icon: "document-text-outline" },
          { key: "payments", label: "Payments", icon: "wallet-outline" },
          { key: "packages", label: "Packages", icon: "gift-outline" },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <Ionicons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? Colors.dark.xpCyan : Colors.dark.disabled}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" && renderOverviewTab()}
        {activeTab === "invoices" && renderInvoicesTab()}
        {activeTab === "payments" && renderPaymentsTab()}
        {activeTab === "packages" && renderPackagesTab()}
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalTopLine}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CREATE INVOICE</Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>AMOUNT</Text>
                <TextInput
                  style={styles.input}
                  value={newInvoiceAmount}
                  onChangeText={setNewInvoiceAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={newInvoiceNotes}
                  onChangeText={setNewInvoiceNotes}
                  placeholder="Invoice description..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>PLAYER (OPTIONAL)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
                  <Pressable
                    style={[styles.playerChip, !selectedPlayerId && styles.playerChipActive]}
                    onPress={() => setSelectedPlayerId(null)}
                  >
                    <Text style={[styles.playerChipText, !selectedPlayerId && styles.playerChipTextActive]}>
                      None
                    </Text>
                  </Pressable>
                  {players.map((player) => (
                    <Pressable
                      key={player.id}
                      style={[styles.playerChip, selectedPlayerId === player.id && styles.playerChipActive]}
                      onPress={() => setSelectedPlayerId(player.id)}
                    >
                      <Text style={[styles.playerChipText, selectedPlayerId === player.id && styles.playerChipTextActive]}>
                        {player.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </KeyboardAwareScrollViewCompat>

            <AnimatedButton
              style={[styles.modalButton, createInvoiceMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreateInvoice}
              disabled={createInvoiceMutation.isPending}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalButtonGradient}
              >
                {createInvoiceMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.modalButtonText}>Create Invoice</Text>
                )}
              </LinearGradient>
            </AnimatedButton>
          </View>
        </View>
      </Modal>

      <InvoiceViewerModal
        invoice={viewerInvoice}
        visible={!!viewerInvoice}
        onClose={() => setViewerInvoice(null)}
        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/payments"] });
          setViewerInvoice(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  gamingHeader: {
    paddingBottom: Spacing.md,
  },
  headerTopLine: {
    height: 3,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  tabActive: {
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderColor: Colors.dark.xpCyan,
  },
  tabText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.primary,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  glassSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  seeAllLink: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  invoiceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  invoiceInfo: {},
  invoiceNumber: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  invoiceDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  invoiceAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: `${Colors.dark.orange}25`,
    borderWidth: 1,
    borderColor: Colors.dark.orange,
  },
  paidBadge: {
    backgroundColor: `${Colors.dark.primary}25`,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  statusText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    textTransform: "capitalize",
    fontWeight: "600",
  },
  paidText: {
    color: Colors.dark.primary,
  },
  paymentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentMethod: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  paymentDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  paymentAmount: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  createButton: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  createButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  createButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: Spacing["3xl"],
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  invoiceListCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  invoiceListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  invoiceListNumber: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  invoiceListDetails: {
    gap: 2,
  },
  invoiceListAmount: {
    ...Typography.h3,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
  },
  invoiceListDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  invoiceListDue: {
    ...Typography.small,
    color: Colors.dark.orange,
  },
  invoiceNotes: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
  markPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
  },
  markPaidText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  paymentListCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentListIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  paymentListInfo: {
    flex: 1,
  },
  paymentListAmount: {
    ...Typography.h3,
    color: Colors.dark.primary,
  },
  paymentListMethod: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  paymentListDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#0B0D10",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  modalTopLine: {
    height: 3,
    width: "100%",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.dark.primary}30`,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  playerScroll: {
    flexDirection: "row",
  },
  playerChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginRight: Spacing.sm,
  },
  playerChipActive: {
    backgroundColor: `${Colors.dark.xpCyan}25`,
    borderColor: Colors.dark.xpCyan,
  },
  playerChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  playerChipTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  modalButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  modalButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  packageCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  packageTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  packageName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  creditTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  creditTypeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  packageDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  packageDetailItem: {
    minWidth: 70,
  },
  packageDetailLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  packageDetailValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  creditTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  creditTypeOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
  },
  creditTypeOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  totalPreview: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  totalPreviewLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  totalPreviewValue: {
    ...Typography.h3,
    color: Colors.dark.primary,
  },
});
