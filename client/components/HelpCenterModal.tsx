import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  Dimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
Backgrounds, } from "@/constants/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

interface GlossaryTerm {
  term: string;
  definition: string;
  icon?: string;
}

export interface VideoTutorial {
  title: string;
  description: string;
  url: string;
  duration?: string;
}

interface HelpCenterModalProps {
  visible: boolean;
  onClose: () => void;
  role: string;
  faqs: FAQItem[];
  glossary: GlossaryTerm[];
  tutorials: VideoTutorial[];
  supportEmail?: string;
  whatsAppNumber?: string;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

type TabKey = "faq" | "glossary" | "tutorials" | "support";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "faq", label: "FAQ", icon: "help-circle" },
  { key: "glossary", label: "Glossary", icon: "book" },
  { key: "tutorials", label: "Tutorials", icon: "play-circle" },
  { key: "support", label: "Support", icon: "chatbubble-ellipses" },
];

export const PLATFORM_GLOSSARY: GlossaryTerm[] = [
  {
    term: "Academy",
    definition: "The tennis club/school you're registered with.",
    icon: "business",
  },
  {
    term: "Ball Level",
    definition: "The type of tennis ball you play with (Red, Orange, Green, Yellow) indicating your skill stage.",
    icon: "tennisball",
  },
  {
    term: "Credits",
    definition: "Prepaid lesson packages (private, semi-private, group) used to book sessions.",
    icon: "wallet",
  },
  {
    term: "DSS Rating",
    definition: "Adult competitive rating (0-3000 MMR) based on match performance.",
    icon: "bar-chart",
  },
  {
    term: "Glow Rank",
    definition: "Your competitive ranking (1-9) based on your Glow MMR.",
    icon: "podium",
  },
  {
    term: "Glow Score",
    definition: "Your overall tennis skill rating based on coach assessments across 6 pillars.",
    icon: "star",
  },
  {
    term: "Pillar",
    definition: "One of 6 skill categories (Serve, Return, Forehand, Backhand, Net Play, Movement).",
    icon: "grid",
  },
  {
    term: "Session",
    definition: "A training lesson or practice booked with a coach.",
    icon: "calendar",
  },
  {
    term: "Trial Gate",
    definition: "A skill assessment milestone to advance to the next ball level.",
    icon: "flag",
  },
  {
    term: "XP (Experience Points)",
    definition: "Points earned from sessions, achievements, and activities that increase your player level.",
    icon: "flash",
  },
];

function FAQSection({ faqs }: { faqs: FAQItem[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleItem = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedIndex(expandedIndex === index ? null : index);
    },
    [expandedIndex]
  );

  if (faqs.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="help-circle-outline" size={48} color={TextColors.disabled} />
        <Text style={styles.emptyStateText}>No FAQs available</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.sectionScroll}
      contentContainerStyle={styles.sectionContent}
      showsVerticalScrollIndicator={false}
    >
      {faqs.map((item, index) => {
        const isExpanded = expandedIndex === index;
        return (
          <View key={index} style={styles.faqItem}>
            <Pressable
              style={styles.faqHeader}
              onPress={() => toggleItem(index)}
            >
              <View style={styles.faqQuestionRow}>
                <Ionicons
                  name="help-circle"
                  size={20}
                  color={GlowColors.primary}
                  style={styles.faqIcon}
                />
                <Text style={styles.faqQuestion}>{item.question}</Text>
              </View>
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={TextColors.muted}
              />
            </Pressable>
            {isExpanded ? (
              <View style={styles.faqAnswer}>
                {item.category ? (
                  <View style={styles.faqCategoryBadge}>
                    <Text style={styles.faqCategoryText}>{item.category}</Text>
                  </View>
                ) : null}
                <Text style={styles.faqAnswerText}>{item.answer}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function GlossarySection({ glossary }: { glossary: GlossaryTerm[] }) {
  const sorted = [...glossary].sort((a, b) =>
    a.term.localeCompare(b.term)
  );

  return (
    <ScrollView
      style={styles.sectionScroll}
      contentContainerStyle={styles.sectionContent}
      showsVerticalScrollIndicator={false}
    >
      {sorted.map((item, index) => (
        <View key={index} style={styles.glossaryItem}>
          <View style={styles.glossaryIconContainer}>
            <Ionicons
              name={(item.icon as keyof typeof Ionicons.glyphMap) || "information-circle"}
              size={20}
              color={GlowColors.primary}
            />
          </View>
          <View style={styles.glossaryTextContainer}>
            <Text style={styles.glossaryTerm}>{item.term}</Text>
            <Text style={styles.glossaryDefinition}>{item.definition}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function TutorialsSection({ tutorials }: { tutorials: VideoTutorial[] }) {
  const handleOpenTutorial = useCallback(async (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.warn("Failed to open tutorial URL:", error);
    }
  }, []);

  if (tutorials.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="videocam-outline" size={48} color={TextColors.disabled} />
        <Text style={styles.emptyStateText}>No tutorials available yet</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.sectionScroll}
      contentContainerStyle={styles.sectionContent}
      showsVerticalScrollIndicator={false}
    >
      {tutorials.map((tutorial, index) => (
        <Pressable
          key={index}
          style={styles.tutorialItem}
          onPress={() => handleOpenTutorial(tutorial.url)}
        >
          <View style={styles.tutorialPlayIcon}>
            <Ionicons name="play" size={22} color={Colors.dark.buttonText} />
          </View>
          <View style={styles.tutorialTextContainer}>
            <Text style={styles.tutorialTitle}>{tutorial.title}</Text>
            <Text style={styles.tutorialDescription}>{tutorial.description}</Text>
            {tutorial.duration ? (
              <View style={styles.tutorialDurationRow}>
                <Ionicons name="time-outline" size={12} color={TextColors.muted} />
                <Text style={styles.tutorialDuration}>{tutorial.duration}</Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="open-outline" size={18} color={TextColors.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function SupportSection({
  supportEmail,
  whatsAppNumber,
}: {
  supportEmail?: string;
  whatsAppNumber?: string;
}) {
  const handleEmail = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const email = supportEmail || "support@glowupsports.com";
    const url = `mailto:${email}?subject=${encodeURIComponent("Support Request")}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("Failed to open email:", error);
    }
  }, [supportEmail]);

  const handleWhatsApp = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const number = whatsAppNumber || "";
    const url = `https://wa.me/${number.replace(/[^0-9]/g, "")}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("Failed to open WhatsApp:", error);
    }
  }, [whatsAppNumber]);

  return (
    <ScrollView
      style={styles.sectionScroll}
      contentContainerStyle={styles.sectionContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.supportHeading}>Get in Touch</Text>
      <Text style={styles.supportSubtext}>
        We're here to help. Reach out through any of the channels below.
      </Text>

      <Pressable style={styles.supportCard} onPress={handleEmail}>
        <View style={styles.supportIconContainer}>
          <Ionicons name="mail" size={24} color={GlowColors.primary} />
        </View>
        <View style={styles.supportTextContainer}>
          <Text style={styles.supportCardTitle}>Email Support</Text>
          <Text style={styles.supportCardDesc}>
            {supportEmail || "support@glowupsports.com"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={TextColors.muted} />
      </Pressable>

      {whatsAppNumber ? (
        <Pressable style={styles.supportCard} onPress={handleWhatsApp}>
          <View style={[styles.supportIconContainer, { backgroundColor: "rgba(37, 211, 102, 0.15)" }]}>
            <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
          </View>
          <View style={styles.supportTextContainer}>
            <Text style={styles.supportCardTitle}>WhatsApp</Text>
            <Text style={styles.supportCardDesc}>{whatsAppNumber}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TextColors.muted} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function HelpCenterModal({
  visible,
  onClose,
  role,
  faqs,
  glossary,
  tutorials,
  supportEmail,
  whatsAppNumber,
}: HelpCenterModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("faq");

  const handleTabChange = useCallback((tab: TabKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  const allGlossary = [
    ...PLATFORM_GLOSSARY,
    ...glossary.filter(
      (g) => !PLATFORM_GLOSSARY.some((pg) => pg.term === g.term)
    ),
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "faq":
        return <FAQSection faqs={faqs} />;
      case "glossary":
        return <GlossarySection glossary={allGlossary} />;
      case "tutorials":
        return <TutorialsSection tutorials={tutorials} />;
      case "support":
        return (
          <SupportSection
            supportEmail={supportEmail}
            whatsAppNumber={whatsAppNumber}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Help Center</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={TextColors.secondary} />
            </Pressable>
          </View>

          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => handleTabChange(tab.key)}
                >
                  <Ionicons
                    name={tab.icon}
                    size={18}
                    color={isActive ? GlowColors.primary : TextColors.muted}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.contentContainer}>{renderContent()}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    height: SCREEN_HEIGHT * 0.8,
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: TextColors.disabled,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  sheetTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
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
  },
  tabLabelActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  contentContainer: {
    flex: 1,
  },
  sectionScroll: {
    flex: 1,
  },
  sectionContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
  },
  emptyStateText: {
    ...Typography.body,
    color: TextColors.muted,
    marginTop: Spacing.md,
  },
  faqItem: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  faqQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: Spacing.sm,
  },
  faqIcon: {
    marginRight: Spacing.md,
  },
  faqQuestion: {
    ...Typography.small,
    fontWeight: "600",
    color: TextColors.primary,
    flex: 1,
  },
  faqAnswer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: 0,
  },
  faqCategoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: `${GlowColors.primary}15`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.sm,
  },
  faqCategoryText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontSize: 10,
  },
  faqAnswerText: {
    ...Typography.small,
    color: TextColors.secondary,
    lineHeight: 20,
  },
  glossaryItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  glossaryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${GlowColors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  glossaryTextContainer: {
    flex: 1,
  },
  glossaryTerm: {
    ...Typography.small,
    fontWeight: "700",
    color: TextColors.primary,
    marginBottom: 4,
  },
  glossaryDefinition: {
    ...Typography.small,
    color: TextColors.secondary,
    lineHeight: 20,
  },
  tutorialItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  tutorialPlayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  tutorialTextContainer: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  tutorialTitle: {
    ...Typography.small,
    fontWeight: "600",
    color: TextColors.primary,
  },
  tutorialDescription: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  tutorialDurationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  tutorialDuration: {
    ...Typography.caption,
    color: TextColors.muted,
    fontSize: 10,
  },
  supportHeading: {
    ...Typography.h3,
    color: TextColors.primary,
    marginBottom: Spacing.xs,
  },
  supportSubtext: {
    ...Typography.small,
    color: TextColors.muted,
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  supportCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  supportIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${GlowColors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  supportTextContainer: {
    flex: 1,
  },
  supportCardTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: TextColors.primary,
  },
  supportCardDesc: {
    ...Typography.small,
    color: TextColors.muted,
    marginTop: 2,
  },
});

export default HelpCenterModal;
