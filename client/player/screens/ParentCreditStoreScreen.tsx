import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";

type CreditType = "group" | "private" | "semi_private" | "court";

interface CreditPackage {
  id: string;
  name: string;
  creditType: CreditType;
  credits: number;
  pricePerCredit: string;
  totalPrice: string;
  currency: string;
  validityDays: number;
  description?: string;
  isPopular?: boolean;
}

interface PlayerCredits {
  group: number;
  private: number;
  semi_private: number;
  court: number;
}

type RouteParams = {
  ParentCreditStore: { playerId: string };
};

const CREDIT_TYPE_COLORS: Record<CreditType, string> = {
  group: Colors.dark.sessionGroup,
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  court: Colors.dark.xpCyan,
};

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  group: "Group",
  private: "Private",
  semi_private: "Semi-Private",
  court: "Court",
};

const CREDIT_TYPE_ICONS: Record<CreditType, keyof typeof Ionicons.glyphMap> = {
  private: "person",
  semi_private: "people",
  group: "people-circle",
  court: "tennisball",
};

interface AcademyPaymentInfo {
  acceptsCash: boolean;
  acceptsBankTransfer: boolean;
  bankName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankAccountHolder?: string;
  bankSwiftCode?: string;
  paymentInstructions?: string;
  currency: string;
}

export default function ParentCreditStoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "ParentCreditStore">>();
  const { playerId } = route.params;
  const queryClient = useQueryClient();

  const [expandedType, setExpandedType] = useState<CreditType | null>("private");
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"cash" | "bank_transfer" | null>(null);

  const { data: v2WalletData } = useQuery<{ v2Enabled: boolean }>({
    queryKey: [`/api/v2/credits/wallet/${playerId}`],
    enabled: !!playerId,
  });
  const v2Enabled = v2WalletData?.v2Enabled === true;

  const { data: packages = [], isLoading } = useQuery<CreditPackage[]>({
    queryKey: [`/api/parent/credit-store/${playerId}`],
    enabled: !!playerId && !v2Enabled,
  });

  const { data: creditsData } = useQuery<{ credits: PlayerCredits }>({
    queryKey: [`/api/players/${playerId}/credits-summary`],
    enabled: !!playerId,
  });

  const { data: paymentInfo } = useQuery<AcademyPaymentInfo>({
    queryKey: [`/api/parent/academy-payment-info/${playerId}`],
    enabled: !!playerId,
  });

  const credits = creditsData?.credits || { group: 0, private: 0, semi_private: 0, court: 0 };

  const purchaseMutation = useMutation({
    mutationFn: async ({ templateId, pin, paymentMethod }: { templateId: string; pin: string; paymentMethod: "cash" | "bank_transfer" }) => {
      const response = await apiRequest("POST", `/api/parent/purchase-credits`, {
        playerId,
        templateId,
        pin,
        paymentMethod,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Purchase failed");
      }
      return response.json();
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credits-summary`] });
      setShowPinModal(false);
      setShowPaymentModal(true);
    },
    onError: (error: Error) => {
      setPinError(error.message);
    },
  });

  const handleToggleType = (type: CreditType) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedType(expandedType === type ? null : type);
  };

  const handleSelectPackage = (pkg: CreditPackage) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelectedPackage(pkg);
    setShowPinModal(true);
    setPin("");
    setPinError("");
  };

  const handlePurchase = (paymentMethod: "cash" | "bank_transfer") => {
    if (pin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    if (selectedPackage) {
      setSelectedPaymentMethod(paymentMethod);
      purchaseMutation.mutate({ templateId: selectedPackage.id, pin, paymentMethod });
    }
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedPackage(null);
    setSelectedPaymentMethod(null);
    setPin("");
    setPinError("");
  };

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (value: string, fieldName: string) => {
    try {
      await Clipboard.setStringAsync(value);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  };

  const groupedPackages = packages.reduce((acc, pkg) => {
    if (!acc[pkg.creditType]) {
      acc[pkg.creditType] = [];
    }
    acc[pkg.creditType].push(pkg);
    return acc;
  }, {} as Record<CreditType, CreditPackage[]>);

  const creditTypes: CreditType[] = ["private", "semi_private", "group", "court"];

  const renderCreditTypeSection = (creditType: CreditType) => {
    const typePackages = groupedPackages[creditType] || [];
    if (typePackages.length === 0) return null;

    const isExpanded = expandedType === creditType;
    const color = CREDIT_TYPE_COLORS[creditType];
    const label = CREDIT_TYPE_LABELS[creditType];
    const icon = CREDIT_TYPE_ICONS[creditType];
    const pricePerCredit = typePackages[0]?.pricePerCredit || "0";
    const currency = typePackages[0]?.currency || "AED";

    return (
      <View key={creditType} style={styles.sectionContainer}>
        <Pressable
          style={[styles.sectionHeader, isExpanded && styles.sectionHeaderExpanded]}
          onPress={() => handleToggleType(creditType)}
        >
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
              <Ionicons name={icon} size={24} color={color} />
            </View>
            <View>
              <Text style={styles.sectionTitle}>{label} Credits</Text>
              <Text style={styles.sectionSubtitle}>
                {currency} {pricePerCredit} per credit
              </Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors.dark.textMuted}
          />
        </Pressable>

        {isExpanded ? (
          <View style={styles.packagesContainer}>
            <View style={styles.packagesGrid}>
              {typePackages.map((pkg) => (
                <Pressable
                  key={pkg.id}
                  style={({ pressed }) => [
                    styles.packageCard,
                    pressed && styles.packageCardPressed,
                  ]}
                  onPress={() => handleSelectPackage(pkg)}
                >
                  <View style={styles.packageCredits}>
                    <Text style={[styles.packageCreditsNumber, { color }]}>
                      {formatCredits(pkg.credits)}
                    </Text>
                    <Text style={styles.packageCreditsLabel}>
                      credit{pkg.credits > 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={styles.packagePricing}>
                    <Text style={[styles.packageTotalPrice, { color }]}>
                      {formatCurrency(pkg.totalPrice, pkg.currency)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Credit Store</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.currentCreditsCard}>
          <Text style={styles.currentCreditsTitle}>Your Current Credits</Text>
          <View style={styles.creditsRow}>
            {creditTypes.map((type) => (
              <View key={type} style={styles.creditItem}>
                <View style={[styles.creditBadge, { backgroundColor: CREDIT_TYPE_COLORS[type] + "20" }]}>
                  <Text style={[styles.creditValue, { color: CREDIT_TYPE_COLORS[type] }]}>
                    {formatCredits(credits[type])}
                  </Text>
                </View>
                <Text style={styles.creditLabel}>{CREDIT_TYPE_LABELS[type]}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionHeaderTitle}>Available Packages</Text>

        {v2Enabled ? (
          <View style={styles.emptyState}>
            <Ionicons name="information-circle-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>New Credits System</Text>
            <Text style={styles.emptySubtitle}>
              Your academy is on the new credits system. Please contact your academy admin to add credits — package self-purchase will return soon.
            </Text>
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.text} />
          </View>
        ) : packages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Packages Available</Text>
            <Text style={styles.emptySubtitle}>Check back later for credit packages</Text>
          </View>
        ) : (
          <View style={styles.sectionsContainer}>
            {creditTypes.map(renderCreditTypeSection)}
          </View>
        )}
      </ScrollView>

      <Modal visible={showPinModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Parent PIN</Text>
              <Pressable onPress={() => { setShowPinModal(false); setSelectedPackage(null); setPin(""); setPinError(""); }}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {selectedPackage ? (
              <View style={styles.purchaseSummary}>
                <View style={[styles.summaryTypeBadge, { backgroundColor: CREDIT_TYPE_COLORS[selectedPackage.creditType] + "20" }]}>
                  <Text style={[styles.summaryTypeText, { color: CREDIT_TYPE_COLORS[selectedPackage.creditType] }]}>
                    {CREDIT_TYPE_LABELS[selectedPackage.creditType]}
                  </Text>
                </View>
                <Text style={styles.summaryCredits}>{formatCredits(selectedPackage.credits)} Credits</Text>
                <Text style={styles.summaryTotal}>
                  {formatCurrency(selectedPackage.totalPrice, selectedPackage.currency)}
                </Text>
              </View>
            ) : null}

            <Text style={styles.pinLabel}>Enter your 4-digit PIN to confirm</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(text) => { setPin(text.replace(/[^0-9]/g, "").slice(0, 6)); setPinError(""); }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Enter PIN"
              placeholderTextColor={Colors.dark.tabIconDefault}
              maxLength={6}
            />

            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}

            <Text style={styles.paymentMethodTitle}>Select Payment Method</Text>

            <View style={styles.paymentMethodRow}>
              {paymentInfo?.acceptsCash ? (
                <Pressable
                  style={[styles.paymentMethodButton, purchaseMutation.isPending && styles.buttonDisabled]}
                  onPress={() => handlePurchase("cash")}
                  disabled={purchaseMutation.isPending || pin.length < 4}
                >
                  {purchaseMutation.isPending && selectedPaymentMethod === "cash" ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="cash-outline" size={24} color={Colors.dark.gold} />
                      <Text style={styles.paymentMethodLabel}>Pay with Cash</Text>
                    </>
                  )}
                </Pressable>
              ) : null}

              {paymentInfo?.acceptsBankTransfer ? (
                <Pressable
                  style={[styles.paymentMethodButton, purchaseMutation.isPending && styles.buttonDisabled]}
                  onPress={() => handlePurchase("bank_transfer")}
                  disabled={purchaseMutation.isPending || pin.length < 4}
                >
                  {purchaseMutation.isPending && selectedPaymentMethod === "bank_transfer" ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="card-outline" size={24} color={Colors.dark.xpCyan} />
                      <Text style={styles.paymentMethodLabel}>Bank Transfer</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.pinNote}>Your PIN protects against unauthorized purchases</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "85%" }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedPaymentMethod === "cash" ? "Cash Payment" : "Bank Transfer"}
                </Text>
                <Pressable onPress={closePaymentModal}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>

              <View style={styles.successBadge}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
                <Text style={styles.successTitle}>Order Created</Text>
                <Text style={styles.successSubtitle}>
                  {selectedPaymentMethod === "cash"
                    ? "Please pay cash to your academy"
                    : "Please transfer the amount to the account below"}
                </Text>
              </View>

              {selectedPackage ? (
                <View style={styles.purchaseSummary}>
                  <Text style={styles.summaryLabel}>Amount Due</Text>
                  <Text style={styles.summaryTotal}>
                    {formatCurrency(selectedPackage.totalPrice, selectedPackage.currency)}
                  </Text>
                </View>
              ) : null}

              {selectedPaymentMethod === "bank_transfer" && paymentInfo ? (
                <View style={styles.bankDetailsSection}>
                  <Text style={styles.bankDetailsTitle}>Bank Details</Text>
                  {paymentInfo.bankName ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>Bank</Text>
                      <View style={styles.bankDetailValueRow}>
                        <Text style={styles.bankDetailValue}>{paymentInfo.bankName}</Text>
                        <Pressable onPress={() => copyToClipboard(paymentInfo.bankName!, "bankName")} style={styles.copyButton}>
                          <Ionicons name={copiedField === "bankName" ? "checkmark" : "copy-outline"} size={18} color={copiedField === "bankName" ? Colors.dark.primary : Colors.dark.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {paymentInfo.bankAccountHolder ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>Account Holder</Text>
                      <View style={styles.bankDetailValueRow}>
                        <Text style={styles.bankDetailValue}>{paymentInfo.bankAccountHolder}</Text>
                        <Pressable onPress={() => copyToClipboard(paymentInfo.bankAccountHolder!, "bankAccountHolder")} style={styles.copyButton}>
                          <Ionicons name={copiedField === "bankAccountHolder" ? "checkmark" : "copy-outline"} size={18} color={copiedField === "bankAccountHolder" ? Colors.dark.primary : Colors.dark.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {paymentInfo.bankAccountNumber ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>Account Number</Text>
                      <View style={styles.bankDetailValueRow}>
                        <Text style={styles.bankDetailValue}>{paymentInfo.bankAccountNumber}</Text>
                        <Pressable onPress={() => copyToClipboard(paymentInfo.bankAccountNumber!, "bankAccountNumber")} style={styles.copyButton}>
                          <Ionicons name={copiedField === "bankAccountNumber" ? "checkmark" : "copy-outline"} size={18} color={copiedField === "bankAccountNumber" ? Colors.dark.primary : Colors.dark.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {paymentInfo.bankIban ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>IBAN</Text>
                      <View style={styles.bankDetailValueRow}>
                        <Text style={styles.bankDetailValue}>{paymentInfo.bankIban}</Text>
                        <Pressable onPress={() => copyToClipboard(paymentInfo.bankIban!, "bankIban")} style={styles.copyButton}>
                          <Ionicons name={copiedField === "bankIban" ? "checkmark" : "copy-outline"} size={18} color={copiedField === "bankIban" ? Colors.dark.primary : Colors.dark.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {paymentInfo.bankSwiftCode ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>SWIFT/BIC</Text>
                      <View style={styles.bankDetailValueRow}>
                        <Text style={styles.bankDetailValue}>{paymentInfo.bankSwiftCode}</Text>
                        <Pressable onPress={() => copyToClipboard(paymentInfo.bankSwiftCode!, "bankSwiftCode")} style={styles.copyButton}>
                          <Ionicons name={copiedField === "bankSwiftCode" ? "checkmark" : "copy-outline"} size={18} color={copiedField === "bankSwiftCode" ? Colors.dark.primary : Colors.dark.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {paymentInfo.paymentInstructions ? (
                    <View style={styles.instructionsBox}>
                      <Text style={styles.instructionsLabel}>Instructions</Text>
                      <Text style={styles.instructionsText}>{paymentInfo.paymentInstructions}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {selectedPaymentMethod === "cash" ? (
                <View style={styles.cashInstructions}>
                  <Ionicons name="information-circle-outline" size={20} color={Colors.dark.gold} />
                  <Text style={styles.cashInstructionsText}>
                    Please bring exact cash to your next session. Credits will be activated once payment is confirmed by the academy.
                  </Text>
                </View>
              ) : null}

              <Pressable style={styles.doneButton} onPress={closePaymentModal}>
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </ScrollView>
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
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  currentCreditsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  currentCreditsTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  creditsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  creditItem: {
    alignItems: "center",
  },
  creditBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  creditValue: {
    ...Typography.h3,
    fontWeight: "700",
  },
  creditLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  sectionHeaderTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  emptyTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  sectionsContainer: {
    gap: Spacing.md,
  },
  sectionContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  sectionHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  sectionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  packagesContainer: {
    padding: Spacing.md,
  },
  packagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  packageCard: {
    width: "48%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  packageCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  packageCredits: {
    alignItems: "center",
  },
  packageCreditsNumber: {
    ...Typography.numberLarge,
  },
  packageCreditsLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: -4,
  },
  packagePricing: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  packageTotalPrice: {
    ...Typography.h4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  purchaseSummary: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  summaryTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  summaryTypeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  summaryCredits: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  summaryTotal: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  pinLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  pinInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 24,
    textAlign: "center",
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    letterSpacing: 8,
  },
  pinError: {
    ...Typography.small,
    color: Colors.dark.error,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  paymentMethodTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  paymentMethodRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  paymentMethodButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  paymentMethodLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  pinNote: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  successBadge: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  successTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  successSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  bankDetailsSection: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  bankDetailsTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  bankDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  bankDetailLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  bankDetailValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  copyButton: {
    padding: 4,
  },
  bankDetailValue: {
    ...Typography.small,
    flex: 1,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  instructionsBox: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
  },
  instructionsLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  instructionsText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  cashInstructions: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  cashInstructionsText: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  doneButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  doneButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
});
