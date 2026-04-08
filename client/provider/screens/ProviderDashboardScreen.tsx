import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  Image,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  FadeInUp,
  FadeOutDown,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode, getDefaultModeForRole } from "@/context/AppModeContext";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, buildPhotoUrl, apiRequest } from "@/lib/query-client";
import {
  getPrimarySpecialization,
  PROVIDER_SPECIALIZATIONS,
  ProviderSpecialization,
} from "@/provider/constants/specializations";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  totalAmount: string;
  items: Array<{
    id: string;
    name: string;
    service?: { id: string; name: string; iconName: string; durationMinutes: number | null };
  }>;
  player?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
  } | null;
}

interface ProviderProfile {
  id: string;
  displayName: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  specializations: string[];
  rating: string | null;
  totalBookings: number;
  isOnboarded: boolean;
}

interface ProviderStats {
  xp: number;
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNextLevel: number;
  streakCurrent: number;
  streakBest: number;
  badges: string[];
  totalBookings: number;
  rating: number;
}

interface ToastData {
  message: string;
  subtext?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  confirmed: Colors.dark.primary,
  completed: Colors.dark.textSecondary,
  cancelled: Colors.dark.error,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Done",
  cancelled: "Cancelled",
};

const BADGE_LABELS: Record<string, string> = {
  first_job: "First Job",
  ten_bookings: "Getting Started",
  century: "Century Club",
  five_star: "5-Star Pro",
  streak_7: "On Fire",
  streak_30: "Unstoppable",
  leveled_up: "Level Up",
};

function formatTime(iso: string | null): string {
  if (!iso) return "No time set";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isThisWeek(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function PlayerAvatar({ uri, size }: { uri: string | null; size: number }) {
  if (!uri) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.dark.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="person" size={size * 0.5} color={Colors.dark.textSecondary} />
      </View>
    );
  }
  const fullUri = buildPhotoUrl(uri) || uri;
  return <Image source={{ uri: fullUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

function AchievementToast({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutDown.duration(250)}
      style={styles.toast}
    >
      <View style={[styles.toastIconBox, { backgroundColor: data.iconColor + "20" }]}>
        <Ionicons name={data.icon} size={22} color={data.iconColor} />
      </View>
      <View style={styles.toastBody}>
        <Text style={styles.toastMessage}>{data.message}</Text>
        {data.subtext ? <Text style={styles.toastSubtext}>{data.subtext}</Text> : null}
      </View>
    </Animated.View>
  );
}

function XPBar({ xpInLevel, xpToNextLevel, level, rank, color }: {
  xpInLevel: number;
  xpToNextLevel: number;
  level: number;
  rank: string;
  color: string;
}) {
  const progress = useSharedValue(0);
  const total = xpInLevel + xpToNextLevel;
  const ratio = total > 0 ? xpInLevel / total : 1;

  useEffect(() => {
    progress.value = withSpring(ratio, { damping: 20, stiffness: 90 });
  }, [ratio]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(progress.value * 100, 100)}%` as `${number}%`,
  }));

  return (
    <View style={styles.xpBarSection}>
      <View style={styles.xpBarHeader}>
        <View style={[styles.levelBadgePill, { backgroundColor: color + "25" }]}>
          <Text style={[styles.levelBadgePillText, { color }]}>Lv.{level}</Text>
        </View>
        <Text style={styles.rankLabel}>{rank}</Text>
        <Text style={styles.xpNumbers}>
          {xpToNextLevel > 0 ? `${xpInLevel} / ${xpInLevel + xpToNextLevel} XP` : `${xpInLevel} XP · MAX`}
        </Text>
      </View>
      <View style={styles.xpBarTrack}>
        <Animated.View style={[styles.xpBarFill, { backgroundColor: color }, barStyle]} />
      </View>
    </View>
  );
}

function ActionCard({
  booking,
  onConfirm,
  onDecline,
  onPress,
  onClientPress,
  isUpdating,
  hasClientData,
}: {
  booking: Booking;
  onConfirm: () => void;
  onDecline: () => void;
  onPress: () => void;
  onClientPress?: () => void;
  isUpdating: boolean;
  hasClientData: boolean;
}) {
  const serviceName = booking.items?.[0]?.service?.name ?? booking.items?.[0]?.name ?? "Service Booking";
  const rawIcon = booking.items?.[0]?.service?.iconName;
  const serviceIcon: keyof typeof Ionicons.glyphMap = (rawIcon && rawIcon in Ionicons.glyphMap)
    ? (rawIcon as keyof typeof Ionicons.glyphMap)
    : "build-outline";
  return (
    <Pressable style={styles.actionCard} onPress={onPress}>
      <View style={styles.actionCardTop}>
        <Pressable
          style={styles.actionAvatarContainer}
          onPress={hasClientData && onClientPress ? onClientPress : undefined}
          hitSlop={6}
        >
          <PlayerAvatar uri={booking.player?.profilePhotoUrl ?? null} size={36} />
          {booking.player?.level ? (
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{booking.player.level}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.actionCardInfo}>
          <Pressable
            style={styles.actionNameRow}
            onPress={hasClientData && onClientPress ? onClientPress : undefined}
          >
            <Text style={styles.actionCardPlayer} numberOfLines={1}>
              {booking.player?.name ?? "Unknown Player"}
            </Text>
            {hasClientData ? (
              <Ionicons name="document-text-outline" size={12} color={Colors.dark.primary} />
            ) : null}
          </Pressable>
          <View style={styles.actionServiceRow}>
            <Ionicons name={serviceIcon} size={11} color={Colors.dark.textSecondary} />
            <Text style={styles.actionCardService} numberOfLines={1}>{serviceName}</Text>
          </View>
        </View>
        <View style={styles.actionCardTime}>
          <Ionicons name="time-outline" size={12} color={Colors.dark.textSecondary} />
          <Text style={styles.actionCardTimeText}>{formatTime(booking.scheduledAt)}</Text>
        </View>
      </View>
      <View style={styles.actionButtons}>
        <Pressable
          style={[styles.actionBtn, styles.declineBtn, isUpdating && { opacity: 0.5 }]}
          onPress={onDecline}
          disabled={isUpdating}
        >
          <Text style={styles.declineBtnText}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.confirmBtn, isUpdating && { opacity: 0.5 }]}
          onPress={onConfirm}
          disabled={isUpdating}
        >
          <Text style={styles.confirmBtnText}>Confirm</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function ScheduleRow({ booking, onPress, onClientPress, hasClientData }: { booking: Booking; onPress: () => void; onClientPress?: () => void; hasClientData: boolean }) {
  const serviceName = booking.items?.[0]?.service?.name ?? booking.items?.[0]?.name ?? "Service";
  const rawScheduleIcon = booking.items?.[0]?.service?.iconName;
  const serviceIcon: keyof typeof Ionicons.glyphMap = (rawScheduleIcon && rawScheduleIcon in Ionicons.glyphMap)
    ? (rawScheduleIcon as keyof typeof Ionicons.glyphMap)
    : "build-outline";
  const statusColor = STATUS_COLORS[booking.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
  return (
    <Pressable style={styles.scheduleRow} onPress={onPress}>
      <View style={styles.timeCol}>
        <Text style={styles.scheduleTime}>{formatTime(booking.scheduledAt)}</Text>
      </View>
      <View style={[styles.scheduleBar, { backgroundColor: statusColor }]} />
      <View style={styles.scheduleBody}>
        <View style={styles.scheduleNameRow}>
          <Ionicons name={serviceIcon} size={13} color={Colors.dark.textSecondary} />
          <Text style={styles.scheduleName} numberOfLines={1}>{serviceName}</Text>
        </View>
        {booking.player ? (
          <Pressable
            style={styles.schedulePlayerRow}
            onPress={hasClientData && onClientPress ? onClientPress : undefined}
            hitSlop={4}
          >
            <PlayerAvatar uri={booking.player.profilePhotoUrl} size={16} />
            <Text style={styles.schedulePlayerName} numberOfLines={1}>{booking.player.name}</Text>
            {hasClientData ? (
              <Ionicons name="document-text-outline" size={11} color={Colors.dark.primary} />
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
    </Pressable>
  );
}

export default function ProviderDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { setMode } = useAppMode();
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const pendingPulse = useSharedValue(1);
  const pendingAnimStyle = useAnimatedStyle(() => ({ opacity: pendingPulse.value }));
  const streakFlame = useSharedValue(1);
  const streakFlameStyle = useAnimatedStyle(() => ({ transform: [{ scale: streakFlame.value }] }));

  const { data: profile, error: profileError } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const { data: stats } = useQuery<ProviderStats>({
    queryKey: ["/api/provider/stats"],
  });

  const { data: todayBookings = [], isLoading: loadingToday, refetch: refetchToday, error: todayError } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings", { date: "today" }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/provider/me/bookings?date=today");
      return res.json();
    },
  });

  const { data: allBookings = [], isLoading: loadingAll, refetch: refetchAll, error: allBookingsError } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const { data: clientList = [] } = useQuery<Array<{ player: { id: string }; notesCount: number; preferences: Record<string, unknown> }>>({
    queryKey: ["/api/provider/clients"],
  });

  const clientDataMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of clientList) {
      const hasData = c.notesCount > 0 || Object.keys(c.preferences ?? {}).length > 0;
      if (hasData) m.set(c.player.id, true);
    }
    return m;
  }, [clientList]);

  const isLoading = loadingToday || loadingAll;
  const refetch = () => { refetchToday(); refetchAll(); };

  const isPlatformOwner = user?.role === "platform_owner";
  const hasApiError = !isLoading && (profileError || todayError || allBookingsError);
  const is403Error = hasApiError && [profileError, todayError, allBookingsError].some(
    (e) => (e as Error)?.message?.startsWith("403")
  );

  if (hasApiError && !profile) {
    return (
      <View style={[styles.container, styles.errorContainer, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.errorCard}>
          <Ionicons name="warning-outline" size={40} color={Colors.dark.error} />
          <Text style={styles.errorTitle}>
            {is403Error ? "Access Restricted" : "Something went wrong"}
          </Text>
          <Text style={styles.errorMessage}>
            {is403Error
              ? "Your account does not have service provider access."
              : "Unable to load provider dashboard. Please try again."}
          </Text>
          {isPlatformOwner ? (
            <Pressable
              style={styles.errorButton}
              onPress={() => setMode(getDefaultModeForRole("platform_owner"))}
            >
              <Ionicons name="grid-outline" size={16} color={Colors.dark.buttonText} />
              <Text style={styles.errorButtonText}>Switch to Platform Mode</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.errorButton, styles.errorRetryButton]}
              onPress={refetch}
            >
              <Ionicons name="refresh-outline" size={16} color={Colors.dark.primary} />
              <Text style={[styles.errorButtonText, { color: Colors.dark.primary }]}>Try Again</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const pendingBookings = useMemo(() => allBookings.filter((b) => b.status === "pending"), [allBookings]);
  const weekTotal = useMemo(() => allBookings.filter((b) => isThisWeek(b.scheduledAt)).length, [allBookings]);
  const rating = Number(profile?.rating ?? 0);

  const primary = getPrimarySpecialization(profile?.specializations ?? []);
  const extraSpecs = (profile?.specializations ?? []).length - 1;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const firstName = profile?.displayName?.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "Provider";

  const showToast = (data: ToastData) => {
    setToast(data);
  };

  const updateBookingStatus = async (orderId: string, status: "confirmed" | "cancelled" | "completed") => {
    setUpdatingId(orderId);
    try {
      const res = await apiRequest("PATCH", `/api/provider/bookings/${orderId}/status`, { status });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      await queryClient.invalidateQueries({ queryKey: ["/api/provider/me/bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });

      if (status === "completed") {
        if (data.leveledUp) {
          showToast({
            message: `Level Up! You're now Lv.${data.newLevel}`,
            subtext: data.xpAwarded ? `+${data.xpAwarded} XP earned` : undefined,
            icon: "trending-up",
            iconColor: Colors.dark.primary,
          });
        } else if (data.newBadges && data.newBadges.length > 0) {
          const badgeLabel = BADGE_LABELS[data.newBadges[0]] ?? data.newBadges[0];
          showToast({
            message: `Achievement Unlocked: ${badgeLabel}`,
            subtext: data.xpAwarded ? `+${data.xpAwarded} XP earned` : undefined,
            icon: "ribbon",
            iconColor: "#FFD700",
          });
        } else if (data.xpAwarded && data.xpAwarded > 0) {
          showToast({
            message: `+${data.xpAwarded} XP earned`,
            subtext: "Keep it up!",
            icon: "flash",
            iconColor: Colors.dark.primary,
          });
        }
      }
    } catch {
      Alert.alert("Error", "Could not update booking. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDecline = (booking: Booking) => {
    Alert.alert(
      "Decline Booking",
      `Are you sure you want to decline this booking from ${booking.player?.name ?? "this player"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => updateBookingStatus(booking.id, "cancelled"),
        },
      ]
    );
  };

  const sortedToday = useMemo(
    () =>
      [...todayBookings].sort((a, b) => {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }),
    [todayBookings]
  );

  useEffect(() => {
    if (pendingBookings.length > 0) {
      pendingPulse.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        false
      );
    } else {
      pendingPulse.value = withTiming(1, { duration: 200 });
    }
  }, [pendingBookings.length]);

  useEffect(() => {
    if ((stats?.streakCurrent ?? 0) > 7) {
      streakFlame.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      streakFlame.value = withTiming(1, { duration: 200 });
    }
  }, [stats?.streakCurrent]);

  const profilePhotoUri = buildPhotoUrl(profile?.profilePhotoUrl) || null;

  const streakCurrent = stats?.streakCurrent ?? 0;
  const streakBest = stats?.streakBest ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.dark.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(0).duration(350)}>
          <View style={styles.careerCard}>
            <View style={styles.careerLeft}>
              {profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={styles.careerAvatar} />
              ) : (
                <View style={[styles.careerAvatarPlaceholder, { backgroundColor: primary.color + "20" }]}>
                  <Ionicons name={primary.icon} size={28} color={primary.color} />
                </View>
              )}
            </View>
            <View style={styles.careerBody}>
              <Text style={styles.careerGreeting}>{greeting},</Text>
              <Text style={styles.careerName} numberOfLines={1}>{firstName}</Text>
              <View style={styles.careerSpecRow}>
                <View style={[styles.specBadge, { backgroundColor: primary.color + "20" }]}>
                  <Ionicons name={primary.icon} size={12} color={primary.color} />
                  <Text style={[styles.specBadgeText, { color: primary.color }]}>{primary.label}</Text>
                </View>
                {extraSpecs > 0 ? (
                  <View style={styles.extraSpecsPill}>
                    <Text style={styles.extraSpecsText}>+{extraSpecs} more</Text>
                  </View>
                ) : null}
                {stats ? (
                  <View style={styles.rankPill}>
                    <Text style={styles.rankPillText}>{stats.rank}</Text>
                  </View>
                ) : null}
              </View>
              {rating > 0 ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                  <Text style={styles.totalBookingsText}>· {profile?.totalBookings ?? 0} bookings</Text>
                </View>
              ) : null}
              <Text style={styles.greetingSuffix}>{primary.greetingSuffix}</Text>

              {stats ? (
                <XPBar
                  xpInLevel={stats.xpInLevel}
                  xpToNextLevel={stats.xpToNextLevel}
                  level={stats.level}
                  rank={stats.rank}
                  color={primary.color}
                />
              ) : null}

              {streakCurrent > 0 ? (
                <View style={styles.streakPill}>
                  <Ionicons name="flame" size={13} color="#FF8C00" />
                  <Text style={styles.streakPillText}>{streakCurrent}-day streak</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayBookings.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <Animated.View
            style={[
              styles.statCard,
              pendingBookings.length > 0 && styles.statCardWarning,
              pendingBookings.length > 0 && pendingAnimStyle,
            ]}
          >
            <Text style={[styles.statValue, pendingBookings.length > 0 && styles.statValueWarning]}>
              {pendingBookings.length}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </Animated.View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{weekTotal}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {rating > 0 ? rating.toFixed(1) : "—"}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </Animated.View>

        {streakCurrent > 0 ? (
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <View style={styles.streakBanner}>
              <Animated.View style={streakFlameStyle}>
                <Ionicons name="flame" size={20} color="#FF8C00" />
              </Animated.View>
              <View style={styles.streakBannerBody}>
                <Text style={styles.streakBannerTitle}>{streakCurrent} days in a row</Text>
                <Text style={styles.streakBannerSub}>Best: {streakBest} days · Keep it going!</Text>
              </View>
              {streakCurrent >= 7 ? (
                <View style={styles.streakHotPill}>
                  <Text style={styles.streakHotText}>HOT</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {pendingBookings.length > 0 ? (
          <Animated.View entering={FadeInUp.delay(140).duration(300)}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flash" size={14} color="#FFD700" />
              <Text style={[styles.sectionTitle, { color: "#FFD700" }]}>NEEDS ACTION</Text>
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>{pendingBookings.length}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionCardsScroll}
            >
              {pendingBookings.map((booking) => (
                <ActionCard
                  key={booking.id}
                  booking={booking}
                  isUpdating={updatingId === booking.id}
                  hasClientData={Boolean(booking.player?.id && clientDataMap.get(booking.player.id))}
                  onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: booking.id })}
                  onClientPress={booking.player?.id ? () => navigation.navigate("ProviderClientDetail", { playerId: booking.player!.id }) : undefined}
                  onConfirm={() => updateBookingStatus(booking.id, "confirmed")}
                  onDecline={() => handleDecline(booking)}
                />
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(200).duration(300)}>
          <View style={styles.sectionHeader}>
            <Ionicons name="today-outline" size={14} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>TODAY'S SCHEDULE</Text>
          </View>

          {sortedToday.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: primary.color + "15" }]}>
                <Ionicons name={primary.icon} size={32} color={primary.color} />
              </View>
              <Text style={styles.emptyTitle}>All clear today</Text>
              <Text style={styles.emptySubtitle}>{primary.emptySchedule}</Text>
            </View>
          ) : (
            sortedToday.map((booking) => (
              <ScheduleRow
                key={booking.id}
                booking={booking}
                hasClientData={Boolean(booking.player?.id && clientDataMap.get(booking.player.id))}
                onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: booking.id })}
                onClientPress={booking.player?.id ? () => navigation.navigate("ProviderClientDetail", { playerId: booking.player!.id }) : undefined}
              />
            ))
          )}
        </Animated.View>
      </ScrollView>

      {toast ? (
        <View style={[styles.toastContainer, { bottom: insets.bottom + 100 }]}>
          <AchievementToast data={toast} onDismiss={() => setToast(null)} />
        </View>
      ) : null}
      <CollapsibleModeSwitcher />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  careerCard: {
    flexDirection: "row",
    backgroundColor: "#0F141B",
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  careerLeft: { justifyContent: "center" },
  careerAvatar: { width: 64, height: 64, borderRadius: 32 },
  careerAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  careerBody: { flex: 1, gap: 5 },
  careerGreeting: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "500" },
  careerName: { fontSize: 20, fontWeight: "800", color: Colors.dark.text, lineHeight: 24 },
  careerSpecRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  specBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  specBadgeText: { fontSize: 11, fontWeight: "700" },
  extraSpecsPill: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  extraSpecsText: { fontSize: 10, color: Colors.dark.textSecondary, fontWeight: "600" },
  rankPill: {
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  rankPillText: { fontSize: 10, fontWeight: "700", color: Colors.dark.primary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 13, fontWeight: "700", color: "#FFD700" },
  totalBookingsText: { fontSize: 12, color: Colors.dark.textSecondary },
  greetingSuffix: { fontSize: 12, color: Colors.dark.textSecondary },

  xpBarSection: { marginTop: 4, gap: 5 },
  xpBarHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  levelBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  levelBadgePillText: { fontSize: 11, fontWeight: "800" },
  rankLabel: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1, fontWeight: "600" },
  xpNumbers: { fontSize: 10, color: Colors.dark.textSecondary },
  xpBarTrack: {
    height: 5,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  xpBarFill: { height: 5, borderRadius: 3 },

  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#FF8C0015",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF8C0030",
  },
  streakPillText: { fontSize: 11, fontWeight: "700", color: "#FF8C00" },

  streakBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FF8C001A",
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "#FF8C0030",
  },
  streakBannerBody: { flex: 1 },
  streakBannerTitle: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  streakBannerSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  streakHotPill: {
    backgroundColor: "#FF8C00",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  streakHotText: { fontSize: 9, fontWeight: "800", color: "#fff" },

  statsRow: { flexDirection: "row", gap: Spacing.xs, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statCardWarning: {
    backgroundColor: "#FFD700" + "15",
    borderWidth: 1,
    borderColor: "#FFD700" + "30",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
  statValueWarning: { color: "#FFD700" },
  statLabel: {
    fontSize: 9,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    flex: 1,
  },
  urgentBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  urgentBadgeText: { fontSize: 10, fontWeight: "800", color: Colors.dark.buttonText },
  actionCardsScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
    marginBottom: Spacing.md,
  },
  actionCard: {
    width: 260,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "#FFD700" + "30",
  },
  actionCardTop: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  actionAvatarContainer: { position: "relative" },
  levelBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    backgroundColor: Colors.dark.primary,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  levelBadgeText: { fontSize: 9, fontWeight: "800", color: Colors.dark.buttonText },
  actionCardInfo: { flex: 1, gap: 2 },
  actionNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCardPlayer: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, flex: 1 },
  actionServiceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionCardService: { fontSize: 12, color: Colors.dark.textSecondary },
  actionCardTime: { flexDirection: "row", alignItems: "center", gap: 3 },
  actionCardTimeText: { fontSize: 11, color: Colors.dark.textSecondary },
  actionButtons: { flexDirection: "row", gap: Spacing.sm },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  confirmBtn: { backgroundColor: Colors.dark.primary },
  confirmBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.buttonText },
  declineBtn: {
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  declineBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.error },

  emptyState: { alignItems: "center", paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  emptySubtitle: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },

  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  timeCol: { width: 56, alignItems: "center" },
  scheduleTime: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary, textAlign: "center" },
  scheduleBar: { width: 3, height: 40, borderRadius: 2 },
  scheduleBody: { flex: 1, gap: 4 },
  scheduleNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  scheduleName: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  schedulePlayerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  schedulePlayerName: { fontSize: 12, color: Colors.dark.textSecondary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "600" },

  toastContainer: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toastBody: { flex: 1 },
  toastMessage: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  toastSubtext: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },

  errorContainer: { alignItems: "center", justifyContent: "center" },
  errorCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginHorizontal: Spacing.lg,
    maxWidth: 360,
    width: "100%",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  errorButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 12,
    marginTop: Spacing.xs,
  },
  errorRetryButton: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  errorButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
