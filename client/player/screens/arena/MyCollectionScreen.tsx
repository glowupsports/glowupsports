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
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";

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

interface CollectionEntry {
  collected: {
    id: string;
    cardType: string;
    isFirstEdition: boolean;
    conqueredRibbon: boolean;
    source: string;
    obtainedAt: string;
  };
  card: Record<string, unknown> | null;
  cardType: string;
}

interface CollectionData {
  cards: CollectionEntry[];
  total: number;
}

function getRarityColor(rarity: string): string {
  return RARITY_COLORS[rarity] ?? "#888888";
}

function CollectionCardItem({
  entry,
  onPress,
}: {
  entry: CollectionEntry;
  onPress: (entry: CollectionEntry) => void;
}) {
  const { collected, card, cardType } = entry;
  if (!card) return null;

  const rarity = String(card.rarityTier ?? card.rarity ?? "common");
  const color = getRarityColor(rarity);
  const name = String(card.playerName ?? card.coachName ?? card.name ?? "Unknown");

  return (
    <Pressable style={[styles.cardItem, { borderColor: color + "55" }]} onPress={() => onPress(entry)}>
      <View style={[styles.cardIconWrap, { backgroundColor: color + "22" }]}>
        <Feather
          name={cardType === "player" ? "user" : cardType === "coach" ? "briefcase" : "zap"}
          size={22}
          color={color}
        />
      </View>
      <View style={styles.cardItemInfo}>
        <Text style={styles.cardItemName} numberOfLines={1}>{name}</Text>
        <Text style={[styles.cardItemRarity, { color }]}>
          {String(card.rarityLabel ?? rarity)}
        </Text>
        {collected.isFirstEdition && (
          <Text style={styles.feStamp}>1st Edition</Text>
        )}
      </View>
      <View style={styles.cardItemBadges}>
        {collected.conqueredRibbon && (
          <View style={styles.conqueredBadge}>
            <Feather name="award" size={10} color="#FF4D4D" />
          </View>
        )}
        {collected.source === "referral" && (
          <View style={styles.referralBadge}>
            <Feather name="users" size={10} color="#4DA3FF" />
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={Colors.dark.disabled} />
    </Pressable>
  );
}

function CardDetailModal({
  entry,
  onClose,
}: {
  entry: CollectionEntry | null;
  onClose: () => void;
}) {
  if (!entry?.card) return null;
  const { collected, card, cardType } = entry;
  const rarity = String(card.rarityTier ?? card.rarity ?? "common");
  const color = getRarityColor(rarity);
  const name = String(card.playerName ?? card.coachName ?? card.name ?? "Unknown");

  return (
    <Modal visible={!!entry} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.detailHandle} />
        <Pressable style={styles.detailClose} onPress={onClose}>
          <Feather name="x" size={20} color={Colors.dark.text} />
        </Pressable>

        <View style={[styles.detailIconLarge, { backgroundColor: color + "22", borderColor: color }]}>
          <Feather
            name={cardType === "player" ? "user" : cardType === "coach" ? "briefcase" : "zap"}
            size={48}
            color={color}
          />
        </View>

        <Text style={styles.detailName}>{name}</Text>
        <View style={[styles.rarityPill, { backgroundColor: color + "33", borderColor: color }]}>
          <Text style={[styles.rarityPillText, { color }]}>{String(card.rarityLabel ?? rarity)}</Text>
          {collected.isFirstEdition && <Text style={styles.feTag}>1st Edition</Text>}
        </View>

        {/* Stats */}
        {card.statPower != null && (
          <View style={styles.statsGrid}>
            <StatCell label="Power" value={Number(card.statPower)} color="#FF4D4D" />
            <StatCell label="Technique" value={Number(card.statTechnique)} color="#4DA3FF" />
            <StatCell label="Mental" value={Number(card.statMental)} color="#C8FF3D" />
            <StatCell label="Tactics" value={Number(card.statTactics)} color="#FFD700" />
          </View>
        )}
        {card.basePower != null ? (
          <View style={styles.abilityDetailRow}>
            <Feather name="zap" size={14} color={color} />
            <Text style={[styles.abilityDetailText, { color }]}>{Number(card.basePower)} Power</Text>
            {card.isClutch ? (
              <View style={styles.clutchBadge}>
                <Text style={styles.clutchText}>CLUTCH</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {card.description ? (
          <Text style={styles.detailDesc}>{String(card.description)}</Text>
        ) : null}

        <View style={styles.detailMeta}>
          <MetaRow icon="tag" label="Source" value={collected.source ?? "pack"} />
          {collected.conqueredRibbon && <MetaRow icon="award" label="Trophy" value="Conquered" />}
          {collected.source === "referral" && <MetaRow icon="users" label="Earned via" value="Referral" />}
        </View>
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

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Feather name={icon as any} size={13} color={Colors.dark.textMuted} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export default function MyCollectionScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("player");
  const [selectedCard, setSelectedCard] = useState<CollectionEntry | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<CollectionData>({
    queryKey: ["/api/arena/collection"],
  });

  const filtered = (data?.cards ?? []).filter((c) => c.cardType === activeTab);

  const renderItem = useCallback(({ item }: { item: CollectionEntry }) => (
    <CollectionCardItem entry={item} onPress={setSelectedCard} />
  ), []);

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={[styles.tabBar, { paddingTop: insets.top + 64 }]}>
        {TABS.map((tab) => {
          const count = (data?.cards ?? []).filter((c) => c.cardType === tab.key).length;
          return (
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
              {count > 0 && (
                <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                  <Text style={styles.tabBadgeText}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.collected.id}
          renderItem={renderItem}
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
              <Feather name="package" size={48} color={Colors.dark.disabled} />
              <Text style={styles.emptyTitle}>No {activeTab} cards yet</Text>
              <Text style={styles.emptyDesc}>Open packs to start collecting</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <CardDetailModal entry={selectedCard} onClose={() => setSelectedCard(null)} />
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
    paddingBottom: Spacing.md,
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
  tabBadge: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tabBadgeActive: {
    backgroundColor: "rgba(200,255,61,0.2)",
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  cardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    gap: Spacing.md,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardItemInfo: {
    flex: 1,
  },
  cardItemName: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cardItemRarity: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  feStamp: {
    fontSize: 10,
    color: "#FFD700",
    fontWeight: "700",
    marginTop: 2,
  },
  cardItemBadges: {
    flexDirection: "row",
    gap: 4,
  },
  conqueredBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,77,77,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  referralBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(77,163,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
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
  detailIconLarge: {
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  feTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFD700",
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
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
  abilityDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  abilityDetailText: {
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
  detailDesc: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  detailMeta: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
});
