import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { getEnv } from "@/lib/env";

interface ProviderInvite {
  id: string;
  token: string;
  invitedEmail: string | null;
  invitedName: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

function getInviteStatus(invite: ProviderInvite): { label: string; color: string } {
  if (invite.usedAt) return { label: "Used", color: Colors.dark.xpCyan };
  if (new Date(invite.expiresAt) < new Date()) return { label: "Expired", color: Colors.dark.error };
  return { label: "Active", color: Colors.dark.primary };
}

function buildProviderJoinUrl(token: string): string {
  const { EXPO_PUBLIC_DOMAIN, EXPO_PUBLIC_API_URL } = getEnv();
  const raw = EXPO_PUBLIC_DOMAIN || EXPO_PUBLIC_API_URL || "";
  const domain = raw.replace(/^https?:\/\//, "").replace(/:\d+$/, "").replace(/\/$/, "");
  return `https://${domain}/provider-join/${token}`;
}

function InviteCard({
  invite,
  onCopy,
  onRevoke,
}: {
  invite: ProviderInvite;
  onCopy: (token: string) => void;
  onRevoke: (id: string) => void;
}) {
  const { label, color } = getInviteStatus(invite);
  const isActive = label === "Active";
  const expiryDate = new Date(invite.expiresAt);
  const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <View style={[styles.inviteCard, CardStyles.elevated]}>
      <View style={styles.cardHeader}>
        <View style={[styles.roleIcon, { backgroundColor: `${Colors.dark.primary}20` }]}>
          <Ionicons name="construct" size={20} color={Colors.dark.primary} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>
            {invite.invitedName ? invite.invitedName : "Open Provider Invite"}
          </Text>
          {invite.invitedEmail ? (
            <Text style={styles.cardEmail}>{invite.invitedEmail}</Text>
          ) : (
            <Text style={styles.cardEmailOpen}>Any email</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${color}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.statusText, { color }]}>{label}</Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        {isActive ? (
          <Text style={styles.metaText}>Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</Text>
        ) : label === "Used" ? (
          <Text style={styles.metaText}>Used on {new Date(invite.usedAt!).toLocaleDateString()}</Text>
        ) : (
          <Text style={[styles.metaText, { color: Colors.dark.error }]}>
            Expired on {expiryDate.toLocaleDateString()}
          </Text>
        )}
      </View>

      {isActive ? (
        <View style={styles.cardActions}>
          <Pressable
            style={styles.copyButton}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onCopy(invite.token); }}
          >
            <Ionicons name="copy-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.copyButtonText}>Copy Link</Text>
          </Pressable>
          <Pressable
            style={styles.revokeButton}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRevoke(invite.id); }}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
            <Text style={styles.revokeButtonText}>Revoke</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function ProviderInviteManagementScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [activeMethod, setActiveMethod] = useState<"link" | "direct" | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");

  const { data, isLoading } = useQuery<{ invites: ProviderInvite[] }>({
    queryKey: ["/api/provider-invites"],
  });

  const createInviteMutation = useMutation({
    mutationFn: async (body: { email?: string; name?: string; expiresInDays: number }) => {
      const response = await apiRequest("POST", "/api/provider-invites", body);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider-invites"] });
      setActiveMethod(null);
      setEmail("");
      setName("");
      setExpiresInDays("7");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const url = buildProviderJoinUrl(data.invite.token);
      Clipboard.setStringAsync(url);
      Alert.alert("Invite Created", "The invite link has been copied to your clipboard.\n\n" + url);
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to create invite");
    },
  });

  const createDirectMutation = useMutation({
    mutationFn: async (body: { email: string; name: string }) => {
      const response = await apiRequest("POST", "/api/provider-invites/create-direct", body);
      return response.json();
    },
    onSuccess: () => {
      setActiveMethod(null);
      setEmail("");
      setName("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Account Created", "The provider account has been created and login credentials sent to their email.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to create provider account");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/provider-invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider-invites"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to revoke invite");
    },
  });

  const handleCopyLink = async (token: string) => {
    const url = buildProviderJoinUrl(token);
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", `Invite link copied:\n${url}`);
  };

  const handleRevoke = (id: string) => {
    Alert.alert("Revoke Invite", "Are you sure you want to revoke this invite?", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => revokeMutation.mutate(id) },
    ]);
  };

  const handleCreateLink = () => {
    const days = parseInt(expiresInDays, 10);
    if (isNaN(days) || days < 1 || days > 30) {
      Alert.alert("Error", "Please enter a valid number of days (1–30)");
      return;
    }
    createInviteMutation.mutate({
      email: email.trim() || undefined,
      name: name.trim() || undefined,
      expiresInDays: days,
    });
  };

  const handleCreateDirect = () => {
    if (!email.trim()) { Alert.alert("Error", "Please enter the provider's email"); return; }
    if (!name.trim()) { Alert.alert("Error", "Please enter the provider's name"); return; }
    createDirectMutation.mutate({ email: email.trim(), name: name.trim() });
  };

  const invites = data?.invites || [];
  const activeInvites = invites.filter(i => !i.usedAt && new Date(i.expiresAt) >= new Date());
  const usedInvites = invites.filter(i => i.usedAt);
  const expiredInvites = invites.filter(i => !i.usedAt && new Date(i.expiresAt) < new Date());

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Provider Invites</Text>
            <Text style={styles.subtitle}>Invite service providers to the platform</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: Colors.dark.primary }]}>
          <Text style={styles.statValue}>{activeInvites.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.dark.xpCyan }]}>
          <Text style={styles.statValue}>{usedInvites.length}</Text>
          <Text style={styles.statLabel}>Used</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.dark.error }]}>
          <Text style={styles.statValue}>{expiredInvites.length}</Text>
          <Text style={styles.statLabel}>Expired</Text>
        </View>
      </View>

      {activeMethod === null ? (
        <View style={styles.methodButtons}>
          <Pressable style={styles.methodBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveMethod("link"); }}>
            <View style={[styles.methodIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
              <Ionicons name="link" size={24} color={Colors.dark.primary} />
            </View>
            <View style={styles.methodTextGroup}>
              <Text style={styles.methodTitle}>Send Invite Link</Text>
              <Text style={styles.methodDesc}>Generate a link the provider uses to set their own credentials</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable style={styles.methodBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveMethod("direct"); }}>
            <View style={[styles.methodIcon, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
              <Ionicons name="person-add" size={24} color={Colors.dark.xpCyan} />
            </View>
            <View style={styles.methodTextGroup}>
              <Text style={styles.methodTitle}>Create Account Directly</Text>
              <Text style={styles.methodDesc}>Create an account and email the provider their temporary credentials</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        </View>
      ) : activeMethod === "link" ? (
        <View style={[styles.formCard, CardStyles.elevated]}>
          <Text style={styles.formTitle}>Create Invite Link</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Provider Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., John Smith"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email (optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="provider@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.inputHint}>Leave empty for an open invite any provider can use</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Expires in (days)</Text>
            <TextInput
              style={styles.input}
              value={expiresInDays}
              onChangeText={setExpiresInDays}
              placeholder="7"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} onPress={() => { setActiveMethod(null); setEmail(""); setName(""); setExpiresInDays("7"); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, createInviteMutation.isPending && styles.btnDisabled]}
              onPress={handleCreateLink}
              disabled={createInviteMutation.isPending}
            >
              {createInviteMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Ionicons name="link" size={16} color={Colors.dark.buttonText} />
                  <Text style={styles.submitBtnText}>Create Link</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.formCard, CardStyles.elevated]}>
          <Text style={styles.formTitle}>Create Provider Account</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Provider Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., John Smith"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Provider Email *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="provider@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.inputHint}>Login credentials will be sent to this email</Text>
          </View>

          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} onPress={() => { setActiveMethod(null); setEmail(""); setName(""); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, { backgroundColor: Colors.dark.xpCyan }, createDirectMutation.isPending && styles.btnDisabled]}
              onPress={handleCreateDirect}
              disabled={createDirectMutation.isPending}
            >
              {createDirectMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Ionicons name="person-add" size={16} color={Colors.dark.buttonText} />
                  <Text style={styles.submitBtnText}>Create & Send</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : invites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="construct-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Provider Invites Yet</Text>
            <Text style={styles.emptyText}>Use one of the options above to invite your first provider.</Text>
          </View>
        ) : (
          <>
            {activeInvites.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Invites</Text>
                {activeInvites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} onCopy={handleCopyLink} onRevoke={handleRevoke} />
                ))}
              </View>
            ) : null}
            {usedInvites.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Used Invites</Text>
                {usedInvites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} onCopy={handleCopyLink} onRevoke={handleRevoke} />
                ))}
              </View>
            ) : null}
            {expiredInvites.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Expired Invites</Text>
                {expiredInvites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} onCopy={handleCopyLink} onRevoke={handleRevoke} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  methodButtons: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  methodBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  methodTextGroup: {
    flex: 1,
    gap: 2,
  },
  methodTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  methodDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  formCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  formTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
    gap: 6,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  input: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inputHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  formActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelBtnText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
  },
  submitBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  inviteCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  cardEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  cardEmailOpen: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "600",
  },
  cardMeta: {},
  metaText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  copyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.dark.primary}15`,
  },
  copyButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  revokeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.dark.error}15`,
  },
  revokeButtonText: {
    ...Typography.small,
    color: Colors.dark.error,
    fontWeight: "600",
  },
});
