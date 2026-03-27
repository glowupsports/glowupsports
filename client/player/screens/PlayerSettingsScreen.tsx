import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { SUPPORTED_LANGUAGES, setStoredLanguage, type LanguageCode } from "@/i18n";

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
  const { logout } = useAuth();
  const { isRegistered } = usePushNotifications();
  const { t, i18n } = useTranslation();

  const [notifications, setNotifications] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [progressUpdates, setProgressUpdates] = useState(true);
  const [coachMessages, setCoachMessages] = useState(true);
  const [messageLanguage, setMessageLanguage] = useState<"player" | "coach" | "parent">("player");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [appleLinked, setAppleLinked] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkAppleStatus();
    }
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
                      Alert.alert(
                        "Account Deleted",
                        "Your account has been permanently deleted. A confirmation has been sent to your email address.",
                        [
                          {
                            text: "OK",
                            onPress: () => {
                              setTimeout(() => {
                                logout();
                              }, 350);
                            },
                          },
                        ]
                      );
                    } catch (error: any) {
                      showAlert("Error", error?.message || "Failed to delete account. Please contact support@glowupsports.com");
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
        <Ionicons name={item.icon as any} size={20} color={Colors.dark.xpCyan} />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
          <Text style={styles.sectionTitle}>{t('player.settings.notifications')}</Text>
          <View style={styles.sectionCard}>
            {notificationSettings.map(renderSettingItem)}
          </View>
        </View>

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
                    color={Colors.dark.xpCyan} 
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
                  <Ionicons name="language" size={20} color={Colors.dark.xpCyan} />
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
                <Ionicons name="code" size={20} color={Colors.dark.xpCyan} />
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
                  <Ionicons name="logo-apple" size={20} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.settingLabel}>
                  {appleLinked ? "Apple ID Linked" : "Link Apple ID"}
                </Text>
                {appleLoading ? (
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
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
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: 0,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
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
    borderColor: GlowColors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GlowColors.primary,
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
});
