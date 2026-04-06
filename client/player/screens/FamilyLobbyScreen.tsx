import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
  TextInput,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp, FadeInRight, ZoomIn } from "react-native-reanimated";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { useFamily, FamilyMember } from "@/player/context/FamilyContext";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getStaticAssetsUrl, getApiUrl } from "@/lib/query-client";
import { getAuthToken, secureSet } from "@/lib/auth";
import CreateFamilyMemberFlow from "@/player/components/CreateFamilyMemberFlow";

export const FAMILY_SWITCH_KEY = "family_switch";

function parseApiError(error: any, fallback: string): string {
  const raw: string = error?.message || "";
  const colonIdx = raw.indexOf(":");
  if (colonIdx !== -1) {
    try {
      const jsonPart = raw.substring(colonIdx + 1).trim();
      const parsed = JSON.parse(jsonPart);
      if (parsed?.error) return parsed.error;
    } catch {
    }
  }
  return raw || fallback;
}

function getBallColor(ball: string | null): string {
  switch (ball?.toLowerCase()) {
    case "green": return "#2ECC40";
    case "yellow": return "#FFDC00";
    case "orange": return "#FF851B";
    case "red": return "#FF4136";
    case "glow": return "#E040FB";
    default: return Colors.dark.textMuted;
  }
}

function formatNextSession(session: { date: string; type: string } | null): string {
  if (!session) return "No upcoming sessions";
  
  const date = new Date(session.date);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays === 0) {
    if (diffHours <= 0) return "Session now!";
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Tomorrow ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  }
}

function formatLastActive(lastActiveAt: string | null): string {
  if (!lastActiveAt) return "";
  
  const date = new Date(lastActiveAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 5) return "Online now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

interface ChildCardProps {
  member: FamilyMember;
  onPress: () => void;
  index: number;
}

function ChildCard({ member, onPress, index }: ChildCardProps) {
  const hasOutstanding = member.outstandingBalance > 0;
  const lastActiveText = formatLastActive(member.lastActiveAt);
  
  return (
    <Animated.View entering={FadeInRight.delay(index * 100).duration(400)}>
      <Pressable
        style={styles.childCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open player profile for ${member.name}`}
      >
        <LinearGradient
          colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
          style={styles.cardGradient}
        >
          <View style={styles.avatarContainer}>
            {member.avatarUrl ? (
              <Image
                source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={32} color={Colors.dark.textMuted} />
              </View>
            )}
            <View style={[styles.ballBadge, { backgroundColor: getBallColor(member.ballLevel) }]}>
              <Ionicons name="tennisball" size={12} color={Colors.dark.backgroundRoot} />
            </View>
            {lastActiveText === "Online now" ? (
              <View style={styles.onlineIndicator} />
            ) : null}
          </View>

          <Text style={styles.childName} numberOfLines={1}>{member.name}</Text>

          {member.ballLevel ? (
            <View style={[styles.ballLevelTextBadge, { backgroundColor: getBallColor(member.ballLevel) + "25" }]}>
              <Ionicons name="tennisball" size={12} color={getBallColor(member.ballLevel)} />
              <Text style={[styles.ballLevelTextLabel, { color: getBallColor(member.ballLevel) }]}>
                {member.ballLevel.charAt(0).toUpperCase() + member.ballLevel.slice(1)} Ball
              </Text>
            </View>
          ) : null}

          <View style={styles.levelRow}>
            <View style={styles.levelBadge}>
              <Ionicons name="star" size={14} color={Colors.dark.gold} />
              <Text style={styles.levelText}>Level {member.level}</Text>
            </View>
          </View>

          <View style={styles.xpRow}>
            <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.xpText}>{member.xp.toLocaleString()} XP</Text>
          </View>

          <View style={styles.sessionRow}>
            <Ionicons 
              name="calendar" 
              size={12} 
              color={Colors.dark.textSecondary} 
            />
            <Text style={styles.sessionText}>{formatNextSession(member.nextSession)}</Text>
          </View>

          {lastActiveText && lastActiveText !== "Online now" ? (
            <Text style={styles.lastActiveText}>{lastActiveText}</Text>
          ) : null}

          {hasOutstanding ? (
            <View style={styles.outstandingBadge}>
              <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
              <Text style={styles.outstandingText}>
                {member.outstandingBalance.toFixed(2)} open
              </Text>
            </View>
          ) : null}

          <View style={styles.diveInButton}>
            <Text style={styles.diveInText}>Dive In</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.dark.primary} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ParentalControlsCard({ member, onToggle }: { member: FamilyMember; onToggle: (field: "chatEnabled" | "communityEnabled", value: boolean) => void }) {
  return (
    <View style={styles.controlCard}>
      <View style={styles.controlHeader}>
        {member.avatarUrl ? (
          <Image
            source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
            style={styles.controlAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.controlAvatar, styles.controlAvatarPlaceholder]}>
            <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
          </View>
        )}
        <Text style={styles.controlName}>{member.name}</Text>
      </View>
      <View style={styles.controlRow}>
        <View style={styles.controlLabelRow}>
          <Ionicons name="chatbubbles-outline" size={18} color="#00BCD4" />
          <Text style={styles.controlLabel}>Player-to-Player Chat</Text>
        </View>
        <Switch
          value={member.chatEnabled ?? false}
          onValueChange={(val) => onToggle("chatEnabled", val)}
          trackColor={{ false: Colors.dark.backgroundSecondary, true: "#00E676" + "60" }}
          thumbColor={member.chatEnabled ? "#00E676" : Colors.dark.textMuted}
          accessibilityRole="switch"
          accessibilityLabel={`Toggle player-to-player chat for ${member.name}`}
        />
      </View>
      <View style={styles.controlRow}>
        <View style={styles.controlLabelRow}>
          <Ionicons name="people-outline" size={18} color="#00BCD4" />
          <Text style={styles.controlLabel}>Community Posting</Text>
        </View>
        <Switch
          value={member.communityEnabled ?? false}
          onValueChange={(val) => onToggle("communityEnabled", val)}
          trackColor={{ false: Colors.dark.backgroundSecondary, true: "#00E676" + "60" }}
          thumbColor={member.communityEnabled ? "#00E676" : Colors.dark.textMuted}
          accessibilityRole="switch"
          accessibilityLabel={`Toggle community posting for ${member.name}`}
        />
      </View>
    </View>
  );
}

export default function FamilyLobbyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { familyData, setActivePlayer, isLoading, refreshFamily, isParent } = useFamily();
  const { user, loginWithToken } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [addChildTab, setAddChildTab] = useState<"email" | "code">("email");
  const [childEmail, setChildEmail] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const controlsMutation = useMutation({
    mutationFn: async ({ playerId, field, value }: { playerId: string; field: string; value: boolean }) => {
      return apiRequest("PUT", `/api/family/parental-controls/${playerId}`, { [field]: value });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshFamily();
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update setting.");
    },
  });

  const handleToggleControl = (playerId: string, field: "chatEnabled" | "communityEnabled", value: boolean) => {
    controlsMutation.mutate({ playerId, field, value });
  };

  const payAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/billing/pay-bulk", {
        playerIds: familyData?.members.map(m => m.id) || [],
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Payment Successful!", "All outstanding balances have been paid.");
      queryClient.invalidateQueries({ queryKey: ["/api/family/status"] });
    },
    onError: (error: any) => {
      Alert.alert("Payment Failed", error.message || "Could not process payment. Please try again.");
    },
  });

  const addChildMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/family/add-child", { email });
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setChildEmail("");
      setShowAddChild(false);
      refreshFamily();
    },
    onError: (error: any) => {
      const msg = parseApiError(error, "Please try again.");
      Alert.alert("Could not add member", msg);
    },
  });

  const inviteCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/family/invite-code");
      return res.json() as Promise<{ code: string; expiresAt: string }>;
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInviteCode(data.code);
      setInviteExpiry(data.expiresAt);
    },
    onError: (error: any) => {
      const msg = parseApiError(error, "Could not generate invite code.");
      Alert.alert("Error", msg);
    },
  });

  const handleOpenAddChildModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChildEmail("");
    setInviteCode(null);
    setInviteExpiry(null);
    setCodeCopied(false);
    setAddChildTab("email");
    setShowAddChild(true);
  };

  const handleTabChange = (tab: "email" | "code") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddChildTab(tab);
    if (tab === "code" && !inviteCode) {
      inviteCodeMutation.mutate();
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCodeCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleShareCode = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Join my family on the app! Use code: ${inviteCode} (valid for 48 hours)`,
      });
    } catch (_) {}
  };

  const handleSelectChild = async (member: FamilyMember) => {
    if (switching) return;
    setSwitching(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result: { token: string | null; playerName: string; hasOwnAccount: boolean } =
        await apiRequest("POST", `/api/family/switch/${member.id}`, undefined);

      if (result.hasOwnAccount && result.token) {
        const originalToken = getAuthToken();
        await secureSet(
          FAMILY_SWITCH_KEY,
          JSON.stringify({ originalToken, switchedPlayerName: member.name, hasOwnAccount: true })
        );
        const meResp = await fetch(new URL("/api/me", getApiUrl()).toString(), {
          headers: { Authorization: `Bearer ${result.token}` },
        });
        const meData = await meResp.json();
        await loginWithToken(result.token, meData.user);
      } else {
        await secureSet(
          FAMILY_SWITCH_KEY,
          JSON.stringify({ originalPlayerId: user?.playerId, switchedPlayerName: member.name, hasOwnAccount: false })
        );
        setActivePlayer(member.id);
      }

      navigation.reset({ index: 0, routes: [{ name: "PlayerTabs" as never }] });
      setTimeout(() => {
        Alert.alert(
          "Now viewing as " + member.name,
          "Account settings and deletion are disabled while viewing a family member's profile. Return to the Family Lobby to switch back."
        );
      }, 600);
    } catch (error: any) {
      Alert.alert("Switch Failed", parseApiError(error, "Could not switch to this account. Please try again."));
    } finally {
      setSwitching(false);
    }
  };

  const handlePayAll = () => {
    if (!familyData || familyData.outstandingTotal <= 0) return;

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        `Pay all outstanding balances totaling ${familyData.outstandingTotal.toFixed(2)}?`
      );
      if (confirmed) {
        payAllMutation.mutate();
      }
    } else {
      Alert.alert(
        "Pay All Balances",
        `Pay all outstanding balances totaling ${familyData.outstandingTotal.toFixed(2)}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pay Now",
            onPress: () => payAllMutation.mutate(),
          },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading family...</Text>
      </View>
    );
  }

  if (!familyData) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top }]}>
        <Ionicons name="people-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.loadingText}>No family account found</Text>
        <Pressable 
          style={{ marginTop: Spacing.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: Colors.dark.primary, borderRadius: BorderRadius.medium }}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={{ color: Colors.dark.textPrimary, fontSize: FontSizes.md, fontWeight: "600" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View entering={FadeInUp.duration(400)} style={styles.header}>
        <View style={styles.welcomeRow}>
          <Ionicons name="home" size={24} color={Colors.dark.primary} />
          <Text style={styles.welcomeText}>Family Lobby</Text>
        </View>
        <Text style={styles.subtitle}>Choose a profile to continue</Text>
        <View style={styles.roleBadgeRow}>
          <View style={[styles.roleBadge, isParent ? styles.roleBadgeParent : styles.roleBadgeChild]}>
            <Ionicons
              name={isParent ? "shield-checkmark" : "person"}
              size={13}
              color={isParent ? "#00BCD4" : Colors.dark.primary}
            />
            <Text style={[styles.roleBadgeText, isParent ? styles.roleBadgeTextParent : styles.roleBadgeTextChild]}>
              {isParent ? "Viewing as: Parent" : "Viewing as: Member"}
            </Text>
          </View>
          {familyData.parentEmail ? (
            <Text style={styles.parentEmailText} numberOfLines={1}>
              Family managed by: {familyData.parentEmail}
            </Text>
          ) : null}
        </View>
      </Animated.View>

      {familyData.outstandingTotal > 0 && (
        <Animated.View entering={ZoomIn.delay(200).duration(400)}>
          <Pressable
            style={styles.payAllCard}
            onPress={handlePayAll}
            disabled={payAllMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={`Pay all outstanding balances totaling ${familyData.outstandingTotal.toFixed(2)}`}
          >
            <LinearGradient
              colors={[Colors.dark.gold + "20", Colors.dark.gold + "10"]}
              style={styles.payAllGradient}
            >
              <View style={styles.payAllContent}>
                <View style={styles.payAllLeft}>
                  <Text style={styles.payAllLabel}>Total Outstanding</Text>
                  <Text style={styles.payAllAmount}>
                    {familyData.outstandingTotal.toFixed(2)}
                  </Text>
                  <Text style={styles.payAllBreakdown}>
                    {familyData.members.filter(m => m.outstandingBalance > 0).map(m => 
                      `${m.name}: ${m.outstandingBalance.toFixed(2)}`
                    ).join(" | ")}
                  </Text>
                </View>
                <View style={styles.payAllButton}>
                  {payAllMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.backgroundRoot} size="small" />
                  ) : (
                    <>
                      <Ionicons name="card" size={20} color={Colors.dark.backgroundRoot} />
                      <Text style={styles.payAllButtonText}>Pay All</Text>
                    </>
                  )}
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isParent ? (
          <Pressable
            style={styles.parentalControlsButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowControls(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open parental controls"
          >
            <Ionicons name="shield-checkmark" size={20} color="#00BCD4" />
            <Text style={styles.parentalControlsText}>Parental Controls</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.cardsGrid}>
          {familyData.members.map((member, index) => (
            <ChildCard
              key={member.id}
              member={member}
              onPress={() => handleSelectChild(member)}
              index={index}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.addChildStickyWrapper}>
          <Pressable
            style={[styles.addChildStickyButton, styles.createMemberButton]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCreateMember(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create a new player profile for a family member"
          >
            <Ionicons name="person-add" size={20} color={Colors.dark.backgroundRoot} />
            <Text style={styles.addChildStickyText}>Add New Player</Text>
          </Pressable>
        </Animated.View>
        <View style={styles.footerRow}>
          <Ionicons name="people" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.footerText}>
            {familyData.members.length} player{familyData.members.length !== 1 ? "s" : ""} linked to {familyData.parentEmail}
          </Text>
        </View>
      </View>

      <CreateFamilyMemberFlow
        visible={showCreateMember}
        onClose={() => setShowCreateMember(false)}
        onComplete={(_newPlayerId, newPlayerName) => {
          setShowCreateMember(false);
          refreshFamily();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Profile created!",
            `${newPlayerName} has been added to the Family Lobby.`,
            [{ text: "OK" }]
          );
        }}
      />

      <Modal visible={showControls} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="shield-checkmark" size={24} color="#00BCD4" />
                <Text style={styles.modalTitle}>Parental Controls</Text>
              </View>
              <Pressable onPress={() => setShowControls(false)} accessibilityRole="button" accessibilityLabel="Close parental controls">
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Manage what your family members can do in the app
            </Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {familyData.members.map((member) => (
                <ParentalControlsCard
                  key={member.id}
                  member={member}
                  onToggle={(field, value) => handleToggleControl(member.id, field, value)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => setShowAddChild(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="person-add" size={24} color={Colors.dark.primary} />
                <Text style={styles.modalTitle}>Add Member</Text>
              </View>
              <Pressable onPress={() => setShowAddChild(false)} accessibilityRole="button" accessibilityLabel="Close add member modal">
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, addChildTab === "email" ? styles.tabActive : null]}
                onPress={() => handleTabChange("email")}
                accessibilityRole="button"
              >
                <Ionicons name="mail-outline" size={16} color={addChildTab === "email" ? Colors.dark.primary : Colors.dark.textMuted} />
                <Text style={[styles.tabText, addChildTab === "email" ? styles.tabTextActive : null]}>By Email</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, addChildTab === "code" ? styles.tabActive : null]}
                onPress={() => handleTabChange("code")}
                accessibilityRole="button"
              >
                <Ionicons name="share-social-outline" size={16} color={addChildTab === "code" ? Colors.dark.primary : Colors.dark.textMuted} />
                <Text style={[styles.tabText, addChildTab === "code" ? styles.tabTextActive : null]}>By Invite Code</Text>
              </Pressable>
            </View>

            {addChildTab === "email" ? (
              <View style={styles.tabContent}>
                <Text style={styles.modalSubtitle}>
                  Enter the email address the player registered with
                </Text>
                <TextInput
                  style={styles.emailInput}
                  placeholder="member@example.com"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={childEmail}
                  onChangeText={setChildEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Member email address"
                />
                <Pressable
                  style={[styles.addButton, (!childEmail.trim() || addChildMutation.isPending) ? styles.addButtonDisabled : null]}
                  onPress={() => {
                    if (childEmail.trim()) {
                      addChildMutation.mutate(childEmail.trim());
                    }
                  }}
                  disabled={!childEmail.trim() || addChildMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Add member by email"
                >
                  {addChildMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.backgroundRoot} size="small" />
                  ) : (
                    <Text style={styles.addButtonText}>Add to Family</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.tabContent}>
                <Text style={styles.modalSubtitle}>
                  Share this code with the player. They can enter it in Settings to join your family.
                </Text>
                {inviteCodeMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.primary} size="large" style={{ marginVertical: Spacing.xl }} />
                ) : inviteCode ? (
                  <>
                    <View style={styles.codeBox}>
                      <Text style={styles.codeText}>{inviteCode}</Text>
                    </View>
                    {inviteExpiry ? (
                      <Text style={styles.codeExpiry}>
                        Expires {new Date(inviteExpiry).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    ) : null}
                    <View style={styles.codeActions}>
                      <Pressable style={styles.codeActionBtn} onPress={handleCopyCode} accessibilityRole="button" accessibilityLabel="Copy invite code">
                        <Ionicons name={codeCopied ? "checkmark-circle" : "copy-outline"} size={20} color={codeCopied ? "#00E676" : Colors.dark.primary} />
                        <Text style={[styles.codeActionText, codeCopied ? { color: "#00E676" } : null]}>{codeCopied ? "Copied!" : "Copy Code"}</Text>
                      </Pressable>
                      <Pressable style={styles.codeActionBtn} onPress={handleShareCode} accessibilityRole="button" accessibilityLabel="Share invite code">
                        <Ionicons name="share-outline" size={20} color={Colors.dark.primary} />
                        <Text style={styles.codeActionText}>Share</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={styles.refreshCodeBtn}
                      onPress={() => inviteCodeMutation.mutate()}
                      accessibilityRole="button"
                      accessibilityLabel="Generate new invite code"
                    >
                      <Ionicons name="refresh-outline" size={16} color={Colors.dark.textMuted} />
                      <Text style={styles.refreshCodeText}>Generate New Code</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            )}
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
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  welcomeText: {
    fontSize: FontSizes["3xl"],
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginLeft: 32,
  },
  payAllCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  payAllGradient: {
    padding: Spacing.md,
  },
  payAllContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  payAllLeft: {
    flex: 1,
    gap: 2,
  },
  payAllLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  payAllAmount: {
    fontSize: FontSizes["2xl"],
    fontWeight: "700",
    color: Colors.dark.text,
  },
  payAllBreakdown: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  payAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  payAllButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    justifyContent: "center",
  },
  childCard: {
    width: 160,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardGradient: {
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.dark.primary,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  ballBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  onlineIndicator: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  childName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  ballLevelTextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    alignSelf: "center",
    marginBottom: 2,
  },
  ballLevelTextLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  levelText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sessionText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  lastActiveText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  outstandingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  outstandingText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  diveInButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  diveInText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  roleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginLeft: 32,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  roleBadgeParent: {
    backgroundColor: "rgba(0,188,212,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,188,212,0.3)",
  },
  roleBadgeChild: {
    backgroundColor: Colors.dark.primary + "18",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "35",
  },
  roleBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  roleBadgeTextParent: {
    color: "#00BCD4",
  },
  roleBadgeTextChild: {
    color: Colors.dark.primary,
  },
  parentEmailText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    flexShrink: 1,
  },
  addChildStickyWrapper: {
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  addChildStickyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  createMemberButton: {
    backgroundColor: Colors.dark.xpCyan,
  },
  addMemberSecondaryButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  addChildStickyText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  addMemberSecondaryText: {
    color: Colors.dark.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  parentalControlsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(0,188,212,0.1)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0,188,212,0.2)",
  },
  parentalControlsText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#00BCD4",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  modalScroll: {
    maxHeight: 400,
  },
  controlCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  controlHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  controlAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  controlAvatarPlaceholder: {
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  controlName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  controlLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  tabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.medium,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.small,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundDefault,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  tabContent: {
    gap: Spacing.md,
  },
  emailInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  addButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  codeBox: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  codeText: {
    fontSize: FontSizes["3xl"],
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 6,
  },
  codeExpiry: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  codeActions: {
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "center",
  },
  codeActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  codeActionText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  refreshCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  refreshCodeText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
});
