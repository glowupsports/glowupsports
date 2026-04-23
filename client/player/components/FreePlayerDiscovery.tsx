import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { Image } from "expo-image";

import { Spacing, BorderRadius, Colors, GlowColors } from "@/constants/theme";
import { apiFetch, buildPhotoUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerCountry } from "@/player/hooks/usePlayerCountry";
import {
  makeReactiveStyles,
  useThemeReactivity,
} from "@/hooks/useThemedStyles";
import { PlayersNearYouRow } from "./DiscoveryRows";
import { MatchSummaryCard } from "./MatchSummaryCard";
import { SectionHeader } from "@/components/PremiumUI";
import { useDiscoverScope } from "@/player/context/DiscoverScopeContext";
import type { OpenMatch } from "@shared/schema";

type NavAny = ReturnType<typeof useNavigation<any>>;

interface NearbyAcademy {
  id: string;
  name: string;
  slug?: string | null;
  city: string | null;
  country: string | null;
  description?: string | null;
  logoUrl: string | null;
  averageRating: number | null;
  sports: string[];
  coachCount?: number;
  playerCount?: number;
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
  // Server enriches these for the player directory; used by Discover rails to
  // sort by "Players you might know" (mutual count) and "Recently active".
  mutualSessions?: number;
  lastLoginAt?: string | null;
  country?: string | null;
}

const COURT_CARD_WIDTH = 240;
const ACADEMY_CARD_WIDTH = 240;
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
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onSeeAll();
            }}
            hitSlop={10}
          >
            <Text style={sectionStyles.seeAll}>See all</Text>
          </Pressable>
        ) : null}
      </View>

      {banner ? (
        banner
      ) : isLoading ? (
        <View style={sectionStyles.skeletonRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[sectionStyles.skeletonCard, { width: skeletonWidth }]}
            />
          ))}
        </View>
      ) : childArr.length === 0 ? (
        <View style={sectionStyles.emptyWrap}>
          <Text style={sectionStyles.emptyText}>
            {emptyMessage ?? "Nothing here yet."}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sectionStyles.listContent}
        >
          {childArr.map((child, idx) => (
            <View
              key={idx}
              style={{
                marginRight: idx === childArr.length - 1 ? 0 : Spacing.sm,
              }}
            >
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
        <Ionicons
          name="location-outline"
          size={16}
          color={Colors.dark.textMuted}
        />
        <Text style={permStyles.bannerText}>
          Open the app on your phone via Expo Go to discover nearby clubs and
          players.
        </Text>
      </View>
    );
  }

  if (permission?.status === "denied" && !permission.canAskAgain) {
    return (
      <Pressable
        style={permStyles.banner}
        onPress={async () => {
          try {
            await Linking.openSettings();
          } catch {
            /* not supported on this platform */
          }
        }}
      >
        <Ionicons
          name="location-outline"
          size={16}
          color={Colors.dark.primary}
        />
        <Text style={permStyles.bannerText}>
          Enable location in Settings to {message}.
        </Text>
        <Text style={permStyles.bannerCta}>Open Settings</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={permStyles.banner}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onRequest();
      }}
    >
      <Ionicons name="location-outline" size={16} color={Colors.dark.primary} />
      <Text style={permStyles.bannerText}>Enable location to {message}.</Text>
      <Text style={permStyles.bannerCta}>Enable</Text>
    </Pressable>
  );
}

// ─── Academy card (rendered in the "Academies near you" rail) ─────────────────

function formatSportLabel(sport: string): string {
  if (!sport) return "";
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

function NearbyAcademyCardCompact({
  academy,
  onPress,
}: {
  academy: NearbyAcademy;
  onPress: () => void;
}) {
  useThemeReactivity();
  const sportsLabel =
    academy.sports && academy.sports.length > 0
      ? academy.sports.slice(0, 3).map(formatSportLabel).join(" · ")
      : "Tennis";
  const cityCountry = [academy.city, academy.country]
    .filter(Boolean)
    .join(", ");
  const initial = academy.name?.trim()?.charAt(0)?.toUpperCase() || "A";
  const logo = academy.logoUrl ? buildPhotoUrl(academy.logoUrl) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        courtStyles.card,
        pressed && courtStyles.cardPressed,
        { width: ACADEMY_CARD_WIDTH },
      ]}
    >
      <View style={academyStyles.headerRow}>
        <View style={academyStyles.logoWrap}>
          {logo ? (
            <Image
              source={{ uri: logo }}
              style={academyStyles.logo}
              contentFit="cover"
            />
          ) : (
            <View style={[academyStyles.logo, academyStyles.logoFallback]}>
              <Text style={academyStyles.logoInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={courtStyles.name} numberOfLines={2}>
            {academy.name}
          </Text>
          <Text style={academyStyles.sports} numberOfLines={1}>
            {sportsLabel}
          </Text>
        </View>
      </View>
      {cityCountry ? (
        <View style={academyStyles.locationRow}>
          <Ionicons
            name="location-outline"
            size={11}
            color={Colors.dark.textMuted}
          />
          <Text style={courtStyles.address} numberOfLines={1}>
            {cityCountry}
          </Text>
        </View>
      ) : null}
      <View style={courtStyles.footerRow}>
        <View />
        <View style={courtStyles.bookChip}>
          <Text style={courtStyles.bookChipText}>Visit</Text>
          <Ionicons
            name="chevron-forward"
            size={11}
            color={Colors.dark.backgroundRoot}
          />
        </View>
      </View>
    </Pressable>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function NearbyAcademiesSection({
  coords,
  navigation,
}: {
  coords: { lat: number; lng: number } | null;
  navigation: NavAny;
}) {
  // Resolve player's country (profile → GPS reverse-geocode → device locale)
  // so we can scope academies to "near you" without requiring GPS permission.
  const { country: resolvedCountry } = usePlayerCountry(coords);

  const { data, isLoading } = useQuery<{ academies: NearbyAcademy[] }>({
    queryKey: ["/api/academies/browse", "free-home", resolvedCountry || "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (resolvedCountry) params.set("country", resolvedCountry);
      const res = await apiFetch(
        `/api/academies/browse${params.toString() ? `?${params.toString()}` : ""}`,
      );
      if (!res.ok) return { academies: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = (data?.academies || []).slice(0, 10);

  return (
    <HomeCarouselSection
      title="Academies near you"
      icon="business-outline"
      onSeeAll={() => navigation.navigate("AcademyBrowser")}
      isLoading={isLoading}
      emptyMessage="No academies found near you. Try widening your search."
      skeletonWidth={ACADEMY_CARD_WIDTH}
    >
      {items.map((academy) => (
        <NearbyAcademyCardCompact
          key={academy.id}
          academy={academy}
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("AcademyPublicProfile", {
              academyId: academy.id,
            });
          }}
        />
      ))}
    </HomeCarouselSection>
  );
}

function OpenMatchesSection({ navigation, variant = "home" }: { navigation: NavAny; variant?: "home" | "discover" }) {
  const scopeCtx = useDiscoverScope();
  const isDiscover = variant === "discover";
  // Discover: pass scope to the server (mine|country|all). Home: keep
  // existing behavior — show all open matches the player can see.
  const scopeParam: "country" | "all" | undefined = isDiscover
    ? (scopeCtx?.scope === "global" ? "all" : "country")
    : undefined;

  const { data, isLoading } = useQuery<OpenMatch[]>({
    queryKey: isDiscover
      ? ["/api/open-matches", "discover", scopeParam]
      : ["/api/open-matches", "free-home"],
    queryFn: async () => {
      const url = scopeParam
        ? `/api/open-matches?includeAllLevels=true&scope=${scopeParam}`
        : `/api/open-matches?includeAllLevels=true`;
      const res = await apiFetch(url);
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

  // "Be the first" CTA replaces the empty state for matches. In Discover mode
  // we additionally prompt the user to widen the scope chip when their country
  // is empty.
  const renderEmptyCta = () => {
    if (isDiscover && scopeCtx?.scope === "country") {
      return (
        <Pressable
          style={sectionStyles.emptyCta}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            scopeCtx.setScope("global");
          }}
        >
          <Ionicons name="globe-outline" size={20} color={Colors.dark.accentText} />
          <View style={{ flex: 1 }}>
            <Text style={sectionStyles.emptyCtaTitle}>No open matches in your country</Text>
            <Text style={sectionStyles.emptyCtaSub}>Tap to widen to worldwide.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        </Pressable>
      );
    }
    return (
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
    );
  };

  const emptyBanner = !isLoading && items.length === 0 ? renderEmptyCta() : null;

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

// NOTE (Task #1079): The duplicate "Open matches you can join" rail was
// removed from the free-player Play tab (FreePlayerDiscoverySections) because
// the top-of-screen open matches card is the single source for that
// information. OpenMatchesSection above is still used by DiscoverSections.

function NearbyPlayersSection({
  permission,
  onRequestPermission,
  variant = "home",
}: {
  permission: Location.PermissionResponse | null;
  onRequestPermission: () => void;
  variant?: "home" | "discover";
}) {
  const needsPermission = !permission?.granted;
  const scopeCtx = useDiscoverScope();
  // The discover tab broadcasts a country/global scope. The home variant
  // keeps its existing worldwide-only behavior.
  const scopeParam = variant === "discover" && scopeCtx?.scope === "country" ? "country" : "all";

  // Only fetch once permission is granted (matches the location-aware contract).
  const { data, isLoading } = useQuery<NearbyPlayerApi[]>({
    queryKey: ["/api/play/nearby-players", variant === "discover" ? `discover:${scopeParam}` : "free-home"],
    queryFn: async () => {
      const res = await apiFetch(`/api/play/nearby-players?scope=${scopeParam}`);
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
      level: p.ballLevel || "glow",
      status: (p.openToPlay ? "available" : "offline") as
        | "available"
        | "playing"
        | "offline",
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
        <ActivityIndicator
          size="small"
          color={Colors.dark.primary}
          style={{ marginVertical: Spacing.md }}
        />
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
          <Text style={joinStyles.sub}>
            Join an academy for sessions, drills, and personalized feedback.
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={Colors.dark.accentText}
        />
      </LinearGradient>
    </Pressable>
  );
}

// ─── Coaches rail (Task #1037 — Public Coach Profiles) ───────────────────────
// Shows publicly discoverable coaches the player can browse and book a
// drop-in lesson with. Defaults to "My country" scope when we know the
// player's country, otherwise falls back to worldwide.

interface PublicCoachEntry {
  id: string;
  name: string;
  specialty?: string | null;
  photoUrl?: string | null;
  publicQuote?: string | null;
  averageRating?: number | null;
  totalRatings?: number | null;
  hourlyRate?: string | null;
  academyName?: string | null;
  academyCountry?: string | null;
}

function CoachesNearYouSection({
  navigation,
  coords,
  showLocalChip = true,
}: {
  navigation: any;
  coords: { lat: number; lng: number } | null;
  /** When false (used inside DiscoverScreen), suppress the per-rail scope chip
   * because the screen already shows a single global chip at the top. */
  showLocalChip?: boolean;
}) {
  useThemeReactivity();
  // Resolve the player's country from profile → GPS reverse-geocode → device locale
  // so players in countries without an academy still get a country-scoped rail.
  const { country: resolvedCountry, isResolving } = usePlayerCountry(coords);
  const scopeCtx = useDiscoverScope();
  const [localScope, setLocalScope] = useState<"country" | "global">("country");
  const scope: "country" | "global" = scopeCtx ? scopeCtx.scope : localScope;
  const setScope = (next: "country" | "global") => {
    if (scopeCtx) scopeCtx.setScope(next);
    else setLocalScope(next);
  };

  const { data, isLoading } = useQuery<{ coaches: PublicCoachEntry[] }>({
    queryKey: ["/api/coaches/directory", "discover", scope, resolvedCountry],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("public", "true");
      if (scope === "country" && resolvedCountry) {
        params.set("scope", "country");
        params.set("country", resolvedCountry);
      }
      const res = await apiFetch(`/api/coaches/directory?${params.toString()}`);
      if (!res.ok) return { coaches: [] };
      return res.json();
    },
    // In country scope, never fall back to a global fetch — wait for a
    // resolved country, otherwise the rail would silently show worldwide
    // results under the "My country" chip.
    enabled: scope === "global" || !!resolvedCountry,
    staleTime: 5 * 60 * 1000,
  });

  const coaches = (data?.coaches || []).slice(0, 12);

  return (
    <View style={sectionStyles.section}>
      <View style={sectionStyles.header}>
        <View style={sectionStyles.headerLeft}>
          <View style={sectionStyles.headerIcon}>
            <Ionicons
              name="ribbon-outline"
              size={13}
              color={Colors.dark.accentText}
            />
          </View>
          <Text style={sectionStyles.title}>Coaches</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("CoachDirectory");
          }}
          hitSlop={10}
        >
          <Text style={sectionStyles.seeAll}>See all</Text>
        </Pressable>
      </View>

      {showLocalChip ? (
        <View style={coachRailStyles.scopeRow}>
          <Pressable
            style={[
              coachRailStyles.scopeChip,
              scope === "country" && coachRailStyles.scopeChipActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setScope("country");
            }}
          >
            <Ionicons
              name="location"
              size={12}
              color={
                scope === "country"
                  ? Colors.dark.buttonText
                  : Colors.dark.textMuted
              }
            />
            <Text
              style={[
                coachRailStyles.scopeChipText,
                scope === "country" && coachRailStyles.scopeChipTextActive,
              ]}
            >
              {resolvedCountry ? resolvedCountry : "My country"}
            </Text>
          </Pressable>
          <Pressable
            style={[
              coachRailStyles.scopeChip,
              scope === "global" && coachRailStyles.scopeChipActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setScope("global");
            }}
          >
            <Ionicons
              name="globe-outline"
              size={12}
              color={
                scope === "global"
                  ? Colors.dark.buttonText
                  : Colors.dark.textMuted
              }
            />
            <Text
              style={[
                coachRailStyles.scopeChipText,
                scope === "global" && coachRailStyles.scopeChipTextActive,
              ]}
            >
              Worldwide
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading || (scope === "country" && !resolvedCountry && isResolving) ? (
        <View style={sectionStyles.skeletonRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[sectionStyles.skeletonCard, { width: 160 }]}
            />
          ))}
        </View>
      ) : scope === "country" && !resolvedCountry ? (
        <Pressable
          style={sectionStyles.emptyCta}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("EditProfile");
          }}
        >
          <Ionicons
            name="location-outline"
            size={20}
            color={Colors.dark.accentText}
          />
          <View style={{ flex: 1 }}>
            <Text style={sectionStyles.emptyCtaTitle}>Set your country</Text>
            <Text style={sectionStyles.emptyCtaSub}>
              Add it in your profile to see coaches near you, or browse
              worldwide.
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={Colors.dark.textMuted}
          />
        </Pressable>
      ) : coaches.length === 0 ? (
        <View style={sectionStyles.emptyWrap}>
          <Text style={sectionStyles.emptyText}>
            {scope === "country" && resolvedCountry
              ? `No public coaches in ${resolvedCountry} yet — try Worldwide.`
              : "No public coaches yet."}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sectionStyles.listContent}
        >
          {coaches.map((c, idx) => {
            const photo = c.photoUrl;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("CoachProfile", { coachId: c.id });
                }}
                style={[
                  coachRailStyles.card,
                  { marginRight: idx === coaches.length - 1 ? 0 : Spacing.sm },
                ]}
              >
                {photo ? (
                  <Image
                    source={{ uri: buildPhotoUrl(photo)! }}
                    style={coachRailStyles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      coachRailStyles.avatar,
                      coachRailStyles.avatarPlaceholder,
                    ]}
                  >
                    <Text style={coachRailStyles.initial}>
                      {c.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={coachRailStyles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                {c.specialty ? (
                  <Text style={coachRailStyles.specialty} numberOfLines={1}>
                    {c.specialty}
                  </Text>
                ) : null}
                <View style={coachRailStyles.metaRow}>
                  {c.averageRating ? (
                    <View style={coachRailStyles.metaItem}>
                      <Ionicons name="star" size={11} color="#FFD700" />
                      <Text style={coachRailStyles.metaText}>
                        {Number(c.averageRating).toFixed(1)}
                      </Text>
                    </View>
                  ) : null}
                  {c.hourlyRate ? (
                    <Text style={coachRailStyles.priceText}>
                      AED {parseInt(String(c.hourlyRate), 10)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const coachRailStyles = makeReactiveStyles(() =>
  StyleSheet.create({
    scopeRow: {
      flexDirection: "row",
      paddingHorizontal: Spacing.lg,
      gap: Spacing.xs,
    },
    scopeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.chipBackground,
    },
    scopeChipActive: {
      backgroundColor: Colors.dark.accentText,
    },
    scopeChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: Colors.dark.textMuted,
    },
    scopeChipTextActive: {
      color: Colors.dark.buttonText,
    },
    card: {
      width: 160,
      padding: Spacing.sm,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.dark.chipBackground,
      borderWidth: 1,
      borderColor: Colors.dark.chipBackgroundStrong,
    },
    avatar: {
      width: "100%",
      height: 100,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.xs,
    },
    avatarPlaceholder: {
      backgroundColor: Colors.dark.accentTextSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    initial: {
      fontSize: 32,
      fontWeight: "800",
      color: Colors.dark.accentText,
    },
    name: {
      fontSize: 13,
      fontWeight: "700",
      color: Colors.dark.text,
    },
    specialty: {
      fontSize: 11,
      color: Colors.dark.textMuted,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Spacing.xs,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    metaText: {
      fontSize: 11,
      color: Colors.dark.textSecondary,
      fontWeight: "600",
    },
    priceText: {
      fontSize: 11,
      color: Colors.dark.accentText,
      fontWeight: "700",
    },
  }),
);

// ─── Public tournaments rail (Discover tab) ──────────────────────────────────

interface PublicTournamentItem {
  id: string;
  name: string;
  sport: string;
  startDate: string;
  endDate: string;
  location: string;
  entryFee?: number | string | null;
  spotsTotal: number;
  spotsTaken: number;
  status: string;
  academyName?: string | null;
}

function PublicTournamentsSection({
  navigation,
  coords,
}: {
  navigation: NavAny;
  coords: { lat: number; lng: number } | null;
}) {
  useThemeReactivity();
  const scopeCtx = useDiscoverScope();
  const { country: resolvedCountry, isResolving: isResolvingCountry } = usePlayerCountry(coords);
  const isCountryScope = scopeCtx?.scope === "country";
  // Server filters tournaments by joined-academy country when provided.
  const countryParam = isCountryScope && resolvedCountry ? resolvedCountry : null;

  const { data, isLoading } = useQuery<PublicTournamentItem[]>({
    queryKey: ["/api/tournaments/public", "discover", scopeCtx?.scope ?? "global", countryParam],
    queryFn: async () => {
      const url = countryParam
        ? `/api/tournaments/public?country=${encodeURIComponent(countryParam)}`
        : "/api/tournaments/public";
      const res = await apiFetch(url);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    // Mirror CoachesNearYouSection: in country scope, never fall back to a
    // worldwide fetch — wait for a resolved country, otherwise the rail
    // would silently serve global results under the "My country" chip.
    enabled: !isCountryScope || !!resolvedCountry,
    staleTime: 5 * 60 * 1000,
  });

  const navigation2 = navigation;
  // Country scope but country still unknown after resolution → CTA gate.
  if (isCountryScope && !resolvedCountry && !isResolvingCountry) {
    return (
      <HomeCarouselSection
        title="Public tournaments"
        icon="trophy-outline"
        isLoading={false}
        banner={
          <Pressable
            style={sectionStyles.emptyCta}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation2.navigate("EditProfile");
            }}
          >
            <Ionicons name="location-outline" size={20} color={Colors.dark.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={sectionStyles.emptyCtaTitle}>Set your country</Text>
              <Text style={sectionStyles.emptyCtaSub}>
                Add it in your profile to see tournaments near you, or switch to Worldwide.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        }
      />
    );
  }

  const items = (data || []).slice(0, 8);

  const emptyBanner = !isLoading && items.length === 0 ? (
    isCountryScope ? (
      <Pressable
        style={sectionStyles.emptyCta}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          scopeCtx?.setScope("global");
        }}
      >
        <Ionicons name="globe-outline" size={20} color={Colors.dark.accentText} />
        <View style={{ flex: 1 }}>
          <Text style={sectionStyles.emptyCtaTitle}>No tournaments in {resolvedCountry || "your country"} yet</Text>
          <Text style={sectionStyles.emptyCtaSub}>Tap to see worldwide.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
      </Pressable>
    ) : (
      <Pressable
        style={sectionStyles.emptyCta}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("PlayerTabs", {
            screen: "Growth",
            params: { screen: "Tournaments" },
          });
        }}
      >
        <Ionicons name="trophy" size={20} color={Colors.dark.accentText} />
        <View style={{ flex: 1 }}>
          <Text style={sectionStyles.emptyCtaTitle}>No public tournaments yet</Text>
          <Text style={sectionStyles.emptyCtaSub}>Browse all tournaments to find one to enter.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
      </Pressable>
    )
  ) : null;

  return (
    <HomeCarouselSection
      title="Public tournaments"
      icon="trophy-outline"
      onSeeAll={() =>
        navigation.navigate("PlayerTabs", {
          screen: "Growth",
          params: { screen: "Tournaments" },
        })
      }
      isLoading={isLoading}
      banner={emptyBanner}
      skeletonWidth={MATCH_CARD_WIDTH}
    >
      {items.map((tour) => {
        const isFull = tour.spotsTaken >= tour.spotsTotal;
        const fee = tour.entryFee && Number(tour.entryFee) > 0 ? `AED ${Number(tour.entryFee)}` : "Free";
        return (
          <Pressable
            key={tour.id}
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate("PlayerTabs", {
                screen: "Growth",
                params: { screen: "TournamentDetail", params: { tournamentId: tour.id } },
              });
            }}
            style={[tournamentStyles.card, { width: MATCH_CARD_WIDTH }]}
          >
            <View style={tournamentStyles.cardHeader}>
              <View style={tournamentStyles.sportBadge}>
                <Ionicons name="trophy" size={11} color={Colors.dark.accentText} />
                <Text style={tournamentStyles.sportBadgeText}>{tour.sport?.toUpperCase() || "TENNIS"}</Text>
              </View>
              {isFull ? (
                <Text style={tournamentStyles.fullChip}>FULL</Text>
              ) : (
                <Text style={tournamentStyles.spotsChip}>{tour.spotsTotal - tour.spotsTaken} spots</Text>
              )}
            </View>
            <Text style={tournamentStyles.name} numberOfLines={2}>{tour.name}</Text>
            <View style={tournamentStyles.metaRow}>
              <Ionicons name="location-outline" size={11} color={Colors.dark.textMuted} />
              <Text style={tournamentStyles.metaText} numberOfLines={1}>{tour.location}</Text>
            </View>
            <View style={tournamentStyles.metaRow}>
              <Ionicons name="calendar-outline" size={11} color={Colors.dark.textMuted} />
              <Text style={tournamentStyles.metaText} numberOfLines={1}>
                {new Date(tour.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </Text>
            </View>
            <View style={tournamentStyles.footer}>
              <Text style={tournamentStyles.fee}>{fee}</Text>
              <Text style={tournamentStyles.cta}>View →</Text>
            </View>
          </Pressable>
        );
      })}
    </HomeCarouselSection>
  );
}

const tournamentStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentTextSoft,
  },
  sportBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.accentText,
    letterSpacing: 0.4,
  },
  spotsChip: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  fullChip: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FF4D4D",
  },
  name: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  fee: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  cta: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.accentText,
  },
}));

// ─── Open lessons rail (Discover) ────────────────────────────────────────────

interface OpenLessonItem {
  id: string;
  type: "group" | "private" | "open_match";
  time: string;
  spotsLeft: number;
  maxPlayers?: number;
  coachName?: string;
  ballLevel?: string;
  locationName?: string;
}

function OpenLessonsRailDiscover({ navigation }: { navigation: NavAny }) {
  useThemeReactivity();
  const scopeCtx = useDiscoverScope();
  const isCountryScope = scopeCtx?.scope === "country";

  // Open lessons currently aggregate from the player's joined-academy graph
  // and don't carry a country attribute on the wire. Until the endpoint
  // gains country support we explicitly gate "country" scope with a CTA so
  // we never silently render worldwide results under the country chip. In
  // worldwide scope we surface the cached open-sessions list as-is.
  const { data, isLoading } = useQuery<{ openSessions?: OpenLessonItem[] }>({
    queryKey: ["/api/player/me/social?levelFallback=adjacent"],
    enabled: !isCountryScope,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(
    () => (data?.openSessions || []).filter(s => s.type === "group" && s.spotsLeft > 0).slice(0, 8),
    [data],
  );

  if (isCountryScope) {
    return (
      <HomeCarouselSection
        title="Open lessons near me"
        icon="school-outline"
        isLoading={false}
        banner={
          <Pressable
            style={sectionStyles.emptyCta}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              scopeCtx?.setScope("global");
            }}
          >
            <Ionicons name="globe-outline" size={20} color={Colors.dark.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={sectionStyles.emptyCtaTitle}>Country-scoped lessons coming soon</Text>
              <Text style={sectionStyles.emptyCtaSub}>Tap to switch to Worldwide and see open lessons now.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        }
      />
    );
  }

  const emptyBanner = !isLoading && items.length === 0 ? (
    <Pressable
      style={sectionStyles.emptyCta}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("ClassesDiscovery");
      }}
    >
      <Ionicons name="search" size={20} color={Colors.dark.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={sectionStyles.emptyCtaTitle}>No open lessons yet</Text>
        <Text style={sectionStyles.emptyCtaSub}>Browse all classes to find one to join.</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
    </Pressable>
  ) : null;

  return (
    <HomeCarouselSection
      title="Open lessons near me"
      icon="school-outline"
      onSeeAll={() => navigation.navigate("ClassesDiscovery")}
      isLoading={isLoading}
      banner={emptyBanner}
      skeletonWidth={MATCH_CARD_WIDTH}
    >
      {items.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("ClassesDiscovery");
          }}
          style={[tournamentStyles.card, { width: MATCH_CARD_WIDTH }]}
        >
          <View style={tournamentStyles.cardHeader}>
            <View style={tournamentStyles.sportBadge}>
              <Ionicons name="school" size={11} color={Colors.dark.accentText} />
              <Text style={tournamentStyles.sportBadgeText}>{(s.ballLevel || "ALL").toUpperCase()}</Text>
            </View>
            <Text style={tournamentStyles.spotsChip}>{s.spotsLeft} spot{s.spotsLeft === 1 ? "" : "s"}</Text>
          </View>
          <Text style={tournamentStyles.name} numberOfLines={2}>
            {s.coachName ? `with ${s.coachName}` : "Group lesson"}
          </Text>
          <View style={tournamentStyles.metaRow}>
            <Ionicons name="time-outline" size={11} color={Colors.dark.textMuted} />
            <Text style={tournamentStyles.metaText} numberOfLines={1}>
              {new Date(s.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </Text>
          </View>
          {s.locationName ? (
            <View style={tournamentStyles.metaRow}>
              <Ionicons name="location-outline" size={11} color={Colors.dark.textMuted} />
              <Text style={tournamentStyles.metaText} numberOfLines={1}>{s.locationName}</Text>
            </View>
          ) : null}
          <View style={tournamentStyles.footer}>
            <Text style={tournamentStyles.fee}>{s.maxPlayers ? `${(s.maxPlayers - s.spotsLeft)}/${s.maxPlayers}` : ""}</Text>
            <Text style={tournamentStyles.cta}>Join →</Text>
          </View>
        </Pressable>
      ))}
    </HomeCarouselSection>
  );
}

// ─── Discover players rail (you-might-know / recently-active) ────────────────

type DiscoverPlayersKind = "youMightKnow" | "recentlyActive";

function DiscoverPlayersRail({ kind }: { kind: DiscoverPlayersKind }) {
  useThemeReactivity();
  const scopeCtx = useDiscoverScope();
  const navigation = useNavigation<any>();
  const isCountryScope = scopeCtx?.scope === "country";
  const scopeParam: "country" | "all" = isCountryScope ? "country" : "all";

  const filter = kind === "youMightKnow" ? "recommended" : undefined;
  const { data, isLoading } = useQuery<NearbyPlayerApi[]>({
    queryKey: ["/api/play/nearby-players", "discover", kind, scopeParam],
    queryFn: async () => {
      const url = filter
        ? `/api/play/nearby-players?scope=${scopeParam}&filter=${filter}`
        : `/api/play/nearby-players?scope=${scopeParam}`;
      const res = await apiFetch(url);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const items = useMemo(() => {
    const all = data || [];
    if (kind === "recentlyActive") {
      // Sort by lastLoginAt desc; players with no login data go last.
      return [...all].sort((a, b) => {
        const ta = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const tb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
        return tb - ta;
      }).slice(0, 12);
    }
    // youMightKnow: server already sorted by mutualSessions desc when filter=recommended
    return all.slice(0, 12);
  }, [data, kind]);

  const mapped = useMemo(() => items.map((p) => ({
    id: p.id,
    name: p.name,
    level: (p.ballLevel || "glow"),
    status: (p.openToPlay ? "available" : "offline") as "available" | "playing" | "offline",
    profilePhotoUrl: p.avatarUrl ?? undefined,
    ballLevel: p.ballLevel ?? undefined,
    skillLevel: p.skillLevel ?? undefined,
    driveTimeText: p.driveTimeText,
  })), [items]);

  const title = kind === "youMightKnow" ? "Players you might know" : "Recently active worldwide";
  const icon: keyof typeof Ionicons.glyphMap = kind === "youMightKnow" ? "people-outline" : "pulse-outline";

  if (isLoading) {
    return (
      <View style={sectionStyles.section}>
        <SectionHeader title={title} icon={icon} />
        <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginVertical: Spacing.md }} />
      </View>
    );
  }

  if (mapped.length === 0) {
    return (
      <HomeCarouselSection
        title={title}
        icon={icon}
        isLoading={false}
        banner={
          isCountryScope ? (
            <Pressable
              style={sectionStyles.emptyCta}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                scopeCtx?.setScope("global");
              }}
            >
              <Ionicons name="globe-outline" size={20} color={Colors.dark.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={sectionStyles.emptyCtaTitle}>
                  {kind === "youMightKnow"
                    ? "No matching players in your country"
                    : "Nobody recently active in your country"}
                </Text>
                <Text style={sectionStyles.emptyCtaSub}>Tap to widen to worldwide.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              style={sectionStyles.emptyCta}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("PlayerTabs", { screen: "Community" });
              }}
            >
              <Ionicons name="people" size={20} color={Colors.dark.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={sectionStyles.emptyCtaTitle}>No players to show yet</Text>
                <Text style={sectionStyles.emptyCtaSub}>Visit the social tab to invite friends.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          )
        }
      />
    );
  }

  return (
    <PlayersNearYouRow
      filterByLevel={false}
      players={mapped}
      hideWhenEmpty={false}
      title={title}
    />
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Discover-tab variant — surfaces global discovery rails using the
 * country/worldwide scope from `DiscoverScopeProvider`. Order matches the
 * task #1034 spec: open lessons → open matches → public tournaments →
 * players you might know → recently active worldwide → public coaches.
 * Every rail observes the shared scope chip and ships a CTA-driven empty
 * state.
 */
export function DiscoverSections() {
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
        setCoords(null);
        setLocationError(true);
      })
      .finally(() => { fetchingRef.current = false; });
  }, []);

  useEffect(() => {
    if (permission?.granted && !coords && !locationError) {
      fetchCoords();
    }
  }, [permission?.granted, coords, locationError, fetchCoords]);

  return (
    <View style={sectionStyles.wrap}>
      <OpenLessonsRailDiscover navigation={navigation} />
      <OpenMatchesSection navigation={navigation} variant="discover" />
      <PublicTournamentsSection navigation={navigation} coords={coords} />
      <DiscoverPlayersRail kind="youMightKnow" />
      <DiscoverPlayersRail kind="recentlyActive" />
      <CoachesNearYouSection navigation={navigation} coords={coords} showLocalChip={false} />
    </View>
  );
}

export function FreePlayerDiscoverySections() {
  useThemeReactivity();
  const navigation = useNavigation<any>();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationError, setLocationError] = useState(false);
  const fetchingRef = useRef(false);

  const fetchCoords = React.useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLocationError(false);
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => {
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        setLocationError(false);
      })
      .catch(() => {
        // GPS off / timeout / provider error — surface an actionable retry banner.
        setCoords(null);
        setLocationError(true);
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, []);

  // Only fetch coords once permission is granted (request is user-initiated).
  useEffect(() => {
    if (permission?.granted && !coords && !locationError) {
      fetchCoords();
    }
  }, [permission?.granted, coords, locationError, fetchCoords]);

  const handleRequestPermission = async () => {
    try {
      await requestPermission();
    } catch {
      /* user cancelled */
    }
  };

  return (
    <View style={sectionStyles.wrap}>
      <NearbyAcademiesSection coords={coords} navigation={navigation} />
      <CoachesNearYouSection navigation={navigation} coords={coords} />
      <NearbyPlayersSection
        permission={permission}
        onRequestPermission={handleRequestPermission}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionStyles = makeReactiveStyles(() =>
  StyleSheet.create({
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
  }),
);

const permStyles = makeReactiveStyles(() =>
  StyleSheet.create({
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
  }),
);

const courtStyles = makeReactiveStyles(() =>
  StyleSheet.create({
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
  }),
);

const academyStyles = makeReactiveStyles(() =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    logoWrap: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.md,
      overflow: "hidden",
      backgroundColor: Colors.dark.chipBackgroundStrong,
    },
    logo: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.md,
    },
    logoFallback: {
      backgroundColor: Colors.dark.accentTextSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    logoInitial: {
      fontSize: 18,
      fontWeight: "800",
      color: Colors.dark.accentText,
    },
    sports: {
      fontSize: 11,
      color: Colors.dark.textMuted,
      fontWeight: "700",
      marginTop: 2,
      letterSpacing: 0.2,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
  }),
);

const joinStyles = makeReactiveStyles(() =>
  StyleSheet.create({
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
  }),
);
