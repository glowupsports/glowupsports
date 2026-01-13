import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp, FadeInRight, ZoomIn } from "react-native-reanimated";
import { Colors, Spacing, FontSizes, BorderRadius, Typography } from "@/constants/theme";
import { useFamily, FamilyMember } from "@/player/context/FamilyContext";
import { apiRequest, getApiUrl, getStaticAssetsUrl } from "@/lib/query-client";

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
            {lastActiveText === "Online now" && (
              <View style={styles.onlineIndicator} />
            )}
          </View>

          <Text style={styles.childName} numberOfLines={1}>{member.name}</Text>

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

          {lastActiveText && lastActiveText !== "Online now" && (
            <Text style={styles.lastActiveText}>{lastActiveText}</Text>
          )}

          {hasOutstanding && (
            <View style={styles.outstandingBadge}>
              <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
              <Text style={styles.outstandingText}>
                {member.outstandingBalance.toFixed(2)} open
              </Text>
            </View>
          )}

          <View style={styles.diveInButton}>
            <Text style={styles.diveInText}>Dive In</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.dark.primary} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function FamilyLobbyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { familyData, setActivePlayer } = useFamily();

  const payAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`${getApiUrl()}/api/billing/pay-bulk`, {
        method: "POST",
        body: JSON.stringify({
          playerIds: familyData?.members.map(m => m.id) || [],
        }),
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

  const handleSelectChild = (member: FamilyMember) => {
    setActivePlayer(member.id);
    navigation.reset({
      index: 0,
      routes: [{ name: "PlayerTabs" as never }],
    });
  };

  const handlePayAll = () => {
    if (!familyData || familyData.outstandingTotal <= 0) return;
    
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
  };

  if (!familyData) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading family...</Text>
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
      </Animated.View>

      {familyData.outstandingTotal > 0 && (
        <Animated.View entering={ZoomIn.delay(200).duration(400)}>
          <Pressable
            style={styles.payAllCard}
            onPress={handlePayAll}
            disabled={payAllMutation.isPending}
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
        <View style={styles.footerRow}>
          <Ionicons name="people" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.footerText}>
            {familyData.members.length} player{familyData.members.length !== 1 ? "s" : ""} linked to {familyData.parentEmail}
          </Text>
        </View>
      </View>
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
});
