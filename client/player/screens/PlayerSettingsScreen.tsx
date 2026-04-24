import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, ActivityIndicator, Linking, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as AppleAuthentication from "expo-apple-authentication";
import { secureGet, secureDelete } from "@/lib/auth";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { SUPPORTED_LANGUAGES, setStoredLanguage, type LanguageCode } from "@/i18n";
import { useSport, SPORT_DEFINITIONS, type Sport } from "@/player/context/SportContext";
import { useFamily } from "@/player/context/FamilyContext";
import { FAMILY_SWITCH_KEY } from "@/player/screens/FamilyLobbyScreen";
import AiProUpgradeModal from "@/player/components/AiProUpgradeModal";
import { usePlayerAppearance, type PlayerAppearancePreference } from "@/player/context/PlayerAppearanceContext";
import { useAcademyTheme } from "@/contexts/AcademyThemeContext";
import { defaultAcademyTheme } from "@shared/theme";
import MyThemeEditor from "@/player/components/MyThemeEditor";
import { LanguageSelectorModal } from "@/components/LanguageSelectorModal";
import { WhatsNewSettingsCard } from "@/components/WhatsNewSettingsCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface SettingItem {
  id: string;
  icon: string;
  label: string;
  type: "toggle" | "link" | "action";
  value?: boolean;
  onPress?: () => void;
}

export default function PlayerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { logout, loginWithToken } = useAuth();
  const { isRegistered } = usePushNotifications();
  const queryClient = useQueryClient();
  const { refreshFamily } = useFamily();
  const { t, i18n } = useTranslation();

  const [notifications, setNotifications] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [progressUpdates, setProgressUpdates] = useState(true);
  const [coachMessages, setCoachMessages] = useState(true);
  const [messageLanguage, setMessageLanguage] = useState<"player" | "coach" | "parent">("player");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [appleLinked, setAppleLinked] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [sportSaving, setSportSaving] = useState(false);
  const [showJoinFamily, setShowJoinFamily] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const { data: aiProStatus, refetch: refetchAiPro } = useQuery<{
    isPro: boolean;
    isCoach: boolean;
    callCount: number;
    limit: number;
  }>({
    queryKey: ["/api/ai-pro/status"],
    retry: false,
  });
  const [joinLoading, setJoinLoading] = useState(false);
  const [switchedName, setSwitchedName] = useState<string | null>(null);

  const { activeSports, updateActiveSports } = useSport();
  const {
    preference: appearancePref,
    setPreference: setAppearancePref,
    resolvedScheme: appearanceResolved,
  } = usePlayerAppearance();
  const { playerOverride, setPlayerOverride } = useAcademyTheme();
  const themeMode: "academy" | "preset" = playerOverride ? "preset" : "academy";

  const toggleSport = async (sport: Sport) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let newSports: Sport[];
    if (activeSports.includes(sport)) {
      if (activeSports.length === 1) return;
      newSports = activeSports.filter(s => s !== sport);
    } else {
      newSports = [...activeSports, sport];
    }
    setSportSaving(true);
    try {
      await updateActiveSports(newSports);
    } finally {
      setSportSaving(false);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkAppleStatus();
    }
  }, []);

  useEffect(() => {
    secureGet(FAMILY_SWITCH_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setSwitchedName(parsed.switchedPlayerName || null);
        } catch {
          setSwitchedName(null);
        }
      } else {
        setSwitchedName(null);
      }
    }).catch(() => setSwitchedName(null));
  }, []);

  const checkAppleStatus = async () => {
    try {
      const apiUrl = getApiUrl();
      const token = await import('@/lib/auth').then(m => m.getAuthToken());
      const response = await fetch(new URL("/auth/apple/status", apiUrl).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAppleLinked(data.linked);
    } catch (error) {
      console.error("Apple status check error:", error);
    }
  };

  const handleLinkApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken || !credential.user) return;

      setAppleLoading(true);
      const apiUrl = getApiUrl();
      const token = await import('@/lib/auth').then(m => m.getAuthToken());
      const response = await fetch(new URL("/auth/apple/link", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ identityToken: credential.identityToken, user: credential.user }),
      });
      const data = await response.json();
      if (response.ok) {
        setAppleLinked(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Apple ID linked successfully");
      } else {
        Alert.alert("Error", data.error || "Failed to link Apple ID");
      }
    } catch (error: any) {
      if (error.code === "ERR_REQUEST_CANCELED") return;
      Alert.alert("Error", "Failed to link Apple ID");
    } finally {
      setAppleLoading(false);
    }
  };

  const handleUnlinkApple = () => {
    Alert.alert(
      "Unlink Apple ID",
      "Are you sure you want to unlink your Apple ID? You will no longer be able to sign in with Apple.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unlink", style: "destructive", onPress: confirmUnlinkApple },
      ]
    );
  };

  const confirmUnlinkApple = async () => {
    try {
      setAppleLoading(true);
      const apiUrl = getApiUrl();
      const token = await import('@/lib/auth').then(m => m.getAuthToken());
      const response = await fetch(new URL("/auth/apple/unlink", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setAppleLinked(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Apple ID unlinked successfully");
      } else {
        Alert.alert("Error", data.error || "Failed to unlink Apple ID");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to unlink Apple ID");
    } finally {
      setAppleLoading(false);
    }
  };

  const handleJoinFamily = async () => {
    const trimmed = joinCode.trim().toUpperCase();
    if (!trimmed) return;
    setJoinLoading(true);
    try {
      const response = await apiRequest("POST", "/api/family/join", { code: trimmed });
      const data = await response.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowJoinFamily(false);
      setJoinCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/family/status"] });
      refreshFamily();
      Alert.alert("Joined Family!", `You are now linked to ${data.parentName || "your parent"}'s family account.`);
    } catch (error: any) {
      const raw: string = error?.message || "";
      const colonIdx = raw.indexOf(":");
      let msg = "Could not join family. Please try again.";
      if (colonIdx !== -1) {
        try {
          const parsed = JSON.parse(raw.substring(colonIdx + 1).trim());
          if (parsed?.error) msg = parsed.error;
        } catch { }
      }
      Alert.alert("Could not join", msg);
    } finally {
      setJoinLoading(false);
    }
  };

  const appVersion = Constants.expoConfig?.version || "1.3.1";

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account?\n\nThis will immediately erase all your data including XP, progress, match history, and profile information. This cannot be undone.",
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
                    setDeleteLoading(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    try {
                      await apiRequest("DELETE", "/api/player/me/account", undefined);
                      const doAfterDelete = async () => {
                        const raw = await secureGet(FAMILY_SWITCH_KEY).catch(() => null);
                        if (raw) {
                          try {
                            const parsed = JSON.parse(raw);
                            if (parsed?.originalToken) {
                              const apiBase = getApiUrl();
                              const meRes = await fetch(`${apiBase}/api/me`, {
                                headers: { Authorization: `Bearer ${parsed.originalToken}` },
                              });
                              if (meRes.ok) {
                                const meData = await meRes.json();
                                await loginWithToken(parsed.originalToken, meData.user);
                                await secureDelete(FAMILY_SWITCH_KEY).catch(() => {});
                                Alert.alert(
                                  "Account Removed",
                                  `${switchedName}'s account has been permanently deleted. You are back on your main account.`
                                );
                                return;
                              }
                            }
                          } catch {}
                        }
                        logout();
                      };
                      Alert.alert(
                        "Account Deleted",
                        "The account has been permanently deleted.",
                        [
                          {
                            text: "OK",
                            onPress: () => {
                              setTimeout(() => {
                                doAfterDelete();
                              }, 350);
                            },
                          },
                        ]
                      );
                    } catch (error: any) {
                      Alert.alert("Error", error?.message || "Failed to delete account. Please contact support@glowupsports.com");
                    } finally {
                      setDeleteLoading(false);
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

  const notificationSettings: SettingItem[] = [
    {
      id: "notifications",
      icon: "notifications",
      label: "Push Notifications",
      type: "toggle",
      value: notifications,
      onPress: () => setNotifications(!notifications),
    },
    {
      id: "session-reminders",
      icon: "calendar",
      label: "Session Reminders",
      type: "toggle",
      value: sessionReminders,
      onPress: () => setSessionReminders(!sessionReminders),
    },
    {
      id: "progress-updates",
      icon: "trending-up",
      label: "Progress Updates",
      type: "toggle",
      value: progressUpdates,
      onPress: () => setProgressUpdates(!progressUpdates),
    },
    {
      id: "coach-messages",
      icon: "chatbubble",
      label: "Coach Messages",
      type: "toggle",
      value: coachMessages,
      onPress: () => setCoachMessages(!coachMessages),
    },
  ];

  const languageOptions = [
    { id: "player", label: t('player.settings.funEncouraging'), description: t('player.settings.kidFriendly') },
    { id: "coach", label: t('player.settings.technical'), description: t('player.settings.coachStyle') },
    { id: "parent", label: t('player.settings.informative'), description: t('player.settings.parentFriendly') },
  ];

  const handleLanguageChange = async (langCode: LanguageCode) => {
    if (langCode === i18n.language) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setStoredLanguage(langCode);
    await i18n.changeLanguage(langCode);
  };

  const discoverySettings: SettingItem[] = [
    {
      id: "coach-directory",
      icon: "people",
      label: "Find Coaches",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("CoachDirectory"),
    },
    {
      id: "academy-browser",
      icon: "school",
      label: "Browse Academies",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("AcademyBrowser"),
    },
    {
      id: "transfer-request",
      icon: "swap-horizontal",
      label: "Transfer Academy",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("TransferRequest"),
    },
  ];

  const accountSettings: SettingItem[] = [
    {
      id: "edit-profile",
      icon: "person",
      label: "Edit Profile",
      type: "link",
      onPress: () => (navigation as any).navigate("EditProfile"),
    },
    {
      id: "corporate-benefits",
      icon: "business",
      label: "Corporate Benefits",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("CorporateBenefits"),
    },
    {
      id: "company-dashboard",
      icon: "bar-chart",
      label: "Company Dashboard",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("CompanyContactDashboard"),
    },
    {
      id: "privacy",
      icon: "lock-closed",
      label: "Privacy Settings",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("PrivacySettings", { isOnboarding: false }),
    },
    {
      id: "help",
      icon: "help-circle",
      label: "Help & Support",
      type: "link",
    },
    {
      id: "about",
      icon: "information-circle",
      label: "About Glow Up Tennis",
      type: "link",
    },
  ];

  const legalSettings: SettingItem[] = [
    {
      id: "privacy-policy",
      icon: "document-text",
      label: "Privacy Policy",
      type: "link",
      onPress: () => Linking.openURL("https://glowupsports.com/privacy"),
    },
    {
      id: "terms-of-service",
      icon: "reader",
      label: "Terms of Service",
      type: "link",
      onPress: () => Linking.openURL("https://glowupsports.com/terms"),
    },
  ];

  const renderSettingItem = (item: SettingItem) => (
    <Pressable
      key={item.id}
      style={styles.settingItem}
      onPress={item.onPress}
      disabled={item.type === "toggle"}
      accessibilityRole={item.type === "toggle" ? undefined : "button"}
      accessibilityLabel={item.type === "toggle" ? undefined : item.label}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={item.icon as any} size={20} color={Colors.dark.primary} />
      </View>
      <Text style={styles.settingLabel}>{item.label}</Text>
      {item.type === "toggle" ? (
        <Switch
          value={item.value}
          onValueChange={item.onPress}
          trackColor={{ false: Colors.dark.backgroundTertiary, true: Colors.dark.primary }}
          thumbColor={Colors.dark.text}
          accessibilityRole="switch"
          accessibilityLabel={`Toggle ${item.label}`}
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
      )}
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.dark.backgroundRoot }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('player.settings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>My Sports</Text>
            {sportSaving ? <ActivityIndicator size="small" color={Colors.dark.primary} /> : null}
          </View>
          <Text style={styles.sectionSubtitle}>Select the sports you play to personalise your experience.</Text>
          <View style={styles.sectionCard}>
            {SPORT_DEFINITIONS.map((sport, index) => {
              const isActive = activeSports.includes(sport.key);
              const isLast = index === SPORT_DEFINITIONS.length - 1;
              return (
                <Pressable
                  key={sport.key}
                  style={[styles.settingItem, !isLast && styles.settingItemBorder]}
                  onPress={() => toggleSport(sport.key)}
                >
                  <View style={[styles.settingIcon, { backgroundColor: sport.color + "20" }]}>
                    <Ionicons name={sport.icon as keyof typeof Ionicons.glyphMap} size={20} color={sport.color} />
                  </View>
                  <View style={styles.languageTextContainer}>
                    <Text style={styles.settingLabel}>{sport.label}</Text>
                    <Text style={styles.languageDescription}>{sport.description}</Text>
                  </View>
                  <View style={[styles.sportCheckbox, isActive && { backgroundColor: sport.color, borderColor: sport.color }]}>
                    {isActive ? <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {aiProStatus && !aiProStatus.isCoach ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Plan</Text>
            <View style={styles.sectionCard}>
              <View style={[styles.settingItem, { flexDirection: "column", alignItems: "flex-start", gap: Spacing.sm, paddingVertical: Spacing.md }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, width: "100%" }}>
                  <View style={[styles.settingIcon, { backgroundColor: aiProStatus.isPro ? Colors.dark.primary + "25" : Colors.dark.chipBackground }]}>
                    <Ionicons name="flash" size={20} color={aiProStatus.isPro ? Colors.dark.primary : Colors.dark.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { flex: 0 }]}>
                      {aiProStatus.isPro ? "AI Pro" : "Free Plan"}
                    </Text>
                    {!aiProStatus.isPro ? (
                      <Text style={[Typography.small, { color: Colors.dark.textMuted }]}>
                        {aiProStatus.callCount}/{aiProStatus.limit} gesprekken gebruikt deze maand
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.aiProBadge, aiProStatus.isPro && styles.aiProBadgeActive]}>
                    <Text style={[styles.aiProBadgeText, aiProStatus.isPro && styles.aiProBadgeTextActive]}>
                      {aiProStatus.isPro ? "PRO" : "GRATIS"}
                    </Text>
                  </View>
                </View>

                {!aiProStatus.isPro ? (
                  <View style={{ width: "100%" }}>
                    <View style={styles.quotaBar}>
                      <View style={[styles.quotaFill, { width: `${Math.min(100, (aiProStatus.callCount / aiProStatus.limit) * 100)}%` as any }]} />
                    </View>
                  </View>
                ) : null}

                {!aiProStatus.isPro ? (
                  <Pressable
                    style={styles.upgradeButtonSmall}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowUpgradeModal(true);
                    }}
                  >
                    <Ionicons name="flash" size={14} color={Colors.dark.buttonText} />
                    <Text style={styles.upgradeButtonSmallText}>Upgrade to AI Pro</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('player.settings.language')} & {t('player.settings.notifications')}</Text>
          <View style={styles.sectionCard}>
            <Pressable
              style={styles.settingItem}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowLanguageModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('player.settings.language')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="globe-outline" size={20} color={Colors.dark.primary} />
              </View>
              <Text style={styles.settingLabel}>{t('player.settings.language')}</Text>
              <Text style={[styles.settingValue, { marginRight: Spacing.xs }]} numberOfLines={1}>
                {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.nativeLabel ?? i18n.language}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </Pressable>
            <Pressable
              style={[styles.settingItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                (navigation as any).navigate("PlayerNotifications");
              }}
              accessibilityRole="button"
              accessibilityLabel={t('player.settings.notifications')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="notifications-outline" size={20} color={Colors.dark.primary} />
              </View>
              <Text style={styles.settingLabel}>{t('player.settings.notifications')}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.sectionCard}>
            <View style={styles.appearanceRow}>
              {(["light", "dark", "system"] as PlayerAppearancePreference[]).map((opt) => {
                const selected = appearancePref === opt;
                const labels: Record<PlayerAppearancePreference, string> = {
                  light: "Light",
                  dark: "Dark",
                  system: "System",
                };
                const icons: Record<PlayerAppearancePreference, keyof typeof Ionicons.glyphMap> = {
                  light: "sunny-outline",
                  dark: "moon-outline",
                  system: "phone-portrait-outline",
                };
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setAppearancePref(opt);
                    }}
                    style={[
                      styles.appearanceSegment,
                      selected && styles.appearanceSegmentSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${labels[opt]} appearance`}
                  >
                    <Ionicons
                      name={icons[opt]}
                      size={18}
                      color={selected ? Colors.dark.buttonText : Colors.dark.textMuted}
                    />
                    <Text
                      style={[
                        styles.appearanceSegmentLabel,
                        selected && styles.appearanceSegmentLabelSelected,
                      ]}
                    >
                      {labels[opt]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Theme</Text>
          <View style={styles.sectionCard}>
            <View style={styles.appearanceRow}>
              <Pressable
                key="follow-academy"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPlayerOverride(null);
                }}
                style={[
                  styles.appearanceSegment,
                  themeMode === "academy" && styles.appearanceSegmentSelected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: themeMode === "academy" }}
                accessibilityLabel="Follow my academy theme"
              >
                <Ionicons
                  name="business-outline"
                  size={18}
                  color={themeMode === "academy" ? Colors.dark.buttonText : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.appearanceSegmentLabel,
                    themeMode === "academy" && styles.appearanceSegmentLabelSelected,
                  ]}
                >
                  Follow Academy
                </Text>
              </Pressable>
              <Pressable
                key="custom"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (themeMode === "academy") {
                    // Seed with the default Glow theme so something is selected.
                    setPlayerOverride(defaultAcademyTheme);
                  }
                }}
                style={[
                  styles.appearanceSegment,
                  themeMode === "preset" && styles.appearanceSegmentSelected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: themeMode === "preset" }}
                accessibilityLabel="Use my own theme"
              >
                <Ionicons
                  name="color-palette-outline"
                  size={18}
                  color={themeMode === "preset" ? Colors.dark.buttonText : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.appearanceSegmentLabel,
                    themeMode === "preset" && styles.appearanceSegmentLabelSelected,
                  ]}
                >
                  My Theme
                </Text>
              </Pressable>
            </View>

            {themeMode === "preset" ? (
              <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md }}>
                <MyThemeEditor
                  override={playerOverride}
                  setOverride={setPlayerOverride}
                  initialMode={appearanceResolved === "light" ? "light" : "dark"}
                />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('player.settings.notifications')}</Text>
          <View style={styles.sectionCard}>
            {notificationSettings.map(renderSettingItem)}
          </View>
        </View>

        <WhatsNewSettingsCard />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('player.settings.messageTone')}</Text>
          <View style={styles.sectionCard}>
            {languageOptions.map((option) => (
              <Pressable
                key={option.id}
                style={styles.settingItem}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMessageLanguage(option.id as "player" | "coach" | "parent");
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${option.label} message style`}
              >
                <View style={styles.settingIcon}>
                  <Ionicons 
                    name={option.id === "player" ? "happy" : option.id === "coach" ? "code" : "people"} 
                    size={20} 
                    color={Colors.dark.primary} 
                  />
                </View>
                <View style={styles.languageTextContainer}>
                  <Text style={styles.settingLabel}>{option.label}</Text>
                  <Text style={styles.languageDescription}>{option.description}</Text>
                </View>
                <View style={[
                  styles.radioOuter,
                  messageLanguage === option.id && styles.radioOuterSelected
                ]}>
                  {messageLanguage === option.id && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('player.settings.language')}</Text>
          <View style={styles.sectionCard}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Pressable
                key={lang.code}
                style={styles.settingItem}
                onPress={() => handleLanguageChange(lang.code as LanguageCode)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${lang.label} language`}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="language" size={20} color={Colors.dark.primary} />
                </View>
                <View style={styles.languageTextContainer}>
                  <Text style={styles.settingLabel}>{lang.nativeLabel}</Text>
                  <Text style={styles.languageDescription}>{lang.label}</Text>
                </View>
                <View style={[
                  styles.radioOuter,
                  i18n.language === lang.code && styles.radioOuterSelected
                ]}>
                  {i18n.language === lang.code ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('player.settings.discovery')}</Text>
          <View style={styles.sectionCard}>
            {discoverySettings.map(renderSettingItem)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('player.settings.account')}</Text>
          <View style={styles.sectionCard}>
            {accountSettings.map(renderSettingItem)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Family</Text>
          <View style={styles.sectionCard}>
            <Pressable
              style={styles.settingItem}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setJoinCode("");
                setShowJoinFamily(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Join a family account"
            >
              <View style={styles.settingIcon}>
                <Ionicons name="people" size={20} color={Colors.dark.primary} />
              </View>
              <Text style={styles.settingLabel}>Join a Family</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.sectionCard}>
            {legalSettings.map(renderSettingItem)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.sectionCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="code" size={20} color={Colors.dark.primary} />
              </View>
              <Text style={styles.settingLabel}>Version</Text>
              <Text style={styles.settingValue}>{appVersion}</Text>
            </View>
          </View>
        </View>

        {Platform.OS === "ios" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Apple Sign-In</Text>
            <View style={styles.sectionCard}>
              <View style={styles.settingItem}>
                <View style={styles.settingIcon}>
                  <Ionicons name="logo-apple" size={20} color={Colors.dark.primary} />
                </View>
                <Text style={styles.settingLabel}>
                  {appleLinked ? "Apple ID Linked" : "Link Apple ID"}
                </Text>
                {appleLoading ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : (
                  <Pressable
                    onPress={appleLinked ? handleUnlinkApple : handleLinkApple}
                    style={{
                      paddingHorizontal: Spacing.md,
                      paddingVertical: Spacing.xs,
                      borderRadius: BorderRadius.sm,
                      backgroundColor: appleLinked ? "rgba(255,76,77,0.15)" : "rgba(0,230,118,0.15)",
                    }}
                  >
                    <Text style={{
                      ...Typography.small,
                      fontWeight: "600",
                      color: appleLinked ? Colors.dark.error : "#00E676",
                    }}>
                      {appleLinked ? "Unlink" : "Link"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ) : null}

        <Pressable 
          style={styles.logoutButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => {
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
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

        <Pressable
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={deleteLoading}
          accessibilityRole="button"
          accessibilityLabel="Delete my account"
        >
          {deleteLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.error} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
              <Text style={styles.deleteAccountText}>Delete My Account</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={showJoinFamily} transparent animationType="slide" onRequestClose={() => setShowJoinFamily(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="people" size={24} color={Colors.dark.primary} />
                <Text style={styles.modalTitle}>Join a Family</Text>
              </View>
              <Pressable onPress={() => setShowJoinFamily(false)} accessibilityRole="button" accessibilityLabel="Close join family modal">
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Enter the invite code shared by your parent to join their family account.
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="Enter invite code"
              placeholderTextColor={Colors.dark.textMuted}
              value={joinCode}
              onChangeText={(text) => setJoinCode(text.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              accessibilityLabel="Family invite code"
            />
            <Pressable
              style={[styles.joinButton, (!joinCode.trim() || joinLoading) ? styles.joinButtonDisabled : null]}
              onPress={handleJoinFamily}
              disabled={!joinCode.trim() || joinLoading}
              accessibilityRole="button"
              accessibilityLabel="Join family"
            >
              {joinLoading ? (
                <ActivityIndicator color={Colors.dark.buttonText} size="small" />
              ) : (
                <Text style={styles.joinButtonText}>Join Family</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <LanguageSelectorModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />

      <AiProUpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSubscribed={() => {
          setShowUpgradeModal(false);
          refetchAiPro();
        }}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    padding: 0,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  appearanceRow: {
    flexDirection: "row",
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  appearanceSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "transparent",
  },
  appearanceSegmentSelected: {
    backgroundColor: GlowColors.primary,
  },
  appearanceSegmentLabel: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  appearanceSegmentLabelSelected: {
    color: Colors.dark.buttonText,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  settingValue: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.dark.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: Colors.dark.accentText,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GlowColors.primary,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: Spacing.sm,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  sportCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  switchedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    marginBottom: Spacing.sm,
  },
  switchedBannerText: {
    ...Typography.small,
    color: "#FFD700",
    flex: 1,
    lineHeight: 18,
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  deleteAccountText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 76, 77, 0.2)",
  },
  logoutText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    lineHeight: 20,
  },
  codeInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.primary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    textAlign: "center",
    letterSpacing: 4,
  },
  joinButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  joinButtonDisabled: {
    opacity: 0.4,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  aiProBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  aiProBadgeActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary + "60",
  },
  aiProBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Colors.dark.textMuted,
  },
  aiProBadgeTextActive: {
    color: Colors.dark.primary,
  },
  quotaBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    marginTop: 2,
    overflow: "hidden",
  },
  quotaFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.primary,
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.chipBackground,
    alignSelf: "flex-start",
  },
  manageButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  upgradeButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary,
    alignSelf: "flex-start",
  },
  upgradeButtonSmallText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
}));
