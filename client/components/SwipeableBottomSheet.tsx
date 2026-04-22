import React, { createContext, useContext, useEffect, useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  Platform,
  Dimensions,
  StyleProp,
  ViewStyle,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Backgrounds, BorderRadius, Spacing } from "@/constants/theme";

interface SheetScrollCtxValue {
  isAtTop: SharedValue<number>;
}

const SheetScrollCtx = createContext<SheetScrollCtxValue | null>(null);

/**
 * Spread the returned props onto any ScrollView / FlatList / SectionList
 * inside a SwipeableBottomSheet to opt that scroll view into "drag-to-dismiss
 * only when scrolled to top" coordination. If you don't use it, the body
 * drag-down dismiss still works (assumed always at top).
 */
export function useSwipeableSheetScrollProps() {
  const ctx = useContext(SheetScrollCtx);
  return useMemo(
    () => ({
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!ctx) return;
        ctx.isAtTop.value = e.nativeEvent.contentOffset.y <= 0 ? 1 : 0;
      },
      scrollEventThrottle: 16,
    }),
    [ctx],
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SheetScrollProps {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

interface SwipeableBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Sheet content. May be a ReactNode, or a render function receiving
   * `scrollProps` you can spread on the inner ScrollView/FlatList/SectionList
   * to enable "drag-to-dismiss only when scrolled to top" coordination.
   * Equivalent to calling `useSwipeableSheetScrollProps()` from inside the sheet.
   */
  children: React.ReactNode | ((scrollProps: SheetScrollProps) => React.ReactNode);
  /** Padding added to the bottom of the sheet (e.g. safe-area inset). */
  bottomInset?: number;
  /** Max height of the sheet, expressed as a fraction (0–1). Default 0.92. */
  maxHeightFraction?: number;
  /** Style overrides applied to the sheet container. */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Style overrides applied to the dimmed backdrop. */
  overlayStyle?: StyleProp<ViewStyle>;
  /** Hide the drag handle pill. Default false. */
  hideHandle?: boolean;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

export default function SwipeableBottomSheet({
  visible,
  onClose,
  children,
  bottomInset = 0,
  maxHeightFraction = 0.92,
  sheetStyle,
  overlayStyle,
  hideHandle = false,
}: SwipeableBottomSheetProps) {
  const translateY = useSharedValue(0);
  const isAtTop = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isAtTop.value = 1;
    }
  }, [visible, translateY, isAtTop]);

  const scrollCtx = useMemo(() => ({ isAtTop }), [isAtTop]);

  // Render-prop convenience: lets callers pass `(scrollProps) => <ScrollView {...scrollProps} />`
  // without having to wrap their content in an extra component just to call the hook.
  const renderPropScrollHandlers = useMemo<SheetScrollProps>(
    () => ({
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        isAtTop.value = e.nativeEvent.contentOffset.y <= 0 ? 1 : 0;
      },
      scrollEventThrottle: 16,
    }),
    [isAtTop],
  );

  const handleClose = () => {
    onClose();
  };

  // Pan attached to the drag handle — always engages, no scroll coordination needed.
  const handlePan = Gesture.Pan()
    .onUpdate((e) => {
      "worklet";
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      } else {
        translateY.value = e.translationY * 0.2;
      }
    })
    .onEnd((e) => {
      "worklet";
      const shouldDismiss =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 220 },
          (finished) => {
            if (finished) runOnJS(handleClose)();
          },
        );
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  // Pan attached to the whole sheet body. Only activates after a clear
  // downward drag (>= 15px) and never claims upward gestures, so any inner
  // ScrollView keeps working normally and only "pull-down past top" or
  // drags from non-scroll content trigger dismissal.
  const sheetPan = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetY(-15)
    .onUpdate((e) => {
      "worklet";
      // Only follow drag when inner scroll (if any) is at the top.
      // If a nested scroll view registered via useSwipeableSheetScrollProps
      // and is scrolled past 0, leave the sheet alone so the scroll keeps
      // working and downward swipe doesn't dismiss mid-list.
      if (isAtTop.value !== 1) return;
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (isAtTop.value !== 1) {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
        return;
      }
      const shouldDismiss =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 220 },
          (finished) => {
            if (finished) runOnJS(handleClose)();
          },
        );
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const isWeb = Platform.OS === "web";

  const sheetMaxHeight = SCREEN_HEIGHT * maxHeightFraction;

  const resolvedChildren =
    typeof children === "function" ? children(renderPropScrollHandlers) : children;

  const renderHandle = () =>
    hideHandle ? null : (
      <View style={styles.handleArea}>
        <View style={styles.handle} />
      </View>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SheetScrollCtx.Provider value={scrollCtx}>
      <View style={styles.root}>
        <Pressable
          style={[styles.overlay, overlayStyle]}
          onPress={onClose}
        />
        {isWeb ? (
          <Pressable
            onPress={() => {}}
            style={[
              styles.sheet,
              { maxHeight: sheetMaxHeight, paddingBottom: bottomInset },
              sheetStyle,
            ]}
          >
            {renderHandle()}
            {resolvedChildren}
          </Pressable>
        ) : (
          <GestureDetector gesture={sheetPan}>
            <AnimatedPressable
              onPress={() => {}}
              style={[
                styles.sheet,
                { maxHeight: sheetMaxHeight, paddingBottom: bottomInset },
                sheetStyle,
                animatedSheetStyle,
              ]}
            >
              <GestureDetector gesture={handlePan}>{renderHandle()}</GestureDetector>
              {resolvedChildren}
            </AnimatedPressable>
          </GestureDetector>
        )}
      </View>
      </SheetScrollCtx.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.xs,
  },
  handleArea: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Backgrounds.surface,
  },
});
