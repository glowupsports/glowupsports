import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Alert, Modal, TextInput, FlatList,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type {
  PurchasesPackage,
  PurchasesOfferings,
  PurchasesStoreTransaction,
} from "react-native-purchases";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useSubscription, ARENA_PASS_ENTITLEMENT_IDENTIFIER } from "@/lib/revenuecat";

type ShopTab = "Coins" | "Packs" | "Arena Pass";

// ── Product metadata ──────────────────────────────────────────────────────────
interface CoinBundle {
  lookupKey: string;
  coins: number;
  label: string;
  badge?: string;
  accentColor: string;
}

const COIN_BUNDLES: CoinBundle[] = [
  { lookupKey: "coins_200",  coins: 200,  label: "200 Coins",   accentColor: "#B0BEC5" },
  { lookupKey: "coins_550",  coins: 550,  label: "550 Coins",   badge: "Best Starter", accentColor: "#00B0FF" },
  { lookupKey: "coins_1200", coins: 1200, label: "1,200 Coins", badge: "Most Popular",  accentColor: "#7C4DFF" },
  { lookupKey: "coins_2800", coins: 2800, label: "2,800 Coins", badge: "Best Value",    accentColor: GlowColors.primary },
];

interface PackTier {
  lookupKey: string;
  name: string;
  description: string;
  cards: number;
  guarantees: string;
  accentColor: string;
  icon: string;
}

// Pack tiers per Phase 4 spec: Bronze €0.99, Silver €2.49, Gold €4.99, Mega Bundle €19.99, Guaranteed Legendary €7.99
const PACK_TIERS: PackTier[] = [
  { lookupKey: "pack_bronze",               name: "Bronze Pack",          description: "5 cards, 1 guaranteed Rare",           cards: 5,  guarantees: "1 Rare",               accentColor: "#CD7F32",         icon: "archive" },
  { lookupKey: "pack_silver",               name: "Silver Pack",          description: "7 cards, 1 guaranteed Epic",           cards: 7,  guarantees: "1 Epic",               accentColor: "#9E9E9E",         icon: "box" },
  { lookupKey: "pack_gold",                 name: "Gold Pack",            description: "8 cards, 1 guaranteed Legendary",      cards: 8,  guarantees: "1 Legendary",          accentColor: "#FFB300",         icon: "star" },
  { lookupKey: "pack_guaranteed_legendary", name: "Guaranteed Legendary", description: "5 cards, Legendary guaranteed",        cards: 5,  guarantees: "1 Legendary (certain)", accentColor: "#FF4081",        icon: "award" },
  { lookupKey: "pack_mega",                 name: "Mega Bundle",          description: "20 cards, 3 guaranteed Legendaries",   cards: 20, guarantees: "3 Legendaries",        accentColor: GlowColors.primary, icon: "package" },
];

// Pass perks per spec: 100 daily coins, 1 free Bronze Pack/week, exclusive frame, Unranked mode, early access
const PASS_PERKS = [
  "100 daily GlowCoins",
  "1 free Bronze Pack per week",
  "Exclusive Arena Pass card frame",
  "Unlimited daily unranked battles",
  "Early season challenge access",
];

// ── Helper: find RC package by lookup key ─────────────────────────────────────
function findRCPackage(
  offerings: PurchasesOfferings | null | undefined,
  offeringKey: string,
  lookupKey: string,
): PurchasesPackage | null {
  if (!offerings?.all) return null;
  const offering = offerings.all[offeringKey];
  if (!offering) return null;
  return offering.availablePackages.find((p) => p.identifier === lookupKey) ?? null;
}

function packagePrice(pkg: PurchasesPackage | null): string {
  if (!pkg) return "—";
  return pkg.product?.priceString ?? "—";
}


// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ArenaShopScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ShopTab>("Coins");
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  const [giftTarget, setGiftTarget] = useState<{ id: string; name: string } | null>(null);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftPackKey, setGiftPackKey] = useState<string | null>(null);
  const [giftSearch, setGiftSearch] = useState("");

  const {
    offerings,
    customerInfo,
    purchase,
    isPurchaseAvailable,
    refetchCustomerInfo,
  } = useSubscription();

  const { data: walletData } = useQuery<{ glowCoins: number }>({
    queryKey: ["/api/arena/shop"],
    select: (d: Record<string, unknown>) => ({ glowCoins: Number(d?.glowCoins ?? 0) }),
  });

  const { data: passData, refetch: refetchPass } = useQuery<{ hasPass: boolean; expiresAt: string | null }>({
    queryKey: ["/api/arena/monetisation/arena-pass"],
  });

  const { data: spendingData } = useQuery<{ limit: number | null; spent: number; remaining: number | null }>({
    queryKey: ["/api/arena/monetisation/spending-limit"],
  });

  const { data: playerSearch } = useQuery<{ players: { id: string; name: string }[] }>({
    queryKey: ["/api/arena/players", giftSearch],
    enabled: giftSearch.length >= 2 && showGiftModal,
    queryFn: async () => {
      const url = new URL("/api/arena/players", getApiUrl());
      url.searchParams.set("q", giftSearch);
      const res = await fetch(url.toString(), { credentials: "include" });
      return res.json() as Promise<{ players: { id: string; name: string }[] }>;
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ endpoint, body }: { endpoint: string; body: object }) =>
      apiRequest("POST", endpoint, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arena/shop"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/monetisation/spending-limit"] });
      refetchCustomerInfo();
    },
  });

  const handlePurchase = useCallback(async (lookupKey: string, offeringKey = "arena") => {
    if (!isPurchaseAvailable) {
      Alert.alert("Not Available", "In-app purchases are not available on this device.");
      return;
    }
    const pkg = findRCPackage(offerings, offeringKey, lookupKey);
    if (!pkg) {
      Alert.alert("Product Unavailable", "This product is not available right now. Please try again later.");
      return;
    }

    setPurchasingKey(lookupKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const info = await purchase(pkg);

      if (lookupKey === "arena_pass_monthly") {
        // Subscription — no transactionId needed; verification is entitlement-based
        await verifyMutation.mutateAsync({
          endpoint: "/api/arena/monetisation/arena-pass/verify",
          body: {},
        });
        refetchPass();
      } else {
        // Consumable — extract real transaction ID from RC nonSubscriptionTransactions
        const storeProductId = pkg.product?.identifier ?? "";

        const nonSubTxns: PurchasesStoreTransaction[] = info?.nonSubscriptionTransactions ?? [];
        const matchingTxn =
          nonSubTxns.find((t) => t.productIdentifier === storeProductId) ?? nonSubTxns[0];
        const transactionId = matchingTxn?.transactionIdentifier ?? null;

        if (!transactionId) {
          throw new Error("Transaction ID not found. Please contact support if coins were not credited.");
        }

        if (lookupKey.startsWith("coins_")) {
          await verifyMutation.mutateAsync({
            endpoint: "/api/arena/monetisation/coins/verify",
            body: { productId: storeProductId, transactionId },
          });
        } else if (lookupKey.startsWith("pack_")) {
          await verifyMutation.mutateAsync({
            endpoint: "/api/arena/monetisation/pack/verify",
            body: { productId: storeProductId, transactionId },
          });
        } else if (lookupKey.startsWith("cosmetic_")) {
          await verifyMutation.mutateAsync({
            endpoint: "/api/arena/monetisation/cosmetic/verify",
            body: { productId: storeProductId, transactionId },
          });
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Purchase Complete", "Your purchase has been applied to your account.");
    } catch (err: unknown) {
      const e = err as { userCancelled?: boolean; message?: string };
      if (e?.userCancelled) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Purchase Failed", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setPurchasingKey(null);
    }
  }, [isPurchaseAvailable, offerings, purchase, verifyMutation, refetchPass]);

  const handleGiftPurchase = useCallback(async (lookupKey: string, recipientPlayerId: string) => {
    if (!isPurchaseAvailable) {
      Alert.alert("Not Available", "In-app purchases are not available on this device.");
      return;
    }
    const pkg = findRCPackage(offerings, "arena", lookupKey);
    if (!pkg) {
      Alert.alert("Product Unavailable", "This product is not available right now.");
      return;
    }

    setPurchasingKey("gift_" + lookupKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const info = await purchase(pkg);

      const storeProductId = pkg.product?.identifier ?? "";

      const nonSubTxns: PurchasesStoreTransaction[] = info?.nonSubscriptionTransactions ?? [];
      const matchingTxn =
        nonSubTxns.find((t) => t.productIdentifier === storeProductId) ?? nonSubTxns[0];
      const transactionId = matchingTxn?.transactionIdentifier ?? null;

      if (!transactionId) {
        throw new Error("Transaction ID not found. Please contact support.");
      }

      await apiRequest("POST", "/api/arena/monetisation/pack/gift", {
        productId: storeProductId,
        transactionId,
        recipientPlayerId,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Gift Sent!", "The pack has been delivered to their collection.");
      setShowGiftModal(false);
      setGiftTarget(null);
    } catch (err: unknown) {
      const e = err as { userCancelled?: boolean; message?: string };
      if (e?.userCancelled) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Gift Failed", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setPurchasingKey(null);
    }
  }, [isPurchaseAvailable, offerings, purchase]);

  const openGiftModal = useCallback((packKey: string) => {
    setGiftPackKey(packKey);
    setGiftTarget(null);
    setGiftSearch("");
    setShowGiftModal(true);
  }, []);

  const hasArenaPass =
    passData?.hasPass ||
    customerInfo?.entitlements?.active?.[ARENA_PASS_ENTITLEMENT_IDENTIFIER] !== undefined;

  const tabs: ShopTab[] = ["Coins", "Packs", "Arena Pass"];

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {/* Wallet Bar */}
      <View style={styles.walletBar}>
        <Feather name="circle" size={18} color={GlowColors.primary} />
        <Text style={styles.walletText}>{(walletData?.glowCoins ?? 0).toLocaleString()} Coins</Text>
        {spendingData?.limit != null && (
          <Text style={styles.limitText}>
            Limit: {spendingData.spent}/{spendingData.limit}
          </Text>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { setActiveTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "Coins" && (
          <CoinsTab
            bundles={COIN_BUNDLES}
            offerings={offerings}
            purchasingKey={purchasingKey}
            onPurchase={handlePurchase}
          />
        )}
        {activeTab === "Packs" && (
          <PacksTab
            tiers={PACK_TIERS}
            offerings={offerings}
            purchasingKey={purchasingKey}
            onPurchase={handlePurchase}
            onGift={openGiftModal}
          />
        )}
        {activeTab === "Arena Pass" && (
          <ArenaPassTab
            hasPass={hasArenaPass}
            expiresAt={passData?.expiresAt ?? null}
            offerings={offerings}
            purchasingKey={purchasingKey}
            onPurchase={handlePurchase}
          />
        )}
      </ScrollView>

      {/* Gift a Pack Modal */}
      <Modal visible={showGiftModal} transparent animationType="slide" onRequestClose={() => setShowGiftModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gift a Pack</Text>
              <Pressable onPress={() => setShowGiftModal(false)}>
                <Feather name="x" size={22} color={Colors.dark.text} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>Search for a player to send this pack to.</Text>
            <TextInput
              style={styles.giftSearchInput}
              placeholder="Search player name..."
              placeholderTextColor={Colors.dark.textSecondary}
              value={giftSearch}
              onChangeText={setGiftSearch}
              autoFocus
            />
            {giftTarget ? (
              <View style={styles.giftTargetRow}>
                <Feather name="user" size={18} color={GlowColors.primary} />
                <Text style={styles.giftTargetName}>{giftTarget.name}</Text>
                <Pressable onPress={() => setGiftTarget(null)} style={styles.giftClearBtn}>
                  <Feather name="x-circle" size={16} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={playerSearch?.players ?? []}
                keyExtractor={(item) => item.id}
                style={styles.giftList}
                renderItem={({ item }) => (
                  <Pressable style={styles.giftPlayerRow} onPress={() => { setGiftTarget(item); setGiftSearch(item.name); }}>
                    <Feather name="user" size={16} color={Colors.dark.textSecondary} />
                    <Text style={styles.giftPlayerName}>{item.name}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={giftSearch.length >= 2 ? <Text style={styles.emptyText}>No players found</Text> : null}
              />
            )}
            <Pressable
              style={[styles.giftConfirmBtn, (!giftTarget || purchasingKey !== null) && { opacity: 0.5 }]}
              disabled={!giftTarget || purchasingKey !== null}
              onPress={() => {
                if (giftTarget && giftPackKey) {
                  handleGiftPurchase(giftPackKey, giftTarget.id);
                }
              }}
            >
              {purchasingKey?.startsWith("gift_") ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.giftConfirmText}>
                  {giftTarget ? `Send pack to ${giftTarget.name}` : "Select a player first"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Coins Tab ─────────────────────────────────────────────────────────────────
function CoinsTab({ bundles, offerings, purchasingKey, onPurchase }: {
  bundles: CoinBundle[];
  offerings: PurchasesOfferings | null;
  purchasingKey: string | null;
  onPurchase: (key: string) => void;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>Coin Bundles</Text>
      <Text style={styles.sectionSubtitle}>Coins are used to purchase packs and arena perks.</Text>
      {bundles.map((b) => {
        const pkg = findRCPackage(offerings, "arena", b.lookupKey);
        const price = packagePrice(pkg);
        const isBuying = purchasingKey === b.lookupKey;
        return (
          <Pressable
            key={b.lookupKey}
            onPress={() => onPurchase(b.lookupKey)}
            disabled={isBuying}
            style={[styles.card, { borderLeftColor: b.accentColor, borderLeftWidth: 3 }]}
          >
            <View style={styles.cardLeft}>
              <Feather name="circle" size={28} color={b.accentColor} />
              <View style={{ marginLeft: Spacing.sm }}>
                <Text style={styles.cardTitle}>{b.label}</Text>
                {b.badge ? <Text style={[styles.badge, { color: b.accentColor }]}>{b.badge}</Text> : null}
              </View>
            </View>
            <View style={styles.cardRight}>
              {isBuying ? (
                <ActivityIndicator size="small" color={GlowColors.primary} />
              ) : (
                <Text style={[styles.priceText, { color: b.accentColor }]}>{price}</Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

// ── Packs Tab ─────────────────────────────────────────────────────────────────
function PacksTab({ tiers, offerings, purchasingKey, onPurchase, onGift }: {
  tiers: PackTier[];
  offerings: PurchasesOfferings | null;
  purchasingKey: string | null;
  onPurchase: (key: string) => void;
  onGift: (key: string) => void;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>Card Packs</Text>
      <Text style={styles.sectionSubtitle}>{"Each pack contains real player and coach cards. Tap \"Gift\" to send to a friend."}</Text>
      {tiers.map((t) => {
        const pkg = findRCPackage(offerings, "arena", t.lookupKey);
        const price = packagePrice(pkg);
        const isBuying = purchasingKey === t.lookupKey;
        return (
          <View key={t.lookupKey} style={[styles.packCard, { borderColor: t.accentColor }]}>
            <View style={[styles.packIconBg, { backgroundColor: t.accentColor + "33" }]}>
              <Feather name={t.icon as "archive"} size={24} color={t.accentColor} />
            </View>
            <View style={styles.packInfo}>
              <Text style={styles.packName}>{t.name}</Text>
              <Text style={styles.packDesc}>{t.description}</Text>
              <Text style={[styles.packGuarantee, { color: t.accentColor }]}>Guarantees: {t.guarantees}</Text>
            </View>
            <View style={styles.packActions}>
              <Pressable
                onPress={() => onPurchase(t.lookupKey)}
                disabled={isBuying}
                style={[styles.buyBtn, { backgroundColor: t.accentColor }]}
              >
                {isBuying ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buyBtnText}>{price}</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => onGift(t.lookupKey)}
                disabled={purchasingKey !== null}
                style={styles.giftBtn}
              >
                <Feather name="gift" size={14} color={GlowColors.primary} />
                <Text style={styles.giftBtnText}>Gift</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </>
  );
}

// ── Arena Pass Tab ────────────────────────────────────────────────────────────
function ArenaPassTab({ hasPass, expiresAt, offerings, purchasingKey, onPurchase }: {
  hasPass: boolean;
  expiresAt: string | null;
  offerings: PurchasesOfferings | null;
  purchasingKey: string | null;
  onPurchase: (key: string) => void;
}) {
  const pkg = findRCPackage(offerings, "arena", "arena_pass_monthly");
  const price = packagePrice(pkg);
  const isBuying = purchasingKey === "arena_pass_monthly";

  return (
    <>
      <View style={styles.passHero}>
        <Feather name="shield" size={48} color={GlowColors.primary} />
        <Text style={styles.passTitle}>Arena Pass</Text>
        <Text style={styles.passSubtitle}>Unlock the full arena experience for {price}/month</Text>
        {hasPass ? (
          <View style={styles.passActiveBadge}>
            <Feather name="check-circle" size={16} color={GlowColors.primary} />
            <Text style={styles.passActiveText}>Active{expiresAt ? ` · Renews ${new Date(expiresAt).toLocaleDateString()}` : ""}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.perksContainer}>
        <Text style={styles.perksTitle}>What you get:</Text>
        {PASS_PERKS.map((perk, i) => (
          <View key={i} style={styles.perkRow}>
            <Feather name="check" size={14} color={GlowColors.primary} />
            <Text style={styles.perkText}>{perk}</Text>
          </View>
        ))}
      </View>

      {!hasPass ? (
        <Pressable
          onPress={() => onPurchase("arena_pass_monthly")}
          disabled={isBuying}
          style={styles.passButton}
        >
          {isBuying ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Text style={styles.passButtonText}>Subscribe for {price}/month</Text>
              <Text style={styles.passButtonSub}>Cancel anytime</Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={[styles.passButton, { backgroundColor: Colors.dark.chipBackground }]}>
          <Text style={[styles.passButtonText, { color: GlowColors.primary }]}>Arena Pass Active</Text>
        </View>
      )}

      <Text style={styles.legalText}>
        Subscription auto-renews monthly at {price}. Cancel at any time in your device settings.
        Payment is charged to your account at purchase confirmation.
      </Text>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  walletBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  walletText:     { color: Colors.dark.text, fontWeight: "700", fontSize: 15, flex: 1 },
  limitText:      { color: Colors.dark.textSecondary, fontSize: 12 },
  tabRow: {
    flexDirection: "row", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.dark.chipBackground, alignItems: "center",
  },
  tabActive:      { backgroundColor: GlowColors.primary },
  tabText:        { color: Colors.dark.textSecondary, fontWeight: "600", fontSize: 13 },
  tabTextActive:  { color: "#000" },
  content:        { padding: Spacing.md, gap: Spacing.sm },
  sectionTitle:   { color: Colors.dark.text, fontSize: 20, fontWeight: "700", marginBottom: 4 },
  sectionSubtitle: { color: Colors.dark.textSecondary, fontSize: 13, marginBottom: Spacing.sm },
  card: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 12,
    padding: Spacing.md, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 8,
  },
  cardLeft:       { flexDirection: "row", alignItems: "center", flex: 1 },
  cardRight:      { minWidth: 60, alignItems: "flex-end" },
  cardTitle:      { color: Colors.dark.text, fontSize: 15, fontWeight: "600" },
  badge:          { fontSize: 11, fontWeight: "700", marginTop: 2 },
  priceText:      { fontSize: 16, fontWeight: "700" },
  packCard: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 12, borderWidth: 1,
    padding: Spacing.md, flexDirection: "row", alignItems: "center", marginBottom: 10, gap: Spacing.sm,
  },
  packIconBg:     { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  packInfo:       { flex: 1 },
  packName:       { color: Colors.dark.text, fontSize: 15, fontWeight: "700" },
  packDesc:       { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  packGuarantee:  { fontSize: 12, fontWeight: "600", marginTop: 3 },
  packActions:    { alignItems: "flex-end", gap: 6 },
  buyBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: "center", minWidth: 64 },
  buyBtnText:     { color: "#fff", fontWeight: "700", fontSize: 13 },
  giftBtn:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: GlowColors.primary },
  giftBtnText:    { color: GlowColors.primary, fontSize: 12, fontWeight: "600" },
  passHero:       { alignItems: "center", paddingVertical: Spacing.xl, gap: Spacing.sm },
  passTitle:      { color: Colors.dark.text, fontSize: 28, fontWeight: "800" },
  passSubtitle:   { color: Colors.dark.textSecondary, fontSize: 14, textAlign: "center" },
  passActiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: GlowColors.primary + "22", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  passActiveText: { color: GlowColors.primary, fontWeight: "700", fontSize: 13 },
  perksContainer: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 14, padding: Spacing.md, gap: 10, marginBottom: Spacing.md,
  },
  perksTitle:     { color: Colors.dark.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  perkRow:        { flexDirection: "row", alignItems: "center", gap: 10 },
  perkText:       { color: Colors.dark.textSecondary, fontSize: 14, flex: 1 },
  passButton: {
    backgroundColor: GlowColors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginBottom: Spacing.sm,
  },
  passButtonText: { color: "#000", fontWeight: "800", fontSize: 16 },
  passButtonSub:  { color: "#000", fontSize: 11, opacity: 0.7, marginTop: 2 },
  legalText: {
    color: Colors.dark.textSecondary, fontSize: 11, textAlign: "center",
    lineHeight: 16, paddingHorizontal: Spacing.md,
  },
  // Gift Modal
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: Colors.dark.backgroundCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, paddingBottom: Spacing.xl + 20,
  },
  modalHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.sm },
  modalTitle:     { color: Colors.dark.text, fontSize: 20, fontWeight: "700" },
  modalSubtitle:  { color: Colors.dark.textSecondary, fontSize: 13, marginBottom: Spacing.sm },
  giftSearchInput: {
    backgroundColor: Colors.dark.backgroundRoot, color: Colors.dark.text,
    borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: 15, marginBottom: Spacing.sm,
  },
  giftList:       { maxHeight: 180, marginBottom: Spacing.sm },
  giftPlayerRow:  { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  giftPlayerName: { color: Colors.dark.text, fontSize: 15 },
  giftTargetRow:  { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: 10, marginBottom: Spacing.sm },
  giftTargetName: { color: Colors.dark.text, fontSize: 15, fontWeight: "600", flex: 1 },
  giftClearBtn:   { padding: 4 },
  giftConfirmBtn: {
    backgroundColor: GlowColors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center",
  },
  giftConfirmText: { color: "#000", fontWeight: "700", fontSize: 15 },
  emptyText:      { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: Spacing.sm },
});
