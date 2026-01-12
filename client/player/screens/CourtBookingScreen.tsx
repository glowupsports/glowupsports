import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { LockedScreen } from "../components/LockedScreen";

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;

interface Court {
  id: string;
  name: string;
  surface?: string;
  visibility?: string;
  pricePerHour?: string;
  memberPricePerHour?: string;
  currency?: string;
  photoUrl?: string;
  description?: string;
  isActive?: boolean;
  academy?: {
    id: string;
    name: string;
    logoUrl?: string;
  };
  location?: {
    id: string;
    name: string;
    address?: string;
  };
  canBook?: boolean;
}

const SURFACE_OPTIONS = ["all", "hard", "clay", "grass", "indoor"];

export default function CourtBookingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSurface, setSelectedSurface] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  const searchParams = new URLSearchParams();
  if (selectedSurface !== "all") searchParams.set("surface", selectedSurface);
  if (selectedDate) searchParams.set("date", selectedDate);
  const searchUrl = `/api/courts/search${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const { data: courts = [], isLoading, isError } = useQuery<Court[]>({
    queryKey: [searchUrl],
  });

  const filteredCourts = useMemo(() => {
    if (!searchQuery.trim()) return courts;
    const query = searchQuery.toLowerCase();
    return courts.filter(court => 
      court.name.toLowerCase().includes(query) ||
      court.academy?.name.toLowerCase().includes(query) ||
      court.location?.name?.toLowerCase().includes(query)
    );
  }, [courts, searchQuery]);

  const formatPrice = (price: string | undefined, currency: string = "AED") => {
    if (!price || parseFloat(price) === 0) return "Free";
    return `${currency} ${parseFloat(price).toFixed(0)}/hr`;
  };

  const getSurfaceIcon = (surface?: string) => {
    switch (surface) {
      case "clay": return "leaf-outline";
      case "grass": return "golf-outline";
      case "indoor": return "home-outline";
      default: return "tennisball-outline";
    }
  };

  const getSurfaceColor = (surface?: string) => {
    switch (surface) {
      case "clay": return "#E07B39";
      case "grass": return "#4CAF50";
      case "indoor": return "#9575CD";
      default: return Colors.dark.xpCyan;
    }
  };

  const handleCourtPress = (court: Court) => {
    navigation.navigate("CourtDetail", { courtId: court.id, date: selectedDate });
  };

  const getDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        value: date.toISOString().split("T")[0],
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        short: date.toLocaleDateString("en-US", { weekday: "short" }),
        day: date.getDate(),
      });
    }
    return dates;
  };

  const dateOptions = getDateOptions();

  return (
    <LockedScreen featureKey="court_booking">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Book a Court</Text>
          <View style={styles.headerSpacer} />
        </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={20} color={Colors.dark.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search courts, academies..."
            placeholderTextColor={Colors.dark.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.dateContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {dateOptions.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.dateChip,
                selectedDate === option.value && styles.dateChipActive,
              ]}
              onPress={() => setSelectedDate(option.value)}
            >
              <Text style={[
                styles.dateShort,
                selectedDate === option.value && styles.dateTextActive,
              ]}>
                {option.short}
              </Text>
              <Text style={[
                styles.dateDay,
                selectedDate === option.value && styles.dateTextActive,
              ]}>
                {option.day}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {SURFACE_OPTIONS.map((surface) => (
            <Pressable
              key={surface}
              style={[
                styles.filterChip,
                selectedSurface === surface && styles.filterChipActive,
              ]}
              onPress={() => setSelectedSurface(surface)}
            >
              <Ionicons 
                name={surface === "all" ? "grid-outline" : getSurfaceIcon(surface)} 
                size={16} 
                color={selectedSurface === surface ? Colors.dark.backgroundRoot : Colors.dark.text} 
              />
              <Text style={[
                styles.filterText,
                selectedSurface === surface && styles.filterTextActive,
              ]}>
                {surface.charAt(0).toUpperCase() + surface.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.courtsList} 
        contentContainerStyle={[styles.courtsListContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
            <Text style={styles.loadingText}>Finding available courts...</Text>
          </View>
        ) : isError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentError} />
            <Text style={styles.errorText}>Failed to load courts</Text>
            <Text style={styles.errorSubtext}>Please check your connection and try again</Text>
          </View>
        ) : filteredCourts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="tennisball-outline" size={48} color={Colors.dark.textSecondary} />
            <Text style={styles.emptyText}>No courts available</Text>
            <Text style={styles.emptySubtext}>Try adjusting your filters or check back later</Text>
          </View>
        ) : (
          filteredCourts.map((court) => (
            <Pressable
              key={court.id}
              style={styles.courtCard}
              onPress={() => handleCourtPress(court)}
            >
              <View style={styles.courtHeader}>
                <View style={[styles.surfaceTag, { backgroundColor: getSurfaceColor(court.surface) + "20" }]}>
                  <Ionicons name={getSurfaceIcon(court.surface)} size={14} color={getSurfaceColor(court.surface)} />
                  <Text style={[styles.surfaceText, { color: getSurfaceColor(court.surface) }]}>
                    {court.surface?.charAt(0).toUpperCase() + (court.surface?.slice(1) || "Hard")}
                  </Text>
                </View>
                <Text style={styles.courtPrice}>
                  {formatPrice(court.pricePerHour, court.currency)}
                </Text>
              </View>

              <Text style={styles.courtName}>{court.name}</Text>
              
              {court.academy && (
                <View style={styles.academyRow}>
                  <Ionicons name="business-outline" size={14} color={Colors.dark.textSecondary} />
                  <Text style={styles.academyName}>{court.academy.name}</Text>
                </View>
              )}

              {court.location && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color={Colors.dark.textSecondary} />
                  <Text style={styles.locationText}>{court.location.name}</Text>
                </View>
              )}

              {court.description && (
                <Text style={styles.courtDescription} numberOfLines={2}>
                  {court.description}
                </Text>
              )}

              <View style={styles.courtFooter}>
                <View style={styles.availabilityBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                  <Text style={styles.availabilityText}>Available</Text>
                </View>
                {court.canBook !== false && (
                  <View style={styles.bookButton}>
                    <Text style={styles.bookButtonText}>View Slots</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.dark.xpCyan} />
                  </View>
                )}
              </View>
            </Pressable>
          ))
        )}
        </ScrollView>
      </View>
    </LockedScreen>
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
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 16,
  },
  dateContainer: {
    marginBottom: Spacing.sm,
  },
  dateScroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  dateChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    minWidth: 56,
  },
  dateChipActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  dateShort: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  dateDay: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  filterContainer: {
    marginBottom: Spacing.md,
  },
  filterScroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  filterText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  filterTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  courtsList: {
    flex: 1,
  },
  courtsListContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.sm,
  },
  errorText: {
    color: Colors.dark.accentError,
    fontSize: 16,
    fontWeight: "600",
  },
  errorSubtext: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  courtCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  courtHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  surfaceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  surfaceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  courtPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  courtName: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  academyName: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  locationText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  courtDescription: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  courtFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  availabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  availabilityText: {
    fontSize: 12,
    color: Colors.dark.successNeon,
    fontWeight: "500",
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
});
