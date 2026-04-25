import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { useTranslation } from "react-i18next";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest, apiFetch } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface AcademyProfile {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  facilities: string[] | null;
  courtCount: number | null;
  ageGroups: string[] | null;
  programs: string[] | null;
  priceRange: string | null;
  coachCount: number;
  playerCount: number;
  coaches: CoachInfo[];
  openJoin?: boolean;
}

interface CoachInfo {
  id: string;
  name: string;
  specialty: string | null;
  photoUrl: string | null;
  publicQuote: string | null;
  yearsExperience: string | null;
  specializations: string[] | null;
  level: number | null;
}

const FACILITY_LABELS: Record<string, string> = {
  indoor_courts: "Indoor Courts",
  outdoor_courts: "Outdoor Courts",
  gym: "Fitness Center",
  shop: "Pro Shop",
  cafe: "Cafe",
  parking: "Parking",
  locker_rooms: "Locker Rooms",
  lighting: "Court Lighting",
};

const PROGRAM_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  competitive: "Competitive",
  private: "Private Lessons",
};

const AGE_LABELS: Record<string, string> = {
  kids: "Kids (4-8)",
  juniors: "Juniors (9-12)",
  teens: "Teens (13-17)",
  adults: "Adults (18+)",
  seniors: "Seniors (50+)",
};

function CoachCard({ coach }: { coach: CoachInfo }) {
  return (
    <View style={styles.coachCard}>
      <View style={styles.coachAvatar}>
        <Text style={styles.coachInitial}>{coach.name.charAt(0)}</Text>
      </View>
      <View style={styles.coachInfo}>
        <Text style={styles.coachName}>{coach.name}</Text>
        {coach.specialty ? (
          <Text style={styles.coachSpecialty}>{coach.specialty}</Text>
        ) : null}
        {coach.publicQuote ? (
          <Text style={styles.coachQuote}>&quot;{coach.publicQuote}&quot;</Text>
        ) : null}
      </View>
      {coach.level ? (
        <View style={styles.coachLevel}>
          <Text style={styles.coachLevelText}>Lvl {coach.level}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function AcademyProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { user, refreshAuth } = useAuth();
  const { t } = useTranslation();

  const academyId = route.params?.academyId;

  const { data: profileData, isLoading } = useQuery<{ profile: AcademyProfile }>({
    queryKey: ["/api/academies", academyId, "profile"],
    queryFn: async () => {
      const response = await apiFetch(`/api/academies/${academyId}/profile`);
      if (!response.ok) throw new Error("Failed to load academy profile");
      return response.json();
    },
    enabled: !!academyId,
  });

  const { data: requestsData } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/join-requests/my"],
    enabled: !!user,
  });

  const joinMutation = useMutation({
    mutationFn: async (isOpen: boolean) => {
      const response = await apiRequest("POST", "/api/join-requests", {
        academyId,
        // Open-join academies don't show a message field; approval-required
        // ones get the legacy default message.
        message: isOpen ? "" : "I would like to join your academy",
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/join-requests/my"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Task #1131: For instant joins, refresh auth state so the new academy
      // appears in the player's app immediately.
      if (data?.joined) {
        try {
          await refreshAuth();
        } catch {
          // Non-blocking.
        }
        queryClient.invalidateQueries({ queryKey: ["/api/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
        const academyName = data?.academy?.name ?? profile?.name ?? "";
        Alert.alert(
          t("academy.joinFlow.welcomeTitle"),
          t("academy.joinFlow.welcomeMessage", { name: academyName }),
        );
      } else {
        const academyName = data?.academy?.name ?? profile?.name ?? "";
        Alert.alert(
          t("academy.joinFlow.requestSentTitle"),
          t("academy.joinFlow.requestSentMessage", { name: academyName }),
        );
      }
    },
    onError: (error: any) => {
      Alert.alert(
        t("common.error"),
        error?.message || t("academy.joinFlow.joinFailed"),
      );
    },
  });

  const profile = profileData?.profile;
  const myRequests = requestsData?.requests || [];
  const pendingRequest = myRequests.find(r => r.academyId === academyId);
  const isOpenJoin = profile?.openJoin !== false;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading academy profile...</Text>
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <Text style={styles.errorText}>Academy not found</Text>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.academyIcon}>
            <Text style={styles.academyInitial}>{profile.name.charAt(0)}</Text>
          </View>
          <Text style={styles.academyName}>{profile.name}</Text>
          {profile.city || profile.country ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.locationText}>
                {[profile.city, profile.country].filter(Boolean).join(", ")}
              </Text>
            </View>
          ) : null}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profile.coachCount}</Text>
              <Text style={styles.statLabel}>Coaches</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profile.playerCount}</Text>
              <Text style={styles.statLabel}>Players</Text>
            </View>
            {profile.courtCount ? (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{profile.courtCount}</Text>
                  <Text style={styles.statLabel}>Courts</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {profile.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{profile.description}</Text>
          </View>
        ) : null}

        {profile.programs && profile.programs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Programs Offered</Text>
            <View style={styles.tagContainer}>
              {profile.programs.map((program) => (
                <View key={program} style={styles.tag}>
                  <Text style={styles.tagText}>{PROGRAM_LABELS[program] || program}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {profile.ageGroups && profile.ageGroups.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Age Groups</Text>
            <View style={styles.tagContainer}>
              {profile.ageGroups.map((age) => (
                <View key={age} style={styles.tag}>
                  <Text style={styles.tagText}>{AGE_LABELS[age] || age}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {profile.facilities && profile.facilities.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Facilities</Text>
            <View style={styles.facilityGrid}>
              {profile.facilities.map((facility) => (
                <View key={facility} style={styles.facilityItem}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
                  <Text style={styles.facilityText}>{FACILITY_LABELS[facility] || facility}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {profile.coaches.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Our Coaches</Text>
            {profile.coaches.map((coach) => (
              <CoachCard key={coach.id} coach={coach} />
            ))}
          </View>
        ) : null}

        {(profile.website || profile.phone || profile.email) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact</Text>
            {profile.website ? (
              <Pressable 
                style={styles.contactRow}
                onPress={() => Linking.openURL(profile.website!)}
              >
                <Ionicons name="globe-outline" size={20} color={Colors.dark.primary} />
                <Text style={styles.contactLink}>{profile.website}</Text>
              </Pressable>
            ) : null}
            {profile.phone ? (
              <Pressable 
                style={styles.contactRow}
                onPress={() => Linking.openURL(`tel:${profile.phone}`)}
              >
                <Ionicons name="call-outline" size={20} color={Colors.dark.primary} />
                <Text style={styles.contactLink}>{profile.phone}</Text>
              </Pressable>
            ) : null}
            {profile.email ? (
              <Pressable 
                style={styles.contactRow}
                onPress={() => Linking.openURL(`mailto:${profile.email}`)}
              >
                <Ionicons name="mail-outline" size={20} color={Colors.dark.primary} />
                <Text style={styles.contactLink}>{profile.email}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {pendingRequest ? (
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={20} color={Colors.dark.orange} />
            <Text style={styles.pendingText}>
              {pendingRequest.status === "pending" ? "Request Pending" : 
               pendingRequest.status === "approved" ? "Request Approved" : "Request Declined"}
            </Text>
          </View>
        ) : (
          <Pressable
            style={[styles.joinButton, joinMutation.isPending && styles.buttonDisabled]}
            onPress={() => joinMutation.mutate(isOpenJoin)}
            disabled={joinMutation.isPending}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.joinButtonText}>
                  {isOpenJoin
                    ? t("academy.joinFlow.join")
                    : t("academy.joinFlow.requestToJoin")}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  backButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  academyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 200, 200, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  academyInitial: {
    ...Typography.h1,
    color: Colors.dark.primary,
  },
  academyName: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  locationText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.primary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  descriptionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  tag: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  tagText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  facilityGrid: {
    gap: Spacing.sm,
  },
  facilityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  facilityText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  coachCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  coachInitial: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachSpecialty: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachQuote: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  coachLevel: {
    backgroundColor: "rgba(0, 200, 200, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  coachLevelText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  contactLink: {
    ...Typography.body,
    color: Colors.dark.primary,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  joinButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 165, 0, 0.12)",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.orange,
  },
  pendingText: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
}));
