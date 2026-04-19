import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown, FadeInRight, FadeInLeft } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, getPlayerLevelColor, getPlayerLevelTextColor } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders, getEffectivePlayerId } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type ChallengePlayerParams = {
  ChallengePlayer: {
    opponentId: string;
    opponentName: string;
    opponentPhoto?: string;
    opponentBallLevel?: string;
    opponentLevel?: number;
  };
};

type MatchType = "singles" | "doubles";
type MatchFormat = "friendly" | "competitive" | "ranking";
type CourtOption = { id: string; name: string } | null;

const STEPS = ["Match", "Court", "Date & Time", "Confirm"];

export default function ChallengePlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ChallengePlayerParams, "ChallengePlayer">>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 80; }

  const { opponentId, opponentName, opponentPhoto, opponentBallLevel, opponentLevel } = route.params;
  const levelColor = getPlayerLevelColor(opponentBallLevel);

  const [step, setStep] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("friendly");
  const [selectedCourt, setSelectedCourt] = useState<CourtOption>(null);
  const [showCustomCourt, setShowCustomCourt] = useState(false);
  const [customCourtName, setCustomCourtName] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [message, setMessage] = useState("");

  const academyId = (user as any)?.academyId;
  const playerId = getEffectivePlayerId(user?.playerId);

  const { data: courtsData, isLoading: courtsLoading } = useQuery({
    queryKey: ["/api/courts", academyId],
    queryFn: async () => {
      const url = academyId
        ? new URL(`/api/courts?academyId=${academyId}`, getApiUrl()).toString()
        : new URL("/api/courts", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return { courts: [] };
      return res.json();
    },
    enabled: true,
  });
  const courts = Array.isArray(courtsData?.courts) ? courtsData.courts : Array.isArray(courtsData) ? courtsData : [];

  const { data: neutralCourtData } = useQuery<{
    suggestedCourtId: string | null;
    courts: Array<{ courtId: string; fromMe: number | null; fromOpponent: number | null }>;
  }>({
    queryKey: ["/api/matches/challenge/neutral-court", playerId, opponentId, academyId],
    queryFn: async () => {
      if (!playerId || !opponentId) return { suggestedCourtId: null, courts: [] };
      const params = new URLSearchParams({ playerId, opponentId });
      if (academyId) params.set("academyId", academyId);
      const res = await fetch(
        new URL(`/api/matches/challenge/neutral-court?${params}`, getApiUrl()).toString(),
        { credentials: "include", headers: getAuthHeaders() }
      );
      if (!res.ok) return { suggestedCourtId: null, courts: [] };
      return res.json();
    },
    enabled: !!playerId && !!opponentId,
  });

  const suggestedCourtId = neutralCourtData?.suggestedCourtId ?? null;
  const courtTravelMinutes = useMemo(() => {
    const map = new Map<string, { fromMe: number; fromOpponent: number }>();
    for (const c of neutralCourtData?.courts || []) {
      map.set(c.courtId, {
        fromMe: c.fromMe ?? Infinity,
        fromOpponent: c.fromOpponent ?? Infinity,
      });
    }
    return map;
  }, [neutralCourtData]);

  const dateStr = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const d = String(selectedDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const { data: availabilityData, isLoading: slotsLoading } = useQuery({
    queryKey: ["/api/matches/challenge/availability", playerId, opponentId, selectedCourt?.id, dateStr],
    queryFn: async () => {
      if (!playerId) return { slots: [] };
      const params = new URLSearchParams({
        playerId,
        opponentId,
        date: dateStr,
      });
      if (selectedCourt?.id) params.set("courtId", selectedCourt.id);
      const res = await fetch(
        new URL(`/api/matches/challenge/availability?${params}`, getApiUrl()).toString(),
        { credentials: "include", headers: getAuthHeaders() }
      );
      if (!res.ok) return { slots: [] };
      return res.json();
    },
    enabled: step === 2 && !!playerId,
  });

  const slots = availabilityData?.slots || [];

  const dateOptions = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const formatDateLabel = (d: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  const challengeMutation = useMutation({
    mutationFn: async () => {
      if (!playerId) throw new Error("No player profile");
      return await apiRequest("POST", `/api/matches/challenge?playerId=${playerId}`, {
        opponentId,
        matchType,
        matchFormat,
        matchDate: dateStr,
        matchTime: selectedTime,
        courtId: selectedCourt?.id || null,
        courtName: selectedCourt?.name || customCourtName || null,
        customLocation: showCustomCourt ? customCourtName : null,
        message: message || null,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenges"] });
      setShowSuccess(true);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const canProceed = useCallback(() => {
    switch (step) {
      case 0: return true;
      case 1: return selectedCourt !== null || (showCustomCourt && customCourtName.trim().length > 0);
      case 2: return selectedTime !== "";
      case 3: return true;
      default: return false;
    }
  }, [step, selectedCourt, showCustomCourt, customCourtName, selectedTime]);

  const handleNext = () => {
    if (!canProceed()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === 3) {
      challengeMutation.mutate();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 0) {
      navigation.goBack();
    } else {
      setStep((s) => s - 1);
    }
  };

  const morningSlots = slots.filter((s: any) => {
    const h = parseInt(s.time.split(":")[0]);
    return h >= 6 && h < 12;
  });
  const afternoonSlots = slots.filter((s: any) => {
    const h = parseInt(s.time.split(":")[0]);
    return h >= 12 && h < 17;
  });
  const eveningSlots = slots.filter((s: any) => {
    const h = parseInt(s.time.split(":")[0]);
    return h >= 17;
  });

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.progressStep}>
          <View style={[
            styles.progressDot,
            i < step && styles.progressDotCompleted,
            i === step && styles.progressDotActive,
          ]}>
            {i < step ? (
              <Ionicons name="checkmark" size={12} color={Colors.dark.buttonText} />
            ) : (
              <Text style={[styles.progressDotText, i === step && styles.progressDotTextActive]}>{i + 1}</Text>
            )}
          </View>
          <Text style={[styles.progressLabel, i === step && styles.progressLabelActive]}>{label}</Text>
          {i < STEPS.length - 1 ? (
            <View style={[styles.progressLine, i < step && styles.progressLineCompleted]} />
          ) : null}
        </View>
      ))}
    </View>
  );

  const renderOpponentBanner = () => (
    <View style={styles.bannerContainer}>
      <LinearGradient
        colors={["rgba(200, 255, 61, 0.08)", "rgba(200, 255, 61, 0.02)", "transparent"]}
        style={styles.bannerGradient}
      >
        <View style={styles.bannerContent}>
          <View style={[styles.avatarRing, { borderColor: levelColor }]}>
            {opponentPhoto ? (
              <Image source={{ uri: opponentPhoto }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: `${levelColor}20` }]}>
                <Text style={[styles.avatarLetter, { color: getPlayerLevelTextColor(opponentBallLevel) }]}>
                  {opponentName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.challengingLabel}>Challenging</Text>
            <Text style={styles.opponentName} numberOfLines={1}>{opponentName}</Text>
            <View style={styles.badgeRow}>
              {opponentBallLevel ? (
                <View style={[styles.levelBadge, { backgroundColor: `${levelColor}20`, borderColor: `${levelColor}40` }]}>
                  <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                  <Text style={[styles.levelBadgeText, { color: getPlayerLevelTextColor(opponentBallLevel) }]}>
                    {opponentBallLevel.charAt(0).toUpperCase() + opponentBallLevel.slice(1)}
                  </Text>
                </View>
              ) : null}
              {opponentLevel ? (
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.primary} />
                  <Text style={styles.xpBadgeText}>Lvl {opponentLevel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );

  const renderStep0 = () => (
    <Animated.View entering={FadeInRight.duration(300)} key="step0">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match Type</Text>
        <View style={styles.typeRow}>
          {([
            { key: "singles" as MatchType, icon: "person" as const, label: "Singles", desc: "1v1" },
            { key: "doubles" as MatchType, icon: "people" as const, label: "Doubles", desc: "2v2" },
          ]).map((t) => (
            <Pressable
              key={t.key}
              style={[styles.typeCard, matchType === t.key && styles.typeCardSelected]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMatchType(t.key); }}
            >
              <Ionicons name={t.icon} size={28} color={matchType === t.key ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.typeLabel, matchType === t.key && styles.typeLabelSelected]}>{t.label}</Text>
              <Text style={styles.typeDesc}>{t.desc}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match Format</Text>
        <View style={styles.formatRow}>
          {([
            { key: "friendly" as MatchFormat, icon: "happy-outline" as const, label: "Friendly", desc: "No rating impact" },
            { key: "competitive" as MatchFormat, icon: "shield-outline" as const, label: "Competitive", desc: "Affects rating" },
            { key: "ranking" as MatchFormat, icon: "trophy-outline" as const, label: "Ranking", desc: "Full impact" },
          ]).map((fmt) => (
            <Pressable
              key={fmt.key}
              style={[styles.formatCard, matchFormat === fmt.key && styles.formatCardSelected]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMatchFormat(fmt.key); }}
            >
              <Ionicons name={fmt.icon} size={22} color={matchFormat === fmt.key ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.formatLabel, matchFormat === fmt.key && styles.formatLabelSelected]}>{fmt.label}</Text>
              <Text style={styles.formatDesc}>{fmt.desc}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Animated.View>
  );

  const renderStep1 = () => {
    const hasTravelData = courtTravelMinutes.size > 0;
    const suggestedCourt = suggestedCourtId ? courts.find((c: any) => c.id === suggestedCourtId) : null;

    return (
    <Animated.View entering={FadeInRight.duration(300)} key="step1">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select a Court</Text>
        <Text style={styles.sectionSubtitle}>Choose where you want to play</Text>

        {suggestedCourt && hasTravelData ? (
          <Pressable
            style={styles.suggestedVenueBanner}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSelectedCourt({ id: suggestedCourt.id, name: suggestedCourt.name });
              setShowCustomCourt(false);
              setCustomCourtName("");
              setSelectedTime("");
            }}
          >
            <View style={styles.suggestedVenueLeft}>
              <Ionicons name="navigate-circle" size={22} color={Colors.dark.primary} />
              <View>
                <Text style={styles.suggestedVenueLabel}>Neutral Court Suggestion</Text>
                <Text style={styles.suggestedVenueName} numberOfLines={1}>{suggestedCourt.name}</Text>
                {(() => {
                  const times = courtTravelMinutes.get(suggestedCourtId!);
                  if (!times) return null;
                  const parts: string[] = [];
                  if (times.fromMe !== Infinity) parts.push(`You: ~${Math.round(times.fromMe)} min`);
                  if (times.fromOpponent !== Infinity) parts.push(`Them: ~${Math.round(times.fromOpponent)} min`);
                  return parts.length > 0 ? (
                    <Text style={styles.suggestedVenueSubtitle}>{parts.join("  |  ")}</Text>
                  ) : null;
                })()}
              </View>
            </View>
            <View style={styles.suggestedVenuePill}>
              <Text style={styles.suggestedVenuePillText}>Use</Text>
            </View>
          </Pressable>
        ) : null}

        {courtsLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={{ marginVertical: Spacing.xl }} />
        ) : (
          <View style={styles.courtList}>
            {courts.map((court: any) => {
              const isSelected = selectedCourt?.id === court.id && !showCustomCourt;
              const travelInfo = hasTravelData ? courtTravelMinutes.get(court.id) : null;
              return (
                <Pressable
                  key={court.id}
                  style={[styles.courtCard, isSelected && styles.courtCardSelected, court.id === suggestedCourtId && !isSelected && styles.courtCardSuggested]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setSelectedCourt({ id: court.id, name: court.name });
                    setShowCustomCourt(false);
                    setCustomCourtName("");
                    setSelectedTime("");
                  }}
                >
                  <View style={[styles.courtIcon, isSelected && styles.courtIconSelected]}>
                    <Ionicons
                      name="tennisball"
                      size={20}
                      color={isSelected ? Colors.dark.backgroundRoot : Colors.dark.primary}
                    />
                  </View>
                  <View style={styles.courtInfo}>
                    <View style={styles.courtNameRow}>
                      <Text style={[styles.courtName, isSelected && styles.courtNameSelected]} numberOfLines={1}>
                        {court.name}
                      </Text>
                      {court.id === suggestedCourtId ? (
                        <View style={styles.neutralBadge}>
                          <Ionicons name="star" size={9} color={Colors.dark.primary} />
                          <Text style={styles.neutralBadgeText}>Neutral</Text>
                        </View>
                      ) : null}
                    </View>
                    {travelInfo ? (
                      <View style={styles.courtTravelRow}>
                        {travelInfo.fromMe !== Infinity ? (
                          <Text style={styles.courtTravelText}>You: ~{Math.round(travelInfo.fromMe)} min</Text>
                        ) : null}
                        {travelInfo.fromOpponent !== Infinity ? (
                          <Text style={styles.courtTravelText}>Them: ~{Math.round(travelInfo.fromOpponent)} min</Text>
                        ) : null}
                      </View>
                    ) : court.surface ? (
                      <Text style={styles.courtSurface}>{court.surface}</Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
                  ) : null}
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.courtCard, showCustomCourt && styles.courtCardSelected]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCustomCourt(true);
                setSelectedCourt(null);
                setSelectedTime("");
              }}
            >
              <View style={[styles.courtIcon, showCustomCourt && styles.courtIconSelected]}>
                <Ionicons
                  name="location"
                  size={20}
                  color={showCustomCourt ? Colors.dark.backgroundRoot : Colors.dark.primary}
                />
              </View>
              <View style={styles.courtInfo}>
                <Text style={[styles.courtName, showCustomCourt && styles.courtNameSelected]}>Other Location</Text>
                <Text style={styles.courtSurface}>Enter a custom court or venue</Text>
              </View>
              {showCustomCourt ? (
                <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
              ) : null}
            </Pressable>
          </View>
        )}

        {showCustomCourt ? (
          <TextInput
            style={styles.textInput}
            placeholder="Enter court or location name..."
            placeholderTextColor={Colors.dark.textSubtle}
            value={customCourtName}
            onChangeText={setCustomCourtName}
            autoFocus
          />
        ) : null}
      </View>
    </Animated.View>
    );
  };

  const renderTimeSlotGroup = (label: string, groupSlots: any[], icon: string) => {
    if (groupSlots.length === 0) return null;
    return (
      <View style={styles.timeGroup}>
        <View style={styles.timeGroupHeader}>
          <Feather name={icon as any} size={14} color={Colors.dark.textSubtle} />
          <Text style={styles.timeGroupLabel}>{label}</Text>
        </View>
        <View style={styles.timeChips}>
          {groupSlots.map((slot: any) => {
            const isSelected = selectedTime === slot.time;
            const isAvailable = slot.available;
            return (
              <Pressable
                key={slot.time}
                style={[
                  styles.timeChip,
                  isSelected && styles.timeChipSelected,
                  !isAvailable && styles.timeChipDisabled,
                ]}
                onPress={() => {
                  if (!isAvailable) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTime(slot.time);
                }}
                disabled={!isAvailable}
              >
                <Text style={[
                  styles.timeChipText,
                  isSelected && styles.timeChipTextSelected,
                  !isAvailable && styles.timeChipTextDisabled,
                ]}>
                  {slot.time}
                </Text>
                {!isAvailable && slot.reason ? (
                  <Text style={styles.timeChipReason} numberOfLines={1}>{slot.reason}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderStep2 = () => (
    <Animated.View entering={FadeInRight.duration(300)} key="step2">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pick a Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {dateOptions.map((d, i) => {
            const isSelected = selectedDate.toDateString() === d.toDateString();
            const dayName = formatDateLabel(d);
            const dayNum = d.getDate();
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return (
              <Pressable
                key={i}
                style={[styles.dateCard, isSelected && styles.dateCardSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDate(d);
                  setSelectedTime("");
                }}
              >
                <Text style={[styles.dateDayName, isSelected && styles.dateDayNameSelected]}>{dayName.split(" ")[0]}</Text>
                <Text style={[styles.dateDayNum, isSelected && styles.dateDayNumSelected]}>{dayNum}</Text>
                <Text style={[styles.dateMonth, isSelected && styles.dateMonthSelected]}>{monthNames[d.getMonth()]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Available Times</Text>
          {slotsLoading ? (
            <ActivityIndicator color={Colors.dark.primary} size="small" />
          ) : (
            <Text style={styles.slotCount}>
              {slots.filter((s: any) => s.available).length} slots open
            </Text>
          )}
        </View>

        {selectedCourt ? (
          <View style={styles.courtIndicator}>
            <Ionicons name="tennisball" size={14} color={Colors.dark.primary} />
            <Text style={styles.courtIndicatorText}>{selectedCourt.name}</Text>
          </View>
        ) : showCustomCourt && customCourtName ? (
          <View style={styles.courtIndicator}>
            <Ionicons name="location" size={14} color={Colors.dark.primary} />
            <Text style={styles.courtIndicatorText}>{customCourtName}</Text>
          </View>
        ) : null}

        {slotsLoading ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={Colors.dark.primary} />
            <Text style={styles.slotsLoadingText}>Checking availability...</Text>
          </View>
        ) : (
          <View style={styles.timeSlotsContainer}>
            {renderTimeSlotGroup("Morning", morningSlots, "sunrise")}
            {renderTimeSlotGroup("Afternoon", afternoonSlots, "sun")}
            {renderTimeSlotGroup("Evening", eveningSlots, "sunset")}
            {slots.length === 0 ? (
              <View style={styles.noSlots}>
                <Feather name="calendar" size={32} color={Colors.dark.textSubtle} />
                <Text style={styles.noSlotsText}>No time slots available for this date</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );

  const renderStep3 = () => (
    <Animated.View entering={FadeInRight.duration(300)} key="step3">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add a Message</Text>
        <Text style={styles.sectionSubtitle}>Optional - send a note with your challenge</Text>
        <TextInput
          style={[styles.textInput, styles.messageInput]}
          placeholder="Let's play! Ready to settle the score?"
          placeholderTextColor={Colors.dark.textSubtle}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={200}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{message.length}/200</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Challenge Summary</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="tennisball" size={16} color={Colors.dark.primary} />
            </View>
            <View style={styles.summaryContent}>
              <Text style={styles.summaryLabel}>Match</Text>
              <Text style={styles.summaryValue}>
                {matchType.charAt(0).toUpperCase() + matchType.slice(1)} - {matchFormat.charAt(0).toUpperCase() + matchFormat.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="location" size={16} color={Colors.dark.primary} />
            </View>
            <View style={styles.summaryContent}>
              <Text style={styles.summaryLabel}>Court</Text>
              <Text style={styles.summaryValue}>
                {selectedCourt?.name || customCourtName || "Not selected"}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
            </View>
            <View style={styles.summaryContent}>
              <Text style={styles.summaryLabel}>Date & Time</Text>
              <Text style={styles.summaryValue}>
                {formatDateLabel(selectedDate)} - {selectedTime || "Not selected"}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="person" size={16} color={Colors.dark.primary} />
            </View>
            <View style={styles.summaryContent}>
              <Text style={styles.summaryLabel}>Opponent</Text>
              <Text style={styles.summaryValue}>{opponentName}</Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  const getButtonLabel = () => {
    if (step === 3) return challengeMutation.isPending ? "Sending..." : "Send Challenge";
    return "Next";
  };

  const getButtonIcon = (): any => {
    if (step === 3) return "flash";
    return "arrow-forward";
  };

  if (showSuccess) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <View style={styles.successContainer}>
          <Animated.View entering={FadeInDown.duration(500)} style={styles.successContent}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={48} color={Colors.dark.buttonText} />
            </View>
            <Text style={styles.successTitle}>Challenge Sent!</Text>
            <Text style={styles.successSubtitle}>
              Your challenge has been sent to {opponentName}
            </Text>

            <View style={styles.successSummary}>
              <View style={styles.successSummaryRow}>
                <Ionicons name="tennisball" size={16} color={Colors.dark.primary} />
                <Text style={styles.successSummaryText}>
                  {matchType.charAt(0).toUpperCase() + matchType.slice(1)} - {matchFormat.charAt(0).toUpperCase() + matchFormat.slice(1)}
                </Text>
              </View>
              <View style={styles.successSummaryRow}>
                <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
                <Text style={styles.successSummaryText}>
                  {formatDateLabel(selectedDate)} at {selectedTime}
                </Text>
              </View>
              {(selectedCourt?.name || customCourtName) ? (
                <View style={styles.successSummaryRow}>
                  <Ionicons name="location" size={16} color={Colors.dark.primary} />
                  <Text style={styles.successSummaryText}>
                    {selectedCourt?.name || customCourtName}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.successHint}>
              {opponentName} will be notified and can accept or decline
            </Text>

            <Pressable
              style={styles.successButton}
              onPress={() => navigation.goBack()}
            >
              <LinearGradient
                colors={[Colors.dark.primary, "#A6E92A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.successButtonGradient}
              >
                <Text style={styles.successButtonText}>Done</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 100 }]}
      >
        {renderOpponentBanner()}
        {renderProgressBar()}

        {step === 0 ? renderStep0() : null}
        {step === 1 ? renderStep1() : null}
        {step === 2 ? renderStep2() : null}
        {step === 3 ? renderStep3() : null}
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.bottomBar, { bottom: tabBarHeight }]}>
        <LinearGradient
          colors={["transparent", Colors.dark.backgroundRoot, Colors.dark.backgroundRoot]}
          style={styles.bottomGradientBg}
          pointerEvents="none"
        />
        <View style={styles.bottomButtons}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
            <Text style={styles.backButtonText}>{step === 0 ? "Cancel" : "Back"}</Text>
          </Pressable>

          <Pressable
            style={[styles.nextButton, !canProceed() && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!canProceed() || challengeMutation.isPending}
          >
            <LinearGradient
              colors={canProceed() ? [Colors.dark.primary, "#A6E92A"] : ["#333", "#333"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextButtonGradient}
            >
              {challengeMutation.isPending ? (
                <ActivityIndicator color={Colors.dark.buttonText} size="small" />
              ) : (
                <>
                  <Text style={[styles.nextButtonText, !canProceed() && styles.nextButtonTextDisabled]}>
                    {getButtonLabel()}
                  </Text>
                  <Ionicons
                    name={getButtonIcon()}
                    size={18}
                    color={canProceed() ? Colors.dark.backgroundRoot : Colors.dark.textSubtle}
                  />
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },

  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  progressStep: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  progressDotActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
  },
  progressDotCompleted: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  progressDotText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textSubtle,
  },
  progressDotTextActive: {
    color: Colors.dark.primary,
  },
  progressLabel: {
    fontSize: 10,
    color: Colors.dark.textSubtle,
    marginLeft: 4,
    fontWeight: "500",
  },
  progressLabelActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  progressLine: {
    width: 20,
    height: 1.5,
    backgroundColor: Colors.dark.border,
    marginHorizontal: 4,
  },
  progressLineCompleted: {
    backgroundColor: Colors.dark.primary,
  },

  bannerContainer: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
  },
  bannerGradient: {
    padding: Spacing.lg,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: "700",
  },
  bannerTextContainer: {
    flex: 1,
  },
  challengingLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  opponentName: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 4,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.25)",
    gap: 3,
  },
  xpBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },

  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  sectionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
    marginBottom: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },

  typeRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  typeCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  typeCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(200, 255, 61, 0.06)",
  },
  typeLabel: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  typeLabelSelected: {
    color: Colors.dark.primary,
  },
  typeDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
  },

  formatRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  formatCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    alignItems: "center",
    gap: 4,
  },
  formatCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(200, 255, 61, 0.06)",
  },
  formatLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  formatLabelSelected: {
    color: Colors.dark.primary,
  },
  formatDesc: {
    fontSize: 9,
    color: Colors.dark.textSubtle,
    textAlign: "center",
  },

  courtList: {
    gap: Spacing.sm,
  },
  courtCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  courtCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(200, 255, 61, 0.06)",
  },
  courtCardSuggested: {
    borderColor: "rgba(200, 255, 61, 0.35)",
    backgroundColor: "rgba(200, 255, 61, 0.03)",
  },
  courtIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(200, 255, 61, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  courtIconSelected: {
    backgroundColor: Colors.dark.primary,
  },
  courtInfo: {
    flex: 1,
  },
  courtName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  courtNameSelected: {
    color: Colors.dark.primary,
  },
  courtSurface: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
    marginTop: 2,
  },
  courtNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  neutralBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  neutralBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  courtTravelRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 3,
    flexWrap: "wrap",
  },
  courtTravelText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSubtle,
  },
  suggestedVenueBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.3)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  suggestedVenueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  suggestedVenueLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.primary,
    fontWeight: "600",
    marginBottom: 2,
  },
  suggestedVenueName: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  suggestedVenueSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSubtle,
    marginTop: 2,
  },
  suggestedVenuePill: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  suggestedVenuePillText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },

  dateScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  dateCard: {
    width: 60,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    alignItems: "center",
    gap: 2,
  },
  dateCardSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  dateDayName: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSubtle,
    textTransform: "uppercase",
  },
  dateDayNameSelected: {
    color: Colors.dark.buttonText,
  },
  dateDayNum: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateDayNumSelected: {
    color: Colors.dark.buttonText,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: "500",
    color: Colors.dark.textSubtle,
  },
  dateMonthSelected: {
    color: "rgba(0,0,0,0.5)",
  },

  slotCount: {
    fontSize: FontSizes.sm,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  courtIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
    marginBottom: Spacing.md,
  },
  courtIndicatorText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.primary,
    fontWeight: "500",
  },

  timeSlotsContainer: {
    gap: Spacing.lg,
  },
  timeGroup: {
    gap: Spacing.sm,
  },
  timeGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  timeGroupLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  timeChip: {
    minWidth: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  timeChipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  timeChipDisabled: {
    opacity: 0.45,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  timeChipText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  timeChipTextSelected: {
    color: Colors.dark.buttonText,
  },
  timeChipTextDisabled: {
    color: Colors.dark.textSubtle,
  },
  timeChipReason: {
    fontSize: 8,
    color: Colors.dark.textSubtle,
    marginTop: 2,
  },

  slotsLoading: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  slotsLoadingText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
  },
  noSlots: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  noSlotsText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
    textAlign: "center",
  },

  textInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    marginTop: Spacing.md,
  },
  messageInput: {
    height: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSubtle,
    textAlign: "right",
    marginTop: 4,
  },

  summaryCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(200, 255, 61, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  bottomGradientBg: {
    position: "absolute",
    top: -30,
    left: 0,
    right: 0,
    height: 60,
  },
  bottomButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  backButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  nextButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  nextButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  nextButtonTextDisabled: {
    color: Colors.dark.textSubtle,
  },

  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  successContent: {
    alignItems: "center",
    width: "100%",
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  successSummary: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.lg,
    width: "100%",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  successSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  successSummaryText: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  successHint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  successButton: {
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  successButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  successButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
}));
