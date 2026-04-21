import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Linking } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { Spacing, BorderRadius, Colors, GlowColors } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { MatchSummaryCard } from "./MatchSummaryCard";
import { PlayersNearYouRow } from "./DiscoveryRows";

type NavAny = ReturnType<typeof useNavigation<any>>;

interface NearbyCourt {
  id: string;
  name: string;
  address: string | null;
  distance: number | null;
  lat?: number | null;
  lng?: number | null;
  sport: string;
  surface: string;
  isInternal: boolean;
  bookingEnabled: boolean;
  academyName: string | null;
}

interface OpenMatch {
  id: string;
  matchType: string;
  title: string;
  ballLevel: string;
  maxPlayers: number;
  currentPlayers: number;
  scheduledTime: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  sport?: string;
  courtName?: string | null;
  locationName?: string | null;
  costPerPlayer?: string | null;
  currency?: string;
  xpBonus?: number;
  host: { id: string; name: string; photoUrl: string | null; level: number; ballLevel: string; skillLevel?: number };
}

interface NearbyPlayerApi {
  id: string;
  name: string;
  level: number;
  avatarUrl: string | null;
  vibe?: string | null;
  openToPlay?: boolean;
  driveTimeText?: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
}

const COURT_CARD_WIDTH = 240;
const MATCH_CARD_WIDTH = 280;

// ─── Shared horizontal carousel section wrapper ───────────────────────────────
// Standardizes title + see-all header, horizontal list area, and the
// loading / empty / error / banner states across all free-player home rows.

interface HomeCarouselSectionProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onSeeAll?: () => void;
  isLoading?: boolean;
  /** Replaces the list area with a custom node (banner, empty CTA, etc). */
  banner?: React.ReactNode;
  emptyMessage?: string;
  /** Width of skeleton cards while loading. */
  skeletonWidth?: number;
  /** Items rendered into the horizontal ScrollView. */
  children?: React.ReactNode;
}

function HomeCarouselSection({
  title,
  icon,
  onSeeAll,
  isLoading,
  banner,
  emptyMessage,
  skeletonWidth = COURT_CARD_WIDTH,
  children,
}: HomeCarouselSectionProps) {
  useThemeReactivity();

  // Determine whether we have any rendered children.
  const childArr = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={sectionStyles.section}>
      <View style={sectionStyles.header}>
        <View style={sectionStyles.headerLeft}>
          {icon ? (
            <View style={sectionStyles.headerIcon}>
              <Ionicons name={icon} size={13} color={Colors.dark.accentText} />
            </View>
          ) : null}
          <Text style={sectionStyles.title}>{title}</Text>
        </View>
        {onSeeAll ? (
          <Pressable onPress={() => { Haptics.selectionAsync(); onSeeAll(); }} hitSlop={10}>
            <Text style={sectionStyles.seeAll}>See all</Text>
          </Pressable>
        ) : null}
      </View>

      {banner ? (
        banner
      ) : isLoading ? (
        <View style={sectionStyles.skeletonRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[sectionStyles.skeletonCard, { width: skeletonWidth }]} />
          ))}
        </View>
      ) : childArr.length === 0 ? (
        <View style={sectionStyles.emptyWrap}>
          <Text style={sectionStyles.emptyText}>{emptyMessage ?? "Nothing here yet."}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sectionStyles.listContent}
        >
          {childArr.map((child, idx) => (
            <View key={idx} style={{ marginRight: idx === childArr.length - 1 ? 0 : Spacing.sm }}>
              {child}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Permission banner ───────────────────────────────────────────────────────

function LocationPermissionBanner({
  permission,
  onRequest,
  message,
}: {
  permission: Location.PermissionResponse | null;
  onRequest: () => void;
  message: string;
}) {
  useThemeReactivity();

  if (Platform.OS === "web") {
    return (
      <View style={permStyles.banner}>
        <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
        <Text style={permStyles.bannerText}>Open the app on your phone via Expo Go to discover nearby clubs and players.</Text>
      </View>
    );
  }

  if (permission?.status === "denied" && !permission.canAskAgain) {
    return (
      <Pressable
        style={permStyles.banner}
        onPress={async () => {
          try { await Linking.openSettings(); } catch { /* not supported on this platform */ }
        }}
      >
        <Ionicons name="location-outline" size={16} color={Colors.dark.primary} />
        <Text style={permStyles.bannerText}>Enable location in Settings to {message}.</Text>
        <Text style={permStyles.bannerCta}>Open Settings</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={permStyles.banner}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRequest(); }}
    >
      <Ionicons name="location-outline" size={16} color={Colors.dark.primary} />
      <Text style={permStyles.bannerText}>Enable location to {message}.</Text>
      <Text style={permStyles.bannerCta}>Enable</Text>
    </Pressable>
  );
}

// ─── Reusable nearby-court card (mirrors PlayScreen visual language) ─────────

function NearbyCourtCardCompact({ court, onPress }: { court: NearbyCourt; onPress: () => void }) {
  useThemeReactivity();
  const sportLabel = court.sport ? court.sport.charAt(0).toUpperCase() + court.sport.slice(1) : "Court";
  const surfaceLabel = court.surface && court.surface !== "unknown"
    ? court.surface.charAt(0).toUpperCase() + court.surface.slice(1)
    : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [courtStyles.card, pressed && courtStyles.cardPressed, { width: COURT_CARD_WIDTH }]}>
      <View style={courtStyles.headerRow}>
        <View style={courtStyles.badgeRow}>
          <View style={[courtStyles.sportBadge, { backgroundColor: court.isInternal ? Colors.dark.primary + "25" : Colors.dark.backgroundTertiary }]}>
            <Ionicons
              name={court.sport === "padel" ? "grid-outline" : "tennisball-outline"}
              size={11}
              color={court.isInternal ? Colors.dark.primary : Colors.dark.textMuted}
            />
            <Text style={[courtStyles.sportText, { color: court.isInternal ? Colors.dark.primary : Colors.dark.textMuted }]}>{sportLabel}</Text>
          </View>
          {court.isInternal ? (
            <View style={courtStyles.internalBadge}>
              <Text style={courtStyles.internalText}>Academy</Text>
            </View>
          ) : court.academyName ? (
            <View style={courtStyles.externalBadge}>
              <Text style={courtStyles.externalText} numberOfLines={1}>{court.academyName}</Text>
            </View>
          ) : null}
        </View>
        {court.distance != null ? (
          <View style={courtStyles.distanceBadge}>
            <Ionicons name="navigate" size={9} color={Colors.dark.primary} />
            <Text style={courtStyles.distanceText}>{court.distance} km</Text>
          </View>
        ) : null}
      </View>
      <Text style={courtStyles.name} numberOfLines={2}>{court.name}</Text>
      {court.address ? (
        <Text style={courtStyles.address} numberOfLines={1}>{court.address}</Text>
      ) : null}
      <View style={courtStyles.footerRow}>
        {surfaceLabel ? (
          <View style={courtStyles.surfaceChip}>
            <Text style={courtStyles.surfaceText}>{surfaceLabel}</Text>
          </View>
        ) : <View />}
        {court.bookingEnabled ? (
          <View style={courtStyles.bookChip}>
            <Text style={courtStyles.bookChipText}>Book</Text>
            <Ionicons name="chevron-forward" size={11} color={Colors.dark.backgroundRoot} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function NearbyClubsSection({
  coords,
  permission,
  locationError,
  onRequestPermission,
  onRetryLocation,
  navigation,
}: {
  coords: { lat: number; lng: number } | null;
  permission: Location.PermissionResponse | null;
  locationError: boolean;
  onRequestPermission: () => void;
  onRetryLocation: () => void;
  navigation: NavAny;
}) {
  const { data, isLoading } = useQuery<NearbyCourt[]>({
    queryKey: ["/api/play/nearby-courts", coords?.lat, coords?.lng],
    queryFn: async () => {
      if (!coords) return [];
      const res = await apiFetch(`/api/play/nearby-courts?lat=${coords.lat}&lng=${coords.lng}`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    enabled: !!coords,
    staleTime: 5 * 60 * 1000,
  });

  const items = (data || []).slice(0, 10);
  const needsPermission = !permission?.granted;

  // Build the banner that replaces the carousel area when we cannot show data.
  let banner: React.ReactNode = null;
  if (needsPermission) {
    banner = (
      <LocationPermissionBanner
        permission={permission}
        onRequest={onRequestPermission}
        message="discover clubs nearby"
      />
    );
  } else if (locationError) {
    banner = (
      <Pressable style={permStyles.banner} onPress={onRetryLocation}>
        <Ionicons name="warning-outline" size={16} color={Colors.dark.primary} />
        <Text style={permStyles.bannerText}>Couldn't get your location. Check that GPS is on.</Text>
        <Text style={permStyles.bannerCta}>Retry</Text>
      </Pressable>
    );
  }

  return (
    <HomeCarouselSection
      title="Suggested clubs near you"
      icon="tennisball-outline"
      onSeeAll={() => navigation.navigate("CourtBooking")}
      isLoading={!banner && (!coords || isLoading)}
      banner={banner}
      emptyMessage="No clubs found nearby. Try a different area."
      skeletonWidth={COURT_CARD_WIDTH}
    >
      {items.map((court) => (
        <NearbyCourtCardCompact
          key={court.id}
          court={court}
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("CourtBooking");
          }}
        />
      ))}
    </HomeCarouselSection>
  );
}

function OpenMatchesSection({ navigation }: { navigation: NavAny }) {
  const { data, isLoading } = useQuery<OpenMatch[]>({
    queryKey: ["/api/open-matches", "free-home"],
    queryFn: async () => {
      const res = await apiFetch(`/api/open-matches?includeAllLevels=true`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60 * 1000,
  });

  const items = useMemo(
    () => (data || []).filter(m => (m.maxPlayers || 0) - (m.currentPlayers || 0) > 0).slice(0, 8),
    [data],
  );

  // "Be the first" CTA replaces the empty state for matches.
  const emptyBanner = !isLoading && items.length === 0 ? (
    <Pressable
      style={sectionStyles.emptyCta}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("CreateMatch");
      }}
    >
      <Ionicons name="add-circle" size={20} color={Colors.dark.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={sectionStyles.emptyCtaTitle}>No open matches yet</Text>
        <Text style={sectionStyles.emptyCtaSub}>Be the first — host one and players can join.</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
    </Pressable>
  ) : null;

  return (
    <HomeCarouselSection
      title="Open matches you can join"
      icon="flash-outline"
      onSeeAll={() => navigation.navigate("OpenMatches")}
      isLoading={isLoading}
      banner={emptyBanner}
      skeletonWidth={MATCH_CARD_WIDTH}
    >
      {items.map((match) => (
        <View key={match.id} style={{ width: MATCH_CARD_WIDTH }}>
          <MatchSummaryCard
            matchId={match.id}
            matchType={match.matchType}
            sport={match.sport}
            scheduledTime={match.scheduledTime}
            courtName={match.courtName}
            locationName={match.locationName}
            host={{
              id: match.host?.id,
              name: match.host?.name,
              photoUrl: match.host?.photoUrl,
              ballLevel: match.host?.ballLevel,
              skillLevel: match.host?.skillLevel,
            }}
            ballLevel={match.ballLevel}
            currentPlayers={match.currentPlayers}
            maxPlayers={match.maxPlayers}
            costPerPlayer={match.costPerPlayer}
            currency={match.currency}
            xpBonus={match.xpBonus}
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate("OpenMatches");
            }}
          />
        </View>
      ))}
    </HomeCarouselSection>
  );
}

function NearbyPlayersSection({
  permission,
  onRequestPermission,
}: {
  permission: Location.PermissionResponse | null;
  onRequestPermission: () => void;
}) {
  const needsPermission = !permission?.granted;

  // Only fetch once permission is granted (matches the location-aware contract).
  const { data, isLoading } = useQuery<NearbyPlayerApi[]>({
    queryKey: ["/api/play/nearby-players", "free-home"],
    queryFn: async () => {
      const res = await apiFetch(`/api/play/nearby-players?scope=all`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    enabled: !needsPermission,
    staleTime: 2 * 60 * 1000,
  });

  // Map the API response to the shape PlayersNearYouRow expects.
  const mappedPlayers = useMemo(() => {
    return (data || []).slice(0, 12).map((p) => ({
      id: p.id,
      name: p.name,
      level: (p.ballLevel || "glow"),
      status: (p.openToPlay ? "available" : "offline") as "available" | "playing" | "offline",
      profilePhotoUrl: p.avatarUrl ?? undefined,
      ballLevel: p.ballLevel ?? undefined,
      skillLevel: p.skillLevel ?? undefined,
      driveTimeText: p.driveTimeText,
    }));
  }, [data]);

  if (needsPermission) {
    return (
      <View style={sectionStyles.section}>
        <SectionHeader title="Players near you" icon="people-outline" />
        <LocationPermissionBanner
          permission={permission}
          onRequest={onRequestPermission}
          message="see players in your area"
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={sectionStyles.section}>
        <SectionHeader title="Players near you" icon="people-outline" />
        <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginVertical: Spacing.md }} />
      </View>
    );
  }

  // Reuse the shared PlayersNearYouRow with an unfiltered list.
  return (
    <PlayersNearYouRow
      filterByLevel={false}
      players={mappedPlayers}
      hideWhenEmpty={false}
      title="Players near you"
    />
  );
}

// ─── Soft "Join an academy" card (rendered separately at bottom of home) ──────

export function JoinAcademySoftCard() {
  useThemeReactivity();
  const navigation = useNavigation<any>();
  return (
    <Pressable
      style={joinStyles.card}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate("AcademyBrowser");
      }}
    >
      <LinearGradient
        colors={["rgba(200,255,61,0.10)", "rgba(0,200,255,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={joinStyles.gradient}
      >
        <View style={joinStyles.iconWrap}>
          <Ionicons name="business" size={22} color={Colors.dark.accentText} />
        </View>
        <View style={joinStyles.textWrap}>
          <Text style={joinStyles.title}>Want structured coaching?</Text>
          <Text style={joinStyles.sub}>Join an academy for sessions, drills, and personalized feedback.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.accentText} />
      </LinearGradient>
    </Pressable>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FreePlayerDiscoverySections() {
  useThemeReactivity();
  const navigation = useNavigation<any>();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const fetchingRef = useRef(false);

  const fetchCoords = React.useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLocationError(false);
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(loc => {
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        setLocationError(false);
      })
      .catch(() => {
        // GPS off / timeout / provider error — surface an actionable retry banner.
        setCoords(null);
        setLocationError(true);
      })
      .finally(() => { fetchingRef.current = false; });
  }, []);

  // Only fetch coords once permission is granted (request is user-initiated).
  useEffect(() => {
    if (permission?.granted && !coords && !locationError) {
      fetchCoords();
    }
  }, [permission?.granted, coords, locationError, fetchCoords]);

  const handleRequestPermission = async () => {
    try { await requestPermission(); } catch { /* user cancelled */ }
  };

  return (
    <View style={sectionStyles.wrap}>
      <NearbyClubsSection
        coords={coords}
        permission={permission}
        locationError={locationError}
        onRequestPermission={handleRequestPermission}
        onRetryLocation={fetchCoords}
        navigation={navigation}
      />
      <OpenMatchesSection navigation={navigation} />
      <NearbyPlayersSection
        permission={permission}
        onRequestPermission={handleRequestPermission}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionStyles = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.accentTextSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.2,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  skeletonCard: {
    height: 140,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  emptyWrap: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.accentTextSoft,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  emptyCtaTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptyCtaSub: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
}));

const permStyles = makeReactiveStyles(() => StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  bannerCta: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
}));

const courtStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    gap: 6,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  sportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  sportText: {
    fontSize: 10,
    fontWeight: "700",
  },
  internalBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: GlowColors.primary + "30",
  },
  internalText: {
    fontSize: 10,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: 0.4,
  },
  externalBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
    flex: 1,
  },
  externalText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "20",
  },
  distanceText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  name: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
    marginTop: 4,
  },
  address: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  surfaceChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  surfaceText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  bookChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: GlowColors.primary,
  },
  bookChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
  },
}));

const joinStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.18)",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.accentTextSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  sub: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
}));
