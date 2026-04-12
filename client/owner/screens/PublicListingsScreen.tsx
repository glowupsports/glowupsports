import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { useCoach } from "@/coach/context/CoachContext";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";

const PUBLIC_GREEN = "#2ECC71";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PublicListing {
  id: string;
  title: string;
  isPublic: boolean;
  status: string;
  dayOfWeek: number;
  startTime: string;
  maxPlayers: number | null;
  price: number | null;
  sport: string | null;
  playerCount: number;
  dropInThisMonth: number;
  dropInRevenueThisMonth: number;
}

interface PublicListingsData {
  currency: string;
  listings: PublicListing[];
  summary: {
    totalPublic: number;
    totalPrivate: number;
    dropInBookingsThisMonth: number;
    dropInRevenueThisMonth: number;
  };
}

type FilterTab = "public" | "private";

export default function PublicListingsScreen() {
  const insets = useSafeAreaInsets();
  const { academy } = useCoach();
  const timezone = academy?.timezone || "Asia/Dubai";
  const navigation = useNavigation<NativeStackNavigationProp<OwnerStackParamList>>();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [activeTab, setActiveTab] = useState<FilterTab>("public");
  const [refreshing, setRefreshing] = useState(false);

  const SCOPE_KEY = "@play_scope";

  useEffect(() => {
    AsyncStorage.getItem(SCOPE_KEY).then(val => {
      if (val === "mine" || val === "all") setScope(val);
    }).catch(() => {});
  }, []);

  const handleScopeChange = (newScope: "mine" | "all") => {
    setScope(newScope);
    AsyncStorage.setItem(SCOPE_KEY, newScope).catch(() => {});
  };

  const { data, isLoading, refetch } = useQuery<PublicListingsData>({
    queryKey: ["/api/owner/public-listings", scope],
    queryFn: async () => {
      const url = new URL("/api/owner/public-listings", getApiUrl());
      url.searchParams.set("scope", scope);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch public listings");
      return res.json();
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const currency = data?.currency || "AED";
  const listings = data?.listings || [];
  const summary = data?.summary || {
    totalPublic: 0,
    totalPrivate: 0,
    dropInBookingsThisMonth: 0,
    dropInRevenueThisMonth: 0,
  };

  const publicListings = listings.filter(l => l.isPublic);
  const privateListings = listings.filter(l => !l.isPublic);
  const displayed = scope === "all" ? publicListings : (activeTab === "public" ? publicListings : privateListings);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PUBLIC_GREEN} />
        }
      >
        <Text style={styles.screenTitle}>Public Listings</Text>
        <Text style={styles.screenSubtitle}>Manage which groups are open for drop-in bookings</Text>

        {/* My Academy / Discover All Scope Toggle */}
        <View style={styles.scopeToggleRow}>
          <Pressable
            style={[styles.scopeToggleBtn, scope === "mine" && styles.scopeToggleBtnActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScopeChange("mine"); }}
          >
            <Text style={[styles.scopeToggleText, scope === "mine" && styles.scopeToggleTextActive]}>My Academy</Text>
          </Pressable>
          <Pressable
            style={[styles.scopeToggleBtn, scope === "all" && styles.scopeToggleBtnActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScopeChange("all"); }}
          >
            <Text style={[styles.scopeToggleText, scope === "all" && styles.scopeToggleTextActive]}>Discover All</Text>
          </Pressable>
        </View>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{summary.totalPublic}</Text>
              <Text style={styles.summaryLabel}>Public groups</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: Colors.dark.gold }]}>
                {summary.dropInBookingsThisMonth}
              </Text>
              <Text style={styles.summaryLabel}>Drop-ins this month</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: Colors.dark.primary }]}>
                {currency} {summary.dropInRevenueThisMonth.toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Drop-in revenue</Text>
            </View>
          </View>
        </View>

        {/* Tab Toggle (only for My Academy scope) */}
        {scope === "mine" ? (
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, activeTab === "public" && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("public");
            }}
          >
            <Ionicons
              name="globe-outline"
              size={14}
              color={activeTab === "public" ? PUBLIC_GREEN : Colors.dark.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "public" && styles.tabTextActive]}>
              Active ({publicListings.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "private" && styles.tabActivePrivate]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("private");
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={activeTab === "private" ? Colors.dark.textMuted : Colors.dark.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "private" && styles.tabTextPrivate]}>
              Inactive ({privateListings.length})
            </Text>
          </Pressable>
        </View>
        ) : null}

        {/* Listings */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PUBLIC_GREEN} />
            <Text style={styles.loadingText}>Loading listings...</Text>
          </View>
        ) : displayed.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name={activeTab === "public" ? "globe-outline" : "lock-closed-outline"}
              size={48}
              color={Colors.dark.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {activeTab === "public" ? "No public groups" : "No private groups"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "public"
                ? "Make a group public to allow drop-in bookings"
                : "All your groups are currently public"}
            </Text>
          </View>
        ) : (
          displayed.map(listing => (
            <ListingCard
              key={listing.id}
              listing={listing}
              currency={currency}
              timezone={timezone}
              isToggling={false}
              onToggle={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("ClassesManagement", { focusSeriesId: listing.id });
              }}
              onManage={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("ClassesManagement", { focusSeriesId: listing.id });
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ListingCard({
  listing,
  currency,
  timezone,
  isToggling,
  onToggle,
  onManage,
}: {
  listing: PublicListing;
  currency: string;
  timezone: string;
  isToggling: boolean;
  onToggle: () => void;
  onManage: () => void;
}) {
  const isFlexible = listing.dayOfWeek === -1;
  const dayName = isFlexible ? "Flexible" : DAY_NAMES[listing.dayOfWeek];
  const localTime = convertUTCTimeToLocal(listing.startTime, timezone);

  return (
    <View style={[styles.listingCard, CardStyles.elevated]}>
      <View style={styles.listingHeader}>
        <View style={styles.listingTitleRow}>
          <View style={[styles.statusDot, { backgroundColor: listing.isPublic ? PUBLIC_GREEN : Colors.dark.textMuted }]} />
          <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        </View>
        {listing.isPublic ? (
          <View style={styles.publicBadge}>
            <Ionicons name="globe" size={10} color={PUBLIC_GREEN} />
            <Text style={styles.publicBadgeText}>PUBLIC</Text>
          </View>
        ) : (
          <View style={styles.privateBadge}>
            <Ionicons name="lock-closed" size={10} color={Colors.dark.textMuted} />
            <Text style={styles.privateBadgeText}>PRIVATE</Text>
          </View>
        )}
      </View>

      <View style={styles.listingMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={13} color={Colors.dark.textMuted} />
          <Text style={styles.metaText}>{dayName} {localTime}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="people-outline" size={13} color={Colors.dark.textMuted} />
          <Text style={styles.metaText}>{listing.playerCount}/{listing.maxPlayers ?? "?"} spots</Text>
        </View>
      </View>

      {listing.isPublic ? (
        <View style={styles.listingStats}>
          <View style={styles.statChip}>
            <Text style={styles.statChipLabel}>Drop-in price</Text>
            <Text style={styles.statChipValue}>
              {listing.price != null && listing.price > 0 ? `${currency} ${listing.price}/session` : "Free"}
            </Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipLabel}>This month</Text>
            <Text style={[styles.statChipValue, { color: Colors.dark.gold }]}>
              {listing.dropInThisMonth} bookings
            </Text>
          </View>
          {listing.dropInRevenueThisMonth > 0 ? (
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>Revenue</Text>
              <Text style={[styles.statChipValue, { color: Colors.dark.primary }]}>
                {currency} {listing.dropInRevenueThisMonth.toLocaleString()}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          style={styles.manageButton}
          onPress={onManage}
        >
          <Ionicons name="settings-outline" size={13} color={Colors.dark.textMuted} />
          <Text style={styles.manageButtonText}>Manage</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, listing.isPublic ? styles.makePrivateBtn : styles.makePublicBtn]}
          onPress={onToggle}
          disabled={isToggling}
        >
          <Ionicons
            name={listing.isPublic ? "lock-closed-outline" : "globe-outline"}
            size={14}
            color={listing.isPublic ? Colors.dark.textMuted : PUBLIC_GREEN}
          />
          <Text style={[styles.actionButtonText, listing.isPublic ? styles.makePrivateText : styles.makePublicText]}>
            {listing.isPublic ? "Make Private" : "Make Public"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    padding: Spacing.lg,
  },
  screenTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  screenSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${PUBLIC_GREEN}22`,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.dark.border,
  },
  summaryValue: {
    ...Typography.h3,
    color: PUBLIC_GREEN,
    fontWeight: "700",
    fontSize: 18,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: 2,
    fontSize: 10,
  },
  scopeToggleRow: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  scopeToggleBtn: {
    flex: 1,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  scopeToggleBtnActive: {
    backgroundColor: `${PUBLIC_GREEN}25`,
  },
  scopeToggleText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  scopeToggleTextActive: {
    color: PUBLIC_GREEN,
    fontWeight: "700",
  },
  tabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tabActive: {
    backgroundColor: `${PUBLIC_GREEN}15`,
    borderColor: `${PUBLIC_GREEN}50`,
  },
  tabActivePrivate: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderColor: Colors.dark.border,
  },
  tabText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: PUBLIC_GREEN,
    fontWeight: "600",
  },
  tabTextPrivate: {
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.textSecondary,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  listingCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.cardElevated,
  },
  listingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  listingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listingTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${PUBLIC_GREEN}18`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  publicBadgeText: {
    ...Typography.caption,
    color: PUBLIC_GREEN,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  privateBadgeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  listingMeta: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  listingStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statChipLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  statChipValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  manageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  manageButtonText: {
    ...Typography.caption,
    fontWeight: "600",
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  actionButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  makePublicBtn: {
    backgroundColor: `${PUBLIC_GREEN}12`,
    borderColor: `${PUBLIC_GREEN}40`,
  },
  makePrivateBtn: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderColor: Colors.dark.border,
  },
  actionButtonText: {
    ...Typography.caption,
    fontWeight: "600",
    fontSize: 13,
  },
  makePublicText: {
    color: PUBLIC_GREEN,
  },
  makePrivateText: {
    color: Colors.dark.textMuted,
  },
});
