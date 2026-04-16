import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  LayoutAnimation,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Animated, { FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";

type CreditType = "group" | "private" | "semi_private";

interface Package {
  id: string;
  playerId: string;
  creditType?: CreditType;
  totalCredits: number;
  remainingCredits: number;
  price?: string;
  pricePerCredit?: string;
  currency?: string;
  purchaseDate?: string;
  expiryDate: string | null;
}

interface AcademyPricing {
  id: string;
  sessionType: string;
  pricePerSession: string;
  currency: string;
}

interface PackagesCardProps {
  playerId: string;
  playerName: string;
}

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  group: "Group",
  private: "Private",
  semi_private: "Semi-Private",
};

const CREDIT_TYPE_ICONS: Record<CreditType, string> = {
  group: "people",
  private: "person",
  semi_private: "people-outline",
};

function PackageItemRow({ pkg, onDelete, effectiveRemaining }: { pkg: Package; onDelete: (pkg: Package) => void; effectiveRemaining?: number }) {
  const creditType = (pkg.creditType || "group") as CreditType;
  const displayRemaining = effectiveRemaining !== undefined ? Math.max(0, effectiveRemaining) : Math.max(0, pkg.remainingCredits);
  const safeRemaining = displayRemaining;
  const progressPercent = pkg.totalCredits > 0 ? (safeRemaining / pkg.totalCredits) * 100 : 0;
  const isDepleted = safeRemaining <= 0;
  const expired = pkg.expiryDate ? new Date(pkg.expiryDate) < new Date() : false;
  const typeColor = creditType === "private" ? Colors.dark.sessionPrivate
    : creditType === "semi_private" ? Colors.dark.sessionSemiPrivate
    : Colors.dark.sessionGroup;

  const formatExpiryDate = (date: string | null) => {
    if (!date) return "No expiry";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <View
      style={[
        styles.packageItem,
        isDepleted && styles.packageItemDepleted,
        expired && styles.packageItemExpired,
      ]}
    >
      <View style={styles.packageHeader}>
        <View style={styles.packageTitleRow}>
          <View style={[styles.packageTypeBadge, { backgroundColor: typeColor + "20" }]}>
            <Text style={[styles.packageTypeText, { color: typeColor }]}>
              {CREDIT_TYPE_LABELS[creditType]}
            </Text>
          </View>
          {isDepleted && !expired ? (
            <View style={styles.depletedBadge}>
              <Text style={styles.depletedBadgeText}>Depleted</Text>
            </View>
          ) : null}
          {expired ? (
            <View style={styles.expiredBadge}>
              <Text style={styles.expiredBadgeText}>Expired</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => onDelete(pkg)}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.buttonPressed]}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
        </Pressable>
      </View>

      <View style={styles.packageCreditsSection}>
        <Text style={styles.creditsLabel}>Credits</Text>
        <View style={styles.creditsDisplay}>
          <Text style={[styles.creditsRemaining, isDepleted && styles.creditsDepleted]}>
            {formatCredits(safeRemaining)}
          </Text>
          <Text style={styles.creditsTotal}>/ {formatCredits(pkg.totalCredits)}</Text>
        </View>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${progressPercent}%`,
                backgroundColor: isDepleted || expired ? Colors.dark.disabled : typeColor,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.packageFooter}>
        <Ionicons name="calendar-outline" size={12} color={Colors.dark.tabIconDefault} />
        <Text style={[styles.expiryText, expired && styles.expiryTextExpired]}>
          {expired ? "Expired " : "Valid until "}
          {formatExpiryDate(pkg.expiryDate)}
        </Text>
      </View>
    </View>
  );
}

const BUNDLE_OPTIONS = [1, 5, 10, 20] as const;

const BUNDLE_DISCOUNTS: Record<number, number> = {
  1: 0,
  5: 0,
  10: 0,
  20: 0,
};

export default function PackagesCard({ playerId, playerName }: PackagesCardProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalCredits, setTotalCredits] = useState("10");
  const [expiryMonths, setExpiryMonths] = useState("12");
  const [creditType, setCreditType] = useState<CreditType>("group");
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [isPaid, setIsPaid] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<Package | null>(null);
  const [showForceDeleteModal, setShowForceDeleteModal] = useState(false);
  const [forceDeleteInfo, setForceDeleteInfo] = useState<{ packageId: string; creditsUsed: number; remainingCredits?: number } | null>(null);
  
  // Credit Store accordion state
  const [expandedType, setExpandedType] = useState<CreditType | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<{ type: CreditType; amount: number } | null>(null);
  const [showPastPackages, setShowPastPackages] = useState(false);
  
  const toggleCreditType = useCallback((type: CreditType) => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    if (expandedType === type) {
      setExpandedType(null);
      setSelectedBundle(null);
    } else {
      setExpandedType(type);
      setSelectedBundle(null);
    }
  }, [expandedType]);

  const { data: packages = [], isLoading } = useQuery<Package[]>({
    queryKey: [`/api/players/${playerId}/packages`],
  });

  const { data: creditBalance } = useQuery<{
    group: number;
    semi_private: number;
    private: number;
    totalDebt: number;
    hasDebt: boolean;
    uncoveredSessions: { group: number; semi_private: number; private: number };
    hasUncoveredSessions: boolean;
  }>({
    queryKey: [`/api/players/${playerId}/credit-balance`],
  });

  const { data: pricing = [] } = useQuery<AcademyPricing[]>({
    queryKey: ["/api/owner/academy/pricing"],
  });

  const pricePerCredit = useMemo(() => {
    const found = pricing.find((p) => p.sessionType === creditType);
    return found ? Number(found.pricePerSession) : 0;
  }, [pricing, creditType]);

  const currency = useMemo(() => {
    const found = pricing.find((p) => p.sessionType === creditType);
    return found?.currency || "AED";
  }, [pricing, creditType]);

  const calculatedTotal = useMemo(() => {
    const credits = parseInt(totalCredits, 10);
    if (isNaN(credits) || credits <= 0) return 0;
    return pricePerCredit * credits;
  }, [totalCredits, pricePerCredit]);
  
  // Calculate bundle pricing with discounts
  const getBundlePrice = useCallback((type: CreditType, amount: number) => {
    const basePrice = pricing.find((p) => p.sessionType === type);
    if (!basePrice) return { total: 0, perCredit: 0, discount: 0, originalTotal: 0 };
    const pricePerSession = Number(basePrice.pricePerSession);
    const originalTotal = pricePerSession * amount;
    const discount = BUNDLE_DISCOUNTS[amount] || 0;
    const discountedTotal = originalTotal * (1 - discount / 100);
    const discountedPerCredit = discountedTotal / amount;
    return { 
      total: discountedTotal, 
      perCredit: discountedPerCredit, 
      discount, 
      originalTotal,
      currency: basePrice.currency || "AED"
    };
  }, [pricing]);
  
  const getTypeColor = (type: CreditType) => {
    return type === "private" ? Colors.dark.sessionPrivate 
      : type === "semi_private" ? Colors.dark.sessionSemiPrivate 
      : Colors.dark.sessionGroup;
  };

  const activePackages = packages.filter(
    (p) => p.remainingCredits > 0 && (!p.expiryDate || new Date(p.expiryDate) >= new Date())
  );

  const pastPackages = packages.filter(
    (p) => p.remainingCredits <= 0 || (p.expiryDate !== null && new Date(p.expiryDate) < new Date())
  );

  const totalRemaining = activePackages.reduce((sum, p) => sum + Math.max(0, p.remainingCredits), 0);

  const creditsByType = useMemo(() => {
    const byType: Record<CreditType, number> = { group: 0, private: 0, semi_private: 0 };
    activePackages.forEach((p) => {
      const type = (p.creditType || "group") as CreditType;
      byType[type] += Math.max(0, p.remainingCredits);
    });
    return byType;
  }, [activePackages]);

  const depletedByType = useMemo(() => {
    const byType: Record<CreditType, boolean> = { group: false, private: false, semi_private: false };
    pastPackages.forEach((p) => {
      if (p.remainingCredits <= 0) {
        const type = (p.creditType || "group") as CreditType;
        byType[type] = true;
      }
    });
    return byType;
  }, [pastPackages]);

  const effectiveRemainingByPkgId = useMemo(() => {
    const result: Record<string, number> = {};
    if (!creditBalance) {
      activePackages.forEach((p) => { result[p.id] = p.remainingCredits; });
      return result;
    }
    const debtByType: Record<CreditType, number> = {
      group: Math.max(0, creditsByType.group - creditBalance.group),
      private: Math.max(0, creditsByType.private - creditBalance.private),
      semi_private: Math.max(0, creditsByType.semi_private - creditBalance.semi_private),
    };
    const remainingDebt = { ...debtByType };
    const sortedPackages = [...activePackages].sort((a, b) => {
      const aDate = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
      const bDate = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
      return aDate - bDate;
    });
    sortedPackages.forEach((p) => {
      const type = (p.creditType || "group") as CreditType;
      const debt = Math.min(remainingDebt[type], Math.max(0, p.remainingCredits));
      result[p.id] = p.remainingCredits - debt;
      remainingDebt[type] -= debt;
    });
    return result;
  }, [activePackages, creditBalance, creditsByType]);

  const createMutation = useMutation({
    mutationFn: async (data: { 
      playerId: string; 
      totalCredits: number; 
      creditType: CreditType;
      purchasedAt?: string;
      expiryMonths: number;
    }) => {
      const response = await apiRequest("POST", "/api/packages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowAddModal(false);
      setTotalCredits("10");
      setExpiryMonths("12");
      setCreditType("group");
      setIsPaid(false);
      setPurchaseDate(new Date());
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add package");
    },
  });


  const deleteMutation = useMutation({
    mutationFn: async ({ packageId, force }: { packageId: string; force?: boolean }): Promise<{ success: boolean; error?: string; creditsUsed?: number }> => {
      const url = force ? `/api/packages/${packageId}?force=true` : `/api/packages/${packageId}`;
      const baseUrl = getApiUrl();
      const fullUrl = new URL(url, baseUrl);
      
      const response = await fetch(fullUrl, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error, creditsUsed: data.creditsUsed };
      }
      return { success: true };
    },
    onSuccess: (data, variables) => {
      if (!data.success && data.creditsUsed !== undefined) {
        // Show force delete confirmation modal (works on web unlike Alert.alert)
        const remainingMatch = data.error?.match(/Cannot delete: (\d+) unused/);
        const remainingCredits = remainingMatch ? parseInt(remainingMatch[1], 10) : undefined;
        setForceDeleteInfo({ packageId: variables.packageId, creditsUsed: data.creditsUsed, remainingCredits });
        setShowForceDeleteModal(true);
        return;
      }
      
      if (!data.success) {
        if (Platform.OS === "web") {
          window.alert(data.error || "Failed to delete package");
        } else {
          Alert.alert("Error", data.error || "Failed to delete package");
        }
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete package");
    },
  });

  const handleAddPackage = () => {
    const credits = parseInt(totalCredits, 10);
    if (isNaN(credits) || credits <= 0) {
      Alert.alert("Error", "Please enter a valid number of credits");
      return;
    }

    const months = parseInt(expiryMonths, 10);
    createMutation.mutate({ 
      playerId, 
      totalCredits: credits, 
      creditType,
      purchasedAt: isPaid ? purchaseDate.toISOString() : undefined,
      expiryMonths: isNaN(months) || months <= 0 ? 12 : months,
    });
  };
  
  const handleSelectBundle = (type: CreditType, amount: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedBundle({ type, amount });
  };
  
  const handleAddBundle = () => {
    if (!selectedBundle) return;
    
    createMutation.mutate({
      playerId,
      totalCredits: selectedBundle.amount,
      creditType: selectedBundle.type,
      purchasedAt: undefined, // Create as pending invoice
      expiryMonths: 12,
    });
    
    // Reset state after adding
    setSelectedBundle(null);
    setExpandedType(null);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  const [isRepairing, setIsRepairing] = useState(false);
  
  const repairMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/coach/players/${playerId}/repair-credits`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setIsRepairing(false);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("Credits Repaired", `Processed ${data.consumed || 0} session(s), ${data.debts || 0} debt(s)`);
    },
    onError: (error: Error) => {
      setIsRepairing(false);
      Alert.alert("Error", error.message || "Failed to repair credits");
    },
  });

  const handleRepairCredits = () => {
    Alert.alert(
      "Repair Credits",
      "This will recalculate credits from all past sessions. Use this if credits don't match attendance records.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Repair", 
          onPress: () => {
            setIsRepairing(true);
            repairMutation.mutate();
          }
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleDeletePackage = (pkg: Package) => {
    setPackageToDelete(pkg);
    setShowDeleteConfirm(true);
  };

  const confirmDeletePackage = () => {
    if (packageToDelete) {
      deleteMutation.mutate({ packageId: packageToDelete.id });
      setShowDeleteConfirm(false);
      setPackageToDelete(null);
    }
  };

  const formatExpiryDate = (date: string | null) => {
    if (!date) return "No expiry";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={[Colors.dark.gold + "40", Colors.dark.primary + "20", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardBorder}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="ticket" size={20} color={Colors.dark.gold} />
              </View>
              <Text style={styles.title}>Packages</Text>
            </View>
            <View style={styles.headerButtons}>
              <Pressable 
                onPress={handleRepairCredits} 
                style={[styles.repairButton, isRepairing && styles.repairButtonDisabled]}
                disabled={isRepairing}
              >
                <Ionicons 
                  name={isRepairing ? "sync" : "build-outline"} 
                  size={18} 
                  color={isRepairing ? Colors.dark.disabled : Colors.dark.xpCyan} 
                />
              </Pressable>
              <Pressable onPress={() => setShowAddModal(true)} style={styles.addButton}>
                <LinearGradient
                  colors={[Colors.dark.primary + "30", Colors.dark.xpCyan + "20"]}
                  style={styles.addButtonGradient}
                >
                  <Ionicons name="add" size={20} color={Colors.dark.primary} />
                </LinearGradient>
              </Pressable>
            </View>
          </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activePackages.length}</Text>
          <Text style={styles.summaryLabel}>
            {activePackages.length === 0 && creditBalance?.hasUncoveredSessions
              ? `0 Packages — ${(creditBalance.uncoveredSessions?.group ?? 0) + (creditBalance.uncoveredSessions?.semi_private ?? 0) + (creditBalance.uncoveredSessions?.private ?? 0)} sessions owed`
              : "Active Packages"}
          </Text>
        </View>
      </View>

      <View style={styles.creditTypeRow}>
        {(["group", "private", "semi_private"] as CreditType[]).map((type) => {
          const rawBalance = creditBalance ? creditBalance[type] : creditsByType[type];
          const uncovered = creditBalance?.uncoveredSessions?.[type] ?? 0;
          const balance = rawBalance - uncovered;
          const isDebt = balance < 0;
          const isZeroWithDepletedPackage = balance === 0 && depletedByType[type];
          const dynamicColor = isDebt
            ? Colors.dark.error
            : isZeroWithDepletedPackage
            ? Colors.dark.gold
            : balance === 0
            ? Colors.dark.error
            : balance <= 2
            ? Colors.dark.gold
            : "#22c55e";
          return (
            <View key={type} style={styles.creditTypeItem}>
              <Text style={[styles.creditTypeValue, { color: dynamicColor }]}>
                {isZeroWithDepletedPackage ? "Dep." : balance}
              </Text>
              <Text style={styles.creditTypeLabel}>{CREDIT_TYPE_LABELS[type]}</Text>
            </View>
          );
        })}
      </View>

      {creditBalance?.hasUncoveredSessions ? (
        <>
          <View style={styles.debtExplanation}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.dark.error} />
            <Text style={styles.debtExplanationText}>
              {(() => {
                const parts: string[] = [];
                const g = creditBalance.uncoveredSessions?.group ?? 0;
                const sp = creditBalance.uncoveredSessions?.semi_private ?? 0;
                const pr = creditBalance.uncoveredSessions?.private ?? 0;
                if (g > 0) parts.push(`${g} group`);
                if (sp > 0) parts.push(`${sp} semi-private`);
                if (pr > 0) parts.push(`${pr} private`);
                return parts.length > 0 ? `${parts.join(", ")} session(s) attended without active package` : "";
              })()}
            </Text>
          </View>
          <View style={styles.owedHint}>
            <Ionicons name="alert-circle-outline" size={12} color={Colors.dark.gold} />
            <Text style={styles.owedHintText}>Sessions attended without credit — add a package to cover these</Text>
          </View>
        </>
      ) : creditBalance && (creditBalance.group < 0 || creditBalance.semi_private < 0 || creditBalance.private < 0) ? (
        <View style={styles.debtExplanation}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.dark.error} />
          <Text style={styles.debtExplanationText}>
            {(() => {
              const parts: string[] = [];
              if (creditBalance.group < 0) parts.push(`${Math.abs(creditBalance.group)} group`);
              if (creditBalance.semi_private < 0) parts.push(`${Math.abs(creditBalance.semi_private)} semi-private`);
              if (creditBalance.private < 0) parts.push(`${Math.abs(creditBalance.private)} private`);
              return `${parts.join(", ")} session(s) attended without active package`;
            })()}
          </Text>
        </View>
      ) : null}

      {packages.length === 0 && !isLoading ? (
        <View style={styles.emptyState}>
          {creditBalance?.hasUncoveredSessions ? (
            <View style={styles.owedBanner}>
              <Ionicons name="warning-outline" size={16} color={Colors.dark.gold} />
              <Text style={styles.owedBannerText}>
                {`This player attended ${(creditBalance.uncoveredSessions?.group ?? 0) + (creditBalance.uncoveredSessions?.semi_private ?? 0) + (creditBalance.uncoveredSessions?.private ?? 0)} session(s) without credit coverage. Add a package to settle the balance.`}
              </Text>
            </View>
          ) : null}
          <Text style={styles.emptyText}>No packages</Text>
          <Pressable onPress={() => setShowAddModal(true)} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Add Package</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.packagesList}>
          {activePackages.map((pkg) => (
            <PackageItemRow
              key={pkg.id}
              pkg={pkg}
              onDelete={handleDeletePackage}
              effectiveRemaining={effectiveRemainingByPkgId[pkg.id]}
            />
          ))}

          {pastPackages.length > 0 ? (
            <View>
              <Pressable
                style={styles.pastPackagesToggle}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  setShowPastPackages((v) => !v);
                }}
              >
                <Text style={styles.pastPackagesToggleText}>
                  Past Packages ({pastPackages.length})
                </Text>
                <Ionicons
                  name={showPastPackages ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Colors.dark.tabIconDefault}
                />
              </Pressable>
              {showPastPackages ? pastPackages.map((pkg) => (
                <PackageItemRow
                  key={pkg.id}
                  pkg={pkg}
                  onDelete={handleDeletePackage}
                />
              )) : null}
            </View>
          ) : null}
        </View>
      )}

      <Modal visible={showAddModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.creditStoreContent}>
              <View style={styles.creditStoreHeader}>
                <View style={styles.creditStoreIconContainer}>
                  <Ionicons name="storefront" size={24} color={Colors.dark.gold} />
                </View>
                <View>
                  <Text style={styles.creditStoreTitle}>Credit Store</Text>
                  <Text style={styles.creditStoreSubtitle}>Add credits for {playerName}</Text>
                </View>
                <Pressable 
                  onPress={() => {
                    setShowAddModal(false);
                    setExpandedType(null);
                    setSelectedBundle(null);
                  }} 
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={Colors.dark.tabIconDefault} />
                </Pressable>
              </View>

              <View style={styles.accordionContainer}>
                {(["group", "semi_private", "private"] as CreditType[]).map((type) => {
                  const isExpanded = expandedType === type;
                  const typeColor = getTypeColor(type);
                  const basePrice = pricing.find((p) => p.sessionType === type);
                  const pricePerSession = basePrice ? Number(basePrice.pricePerSession) : 0;
                  const currencySymbol = basePrice?.currency || "AED";
                  
                  return (
                    <View key={type} style={styles.accordionItem}>
                      <Pressable 
                        style={[
                          styles.accordionHeader, 
                          isExpanded && styles.accordionHeaderExpanded,
                          { borderLeftColor: typeColor }
                        ]} 
                        onPress={() => toggleCreditType(type)}
                      >
                        <View style={styles.accordionHeaderLeft}>
                          <View style={[styles.accordionIcon, { backgroundColor: typeColor + "20" }]}>
                            <Ionicons 
                              name={CREDIT_TYPE_ICONS[type] as any} 
                              size={20} 
                              color={typeColor} 
                            />
                          </View>
                          <View>
                            <Text style={styles.accordionTitle}>{CREDIT_TYPE_LABELS[type]}</Text>
                            <Text style={styles.accordionPrice}>
                              {pricePerSession > 0 ? `${currencySymbol} ${pricePerSession}/credit` : "Not configured"}
                            </Text>
                          </View>
                        </View>
                        <Ionicons 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={20} 
                          color={Colors.dark.tabIconDefault} 
                        />
                      </Pressable>
                      
                      {isExpanded ? (
                        <Animated.View 
                          entering={FadeInDown.duration(200)} 
                          style={styles.bundleGrid}
                        >
                          {BUNDLE_OPTIONS.map((amount) => {
                            const bundlePrice = getBundlePrice(type, amount);
                            const isSelected = selectedBundle?.type === type && selectedBundle?.amount === amount;
                            
                            return (
                              <Pressable 
                                key={amount} 
                                style={[
                                  styles.bundleCard,
                                  isSelected && styles.bundleCardSelected,
                                  isSelected && { borderColor: typeColor }
                                ]}
                                onPress={() => handleSelectBundle(type, amount)}
                              >
                                <View style={styles.bundleAmount}>
                                  <Text style={[styles.bundleNumber, isSelected && { color: typeColor }]}>
                                    {amount}
                                  </Text>
                                  <Text style={styles.bundleLabel}>credits</Text>
                                </View>
                                
                                <View style={styles.bundlePricing}>
                                  <Text style={[styles.bundleTotal, isSelected && { color: typeColor }]}>
                                    {bundlePrice.currency} {bundlePrice.total.toFixed(0)}
                                  </Text>
                                  <Text style={styles.perCreditPrice}>
                                    {bundlePrice.currency} {bundlePrice.perCredit.toFixed(0)}/ea
                                  </Text>
                                </View>
                                
                                {isSelected ? (
                                  <View style={[styles.selectedIndicator, { backgroundColor: typeColor }]}>
                                    <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                                  </View>
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </Animated.View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {selectedBundle ? (
                <Animated.View entering={FadeIn.duration(200)} style={styles.selectedSummary}>
                  <View style={styles.summaryDetails}>
                    <Text style={styles.summaryLabel}>Selected:</Text>
                    <Text style={styles.summaryText}>
                      {selectedBundle.amount}x {CREDIT_TYPE_LABELS[selectedBundle.type]} Credits
                    </Text>
                    <Text style={[styles.summaryTotal, { color: getTypeColor(selectedBundle.type) }]}>
                      {getBundlePrice(selectedBundle.type, selectedBundle.amount).currency}{" "}
                      {getBundlePrice(selectedBundle.type, selectedBundle.amount).total.toFixed(2)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleAddBundle}
                    disabled={createMutation.isPending}
                    style={[styles.addBundleButton, { backgroundColor: getTypeColor(selectedBundle.type) }]}
                  >
                    <Text style={styles.addBundleButtonText}>
                      {createMutation.isPending ? "Adding..." : "Add Credits"}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
                  </Pressable>
                </Animated.View>
              ) : null}

              <Text style={styles.creditStoreNote}>
                Credits expire after 12 months. A pending invoice will be created.
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showDeleteConfirm} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.modalTitle}>Delete Package</Text>
            {packageToDelete && (
              <Text style={styles.deleteMessage}>
                {(() => {
                  const safeRem = Math.max(0, packageToDelete.remainingCredits);
                  const used = packageToDelete.totalCredits - safeRem;
                  return used > 0
                    ? `This package has ${formatCredits(used)} used and ${formatCredits(safeRem)} remaining credits. Delete it?`
                    : `Delete this package with ${formatCredits(safeRem)} credits?`;
                })()}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <Pressable 
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setPackageToDelete(null);
                }} 
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeletePackage}
                disabled={deleteMutation.isPending}
                style={styles.deleteConfirmButton}
              >
                <Text style={styles.deleteConfirmButtonText}>
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Force Delete Confirmation Modal - Works on web unlike Alert.alert */}
      <Modal visible={showForceDeleteModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.modalTitle}>{forceDeleteInfo && forceDeleteInfo.creditsUsed === 0 ? "Remove Unused Credits" : "Sessions Become Debts"}</Text>
            {forceDeleteInfo && (
              <Text style={styles.deleteMessage}>
                {forceDeleteInfo.creditsUsed === 0
                  ? `This will permanently remove ${forceDeleteInfo.remainingCredits !== undefined ? forceDeleteInfo.remainingCredits : "the"} unused credit${forceDeleteInfo.remainingCredits !== 1 ? "s" : ""}.`
                  : `${forceDeleteInfo.creditsUsed} used credit${forceDeleteInfo.creditsUsed !== 1 ? "s" : ""} will be converted to a debt for ${playerName}. They will need a new package to settle it. This also removes any associated billing records.`}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <Pressable 
                onPress={() => {
                  setShowForceDeleteModal(false);
                  setForceDeleteInfo(null);
                }} 
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (forceDeleteInfo) {
                    setShowForceDeleteModal(false);
                    try {
                      const result = await deleteMutation.mutateAsync({ packageId: forceDeleteInfo.packageId, force: true });
                      if (result.success) {
                        queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
                        queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
                        queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                        if (Platform.OS !== "web") {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                      }
                    } catch (e) {
                      // Error handled by mutation's onError
                    }
                  }
                  setForceDeleteInfo(null);
                }}
                disabled={deleteMutation.isPending}
                style={styles.deleteConfirmButton}
              >
                <Text style={styles.deleteConfirmButtonText}>
                  {deleteMutation.isPending ? "Deleting..." : "Delete Anyway"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.gold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  cardBorder: {
    borderRadius: BorderRadius.lg,
    padding: 1,
  },
  card: {
    backgroundColor: "rgba(20,20,20,0.95)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  repairButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.xpCyan + "15",
  },
  repairButtonDisabled: {
    opacity: 0.5,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  addButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  addButtonGradient: {
    padding: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  summaryValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  debtValue: {
    color: Colors.dark.error,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing.lg,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  emptyButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
  },
  emptyButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  packagesList: {
    gap: Spacing.md,
  },
  packageItem: {
    padding: Spacing.lg,
    backgroundColor: "rgba(30,30,30,0.9)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  packageItemDepleted: {
    opacity: 0.65,
    borderColor: Colors.dark.disabled + "30",
  },
  packageItemExpired: {
    opacity: 0.65,
    borderColor: Colors.dark.error + "30",
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  packageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  packageCreditsSection: {
    marginBottom: Spacing.md,
  },
  creditsLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  creditsDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  creditsRemaining: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  creditsDepleted: {
    color: Colors.dark.disabled,
  },
  creditsTotal: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    marginLeft: Spacing.xs,
  },
  progressBarContainer: {
    marginBottom: Spacing.md,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  packageFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  expiryText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  expiryTextExpired: {
    color: Colors.dark.error,
  },
  expiredBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: BorderRadius.xs,
  },
  expiredBadgeText: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontSize: 10,
    fontWeight: "600",
  },
  depletedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.dark.warning + "20",
    borderRadius: BorderRadius.xs,
  },
  depletedBadgeText: {
    ...Typography.caption,
    color: Colors.dark.warning,
    fontSize: 10,
    fontWeight: "600",
  },
  pastPackagesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border + "40",
  },
  pastPackagesToggleText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  deleteButton: {
    padding: Spacing.sm,
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#0B0D10",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
  },
  deleteModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "90%",
    maxWidth: 360,
  },
  deleteMessage: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteConfirmButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  cancelButtonText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  confirmButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  confirmGradient: {
    padding: Spacing.md,
    alignItems: "center",
  },
  confirmButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  creditTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  creditTypeItem: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
  },
  creditTypeValue: {
    ...Typography.h4,
    color: Colors.dark.xpCyan,
  },
  creditTypeLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
  debtExplanation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.md,
  },
  debtExplanationText: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontSize: 11,
    flex: 1,
  },
  owedSessionsSection: {
    marginBottom: Spacing.md,
    gap: 6,
  },
  owedSessionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  owedChip: {
    backgroundColor: "#EF444430",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  owedChipText: {
    ...Typography.caption,
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  owedHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  owedHintText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontSize: 11,
    flex: 1,
  },
  owedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.dark.gold + "20",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  owedBannerText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  packageTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.xs,
  },
  packageTypeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 10,
  },
  modalScroll: {
    flex: 1,
    width: "100%",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  creditTypeSelector: {
    gap: Spacing.sm,
  },
  creditTypeOption: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  creditTypeOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  creditTypeOptionText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  creditTypeOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  creditTypePrice: {
    ...Typography.caption,
    color: Colors.dark.gold,
    marginTop: Spacing.xs,
  },
  paidToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.primary,
  },
  paidToggleText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  pendingInvoiceNote: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontStyle: "italic",
    marginBottom: Spacing.sm,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  datePickerText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  totalSection: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  totalLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  totalValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
    marginTop: Spacing.xs,
  },
  
  // Credit Store Styles
  creditStoreContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  creditStoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  creditStoreIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  creditStoreTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  creditStoreSubtitle: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  closeButton: {
    marginLeft: "auto",
    padding: Spacing.sm,
  },
  accordionContainer: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  accordionItem: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.primary,
  },
  accordionHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  accordionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  accordionIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  accordionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  accordionPrice: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  bundleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  bundleCard: {
    width: "48%",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    position: "relative",
  },
  bundleCardSelected: {
    backgroundColor: Colors.dark.primary + "10",
  },
  bundleAmount: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  bundleNumber: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
    fontSize: 28,
  },
  bundleLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  discountBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  discountText: {
    ...Typography.caption,
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: 10,
  },
  bundlePricing: {
    alignItems: "center",
  },
  originalPrice: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    textDecorationLine: "line-through",
  },
  bundleTotal: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  perCreditPrice: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  selectedIndicator: {
    position: "absolute",
    top: -1,
    left: -1,
    width: 24,
    height: 24,
    borderBottomRightRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  summaryDetails: {
    flex: 1,
  },
  summaryText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  summaryTotal: {
    ...Typography.body,
    fontWeight: "700",
    marginTop: 2,
  },
  addBundleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  addBundleButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  creditStoreNote: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
