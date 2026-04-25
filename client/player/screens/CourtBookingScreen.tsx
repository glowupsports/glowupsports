import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Animated,
  Dimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Backgrounds, TextColors } from "@/constants/theme";
import type { ScheduleStackParamList } from "@/player/navigation/PlayerNavigator";
import { LockedScreen } from "../components/LockedScreen";
import { getApiUrl, apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type NavigationProp = NativeStackNavigationProp<ScheduleStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Court {
  id: string;
  name: string;
  surface?: string;
  visibility?: string;
  pricePerHour?: string;
  memberPricePerHour?: string;
  currency?: string;
  creditsPerHour?: number;
  peakCreditsPerHour?: number;
  memberCreditsPerHour?: number;
  photoUrl?: string;
  description?: string;
  isActive?: boolean;
  xpRewardPerHour?: number;
  academy?: {
    id: string;
    name: string;
    logoUrl?: string;
  };
  location?: {
    id: string;
    name: string;
    address?: string;
    googlePlaceId?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  canBook?: boolean;
  bookingEnabled?: boolean;
  nextAvailableSlots?: string[];
  totalAvailableSlots?: number;
  hasAvailability?: boolean;
}

const SURFACE_CONFIG = {
  all: { icon: "apps", color: Colors.dark.primary, label: "All", gradient: ["#00D4FF20", "#00D4FF05"] },
  hard: { icon: "tennisball", color: "#00D4FF", label: "Hard", gradient: ["#00D4FF30", "#00D4FF10"] },
  clay: { icon: "leaf", color: "#E07B39", label: "Clay", gradient: ["#E07B3930", "#E07B3910"] },
  grass: { icon: "golf", color: "#4CAF50", label: "Grass", gradient: ["#4CAF5030", "#4CAF5010"] },
  indoor: { icon: "home", color: "#9575CD", label: "Indoor", gradient: ["#9575CD30", "#9575CD10"] },
} as const;

function PulsingDot({ color }: { color: string }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[styles.pulseOuter, { backgroundColor: color + "40", transform: [{ scale: pulseAnim }] }]} />
      <View style={[styles.pulseDot, { backgroundColor: color }]} />
    </View>
  );
}

function CourtCard({ court, onPress, onSlotPress, surfaceConfig }: { court: Court; onPress: () => void; onSlotPress: (slot: string) => void; surfaceConfig: typeof SURFACE_CONFIG[keyof typeof SURFACE_CONFIG] }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const apiUrl = getApiUrl();

  const googlePlaceId = court.location?.googlePlaceId ?? null;
  const { data: placeDetails } = useQuery<{ rating?: number; reviewCount?: number; photoRef?: string }>({
    queryKey: ["/api/maps/place-details", googlePlaceId],
    enabled: !!googlePlaceId,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/maps/place-details?placeId=${encodeURIComponent(googlePlaceId!)}`);
      return response.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24h
  });
  
  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, speed: 50 }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const formatPrice = () => {
    if (court.creditsPerHour && court.creditsPerHour > 0) {
      return { value: court.creditsPerHour.toString(), unit: "credits/hr", isCredits: true };
    }
    if (!court.pricePerHour || parseFloat(court.pricePerHour) === 0) {
      return { value: "Free", unit: "", isCredits: false };
    }
    return { value: `${court.currency || "AED"} ${parseFloat(court.pricePerHour).toFixed(0)}`, unit: "/hr", isCredits: false };
  };

  const price = formatPrice();
  const hasPhoto = court.photoUrl && court.photoUrl.length > 0;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <View style={styles.courtCard}>
          <LinearGradient
            colors={[Backgrounds.elevated, Backgrounds.card]}
            style={styles.courtCardGradient}
          >
            <View style={styles.courtCardInner}>
              {hasPhoto ? (
                <View style={styles.courtPhotoContainer}>
                  <Image
                    source={{ uri: `${apiUrl}${court.photoUrl}` }}
                    style={styles.courtPhoto}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(17, 20, 26, 0.8)", Backgrounds.card]}
                    style={styles.photoOverlay}
                  />
                </View>
              ) : (
                <LinearGradient
                  colors={surfaceConfig.gradient as [string, string]}
                  style={styles.courtPhotoPlaceholder}
                >
                  <Ionicons name="tennisball-outline" size={40} color={surfaceConfig.color + "60"} />
                </LinearGradient>
              )}

              <View style={styles.courtContent}>
                <View style={styles.courtTopRow}>
                  <View style={[styles.surfaceBadge, { borderColor: surfaceConfig.color + "60" }]}>
                    <Ionicons name={surfaceConfig.icon as any} size={12} color={surfaceConfig.color} />
                    <Text style={[styles.surfaceBadgeText, { color: surfaceConfig.color }]}>
                      {surfaceConfig.label}
                    </Text>
                  </View>

                  {court.bookingEnabled === false && (
                    <View style={styles.communityBadge}>
                      <Ionicons name="people" size={10} color="#FF9500" />
                      <Text style={styles.communityBadgeText}>Community Only</Text>
                    </View>
                  )}

                  {court.xpRewardPerHour && court.xpRewardPerHour > 0 && (
                    <View style={styles.xpBadge}>
                      <Ionicons name="flash" size={10} color={Colors.dark.primaryGlow} />
                      <Text style={styles.xpBadgeText}>+{court.xpRewardPerHour} XP/hr</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.courtName} numberOfLines={1}>{court.name}</Text>

                <View style={styles.courtMetaRow}>
                  {court.academy && (
                    <View style={styles.metaItem}>
                      <Ionicons name="business-outline" size={12} color={Colors.dark.textSecondary} />
                      <Text style={styles.metaText} numberOfLines={1}>{court.academy.name}</Text>
                    </View>
                  )}
                  {court.location && (
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={12} color={Colors.dark.textSecondary} />
                      <Text style={styles.metaText} numberOfLines={1}>{court.location.name}</Text>
                    </View>
                  )}
                  {placeDetails?.rating ? (
                    <View style={styles.placeRatingBadge}>
                      <Ionicons name="star" size={10} color="#FFD700" />
                      <Text style={styles.placeRatingText}>{placeDetails.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.courtBottomRow}>
                  {court.hasAvailability !== false ? (
                    <View style={styles.availabilityRow}>
                      <PulsingDot color={Colors.dark.successNeon} />
                      <Text style={styles.availabilityText}>
                        {court.totalAvailableSlots || 0} slots
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.availabilityRow}>
                      <View style={[styles.noAvailDot, { backgroundColor: Colors.dark.accentError }]} />
                      <Text style={styles.noAvailText}>Fully booked</Text>
                    </View>
                  )}

                  <View style={styles.priceContainer}>
                    <Text style={[styles.priceValue, price.isCredits && styles.priceCredits]}>
                      {price.value}
                    </Text>
                    {price.unit && (
                      <Text style={styles.priceUnit}>{price.unit}</Text>
                    )}
                  </View>
                </View>

                {court.nextAvailableSlots && court.nextAvailableSlots.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.timeSlotsPreview}
                  >
                    {court.nextAvailableSlots.map((slot) => (
                      <Pressable
                        key={slot}
                        style={styles.timeSlotChip}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onSlotPress(slot);
                        }}
                      >
                        <Text style={styles.timeSlotText}>{slot}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>

            <View style={styles.viewSlotsButton}>
              <Text style={styles.viewSlotsText}>
                {court.hasAvailability !== false ? "View All Slots" : "View Details"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.primary} />
            </View>
          </LinearGradient>
          
          <View style={[styles.courtCardGlow, { shadowColor: surfaceConfig.color }]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function CourtBookingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const track = useTrackFeature();

  useEffect(() => {
    track("booking:court");
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSurface, setSelectedSurface] = useState<keyof typeof SURFACE_CONFIG>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
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

  const availableLocations = useMemo(() => {
    const seen = new Set<string>();
    const locs: { id: string; name: string }[] = [];
    for (const court of courts) {
      if (court.location && !seen.has(court.location.id)) {
        seen.add(court.location.id);
        locs.push({ id: court.location.id, name: court.location.name });
      }
    }
    return locs;
  }, [courts]);

  const filteredCourts = useMemo(() => {
    let result = courts;
    if (selectedLocationId) {
      result = result.filter(court => court.location?.id === selectedLocationId);
    }
    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    return result.filter(court => 
      court.name.toLowerCase().includes(query) ||
      court.academy?.name.toLowerCase().includes(query) ||
      court.location?.name?.toLowerCase().includes(query)
    );
  }, [courts, searchQuery, selectedLocationId]);

  const handleCourtPress = (court: Court, time?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("CourtDetail", { courtId: court.id, date: selectedDate, time });
  };

  const getDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        value: date.toISOString().split("T")[0],
        weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
        day: date.getDate(),
        isToday: i === 0,
      });
    }
    return dates;
  };

  const dateOptions = getDateOptions();

  const handleDatePress = (dateValue: string) => {
    Haptics.selectionAsync();
    setSelectedDate(dateValue);
  };

  const handleSurfacePress = (surface: keyof typeof SURFACE_CONFIG) => {
    Haptics.selectionAsync();
    setSelectedSurface(surface);
  };

  return (
    <LockedScreen featureKey="court_booking">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }} 
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Book a Court</Text>
            <Text style={styles.headerSubtitle}>{filteredCourts.length} courts available</Text>
          </View>
          
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <LinearGradient
              colors={[Backgrounds.surface, Backgrounds.elevated]}
              style={styles.searchGradient}
            >
              <Ionicons name="search" size={20} color={Colors.dark.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search courts, venues..."
                placeholderTextColor={Colors.dark.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={Colors.dark.textSecondary} />
                </Pressable>
              )}
            </LinearGradient>
          </View>
        </View>

        <View style={styles.dateSection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.dateScroll}
          >
            {dateOptions.map((option) => {
              const isSelected = selectedDate === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.dateChip, isSelected && styles.dateChipActive]}
                  onPress={() => handleDatePress(option.value)}
                >
                  {isSelected && (
                    <LinearGradient
                      colors={[Colors.dark.primary, "#00A8CC"]}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={[styles.dateWeekday, isSelected && styles.dateTextActive]}>
                    {option.isToday ? "Today" : option.weekday}
                  </Text>
                  <Text style={[styles.dateDay, isSelected && styles.dateTextActive]}>
                    {option.day}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.filterScroll}
          >
            {(Object.keys(SURFACE_CONFIG) as (keyof typeof SURFACE_CONFIG)[]).map((surface) => {
              const config = SURFACE_CONFIG[surface];
              const isSelected = selectedSurface === surface;
              return (
                <Pressable
                  key={surface}
                  style={[
                    styles.filterChip,
                    isSelected && { borderColor: config.color, backgroundColor: config.color + "15" },
                  ]}
                  onPress={() => handleSurfacePress(surface)}
                >
                  <Ionicons 
                    name={config.icon as any} 
                    size={16} 
                    color={isSelected ? config.color : Colors.dark.textSecondary} 
                  />
                  <Text style={[
                    styles.filterText,
                    isSelected && { color: config.color },
                  ]}>
                    {config.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {availableLocations.length > 1 && (
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              <Pressable
                style={[
                  styles.filterChip,
                  selectedLocationId === null && { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "15" },
                ]}
                onPress={() => { Haptics.selectionAsync(); setSelectedLocationId(null); }}
              >
                <Ionicons name="location-outline" size={16} color={selectedLocationId === null ? Colors.dark.primary : Colors.dark.textSecondary} />
                <Text style={[styles.filterText, selectedLocationId === null && { color: Colors.dark.primary }]}>All Locations</Text>
              </Pressable>
              {availableLocations.map((loc) => {
                const isSelected = selectedLocationId === loc.id;
                return (
                  <Pressable
                    key={loc.id}
                    style={[
                      styles.filterChip,
                      isSelected && { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "15" },
                    ]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedLocationId(isSelected ? null : loc.id); }}
                  >
                    <Ionicons name="location" size={16} color={isSelected ? Colors.dark.primary : Colors.dark.textSecondary} />
                    <Text style={[styles.filterText, isSelected && { color: Colors.dark.primary }]} numberOfLines={1}>
                      {loc.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <ScrollView 
          style={styles.courtsList} 
          contentContainerStyle={[styles.courtsListContent, { paddingBottom: 85 + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.stateContainer}>
              <View style={styles.loadingPulse}>
                <ActivityIndicator size="large" color={Colors.dark.primary} />
              </View>
              <Text style={styles.stateTitle}>Finding courts...</Text>
              <Text style={styles.stateSubtitle}>Checking availability in real-time</Text>
            </View>
          ) : isError ? (
            <View style={styles.stateContainer}>
              <View style={styles.errorIcon}>
                <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.accentError} />
              </View>
              <Text style={styles.stateTitle}>Connection Issue</Text>
              <Text style={styles.stateSubtitle}>Please check your internet and try again</Text>
            </View>
          ) : filteredCourts.length === 0 ? (
            <View style={styles.stateContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="tennisball-outline" size={48} color={Colors.dark.textSecondary} />
              </View>
              <Text style={styles.stateTitle}>No Courts Found</Text>
              <Text style={styles.stateSubtitle}>Try adjusting filters or check back later</Text>
            </View>
          ) : (
            <>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsCount}>{filteredCourts.length} Available</Text>
                <Text style={styles.resultsDate}>
                  {dateOptions.find(d => d.value === selectedDate)?.isToday 
                    ? "Today" 
                    : new Date(selectedDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              </View>
              
              {filteredCourts.map((court) => (
                <CourtCard
                  key={court.id}
                  court={court}
                  onPress={() => handleCourtPress(court)}
                  onSlotPress={(slot) => handleCourtPress(court, slot)}
                  surfaceConfig={SURFACE_CONFIG[court.surface as keyof typeof SURFACE_CONFIG] || SURFACE_CONFIG.hard}
                />
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
    marginBottom: 85,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: Backgrounds.elevated,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TextColors.primary,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TextColors.muted,
    marginTop: 2,
  },
  headerSpacer: {
    width: 44,
  },
  
  searchSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  searchGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 52,
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  searchInput: {
    flex: 1,
    color: TextColors.primary,
    fontSize: 16,
  },

  dateSection: {
    marginBottom: Spacing.md,
  },
  dateScroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  dateChip: {
    width: 60,
    height: 72,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  dateChipActive: {
    borderColor: Colors.dark.primary,
  },
  dateWeekday: {
    fontSize: 11,
    color: TextColors.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateDay: {
    fontSize: 22,
    fontWeight: "700",
    color: TextColors.primary,
    marginTop: 2,
  },
  dateTextActive: {
    color: Backgrounds.root,
  },

  filterSection: {
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
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  filterText: {
    fontSize: 14,
    color: TextColors.secondary,
    fontWeight: "500",
  },

  courtsList: {
    flex: 1,
  },
  courtsListContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },

  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  resultsDate: {
    fontSize: 13,
    color: TextColors.muted,
  },

  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: Spacing.md,
  },
  loadingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.accentError + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: TextColors.primary,
  },
  stateSubtitle: {
    fontSize: 14,
    color: TextColors.muted,
    textAlign: "center",
  },

  courtCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginBottom: 4,
  },
  courtCardGradient: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    overflow: "hidden",
  },
  courtCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.xl,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 0,
  },
  courtCardInner: {
    flexDirection: "row",
  },
  courtPhotoContainer: {
    width: 100,
    height: 120,
    position: "relative",
  },
  courtPhoto: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  courtPhotoPlaceholder: {
    width: 100,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  courtContent: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  courtTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  surfaceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  surfaceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primaryGlow + "20",
  },
  xpBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primaryGlow,
  },
  communityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: "#FF950020",
  },
  communityBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FF9500",
  },
  courtName: {
    fontSize: 17,
    fontWeight: "700",
    color: TextColors.primary,
    marginTop: 2,
  },
  courtMetaRow: {
    gap: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: TextColors.muted,
    flex: 1,
  },
  placeRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,215,0,0.12)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 10,
  },
  placeRatingText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFD700",
  },
  courtBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pulseContainer: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseOuter: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availabilityText: {
    fontSize: 12,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  priceCredits: {
    color: Colors.dark.primaryGlow,
  },
  priceUnit: {
    fontSize: 11,
    color: TextColors.muted,
    fontWeight: "500",
  },
  viewSlotsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Backgrounds.surface,
    backgroundColor: Backgrounds.card,
  },
  viewSlotsText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  noAvailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  noAvailText: {
    fontSize: 12,
    color: Colors.dark.accentError,
    fontWeight: "600",
  },
  timeSlotsPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingRight: Spacing.md,
  },
  timeSlotChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "15",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  timeSlotText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
}));
