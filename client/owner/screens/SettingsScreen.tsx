import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, Modal, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";
import { SPORTS, getSportConfig, type Sport } from "@shared/sportConfig";
import { SportMultiSelector } from "@/components/SportBadge";
import { WhatsNewSettingsCard } from "@/components/WhatsNewSettingsCard";
interface ResetOptions {
  sessions: boolean;
  attendance: boolean;
  payments: boolean;
  progress: boolean;
  feedback: boolean;
  packages: boolean;
  invoices: boolean;
  players: boolean;
}

interface ResetCounts {
  sessions: number;
  attendance: number;
  payments: number;
  progress: number;
  feedback: number;
  packages: number;
  invoices: number;
  players: number;
}

type NavigationProp = NativeStackNavigationProp<OwnerStackParamList>;

// =====================================================================
// Subscription Section Component
// =====================================================================
const TIER_COLORS_SUB: Record<string, string> = {
  starter: Colors.dark.textMuted,
  pro: "#6C63FF",
  elite: Colors.dark.gold,
};

const FEATURE_NAMES: Record<string, string> = {
  ai_coach_basic: "AI Coach (Basis)",
  ai_coach_unlimited: "AI Coach (Onbeperkt)",
  video_feedback: "Video Feedback",
  match_analytics: "Match Analytics",
  tournaments: "Toernooien & Ladders",
  custom_roles: "Aangepaste Rollen",
  white_labeling: "White Labeling",
  advanced_invoicing: "Geavanceerde Facturatie",
};

interface SubPlan {
  id: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  currency: string;
  maxCoaches: number;
  maxPlayers: number;
  maxLocations: number;
  features: Record<string, boolean>;
}

interface SubStatus {
  currentPlan: SubPlan;
  subscription: {
    status: string;
    currentPeriodEnd?: string;
    cancelledAt?: string;
  } | null;
  usage: { coaches: number; players: number; locations: number };
  plans: SubPlan[];
}

function CapacityBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(1, used / max);
  const barColor = pct > 0.8 ? Colors.dark.error : pct > 0.6 ? Colors.dark.orange : Colors.dark.primary;

  return (
    <View style={subStyles.capRow}>
      <View style={subStyles.capLabelRow}>
        <Text style={subStyles.capLabel}>{label}</Text>
        <Text style={subStyles.capValue}>
          {used}{unlimited ? "" : ` / ${max}`}
          {unlimited ? " (onbeperkt)" : ""}
        </Text>
      </View>
      {!unlimited ? (
        <View style={subStyles.capBar}>
          <View style={[subStyles.capFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
        </View>
      ) : null}
    </View>
  );
}

function SubscriptionSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SubStatus>({
    queryKey: ["/api/academy/subscription"],
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/academy/subscription/portal");
      const json = await res.json();
      return json.url as string;
    },
    onSuccess: async (url) => {
      if (url) await Linking.openURL(url);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/academy/subscription"] }), 3000);
    },
    onError: () => {
      Alert.alert("Fout", "Kon de abonnementspagina niet openen. Controleer uw verbinding.");
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiRequest("POST", "/api/academy/subscription/checkout", { planId });
      const json = await res.json();
      return json.url as string;
    },
    onSuccess: async (url) => {
      if (url) await Linking.openURL(url);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/academy/subscription"] }), 3000);
    },
    onError: () => {
      Alert.alert("Fout", "Kon checkout niet starten.");
    },
  });

  if (isLoading) {
    return (
      <View style={subStyles.section}>
        <Text style={subStyles.sectionTitle}>Abonnement</Text>
        <View style={subStyles.card}>
          <ActivityIndicator color={Colors.dark.gold} />
        </View>
      </View>
    );
  }

  if (!data) return null;

  const { currentPlan, subscription, usage, plans } = data;
  const tierKey = currentPlan.name.toLowerCase();
  const tierColor = TIER_COLORS_SUB[tierKey] || Colors.dark.gold;
  const isFreePlan = currentPlan.monthlyPrice === 0;
  const nextBilling = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const upgradePlans = plans.filter((p) => p.monthlyPrice > currentPlan.monthlyPrice);

  return (
    <View style={subStyles.section}>
      <Text style={subStyles.sectionTitle}>Abonnement</Text>

      <View style={subStyles.card}>
        <View style={subStyles.tierHeader}>
          <View style={[subStyles.tierBadge, { backgroundColor: `${tierColor}20`, borderColor: `${tierColor}40` }]}>
            <Ionicons
              name={tierKey === "elite" ? "diamond" : tierKey === "pro" ? "rocket" : "star-outline"}
              size={14}
              color={tierColor}
            />
            <Text style={[subStyles.tierBadgeText, { color: tierColor }]}>
              {currentPlan.name}
            </Text>
          </View>
          {subscription?.status ? (
            <View style={[subStyles.statusBadge, {
              backgroundColor: subscription.status === "active" ? `${Colors.dark.primary}20` : `${Colors.dark.orange}20`
            }]}>
              <Text style={[subStyles.statusText, {
                color: subscription.status === "active" ? Colors.dark.primary : Colors.dark.orange
              }]}>
                {subscription.status === "active" ? "Actief" : subscription.status === "trialing" ? "Proefperiode" : subscription.status}
              </Text>
            </View>
          ) : null}
        </View>

        {currentPlan.description ? (
          <Text style={subStyles.planDesc}>{currentPlan.description}</Text>
        ) : null}

        {nextBilling ? (
          <Text style={subStyles.billing}>Volgende factuur: {nextBilling}</Text>
        ) : null}

        <View style={subStyles.divider} />

        <Text style={subStyles.usageTitle}>Capaciteitsgebruik</Text>
        <CapacityBar used={usage.coaches} max={currentPlan.maxCoaches} label="Coaches" />
        <CapacityBar used={usage.players} max={currentPlan.maxPlayers} label="Spelers" />
        <CapacityBar used={usage.locations} max={currentPlan.maxLocations} label="Locaties" />

        <View style={subStyles.divider} />

        <Text style={subStyles.usageTitle}>Inbegrepen functies</Text>
        {Object.entries(FEATURE_NAMES).map(([key, label]) => {
          const included = currentPlan.features[key] === true;
          return (
            <View key={key} style={subStyles.featureRow}>
              <Ionicons
                name={included ? "checkmark-circle" : "close-circle-outline"}
                size={18}
                color={included ? Colors.dark.primary : Colors.dark.textMuted}
              />
              <Text style={[subStyles.featureLabel, !included && subStyles.featureDisabled]}>
                {label}
              </Text>
            </View>
          );
        })}

        {!isFreePlan && (
          <>
            <View style={subStyles.divider} />
            <Pressable
              style={[subStyles.portalBtn, { borderColor: `${tierColor}50` }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                portalMutation.mutate();
              }}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? (
                <ActivityIndicator size="small" color={tierColor} />
              ) : (
                <>
                  <Ionicons name="settings-outline" size={16} color={tierColor} />
                  <Text style={[subStyles.portalBtnText, { color: tierColor }]}>
                    Abonnement beheren
                  </Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>

      {upgradePlans.length > 0 ? (
        <View style={subStyles.upgradeSection}>
          <Text style={subStyles.upgradeTitle}>Upgrade uw academie</Text>
          {upgradePlans.map((plan) => {
            const planColor = TIER_COLORS_SUB[plan.name.toLowerCase()] || Colors.dark.gold;
            return (
              <Pressable
                key={plan.id}
                style={[subStyles.upgradeCard, { borderColor: `${planColor}40` }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  checkoutMutation.mutate(plan.id);
                }}
                disabled={checkoutMutation.isPending}
              >
                <View style={subStyles.upgradeCardLeft}>
                  <Text style={[subStyles.upgradePlanName, { color: planColor }]}>{plan.name}</Text>
                  <Text style={subStyles.upgradePlanPrice}>
                    €{plan.monthlyPrice}/maand
                  </Text>
                </View>
                <View style={[subStyles.upgradeBtn, { backgroundColor: planColor }]}>
                  <Text style={subStyles.upgradeBtnText}>Upgraden</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const subStyles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  tierBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: "600" },
  planDesc: { ...Typography.small, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  billing: { ...Typography.caption, color: Colors.dark.textMuted },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginVertical: Spacing.md },
  usageTitle: { ...Typography.small, color: Colors.dark.textMuted, fontWeight: "600", marginBottom: Spacing.sm },
  capRow: { marginBottom: Spacing.sm },
  capLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  capLabel: { ...Typography.small, color: Colors.dark.textSecondary },
  capValue: { ...Typography.small, color: Colors.dark.text, fontWeight: "600" },
  capBar: { height: 4, backgroundColor: Colors.dark.border, borderRadius: 2 },
  capFill: { height: 4, borderRadius: 2 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 6 },
  featureLabel: { ...Typography.small, color: Colors.dark.text },
  featureDisabled: { color: Colors.dark.textMuted },
  portalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  portalBtnText: { fontWeight: "600", fontSize: 14 },
  upgradeSection: { marginTop: Spacing.md },
  upgradeTitle: { ...Typography.small, color: Colors.dark.textMuted, fontWeight: "600", marginBottom: Spacing.sm },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  upgradeCardLeft: { flex: 1 },
  upgradePlanName: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  upgradePlanPrice: { ...Typography.small, color: Colors.dark.textMuted },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  upgradeBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  toggle?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
}

function SettingRow({ icon, title, subtitle, value, toggle, onToggle, onPress, danger }: SettingRowProps) {
  const iconColor = danger ? Colors.dark.error : Colors.dark.gold;

  return (
    <Pressable 
      style={styles.settingRow} 
      onPress={onPress}
      disabled={toggle !== undefined}
    >
      <View style={[styles.settingIcon, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && { color: Colors.dark.error }]}>{title}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      {toggle !== undefined ? (
        <Switch
          value={toggle}
          onValueChange={onToggle}
          trackColor={{ false: Colors.dark.backgroundRoot, true: Colors.dark.gold }}
          thumbColor={Colors.dark.text}
        />
      ) : value ? (
        <View style={styles.settingValueContainer}>
          <Text style={styles.settingValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      )}
    </Pressable>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionContent, CardStyles.elevated]}>
        {children}
      </View>
    </View>
  );
}

interface AcademySettings {
  defaultSessionLength?: number;
  xpVisibleToPlayers?: boolean;
  notificationsEnabled?: boolean;
  welcomeVideoUrl?: string;
  sports?: string[];
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [showSessionLengthModal, setShowSessionLengthModal] = useState(false);
  const [sessionLengthInput, setSessionLengthInput] = useState("60");
  const [showWelcomeVideoModal, setShowWelcomeVideoModal] = useState(false);
  const [welcomeVideoInput, setWelcomeVideoInput] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetOptions, setResetOptions] = useState<ResetOptions>({
    sessions: false,
    attendance: false,
    payments: false,
    progress: false,
    feedback: false,
    packages: false,
    invoices: false,
    players: false,
  });

  const { data: settingsData } = useQuery<AcademySettings>({
    queryKey: ["/api/owner/academy-settings"],
  });

  const settings = settingsData || {
    defaultSessionLength: 60,
    xpVisibleToPlayers: true,
    notificationsEnabled: true,
    welcomeVideoUrl: "",
  };
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AcademySettings>) => {
      return apiRequest("PATCH", "/api/owner/academy-settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/academy-settings"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      if (Platform.OS === "web") {
        window.alert(error.message || "Failed to update settings");
      } else {
        Alert.alert("Error", error.message || "Failed to update settings");
      }
    },
  });

  const handleToggleXpVisible = (value: boolean) => {
    updateSettingsMutation.mutate({ xpVisibleToPlayers: value });
  };

  const handleToggleNotifications = (value: boolean) => {
    updateSettingsMutation.mutate({ notificationsEnabled: value });
  };

  const handleOpenSessionLengthModal = () => {
    setSessionLengthInput(String(settings.defaultSessionLength || 60));
    setShowSessionLengthModal(true);
  };

  const handleOpenWelcomeVideoModal = () => {
    setWelcomeVideoInput(settings.welcomeVideoUrl || "");
    setShowWelcomeVideoModal(true);
  };

  const handleSaveWelcomeVideo = () => {
    updateSettingsMutation.mutate({ welcomeVideoUrl: welcomeVideoInput.trim() || null });
    setShowWelcomeVideoModal(false);
  };

  const handleExportPlayers = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Use apiRequest to fetch with auth - returns JSON { csv, filename }
      const res = await apiRequest("GET", "/api/owner/export/players");
      const response = await res.json() as { csv: string; filename: string };
      const csvData = response.csv;
      
      if (Platform.OS === "web") {
        // Web: use native browser download
        const blob = new Blob([csvData], { type: "text/csv" });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = response.filename || "players.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        window.alert("Players exported successfully!");
      } else {
        // Native: write to file and share
        // eslint-disable-next-line import/namespace
        const fileUri = FileSystem.documentDirectory + (response.filename || "players.csv");
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: "Export Players",
          });
        } else {
          Alert.alert("Success", "Players exported successfully!");
        }
      }
    } catch (error) {
      if (Platform.OS === "web") {
        window.alert("Export failed - try again later");
      } else {
        Alert.alert("Error", "Export failed - try again later");
      }
    }
  };

  const handleExportSessions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Use apiRequest to fetch with auth - returns JSON { csv, filename }
      const res = await apiRequest("GET", "/api/owner/export/sessions");
      const response = await res.json() as { csv: string; filename: string };
      const csvData = response.csv;
      
      if (Platform.OS === "web") {
        // Web: use native browser download
        const blob = new Blob([csvData], { type: "text/csv" });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = response.filename || "sessions.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        window.alert("Sessions exported successfully!");
      } else {
        // Native: write to file and share
        // eslint-disable-next-line import/namespace
        const fileUri = FileSystem.documentDirectory + (response.filename || "sessions.csv");
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: "Export Sessions",
          });
        } else {
          Alert.alert("Success", "Sessions exported successfully!");
        }
      }
    } catch (error) {
      if (Platform.OS === "web") {
        window.alert("Export failed - try again later");
      } else {
        Alert.alert("Error", "Export failed - try again later");
      }
    }
  };

  const { data: resetCountsData } = useQuery<{ counts: ResetCounts }>({
    queryKey: ["/api/academy/reset-counts"],
    enabled: showResetModal,
  });
  const resetCounts = resetCountsData?.counts;

  const resetAcademyMutation = useMutation({
    mutationFn: async ({ resetTypes, confirmationCode }: { resetTypes: ResetOptions; confirmationCode: string }) => {
      return apiRequest("POST", "/api/academy/reset", { resetTypes, confirmationCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowResetModal(false);
      setResetConfirmation("");
      setResetOptions({
        sessions: false,
        attendance: false,
        payments: false,
        progress: false,
        feedback: false,
        packages: false,
        invoices: false,
        players: false,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Academy data reset successfully!");
      } else {
        Alert.alert("Success", "Academy data has been reset successfully!");
      }
    },
    onError: (error: any) => {
      if (Platform.OS === "web") {
        window.alert(error.message || "Failed to reset academy data");
      } else {
        Alert.alert("Error", error.message || "Failed to reset academy data");
      }
    },
  });

  const handleOpenResetModal = () => {
    setShowResetModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCloseResetModal = () => {
    setShowResetModal(false);
    setResetConfirmation("");
    setResetOptions({
      sessions: false,
      attendance: false,
      payments: false,
      progress: false,
      feedback: false,
      packages: false,
      invoices: false,
      players: false,
    });
  };

  const handleResetAcademy = () => {
    const selectedCount = Object.values(resetOptions).filter(Boolean).length;
    if (selectedCount === 0) {
      if (Platform.OS === "web") {
        window.alert("Please select at least one data type to reset");
      } else {
        Alert.alert("Error", "Please select at least one data type to reset");
      }
      return;
    }
    if (resetConfirmation !== "RESET") {
      if (Platform.OS === "web") {
        window.alert("Please type RESET to confirm");
      } else {
        Alert.alert("Error", "Please type RESET to confirm");
      }
      return;
    }
    resetAcademyMutation.mutate({ resetTypes: resetOptions, confirmationCode: resetConfirmation });
  };

  const toggleResetOption = (key: keyof ResetOptions) => {
    setResetOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const RESET_OPTIONS_LIST: { key: keyof ResetOptions; label: string; desc: string }[] = [
    { key: "sessions", label: "Sessions", desc: "All scheduled and past sessions" },
    { key: "attendance", label: "Attendance", desc: "Player attendance records" },
    { key: "payments", label: "Payments", desc: "Payment records and transactions" },
    { key: "progress", label: "Progress", desc: "Player XP, levels, and skill data" },
    { key: "feedback", label: "Feedback", desc: "Session feedback and observations" },
    { key: "packages", label: "Packages", desc: "Credit packages assigned to players" },
    { key: "invoices", label: "Invoices", desc: "All generated invoices" },
    { key: "players", label: "Players", desc: "All player accounts in this academy" },
  ];

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account?\n\nThis will immediately erase all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This is your last chance. Your account and all data will be permanently deleted right now. Are you absolutely sure?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setDeleteAccountLoading(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    try {
                      await apiRequest("DELETE", "/api/player/me/account", undefined);
                      Alert.alert(
                        "Account Deleted",
                        "Your account has been permanently deleted. A confirmation has been sent to your email address.",
                        [{ text: "OK", onPress: () => { setTimeout(() => { logout(); }, 350); } }]
                      );
                    } catch (error: any) {
                      Alert.alert("Error", error?.message || "Failed to delete account. Please contact support@glowupsports.com");
                    } finally {
                      setDeleteAccountLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            logout();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Academy configuration and preferences</Text>
        </View>

        
          <Section title="Sports">
            <View style={styles.sportsSection}>
              <Text style={styles.sportsSectionLabel}>Sports offered at your academy</Text>
              <SportMultiSelector
                selectedSports={settings.sports?.length ? settings.sports : ["tennis"]}
                onToggle={(sport) => {
                  const current = settings.sports?.length ? settings.sports : ["tennis"];
                  const updated = current.includes(sport)
                    ? current.filter((s) => s !== sport)
                    : [...current, sport];
                  const finalSports = updated.length ? updated : ["tennis"];
                  updateSettingsMutation.mutate({ sports: finalSports });
                }}
              />
            </View>
          </Section>

          <Section title="Academy Settings">
            <SettingRow
              icon="time"
              title="Default Session Length"
              value={`${settings.defaultSessionLength || 60} min`}
              onPress={handleOpenSessionLengthModal}
            />
            <SettingRow
              icon="eye"
              title="XP Visible to Players"
              toggle={settings.xpVisibleToPlayers ?? true}
              onToggle={handleToggleXpVisible}
            />
            <SettingRow
              icon="notifications"
              title="Notifications"
              toggle={settings.notificationsEnabled ?? true}
              onToggle={handleToggleNotifications}
            />
            <SettingRow
              icon="videocam"
              title="Welcome Video"
              subtitle="Shown during player onboarding"
              value={settings.welcomeVideoUrl ? "Set" : "Not set"}
              onPress={handleOpenWelcomeVideoModal}
            />
            <SettingRow
              icon="color-palette"
              title="Branding & Theme"
              subtitle="Logo, colours and presets for your academy"
              onPress={() => navigation.navigate("Branding")}
            />
          </Section>
        

        
          <SubscriptionSection />

          <Section title="Billing & Pricing">
            <SettingRow
              icon="pricetag"
              title="Session Pricing"
              subtitle="Set prices for different session types"
              onPress={() => navigation.navigate("Pricing")}
            />
            <SettingRow
              icon="wallet"
              title="Coach Compensation"
              subtitle="Manage coach payout rates"
              onPress={() => navigation.navigate("CoachCompensation")}
            />
            <SettingRow
              icon="gift"
              title="Credit Packages"
              subtitle="Create packages for players to purchase"
              onPress={() => navigation.navigate("CreditPackages")}
            />
          </Section>
        

        
          <Section title="Team Management">
            <SettingRow
              icon="person-add"
              title="Coach Invites"
              subtitle="Invite new coaches to your academy"
              onPress={() => navigation.navigate("InviteManagement")}
            />
            <SettingRow
              icon="shield-checkmark"
              title="Coach Permissions"
              subtitle="Manage what coaches can access"
              onPress={() => navigation.navigate("RulesAndPolicies")}
            />
            <SettingRow
              icon="key"
              title="Head Coach Settings"
              subtitle="Special permissions for head coaches"
              onPress={() => navigation.navigate("RulesAndPolicies")}
            />
          </Section>
        

        
          <Section title="Data & Export">
            <SettingRow
              icon="download"
              title="Export Players"
              subtitle="Download player data as CSV"
              onPress={handleExportPlayers}
            />
            <SettingRow
              icon="document"
              title="Export Sessions"
              subtitle="Download session history"
              onPress={handleExportSessions}
            />
            <SettingRow
              icon="lock-closed"
              title="GDPR Tools"
              subtitle="Data privacy and deletion"
              onPress={handleOpenResetModal}
            />
          </Section>
        

        <WhatsNewSettingsCard />

        <Section title="Danger Zone">
          <SettingRow
            icon="refresh"
            title="Reset Academy Data"
            subtitle="Selectively clear sessions, payments, progress"
            onPress={handleOpenResetModal}
            danger
          />
          <SettingRow
            icon="pause-circle"
            title="Pause Academy"
            subtitle="Temporarily disable all activities"
            danger
          />
          <SettingRow
            icon="trash"
            title="Delete Academy"
            subtitle="Permanently remove all data"
            danger
          />
        </Section>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
        <Pressable
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={deleteAccountLoading}
          accessibilityRole="button"
          accessibilityLabel="Delete my account"
        >
          {deleteAccountLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.error} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              <Text style={styles.deleteAccountText}>Delete Account</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={showSessionLengthModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSessionLengthModal(false)}
      >
        <View style={styles.sessionLengthModalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSessionLengthModal(false)} />
          <View style={[styles.sessionLengthModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowSessionLengthModal(false)}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Session Length</Text>
              <View style={{ width: 50 }} />
            </View>
            <Text style={styles.sessionLengthLabel}>Select default session length</Text>
            <View style={styles.sessionLengthOptions}>
              {[30, 45, 60, 75, 90, 120].map((minutes) => {
                const isSelected = parseInt(sessionLengthInput) === minutes;
                return (
                  <Pressable
                    key={minutes}
                    style={[
                      styles.sessionLengthOption,
                      isSelected && styles.sessionLengthOptionSelected,
                    ]}
                    onPress={() => {
                      setSessionLengthInput(String(minutes));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateSettingsMutation.mutate({ defaultSessionLength: minutes });
                      setShowSessionLengthModal(false);
                    }}
                  >
                    <Text style={[
                      styles.sessionLengthOptionText,
                      isSelected && styles.sessionLengthOptionTextSelected,
                    ]}>
                      {minutes} min
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWelcomeVideoModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowWelcomeVideoModal(false)}
      >
        <View style={styles.sessionLengthModalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowWelcomeVideoModal(false)} />
          <KeyboardAwareScrollViewCompat style={{ flex: 0 }}>
            <View style={[styles.sessionLengthModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowWelcomeVideoModal(false)}>
                  <Text style={styles.cancelButton}>Cancel</Text>
                </Pressable>
                <Text style={styles.modalTitle}>Welcome Video</Text>
                <Pressable onPress={handleSaveWelcomeVideo}>
                  <Text style={styles.saveButton}>Save</Text>
                </Pressable>
              </View>
              <Text style={styles.sessionLengthLabel}>Enter a YouTube or video URL to show new players during onboarding</Text>
              <TextInput
                style={styles.welcomeVideoInput}
                value={welcomeVideoInput}
                onChangeText={setWelcomeVideoInput}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {settings.welcomeVideoUrl ? (
                <Pressable
                  style={styles.clearVideoButton}
                  onPress={() => {
                    updateSettingsMutation.mutate({ welcomeVideoUrl: null });
                    setShowWelcomeVideoModal(false);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  <Text style={styles.clearVideoText}>Remove video</Text>
                </Pressable>
              ) : null}
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={showResetModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseResetModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={handleCloseResetModal}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Reset Data</Text>
            <Pressable
              onPress={handleResetAcademy}
              disabled={resetAcademyMutation.isPending}
            >
              <Text style={[styles.resetButton, resetAcademyMutation.isPending && styles.disabledButton]}>
                {resetAcademyMutation.isPending ? "Resetting..." : "Reset"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalContent}>
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={24} color={Colors.dark.error} />
              <Text style={styles.warningText}>
                This action cannot be undone. Selected data will be permanently deleted.
              </Text>
            </View>

            <Text style={styles.resetSectionTitle}>Select Data to Reset</Text>

            {RESET_OPTIONS_LIST.map((item) => {
              const count = resetCounts ? resetCounts[item.key] : undefined;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.resetOption, resetOptions[item.key] && styles.resetOptionSelected]}
                  onPress={() => toggleResetOption(item.key)}
                >
                  <View style={styles.resetOptionCheck}>
                    <Ionicons
                      name={resetOptions[item.key] ? "checkbox" : "square-outline"}
                      size={24}
                      color={resetOptions[item.key] ? Colors.dark.error : Colors.dark.textMuted}
                    />
                  </View>
                  <View style={styles.resetOptionContent}>
                    <View style={styles.resetOptionHeader}>
                      <Text style={[styles.resetOptionLabel, resetOptions[item.key] && { color: Colors.dark.error }]}>
                        {item.label}
                      </Text>
                      {count !== undefined ? (
                        <View style={styles.countBadge}>
                          <Text style={styles.countText}>{count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.resetOptionDesc}>{item.desc}</Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Type RESET to confirm</Text>
              <TextInput
                style={[styles.confirmInput, resetConfirmation === "RESET" && styles.confirmInputValid]}
                value={resetConfirmation}
                onChangeText={setResetConfirmation}
                placeholder="RESET"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  sectionContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
    gap: Spacing.md,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  settingSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  settingValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  settingValue: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  deleteAccountText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.error,
    fontWeight: "500",
    opacity: 0.8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  resetButton: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalContent: {
    padding: Spacing.lg,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.dark.error}15`,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  warningText: {
    ...Typography.small,
    color: Colors.dark.error,
    flex: 1,
  },
  resetSectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  resetOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  resetOptionSelected: {
    borderColor: Colors.dark.error,
    backgroundColor: `${Colors.dark.error}10`,
  },
  resetOptionCheck: {
    marginRight: Spacing.md,
  },
  resetOptionContent: {
    flex: 1,
  },
  resetOptionLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  resetOptionDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  resetOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  countBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 28,
    alignItems: "center",
  },
  countText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  confirmSection: {
    marginTop: Spacing.lg,
  },
  confirmLabel: {
    ...Typography.body,
    color: Colors.dark.error,
    marginBottom: Spacing.sm,
    fontWeight: "600",
  },
  confirmInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    fontSize: Typography.body.fontSize,
    textAlign: "center",
  },
  confirmInputValid: {
    borderColor: Colors.dark.error,
  },
  sessionLengthModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sessionLengthModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  saveButton: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  sessionLengthLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sessionLengthOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sessionLengthOption: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 80,
    alignItems: "center",
  },
  sessionLengthOptionSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: `${Colors.dark.gold}15`,
  },
  sessionLengthOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionLengthOptionTextSelected: {
    color: Colors.dark.gold,
  },
  sessionLengthInput: {
    ...Typography.h2,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    textAlign: "center",
  },
  sessionLengthHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  welcomeVideoInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  clearVideoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  clearVideoText: {
    ...Typography.small,
    color: Colors.dark.error,
  },
  sportsSection: {
    padding: Spacing.md,
  },
  sportsSectionLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
});
