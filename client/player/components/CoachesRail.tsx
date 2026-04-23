import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { apiFetch, buildPhotoUrl } from "@/lib/query-client";
import { usePlayerCountry } from "@/player/hooks/usePlayerCountry";
import {
  makeReactiveStyles,
  useThemeReactivity,
} from "@/hooks/useThemedStyles";

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

/**
 * Home-screen coaches rail. Shows publicly discoverable coaches the player
 * can browse and book a drop-in lesson with. Defaults to "My country" scope
 * when we know the player's country, otherwise falls back to worldwide.
 *
 * Tapping "See all" opens the full Coach Directory screen; tapping a card
 * opens that coach's public profile.
 */
export function CoachesRail() {
  useThemeReactivity();
  const navigation = useNavigation<any>();
  const { country: resolvedCountry, isResolving } = usePlayerCountry();
  const [scope, setScope] = useState<"country" | "global">("country");

  const { data, isLoading } = useQuery<{ coaches: PublicCoachEntry[] }>({
    queryKey: ["/api/coaches/directory", "home-rail", scope, resolvedCountry],
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

/** Soft "Join an academy" card rendered at the bottom of free-player Home. */
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

const sectionStyles = makeReactiveStyles(() =>
  StyleSheet.create({
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
