import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";

interface CorporateAccount {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  creditBalance: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

interface CorporateMember {
  id: string;
  inviteEmail: string;
  inviteStatus: string;
  acceptedAt: string | null;
  playerName?: string;
}

interface CorporateTransaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  notes: string | null;
  playerId: string | null;
  createdAt: string;
}

interface UsageReport {
  totalCreditsUsed: number;
  memberUsage: { playerId: string; inviteEmail: string; creditsUsed: number; sessionCount: number }[];
}

interface AccountDashboard {
  account: CorporateAccount;
  members: CorporateMember[];
  usageReport: UsageReport;
  recentTransactions: CorporateTransaction[];
}

interface CompanyDashboardData {
  accounts: AccountDashboard[];
}

export default function CompanyContactDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitingAccountId, setInvitingAccountId] = useState<string | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<CompanyDashboardData>({
    queryKey: ["/api/corporate/company-dashboard"],
  });

  const inviteMutation = useMutation({
    mutationFn: ({ accountId, email }: { accountId: string; email: string }) =>
      apiRequest("POST", `/api/corporate/company-dashboard/${accountId}/invite`, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/company-dashboard"] });
      setInviteEmail("");
      setInvitingAccountId(null);
      Alert.alert("Invite Sent", "An invitation email has been sent to the employee.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to send invite. Please try again.");
    },
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleInvite = (accountId: string) => {
    const trimmed = inviteEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      Alert.alert("Validation", "Please enter a valid email address.");
      return;
    }
    inviteMutation.mutate({ accountId, email: trimmed });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={Colors.dark.orange} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="warning-outline" size={48} color={Colors.dark.danger} />
        <Text style={styles.errorText}>Failed to load dashboard</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const accounts = data?.accounts ?? [];

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
        <Text style={styles.title}>Company Dashboard</Text>
      </View>

      {accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={56} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No accounts linked</Text>
          <Text style={styles.emptyText}>
            You are not listed as a company contact for any corporate account. Contact your academy administrator.
          </Text>
        </View>
      ) : (
        accounts.map((dashboard) => {
          const isExpanded = expandedAccountId === dashboard.account.id;
          const activeMembers = dashboard.members.filter((m) => m.inviteStatus === "accepted").length;

          return (
            <View key={dashboard.account.id} style={styles.accountCard}>
              <Pressable
                style={styles.accountHeader}
                onPress={() => setExpandedAccountId(isExpanded ? null : dashboard.account.id)}
              >
                <View style={styles.accountIconWrapper}>
                  <Ionicons name="business" size={22} color={Colors.dark.orange} />
                </View>
                <View style={styles.accountHeaderInfo}>
                  <Text style={styles.companyName}>{dashboard.account.companyName}</Text>
                  <Text style={styles.accountSubtitle}>
                    {dashboard.account.isActive ? "Active" : "Inactive"} · {activeMembers} active members
                  </Text>
                </View>
                <View style={styles.balancePill}>
                  <Text style={styles.balancePillText}>{dashboard.account.creditBalance} cr</Text>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.dark.textMuted}
                />
              </Pressable>

              {isExpanded ? (
                <View style={styles.accountBody}>
                  {/* Stats */}
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{dashboard.account.creditBalance}</Text>
                      <Text style={styles.statLabel}>Credits Left</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{dashboard.usageReport.totalCreditsUsed}</Text>
                      <Text style={styles.statLabel}>Total Used</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{activeMembers}</Text>
                      <Text style={styles.statLabel}>Active</Text>
                    </View>
                  </View>

                  {/* Members with per-person usage */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Members</Text>
                      <Pressable
                        style={styles.inviteSmallBtn}
                        onPress={() => setInvitingAccountId(dashboard.account.id)}
                      >
                        <Ionicons name="person-add-outline" size={14} color={Colors.dark.orange} />
                        <Text style={styles.inviteSmallBtnText}>Invite</Text>
                      </Pressable>
                    </View>

                    {invitingAccountId === dashboard.account.id ? (
                      <View style={styles.inviteForm}>
                        <TextInput
                          style={styles.input}
                          value={inviteEmail}
                          onChangeText={setInviteEmail}
                          placeholder="employee@company.com"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                        <View style={styles.inviteActions}>
                          <Pressable
                            style={styles.cancelInviteBtn}
                            onPress={() => { setInvitingAccountId(null); setInviteEmail(""); }}
                          >
                            <Text style={styles.cancelInviteBtnText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            style={styles.sendInviteBtn}
                            onPress={() => handleInvite(dashboard.account.id)}
                            disabled={inviteMutation.isPending}
                          >
                            {inviteMutation.isPending ? (
                              <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                            ) : (
                              <Text style={styles.sendInviteBtnText}>Send</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

                    {dashboard.members.length === 0 ? (
                      <Text style={styles.emptyRowText}>No members yet.</Text>
                    ) : (
                      dashboard.members.map((m) => {
                        const usage = dashboard.usageReport.memberUsage.find((u) => u.inviteEmail === m.inviteEmail);
                        return (
                          <View key={m.id} style={styles.memberRow}>
                            <View style={styles.memberIcon}>
                              <Ionicons
                                name="person-outline"
                                size={16}
                                color={m.inviteStatus === "accepted" ? Colors.dark.successNeon : Colors.dark.textMuted}
                              />
                            </View>
                            <View style={styles.memberInfo}>
                              <Text style={styles.memberEmail}>{m.inviteEmail}</Text>
                              {m.playerName ? (
                                <Text style={styles.memberPlayerName}>{m.playerName}</Text>
                              ) : null}
                              {usage ? (
                                <Text style={styles.memberUsage}>
                                  {usage.creditsUsed} credits used · {usage.sessionCount} sessions
                                </Text>
                              ) : null}
                            </View>
                            <View style={[
                              styles.statusBadge,
                              m.inviteStatus === "accepted" ? styles.acceptedBadge : styles.pendingBadge,
                            ]}>
                              <Text style={styles.statusBadgeText}>{m.inviteStatus}</Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>

                  {/* Recent Transactions */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent Transactions</Text>
                    {dashboard.recentTransactions.length === 0 ? (
                      <Text style={styles.emptyRowText}>No transactions yet.</Text>
                    ) : (
                      dashboard.recentTransactions.slice(0, 8).map((tx) => (
                        <View key={tx.id} style={styles.txRow}>
                          <View style={[
                            styles.txDot,
                            tx.type === "credit" ? styles.txDotCredit : styles.txDotDebit,
                          ]} />
                          <View style={styles.txInfo}>
                            <Text style={styles.txReason}>{tx.reason.replace(/_/g, " ")}</Text>
                            <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                          </View>
                          <Text style={[
                            styles.txAmount,
                            tx.type === "credit" ? styles.txAmountCredit : styles.txAmountDebit,
                          ]}>
                            {tx.amount > 0 ? "+" : ""}{tx.amount}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
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
    flex: 1,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
  },
  emptyState: {
    alignItems: "center",
    marginTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.title3,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  accountCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  accountIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  accountHeaderInfo: {
    flex: 1,
  },
  companyName: {
    ...Typography.bodyBold,
    color: Colors.dark.text,
  },
  accountSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  balancePill: {
    backgroundColor: Colors.dark.orange + "22",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  balancePillText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "700",
  },
  accountBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    padding: Spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statValue: {
    ...Typography.title3,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodyBold,
    color: Colors.dark.text,
  },
  inviteSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.orange + "22",
    borderRadius: BorderRadius.full,
  },
  inviteSmallBtnText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  inviteForm: {
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  inviteActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  cancelInviteBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  cancelInviteBtnText: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
  },
  sendInviteBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  sendInviteBtnText: {
    ...Typography.bodySmall,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  emptyRowText: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  memberIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  memberEmail: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
  },
  memberPlayerName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  memberUsage: {
    ...Typography.caption,
    color: Colors.dark.primary,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  acceptedBadge: {
    backgroundColor: Colors.dark.successNeon + "22",
  },
  pendingBadge: {
    backgroundColor: Colors.dark.textMuted + "22",
  },
  statusBadgeText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontSize: 10,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  txDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  txDotCredit: {
    backgroundColor: Colors.dark.successNeon,
  },
  txDotDebit: {
    backgroundColor: Colors.dark.danger,
  },
  txInfo: {
    flex: 1,
  },
  txReason: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  txDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  txAmount: {
    ...Typography.bodySmall,
    fontWeight: "700",
  },
  txAmountCredit: {
    color: Colors.dark.successNeon,
  },
  txAmountDebit: {
    color: Colors.dark.danger,
  },
});
