import React from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking, Platform, Image as RNImage } from "react-native";
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
  averageRating?: number;
  reviewsCount?: number;
  profilePhotoUrl?: string | null;
}

export default function PlayerCoachProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { coachId } = route.params || {};

  const { data: coach, isLoading } = useQuery<CoachDetails>({
    queryKey: ["/api/player/coach", coachId],
    enabled: !!coachId,
  });

  const handleBack = () => {
    navigation.goBack();
  };

  const handleContact = () => {
    if (coach?.email) {
      Linking.openURL(`mailto:${coach.email}`);
    }
  };

  const handleCall = () => {
    if (coach?.phone && Platform.OS !== "web") {
      Linking.openURL(`tel:${coach.phone}`);
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

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Coach Profile</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          {coach.profilePhotoUrl ? (
            Platform.OS === 'web' ? (
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
          {coach.averageRating ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color={Colors.dark.accentWarning} />
              <ThemedText style={styles.rating}>
                {coach.averageRating.toFixed(1)} ({coach.reviewsCount || 0} reviews)
              </ThemedText>
            </View>
          ) : null}
        </View>

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
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  rating: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
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
});
