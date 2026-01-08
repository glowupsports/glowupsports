import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type CreditType = "group" | "private" | "semi_private";

interface PackageTemplate {
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
}

type RouteParams = {
  ParentCreditStore: { playerId: string };
};

const CREDIT_TYPE_COLORS: Record<CreditType, string> = {
  group: Colors.dark.sessionGroup,
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
};

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  group: "Group",
  private: "Private",
  semi_private: "Semi-Private",
};

export default function ParentCreditStoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "ParentCreditStore">>();
  const { playerId } = route.params;
  const queryClient = useQueryClient();

  const [selectedTemplate, setSelectedTemplate] = useState<PackageTemplate | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"cash" | "bank_transfer" | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<PackageTemplate[]>({
    queryKey: [`/api/parent/credit-store/${playerId}`],
    enabled: !!playerId,
  });

  const { data: creditsData } = useQuery<{ credits: PlayerCredits }>({
    queryKey: [`/api/players/${playerId}/credits-summary`],
    enabled: !!playerId,
  });

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

  const { data: paymentInfo } = useQuery<AcademyPaymentInfo>({
    queryKey: [`/api/parent/academy-payment-info/${playerId}`],
    enabled: !!playerId,
  });

  const credits = creditsData?.credits || { group: 0, private: 0, semi_private: 0 };

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

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedTemplate(null);
    setSelectedPaymentMethod(null);
    setPin("");
    setPinError("");
  };

  const handleSelectPackage = (template: PackageTemplate) => {
    setSelectedTemplate(template);
    setShowPinModal(true);
    setPin("");
    setPinError("");
  };

  const handlePinVerified = () => {
    if (pin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    setPinError("");
  };

  const handlePurchase = (paymentMethod: "cash" | "bank_transfer") => {
    if (pin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    if (selectedTemplate) {
      setSelectedPaymentMethod(paymentMethod);
      purchaseMutation.mutate({ templateId: selectedTemplate.id, pin, paymentMethod });
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
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
            {(["group", "private", "semi_private"] as CreditType[]).map((type) => (
              <View key={type} style={styles.creditItem}>
                <View style={[styles.creditBadge, { backgroundColor: CREDIT_TYPE_COLORS[type] + "20" }]}>
                  <Text style={[styles.creditValue, { color: CREDIT_TYPE_COLORS[type] }]}>
                    {credits[type]}
                  </Text>
                </View>
                <Text style={styles.creditLabel}>{CREDIT_TYPE_LABELS[type]}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Available Packages</Text>

        {templatesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.text} />
          </View>
        ) : templates.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Packages Available</Text>
            <Text style={styles.emptySubtitle}>Check back later for credit packages</Text>
          </View>
        ) : (
          <View style={styles.templatesList}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                style={({ pressed }) => [
                  styles.templateCard,
                  pressed && styles.templateCardPressed,
                  template.isPopular && styles.templateCardPopular,
                ]}
                onPress={() => handleSelectPackage(template)}
              >
                {template.isPopular ? (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>Popular</Text>
                  </View>
                ) : null}
                
                <View style={styles.templateHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: CREDIT_TYPE_COLORS[template.creditType] + "20" }]}>
                    <Text style={[styles.typeText, { color: CREDIT_TYPE_COLORS[template.creditType] }]}>
                      {CREDIT_TYPE_LABELS[template.creditType]}
                    </Text>
                  </View>
                  <Text style={styles.templateName}>{template.name}</Text>
                </View>

                <View style={styles.templateBody}>
                  <View style={styles.creditsSection}>
                    <Text style={styles.creditsNumber}>{template.credits}</Text>
                    <Text style={styles.creditsUnit}>credits</Text>
                  </View>

                  <View style={styles.priceSection}>
                    <Text style={styles.totalPrice}>
                      {formatCurrency(template.totalPrice, template.currency)}
                    </Text>
                    <Text style={styles.pricePerCredit}>
                      {formatCurrency(template.pricePerCredit, template.currency)}/credit
                    </Text>
                  </View>
                </View>

                {template.description ? (
                  <Text style={styles.templateDescription}>{template.description}</Text>
                ) : null}

                <View style={styles.validityRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.validityText}>
                    Valid for {template.validityDays} days
                  </Text>
                </View>

                <View style={styles.buyButton}>
                  <Text style={styles.buyButtonText}>Buy Now</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.dark.text} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showPinModal} animationType="fade" transparent>
        <View style={styles.pinModalOverlay}>
          <View style={styles.pinModalContent}>
            <View style={styles.pinModalHeader}>
              <Text style={styles.pinModalTitle}>Enter Parent PIN</Text>
              <Pressable onPress={() => { setShowPinModal(false); setSelectedTemplate(null); setPin(""); setPinError(""); }}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {selectedTemplate ? (
              <View style={styles.purchaseSummary}>
                <Text style={styles.summaryLabel}>Package</Text>
                <Text style={styles.summaryValue}>{selectedTemplate.name}</Text>
                <Text style={styles.summaryLabel}>Credits</Text>
                <Text style={styles.summaryValue}>
                  {selectedTemplate.credits} {CREDIT_TYPE_LABELS[selectedTemplate.creditType]}
                </Text>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryTotal}>
                  {formatCurrency(selectedTemplate.totalPrice, selectedTemplate.currency)}
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

            {pinError ? (
              <Text style={styles.pinError}>{pinError}</Text>
            ) : null}

            <Text style={styles.paymentMethodTitle}>Select Payment Method</Text>
            
            <View style={styles.paymentMethodRow}>
              {paymentInfo?.acceptsCash ? (
                <Pressable
                  style={[styles.paymentMethodButton, purchaseMutation.isPending && styles.confirmButtonDisabled]}
                  onPress={() => handlePurchase("cash")}
                  disabled={purchaseMutation.isPending || pin.length < 4}
                >
                  {purchaseMutation.isPending && selectedPaymentMethod === "cash" ? (
                    <ActivityIndicator color={Colors.dark.backgroundRoot} />
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
                  style={[styles.paymentMethodButton, purchaseMutation.isPending && styles.confirmButtonDisabled]}
                  onPress={() => handlePurchase("bank_transfer")}
                  disabled={purchaseMutation.isPending || pin.length < 4}
                >
                  {purchaseMutation.isPending && selectedPaymentMethod === "bank_transfer" ? (
                    <ActivityIndicator color={Colors.dark.backgroundRoot} />
                  ) : (
                    <>
                      <Ionicons name="card-outline" size={24} color={Colors.dark.xpCyan} />
                      <Text style={styles.paymentMethodLabel}>Bank Transfer</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.pinNote}>
              Your PIN protects against unauthorized purchases
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} animationType="fade" transparent>
        <View style={styles.pinModalOverlay}>
          <View style={[styles.pinModalContent, { maxHeight: "85%" }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.pinModalHeader}>
                <Text style={styles.pinModalTitle}>
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

              {selectedTemplate ? (
                <View style={styles.purchaseSummary}>
                  <Text style={styles.summaryLabel}>Amount Due</Text>
                  <Text style={styles.summaryTotal}>
                    {formatCurrency(selectedTemplate.totalPrice, selectedTemplate.currency)}
                  </Text>
                </View>
              ) : null}

              {selectedPaymentMethod === "bank_transfer" && paymentInfo ? (
                <View style={styles.bankDetailsSection}>
                  <Text style={styles.bankDetailsTitle}>Bank Details</Text>
                  
                  {paymentInfo.bankName ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>Bank</Text>
                      <Text style={styles.bankDetailValue}>{paymentInfo.bankName}</Text>
                    </View>
                  ) : null}
                  
                  {paymentInfo.bankAccountHolder ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>Account Holder</Text>
                      <Text style={styles.bankDetailValue}>{paymentInfo.bankAccountHolder}</Text>
                    </View>
                  ) : null}
                  
                  {paymentInfo.bankAccountNumber ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>Account Number</Text>
                      <Text style={styles.bankDetailValue}>{paymentInfo.bankAccountNumber}</Text>
                    </View>
                  ) : null}
                  
                  {paymentInfo.bankIban ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>IBAN</Text>
                      <Text style={styles.bankDetailValue}>{paymentInfo.bankIban}</Text>
                    </View>
                  ) : null}
                  
                  {paymentInfo.bankSwiftCode ? (
                    <View style={styles.bankDetailRow}>
                      <Text style={styles.bankDetailLabel}>SWIFT/BIC</Text>
                      <Text style={styles.bankDetailValue}>{paymentInfo.bankSwiftCode}</Text>
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
  sectionTitle: {
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
  templatesList: {
    gap: Spacing.md,
  },
  templateCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  templateCardPressed: {
    opacity: 0.8,
  },
  templateCardPopular: {
    borderColor: Colors.dark.gold,
  },
  popularBadge: {
    position: "absolute",
    top: -10,
    right: Spacing.lg,
    backgroundColor: Colors.dark.gold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  popularText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  templateHeader: {
    marginBottom: Spacing.md,
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  typeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  templateName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  templateBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  creditsSection: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.xs,
  },
  creditsNumber: {
    ...Typography.h1,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  creditsUnit: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  priceSection: {
    alignItems: "flex-end",
  },
  totalPrice: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  pricePerCredit: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  templateDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  validityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  validityText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  buyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  buyButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  pinModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  pinModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 340,
  },
  pinModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  pinModalTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  purchaseSummary: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: 2,
  },
  summaryValue: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  summaryTotal: {
    ...Typography.h3,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  pinLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  pinInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Typography.h4,
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: 8,
    marginBottom: Spacing.md,
  },
  pinError: {
    ...Typography.small,
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  confirmButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  pinNote: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    fontStyle: "italic",
  },
  paymentMethodTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
    fontWeight: "600",
  },
  paymentMethodRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  paymentMethodButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  paymentMethodLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  successBadge: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  successTitle: {
    ...Typography.h3,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  successSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  bankDetailsSection: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  bankDetailsTitle: {
    ...Typography.h4,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
  },
  bankDetailRow: {
    marginBottom: Spacing.sm,
  },
  bankDetailLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  bankDetailValue: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  instructionsBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  instructionsLabel: {
    ...Typography.caption,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  instructionsText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  cashInstructions: {
    flexDirection: "row",
    backgroundColor: `${Colors.dark.gold}15`,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    alignItems: "flex-start",
  },
  cashInstructionsText: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.gold,
  },
  doneButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  doneButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
});
