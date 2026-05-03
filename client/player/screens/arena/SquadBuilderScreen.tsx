import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

interface CollectedCard {
  id: string;
  cardType: "player" | "coach";
  cardRefId: string;
  source: string;
  rarityTier?: string;
  statPower?: number;
  statTechnique?: number;
  statMental?: number;
  statTactics?: number;
  playerName?: string;
  coachName?: string;
}

interface SquadData {
  squadName: string;
  starters: Array<{ cardId: string; cardType: string; rarityTier?: string; statPower?: number }>;
  bench: Array<{ cardId: string; cardType: string; rarityTier?: string; statPower?: number }>;
  coachCard?: { cardId: string; cardType: string } | null;
  squadPower: number;
  powerBreakdown: { baseStats: number; chemistryBonus: number; coachBonus: number; streakBonus: number };
}

const RARITY_COLORS: Record<string, string> = {
  common_i: "#888888", common_ii: "#aaaaaa",
  uncommon_i: "#CD7F32", uncommon_ii: "#D4946A",
  rare_i: "#4DA3FF", rare_ii: "#7AC0FF",
  epic_i: "#C040FB", epic_ii: "#D06DFC",
  legendary_i: "#FFD700", legendary_ii: "#FFE566",
};

function rarityColor(tier?: string): string {
  return RARITY_COLORS[tier ?? "common_i"] ?? "#888888";
}

function CardSlot({
  card,
  role,
  onPress,
  onRemove,
}: {
  card?: CollectedCard;
  role: string;
  onPress: () => void;
  onRemove?: () => void;
}) {
  const color = rarityColor(card?.rarityTier);
  return (
    <Pressable
      style={[styles.slot, { borderColor: card ? color + "88" : Colors.dark.borderSubtle }]}
      onPress={onPress}
    >
      {card ? (
        <>
          <View style={[styles.slotIcon, { backgroundColor: color + "22" }]}>
            <Feather name={card.cardType === "coach" ? "user-check" : "user"} size={18} color={color} />
          </View>
          <View style={styles.slotInfo}>
            <Text style={styles.slotName} numberOfLines={1}>{card.playerName ?? card.coachName ?? "Card"}</Text>
            <Text style={[styles.slotRarity, { color }]} numberOfLines={1}>{card.rarityTier?.replace(/_/g, " ").toUpperCase()}</Text>
            {card.statPower !== undefined && <Text style={styles.slotPower}>PWR {card.statPower}</Text>}
          </View>
          {onRemove ? (
            <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
              <Feather name="x" size={14} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <Feather name="plus-circle" size={20} color={Colors.dark.disabled} />
          <Text style={styles.slotEmpty}>{role}</Text>
        </>
      )}
    </Pressable>
  );
}

function CardPickerModal({ visible, cards, onSelect, onClose }: { visible: boolean; cards: CollectedCard[]; onSelect: (c: CollectedCard) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[pickerStyles.container, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>Select Card</Text>
          <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={Colors.dark.text} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={pickerStyles.list} showsVerticalScrollIndicator={false}>
          {cards.length === 0 ? (
            <Text style={pickerStyles.empty}>No cards available. Open some packs first.</Text>
          ) : null}
          {cards.map((card) => {
            const c = rarityColor(card.rarityTier);
            return (
              <Pressable key={card.id} style={pickerStyles.card} onPress={() => onSelect(card)}>
                <View style={[pickerStyles.cardIcon, { backgroundColor: c + "22" }]}>
                  <Feather name={card.cardType === "coach" ? "user-check" : "user"} size={20} color={c} />
                </View>
                <View style={pickerStyles.cardInfo}>
                  <Text style={pickerStyles.cardName} numberOfLines={1}>{card.playerName ?? card.coachName ?? "Card"}</Text>
                  <Text style={[pickerStyles.cardRarity, { color: c }]}>{card.rarityTier?.replace(/_/g, " ")}</Text>
                </View>
                {card.statPower !== undefined ? <Text style={pickerStyles.cardPower}>PWR {card.statPower}</Text> : null}
                <Feather name="chevron-right" size={16} color={Colors.dark.disabled} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.dark.borderSubtle },
  title: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  list: { padding: Spacing.lg, gap: Spacing.sm },
  empty: { color: Colors.dark.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: Spacing.md, backgroundColor: Colors.dark.backgroundDefault, borderRadius: 12, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.borderSubtle },
  cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  cardRarity: { fontSize: 11, fontWeight: "500", textTransform: "capitalize" },
  cardPower: { fontSize: 12, fontWeight: "700", color: Colors.dark.primary },
});

// Slot key types (5 starters + 2 bench + 1 coach)
type SlotKey = "starter_0" | "starter_1" | "starter_2" | "starter_3" | "starter_4" | "bench_0" | "bench_1" | "coach";
const STARTER_SLOTS = 5;
const BENCH_SLOTS = 2;

export default function SquadBuilderScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [squadName, setSquadName] = useState("My Squad");
  const [starterSlots, setStarterSlots] = useState<(CollectedCard | null)[]>(Array(STARTER_SLOTS).fill(null));
  const [benchSlots, setBenchSlots] = useState<(CollectedCard | null)[]>(Array(BENCH_SLOTS).fill(null));
  const [coachSlot, setCoachSlot] = useState<CollectedCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<SlotKey | null>(null);

  const { data: collectionData, isLoading } = useQuery<{ cards: CollectedCard[] }>({
    queryKey: ["/api/arena/squad/collection"],
    queryFn: async () => {
      const url = new URL("/api/arena/squad/collection", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
  });

  const { data: previewData, isLoading: isPreviewLoading } = useQuery<SquadData | null>({
    queryKey: ["/api/arena/squad/preview", starterSlots.map((s) => s?.id ?? "").join(","), benchSlots.map((s) => s?.id ?? "").join(","), coachSlot?.id ?? ""],
    queryFn: async () => {
      const starterIds = starterSlots.map((s) => s?.id).filter(Boolean);
      const benchIds = benchSlots.map((s) => s?.id).filter(Boolean);
      if (starterIds.length === 0) return null;
      const url = new URL("/api/arena/squad/preview", getApiUrl());
      const res = await fetch(url.toString(), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ starterIds, benchIds, coachCardId: coachSlot?.id ?? null }) });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: starterSlots.some((s) => s !== null),
  });

  const allCards = collectionData?.cards ?? [];
  const playerCards = allCards.filter((c) => c.cardType === "player");
  const coachCards = allCards.filter((c) => c.cardType === "coach");
  const pickerCards = pickerTarget === "coach" ? coachCards : playerCards;

  const handleSlotPress = useCallback((target: SlotKey) => { setPickerTarget(target); }, []);

  const handleCardSelect = useCallback((card: CollectedCard) => {
    if (!pickerTarget) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (pickerTarget === "coach") {
      setCoachSlot(card);
    } else if (pickerTarget.startsWith("starter_")) {
      const idx = parseInt(pickerTarget.split("_")[1]);
      setStarterSlots((prev) => { const n = [...prev]; n[idx] = card; return n; });
    } else if (pickerTarget.startsWith("bench_")) {
      const idx = parseInt(pickerTarget.split("_")[1]);
      setBenchSlots((prev) => { const n = [...prev]; n[idx] = card; return n; });
    }
    setPickerTarget(null);
  }, [pickerTarget]);

  const handleRemove = useCallback((target: SlotKey) => {
    if (target === "coach") { setCoachSlot(null); return; }
    if (target.startsWith("starter_")) {
      const idx = parseInt(target.split("_")[1]);
      setStarterSlots((prev) => { const n = [...prev]; n[idx] = null; return n; });
    } else if (target.startsWith("bench_")) {
      const idx = parseInt(target.split("_")[1]);
      setBenchSlots((prev) => { const n = [...prev]; n[idx] = null; return n; });
    }
  }, []);

  const handleSave = useCallback(async () => {
    const starterIds = starterSlots.map((s) => s?.id).filter(Boolean) as string[];
    if (starterIds.length === 0) { Alert.alert("Empty Squad", "Add at least one starter card."); return; }
    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/arena/squad/save", { squadName, starterIds, benchIds: benchSlots.map((s) => s?.id).filter(Boolean), coachCardId: coachSlot?.id ?? null });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/squad"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Squad Saved", "Your squad has been updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save squad";
      Alert.alert("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [squadName, starterSlots, benchSlots, coachSlot, queryClient]);

  const squadPower = previewData?.squadPower ?? 0;
  const breakdown = previewData?.powerBreakdown;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + 100, paddingHorizontal: Spacing.lg, gap: Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Squad Builder</Text>
            <Text style={styles.subtitle}>5 starters · 2 subs · 1 coach</Text>
          </View>
          {isPreviewLoading ? <ActivityIndicator color={Colors.dark.primary} size="small" /> : null}
        </View>

        {/* Power bar */}
        <View style={styles.powerCard}>
          <View style={styles.powerRow}>
            <Feather name="zap" size={20} color={Colors.dark.primary} />
            <Text style={styles.powerValue}>{squadPower}</Text>
            <Text style={styles.powerLabel}>Squad Power</Text>
          </View>
          {breakdown ? (
            <View style={styles.breakdownRow}>
              <BreakdownItem label="Stats" value={breakdown.baseStats} color={Colors.dark.text} />
              <BreakdownItem label="Chemistry" value={breakdown.chemistryBonus} color="#4DA3FF" />
              <BreakdownItem label="Coach" value={breakdown.coachBonus} color="#C040FB" />
              <BreakdownItem label="Streak" value={breakdown.streakBonus} color="#FFD700" />
            </View>
          ) : null}
        </View>

        {/* Squad name */}
        <View style={styles.nameRow}>
          <Feather name="edit-2" size={14} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.nameInput}
            value={squadName}
            onChangeText={(t) => setSquadName(t.slice(0, 24))}
            placeholder="Squad name..."
            placeholderTextColor={Colors.dark.textMuted}
            maxLength={24}
          />
        </View>

        {/* Starters (5 slots) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Starters</Text>
          <View style={styles.slots}>
            {starterSlots.map((card, idx) => (
              <CardSlot
                key={`starter_${idx}`}
                card={card ?? undefined}
                role={`Starter ${idx + 1}`}
                onPress={() => handleSlotPress(`starter_${idx}` as SlotKey)}
                onRemove={card ? () => handleRemove(`starter_${idx}` as SlotKey) : undefined}
              />
            ))}
          </View>
        </View>

        {/* Bench (2 slots) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bench</Text>
          <View style={styles.slots}>
            {benchSlots.map((card, idx) => (
              <CardSlot
                key={`bench_${idx}`}
                card={card ?? undefined}
                role={`Sub ${idx + 1}`}
                onPress={() => handleSlotPress(`bench_${idx}` as SlotKey)}
                onRemove={card ? () => handleRemove(`bench_${idx}` as SlotKey) : undefined}
              />
            ))}
          </View>
        </View>

        {/* Coach (1 slot) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coach</Text>
          <CardSlot
            card={coachSlot ?? undefined}
            role="Add Coach"
            onPress={() => handleSlotPress("coach")}
            onRemove={coachSlot ? () => handleRemove("coach") : undefined}
          />
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading your collection...</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Save Button */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable style={[styles.saveBtn, isSaving && { opacity: 0.6 }]} onPress={handleSave} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color="#000" size="small" /> : (
            <>
              <Feather name="check" size={16} color="#000" />
              <Text style={styles.saveBtnText}>Save Squad</Text>
            </>
          )}
        </Pressable>
      </View>

      <CardPickerModal visible={pickerTarget !== null} cards={pickerCards} onSelect={handleCardSelect} onClose={() => setPickerTarget(null)} />
    </>
  );
}

function BreakdownItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.breakdownItem}>
      <Text style={[styles.breakdownValue, { color }]}>+{value}</Text>
      <Text style={styles.breakdownLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  title: { fontSize: 24, fontWeight: "800", color: Colors.dark.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.dark.textMuted, marginTop: 2 },
  powerCard: { backgroundColor: Colors.dark.backgroundDefault, borderRadius: 16, padding: Spacing.lg, borderWidth: 1, borderColor: "rgba(200,255,61,0.25)", gap: Spacing.md },
  powerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  powerValue: { fontSize: 28, fontWeight: "800", color: Colors.dark.primary },
  powerLabel: { fontSize: 13, color: Colors.dark.textMuted, marginLeft: 2, marginTop: 4 },
  breakdownRow: { flexDirection: "row", gap: Spacing.lg },
  breakdownItem: { alignItems: "center" },
  breakdownValue: { fontSize: 14, fontWeight: "700" },
  breakdownLabel: { fontSize: 10, color: Colors.dark.textMuted, marginTop: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: Colors.dark.backgroundDefault, borderRadius: 12, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.borderSubtle },
  nameInput: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, marginBottom: 2 },
  slots: { gap: Spacing.sm },
  slot: { flexDirection: "row", alignItems: "center", gap: Spacing.md, backgroundColor: Colors.dark.backgroundDefault, borderRadius: 12, padding: Spacing.md, borderWidth: 1, borderStyle: "dashed", minHeight: 60 },
  slotIcon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  slotInfo: { flex: 1, gap: 2 },
  slotName: { fontSize: 13, fontWeight: "600", color: Colors.dark.text },
  slotRarity: { fontSize: 10, fontWeight: "500" },
  slotPower: { fontSize: 10, color: Colors.dark.textMuted },
  slotEmpty: { fontSize: 13, color: Colors.dark.disabled },
  removeBtn: { padding: 4 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, justifyContent: "center", paddingVertical: Spacing.lg },
  loadingText: { fontSize: 13, color: Colors.dark.textMuted },
  saveBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: Colors.dark.backgroundRoot, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.dark.borderSubtle },
  saveBtn: { backgroundColor: Colors.dark.primary, borderRadius: 14, paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#000" },
});
