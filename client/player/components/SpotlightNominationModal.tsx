import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, Backgrounds, GlowColors, Colors, BorderRadius, TextColors } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { getStaticAssetsUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AcademyPlayer {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  level: number;
  ballLevel: string | null;
}

interface SpotlightNominationModalProps {
  visible: boolean;
  onClose: () => void;
}

const SUGGESTED_REASONS = [
  "Hardest worker on court",
  "Most improved this week",
  "Great sportsmanship",
  "Always encouraging others",
  "Never misses a session",
  "Incredible match performance",
  "Best attitude on court",
  "Amazing team player",
];

function PlayerAvatar({ photoUrl, size = 48 }: { photoUrl?: string | null; size?: number }) {
  const baseUrl = getStaticAssetsUrl();
  const fullUrl = photoUrl ? (photoUrl.startsWith("http") ? photoUrl : `${baseUrl}${photoUrl}`) : null;

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: Backgrounds.surface }}>
      {fullUrl ? (
        <Image source={{ uri: fullUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="person" size={size * 0.45} color={TextColors.muted} />
        </View>
      )}
    </View>
  );
}

function BallLevelBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const colorMap: Record<string, string> = {
    red: "#FF4D4D", orange: "#FF851B", green: "#C8FF3D", yellow: "#FFD700", blue: "#4FC3F7",
  };
  return (
    <View style={[ballStyles.badge, { backgroundColor: `${colorMap[level] || "#7C8290"}20`, borderColor: `${colorMap[level] || "#7C8290"}40` }]}>
      <View style={[ballStyles.dot, { backgroundColor: colorMap[level] || "#7C8290" }]} />
      <Text style={[ballStyles.text, { color: colorMap[level] || "#7C8290" }]}>{level.toUpperCase()}</Text>
    </View>
  );
}

const ballStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 10, fontWeight: "700" },
});

export default function SpotlightNominationModal({ visible, onClose }: SpotlightNominationModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"select" | "reason" | "success">("select");
  const [selectedPlayer, setSelectedPlayer] = useState<AcademyPlayer | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");

  const { data: academyPlayers, isLoading: loadingPlayers } = useQuery<AcademyPlayer[]>({
    queryKey: ["/api/player/spotlight/academy-players"],
    enabled: visible && !!user?.playerId,
  });

  const players = useMemo(() => {
    return Array.isArray(academyPlayers) ? academyPlayers : [];
  }, [academyPlayers]);

  const filteredPlayers = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter((p: AcademyPlayer) => p.name?.toLowerCase().includes(q));
  }, [players, search]);

  const nominateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) throw new Error("No player selected");
      const res = await apiRequest("POST", "/api/player/spotlight/nominate", {
        nominatedPlayerId: selectedPlayer.id,
        reason: reason.trim(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to nominate");
      }
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/spotlight/current-week"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/spotlight/leaderboard"] });
      setStep("success");
    },
  });

  const handleClose = () => {
    setStep("select");
    setSelectedPlayer(null);
    setReason("");
    setSearch("");
    onClose();
  };

  const handleSelectPlayer = (player: AcademyPlayer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayer(player);
    setStep("reason");
  };

  const handleSubmit = () => {
    if (!reason.trim() || !selectedPlayer) return;
    nominateMutation.mutate();
  };

  const renderPlayerItem = ({ item, index }: { item: AcademyPlayer; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <Pressable
        onPress={() => handleSelectPlayer(item)}
        style={({ pressed }) => [itemStyles.container, pressed && { opacity: 0.7 }]}
      >
        <PlayerAvatar photoUrl={item.profilePhotoUrl} size={48} />
        <View style={itemStyles.info}>
          <Text style={itemStyles.name} numberOfLines={1}>{item.name}</Text>
          <View style={itemStyles.meta}>
            <Text style={itemStyles.level}>Lvl {item.level || 1}</Text>
            <BallLevelBadge level={item.ballLevel} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
      </Pressable>
    </Animated.View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <Animated.View entering={SlideInDown.duration(400)} style={[styles.container, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.handle} />

            {step === "select" ? (
              <>
                <View style={styles.header}>
                  <Pressable onPress={handleClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color={TextColors.secondary} />
                  </Pressable>
                  <View style={styles.headerCenter}>
                    <Ionicons name="star" size={24} color="#FFD700" />
                    <Text style={styles.title}>Nominate a Player</Text>
                  </View>
                  <View style={{ width: 40 }} />
                </View>

                <Text style={styles.subtitle}>Who deserves the spotlight this week?</Text>

                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={18} color={TextColors.muted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search players..."
                    placeholderTextColor={TextColors.disabled}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search ? (
                    <Pressable onPress={() => setSearch("")}>
                      <Ionicons name="close-circle" size={18} color={TextColors.muted} />
                    </Pressable>
                  ) : null}
                </View>

                {loadingPlayers ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FFD700" />
                  </View>
                ) : (
                  <FlatList
                    data={filteredPlayers}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPlayerItem}
                    style={styles.list}
                    contentContainerStyle={{ gap: 2, paddingBottom: 20 }}
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Ionicons name="people-outline" size={48} color={TextColors.disabled} />
                        <Text style={styles.emptyText}>No players found</Text>
                      </View>
                    }
                  />
                )}
              </>
            ) : step === "reason" ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.reasonContainer}>
                <View style={styles.header}>
                  <Pressable onPress={() => { setStep("select"); setReason(""); }} style={styles.closeBtn}>
                    <Ionicons name="arrow-back" size={24} color={TextColors.secondary} />
                  </Pressable>
                  <View style={styles.headerCenter}>
                    <Text style={styles.title}>Why {selectedPlayer?.name?.split(" ")[0]}?</Text>
                  </View>
                  <View style={{ width: 40 }} />
                </View>

                <View style={styles.selectedPlayerCard}>
                  <PlayerAvatar photoUrl={selectedPlayer?.profilePhotoUrl} size={56} />
                  <View>
                    <Text style={styles.selectedName}>{selectedPlayer?.name}</Text>
                    <Text style={styles.selectedMeta}>Lvl {selectedPlayer?.level || 1}</Text>
                  </View>
                </View>

                <Text style={styles.reasonLabel}>Tell everyone why they deserve it:</Text>

                <View style={styles.suggestionsWrap}>
                  {SUGGESTED_REASONS.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setReason(r);
                      }}
                      style={[styles.suggestionChip, reason === r && styles.suggestionChipActive]}
                    >
                      <Text style={[styles.suggestionText, reason === r && styles.suggestionTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.customReasonBox}>
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Or write your own reason..."
                    placeholderTextColor={TextColors.disabled}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    maxLength={150}
                  />
                  <Text style={styles.charCount}>{reason.length}/150</Text>
                </View>

                <Pressable
                  onPress={handleSubmit}
                  disabled={!reason.trim() || nominateMutation.isPending}
                  style={[styles.submitBtn, (!reason.trim() || nominateMutation.isPending) && { opacity: 0.5 }]}
                >
                  <LinearGradient
                    colors={["#FFD700", "#FFA500"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}
                  >
                    {nominateMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                    ) : (
                      <>
                        <Ionicons name="star" size={18} color={Colors.dark.buttonText} />
                        <Text style={styles.submitText}>Submit Nomination</Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>

                {nominateMutation.isError ? (
                  <Text style={styles.errorText}>{(nominateMutation.error as Error)?.message || "Something went wrong"}</Text>
                ) : null}
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInUp.duration(500)} style={styles.successContainer}>
                <View style={styles.successIconWrap}>
                  <LinearGradient
                    colors={["rgba(255, 215, 0, 0.3)", "rgba(255, 215, 0, 0.05)"]}
                    style={styles.successIconGradient}
                  >
                    <Ionicons name="checkmark-circle" size={64} color="#FFD700" />
                  </LinearGradient>
                </View>
                <Text style={styles.successTitle}>Nomination Sent!</Text>
                <Text style={styles.successSubtitle}>
                  You nominated {selectedPlayer?.name} for Player of the Week
                </Text>
                <View style={styles.successReasonCard}>
                  <Ionicons name="chatbubble" size={14} color="#FFD700" />
                  <Text style={styles.successReason}>"{reason}"</Text>
                </View>
                <Pressable onPress={handleClose} style={styles.doneBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </Animated.View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const itemStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.surface,
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  meta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  level: { fontSize: 12, fontWeight: "600", color: TextColors.muted },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  keyboardView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    minHeight: "60%",
    padding: Spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Backgrounds.surface,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: 14,
    color: TextColors.secondary,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: "#FFFFFF",
  },
  list: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: TextColors.muted,
  },
  reasonContainer: {
    flex: 1,
    gap: Spacing.md,
  },
  selectedPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: "rgba(255, 215, 0, 0.06)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
  },
  selectedName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  selectedMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.muted,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.secondary,
    marginTop: Spacing.sm,
  },
  suggestionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  suggestionChipActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: "600",
    color: TextColors.secondary,
  },
  suggestionTextActive: {
    color: "#FFD700",
  },
  customReasonBox: {
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  reasonInput: {
    fontSize: 15,
    color: "#FFFFFF",
    minHeight: 60,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: TextColors.disabled,
    textAlign: "right",
    marginTop: 4,
  },
  submitBtn: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
  errorText: {
    fontSize: 13,
    color: "#FF4D4D",
    textAlign: "center",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
    paddingVertical: 40,
  },
  successIconWrap: {
    marginBottom: Spacing.md,
  },
  successIconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFD700",
  },
  successSubtitle: {
    fontSize: 15,
    color: TextColors.secondary,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  successReasonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
  },
  successReason: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#FFD700",
  },
  doneBtn: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.surface,
    marginTop: Spacing.md,
  },
  doneText: {
    fontSize: 15,
    fontWeight: "700",
    color: TextColors.primary,
  },
});
