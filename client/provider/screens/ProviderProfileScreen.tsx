import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";

interface ProviderProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  specializations: string[];
  rating: string | null;
  totalBookings: number;
  isActive: boolean;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= Math.round(rating) ? "star" : "star-outline"}
          size={16}
          color={star <= Math.round(rating) ? "#FFD700" : Colors.dark.textSecondary}
        />
      ))}
      <Text style={styles.ratingText}>{Number(rating).toFixed(1)}</Text>
    </View>
  );
}

const SPECIALIZATION_ICONS: Record<string, string> = {
  stringing: "tennisball-outline",
  massage: "fitness-outline",
  "video-analysis": "videocam-outline",
  fitness: "barbell-outline",
  nutrition: "nutrition-outline",
  coaching: "school-outline",
};

export default function ProviderProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();

  const { data: provider, isLoading } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => signOut(),
      },
    ]);
  };

  const displayName = provider?.displayName ?? user?.name ?? "Provider";
  const photoUrl = provider?.profilePhotoUrl ?? null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <View style={styles.profileCard}>
            {photoUrl ? (
              <Image
                source={{
                  uri: photoUrl.startsWith("/")
                    ? getStaticAssetsUrl() + photoUrl
                    : photoUrl,
                }}
                style={styles.profilePhoto}
              />
            ) : (
              <View style={styles.profilePhotoPlaceholder}>
                <Ionicons name="person" size={40} color={Colors.dark.textSecondary} />
              </View>
            )}
            <Text style={styles.profileName}>{displayName}</Text>
            {provider?.rating ? (
              <StarRating rating={Number(provider.rating)} />
            ) : null}
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      provider?.isActive !== false
                        ? Colors.dark.primary
                        : Colors.dark.textSecondary,
                  },
                ]}
              />
              <Text style={styles.statusText}>
                {provider?.isActive !== false ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
        </Animated.View>

        {provider?.specializations && provider.specializations.length > 0 ? (
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SPECIALIZATIONS</Text>
              <View style={styles.specializationsRow}>
                {provider.specializations.map((spec) => (
                  <View key={spec} style={styles.specChip}>
                    <Ionicons
                      name={(SPECIALIZATION_ICONS[spec.toLowerCase()] as any) ?? "construct-outline"}
                      size={14}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.specChipText}>{spec}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        ) : null}

        {provider?.bio ? (
          <Animated.View entering={FadeInUp.delay(150).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>BIO</Text>
              <View style={styles.bioCard}>
                <Text style={styles.bioText}>{provider.bio}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(200).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STATS</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {provider?.totalBookings ?? 0}
                </Text>
                <Text style={styles.statLabel}>Total Bookings</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {provider?.rating ? Number(provider.rating).toFixed(1) : "—"}
                </Text>
                <Text style={styles.statLabel}>Avg Rating</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(250).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            <View style={styles.accountCard}>
              <View style={styles.accountRow}>
                <Ionicons name="person-outline" size={18} color={Colors.dark.textSecondary} />
                <Text style={styles.accountLabel}>Username</Text>
                <Text style={styles.accountValue}>{user?.username ?? "—"}</Text>
              </View>
              <View style={styles.accountDivider} />
              <View style={styles.accountRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.dark.textSecondary} />
                <Text style={styles.accountLabel}>Email</Text>
                <Text style={styles.accountValue}>{user?.email ?? "—"}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(300)}>
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  profileCard: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  profilePhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: Spacing.xs,
  },
  profilePhotoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  profileName: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  specializationsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  specChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
    textTransform: "capitalize",
  },
  bioCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  bioText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accountCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    overflow: "hidden",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  accountLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  accountValue: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
    maxWidth: 180,
  },
  accountDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.md,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.error + "30",
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.error,
  },
});
