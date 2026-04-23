import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Platform,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/coach/context/AuthContext";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  Backgrounds,
} from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TabKey = "start" | "explore" | "faq" | "whatsnew";

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "start", icon: "rocket" },
  { key: "explore", icon: "compass" },
  { key: "faq", icon: "help-circle" },
  { key: "whatsnew", icon: "sparkles" },
];

interface DashboardLite {
  player?: {
    id?: string;
    level?: number;
    xp?: number;
    streak?: number;
    ballLevel?: string | null;
    profilePhotoUrl?: string | null;
  } | null;
  coach?: { id: string } | null;
  academy?: { id: string; name: string } | null;
  nextSession?: { id: string } | null;
  isFreePlayer?: boolean;
}

interface FriendsLite {
  friends?: any[];
  pendingRequests?: any[];
}

interface ProfileLite {
  player?: {
    bio?: string | null;
    profilePhotoUrl?: string | null;
    city?: string | null;
    goals?: string | null;
  } | null;
}

interface ChecklistStep {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel: string;
  done: boolean;
  onPress: () => void;
}

type FAQCategoryKey = "Booking" | "Progress" | "Billing" | "Social" | "Account";

const FAQ_IDS: { id: string; category: FAQCategoryKey }[] = [
  { id: "bookSession", category: "Booking" },
  { id: "bookCourt", category: "Booking" },
  { id: "cancelSession", category: "Booking" },
  { id: "glowScore", category: "Progress" },
  { id: "glowRank", category: "Progress" },
  { id: "earnXp", category: "Progress" },
  { id: "ballLevel", category: "Progress" },
  { id: "aiCoach", category: "Progress" },
  { id: "tennisDna", category: "Progress" },
  { id: "credits", category: "Billing" },
  { id: "topUp", category: "Billing" },
  { id: "refunds", category: "Billing" },
  { id: "findPlayers", category: "Social" },
  { id: "spotlight", category: "Social" },
  { id: "quests", category: "Progress" },
  { id: "profile", category: "Account" },
  { id: "notifications", category: "Account" },
  { id: "privacy", category: "Account" },
];

const FAQ_CATEGORIES: ("All" | FAQCategoryKey)[] = [
  "All",
  "Booking",
  "Progress",
  "Billing",
  "Social",
  "Account",
];
type FAQCategory = (typeof FAQ_CATEGORIES)[number];

const GLOSSARY_KEYS: { key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "academy", icon: "business" },
  { key: "aiCoach", icon: "sparkles" },
  { key: "ballLevel", icon: "tennisball" },
  { key: "credits", icon: "wallet" },
  { key: "glowCoins", icon: "logo-bitcoin" },
  { key: "glowScore", icon: "star" },
  { key: "glowRank", icon: "podium" },
  { key: "pillar", icon: "grid" },
  { key: "quest", icon: "flag" },
  { key: "session", icon: "calendar" },
  { key: "spotlight", icon: "star-half" },
  { key: "tennisDna", icon: "fitness" },
  { key: "trialGate", icon: "checkmark-done" },
  { key: "xp", icon: "flash" },
];

interface ExploreEntryDef {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: (nav: any) => void;
}

const EXPLORE_GROUPS: { groupKey: string; entries: ExploreEntryDef[] }[] = [
  {
    groupKey: "train",
    entries: [
      { key: "bookLesson", icon: "calendar", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Schedule" }) },
      { key: "trackProgress", icon: "trending-up", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Growth" }) },
      { key: "aiCoach", icon: "sparkles", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Growth", params: { screen: "AICoach" } }) },
      { key: "tennisDna", icon: "fitness", onPress: (nav) => nav.navigate("PlayerDNAWizard") },
      { key: "dailyQuests", icon: "flag", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Growth", params: { screen: "QuestsMain" } }) },
    ],
  },
  {
    groupKey: "play",
    entries: [
      { key: "findPlayers", icon: "people", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Play" }) },
      { key: "bookCourt", icon: "tennisball", onPress: (nav) => nav.navigate("CourtBooking") },
      { key: "tournaments", icon: "trophy", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Play", params: { initialTab: "Tournaments" } }) },
      { key: "groupEvents", icon: "calendar-number", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Play" }) },
    ],
  },
  {
    groupKey: "connect",
    entries: [
      { key: "communityFeed", icon: "chatbubbles", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Community" }) },
      { key: "friends", icon: "person-add", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Community" }) },
      { key: "spotlight", icon: "star", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Community" }) },
      { key: "messages", icon: "mail", onPress: (nav) => nav.navigate("PlayerMessages") },
    ],
  },
  {
    groupKey: "account",
    entries: [
      { key: "wallet", icon: "wallet", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Profile" }) },
      { key: "glowMarket", icon: "cart", onPress: (nav) => nav.navigate("Shop") },
      { key: "notifications", icon: "notifications", onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Profile" }) },
      { key: "settings", icon: "settings", onPress: (nav) => nav.navigate("Settings") },
    ],
  },
];

const WHATS_NEW_IDS: { id: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "unifiedGuide", icon: "sparkles" },
  { id: "searchableFaq", icon: "search" },
  { id: "smarterEmpty", icon: "bulb" },
  { id: "helpButton", icon: "help-circle" },
];

export default function PlayerGuideScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user, isGuest } = useAuth();
  const { t } = useTranslation();
  const initialTab: TabKey = (route.params?.initialTab as TabKey) || "start";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [faqQuery, setFaqQuery] = useState("");
  const [faqCategory, setFaqCategory] = useState<FAQCategory>("All");

  const enabled = !!user?.playerId && !isGuest;

  const { data: dashboard } = useQuery<DashboardLite>({
    queryKey: ["/api/player/me/dashboard"],
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: profile } = useQuery<ProfileLite>({
    queryKey: ["/api/player/me/profile"],
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: friends } = useQuery<FriendsLite>({
    queryKey: ["/api/player/me/friends"],
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: notificationPrefs } = useQuery<{ enabled?: boolean }>({
    queryKey: ["/api/player/me/notification-preferences"],
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const handleTabChange = useCallback((tab: TabKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const checklistSteps = useMemo<ChecklistStep[]>(() => {
    const playerProfile = profile?.player ?? null;
    const hasPhoto =
      !!playerProfile?.profilePhotoUrl || !!dashboard?.player?.profilePhotoUrl;
    const hasBio = !!playerProfile?.bio && playerProfile.bio.trim().length > 0;
    const hasProfile = hasPhoto && hasBio;
    const hasAcademy = !!dashboard?.academy;
    const hasNextSession = !!dashboard?.nextSession;
    const isFree = dashboard?.isFreePlayer ?? !dashboard?.academy;
    const hasFriends = (friends?.friends?.length ?? 0) > 0;
    const hasNotifications = notificationPrefs?.enabled === true;
    const hasProgressActivity =
      (dashboard?.player?.xp ?? 0) > 0 || (dashboard?.player?.level ?? 1) > 1;

    const steps: ChecklistStep[] = [
      {
        id: "profile",
        icon: "person-circle",
        title: t("playerGuide.steps.profile.title"),
        description: t("playerGuide.steps.profile.desc"),
        actionLabel: t("playerGuide.steps.profile.action"),
        done: hasProfile,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Profile" }),
      },
      isFree
        ? {
            id: "court",
            icon: "tennisball",
            title: t("playerGuide.steps.court.title"),
            description: t("playerGuide.steps.court.desc"),
            actionLabel: t("playerGuide.steps.court.action"),
            done: hasNextSession,
            onPress: () => navigation.navigate("CourtBooking"),
          }
        : {
            id: "session",
            icon: "calendar",
            title: t("playerGuide.steps.session.title"),
            description: t("playerGuide.steps.session.desc"),
            actionLabel: t("playerGuide.steps.session.action"),
            done: hasNextSession,
            onPress: () => navigation.navigate("PlayerTabs", { screen: "Schedule" }),
          },
      {
        id: "academy",
        icon: "business",
        title: hasAcademy
          ? t("playerGuide.steps.academyJoined.title")
          : t("playerGuide.steps.academyFind.title"),
        description: hasAcademy
          ? t("playerGuide.steps.academyJoined.desc")
          : t("playerGuide.steps.academyFind.desc"),
        actionLabel: hasAcademy
          ? t("playerGuide.steps.academyJoined.action")
          : t("playerGuide.steps.academyFind.action"),
        done: hasAcademy,
        onPress: () =>
          hasAcademy
            ? navigation.navigate("PlayerTabs", { screen: "Schedule" })
            : navigation.navigate("AcademyBrowser"),
      },
      {
        id: "progress",
        icon: "trending-up",
        title: t("playerGuide.steps.progressCheck.title"),
        description: t("playerGuide.steps.progressCheck.desc"),
        actionLabel: t("playerGuide.steps.progressCheck.action"),
        done: hasProgressActivity,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Growth" }),
      },
      {
        id: "community",
        icon: "people",
        title: t("playerGuide.steps.community.title"),
        description: t("playerGuide.steps.community.desc"),
        actionLabel: t("playerGuide.steps.community.action"),
        done: hasFriends,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Community" }),
      },
      {
        id: "notifications",
        icon: "notifications",
        title: t("playerGuide.steps.notifications.title"),
        description: t("playerGuide.steps.notifications.desc"),
        actionLabel: t("playerGuide.steps.notifications.action"),
        done: hasNotifications,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Profile" }),
      },
    ];
    return steps;
  }, [dashboard, profile, friends, notificationPrefs, navigation, t]);

  const completedCount = checklistSteps.filter((s) => s.done).length;
  const progressPercent = Math.round((completedCount / checklistSteps.length) * 100);

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    return FAQ_IDS.map((item) => {
      const question = t(`playerGuide.faq.items.${item.id}.q`);
      const answer = t(`playerGuide.faq.items.${item.id}.a`);
      const categoryLabel = t(`playerGuide.faq.categories.${item.category}`);
      return { id: item.id, category: item.category, question, answer, categoryLabel };
    }).filter((item) => {
      const matchesCategory = faqCategory === "All" || item.category === faqCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q)
      );
    });
  }, [faqQuery, faqCategory, t]);

  const handleEmail = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const subject = encodeURIComponent(t("playerGuide.faq.emailSupportSubject"));
      await Linking.openURL(`mailto:support@glowupsports.com?subject=${subject}`);
    } catch {
      /* ignore */
    }
  }, [t]);

  const handleReportBug = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ReportIssue");
  }, [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={8}
          accessibilityLabel={t("playerGuide.back")}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("playerGuide.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => handleTabChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? GlowColors.primary : TextColors.muted}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {t(`playerGuide.tabs.${tab.key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === "start" ? (
          <View>
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                <Text style={styles.progressTitle}>{t("playerGuide.progress.title")}</Text>
                <Text style={styles.progressCount}>
                  {t("playerGuide.progress.count", {
                    done: completedCount,
                    total: checklistSteps.length,
                  })}
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressHint}>
                {progressPercent === 100
                  ? t("playerGuide.progress.hintComplete")
                  : t("playerGuide.progress.hintIncomplete")}
              </Text>
            </View>

            {checklistSteps.map((step) => (
              <View key={step.id} style={styles.stepCard}>
                <View style={[styles.stepIcon, step.done && styles.stepIconDone]}>
                  <Ionicons
                    name={step.done ? "checkmark" : step.icon}
                    size={18}
                    color={step.done ? Colors.dark.buttonText : GlowColors.primary}
                  />
                </View>
                <View style={styles.stepBody}>
                  <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>
                    {step.title}
                  </Text>
                  <Text style={styles.stepDesc}>{step.description}</Text>
                  {!step.done ? (
                    <Pressable style={styles.stepCta} onPress={step.onPress}>
                      <Text style={styles.stepCtaText}>{step.actionLabel}</Text>
                      <Ionicons name="arrow-forward" size={14} color={GlowColors.primary} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === "explore" ? (
          <View>
            <Text style={styles.intro}>{t("playerGuide.explore.intro")}</Text>
            {EXPLORE_GROUPS.map((group) => (
              <View key={group.groupKey} style={styles.groupSection}>
                <Text style={styles.groupTitle}>
                  {t(`playerGuide.explore.groups.${group.groupKey}`)}
                </Text>
                {group.entries.map((entry) => (
                  <Pressable
                    key={entry.key}
                    style={styles.exploreCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      entry.onPress(navigation);
                    }}
                  >
                    <View style={styles.exploreIcon}>
                      <Ionicons name={entry.icon} size={20} color={GlowColors.primary} />
                    </View>
                    <View style={styles.exploreBody}>
                      <Text style={styles.exploreTitle}>
                        {t(`playerGuide.explore.entries.${entry.key}.title`)}
                      </Text>
                      <Text style={styles.exploreDesc}>
                        {t(`playerGuide.explore.entries.${entry.key}.desc`)}
                      </Text>
                      <Text style={styles.exploreCta}>
                        {t(`playerGuide.explore.entries.${entry.key}.cta`)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.groupSection}>
              <Text style={styles.groupTitle}>{t("playerGuide.explore.groups.glossary")}</Text>
              {GLOSSARY_KEYS.map((g) => (
                <View key={g.key} style={styles.glossaryRow}>
                  <View style={styles.glossaryIcon}>
                    <Ionicons name={g.icon} size={16} color={GlowColors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.glossaryTerm}>
                      {t(`playerGuide.explore.glossary.${g.key}.term`)}
                    </Text>
                    <Text style={styles.glossaryDef}>
                      {t(`playerGuide.explore.glossary.${g.key}.def`)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {activeTab === "faq" ? (
          <View>
            <View style={styles.searchRow}>
              <Ionicons
                name="search"
                size={16}
                color={TextColors.muted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder={t("playerGuide.faq.searchPlaceholder")}
                placeholderTextColor={TextColors.muted}
                value={faqQuery}
                onChangeText={setFaqQuery}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel={t("playerGuide.faq.searchA11y")}
              />
              {faqQuery.length > 0 ? (
                <Pressable
                  onPress={() => setFaqQuery("")}
                  hitSlop={8}
                  accessibilityLabel={t("playerGuide.faq.clearA11y")}
                >
                  <Ionicons name="close-circle" size={16} color={TextColors.muted} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryRow}
            >
              {FAQ_CATEGORIES.map((cat) => {
                const active = cat === faqCategory;
                return (
                  <Pressable
                    key={cat}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setFaqCategory(cat);
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        active && styles.categoryChipTextActive,
                      ]}
                    >
                      {t(`playerGuide.faq.categories.${cat}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredFaqs.length === 0 ? (
              <View style={styles.faqEmpty}>
                <Ionicons name="search" size={28} color={TextColors.muted} />
                <Text style={styles.faqEmptyTitle}>{t("playerGuide.faq.emptyTitle")}</Text>
                <Text style={styles.faqEmptyDesc}>{t("playerGuide.faq.emptyDesc")}</Text>
              </View>
            ) : (
              filteredFaqs.map((item, idx) => (
                <FAQRow
                  key={item.id}
                  question={item.question}
                  answer={item.answer}
                  categoryLabel={item.categoryLabel}
                  index={idx}
                />
              ))
            )}

            <View style={styles.supportSection}>
              <Text style={styles.groupTitle}>{t("playerGuide.faq.needHelp")}</Text>
              <Pressable style={styles.supportCard} onPress={handleEmail}>
                <View style={styles.supportIcon}>
                  <Ionicons name="mail" size={20} color={GlowColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportTitle}>{t("playerGuide.faq.emailSupport")}</Text>
                  <Text style={styles.supportDesc}>{t("playerGuide.faq.emailSupportDesc")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
              </Pressable>
              <Pressable style={styles.supportCard} onPress={handleReportBug}>
                <View
                  style={[
                    styles.supportIcon,
                    { backgroundColor: `${Colors.dark.accentWarning}20` },
                  ]}
                >
                  <Ionicons name="bug" size={20} color={Colors.dark.accentWarning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportTitle}>{t("playerGuide.faq.reportBug")}</Text>
                  <Text style={styles.supportDesc}>{t("playerGuide.faq.reportBugDesc")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {activeTab === "whatsnew" ? (
          <View>
            <Text style={styles.intro}>{t("playerGuide.whatsnew.intro")}</Text>
            {WHATS_NEW_IDS.map((item) => (
              <View key={item.id} style={styles.newsCard}>
                <View style={styles.newsIcon}>
                  <Ionicons name={item.icon} size={20} color={GlowColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.newsDate}>
                    {t(`playerGuide.whatsnew.items.${item.id}.date`)}
                  </Text>
                  <Text style={styles.newsTitle}>
                    {t(`playerGuide.whatsnew.items.${item.id}.title`)}
                  </Text>
                  <Text style={styles.newsDesc}>
                    {t(`playerGuide.whatsnew.items.${item.id}.desc`)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function FAQRow({
  question,
  answer,
  categoryLabel,
  index,
}: {
  question: string;
  answer: string;
  categoryLabel: string;
  index: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      style={styles.faqItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen((v) => !v);
      }}
      accessibilityRole="button"
      accessibilityLabel={t("playerGuide.faq.a11yItem", { index: index + 1, question })}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={TextColors.muted} />
      </View>
      {open ? (
        <View style={styles.faqAnswerWrap}>
          <View style={styles.faqCategoryBadge}>
            <Text style={styles.faqCategoryText}>{categoryLabel}</Text>
          </View>
          <Text style={styles.faqAnswer}>{answer}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.dark.backgroundRoot,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.chipBackground,
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
    },
    tabBar: {
      flexDirection: "row",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.chipBackground,
    },
    tabButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.sm,
      backgroundColor: Backgrounds.surface,
    },
    tabButtonActive: {
      backgroundColor: `${GlowColors.primary}20`,
      borderWidth: 1,
      borderColor: `${GlowColors.primary}40`,
    },
    tabLabel: {
      ...Typography.caption,
      color: TextColors.muted,
      fontSize: 11,
    },
    tabLabelActive: {
      color: GlowColors.primary,
      fontWeight: "600",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.lg,
    },
    intro: {
      ...Typography.small,
      color: TextColors.secondary,
      marginBottom: Spacing.lg,
      lineHeight: 20,
    },
    progressCard: {
      backgroundColor: Backgrounds.elevated,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: `${GlowColors.primary}30`,
    },
    progressRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.sm,
    },
    progressTitle: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    progressCount: {
      ...Typography.small,
      color: GlowColors.primary,
      fontWeight: "600",
    },
    progressBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: Backgrounds.surface,
      overflow: "hidden",
      marginBottom: Spacing.sm,
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: GlowColors.primary,
      borderRadius: 3,
    },
    progressHint: {
      ...Typography.caption,
      color: TextColors.muted,
    },
    stepCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      padding: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    stepIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: `${GlowColors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
      marginRight: Spacing.md,
    },
    stepIconDone: {
      backgroundColor: GlowColors.primary,
    },
    stepBody: {
      flex: 1,
    },
    stepTitle: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    stepTitleDone: {
      textDecorationLine: "line-through",
      color: TextColors.muted,
    },
    stepDesc: {
      ...Typography.caption,
      color: TextColors.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    stepCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: Spacing.sm,
    },
    stepCtaText: {
      ...Typography.caption,
      color: GlowColors.primary,
      fontWeight: "600",
    },
    groupSection: {
      marginBottom: Spacing.lg,
    },
    groupTitle: {
      ...Typography.small,
      color: TextColors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: Spacing.sm,
    },
    exploreCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    exploreIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${GlowColors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
      marginRight: Spacing.md,
    },
    exploreBody: {
      flex: 1,
    },
    exploreTitle: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    exploreDesc: {
      ...Typography.caption,
      color: TextColors.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    exploreCta: {
      ...Typography.caption,
      color: GlowColors.primary,
      fontWeight: "600",
      marginTop: 4,
    },
    glossaryRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      padding: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.xs,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    glossaryIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${GlowColors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
      marginRight: Spacing.md,
    },
    glossaryTerm: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    glossaryDef: {
      ...Typography.caption,
      color: TextColors.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Platform.OS === "ios" ? Spacing.sm : 4,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    searchIcon: {
      marginRight: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: Colors.dark.text,
      fontSize: 14,
      paddingVertical: 4,
    },
    categoryScroll: {
      marginBottom: Spacing.md,
    },
    categoryRow: {
      flexDirection: "row",
      gap: Spacing.xs,
      paddingVertical: 2,
    },
    categoryChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: Backgrounds.card,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    categoryChipActive: {
      backgroundColor: `${GlowColors.primary}20`,
      borderColor: `${GlowColors.primary}60`,
    },
    categoryChipText: {
      ...Typography.caption,
      color: TextColors.muted,
      fontWeight: "600",
    },
    categoryChipTextActive: {
      color: GlowColors.primary,
    },
    faqEmpty: {
      alignItems: "center",
      padding: Spacing.lg,
      gap: Spacing.xs,
    },
    faqEmptyTitle: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
      marginTop: Spacing.sm,
    },
    faqEmptyDesc: {
      ...Typography.caption,
      color: TextColors.muted,
      textAlign: "center",
    },
    faqItem: {
      padding: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    faqHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.sm,
    },
    faqQuestion: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
      flex: 1,
    },
    faqAnswerWrap: {
      marginTop: Spacing.sm,
    },
    faqCategoryBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: `${GlowColors.primary}20`,
      marginBottom: Spacing.xs,
    },
    faqCategoryText: {
      ...Typography.caption,
      color: GlowColors.primary,
      fontWeight: "600",
    },
    faqAnswer: {
      ...Typography.small,
      color: TextColors.secondary,
      lineHeight: 20,
    },
    supportSection: {
      marginTop: Spacing.lg,
    },
    supportCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    supportIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${GlowColors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
      marginRight: Spacing.md,
    },
    supportTitle: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    supportDesc: {
      ...Typography.caption,
      color: TextColors.muted,
      marginTop: 2,
    },
    newsCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      padding: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    newsIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${GlowColors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
      marginRight: Spacing.md,
    },
    newsDate: {
      ...Typography.caption,
      color: TextColors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    newsTitle: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
      marginTop: 2,
    },
    newsDesc: {
      ...Typography.caption,
      color: TextColors.secondary,
      marginTop: 4,
      lineHeight: 16,
    },
  })
);
