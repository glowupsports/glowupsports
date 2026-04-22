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

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "start", label: "Get Started", icon: "rocket" },
  { key: "explore", label: "Explore", icon: "compass" },
  { key: "faq", label: "FAQ", icon: "help-circle" },
  { key: "whatsnew", label: "What's New", icon: "sparkles" },
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

const FAQS: { q: string; a: string; category: string }[] = [
  {
    q: "How do I book a session?",
    a: "Tap Book Lesson on your home screen, or open the Schedule tab and pick a date and time. Some courts may require approval from the academy.",
    category: "Booking",
  },
  {
    q: "How do I book a court?",
    a: "Open the Play tab and choose Book a Court, or tap Court Booking on the home screen. You can filter by location, surface, and time.",
    category: "Booking",
  },
  {
    q: "How do I cancel or reschedule a session?",
    a: "Open the session from the Schedule tab and tap Cancel or Reschedule. Cancellation deadlines depend on your academy's policy.",
    category: "Booking",
  },
  {
    q: "What is my Glow Score?",
    a: "Your Glow Score (0–100) is a snapshot of your overall tennis development. It blends skill levels, consistency, improvement, and attendance.",
    category: "Progress",
  },
  {
    q: "What is my Glow Rank?",
    a: "Glow Rank is your competitive ranking (1–9) based on match performance against other players at your level.",
    category: "Progress",
  },
  {
    q: "How do I earn XP?",
    a: "You earn XP from completed sessions, skill improvements, daily quests, achievements, and matches. XP fills your level bar and unlocks new features.",
    category: "Progress",
  },
  {
    q: "What does my Ball Level mean?",
    a: "Ball Level (Red, Orange, Green, Yellow) marks your stage of development. Coaches assess you and unlock the next level via Trial Gates.",
    category: "Progress",
  },
  {
    q: "What is the AI Coach?",
    a: "The AI Coach reviews your sessions and feedback, then gives you personalized drills, practice plans, and matchplay tips. Find it under the Growth tab.",
    category: "Progress",
  },
  {
    q: "What is Tennis DNA?",
    a: "Tennis DNA is your unique playing style profile — your strengths, tendencies, and how you compare to players around you.",
    category: "Progress",
  },
  {
    q: "How do credits work?",
    a: "Credits are prepaid lesson packages (private, semi-private, or group) used to book sessions. Manage them from your wallet on the home screen.",
    category: "Billing",
  },
  {
    q: "How do I top up credits?",
    a: "Open your wallet from the home screen or Profile tab and tap Top Up. You can pay with card, Apple Pay, or Google Pay.",
    category: "Billing",
  },
  {
    q: "How do refunds work?",
    a: "Refunds depend on your academy's cancellation policy. If you cancel within the allowed window, the credit is returned to your wallet automatically.",
    category: "Billing",
  },
  {
    q: "How do I find players to play with?",
    a: "Open the Play tab, choose Find Players, and filter by ball level or location. You can also browse open matches and challenge anyone nearby.",
    category: "Social",
  },
  {
    q: "What is Spotlight?",
    a: "Spotlight celebrates standout players each week. Nominate a friend or get nominated for great play, sportsmanship, or improvement.",
    category: "Social",
  },
  {
    q: "How do quests work?",
    a: "Quests are short daily and weekly goals. Complete them to earn XP and Glow Coins. Find them on the home screen or under the Growth tab.",
    category: "Progress",
  },
  {
    q: "Where do I update my profile?",
    a: "Open the Profile tab. Tap your avatar to edit your photo, bio, goals, and play style preferences.",
    category: "Account",
  },
  {
    q: "How do I turn on notifications?",
    a: "Go to Profile → Notifications. Choose which alerts you want — bookings, feedback, social, or reminders.",
    category: "Account",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your personal info is private by default. You can control what's visible to other players in Profile → Privacy Settings.",
    category: "Account",
  },
];

const FAQ_CATEGORIES = ["All", "Booking", "Progress", "Billing", "Social", "Account"] as const;
type FAQCategory = (typeof FAQ_CATEGORIES)[number];

const GLOSSARY: { term: string; definition: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { term: "Academy", definition: "The tennis club or school you're registered with.", icon: "business" },
  { term: "AI Coach", definition: "Personalized practice and matchplay tips based on your sessions.", icon: "sparkles" },
  { term: "Ball Level", definition: "Red, Orange, Green, or Yellow — marks your development stage.", icon: "tennisball" },
  { term: "Credits", definition: "Prepaid lesson packages used to book sessions.", icon: "wallet" },
  { term: "Glow Coins", definition: "In-app currency earned from quests; spend in the Glow Market.", icon: "logo-bitcoin" },
  { term: "Glow Score", definition: "Your overall tennis rating, 0–100, based on coach assessments.", icon: "star" },
  { term: "Glow Rank", definition: "Your competitive ranking, 1–9, based on match performance.", icon: "podium" },
  { term: "Pillar", definition: "One of six skill categories: Serve, Return, Forehand, Backhand, Net Play, Movement.", icon: "grid" },
  { term: "Quest", definition: "A short daily or weekly goal that rewards XP when completed.", icon: "flag" },
  { term: "Session", definition: "A training lesson booked with a coach.", icon: "calendar" },
  { term: "Spotlight", definition: "Weekly recognition for outstanding play, sportsmanship, or improvement.", icon: "star-half" },
  { term: "Tennis DNA", definition: "Your unique style profile — strengths, tendencies, and patterns.", icon: "fitness" },
  { term: "Trial Gate", definition: "A skill assessment to advance to the next ball level.", icon: "checkmark-done" },
  { term: "XP", definition: "Experience points earned from sessions and activities. Fills your level bar.", icon: "flash" },
];

interface ExploreEntry {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  cta: string;
  onPress: (nav: any) => void;
}

const EXPLORE_GROUPS: { title: string; entries: ExploreEntry[] }[] = [
  {
    title: "Train & Improve",
    entries: [
      {
        title: "Book a lesson",
        description: "Find a coach and reserve a slot in seconds.",
        icon: "calendar",
        cta: "Open Schedule",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Schedule" }),
      },
      {
        title: "Track your progress",
        description: "See your Glow Score, skills, and milestones.",
        icon: "trending-up",
        cta: "Open Growth",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Growth" }),
      },
      {
        title: "AI Coach",
        description: "Personalized drills, plans, and tips from your sessions.",
        icon: "sparkles",
        cta: "Talk to AI Coach",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Growth", params: { screen: "AICoach" } }),
      },
      {
        title: "Tennis DNA",
        description: "See your unique playing style and tendencies.",
        icon: "fitness",
        cta: "View Tennis DNA",
        onPress: (nav) => nav.navigate("PlayerDNAWizard"),
      },
      {
        title: "Daily quests",
        description: "Small goals that earn XP and Glow Coins every day.",
        icon: "flag",
        cta: "View Quests",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Growth", params: { screen: "QuestsMain" } }),
      },
    ],
  },
  {
    title: "Play & Compete",
    entries: [
      {
        title: "Find players nearby",
        description: "Filter by level and location to find a match.",
        icon: "people",
        cta: "Browse Players",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Play" }),
      },
      {
        title: "Book a court",
        description: "Reserve a court when you want to hit on your own.",
        icon: "tennisball",
        cta: "Book Court",
        onPress: (nav) => nav.navigate("CourtBooking"),
      },
      {
        title: "Tournaments & ladders",
        description: "Climb the ranks and compete at your level.",
        icon: "trophy",
        cta: "Open Play",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Play", params: { initialTab: "Tournaments" } }),
      },
      {
        title: "Group events",
        description: "Join open matches and group activities.",
        icon: "calendar-number",
        cta: "Browse Events",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Play" }),
      },
    ],
  },
  {
    title: "Connect",
    entries: [
      {
        title: "Community feed",
        description: "Posts, highlights, and tips from the community.",
        icon: "chatbubbles",
        cta: "Open Community",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Community" }),
      },
      {
        title: "Friends & groups",
        description: "Add friends, join groups, plan sessions together.",
        icon: "person-add",
        cta: "Find Friends",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Community" }),
      },
      {
        title: "Spotlight",
        description: "Celebrate standout players and nominate a friend.",
        icon: "star",
        cta: "View Spotlight",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Community" }),
      },
      {
        title: "Messages",
        description: "Direct chat with coaches and friends.",
        icon: "mail",
        cta: "Open Messages",
        onPress: (nav) => nav.navigate("PlayerMessages"),
      },
    ],
  },
  {
    title: "Account & Wallet",
    entries: [
      {
        title: "Wallet & credits",
        description: "Top up credits and review past purchases.",
        icon: "wallet",
        cta: "Open Profile",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Profile" }),
      },
      {
        title: "Glow Market",
        description: "Spend Glow Coins on perks, gear, and rewards.",
        icon: "cart",
        cta: "Open Shop",
        onPress: (nav) => nav.navigate("Shop"),
      },
      {
        title: "Notifications",
        description: "Choose which alerts you want to receive.",
        icon: "notifications",
        cta: "Manage",
        onPress: (nav) => nav.navigate("PlayerTabs", { screen: "Profile" }),
      },
      {
        title: "Settings & privacy",
        description: "Family controls, appearance, privacy.",
        icon: "settings",
        cta: "Settings",
        onPress: (nav) => nav.navigate("Settings"),
      },
    ],
  },
];

const WHATS_NEW: { date: string; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    date: "April 2026",
    title: "Unified Player Guide",
    description: "Everything you need to learn the app — Get Started, Explore, FAQ, and What's New — now lives in one place.",
    icon: "sparkles",
  },
  {
    date: "April 2026",
    title: "Searchable FAQ",
    description: "Search the FAQ by keyword and filter by category to find answers faster.",
    icon: "search",
  },
  {
    date: "April 2026",
    title: "Smarter empty screens",
    description: "Empty lists now show a one-line explanation and a one-tap action so you always know what to do next.",
    icon: "bulb",
  },
  {
    date: "April 2026",
    title: "Help button in every header",
    description: "Look for the question-mark button at the top-right of any player screen to jump straight back here.",
    icon: "help-circle",
  },
];

export default function PlayerGuideScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user, isGuest } = useAuth();
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
        title: "Complete your profile",
        description: "Add a photo and a short bio so coaches and players know who you are.",
        actionLabel: "Open profile",
        done: hasProfile,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Profile" }),
      },
      isFree
        ? {
            id: "court",
            icon: "tennisball",
            title: "Book a court",
            description: "Reserve a court near you for a hit or a casual match.",
            actionLabel: "Browse courts",
            done: hasNextSession,
            onPress: () => navigation.navigate("CourtBooking"),
          }
        : {
            id: "session",
            icon: "calendar",
            title: "Book your first session",
            description: "Lock in a lesson with your coach.",
            actionLabel: "Open schedule",
            done: hasNextSession,
            onPress: () => navigation.navigate("PlayerTabs", { screen: "Schedule" }),
          },
      {
        id: "academy",
        icon: "business",
        title: hasAcademy ? "Your academy" : "Find an academy",
        description: hasAcademy
          ? "You're set up with an academy — explore their sessions and coaches."
          : "Optional — join an academy for structured coaching and training.",
        actionLabel: hasAcademy ? "Open schedule" : "Browse academies",
        done: hasAcademy,
        onPress: () =>
          hasAcademy
            ? navigation.navigate("PlayerTabs", { screen: "Schedule" })
            : navigation.navigate("AcademyBrowser"),
      },
      {
        id: "progress",
        icon: "trending-up",
        title: "Check your progress",
        description: "See your Glow Score and skill breakdown.",
        actionLabel: "View progress",
        done: hasProgressActivity,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Growth" }),
      },
      {
        id: "community",
        icon: "people",
        title: "Add a friend",
        description: "Connect with friends to plan sessions and share progress.",
        actionLabel: "Open community",
        done: hasFriends,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Community" }),
      },
      {
        id: "notifications",
        icon: "notifications",
        title: "Turn on notifications",
        description: "Get reminders for sessions, feedback, and friends.",
        actionLabel: "Manage notifications",
        done: hasNotifications,
        onPress: () => navigation.navigate("PlayerTabs", { screen: "Profile" }),
      },
    ];
    return steps;
  }, [dashboard, profile, friends, notificationPrefs, navigation]);

  const completedCount = checklistSteps.filter((s) => s.done).length;
  const progressPercent = Math.round((completedCount / checklistSteps.length) * 100);

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    return FAQS.filter((item) => {
      const matchesCategory = faqCategory === "All" || item.category === faqCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [faqQuery, faqCategory]);

  const handleEmail = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL("mailto:support@glowupsports.com?subject=Player%20Support%20Request");
    } catch {
      /* ignore */
    }
  }, []);

  const handleReportBug = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ReportIssue");
  }, [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Player Guide</Text>
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
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
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
                <Text style={styles.progressTitle}>Your setup</Text>
                <Text style={styles.progressCount}>
                  {completedCount} of {checklistSteps.length}
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressHint}>
                {progressPercent === 100
                  ? "All set — you're ready to play."
                  : "Knock out a few quick steps to get the most out of the app."}
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
            <Text style={styles.intro}>
              A quick tour of the main areas of the app. Tap any card to jump straight to that
              screen.
            </Text>
            {EXPLORE_GROUPS.map((group) => (
              <View key={group.title} style={styles.groupSection}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.entries.map((entry) => (
                  <Pressable
                    key={entry.title}
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
                      <Text style={styles.exploreTitle}>{entry.title}</Text>
                      <Text style={styles.exploreDesc}>{entry.description}</Text>
                      <Text style={styles.exploreCta}>{entry.cta}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.groupSection}>
              <Text style={styles.groupTitle}>Glossary</Text>
              {GLOSSARY.map((g) => (
                <View key={g.term} style={styles.glossaryRow}>
                  <View style={styles.glossaryIcon}>
                    <Ionicons name={g.icon} size={16} color={GlowColors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.glossaryTerm}>{g.term}</Text>
                    <Text style={styles.glossaryDef}>{g.definition}</Text>
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
                placeholder="Search questions and answers"
                placeholderTextColor={TextColors.muted}
                value={faqQuery}
                onChangeText={setFaqQuery}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search FAQ"
              />
              {faqQuery.length > 0 ? (
                <Pressable
                  onPress={() => setFaqQuery("")}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
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
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredFaqs.length === 0 ? (
              <View style={styles.faqEmpty}>
                <Ionicons name="search" size={28} color={TextColors.muted} />
                <Text style={styles.faqEmptyTitle}>No matching answers</Text>
                <Text style={styles.faqEmptyDesc}>
                  Try a different search term or email support below.
                </Text>
              </View>
            ) : (
              filteredFaqs.map((item, idx) => (
                <FAQRow key={item.q} item={item} index={idx} />
              ))
            )}

            <View style={styles.supportSection}>
              <Text style={styles.groupTitle}>Need more help?</Text>
              <Pressable style={styles.supportCard} onPress={handleEmail}>
                <View style={styles.supportIcon}>
                  <Ionicons name="mail" size={20} color={GlowColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportTitle}>Email support</Text>
                  <Text style={styles.supportDesc}>support@glowupsports.com</Text>
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
                  <Text style={styles.supportTitle}>Report a bug</Text>
                  <Text style={styles.supportDesc}>Tell us what isn't working.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {activeTab === "whatsnew" ? (
          <View>
            <Text style={styles.intro}>The latest updates and improvements to the app.</Text>
            {WHATS_NEW.map((item) => (
              <View key={item.title} style={styles.newsCard}>
                <View style={styles.newsIcon}>
                  <Ionicons name={item.icon} size={20} color={GlowColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.newsDate}>{item.date}</Text>
                  <Text style={styles.newsTitle}>{item.title}</Text>
                  <Text style={styles.newsDesc}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function FAQRow({ item, index }: { item: { q: string; a: string; category: string }; index: number }) {
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
      accessibilityLabel={`FAQ ${index + 1}: ${item.q}`}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{item.q}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={TextColors.muted} />
      </View>
      {open ? (
        <View style={styles.faqAnswerWrap}>
          <View style={styles.faqCategoryBadge}>
            <Text style={styles.faqCategoryText}>{item.category}</Text>
          </View>
          <Text style={styles.faqAnswer}>{item.a}</Text>
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
