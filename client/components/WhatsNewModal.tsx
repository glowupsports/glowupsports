import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  Backgrounds,
  Shadows,
} from "@/constants/theme";
import {
  useWhatsNew,
  useWhatsNewOnDemand,
  markVersionSeen,
  type WhatsNewSlide,
} from "@/hooks/useWhatsNew";
import { useAuth } from "@/coach/context/AuthContext";

const SCREEN_WIDTH = Dimensions.get("window").width;

type Props = {
  visible: boolean;
  slides: WhatsNewSlide[];
  version: string;
  isLoading?: boolean;
  showDisableToggle?: boolean;
  initialDisabled?: boolean;
  onClose: (didDisable: boolean) => void;
};

/**
 * Pure presentational modal — receives slides + visibility from a parent.
 * Used by both the boot-time auto carousel and the on-demand "View latest
 * updates" button in Settings.
 */
export function WhatsNewModalView({
  visible,
  slides,
  version,
  isLoading,
  showDisableToggle = true,
  initialDisabled = false,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(initialDisabled);
  const scrollRef = useRef<ScrollView | null>(null);

  // Reset state every time the modal opens with a new payload.
  useEffect(() => {
    if (visible) {
      setActiveIndex(0);
      setDontShowAgain(initialDisabled);
      // Reset scroll back to slide 0 on (re-)open.
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [visible, initialDisabled]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / SCREEN_WIDTH);
      if (idx !== activeIndex && idx >= 0 && idx < slides.length) {
        setActiveIndex(idx);
      }
    },
    [activeIndex, slides.length],
  );

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose(false);
  }, [onClose]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (activeIndex >= slides.length - 1) {
      onClose(dontShowAgain);
      return;
    }
    const nextIdx = activeIndex + 1;
    setActiveIndex(nextIdx);
    // Drive the ScrollView to the next page — `contentOffset` only sets the
    // INITIAL offset on RN ScrollView, so without scrollTo NEXT would update
    // dots/state but never visually advance the page on web/Android.
    scrollRef.current?.scrollTo({ x: nextIdx * SCREEN_WIDTH, animated: true });
  }, [activeIndex, slides.length, dontShowAgain, onClose]);

  const isLast = activeIndex >= slides.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
        <LinearGradient
          colors={[Colors.dark.accentTextSoft || GlowColors.shadow, "transparent"]}
          style={styles.gradient}
        />

        {/* Header: close-X on the left, version pill in the middle,
            Skip on the right. The X is an explicit dismiss for users who
            don't read button labels — same effect as Skip. */}
        <View style={styles.header}>
          <Pressable
            onPress={handleSkip}
            style={styles.closeButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("whatsNew.close")}
          >
            <Feather name="x" size={22} color={Colors.dark.textMuted} />
          </Pressable>
          <View style={styles.versionPill}>
            <Feather name="zap" size={12} color={GlowColors.primary} />
            <Text style={styles.versionPillText}>v{version}</Text>
          </View>
          <Pressable
            onPress={handleSkip}
            style={styles.skipButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("whatsNew.skip")}
          >
            <Text style={styles.skipButtonText}>{t("whatsNew.skip")}</Text>
          </Pressable>
        </View>

        {isLoading || slides.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
            <Text style={styles.loadingText}>{t("whatsNew.loading")}</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={styles.pager}
            contentContainerStyle={styles.pagerContent}
          >
            {slides.map((slide, idx) => (
              <SlidePane
                key={slide.id || idx}
                slide={slide}
                isLast={idx === slides.length - 1}
                showDisableToggle={showDisableToggle}
                dontShowAgain={dontShowAgain}
                onToggleDontShowAgain={setDontShowAgain}
              />
            ))}
          </ScrollView>
        )}

        {/* Dots */}
        {slides.length > 1 ? (
          <View style={styles.dotsRow}>
            {slides.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  idx === activeIndex ? styles.dotActive : null,
                  idx === activeIndex ? styles.dotCurrent : null,
                ]}
              />
            ))}
          </View>
        ) : null}

        {/* Bottom action: NEXT / LET'S GO */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : null,
            ]}
            disabled={isLoading || slides.length === 0}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t("whatsNew.letsGo") : t("whatsNew.next")}
          >
            <Text style={styles.primaryButtonText}>
              {isLast ? t("whatsNew.letsGo") : t("whatsNew.next")}
            </Text>
            <Ionicons
              name={isLast ? "checkmark" : "chevron-forward"}
              size={20}
              color={Colors.dark.buttonText}
            />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SlidePane({
  slide,
  isLast,
  showDisableToggle,
  dontShowAgain,
  onToggleDontShowAgain,
}: {
  slide: WhatsNewSlide;
  isLast: boolean;
  showDisableToggle: boolean;
  dontShowAgain: boolean;
  onToggleDontShowAgain: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={styles.iconCircle}>
        <Feather
          // Generator output is constrained to FEATHER_ICON_HINTS server-side,
          // but type the cast narrowly so TypeScript still catches the rest.
          name={(slide.icon || "star") as React.ComponentProps<typeof Feather>["name"]}
          size={56}
          color={GlowColors.primary}
        />
      </View>
      <Text style={styles.slideTitle}>{slide.title}</Text>
      <Text style={styles.slideBody}>{slide.body}</Text>

      {isLast && showDisableToggle ? (
        <Pressable
          style={styles.toggleRow}
          onPress={() => onToggleDontShowAgain(!dontShowAgain)}
          accessibilityRole="switch"
          accessibilityState={{ checked: dontShowAgain }}
          accessibilityLabel={t("whatsNew.dontShowAgain")}
        >
          <Text style={styles.toggleLabel}>{t("whatsNew.dontShowAgain")}</Text>
          <Switch
            value={dontShowAgain}
            onValueChange={onToggleDontShowAgain}
            trackColor={{ false: Backgrounds.surface, true: GlowColors.primary }}
            thumbColor={Colors.dark.text}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Boot-time gate: reads auth + AsyncStorage and shows the auto carousel
 * after the user logs in to a version they haven't seen yet. Mount once at
 * the app root inside the navigation tree.
 */
export function WhatsNewGate({ enabled = true }: { enabled?: boolean }) {
  // No need to read `user` here — the underlying useWhatsNew hook already
  // derives userId from the auth context for its storage keys.
  const { shouldShow, slides, version, dismiss, disableForever } = useWhatsNew();
  const [open, setOpen] = useState(false);

  // Open exactly once per change in `shouldShow` becoming true. Closing the
  // modal sets `lastSeen = currentVersion` via dismiss/disableForever, which
  // makes `shouldShow` go false, so this won't loop.
  useEffect(() => {
    if (shouldShow && !open) {
      setOpen(true);
    }
  }, [shouldShow, open]);

  const handleClose = useCallback(
    async (didDisable: boolean) => {
      setOpen(false);
      try {
        if (didDisable) {
          await disableForever();
        } else {
          await dismiss();
        }
      } catch {
        // best-effort
      }
    },
    [dismiss, disableForever],
  );

  if (!enabled) return null;
  if (!open) return null;

  return (
    <WhatsNewModalView
      visible={open}
      slides={slides}
      version={version}
      onClose={handleClose}
      showDisableToggle
      initialDisabled={false}
    />
  );
}

/**
 * "View latest updates" entry point used by Settings screens. Always fetches
 * the current version's slides on demand and shows the modal regardless of
 * the lastSeen / disabled state.
 */
export function WhatsNewLatestLauncher({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { fetch } = useWhatsNewOnDemand();
  const [slides, setSlides] = useState<WhatsNewSlide[]>([]);
  const [version, setVersion] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setIsLoading(true);
    fetch()
      .then((r) => {
        if (cancelled) return;
        setSlides(r.slides);
        setVersion(r.version);
      })
      .catch(() => {
        if (!cancelled) setSlides([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, fetch]);

  const handleClose = useCallback(
    async (_didDisable: boolean) => {
      // From Settings we don't want to flip the disable toggle silently — the
      // user uses the dedicated Settings switch for that.
      // We DO want to mark the version seen so the auto modal stops nagging,
      // but ONLY when we have a real version string. If the fetch failed we
      // keep `version` blank, and writing "" to AsyncStorage would poison the
      // lastSeen key and trigger a noisy re-show on the next launch.
      if (version && /^[\w.\-]{1,32}$/.test(version)) {
        try {
          await markVersionSeen(user?.id || null, version);
        } catch {
          // best-effort
        }
      }
      onClose();
    },
    [onClose, user?.id, version],
  );

  return (
    <WhatsNewModalView
      visible={visible}
      slides={slides}
      version={version || "—"}
      isLoading={isLoading}
      showDisableToggle={false}
      onClose={handleClose}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 400,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  versionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: GlowColors.shadow,
    borderWidth: 1,
    borderColor: GlowColors.shadowSubtle,
  },
  versionPillText: {
    ...Typography.small,
    color: GlowColors.primary,
    fontWeight: "700",
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  closeButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  skipButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  pager: {
    flex: 1,
  },
  pagerContent: {
    alignItems: "stretch",
  },
  slide: {
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
    ...Shadows.glow,
  },
  slideTitle: {
    ...Typography.h1,
    fontSize: 28,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  slideBody: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing["2xl"],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.elevated,
    width: "100%",
    gap: Spacing.md,
  },
  toggleLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    flex: 1,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginVertical: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Backgrounds.surface,
  },
  dotActive: {
    backgroundColor: GlowColors.primary,
  },
  dotCurrent: {
    width: 24,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignSelf: "stretch",
    ...Shadows.glow,
  },
  primaryButtonPressed: {
    backgroundColor: GlowColors.soft,
  },
  primaryButtonText: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
