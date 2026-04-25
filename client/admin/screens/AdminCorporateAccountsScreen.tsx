import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

interface CorporateAccount {
  id: string;
  academyId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  creditBalance: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CorporateMember {
  id: string;
  corporateAccountId: string;
  playerId: string | null;
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
  createdAt: string;
}

interface AccountDetail {
  account: CorporateAccount;
  members: CorporateMember[];
  transactions: CorporateTransaction[];
  usageReport: {
    totalCreditsUsed: number;
    memberUsage: { playerId: string; inviteEmail: string; creditsUsed: number; sessionCount: number }[];
  };
}

export default function AdminCorporateAccountsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<CorporateAccount | null>(null);
  const [csvExporting, setCsvExporting] = useState(false);

  const [createForm, setCreateForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    creditBalance: "",
    notes: "",
  });

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpNotes, setTopUpNotes] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: accounts = [], isLoading } = useQuery<CorporateAccount[]>({
    queryKey: ["/api/corporate-accounts"],
  });

  const { data: accountDetail, isLoading: isLoadingDetail } = useQuery<AccountDetail>({
    queryKey: ["/api/corporate-accounts", selectedAccount?.id],
    enabled: !!selectedAccount?.id && showDetailModal,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) =>
      apiRequest("POST", "/api/corporate-accounts", {
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        creditBalance: parseInt(data.creditBalance) || 0,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate-accounts"] });
      setShowCreateModal(false);
      setCreateForm({ companyName: "", contactName: "", contactEmail: "", creditBalance: "", notes: "" });
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create corporate account");
    },
  });

  const topUpMutation = useMutation({
    mutationFn: ({ id, amount, notes }: { id: string; amount: number; notes?: string }) =>
      apiRequest("POST", `/api/corporate-accounts/${id}/top-up`, { amount, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate-accounts", selectedAccount?.id] });
      setShowTopUpModal(false);
      setTopUpAmount("");
      setTopUpNotes("");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to top up credits");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      apiRequest("POST", `/api/corporate-accounts/${id}/invite`, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate-accounts", selectedAccount?.id] });
      setShowInviteModal(false);
      setInviteEmail("");
      Alert.alert("Sent", "Invitation email sent to the employee.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to send invite");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/corporate-accounts/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate-accounts"] });
    },
  });

  const sendReportMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/corporate-accounts/${id}/send-report`, {}),
    onSuccess: (_, id) => {
      Alert.alert("Report Sent", "Monthly usage report emailed to the company contact.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to send report");
    },
  });

  const handleCreate = () => {
    if (!createForm.companyName.trim() || !createForm.contactName.trim() || !createForm.contactEmail.trim()) {
      Alert.alert("Validation", "Company name, contact name, and email are required.");
      return;
    }
    createMutation.mutate(createForm);
  };

  const handleTopUp = () => {
    const amount = parseInt(topUpAmount);
    if (!amount || amount < 1) {
      Alert.alert("Validation", "Please enter a valid amount.");
      return;
    }
    if (!selectedAccount) return;
    topUpMutation.mutate({ id: selectedAccount.id, amount, notes: topUpNotes || undefined });
  };

  const handleInvite = () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      Alert.alert("Validation", "Please enter a valid email address.");
      return;
    }
    if (!selectedAccount) return;
    inviteMutation.mutate({ id: selectedAccount.id, email: inviteEmail.trim() });
  };

  const openDetail = (account: CorporateAccount) => {
    setSelectedAccount(account);
    setShowDetailModal(true);
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    // Reset nested-modal state so Top Up / Invite never reopen stale next
    // time the detail drawer is presented (both are rendered inside the
    // detail <Modal> — see replit.md → Modal stacking).
    setShowTopUpModal(false);
    setShowInviteModal(false);
    setTopUpAmount("");
    setTopUpNotes("");
    setInviteEmail("");
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const renderAccount = ({ item }: { item: CorporateAccount }) => (
    <Pressable style={styles.accountCard} onPress={() => openDetail(item)}>
      <View style={styles.accountHeader}>
        <View style={styles.accountIconBox}>
          <Ionicons name="business-outline" size={22} color={Colors.dark.orange} />
        </View>
        <View style={styles.accountInfo}>
          <Text style={styles.companyName}>{item.companyName}</Text>
          <Text style={styles.contactName}>{item.contactName} - {item.contactEmail}</Text>
        </View>
        <View style={[styles.activeBadge, !item.isActive && styles.inactiveBadge]}>
          <Text style={[styles.activeBadgeText, !item.isActive && styles.inactiveBadgeText]}>
            {item.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>
      <View style={styles.accountCredits}>
        <Ionicons name="layers-outline" size={16} color={Colors.dark.xpCyan} />
        <Text style={styles.creditBalance}>{item.creditBalance} credits</Text>
        <Text style={styles.creditLabel}>available</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Corporate Accounts</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={22} color={Colors.dark.text} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.orange} style={{ marginTop: Spacing.xl }} />
      ) : accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No Corporate Accounts</Text>
          <Text style={styles.emptyText}>Create a corporate account to let companies manage sessions for their employees.</Text>
          <Pressable style={styles.createBtn} onPress={() => setShowCreateModal(true)}>
            <Text style={styles.createBtnText}>Create Account</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccount}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Corporate Account</Text>
            <Pressable onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat style={styles.modalScroll} contentContainerStyle={{ padding: Spacing.md }}>
            <Text style={styles.fieldLabel}>Company Name *</Text>
            <TextInput
              style={styles.input}
              value={createForm.companyName}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, companyName: v }))}
              placeholder="Acme Corp"
              placeholderTextColor={Colors.dark.textMuted}
            />
            <Text style={styles.fieldLabel}>Contact Person *</Text>
            <TextInput
              style={styles.input}
              value={createForm.contactName}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, contactName: v }))}
              placeholder="John Smith"
              placeholderTextColor={Colors.dark.textMuted}
            />
            <Text style={styles.fieldLabel}>Contact Email *</Text>
            <TextInput
              style={styles.input}
              value={createForm.contactEmail}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, contactEmail: v }))}
              placeholder="john@acme.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Initial Credits (optional)</Text>
            <TextInput
              style={styles.input}
              value={createForm.creditBalance}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, creditBalance: v }))}
              placeholder="0"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="numeric"
            />
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={createForm.notes}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, notes: v }))}
              placeholder="Invoice terms, billing instructions..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
            />
            <Pressable style={styles.submitBtn} onPress={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <ActivityIndicator color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.submitBtnText}>Create Account</Text>
              )}
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDetail}>
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedAccount?.companyName}</Text>
            <Pressable onPress={closeDetail}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}>
            {isLoadingDetail ? (
              <ActivityIndicator color={Colors.dark.orange} style={{ marginTop: Spacing.xl }} />
            ) : accountDetail ? (
              <>
                {/* Balance Card */}
                <View style={styles.balanceCard}>
                  <Text style={styles.balanceLabel}>Credit Balance</Text>
                  <Text style={styles.balanceValue}>{accountDetail.account.creditBalance}</Text>
                  <Text style={styles.balanceSubLabel}>credits available</Text>
                  <View style={styles.balanceActions}>
                    <Pressable style={styles.actionBtn} onPress={() => setShowTopUpModal(true)}>
                      <Ionicons name="add-circle-outline" size={18} color={Colors.dark.text} />
                      <Text style={styles.actionBtnText}>Top Up</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnSecondary]}
                      onPress={() => {
                        if (!selectedAccount) return;
                        toggleActiveMutation.mutate({ id: selectedAccount.id, isActive: !accountDetail.account.isActive });
                        setSelectedAccount((p) => p ? { ...p, isActive: !p.isActive } : p);
                      }}
                    >
                      <Ionicons
                        name={accountDetail.account.isActive ? "pause-circle-outline" : "play-circle-outline"}
                        size={18}
                        color={Colors.dark.text}
                      />
                      <Text style={styles.actionBtnText}>
                        {accountDetail.account.isActive ? "Deactivate" : "Activate"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnSecondary]}
                      onPress={() => {
                        if (!selectedAccount) return;
                        sendReportMutation.mutate(selectedAccount.id);
                      }}
                      disabled={sendReportMutation.isPending}
                    >
                      {sendReportMutation.isPending ? (
                        <ActivityIndicator size="small" color={Colors.dark.text} />
                      ) : (
                        <Ionicons name="mail-outline" size={18} color={Colors.dark.text} />
                      )}
                      <Text style={styles.actionBtnText}>Email Report</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnSecondary, csvExporting && styles.buttonDisabled]}
                      disabled={csvExporting}
                      onPress={async () => {
                        if (!selectedAccount || csvExporting) return;
                        setCsvExporting(true);
                        try {
                          const res = await apiRequest("GET", `/api/corporate-accounts/${selectedAccount.id}/export-csv`);
                          const csvText = await res.text();
                          if (Platform.OS === "web") {
                            const blob = new Blob([csvText], { type: "text/csv" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${selectedAccount.companyName.replace(/\s+/g, "_")}_report.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } else {
                            const fileName = `${selectedAccount.companyName.replace(/\s+/g, "_")}_report.csv`;
                            const fileUri = FileSystem.cacheDirectory + fileName;
                            await FileSystem.writeAsStringAsync(fileUri, csvText, { encoding: FileSystem.EncodingType.UTF8 });
                            const canShare = await Sharing.isAvailableAsync();
                            if (canShare) {
                              await Sharing.shareAsync(fileUri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
                            } else {
                              Alert.alert("Exported", `CSV saved to cache as ${fileName}`);
                            }
                          }
                        } catch (err) {
                          Alert.alert("Export failed", "Could not export CSV. Please try again.");
                        } finally {
                          setCsvExporting(false);
                        }
                      }}
                    >
                      {csvExporting ? (
                        <ActivityIndicator size="small" color={Colors.dark.text} />
                      ) : (
                        <Ionicons name="download-outline" size={18} color={Colors.dark.text} />
                      )}
                      <Text style={styles.actionBtnText}>Export CSV</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Usage Summary */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Usage Summary</Text>
                  <View style={styles.statRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{accountDetail.usageReport.totalCreditsUsed}</Text>
                      <Text style={styles.statLabel}>Total Used</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{accountDetail.members.filter(m => m.inviteStatus === "accepted").length}</Text>
                      <Text style={styles.statLabel}>Active Members</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{accountDetail.members.length}</Text>
                      <Text style={styles.statLabel}>Total Invited</Text>
                    </View>
                  </View>
                </View>

                {/* Members */}
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Members</Text>
                    <Pressable style={styles.inviteBtn} onPress={() => setShowInviteModal(true)}>
                      <Ionicons name="person-add-outline" size={16} color={Colors.dark.orange} />
                      <Text style={styles.inviteBtnText}>Invite</Text>
                    </Pressable>
                  </View>
                  {accountDetail.members.length === 0 ? (
                    <Text style={styles.emptyText}>No members yet. Invite employees by email.</Text>
                  ) : (
                    accountDetail.members.map((m) => {
                      const usage = accountDetail.usageReport.memberUsage.find(
                        (u) => u.inviteEmail === m.inviteEmail
                      );
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
                              <Text style={styles.memberUsageStat}>
                                {usage.creditsUsed} credits · {usage.sessionCount} sessions
                              </Text>
                            ) : null}
                          </View>
                          <View style={[
                            styles.statusBadge,
                            m.inviteStatus === "accepted" ? styles.acceptedBadge : styles.pendingBadge
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
                  <Text style={styles.sectionTitle}>Credit History</Text>
                  {accountDetail.transactions.length === 0 ? (
                    <Text style={styles.emptyText}>No transactions yet.</Text>
                  ) : (
                    accountDetail.transactions.slice(0, 10).map((tx) => (
                      <View key={tx.id} style={styles.txRow}>
                        <View style={[
                          styles.txIcon,
                          tx.type === "credit" ? styles.txCredit : styles.txDebit
                        ]}>
                          <Ionicons
                            name={tx.type === "credit" ? "arrow-down" : "arrow-up"}
                            size={14}
                            color={tx.type === "credit" ? Colors.dark.successNeon : Colors.dark.danger}
                          />
                        </View>
                        <View style={styles.txInfo}>
                          <Text style={styles.txReason}>{tx.reason.replace(/_/g, " ")}</Text>
                          <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                        </View>
                        <Text style={[
                          styles.txAmount,
                          tx.type === "credit" ? styles.txAmountCredit : styles.txAmountDebit
                        ]}>
                          {tx.type === "credit" ? "+" : ""}{tx.amount}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>

          {/*
            NESTED MODALS (top-up + invite) — see replit.md → Modal stacking.
            They are opened from inside this Detail Modal, so they must render
            as children of the parent <Modal> JSX. Rendering them as siblings on
            the screen would cause them to mount in a separate native window
            and appear BEHIND this drawer on iOS.
          */}
          {/* Top Up Modal */}
          <Modal visible={showTopUpModal} animationType="slide" presentationStyle="formSheet">
            <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.md }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Top Up Credits</Text>
                <Pressable onPress={() => setShowTopUpModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              <KeyboardAwareScrollViewCompat style={styles.modalScroll} contentContainerStyle={{ padding: Spacing.md }}>
                <Text style={styles.fieldLabel}>Credits to Add *</Text>
                <TextInput
                  style={styles.input}
                  value={topUpAmount}
                  onChangeText={setTopUpAmount}
                  placeholder="50"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={topUpNotes}
                  onChangeText={setTopUpNotes}
                  placeholder="Invoice #1234"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Pressable style={styles.submitBtn} onPress={handleTopUp} disabled={topUpMutation.isPending}>
                  {topUpMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.submitBtnText}>Add Credits</Text>
                  )}
                </Pressable>
              </KeyboardAwareScrollViewCompat>
            </View>
          </Modal>

          {/* Invite Modal */}
          <Modal visible={showInviteModal} animationType="slide" presentationStyle="formSheet">
            <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.md }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Invite Employee</Text>
                <Pressable onPress={() => setShowInviteModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              <KeyboardAwareScrollViewCompat style={styles.modalScroll} contentContainerStyle={{ padding: Spacing.md }}>
                <Text style={styles.fieldLabel}>Employee Email *</Text>
                <TextInput
                  style={styles.input}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="employee@company.com"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.inviteNote}>An email with an invite token will be sent to this address.</Text>
                <Pressable style={styles.submitBtn} onPress={handleInvite} disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.submitBtnText}>Send Invite</Text>
                  )}
                </Pressable>
              </KeyboardAwareScrollViewCompat>
            </View>
          </Modal>
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
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
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
  addBtn: {
    padding: Spacing.xs,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.full,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.title3,
    color: Colors.dark.text,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  createBtn: {
    backgroundColor: Colors.dark.orange,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  createBtnText: {
    ...Typography.callout,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  accountCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: {
    flex: 1,
  },
  companyName: {
    ...Typography.callout,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  contactName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  activeBadge: {
    backgroundColor: Colors.dark.successNeon + "22",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  inactiveBadge: {
    backgroundColor: Colors.dark.textMuted + "22",
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  inactiveBadgeText: {
    color: Colors.dark.textMuted,
  },
  accountCredits: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  creditBalance: {
    ...Typography.callout,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  creditLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.title2,
    color: Colors.dark.text,
  },
  modalScroll: {
    flex: 1,
  },
  fieldLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitBtn: {
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  submitBtnText: {
    ...Typography.callout,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  balanceCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  balanceLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 48,
    fontWeight: "900",
    color: Colors.dark.xpCyan,
    marginVertical: Spacing.xs,
  },
  balanceSubLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  balanceActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.orange,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.dark.surfaceAlt,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  statRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    ...Typography.title2,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.orange + "22",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  inviteBtnText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  memberIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  memberEmail: {
    ...Typography.caption,
    color: Colors.dark.text,
  },
  memberPlayerName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  memberUsageStat: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  acceptedBadge: {
    backgroundColor: Colors.dark.successNeon + "22",
  },
  pendingBadge: {
    backgroundColor: Colors.dark.orange + "22",
  },
  statusBadgeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
    textTransform: "capitalize",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  txIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  txCredit: {
    backgroundColor: Colors.dark.successNeon + "22",
  },
  txDebit: {
    backgroundColor: Colors.dark.danger + "22",
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
  txAmountCredit: {
    color: Colors.dark.successNeon,
  },
  txAmountDebit: {
    color: Colors.dark.danger,
  },
  inviteNote: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  border: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
});
