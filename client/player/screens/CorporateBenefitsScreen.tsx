import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";
import { TextInput } from "react-native";

interface CorporateAccount {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  creditBalance: number;
  isActive: boolean;
}

interface CorporateMember {
  id: string;
  inviteEmail: string;
  inviteStatus: string;
  acceptedAt: string | null;
}

interface CorporateTransaction {
  id: string;
  type: string;
  amount: number;
  reason: string;
  createdAt: string;
}

interface MyCorpData {
  corporateAccount: CorporateAccount | null;
  member: CorporateMember | null;
  myTransactions: CorporateTransaction[];
  companyCreditsRemaining: number;
}

export default function CorporateBenefitsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [inviteToken, setInviteToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  const { data, isLoading, refetch } = useQuery<MyCorpData>({
    queryKey: ["/api/corporate/my-account"],
  });

  const acceptMutation = useMutation({
    mutationFn: (token: string) =>
      apiRequest("POST", "/api/corporate/accept-invite", { token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/my-account"] });
      setShowTokenInput(false);
      setInviteToken("");
      Alert.alert("Activated", "Your company credits are now active. You can use them when booking sessions.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Invalid invite token. Please check and try again.");
    },
  });

  const handleAcceptInvite = () => {
    const trimmed = inviteToken.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Please enter your invite token.");
      return;
    }
    acceptMutation.mutate(trimmed);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const hasCorporate = data?.corporateAccount && data?.member?.inviteStatus === "accepted";

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Corporate Benefits</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.orange} style={{ marginTop: Spacing.xl }} />
      ) : hasCorporate ? (
        <>
          {/* Active corporate account */}
          <View style={styles.heroCard}>
            <View style={styles.heroIconRow}>
              <Ionicons name="business" size={32} color={Colors.dark.orange} />
            </View>
            <Text style={styles.heroCompany}>{data!.corporateAccount!.companyName}</Text>
            <Text style={styles.heroSubtitle}>Company wellness benefits</Text>
            <View style={styles.creditDisplay}>
              <Text style={styles.creditNumber}>{data!.companyCreditsRemaining}</Text>
              <Text style={styles.creditLabel}>company credits available</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How it works</Text>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
              <Text style={styles.infoText}>Credits are deducted from your company pool when you book sessions</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
              <Text style={styles.infoText}>Your employer tops up the pool — no personal billing needed</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
              <Text style={styles.infoText}>Company credits are used before your personal credits</Text>
            </View>
          </View>

          {/* My usage */}
          {data!.myTransactions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>My Usage</Text>
              {data!.myTransactions.map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={[styles.txDot, tx.type === "credit" ? styles.txDotCredit : styles.txDotDebit]} />
                  <View style={styles.txInfo}>
                    <Text style={styles.txReason}>{tx.reason.replace(/_/g, " ")}</Text>
                    <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                  </View>
                  <Text style={[styles.txAmount, tx.type === "credit" ? styles.creditText : styles.debitText]}>
                    {tx.type === "credit" ? "+" : ""}{Math.abs(tx.amount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noUsage}>
              <Text style={styles.noUsageText}>No sessions booked with company credits yet.</Text>
            </View>
          )}
        </>
      ) : (
        <>
          {/* No corporate account - show activation */}
          <View style={styles.noAccountCard}>
            <Ionicons name="business-outline" size={56} color={Colors.dark.textMuted} />
            <Text style={styles.noAccountTitle}>No Corporate Benefits</Text>
            <Text style={styles.noAccountText}>
              If your employer has signed up with this academy, they will send you an invite email with a token to activate your company credits.
            </Text>
          </View>

          <View style={styles.activateCard}>
            <Text style={styles.activateTitle}>Have an invite token?</Text>
            {showTokenInput ? (
              <>
                <TextInput
                  style={styles.tokenInput}
                  value={inviteToken}
                  onChangeText={setInviteToken}
                  placeholder="Enter your invite token"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.activateBtn}
                  onPress={handleAcceptInvite}
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.activateBtnText}>Activate Benefits</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setShowTokenInput(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.activateBtn} onPress={() => setShowTokenInput(true)}>
                <Text style={styles.activateBtnText}>Enter Invite Token</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  title: {
    ...Typography.title2,
    color: Colors.dark.text,
  },
  heroCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  heroIconRow: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.orange + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  heroCompany: {
    ...Typography.title2,
    color: Colors.dark.text,
    fontWeight: "800",
    textAlign: "center",
  },
  heroSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  creditDisplay: {
    alignItems: "center",
    marginTop: Spacing.md,
    backgroundColor: Colors.dark.surfaceAlt,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: "100%",
  },
  creditNumber: {
    fontSize: 40,
    fontWeight: "900",
    color: Colors.dark.xpCyan,
  },
  creditLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  infoCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  infoTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  txDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
  },
  txDotCredit: {
    backgroundColor: Colors.dark.successNeon,
  },
  txDotDebit: {
    backgroundColor: Colors.dark.orange,
  },
  txInfo: {
    flex: 1,
  },
  txReason: {
    ...Typography.caption,
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  txDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  txAmount: {
    ...Typography.callout,
    fontWeight: "700",
  },
  creditText: {
    color: Colors.dark.successNeon,
  },
  debitText: {
    color: Colors.dark.orange,
  },
  noUsage: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
  },
  noUsageText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  noAccountCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  noAccountTitle: {
    ...Typography.title3,
    color: Colors.dark.text,
  },
  noAccountText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  activateCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  activateTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
  },
  tokenInput: {
    backgroundColor: Colors.dark.surfaceAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    fontFamily: "monospace",
  },
  activateBtn: {
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  activateBtnText: {
    ...Typography.callout,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  cancelBtn: {
    alignItems: "center",
    padding: Spacing.sm,
  },
  cancelBtnText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});
