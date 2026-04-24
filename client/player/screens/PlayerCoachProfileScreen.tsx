import React from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking, Platform, Image as RNImage, Alert } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { formatSessionTimeWithRelativeDay } from "@/lib/dateUtils";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface UpcomingSession {
  id: string;
  title?: string | null;
  startTime: string;
  endTime: string;
  ballLevel?: string | null;
  sessionType: string;
  maxPlayers: number;
  currentPlayers: number;
  spotsLeft: number;
  publicDropInPrice?: number | null;
}

interface RecentReview {
  id: string;
  overallScore?: number | null;
  comment?: string | null;
  playerFirstName: string;
  reviewerLevel?: string | null;
  createdAt?: string | null;
}

interface RecentReview {
  rating: number;
  comment: string | null;
  playerFirstName: string;
  createdAt: string | null;
}

interface CoachDetails {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  bio?: string;
  yearsExperience?: number;
  specializations?: string[];
  certifications?: string[];
  playersCount?: number;
  averageRating?: number | null;
  reviewsCount?: number;
  profilePhotoUrl?: string | null;
  academyId?: string | null;
  academyName?: string | null;
  academyLogoUrl?: string | null;
  academyCity?: string | null;
  upcomingPublicSessions?: UpcomingSession[];
  recentReviews?: RecentReview[];
  /** Drop-in lesson price (Task #1037). Free-form string from server. */
  dropInPrice?: string | null;
  languages?: string[] | null;
  publicProfileEnabled?: boolean;
  /** Total completed lessons taught by this coach (Task #1037). */
  totalLessonsTaught?: number;
  academyCountry?: string | null;
}

const NEON_GREEN = GlowColors.primary;

function StarRatingRow({ rating, count }: { rating: number; count: number }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={styles.ratingBarRow}>
      {stars.map((s) => (
        <Ionicons
          key={s}
          name={rating >= s ? "star" : rating >= s - 0.5 ? "star-half" : "star-outline"}
          size={18}
          color={NEON_GREEN}
        />
      ))}
      <ThemedText style={styles.ratingBarValue}>{rating.toFixed(1)}</ThemedText>
      <ThemedText style={styles.ratingBarCount}>({count} {count === 1 ? "rating" : "ratings"})</ThemedText>
    </View>
  );
}

export default function PlayerCoachProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { coachId, previewMode } = route.params || {};

  const { data: coach, isLoading } = useQuery<CoachDetails>({
    queryKey: ["/api/player/coach", coachId],
    enabled: !!coachId,
  });

  const handleBack = () => {
    navigation.goBack();
  };

  // Task #1110: When the coach is previewing their own public profile we
  // intercept all outbound actions (booking, contact, academy nav) so they
  // stay on the preview screen instead of trying to navigate into player-only
  // routes that don't exist in the coach stack.
  const showPreviewBlockedAlert = (action: string) => {
    Alert.alert("Preview", `Players will tap here to ${action}.`);
  };

  const handleContact = () => {
    if (previewMode) {
      showPreviewBlockedAlert("email you about lessons");
      return;
    }
    if (coach?.email) {
      Linking.openURL(`mailto:${coach.email}?subject=Private Lesson Request`);
    }
  };

  const handleCall = () => {
    if (previewMode) {
      showPreviewBlockedAlert("call you");
      return;
    }
    if (coach?.phone && Platform.OS !== "web") {
      Linking.openURL(`tel:${coach.phone}`);
    }
  };

  // Task #1037: Use the in-app drop-in lesson booking flow instead of mailto.
  // Passes the coachId so LessonBooking can pre-select this coach.
  const handlePrivateLesson = () => {
    if (!coach) return;
    if (previewMode) {
      showPreviewBlockedAlert("book a lesson with you");
      return;
    }
    navigation.navigate("LessonBooking", { coachId: coach.id, coachName: coach.name });
  };

  const handleBookSession = (sessionId: string) => {
    if (!coach) return;
    if (previewMode) {
      showPreviewBlockedAlert("book this group session");
      return;
    }
    navigation.navigate("LessonBooking", { coachId: coach.id, sessionId, coachName: coach.name });
  };

  const handleAcademyPress = () => {
    if (previewMode) {
      showPreviewBlockedAlert("open your academy page");
      return;
    }
    if (coach?.academyId) {
      navigation.navigate("AcademyProfile", { academyId: coach.academyId });
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Coach Profile</ThemedText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Loading coach profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!coach) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Coach Profile</ThemedText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Coach not found</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const firstName = coach.name?.split(" ")[0] || "Coach";
  const spotsLeftText = (spotsLeft: number) => spotsLeft === 0 ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {previewMode ? "Public Profile Preview" : "Coach Profile"}
        </ThemedText>
        <View style={styles.placeholder} />
      </View>

      {previewMode ? (
        <View style={styles.previewBanner}>
          <Ionicons name="eye-outline" size={16} color={Colors.dark.backgroundRoot} />
          <ThemedText style={styles.previewBannerText}>
            Preview · This is what players see in the public coach directory
          </ThemedText>
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Academy section — prominent at top */}
        {coach.academyName ? (
          <Pressable style={styles.academyBanner} onPress={handleAcademyPress}>
            {coach.academyLogoUrl ? (
              Platform.OS === "web" ? (
                <RNImage
                  source={{ uri: buildPhotoUrl(coach.academyLogoUrl)! }}
                  style={styles.academyLogo}
                  resizeMode="contain"
                />
              ) : (
                <Image
                  source={{ uri: buildPhotoUrl(coach.academyLogoUrl)! }}
                  style={styles.academyLogo}
                  contentFit="contain"
                />
              )
            ) : (
              <View style={styles.academyLogoPlaceholder}>
                <Ionicons name="business-outline" size={22} color={Colors.dark.textSecondary} />
              </View>
            )}
            <View style={styles.academyInfo}>
              <ThemedText style={styles.academyName}>{coach.academyName}</ThemedText>
              {coach.academyCity || coach.academyCountry ? (
                <ThemedText style={styles.academySubtext}>
                  {[coach.academyCity, coach.academyCountry].filter(Boolean).join(", ")}
                </ThemedText>
              ) : (
                <ThemedText style={styles.academySubtext}>View Academy</ThemedText>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.profileHeader}>
          {coach.profilePhotoUrl ? (
            Platform.OS === "web" ? (
              <RNImage
                source={{ uri: buildPhotoUrl(coach.profilePhotoUrl)! }}
                style={styles.avatarLargeImage}
                resizeMode="cover"
              />
            ) : (
              <Image
                source={{ uri: buildPhotoUrl(coach.profilePhotoUrl)! }}
                style={styles.avatarLargeImage}
                contentFit="cover"
              />
            )
          ) : (
            <View style={styles.avatarLarge}>
              <ThemedText style={styles.avatarText}>
                {coach.name?.charAt(0).toUpperCase() || "C"}
              </ThemedText>
            </View>
          )}
          <ThemedText style={styles.coachName}>{coach.name}</ThemedText>
          {coach.yearsExperience ? (
            <ThemedText style={styles.experience}>
              {coach.yearsExperience} years experience
            </ThemedText>
          ) : null}

          {/* Rating bar */}
          {coach.averageRating ? (
            <StarRatingRow rating={coach.averageRating} count={coach.reviewsCount || 0} />
          ) : (
            <ThemedText style={styles.noRatingsText}>No ratings yet</ThemedText>
          )}
        </View>

        {/* Task #1037: primary CTA — book a drop-in lesson with this coach */}
        <Pressable style={styles.primaryBookButton} onPress={handlePrivateLesson}>
          <Ionicons name="calendar" size={18} color={Colors.dark.buttonText} />
          <ThemedText style={styles.primaryBookButtonText}>
            Book a Lesson{coach.dropInPrice ? ` · AED ${coach.dropInPrice}` : ""}
          </ThemedText>
        </Pressable>

        <View style={styles.contactButtons}>
          {coach.email ? (
            <Pressable style={styles.contactButton} onPress={handleContact}>
              <Ionicons name="mail-outline" size={20} color={Colors.dark.primary} />
              <ThemedText style={styles.contactButtonText}>Email</ThemedText>
            </Pressable>
          ) : null}
          {coach.phone && Platform.OS !== "web" ? (
            <Pressable style={styles.contactButton} onPress={handleCall}>
              <Ionicons name="call-outline" size={20} color={Colors.dark.primary} />
              <ThemedText style={styles.contactButtonText}>Call</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {coach.bio ? (
          <Card style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About</ThemedText>
            <ThemedText style={styles.bio}>{coach.bio}</ThemedText>
          </Card>
        ) : null}

        {/* Upcoming public lessons */}
        {coach.upcomingPublicSessions && coach.upcomingPublicSessions.length > 0 ? (
          <Card style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Join a group with {firstName}</ThemedText>
            {coach.upcomingPublicSessions.slice(0, 3).map((s) => (
              <View key={s.id} style={styles.upcomingSessionCard}>
                <View style={styles.upcomingSessionRow}>
                  <View style={styles.upcomingSessionInfo}>
                    <ThemedText style={styles.upcomingSessionTime}>
                      {formatSessionTimeWithRelativeDay(s.startTime, "Asia/Dubai")}
                    </ThemedText>
                    <View style={styles.upcomingSessionMeta}>
                      {s.ballLevel ? (
                        <ThemedText style={styles.upcomingSessionLevel}>{s.ballLevel.toUpperCase()}</ThemedText>
                      ) : null}
                      <ThemedText style={styles.upcomingSessionPriceSpots}>
                        {s.publicDropInPrice != null && s.publicDropInPrice > 0
                          ? `AED ${s.publicDropInPrice.toFixed(0)}`
                          : "Free"}{" "}
                        · {spotsLeftText(s.spotsLeft)}
                      </ThemedText>
                    </View>
                  </View>
                  {s.spotsLeft > 0 ? (
                    <Pressable
                      style={styles.bookNowButton}
                      onPress={() => handleBookSession(s.id)}
                    >
                      <ThemedText style={styles.bookNowButtonText}>Book Now</ThemedText>
                    </Pressable>
                  ) : (
                    <View style={styles.fullBadge}>
                      <ThemedText style={styles.fullBadgeText}>Full</ThemedText>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {coach.specializations && coach.specializations.length > 0 ? (
          <Card style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Specializations</ThemedText>
            <View style={styles.tagsContainer}>
              {coach.specializations.map((spec, index) => (
                <View key={index} style={styles.tag}>
                  <ThemedText style={styles.tagText}>{spec}</ThemedText>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {coach.languages && coach.languages.length > 0 ? (
          <Card style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Languages</ThemedText>
            <View style={styles.specsContainer}>
              {coach.languages.map((lang, index) => (
                <View key={index} style={styles.specChip}>
                  <Ionicons name="globe-outline" size={14} color={Colors.dark.primary} />
                  <ThemedText style={styles.specChipText}>{lang}</ThemedText>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {coach.certifications && coach.certifications.length > 0 ? (
          <Card style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Certifications</ThemedText>
            {coach.certifications.map((cert, index) => (
              <View key={index} style={styles.certRow}>
                <Ionicons name="ribbon-outline" size={18} color={Colors.dark.primary} />
                <ThemedText style={styles.certText}>{cert}</ThemedText>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Stats</ThemedText>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{coach.totalLessonsTaught || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Lessons</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{coach.playersCount || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Players</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{coach.yearsExperience || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Years</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{coach.reviewsCount || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Reviews</ThemedText>
            </View>
          </View>
        </Card>

        {/* Recent reviews */}
        {coach.recentReviews && coach.recentReviews.length > 0 ? (
          <Card style={styles.section}>
            <ThemedText style={styles.sectionTitle}>What players say</ThemedText>
            {coach.recentReviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewStarsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={review.overallScore && review.overallScore >= s ? "star" : "star-outline"}
                        size={12}
                        color={NEON_GREEN}
                      />
                    ))}
                  </View>
                  <ThemedText style={styles.reviewPlayer}>{review.playerFirstName}</ThemedText>
                </View>
                {review.comment ? (
                  <ThemedText style={styles.reviewComment}>{review.comment}</ThemedText>
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}

        {/* Request private lesson CTA */}
        {coach.email ? (
          <Pressable style={styles.privateLessonButton} onPress={handlePrivateLesson}>
            <Ionicons name="person-outline" size={20} color={Colors.dark.backgroundRoot} />
            <ThemedText style={styles.privateLessonButtonText}>Request Private Lesson</ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: Colors.dark.textSecondary,
  },
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: NEON_GREEN,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  previewBannerText: {
    color: Colors.dark.backgroundRoot,
    fontSize: 12,
    fontWeight: "600",
  },
  academyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.md,
  },
  academyLogo: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  academyLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  academyInfo: {
    flex: 1,
  },
  academyName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  academySubtext: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatarLargeImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: Spacing.md,
    borderWidth: 3,
    borderColor: Colors.dark.primary,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "bold",
    color: Colors.dark.buttonText,
  },
  coachName: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  experience: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  ratingBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  ratingBarValue: {
    fontSize: 16,
    fontWeight: "700",
    color: NEON_GREEN,
    marginLeft: 4,
  },
  ratingBarCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  noRatingsText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  primaryBookButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  primaryBookButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: 15,
  },
  contactButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  contactButtonText: {
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  section: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  bio: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  tag: {
    backgroundColor: Colors.dark.primary + "20",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tagText: {
    fontSize: 12,
    color: Colors.dark.primary,
  },
  certRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  certText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.dark.primary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  upcomingSessionCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  upcomingSessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  upcomingSessionInfo: {
    flex: 1,
  },
  upcomingSessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexWrap: "wrap",
    marginTop: 2,
  },
  upcomingSessionTime: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  upcomingSessionLevel: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  upcomingSessionPriceSpots: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  bookNowButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    minWidth: 72,
    alignItems: "center",
  },
  bookNowButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  fullBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.textMuted + "20",
    minWidth: 72,
    alignItems: "center",
  },
  fullBadgeText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  reviewCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  reviewStarsRow: {
    flexDirection: "row",
    gap: 2,
  },
  reviewPlayer: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  reviewComment: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  privateLessonButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  privateLessonButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  academyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  academyCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  academyCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
}));
