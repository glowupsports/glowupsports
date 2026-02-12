import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Dimensions,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeIn,
  SlideInDown,
  SlideInUp,
  SlideInLeft,
  SlideInRight,
} from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  Typography,
  Backgrounds,
  GlowColors,
  TextColors,
} from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface CoachMarkStep {
  id: string;
  title: string;
  description: string;
  targetRef: React.RefObject<View>;
  position?: "top" | "bottom" | "left" | "right" | "auto";
  arrowDirection?: "up" | "down" | "left" | "right";
  highlightShape?: "circle" | "rect";
  highlightPadding?: number;
  onNext?: () => void;
}

interface TargetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CoachMarksContextValue {
  startTour: (tourId: string, steps: CoachMarkStep[]) => void;
  endTour: () => void;
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  next: () => void;
  previous: () => void;
  skip: () => void;
  registerTarget: (id: string, ref: React.RefObject<View>) => void;
  unregisterTarget: (id: string) => void;
}

const CoachMarksContext = createContext<CoachMarksContextValue>({
  startTour: () => {},
  endTour: () => {},
  isActive: false,
  currentStep: 0,
  totalSteps: 0,
  next: () => {},
  previous: () => {},
  skip: () => {},
  registerTarget: () => {},
  unregisterTarget: () => {},
});

export function useCoachMarks() {
  return useContext(CoachMarksContext);
}

function PulsingHighlight({ layout, shape }: { layout: TargetLayout; shape: "circle" | "rect" }) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    pulseScale.value = withRepeat(withTiming(1.15, { duration: 1200 }), -1, true);
    pulseOpacity.value = withRepeat(withTiming(0.15, { duration: 1200 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const size = shape === "circle"
    ? Math.max(layout.width, layout.height)
    : 0;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: shape === "circle"
            ? layout.x + layout.width / 2 - size / 2 - 6
            : layout.x - 6,
          top: shape === "circle"
            ? layout.y + layout.height / 2 - size / 2 - 6
            : layout.y - 6,
          width: shape === "circle" ? size + 12 : layout.width + 12,
          height: shape === "circle" ? size + 12 : layout.height + 12,
          borderRadius: shape === "circle" ? (size + 12) / 2 : BorderRadius.sm,
          borderWidth: 2,
          borderColor: GlowColors.primary,
        },
        animatedStyle,
      ]}
    />
  );
}

function TooltipArrow({
  direction,
  tooltipBg,
}: {
  direction: "up" | "down" | "left" | "right";
  tooltipBg: string;
}) {
  const rotations: Record<string, string> = {
    up: "45deg",
    down: "225deg",
    left: "315deg",
    right: "135deg",
  };

  const positionStyle: Record<string, object> = {
    up: { top: -6, alignSelf: "center" as const },
    down: { bottom: -6, alignSelf: "center" as const },
    left: { left: -6, top: "40%" as unknown as number },
    right: { right: -6, top: "40%" as unknown as number },
  };

  return (
    <View
      style={[
        styles.arrow,
        { backgroundColor: tooltipBg, transform: [{ rotate: rotations[direction] }] },
        positionStyle[direction],
      ]}
    />
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

function CoachMarksOverlayContent({
  steps,
  currentStepIndex,
  onNext,
  onPrevious,
  onSkip,
}: {
  steps: CoachMarkStep[];
  currentStepIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}) {
  const [targetLayout, setTargetLayout] = useState<TargetLayout | null>(null);
  const step = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  useEffect(() => {
    if (!step?.targetRef?.current) {
      setTargetLayout(null);
      return;
    }

    const measureTarget = () => {
      try {
        step.targetRef.current?.measure(
          (_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
            if (width > 0 && height > 0) {
              setTargetLayout({ x: pageX, y: pageY, width, height });
            }
          }
        );
      } catch {
        setTargetLayout(null);
      }
    };

    const timer = setTimeout(measureTarget, 100);
    return () => clearTimeout(timer);
  }, [step, currentStepIndex]);

  if (!step || !targetLayout) {
    return (
      <View style={styles.overlayFull}>
        <View style={styles.loadingContainer}>
          <Animated.View entering={FadeIn.duration(300)} style={styles.tooltipCard}>
            <Text style={styles.tooltipTitle}>{step?.title}</Text>
            <Text style={styles.tooltipDescription}>{step?.description}</Text>
            <View style={styles.tooltipFooter}>
              <Pressable onPress={onSkip}>
                <Text style={styles.skipText}>Skip tour</Text>
              </Pressable>
              <Pressable onPress={onNext} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>
                  {isLastStep ? "Got it!" : "Next"}
                </Text>
                {!isLastStep ? (
                  <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
                ) : null}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  const padding = step.highlightPadding ?? 8;
  const shape = step.highlightShape ?? "rect";

  const cutout = {
    x: targetLayout.x - padding,
    y: targetLayout.y - padding,
    width: targetLayout.width + padding * 2,
    height: targetLayout.height + padding * 2,
  };

  const resolvedPosition = resolveTooltipPosition(step.position ?? "auto", cutout);
  const resolvedArrow = step.arrowDirection ?? getArrowDirection(resolvedPosition);

  const tooltipStyle = getTooltipStyle(resolvedPosition, cutout);

  const enteringAnim =
    resolvedPosition === "bottom"
      ? SlideInDown.duration(300)
      : resolvedPosition === "top"
        ? SlideInUp.duration(300)
        : resolvedPosition === "left"
          ? SlideInLeft.duration(300)
          : SlideInRight.duration(300);

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      <View style={[styles.overlayStrip, { top: 0, left: 0, right: 0, height: cutout.y }]} />
      <View
        style={[
          styles.overlayStrip,
          {
            top: cutout.y + cutout.height,
            left: 0,
            right: 0,
            bottom: 0,
          },
        ]}
      />
      <View
        style={[
          styles.overlayStrip,
          {
            top: cutout.y,
            left: 0,
            width: cutout.x,
            height: cutout.height,
          },
        ]}
      />
      <View
        style={[
          styles.overlayStrip,
          {
            top: cutout.y,
            left: cutout.x + cutout.width,
            right: 0,
            height: cutout.height,
          },
        ]}
      />

      <PulsingHighlight layout={cutout} shape={shape} />

      <Animated.View
        entering={enteringAnim}
        key={`tooltip-${currentStepIndex}`}
        style={[styles.tooltipCard, tooltipStyle]}
      >
        <TooltipArrow direction={resolvedArrow} tooltipBg={Backgrounds.elevated} />

        <View style={styles.stepCounterRow}>
          <Text style={styles.stepCounter}>
            Step {currentStepIndex + 1} of {steps.length}
          </Text>
        </View>

        <Text style={styles.tooltipTitle}>{step.title}</Text>
        <Text style={styles.tooltipDescription}>{step.description}</Text>

        <ProgressDots current={currentStepIndex} total={steps.length} />

        <View style={styles.tooltipFooter}>
          <Pressable onPress={onSkip}>
            <Text style={styles.skipText}>Skip tour</Text>
          </Pressable>
          <View style={styles.navButtons}>
            {!isFirstStep ? (
              <Pressable onPress={onPrevious} style={styles.prevButton}>
                <Ionicons name="arrow-back" size={14} color={TextColors.secondary} />
                <Text style={styles.prevButtonText}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>
                {isLastStep ? "Got it!" : "Next"}
              </Text>
              {!isLastStep ? (
                <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
              ) : null}
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function resolveTooltipPosition(
  position: "top" | "bottom" | "left" | "right" | "auto",
  cutout: { x: number; y: number; width: number; height: number }
): "top" | "bottom" | "left" | "right" {
  if (position !== "auto") return position;

  const spaceAbove = cutout.y;
  const spaceBelow = SCREEN_HEIGHT - (cutout.y + cutout.height);
  const spaceLeft = cutout.x;
  const spaceRight = SCREEN_WIDTH - (cutout.x + cutout.width);

  const tooltipHeight = 200;
  const tooltipWidth = 280;

  if (spaceBelow >= tooltipHeight) return "bottom";
  if (spaceAbove >= tooltipHeight) return "top";
  if (spaceRight >= tooltipWidth) return "right";
  if (spaceLeft >= tooltipWidth) return "left";

  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

function getArrowDirection(position: "top" | "bottom" | "left" | "right"): "up" | "down" | "left" | "right" {
  switch (position) {
    case "bottom": return "up";
    case "top": return "down";
    case "left": return "right";
    case "right": return "left";
  }
}

function getTooltipStyle(
  position: "top" | "bottom" | "left" | "right",
  cutout: { x: number; y: number; width: number; height: number }
) {
  const tooltipWidth = SCREEN_WIDTH - Spacing.xl * 2;
  const margin = 12;

  switch (position) {
    case "bottom":
      return {
        position: "absolute" as const,
        top: cutout.y + cutout.height + margin,
        left: Spacing.xl,
        right: Spacing.xl,
      };
    case "top":
      return {
        position: "absolute" as const,
        bottom: SCREEN_HEIGHT - cutout.y + margin,
        left: Spacing.xl,
        right: Spacing.xl,
      };
    case "right":
      return {
        position: "absolute" as const,
        top: cutout.y,
        left: cutout.x + cutout.width + margin,
        width: Math.min(tooltipWidth, SCREEN_WIDTH - (cutout.x + cutout.width + margin + Spacing.lg)),
      };
    case "left":
      return {
        position: "absolute" as const,
        top: cutout.y,
        right: SCREEN_WIDTH - cutout.x + margin,
        width: Math.min(tooltipWidth, cutout.x - margin - Spacing.lg),
      };
  }
}

export function CoachMarksOverlay() {
  const { isActive } = useCoachMarks();
  if (!isActive) return null;
  return null;
}

interface CoachMarkTargetProps {
  id: string;
  children: React.ReactNode;
}

export function CoachMarkTarget({ id, children }: CoachMarkTargetProps) {
  const viewRef = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useCoachMarks();

  useEffect(() => {
    registerTarget(id, viewRef as React.RefObject<View>);
    return () => unregisterTarget(id);
  }, [id]);

  return (
    <View ref={viewRef} collapsable={false}>
      {children}
    </View>
  );
}

export function CoachMarksProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState<CoachMarkStep[]>([]);
  const [tourId, setTourId] = useState<string>("");
  const targetsRef = useRef<Map<string, React.RefObject<View>>>(new Map());

  const registerTarget = useCallback((id: string, ref: React.RefObject<View>) => {
    targetsRef.current.set(id, ref);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targetsRef.current.delete(id);
  }, []);

  const checkTourCompleted = useCallback(async (id: string): Promise<boolean> => {
    try {
      const val = await AsyncStorage.getItem(`@glow_coach_marks_completed_${id}`);
      return val === "true";
    } catch {
      return false;
    }
  }, []);

  const markTourCompleted = useCallback(async (id: string) => {
    try {
      await AsyncStorage.setItem(`@glow_coach_marks_completed_${id}`, "true");
    } catch {
      // silently fail
    }
  }, []);

  const startTour = useCallback(async (id: string, tourSteps: CoachMarkStep[]) => {
    const completed = await checkTourCompleted(id);
    if (completed) return;

    setTourId(id);
    setSteps(tourSteps);
    setCurrentStepIndex(0);
    setIsActive(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [checkTourCompleted]);

  const endTour = useCallback(() => {
    if (tourId) {
      markTourCompleted(tourId);
    }
    setIsActive(false);
    setSteps([]);
    setCurrentStepIndex(0);
    setTourId("");
  }, [tourId, markTourCompleted]);

  const next = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentStepData = steps[currentStepIndex];
    if (currentStepData?.onNext) {
      currentStepData.onNext();
    }
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      endTour();
    }
  }, [currentStepIndex, steps, endTour]);

  const previous = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const skip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    endTour();
  }, [endTour]);

  const contextValue: CoachMarksContextValue = {
    startTour,
    endTour,
    isActive,
    currentStep: currentStepIndex,
    totalSteps: steps.length,
    next,
    previous,
    skip,
    registerTarget,
    unregisterTarget,
  };

  return (
    <CoachMarksContext.Provider value={contextValue}>
      {children}
      <Modal
        visible={isActive}
        transparent
        animationType="fade"
        onRequestClose={skip}
        statusBarTranslucent
      >
        {isActive && steps.length > 0 ? (
          <CoachMarksOverlayContent
            steps={steps}
            currentStepIndex={currentStepIndex}
            onNext={next}
            onPrevious={previous}
            onSkip={skip}
          />
        ) : null}
      </Modal>
    </CoachMarksContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    position: "relative",
  },
  overlayFull: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    paddingHorizontal: Spacing.xl,
    width: "100%",
  },
  overlayStrip: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  tooltipCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: Spacing.lg,
  },
  arrow: {
    position: "absolute",
    width: 12,
    height: 12,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRightWidth: 0,
    borderBottomWidth: 0,
    zIndex: 1,
  },
  stepCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  stepCounter: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  tooltipTitle: {
    ...Typography.h3,
    color: TextColors.primary,
    marginBottom: Spacing.xs,
  },
  tooltipDescription: {
    ...Typography.small,
    color: TextColors.secondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: GlowColors.primary,
    width: 18,
    borderRadius: 3,
  },
  dotInactive: {
    backgroundColor: TextColors.disabled,
  },
  tooltipFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skipText: {
    ...Typography.small,
    color: TextColors.muted,
  },
  navButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  prevButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  prevButtonText: {
    ...Typography.small,
    color: TextColors.secondary,
    fontWeight: "600",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  nextButtonText: {
    ...Typography.small,
    fontWeight: "700",
    color: Backgrounds.root,
  },
});

export default CoachMarksProvider;
