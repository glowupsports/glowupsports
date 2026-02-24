import React, { useState, useCallback } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, getPlayerLevelColor, BallLevelColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { ThemedText } from "@/components/ThemedText";

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

const TIME_PRESETS = [
  { label: "Morning", times: ["07:00", "08:00", "09:00", "10:00"] },
  { label: "Afternoon", times: ["12:00", "13:00", "14:00", "15:00", "16:00"] },
  { label: "Evening", times: ["17:00", "18:00", "19:00", "20:00", "21:00"] },
];

export default function ChallengePlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ChallengePlayerParams, "ChallengePlayer">>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { opponentId, opponentName, opponentPhoto, opponentBallLevel, opponentLevel } = route.params;
  const levelColor = getPlayerLevelColor(opponentBallLevel);

  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("friendly");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("18:00");
  const [selectedCourt, setSelectedCourt] = useState<{ id: string; name: string } | null>(null);
  const [customCourtName, setCustomCourtName] = useState("");
  const [showCustomCourt, setShowCustomCourt] = useState(false);
  const [message, setMessage] = useState("");

  const academyId = (user as any)?.academyId;

  const { data: courtsData, isLoading: courtsLoading } = useQuery({
    queryKey: ["/api/courts", academyId],
    queryFn: async () => {
      const url = academyId
        ? new URL(`/api/courts?academyId=${academyId}`, getApiUrl()).toString()
        : new URL("/api/courts", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { courts: [] };
      return res.json();
    },
    enabled: true,
  });

  const courts = courtsData?.courts || courtsData || [];

  const dateOptions = [
    { label: "Today", date: new Date() },
    { label: "Tomorrow", date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })() },
    ...Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 2);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return { label: `${days[d.getDay()]} ${d.getDate()}`, date: d };
    }),
  ];

  const challengeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/matches/challenge", {
        opponentId,
        matchType,
        matchFormat,
        matchDate: selectedDate.toISOString().split("T")[0],
        matchTime: selectedTime,
        courtId: selectedCourt?.id || null,
        courtName: selectedCourt?.name || customCourtName || null,
        customLocation: customCourtName || null,
        message: message || null,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      Alert.alert("Challenge Sent!", `Your challenge has been sent to ${opponentName}.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to send challenge. Please try again.");
    },
  });

  const handleSendChallenge = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    challengeMutation.mutate();
  }, [challengeMutation]);

  const renderOpponentBanner = () => (
    <Animated.View entering={FadeInDown.duration(500).springify()} style={styles.bannerContainer}>
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
                <Text style={[styles.avatarLetter, { color: levelColor }]}>
                  {opponentName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.bannerTextContainer}>
            <Text style={styles.challengingLabel}>You're challenging</Text>
            <Text style={styles.opponentName} numberOfLines={1}>{opponentName}</Text>
            <View style={styles.badgeRow}>
              {opponentBallLevel ? (
                <View style={[styles.levelBadge, { backgroundColor: `${levelColor}20`, borderColor: `${levelColor}40` }]}>
                  <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                  <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                    {opponentBallLevel.charAt(0).toUpperCase() + opponentBallLevel.slice(1)}
                  </Text>
                </View>
              ) : null}
              {opponentLevel ? (
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                  <Text style={styles.xpBadgeText}>Lvl {opponentLevel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.bannerAccent}>
          <Ionicons name="flame" size={48} color="rgba(200, 255, 61, 0.06)" />
        </View>
      </LinearGradient>
    </Animated.View>
  );

  const renderMatchType = () => (
    <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Match Type</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeCard, matchType === "singles" && styles.typeCardSelected]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMatchType("singles"); }}
        >
          <Ionicons name="person" size={28} color={matchType === "singles" ? Colors.dark.primary : Colors.dark.textMuted} />
          <Text style={[styles.typeLabel, matchType === "singles" && styles.typeLabelSelected]}>Singles</Text>
          <Text style={styles.typeDesc}>1v1</Text>
        </Pressable>

        <Pressable
          style={[styles.typeCard, matchType === "doubles" && styles.typeCardSelected]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMatchType("doubles"); }}
        >
          <Ionicons name="people" size={28} color={matchType === "doubles" ? Colors.dark.primary : Colors.dark.textMuted} />
          <Text style={[styles.typeLabel, matchType === "doubles" && styles.typeLabelSelected]}>Doubles</Text>
          <Text style={styles.typeDesc}>2v2</Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderMatchFormat = () => (
    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Match Format</Text>
      <View style={styles.formatRow}>
        {([
          { key: "friendly" as MatchFormat, icon: "happy-outline" as const, label: "Friendly", desc: "No rating impact" },
          { key: "competitive" as MatchFormat, icon: "shield-outline" as const, label: "Competitive", desc: "Affects rating" },
          { key: "ranking" as MatchFormat, icon: "trophy-outline" as const, label: "Ranking", desc: "Full rating impact" },
        ]).map((fmt) => (
          <Pressable
            key={fmt.key}
            style={[styles.formatCard, matchFormat === fmt.key && styles.formatCardSelected]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMatchFormat(fmt.key); }}
          >
            <Ionicons
              name={fmt.icon}
              size={22}
              color={matchFormat === fmt.key ? Colors.dark.primary : Colors.dark.textMuted}
            />
            <Text style={[styles.formatLabel, matchFormat === fmt.key && styles.formatLabelSelected]}>{fmt.label}</Text>
            <Text style={styles.formatDesc}>{fmt.desc}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );

  const renderDateTime = () => (
    <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Date & Time</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
        {dateOptions.map((opt, i) => {
          const isSelected = selectedDate.toDateString() === opt.date.toDateString();
          return (
            <Pressable
              key={i}
              style={[styles.dateChip, isSelected && styles.dateChipSelected]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDate(opt.date); }}
            >
              <Text style={[styles.dateChipText, isSelected && styles.dateChipTextSelected]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.timeSection}>
        {TIME_PRESETS.map((preset) => (
          <View key={preset.label} style={styles.timeGroup}>
            <Text style={styles.timeGroupLabel}>{preset.label}</Text>
            <View style={styles.timeChips}>
              {preset.times.map((time) => {
                const isSelected = selectedTime === time;
                return (
                  <Pressable
                    key={time}
                    style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedTime(time); }}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>{time}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );

  const renderCourtSelection = () => (
    <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Court</Text>
      {courtsLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginVertical: Spacing.md }} />
      ) : (
        <View style={styles.courtChips}>
          {Array.isArray(courts) && courts.map((court: any) => {
            const isSelected = selectedCourt?.id === court.id && !showCustomCourt;
            return (
              <Pressable
                key={court.id}
                style={[styles.courtChip, isSelected && styles.courtChipSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedCourt({ id: court.id, name: court.name });
                  setShowCustomCourt(false);
                  setCustomCourtName("");
                }}
              >
                <Ionicons name="tennis-ball-outline" size={14} color={isSelected ? Colors.dark.backgroundRoot : Colors.dark.textMuted} style={{ marginRight: 4 }} />
                <Text style={[styles.courtChipText, isSelected && styles.courtChipTextSelected]} numberOfLines={1}>
                  {court.name}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.courtChip, showCustomCourt && styles.courtChipSelected]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCustomCourt(true);
              setSelectedCourt(null);
            }}
          >
            <Ionicons name="location-outline" size={14} color={showCustomCourt ? Colors.dark.backgroundRoot : Colors.dark.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.courtChipText, showCustomCourt && styles.courtChipTextSelected]}>Other Location</Text>
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
        />
      ) : null}
    </Animated.View>
  );

  const renderMessage = () => (
    <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Message (optional)</Text>
      <TextInput
        style={[styles.textInput, styles.messageInput]}
        placeholder="Add a message to your challenge..."
        placeholderTextColor={Colors.dark.textSubtle}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={200}
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{message.length}/200</Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
      >
        {renderOpponentBanner()}
        {renderMatchType()}
        {renderMatchFormat()}
        {renderDateTime()}
        {renderCourtSelection()}
        {renderMessage()}
      </ScrollView>

      <Animated.View
        entering={FadeInUp.delay(600).duration(400)}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}
      >
        <LinearGradient
          colors={["transparent", Colors.dark.backgroundRoot]}
          style={styles.bottomGradientBg}
          pointerEvents="none"
        />
        <Pressable
          style={[styles.sendButton, challengeMutation.isPending && { opacity: 0.6 }]}
          onPress={handleSendChallenge}
          disabled={challengeMutation.isPending}
        >
          <LinearGradient
            colors={[Colors.dark.primary, "#A6E92A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.sendButtonGradient}
          >
            {challengeMutation.isPending ? (
              <ActivityIndicator color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Ionicons name="flash" size={22} color={Colors.dark.backgroundRoot} />
                <Text style={styles.sendButtonText}>Send Challenge</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },

  bannerContainer: {
    marginBottom: Spacing.xl,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
  },
  bannerGradient: {
    padding: Spacing.xl,
    position: "relative",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 26,
    fontWeight: "700",
  },
  bannerTextContainer: {
    flex: 1,
  },
  challengingLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  opponentName: {
    fontSize: FontSizes["2xl"],
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 4,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  levelBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.25)",
    gap: 3,
  },
  xpBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  bannerAccent: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -24,
    opacity: 0.5,
  },

  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
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
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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

  dateScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  dateChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateChipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  dateChipText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  dateChipTextSelected: {
    color: Colors.dark.backgroundRoot,
  },

  timeSection: {
    gap: Spacing.md,
  },
  timeGroup: {
    gap: Spacing.xs,
  },
  timeGroupLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
    marginBottom: 2,
  },
  timeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  timeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  timeChipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  timeChipText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  timeChipTextSelected: {
    color: Colors.dark.backgroundRoot,
  },

  courtChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  courtChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  courtChipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  courtChipText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  courtChipTextSelected: {
    color: Colors.dark.backgroundRoot,
  },

  textInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    marginTop: Spacing.sm,
  },
  messageInput: {
    minHeight: 80,
    paddingTop: Spacing.md,
  },
  charCount: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSubtle,
    textAlign: "right",
    marginTop: 4,
  },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  bottomGradientBg: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  sendButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  sendButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  sendButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
    letterSpacing: 0.5,
  },
});
