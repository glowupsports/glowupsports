import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { RouteProp } from "@react-navigation/native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch, buildPhotoUrl } from "@/lib/query-client";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type NavProp = NativeStackNavigationProp<PlayerStackParamList>;
type RouteProps = RouteProp<PlayerStackParamList, "AcademyPublicProfile">;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SPORT_LABELS: Record<string, string> = {
  tennis: "Tennis",
  padel: "Padel",
  pickleball: "Pickleball",
  squash: "Squash",
  badminton: "Badminton",
};

const BALL_LEVEL_COLORS: Record<string, string> = {
  red: "#F44336",
  orange: "#FF9800",
  green: "#4CAF50",
  yellow: "#FFEB3B",
  blue: "#2196F3",
  purple: "#9C27B0",
};

interface CoachInfo {
  id: string;
  name: string;
  specialty: string | null;
  photoUrl: string | null;
  publicQuote: string | null;
  yearsExperience: string | null;
  specializations: string[] | null;
  level: number | null;
  averageRating: string | null;
  totalRatings: number;
}

interface PublicGroup {
  id: string;
  title: string;
  sport: string | null;
  ballLevel: string | null;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  price: string | null;
  maxPlayers: number | null;
  spotsLeft: number | null;
  enrolledCount: number;
}

interface UpcomingTournament {
  id: string;
  name: string;
  sport: string;
  startDate: string;
  endDate: string;
  entryFee: string | null;
  status: string;
  spotsTotal: number;
  location: string;
}

interface AcademyPublicProfile {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  facilities: string[] | null;
  courtCount: number | null;
  sports: string[] | null;
  joinCode: string | null;
  coachCount: number;
  playerCount: number;
  coaches: CoachInfo[];
  publicGroups: PublicGroup[];
  upcomingTournaments: UpcomingTournament[];
  trustSignals?: {
    totalSessions?: number;
    activePlayers?: number;
  } | null;
}

function formatSchedule(dayOfWeek: number, startTime: string, duration: number): string {
  const day = DAY_NAMES[dayOfWeek] ?? "?";
  const parts = startTime.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const ampm = h < 12 ? "AM" : "PM";
  const hour = h % 12 || 12;
  const timeStr = `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  const durationStr = duration >= 60 ? `${duration / 60}h` : `${duration}m`;
  return `${day} · ${timeStr} · ${durationStr}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function CoachMiniCard({ coach, onPress }: { coach: CoachInfo; onPress: () => void }) {
  const photoUri = buildPhotoUrl(coach.photoUrl);
  const rating = coach.averageRating ? parseFloat(coach.averageRating) : null;
  return (
    <Pressable style={styles.coachCard} onPress={onPress}>
      <View style={styles.coachAvatarWrap}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.coachAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.coachAvatar, styles.coachAvatarPlaceholder]}>
            <Text style={styles.coachInitial}>{coach.name.charAt(0)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.coachName} numberOfLines={1}>{coach.name}</Text>
      {rating != null && coach.totalRatings > 0 ? (
        <View style={styles.coachRatingRow}>
          <Ionicons name="star" size={11} color="#FFEB3B" />
          <Text style={styles.coachRatingText}>
            {rating.toFixed(1)} · {coach.totalRatings}
          </Text>
        </View>
      ) : null}
      <Text style={styles.coachSpecialty} numberOfLines={1}>{coach.specialty ?? "Coach"}</Text>
    </Pressable>
  );
}

function GroupCard({
  group,
  onViewSessions,
}: {
  group: PublicGroup;
  onViewSessions: () => void;
}) {
  const ballColor = group.ballLevel
    ? (BALL_LEVEL_COLORS[group.ballLevel.toLowerCase()] ?? Colors.dark.textMuted)
    : Colors.dark.textMuted;
  const priceText = group.price ? `AED ${group.price} / session` : "Contact academy";
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupCardHeader}>
        <Text style={styles.groupTitle} numberOfLines={1}>{group.title}</Text>
        {group.ballLevel ? (
          <View style={[styles.ballBadge, { backgroundColor: ballColor + "33", borderColor: ballColor }]}>
            <Text style={[styles.ballBadgeText, { color: ballColor }]}>{group.ballLevel}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.groupSchedule}>{formatSchedule(group.dayOfWeek, group.startTime, group.duration)}</Text>
      <View style={styles.groupFooterRow}>
        <View>
          <Text style={styles.groupPrice}>{priceText}</Text>
          {group.spotsLeft != null ? (
            <Text style={[styles.spotsText, group.spotsLeft === 0 && styles.spotsTextFull]}>
              {group.spotsLeft === 0 ? "Full" : `${group.spotsLeft} spot${group.spotsLeft !== 1 ? "s" : ""} left`}
            </Text>
          ) : null}
        </View>
        <Pressable style={styles.smallBtn} onPress={onViewSessions}>
          <Text style={styles.smallBtnText}>View Sessions</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TournamentCard({
  tournament,
  onViewRegister,
}: {
  tournament: UpcomingTournament;
  onViewRegister: () => void;
}) {
  const feeText = tournament.entryFee ? `AED ${tournament.entryFee}` : "Free entry";
  return (
    <View style={styles.tournamentCard}>
      <View style={styles.tournamentCardHeader}>
        <Text style={styles.tournamentName} numberOfLines={1}>{tournament.name}</Text>
        <View style={styles.sportTag}>
          <Text style={styles.sportTagText}>{SPORT_LABELS[tournament.sport] ?? tournament.sport}</Text>
        </View>
      </View>
      <View style={styles.tournamentMeta}>
        <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
        <Text style={styles.tournamentDate}>{formatDate(tournament.startDate)}</Text>
        <Text style={styles.tournamentFee}>{feeText}</Text>
      </View>
      <Pressable style={[styles.smallBtn, { marginTop: Spacing.sm }]} onPress={onViewRegister}>
        <Text style={styles.smallBtnText}>View & Register</Text>
      </Pressable>
    </View>
  );
}

export default function PlayerAcademyProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { academyId } = route.params;

  const { data: profileData, isLoading } = useQuery<{ profile: AcademyPublicProfile }>({
    queryKey: ["/api/academies", academyId, "profile"],
    queryFn: async () => {
      const response = await apiFetch(`/api/academies/${academyId}/profile`);
      if (!response.ok) throw new Error("Failed to load academy profile");
      return response.json();
    },
    enabled: !!academyId,
  });

  const profile = profileData?.profile;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
          <Text style={styles.loadingText}>Loading academy...</Text>
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <Text style={styles.errorText}>Academy not found</Text>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const logoUri = buildPhotoUrl(profile.logoUrl);
  const trustSignals = {
    activePlayers: profile.trustSignals?.activePlayers ?? 0,
    totalSessions: profile.trustSignals?.totalSessions ?? 0,
  };
  const sports = profile.sports ?? [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing["4xl"] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logo} contentFit="cover" />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Text style={styles.logoInitial}>{(profile.name ?? "?").charAt(0)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.academyName}>{profile.name}</Text>
          {(profile.city != null || profile.country != null) ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={15} color={Colors.dark.textMuted} />
              <Text style={styles.locationText}>
                {[profile.city, profile.country].filter(Boolean).join(", ")}
              </Text>
            </View>
          ) : null}

          {/* Trust chips */}
          <View style={styles.chipRow}>
            {trustSignals.activePlayers > 0 ? (
              <View style={styles.chip}>
                <Ionicons name="people-outline" size={13} color={Colors.dark.xpCyan} />
                <Text style={styles.chipText}>{trustSignals.activePlayers} players</Text>
              </View>
            ) : null}
            {profile.coachCount > 0 ? (
              <View style={styles.chip}>
                <Ionicons name="ribbon-outline" size={13} color={Colors.dark.xpCyan} />
                <Text style={styles.chipText}>{profile.coachCount} coaches</Text>
              </View>
            ) : null}
            {trustSignals.totalSessions > 0 ? (
              <View style={styles.chip}>
                <Ionicons name="checkmark-circle-outline" size={13} color={Colors.dark.xpCyan} />
                <Text style={styles.chipText}>{trustSignals.totalSessions} sessions</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* About */}
        {profile.description != null ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bodyText}>{profile.description}</Text>
          </View>
        ) : null}

        {/* Sports tags */}
        {sports.length > 0 ? (
          <View style={styles.tagRow}>
            {sports.map(sport => (
              <View key={sport} style={styles.sportTagPill}>
                <Text style={styles.sportTagPillText}>{SPORT_LABELS[sport] ?? sport}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Facilities */}
        {profile.facilities != null && profile.facilities.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Facilities</Text>
            <View style={styles.facilityGrid}>
              {profile.facilities.map(f => (
                <View key={f} style={styles.facilityChip}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.dark.primary} />
                  <Text style={styles.facilityText}>{f.replace(/_/g, " ")}</Text>
                </View>
              ))}
              {profile.courtCount != null ? (
                <View style={styles.facilityChip}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.dark.primary} />
                  <Text style={styles.facilityText}>{profile.courtCount} Courts</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Contact */}
        {(profile.website != null || profile.phone != null || profile.email != null) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact</Text>
            {profile.website != null ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(profile.website!)}>
                <Ionicons name="globe-outline" size={18} color={Colors.dark.xpCyan} />
                <Text style={styles.contactLink}>{profile.website}</Text>
              </Pressable>
            ) : null}
            {profile.phone != null ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`tel:${profile.phone}`)}>
                <Ionicons name="call-outline" size={18} color={Colors.dark.xpCyan} />
                <Text style={styles.contactLink}>{profile.phone}</Text>
              </Pressable>
            ) : null}
            {profile.email != null ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${profile.email}`)}>
                <Ionicons name="mail-outline" size={18} color={Colors.dark.xpCyan} />
                <Text style={styles.contactLink}>{profile.email}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Coaches */}
        {profile.coaches.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meet the coaches</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachScroll}>
              {profile.coaches.map(coach => (
                <CoachMiniCard
                  key={coach.id}
                  coach={coach}
                  onPress={() => navigation.navigate("CoachProfile", { coachId: coach.id })}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Public groups */}
        {profile.publicGroups.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Join a group</Text>
            {profile.publicGroups.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                onViewSessions={() => navigation.navigate("BrowseGroupLessons")}
              />
            ))}
          </View>
        ) : null}

        {/* Upcoming tournaments */}
        {profile.upcomingTournaments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming tournaments</Text>
            {profile.upcomingTournaments.map(t => (
              <TournamentCard
                key={t.id}
                tournament={t}
                onViewRegister={() => navigation.navigate("TournamentDetail", { tournamentId: t.id })}
              />
            ))}
          </View>
        ) : null}

        {/* Join CTA */}
        <View style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>Want to be part of {profile.name}?</Text>
          <Text style={styles.ctaSubtitle}>Joining gives you:</Text>
          <View style={styles.ctaBenefits}>
            <Text style={styles.ctaBenefit}>Full session credit access</Text>
            <Text style={styles.ctaBenefit}>Group membership at member rates</Text>
            <Text style={styles.ctaBenefit}>Priority booking</Text>
          </View>
          <View style={styles.ctaButtons}>
            <Pressable
              style={styles.ctaPrimaryBtn}
              onPress={() => navigation.navigate("AcademyBrowser")}
            >
              <Ionicons name="key-outline" size={18} color="#000" />
              <Text style={styles.ctaPrimaryBtnText}>Enter Invite Code</Text>
            </Pressable>
            {(profile.email != null || profile.phone != null) ? (
              <Pressable
                style={styles.ctaSecondaryBtn}
                onPress={() => {
                  if (profile.email != null) {
                    Linking.openURL(`mailto:${profile.email}`);
                  } else if (profile.phone != null) {
                    Linking.openURL(`tel:${profile.phone}`);
                  }
                }}
              >
                <Ionicons name="mail-outline" size={18} color={Colors.dark.text} />
                <Text style={styles.ctaSecondaryBtnText}>Contact Academy</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  backBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  backBtnText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  backRow: {
    marginBottom: Spacing.sm,
    padding: Spacing.xs,
    alignSelf: "flex-start",
  },
  hero: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  logoWrap: {
    marginBottom: Spacing.md,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  logoPlaceholder: {
    backgroundColor: "rgba(0,200,200,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,200,200,0.3)",
  },
  logoInitial: {
    fontSize: 40,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  academyName: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Spacing.md,
  },
  locationText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,200,200,0.1)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(0,200,200,0.25)",
  },
  chipText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  bodyText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sportTagPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sportTagPillText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  facilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  facilityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  facilityText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "capitalize",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  contactLink: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    flex: 1,
  },
  coachScroll: {
    gap: Spacing.md,
    paddingRight: Spacing.lg,
  },
  coachCard: {
    width: 110,
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachAvatarWrap: {},
  coachAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  coachAvatarPlaceholder: {
    backgroundColor: "rgba(0,200,200,0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,200,200,0.25)",
  },
  coachInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  coachName: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  coachRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  coachRatingText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  coachSpecialty: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  groupCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  groupCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  groupTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  ballBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  ballBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  groupSchedule: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  groupFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  groupPrice: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  spotsText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  spotsTextFull: {
    color: Colors.dark.error,
  },
  smallBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: "rgba(0,200,200,0.12)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,200,200,0.3)",
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  tournamentCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tournamentCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  tournamentName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
    marginRight: Spacing.sm,
  },
  sportTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sportTagText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  tournamentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tournamentDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  tournamentFee: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  ctaCard: {
    marginTop: Spacing.xl,
    backgroundColor: "rgba(0,200,200,0.07)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0,200,200,0.2)",
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  ctaSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  ctaBenefits: {
    gap: 4,
    marginBottom: Spacing.lg,
  },
  ctaBenefit: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    paddingLeft: Spacing.sm,
  },
  ctaButtons: {
    gap: Spacing.sm,
  },
  ctaPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  ctaPrimaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  ctaSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  ctaSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
