import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { formatCredits } from "@/lib/dateUtils";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { InfoTooltip } from "@/components/InfoTooltip";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";

interface CreditPackage {
  creditType: string;
  credits: number;
  pricePerCredit: string;
  totalPrice: string;
  currency: string;
  label: string;
  hasPricing: boolean;
}

const CREDIT_TYPE_INFO: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  private: { label: "Private", icon: "person", color: Colors.dark.primary },
  semi: { label: "Semi-Private", icon: "people", color: Colors.dark.xpCyan },
  group: { label: "Group", icon: "people-circle", color: Colors.dark.orange },
};

export default function CreditPackagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [expandedType, setExpandedType] = useState<string | null>("private");

  const { data: creditPackages = [], isLoading, error } = useQuery<CreditPackage[]>({
    queryKey: ["/api/billing/credit-packages"],
  });

  const handleToggleType = (type: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedType(expandedType === type ? null : type);
  };

  const groupedPackages = creditPackages.reduce((acc, pkg) => {
    if (!acc[pkg.creditType]) {
      acc[pkg.creditType] = [];
    }
    acc[pkg.creditType].push(pkg);
    return acc;
  }, {} as Record<string, CreditPackage[]>);

  const renderCreditTypeSection = (creditType: string) => {
    const packages = groupedPackages[creditType] || [];
    const typeInfo = CREDIT_TYPE_INFO[creditType];
    const isExpanded = expandedType === creditType;
    const hasPricing = packages.length > 0 && packages[0].hasPricing;
    const pricePerCredit = packages[0]?.pricePerCredit || "0";
    const currency = packages[0]?.currency || "AED";

    return (
      <View key={creditType} style={styles.sectionContainer}>
        <Pressable
          style={[
            styles.sectionHeader,
            isExpanded && styles.sectionHeaderExpanded,
          ]}
          onPress={() => handleToggleType(creditType)}
        >
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.iconContainer, { backgroundColor: `${typeInfo.color}20` }]}>
              <Ionicons name={typeInfo.icon} size={24} color={typeInfo.color} />
            </View>
            <View>
              <Text style={styles.sectionTitle}>{typeInfo.label} Credits</Text>
              {hasPricing ? (
                <Text style={styles.sectionSubtitle}>
                  {currency} {pricePerCredit} per credit
                </Text>
              ) : (
                <Text style={[styles.sectionSubtitle, { color: Colors.dark.orange }]}>
                  No pricing configured
                </Text>
              )}
            </View>
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors.dark.textMuted}
          />
        </Pressable>

        {isExpanded ? (
          <View style={styles.packagesContainer}>
            {!hasPricing ? (
              <View style={styles.noPricingWarning}>
                <Ionicons name="warning" size={24} color={Colors.dark.orange} />
                <Text style={styles.noPricingText}>
                  Set up {typeInfo.label.toLowerCase()} session pricing first to enable credit packages.
                </Text>
                <Pressable
                  style={styles.setupButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    (navigation as any).navigate("Pricing");
                  }}
                >
                  <Text style={styles.setupButtonText}>Configure Pricing</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.packagesGrid}>
                {packages.map((pkg) => (
                  <View key={`${pkg.creditType}-${pkg.credits}`} style={styles.packageCard}>
                    <View style={styles.packageCredits}>
                      <Text style={[styles.packageCreditsNumber, { color: typeInfo.color }]}>
                        {formatCredits(pkg.credits)}
                      </Text>
                      <Text style={styles.packageCreditsLabel}>
                        credit{pkg.credits > 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={styles.packagePricing}>
                      <Text style={styles.packageTotalPrice}>
                        {pkg.currency} {pkg.totalPrice}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.gamingHeader}
      >
        <LinearGradient
          colors={[Colors.dark.gold, Colors.dark.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>CREDIT PACKAGES</Text>
          <InfoTooltip 
            title="Credit Types" 
            description="Credits come in 3 types: Private (1-on-1 sessions), Semi-Private (2-3 players), and Group (4+ players). Each credit type can only be used for its matching session type. Credits expire based on the package expiry date."
          />
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.xpCyan} />
          <Text style={styles.infoText}>
            Credit packages are automatically priced based on your session pricing. 
            Players can purchase these packages in the Credit Store.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.dark.gold} style={{ marginTop: Spacing.xl }} />
        ) : error ? (
          <View style={styles.errorState}>
            <Ionicons name="alert-circle" size={40} color={Colors.dark.error} />
            <Text style={styles.errorText}>Failed to load credit packages</Text>
          </View>
        ) : creditPackages.length === 0 ? (
          <GuidedEmptyState
            icon="card-outline"
            title="No Credit Packages"
            description="Set up credit packages so players can purchase training credits for your academy."
            tips={[
              "Create packages for Private, Semi-Private, and Group sessions",
              "Set expiry dates to keep credits active",
              "Players purchase credits through their app",
            ]}
            actionLabel="Configure Pricing"
            onAction={() => (navigation as any).navigate("Pricing")}
          />
        ) : (
          <View style={styles.sectionsContainer}>
            {Object.keys(CREDIT_TYPE_INFO).map(renderCreditTypeSection)}
          </View>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  gamingHeader: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTopLine: {
    height: 3,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  infoText: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  sectionsContainer: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  sectionContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  sectionHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  sectionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  packagesContainer: {
    padding: Spacing.md,
  },
  packagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  packageCard: {
    width: "48%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  packageCredits: {
    alignItems: "center",
  },
  packageCreditsNumber: {
    ...Typography.numberLarge,
  },
  packageCreditsLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: -4,
  },
  packagePricing: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  packageTotalPrice: {
    ...Typography.h4,
    color: Colors.dark.gold,
  },
  noPricingWarning: {
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  noPricingText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  setupButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
  },
  setupButtonText: {
    ...Typography.small,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  errorState: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
});
