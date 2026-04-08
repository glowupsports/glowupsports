import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";
const PLATFORM_COLOR = "#9B59B6";

interface AcademyData {
  id: string;
  name: string;
  coaches: number;
  players: number;
  mrr: number;
  status: "active" | "trial" | "paused" | "overdue";
  lastActivity: string | null;
  tier?: string;
}

interface PlatformStats {
  academies: AcademyData[];
  metrics: {
    activeAcademies: number;
  };
}

const TIER_BADGE_COLORS: Record<string, string> = {
  starter: "#888",
  pro: "#6C63FF",
  elite: "#F0B429",
};

interface AcademyCardProps {
  name: string;
  coaches: number;
  players: number;
  mrr: number;
  status: "active" | "trial" | "paused" | "overdue";
  lastActivity: string | null;
  tier?: string;
  onPress?: () => void;
}

function AcademyCard({ name, coaches, players, mrr, status, lastActivity, tier, onPress }: AcademyCardProps) {
  const tierKey = (tier || "starter").toLowerCase();
  const tierColor = TIER_BADGE_COLORS[tierKey] || "#888";
  const statusConfig = {
    active: { color: Colors.dark.primary, label: "Active" },
    trial: { color: Colors.dark.xpCyan, label: "Trial" },
    paused: { color: Colors.dark.orange, label: "Paused" },
    overdue: { color: Colors.dark.error, label: "Overdue" },
  };

  const config = statusConfig[status];

  const formatLastActivity = (dateStr: string) => {
    if (!dateStr) return "Never";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Never";
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays > 0) return `${diffDays} days ago`;
      return "Recently";
    } catch {
      return "Recently";
    }
  };

  return (
    <Pressable 
      style={[styles.academyCard, CardStyles.elevated]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={styles.academyHeader}>
        <View style={styles.academyIcon}>
          <Ionicons name="business" size={24} color={PLATFORM_COLOR} />
        </View>
        <View style={styles.academyInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={styles.academyName}>{name}</Text>
            <View style={[styles.tierBadge, { backgroundColor: `${tierColor}20`, borderColor: `${tierColor}40` }]}>
              <Text style={[styles.tierBadgeText, { color: tierColor }]}>
                {tier || "Starter"}
              </Text>
            </View>
          </View>
          <Text style={styles.academyActivity}>Last active: {formatLastActivity(lastActivity)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      
      <View style={styles.academyStats}>
        <View style={styles.academyStat}>
          <Ionicons name="people-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.statValue}>{coaches}</Text>
          <Text style={styles.statLabel}>Coaches</Text>
        </View>
        <View style={styles.academyStat}>
          <Ionicons name="person-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.statValue}>{players}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.academyStat}>
          <Ionicons name="card-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={[styles.statValue, { color: Colors.dark.gold }]}>${mrr}</Text>
          <Text style={styles.statLabel}>MRR</Text>
        </View>
      </View>
    </Pressable>
  );
}

type NavigationProp = NativeStackNavigationProp<PlatformStackParamList>;

interface InviteData {
  token: string;
  email: string | null;
  role?: string;
  expiresAt: string;
}

interface CreateAcademyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (invite?: InviteData) => void;
}

function CreateAcademyModal({ visible, onClose, onSuccess }: CreateAcademyModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/platform/academies", {
        name,
        ownerEmail: ownerEmail || undefined,
        city: city || undefined,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      const inviteData = data?.invite as InviteData | null;
      setName("");
      setOwnerEmail("");
      setCity("");
      setError("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess(inviteData || undefined);
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to create academy");
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Academy name is required");
      return;
    }
    if (ownerEmail && !ownerEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    createMutation.mutate();
  };

  const handleClose = () => {
    setName("");
    setOwnerEmail("");
    setCity("");
    setError("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleClose} />
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.modalHandle} />
          
          <Text style={styles.modalTitle}>Create New Academy</Text>
          <Text style={styles.modalSubtitle}>Add a new academy to the platform</Text>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Academy Name *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Enter academy name"
              placeholderTextColor={Colors.dark.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Owner Email (optional)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="owner@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              value={ownerEmail}
              onChangeText={setOwnerEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.formHint}>An invitation will be sent to this email</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>City (optional)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Dubai"
              placeholderTextColor={Colors.dark.textMuted}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[styles.createButton, createMutation.isPending && styles.buttonDisabled]} 
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color={Colors.dark.buttonText} />
                  <Text style={styles.createButtonText}>Create Academy</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface InviteLinkModalProps {
  visible: boolean;
  invite: InviteData | null;
  onClose: () => void;
}

function InviteLinkModal({ visible, invite, onClose }: InviteLinkModalProps) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  if (!invite) return null;

  const raw = process.env.EXPO_PUBLIC_DOMAIN || process.env.EXPO_PUBLIC_API_URL || "glow-up-sports--ltvjeugd.replit.app";
  const cleanDomain = raw.replace(/^https?:\/\//, "").replace(/:\d+$/, "").replace(/\/$/, "");
  const inviteLink = `https://${cleanDomain}/join/${invite.token}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresDate = new Date(invite.expiresAt);
  const formattedExpiry = expiresDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.inviteModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.inviteIconContainer}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
          </View>
          
          <Text style={styles.inviteModalTitle}>Academy Created!</Text>
          <Text style={styles.inviteModalSubtitle}>
            Share this link with the academy owner to give them access:
          </Text>

          {invite.email ? (
            <View style={styles.inviteEmailBadge}>
              <Ionicons name="mail-outline" size={16} color={PLATFORM_COLOR} />
              <Text style={styles.inviteEmailText}>{invite.email}</Text>
            </View>
          ) : (
            <View style={styles.inviteEmailBadge}>
              <Ionicons name="link-outline" size={16} color={PLATFORM_COLOR} />
              <Text style={styles.inviteEmailText}>Shareable Link (anyone can use)</Text>
            </View>
          )}

          <View style={styles.inviteLinkBox}>
            <Text style={styles.inviteLinkLabel}>Invite Link</Text>
            <Text style={styles.inviteLinkText} numberOfLines={2}>{inviteLink}</Text>
          </View>

          <Text style={styles.inviteExpiryText}>
            Expires: {formattedExpiry}
          </Text>

          <View style={styles.inviteActions}>
            <Pressable 
              style={[styles.copyButton, copied && styles.copyButtonSuccess]} 
              onPress={handleCopy}
            >
              <Ionicons 
                name={copied ? "checkmark" : "copy-outline"} 
                size={20} 
                color={Colors.dark.buttonText} 
              />
              <Text style={styles.copyButtonText}>
                {copied ? "Copied!" : "Copy Link"}
              </Text>
            </Pressable>
            
            <Pressable style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AcademiesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<InviteData | null>(null);
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });
  const academies = stats?.academies || [];

  const filteredAcademies = academies.filter(academy => {
    const matchesSearch = academy.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus ? academy.status === filterStatus : true;
    return matchesSearch && matchesFilter;
  });

  const statusFilters = [
    { key: null, label: "All" },
    { key: "active", label: "Active" },
    { key: "trial", label: "Trial" },
    { key: "paused", label: "Paused" },
    { key: "overdue", label: "Overdue" },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading academies...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        
          <View style={styles.header}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={styles.title}>Academies</Text>
                <Text style={styles.subtitle}>{academies.length} total academies</Text>
                {academies.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {["Starter", "Pro", "Elite"].map((tier) => {
                      const count = academies.filter((a) => (a.tier || "Starter") === tier).length;
                      if (count === 0) return null;
                      const color = TIER_BADGE_COLORS[tier.toLowerCase()] || "#888";
                      return (
                        <View key={tier} style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: `${color}20`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{count} {tier}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
              <Pressable
                style={{
                  backgroundColor: PLATFORM_COLOR,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.sm,
                  borderRadius: BorderRadius.md,
                  gap: 6,
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowCreateModal(true);
                }}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Add Academy</Text>
              </Pressable>
            </View>
          </View>
        

        
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search academies..."
              placeholderTextColor={Colors.dark.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filtersScroll}
            contentContainerStyle={styles.filtersContainer}
          >
            {statusFilters.map((filter) => (
              <Pressable
                key={filter.key || "all"}
                style={[
                  styles.filterChip,
                  filterStatus === filter.key && styles.filterChipActive
                ]}
                onPress={() => setFilterStatus(filter.key)}
              >
                <Text style={[
                  styles.filterChipText,
                  filterStatus === filter.key && styles.filterChipTextActive
                ]}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        

        
        <View style={styles.academiesList}>
          {filteredAcademies.map((academy) => (
            <AcademyCard 
              key={academy.id} 
              {...academy} 
              onPress={() => navigation.navigate("AcademyDetail", { 
                academyId: academy.id, 
                academyName: academy.name 
              })}
            />
          ))}
        </View>
        

        {filteredAcademies.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No academies found</Text>
          </View>
        ) : null}
      </ScrollView>

      <CreateAcademyModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(invite) => {
          setShowCreateModal(false);
          if (invite) {
            setPendingInvite(invite);
          }
        }}
      />

      <InviteLinkModal
        visible={pendingInvite !== null}
        invite={pendingInvite}
        onClose={() => setPendingInvite(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  filtersScroll: {
    marginBottom: Spacing.lg,
  },
  filtersContainer: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  filterChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academiesList: {
    gap: Spacing.md,
  },
  academyCard: {
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  academyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${PLATFORM_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  academyInfo: {
    flex: 1,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academyActivity: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "600",
  },
  tierBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  academyStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  academyStat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: "500",
  },
  formInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  formHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    fontSize: 11,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${Colors.dark.error}15`,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.small,
    color: Colors.dark.error,
    flex: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  createButton: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: PLATFORM_COLOR,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  createButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  inviteModalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  inviteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  inviteModalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  inviteModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  inviteEmailBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${PLATFORM_COLOR}20`,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  inviteEmailText: {
    ...Typography.small,
    color: PLATFORM_COLOR,
    fontWeight: "500",
  },
  inviteLinkBox: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  inviteLinkLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    fontSize: 11,
  },
  inviteLinkText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  inviteExpiryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  inviteActions: {
    width: "100%",
    gap: Spacing.sm,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: PLATFORM_COLOR,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  copyButtonSuccess: {
    backgroundColor: Colors.dark.primary,
  },
  copyButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  doneButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  doneButtonText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
});
