import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type TabKey = "player" | "coach" | "ability";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "player", label: "Players", icon: "user" },
  { key: "coach",  label: "Coaches", icon: "briefcase" },
  { key: "ability", label: "Abilities", icon: "zap" },
];

const RARITY_COLORS: Record<string, string> = {
  common: "#888888",
  uncommon: "#CD7F32",
  rare: "#4DA3FF",
  epic: "#C040FB",
  legendary: "#FFD700",
  common_i: "#888888", common_ii: "#888888", common_iii: "#888888",
  uncommon_i: "#CD7F32", uncommon_ii: "#CD7F32", uncommon_iii: "#CD7F32",
  rare_i: "#4DA3FF", rare_ii: "#4DA3FF", rare_iii: "#4DA3FF",
  epic_i: "#C040FB", epic_ii: "#C040FB", epic_iii: "#C040FB",
  legendary_i: "#FFD700", legendary_ii: "#FFD700", legendary_iii: "#FFD700",
  mythic_bronze: "#E040FB", mythic_silver: "#E040FB", mythic_gold: "#E040FB",
};

interface GalleryCard {
  id: string;
  playerName?: string;
  coachName?: string;
  name?: string;
  rarityTier?: string;
  rarityLabel?: string;
  rarity?: string;
  statPower?: number;
  statTechnique?: number;
  statMental?: number;
  statTactics?: number;
  basePower?: number;
  arenaMmr?: number;
  description?: string;
  isOwned: boolean;
  isClutch?: boolean;
}

function GalleryItem({
  card,
  cardType,
  onPress,
  onWishlist,
}: {
  card: GalleryCard;
  cardType: TabKey;
  onPress: (card: GalleryCard) => void;
  onWishlist: (cardId: string) => void;
}) {
  const rarity = card.rarityTier ?? card.rarity ?? "common";
  const color = RARITY_COLORS[rarity] ?? "#888888";
  const name = card.playerName ?? card.coachName ?? card.name ?? "Unknown";

  return (
    <Pressable
      style={[
        styles.galleryItem,
        { borderColor: color + (card.isOwned ? "99" : "33") },
        !card.isOwned && styles.galleryItemUnowned,
      ]}
      onPress={() => onPress(card)}
    >
      <View style={[styles.galleryIconWrap, { backgroundColor: color + (card.isOwned ? "22" : "11") }]}>
        <Feather
          name={cardType === "player" ? "user" : cardType === "coach" ? "briefcase" : "zap"}
          size={20}
          color={card.isOwned ? color : Colors.dark.disabled}
        />
        {!card.isOwned && (
          <View style={styles.lockOverlay}>
            <Feather name="lock" size={10} color={Colors.dark.disabled} />
          </View>
        )}
      </View>
      <Text style={[styles.galleryItemName, !card.isOwned && styles.galleryItemNameUnowned]} numberOfLines={2}>
        {name}
      </Text>
      <Text style={[styles.galleryItemRarity, { color: card.isOwned ? color : Colors.dark.disabled }]}>
        {card.rarityLabel ?? rarity}
      </Text>
      {card.isOwned && (
        <Pressable
          style={styles.wishlistBtn}
          onPress={(e) => { e.stopPropagation?.(); onWishlist(card.id); }}
        >
          <Feather name="bookmark" size={12} color={Colors.dark.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

function GalleryDetailModal({
  card,
  cardType,
  onClose,
}: {
  card: GalleryCard | null;
  cardType: TabKey;
  onClose: () => void;
}) {
  if (!card) return null;
  const rarity = card.rarityTier ?? card.rarity ?? "common";
  const color = RARITY_COLORS[rarity] ?? "#888888";
  const name = card.playerName ?? card.coachName ?? card.name ?? "Unknown";

  return (
    <Modal visible={!!card} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.detailHandle} />
        <Pressable style={styles.detailClose} onPress={onClose}>
          <Feather name="x" size={20} color={Colors.dark.text} />
        </Pressable>

        {!card.isOwned && (
          <View style={styles.unownedBanner}>
            <Feather name="lock" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.unownedBannerText}>Not in your collection yet</Text>
          </View>
        )}

        <View style={[styles.detailIcon, { backgroundColor: color + "22", borderColor: color }]}>
          <Feather
            name={cardType === "player" ? "user" : cardType === "coach" ? "briefcase" : "zap"}
            size={48}
            color={card.isOwned ? color : Colors.dark.disabled}
          />
        </View>

        <Text style={styles.detailName}>{name}</Text>
        <View style={[styles.rarityPill, { backgroundColor: color + "33", borderColor: color }]}>
          <Text style={[styles.rarityPillText, { color }]}>{card.rarityLabel ?? rarity}</Text>
        </View>

        {card.statPower != null && (
          <View style={styles.statsGrid}>
            <StatCell label="Power" value={card.statPower} color="#FF4D4D" />
            <StatCell label="Technique" value={card.statTechnique ?? 0} color="#4DA3FF" />
            <StatCell label="Mental" value={card.statMental ?? 0} color="#C8FF3D" />
            <StatCell label="Tactics" value={card.statTactics ?? 0} color="#FFD700" />
          </View>
        )}
        {card.basePower != null && (
          <View style={styles.abilityRow}>
            <Feather name="zap" size={14} color={color} />
            <Text style={[styles.abilityText, { color }]}>{card.basePower} Power</Text>
            {card.isClutch && (
              <View style={styles.clutchBadge}>
                <Text style={styles.clutchText}>CLUTCH</Text>
              </View>
            )}
          </View>
        )}
        {card.arenaMmr != null && (
          <View style={styles.mmrRow}>
            <Feather name="trending-up" size={13} color={Colors.dark.primary} />
            <Text style={styles.mmrText}>{card.arenaMmr} Arena MMR</Text>
          </View>
        )}
        {card.description && (
          <Text style={styles.detailDesc}>{card.description}</Text>
        )}
      </View>
    </Modal>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statCellValue, { color }]}>{value}</Text>
      <Text style={styles.statCellLabel}>{label}</Text>
    </View>
  );
}

export default function CardGalleryScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("player");
  const [selectedCard, setSelectedCard] = useState<GalleryCard | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery<{ cards: GalleryCard[] }>({
    queryKey: [`/api/arena/gallery?type=${activeTab}`],
  });

  const handleWishlist = useCallback(async (cardId: string) => {
    try {
      await apiRequest("POST", "/api/arena/wishlist/toggle", { cardRefId: cardId, cardType: activeTab });
    } catch {}
  }, [activeTab]);

  const filtered = (data?.cards ?? []).filter((c) => {
    if (!search) return true;
    const name = c.playerName ?? c.coachName ?? c.name ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const renderItem = useCallback(({ item }: { item: GalleryCard }) => (
    <GalleryItem
      card={item}
      cardType={activeTab}
      onPress={setSelectedCard}
      onWishlist={handleWishlist}
    />
  ), [activeTab, handleWishlist]);

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={[styles.tabBar, { paddingTop: insets.top + 64 }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Feather
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.key ? Colors.dark.primary : Colors.dark.textMuted}
            />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={14} color={Colors.dark.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${activeTab} cards...`}
          placeholderTextColor={Colors.dark.disabled}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={14} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
            paddingTop: Spacing.md,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="layers" size={48} color={Colors.dark.disabled} />
              <Text style={styles.emptyTitle}>No cards found</Text>
              <Text style={styles.emptyDesc}>Cards from the community appear here</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <GalleryDetailModal
        card={selectedCard}
        cardType={activeTab}
        onClose={() => setSelectedCard(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.borderSubtle,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "rgba(200,255,61,0.10)",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabLabelActive: {
    color: Colors.dark.primary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    padding: 0,
  },
  columnWrapper: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  galleryItem: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  galleryItemUnowned: {
    opacity: 0.55,
  },
  galleryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  lockOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  galleryItemNameUnowned: {
    color: Colors.dark.textMuted,
  },
  galleryItemRarity: {
    fontSize: 10,
    fontWeight: "600",
  },
  wishlistBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.dark.disabled,
  },
  detailModal: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    padding: Spacing.xl,
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.borderSubtle,
    borderRadius: 2,
    marginBottom: Spacing.lg,
  },
  detailClose: {
    position: "absolute",
    top: 24,
    right: Spacing.xl,
    padding: 4,
  },
  unownedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: Spacing.md,
  },
  unownedBannerText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  detailIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginBottom: Spacing.md,
  },
  detailName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  rarityPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  rarityPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  statCell: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: Spacing.md,
    minWidth: 64,
  },
  statCellValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  statCellLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  abilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  abilityText: {
    fontSize: 14,
    fontWeight: "700",
  },
  clutchBadge: {
    backgroundColor: "rgba(255,215,0,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  clutchText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFD700",
  },
  mmrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  mmrText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  detailDesc: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
});
