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
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Academy {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  country?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  coachCount?: number;
  playerCount?: number;
}

interface JoinRequest {
  id: string;
  academyId: string;
  status: string;
  createdAt: string;
}

interface AcademyCardProps {
  academy: Academy;
  pendingRequest: JoinRequest | null;
  onJoin: (academyId: string, message: string) => void;
  onViewProfile: (academyId: string) => void;
  isSubmitting: boolean;
}

function AcademyCard({ academy, pendingRequest, onJoin, onViewProfile, isSubmitting }: AcademyCardProps) {
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [message, setMessage] = useState("");

  const handleJoinPress = () => {
    if (pendingRequest) {
      return;
    }
    
    if (showMessageInput) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onJoin(academy.id, message);
      setShowMessageInput(false);
      setMessage("");
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowMessageInput(true);
    }
  };

  const getStatusBadge = () => {
    if (!pendingRequest) return null;
    
    const statusColors: Record<string, string> = {
      pending: Colors.dark.orange,
      approved: Colors.dark.primary,
      rejected: Colors.dark.error,
    };

    return (
      <View style={[styles.statusBadge, { backgroundColor: `${statusColors[pendingRequest.status]}20` }]}>
        <Text style={[styles.statusText, { color: statusColors[pendingRequest.status] }]}>
          {pendingRequest.status === "pending" ? "Request Pending" : 
           pendingRequest.status === "approved" ? "Approved" : "Rejected"}
        </Text>
      </View>
    );
  };

  const locationText = [academy.city, academy.country].filter(Boolean).join(", ");

  return (
    <Pressable 
      style={[styles.academyCard, CardStyles.elevated]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onViewProfile(academy.id);
      }}
    >
      <View style={styles.academyHeader}>
        {academy.logoUrl ? (
          <Image
            source={{ uri: academy.logoUrl }}
            style={styles.academyLogo}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.academyIcon, { backgroundColor: `${Colors.dark.primary}20` }]}>
            <Text style={styles.academyInitial}>{academy.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.academyInfo}>
          <Text style={styles.academyName}>{academy.name}</Text>
          {locationText ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color={Colors.dark.textMuted} />
              <Text style={styles.locationText}>{locationText}</Text>
            </View>
          ) : (
            <Text style={styles.academySlug}>@{academy.slug}</Text>
          )}
        </View>
        {getStatusBadge()}
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
      </View>

      {academy.coachCount !== undefined || academy.playerCount !== undefined ? (
        <View style={styles.statsRow}>
          {academy.coachCount !== undefined ? (
            <View style={styles.stat}>
              <Ionicons name="tennisball-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.statText}>{academy.coachCount} coach{academy.coachCount !== 1 ? "es" : ""}</Text>
            </View>
          ) : null}
          {academy.playerCount !== undefined ? (
            <View style={styles.stat}>
              <Ionicons name="people-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.statText}>{academy.playerCount} player{academy.playerCount !== 1 ? "s" : ""}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {academy.description ? (
        <Text style={styles.descriptionExcerpt} numberOfLines={2}>{academy.description}</Text>
      ) : null}

      {showMessageInput ? (
        <View style={styles.messageInputContainer}>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Add a message (optional)"
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={2}
          />
        </View>
      ) : null}

      {!pendingRequest ? (
        <View style={styles.actionRow}>
          {showMessageInput ? (
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                setShowMessageInput(false);
                setMessage("");
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.joinButton, isSubmitting && styles.buttonDisabled]}
            onPress={(e) => {
              e.stopPropagation();
              handleJoinPress();
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons 
                  name={showMessageInput ? "send" : "add-circle"} 
                  size={16} 
                  color={Colors.dark.buttonText} 
                />
                <Text style={styles.joinButtonText}>
                  {showMessageInput ? "Send Request" : "Request to Join"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function AcademyBrowserScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: academiesData, isLoading: academiesLoading } = useQuery<{ academies: Academy[] }>({
    queryKey: ["/api/academies/browse"],
  });

  const { data: requestsData } = useQuery<{ requests: JoinRequest[] }>({
    queryKey: ["/api/join-requests/my"],
    enabled: !!user,
  });

  const joinMutation = useMutation({
    mutationFn: async (data: { academyId: string; message: string }) => {
      const response = await apiRequest("POST", "/api/join-requests", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/join-requests/my"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Request Sent", "Your request to join this academy has been submitted. You'll be notified when it's reviewed.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to submit join request");
    },
  });

  const academies = academiesData?.academies || [];
  const myRequests = requestsData?.requests || [];

  const filteredAcademies = searchQuery.trim()
    ? academies.filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.slug.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : academies;

  const getPendingRequest = (academyId: string) => {
    return myRequests.find((r) => r.academyId === academyId) || null;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.backRow}>
        <Pressable 
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Find an Academy</Text>
        <Text style={styles.subtitle}>Browse and request to join tennis academies</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search academies..."
            placeholderTextColor={Colors.dark.textMuted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {academiesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : filteredAcademies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={48} color={Colors.dark.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? "No Academies Found" : "No Academies Available"}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "Try a different search term"
                : "Check back later for new academies to join"}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.resultCount}>
              {filteredAcademies.length} academ{filteredAcademies.length !== 1 ? "ies" : "y"} available
            </Text>
            {filteredAcademies.map((academy) => (
              <AcademyCard
                key={academy.id}
                academy={academy}
                pendingRequest={getPendingRequest(academy.id)}
                onJoin={(academyId, message) =>
                  joinMutation.mutate({ academyId, message })
                }
                onViewProfile={(academyId) => 
                  navigation.navigate("AcademyPublicProfile", { academyId })
                }
                isSubmitting={joinMutation.isPending}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  backRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
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
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
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
  resultCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  academyCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  academyLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  academyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  academyInitial: {
    ...Typography.h4,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  academyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academySlug: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  locationText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  descriptionExcerpt: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
    paddingLeft: 60,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: Spacing.md,
    paddingLeft: 60,
    gap: Spacing.lg,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  messageInputContainer: {
    marginTop: Spacing.md,
  },
  messageInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    minHeight: 60,
    textAlignVertical: "top",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  cancelButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  joinButton: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
    gap: Spacing.sm,
  },
  joinButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
}));
