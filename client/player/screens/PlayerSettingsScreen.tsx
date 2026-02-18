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

interface PushDebugInfo {
  userId: string;
  playerId: string | null;
  coachId: string | null;
  activeTokens: number;
  totalTokens: number;
  firebaseInitialized: boolean;
  tokens: Array<{
    platform: string;
    deviceName: string;
    tokenType: string;
    tokenPreview: string;
    lastUsedAt: string;
  }>;
  diagnostics: {
    hasActiveExpoTokens: boolean;
    hasActiveFCMTokens: boolean;
    playerTokensLinked: boolean;
    coachTokensLinked: boolean;
  };
}

export default function PlayerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { logout } = useAuth();
  const { expoPushToken, isRegistered, enableNotifications } = usePushNotifications();
  const { t, i18n } = useTranslation();

  const [notifications, setNotifications] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [progressUpdates, setProgressUpdates] = useState(true);
  const [coachMessages, setCoachMessages] = useState(true);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testAllLoading, setTestAllLoading] = useState(false);
  const [testFeedbackLoading, setTestFeedbackLoading] = useState(false);
  const [reRegisterLoading, setReRegisterLoading] = useState(false);
  const [messageLanguage, setMessageLanguage] = useState<"player" | "coach" | "parent">("player");
  const [debugInfo, setDebugInfo] = useState<PushDebugInfo | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
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

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const fetchDebugInfo = async () => {
    setDebugLoading(true);
    try {
      const url = new URL('/api/push/debug', getApiUrl());
      const response = await apiRequest("GET", url.toString());
      setDebugInfo(response as unknown as PushDebugInfo);
    } catch (error) {
      console.error("Failed to fetch push debug info:", error);
    } finally {
      setDebugLoading(false);
    }
  };

  useEffect(() => {
    fetchDebugInfo();
  }, []);

  const handleReRegister = async () => {
    setReRegisterLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const success = await enableNotifications();
      if (success) {
        showAlert("Success", "Push token re-registered successfully! Try sending a test notification now.");
        fetchDebugInfo();
      } else {
        showAlert("Failed", "Could not register push token. Make sure notifications are enabled in your device settings.");
      }
    } catch (error) {
      showAlert("Error", "Failed to re-register. Check device notification settings.");
    } finally {
      setReRegisterLoading(false);
    }
  };

  const handleTestPushNotification = async () => {
    setTestPushLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/push/test", {});
      const data = response as unknown as { success: boolean; devicesNotified?: number };
      const deviceCount = data.devicesNotified ?? 1;
      showAlert("Success", `Test notification sent to ${deviceCount} device(s). Check your phone!`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to send test notification";
      showAlert("Error", errMsg);
    } finally {
      setTestPushLoading(false);
    }
  };

  const handleTestAllNotifications = async () => {
    setTestAllLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const response = await apiRequest("POST", "/api/push/test-all-types", {});
      const data = response as unknown as { success: boolean; devicesNotified: number; notificationsSent: number; results: any[] };
      const succeeded = data.results?.filter((r: any) => r.success).length || 0;
      const failed = data.results?.filter((r: any) => !r.success).length || 0;
      showAlert(
        "All Notifications Sent",
        `Sent ${succeeded} notification types to ${data.devicesNotified} device(s).\n\n${failed > 0 ? `${failed} failed.` : "All succeeded!"}\n\nYou should receive them over the next 20 seconds.`
      );
    } catch (error: any) {
      const errData = error?.message || "Failed";
      showAlert("Error", `Could not send test notifications: ${errData}`);
    } finally {
      setTestAllLoading(false);
    }
  };

  const handleTestFeedback = async () => {
    setTestFeedbackLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/player/test/feedback", {});
      const data = response as unknown as { success: boolean; simulation: { coachName: string; xpGained: number; notificationSent: boolean } };
      const message = data.simulation.notificationSent 
        ? `Simulated: Feedback from "${data.simulation.coachName}" (+${data.simulation.xpGained} XP)! Push notification sent.`
        : `Simulated feedback received. (No push token - open app on phone first)`;
      showAlert("Simulation Complete", message);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to simulate feedback";
      showAlert("Error", errMsg);
    } finally {
      setTestFeedbackLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = () => {
      setDeleteLoading(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      apiRequest("POST", "/api/delete-account-request", { email: user?.email || "", name: user?.name || user?.username || "" })
        .then(() => {
          showAlert(
            "Account Deletion Requested",
            "We've received your request. Your account will be deleted within 30 days. You'll receive a confirmation email. You can continue using the app until then."
          );
        })
        .catch((error: any) => {
          showAlert("Error", error?.message || "Failed to submit deletion request. Please contact support@glowupsports.com");
        })
        .finally(() => setDeleteLoading(false));
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to delete your account?\n\nThis action cannot be undone. All your data, progress, XP, and match history will be permanently removed within 30 days."
      );
      if (confirmed) confirmDelete();
    } else {
      Alert.alert(
        "Delete Account",
        "Are you sure you want to delete your account?\n\nThis action cannot be undone. All your data, progress, XP, and match history will be permanently removed within 30 days.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete My Account", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
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

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.dark.error }]}>Danger Zone</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#E67E22" }]}>Notification Debug</Text>
          <View style={styles.devToolsCard}>
            {debugLoading ? (
              <ActivityIndicator size="small" color="#E67E22" />
            ) : debugInfo ? (
              <View style={styles.debugInfoContainer}>
                <View style={styles.debugStatusRow}>
                  <Ionicons 
                    name={debugInfo.firebaseInitialized ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={debugInfo.firebaseInitialized ? "#00E676" : "#FF4C4D"} 
                  />
                  <Text style={styles.debugLabel}>Firebase: {debugInfo.firebaseInitialized ? "Connected" : "Not Connected"}</Text>
                </View>
                <View style={styles.debugStatusRow}>
                  <Ionicons 
                    name={debugInfo.activeTokens > 0 ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={debugInfo.activeTokens > 0 ? "#00E676" : "#FF4C4D"} 
                  />
                  <Text style={styles.debugLabel}>
                    Registered Devices: {debugInfo.activeTokens}
                    {debugInfo.activeTokens === 0 ? " (tap Re-Register below)" : ""}
                  </Text>
                </View>
                {debugInfo.tokens.map((t, i) => (
                  <View key={i} style={styles.debugTokenRow}>
                    <Ionicons name={t.platform === "android" ? "logo-android" : "phone-portrait"} size={14} color="#E67E22" />
                    <Text style={styles.debugTokenText}>
                      {t.tokenType.toUpperCase()} | {t.deviceName || t.platform} | {t.tokenPreview}
                    </Text>
                  </View>
                ))}
                <View style={styles.debugStatusRow}>
                  <Ionicons 
                    name={debugInfo.diagnostics.hasActiveFCMTokens ? "checkmark-circle" : "alert-circle"} 
                    size={16} 
                    color={debugInfo.diagnostics.hasActiveFCMTokens ? "#00E676" : "#FFD700"} 
                  />
                  <Text style={styles.debugLabel}>FCM Token: {debugInfo.diagnostics.hasActiveFCMTokens ? "Yes" : "No"}</Text>
                </View>
                <View style={styles.debugStatusRow}>
                  <Ionicons 
                    name={debugInfo.diagnostics.playerTokensLinked ? "checkmark-circle" : "alert-circle"} 
                    size={16} 
                    color={debugInfo.diagnostics.playerTokensLinked ? "#00E676" : "#FFD700"} 
                  />
                  <Text style={styles.debugLabel}>Player Linked: {debugInfo.diagnostics.playerTokensLinked ? "Yes" : "No"}</Text>
                </View>
                {expoPushToken ? (
                  <View style={styles.debugStatusRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#00E676" />
                    <Text style={styles.debugLabel}>Client Token: {expoPushToken.substring(0, 30)}...</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.devToolsNote}>Could not load push debug info</Text>
            )}

            <Pressable
              style={[styles.devToolsButton, { backgroundColor: "rgba(0, 230, 118, 0.12)", borderColor: "rgba(0, 230, 118, 0.3)" }, reRegisterLoading && styles.devToolsButtonDisabled]}
              onPress={handleReRegister}
              disabled={reRegisterLoading}
              accessibilityRole="button"
              accessibilityLabel="Re-register push token"
            >
              {reRegisterLoading ? (
                <ActivityIndicator size="small" color="#00E676" />
              ) : (
                <>
                  <Ionicons name="refresh" size={20} color="#00E676" />
                  <Text style={[styles.devToolsButtonText, { color: "#00E676" }]}>Re-Register Push Token</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.devToolsButton, testPushLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestPushNotification}
              disabled={testPushLoading}
              accessibilityRole="button"
              accessibilityLabel="Test single notification"
            >
              {testPushLoading ? (
                <ActivityIndicator size="small" color="#E67E22" />
              ) : (
                <>
                  <Ionicons name="notifications" size={20} color="#E67E22" />
                  <Text style={styles.devToolsButtonText}>Test Single Notification</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.devToolsButton, { backgroundColor: "rgba(255, 0, 128, 0.12)", borderColor: "rgba(255, 0, 128, 0.3)" }, testAllLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestAllNotifications}
              disabled={testAllLoading}
              accessibilityRole="button"
              accessibilityLabel="Test all notification types"
            >
              {testAllLoading ? (
                <ActivityIndicator size="small" color="#FF0080" />
              ) : (
                <>
                  <Ionicons name="rocket" size={20} color="#FF0080" />
                  <Text style={[styles.devToolsButtonText, { color: "#FF0080" }]}>Test ALL Notification Types</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.devToolsButton, testFeedbackLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestFeedback}
              disabled={testFeedbackLoading}
              accessibilityRole="button"
              accessibilityLabel="Simulate coach feedback"
            >
              {testFeedbackLoading ? (
                <ActivityIndicator size="small" color="#E67E22" />
              ) : (
                <>
                  <Ionicons name="star" size={20} color="#E67E22" />
                  <Text style={styles.devToolsButtonText}>Simulate Coach Feedback</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.devToolsButton, { backgroundColor: "rgba(0, 212, 255, 0.12)", borderColor: "rgba(0, 212, 255, 0.3)" }]}
              onPress={fetchDebugInfo}
              accessibilityRole="button"
              accessibilityLabel="Refresh debug info"
            >
              <Ionicons name="sync" size={20} color="#00D4FF" />
              <Text style={[styles.devToolsButtonText, { color: "#00D4FF" }]}>Refresh Debug Info</Text>
            </Pressable>
          </View>
        </View>

        <Pressable 
          style={styles.logoutButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => {
            if (Platform.OS === "web") {
              const confirmed = window.confirm("Are you sure you want to sign out?");
              if (confirmed) {
                logout();
              }
            } else {
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
            }
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
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
  devToolsCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  devToolsNote: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  debugInfoContainer: {
    gap: 6,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    marginBottom: Spacing.xs,
  },
  debugStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  debugLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  debugTokenRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingLeft: 22,
  },
  debugTokenText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flex: 1,
  },
  devToolsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "rgba(230, 126, 34, 0.12)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(230, 126, 34, 0.2)",
  },
  devToolsButtonDisabled: {
    opacity: 0.6,
  },
  devToolsButtonText: {
    ...Typography.body,
    color: "#E67E22",
    fontWeight: "600",
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: "rgba(255, 76, 77, 0.08)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 76, 77, 0.25)",
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
