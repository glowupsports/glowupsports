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

interface Invite {
  id: string;
  token: string;
  role: string;
  invitedEmail: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

interface InviteCardProps {
  invite: Invite;
  onCopy: (token: string) => void;
}

function InviteCard({ invite, onCopy }: InviteCardProps) {
  const isExpired = new Date(invite.expiresAt) < new Date();
  const isUsed = !!invite.usedAt;
  
  let status: "active" | "used" | "expired" = "active";
  let statusColor = Colors.dark.primary;
  let statusLabel = "Active";
  
  if (isUsed) {
    status = "used";
    statusColor = Colors.dark.xpCyan;
    statusLabel = "Used";
  } else if (isExpired) {
    status = "expired";
    statusColor = Colors.dark.error;
    statusLabel = "Expired";
  }

  const expiryDate = new Date(invite.expiresAt);
  const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <View style={[styles.inviteCard, CardStyles.elevated]}>
      <View style={styles.inviteHeader}>
        <View style={[styles.roleIcon, { backgroundColor: `${Colors.dark.gold}20` }]}>
          <Ionicons name="tennisball" size={20} color={Colors.dark.gold} />
        </View>
        <View style={styles.inviteInfo}>
          <Text style={styles.inviteRole}>
            {invite.role === "coach" ? "Coach Invite" : "Academy Owner Invite"}
          </Text>
          {invite.invitedEmail ? (
            <Text style={styles.inviteEmail}>{invite.invitedEmail}</Text>
          ) : (
            <Text style={styles.inviteEmailGeneral}>Open invite (any email)</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.inviteDetails}>
        {status === "active" ? (
          <Text style={styles.expiryText}>
            Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
          </Text>
        ) : status === "used" ? (
          <Text style={styles.expiryText}>
            Used on {new Date(invite.usedAt!).toLocaleDateString()}
          </Text>
        ) : (
          <Text style={[styles.expiryText, { color: Colors.dark.error }]}>
            Expired on {expiryDate.toLocaleDateString()}
          </Text>
        )}
      </View>

      {status === "active" ? (
        <Pressable
          style={styles.copyButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onCopy(invite.token);
          }}
        >
          <Ionicons name="copy-outline" size={16} color={Colors.dark.gold} />
          <Text style={styles.copyButtonText}>Copy Invite Link</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function InviteManagementScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");

  const { data: invitesData, isLoading } = useQuery<{ invites: Invite[] }>({
    queryKey: ["/api/invites"],
  });

  const createInviteMutation = useMutation({
    mutationFn: async (data: { email?: string; expiresInDays: number }) => {
      const response = await apiRequest("POST", "/api/invites", {
        role: "coach",
        email: data.email || undefined,
        expiresInDays: data.expiresInDays,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      setShowCreateForm(false);
      setEmail("");
      setExpiresInDays("7");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      const { EXPO_PUBLIC_API_URL, EXPO_PUBLIC_DOMAIN } = getEnv();
      const baseUrl = EXPO_PUBLIC_API_URL || `https://${EXPO_PUBLIC_DOMAIN}`;
      const inviteUrl = `${baseUrl}/join/${data.invite.token}`;
      Clipboard.setStringAsync(inviteUrl);
      Alert.alert("Invite Created", "The invite link has been copied to your clipboard.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create invite");
    },
  });

  const handleCopyLink = async (token: string) => {
    const { EXPO_PUBLIC_API_URL, EXPO_PUBLIC_DOMAIN } = getEnv();
    const baseUrl = EXPO_PUBLIC_API_URL || `https://${EXPO_PUBLIC_DOMAIN}`;
    const inviteUrl = `${baseUrl}/join/${token}`;
    await Clipboard.setStringAsync(inviteUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "Invite link copied to clipboard");
  };

  const handleCreateInvite = () => {
    const days = parseInt(expiresInDays, 10);
    if (isNaN(days) || days < 1 || days > 30) {
      Alert.alert("Error", "Please enter a valid number of days (1-30)");
      return;
    }
    createInviteMutation.mutate({
      email: email.trim() || undefined,
      expiresInDays: days,
    });
  };

  const invites = invitesData?.invites || [];
  const activeInvites = invites.filter(
    (i) => !i.usedAt && new Date(i.expiresAt) >= new Date()
  );
  const usedInvites = invites.filter((i) => i.usedAt);
  const expiredInvites = invites.filter(
    (i) => !i.usedAt && new Date(i.expiresAt) < new Date()
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable 
            style={styles.backButton} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Coach Invites</Text>
            <Text style={styles.subtitle}>Invite coaches to join your academy</Text>
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

      {showCreateForm ? (
        <View style={[styles.createForm, CardStyles.elevated]}>
          <Text style={styles.formTitle}>Create New Invite</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email (optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="coach@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.inputHint}>
              Leave empty to create an open invite for any email
            </Text>
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
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                setShowCreateForm(false);
                setEmail("");
                setExpiresInDays("7");
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.createButton, createInviteMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreateInvite}
              disabled={createInviteMutation.isPending}
            >
              {createInviteMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
              ) : (
                <>
                  <Ionicons name="send" size={16} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.createButtonText}>Create Invite</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateForm(true);
          }}
        >
          <Ionicons name="add-circle" size={20} color={Colors.dark.gold} />
          <Text style={styles.addButtonText}>Create New Invite</Text>
        </Pressable>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.gold} />
          </View>
        ) : invites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="mail-outline" size={48} color={Colors.dark.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Invites Yet</Text>
            <Text style={styles.emptyText}>
              Create an invite to start growing your coaching team
            </Text>
          </View>
        ) : (
          <>
            {activeInvites.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Invites</Text>
                {activeInvites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} onCopy={handleCopyLink} />
                ))}
              </View>
            ) : null}

            {usedInvites.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Used Invites</Text>
                {usedInvites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} onCopy={handleCopyLink} />
                ))}
              </View>
            ) : null}

            {expiredInvites.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Expired Invites</Text>
                {expiredInvites.map((invite) => (
                  <InviteCard key={invite.id} invite={invite} onCopy={handleCopyLink} />
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
  backButton: {
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
    color: Colors.dark.gold,
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
    marginBottom: Spacing.lg,
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold,
    borderStyle: "dashed",
  },
  addButtonText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  createForm: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  formTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  inputHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  formActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  createButton: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.gold,
    gap: Spacing.sm,
  },
  createButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.xl * 2,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing.xl * 2,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  inviteCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  inviteRole: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  inviteEmail: {
    ...Typography.small,
    color: Colors.dark.gold,
  },
  inviteEmailGeneral: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: 4,
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
  inviteDetails: {
    marginTop: Spacing.sm,
    paddingLeft: 52,
  },
  expiryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.dark.gold}15`,
    gap: Spacing.xs,
  },
  copyButtonText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
});
