import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { StyleSheet, View, Platform, Pressable, useWindowDimensions, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { useTabNavigation } from "./TabNavigationContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

// Task #1417 — Imperative handle exposed to TabNavigationContext so external
// callers (e.g. deep links via `navigateToTab`) can still drive the pager
// programmatically. The shape mirrors the subset of `PagerView` we used
// previously (`setPage`), so no callsite outside this file needs to change.
export interface SwipeablePagerHandle {
  setPage: (index: number) => void;
}

export interface TabConfig {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  component: React.ComponentType<any>;
  // When true, render a small unread indicator dot on the tab icon. Number values
  // are reserved for future count badges; today the renderer only shows a dot.
  badge?: boolean | number;
}

export interface CenterButtonConfig {
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  pagerIndex: number;
}

interface SwipeableTabItemProps {
  tab: TabConfig;
  index: number;
  currentIndex: number;
  scrollOffset: SharedValue<number>;
  onPress: () => void;
  activeColor: string;
  inactiveColor: string;
}

function SwipeableTabItem({ 
  tab, 
  index, 
  currentIndex, 
  scrollOffset,
  onPress,
  activeColor,
  inactiveColor,
}: SwipeableTabItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollOffset.value - index);
    const scale = interpolate(distance, [0, 1], [1, 0.95]);
    
    return {
      transform: [{ scale }],
    };
  });

  const focused = currentIndex === index;
  const iconName = focused ? tab.iconFocused : tab.icon;

  return (
    <Pressable 
      style={({ hovered }) => [
        styles.swipeTabItem,
        Platform.OS === "web" && { cursor: "pointer" as any },
        Platform.OS === "web" && hovered && !focused && styles.tabItemHovered,
      ]} 
      onPress={onPress}
      android_ripple={{ color: activeColor + "30", borderless: true }}
    >
      <Animated.View style={[styles.swipeTabIconContainer, animatedStyle]}>
        {focused ? <View style={[styles.tabIconGlow, { backgroundColor: activeColor }]} /> : null}
        <Ionicons 
          name={iconName}
          size={24} 
          color={focused ? activeColor : inactiveColor} 
        />
        {tab.badge ? (
          <View style={[styles.tabBadgeDot, { backgroundColor: activeColor }]} />
        ) : null}
      </Animated.View>
      <Animated.Text 
        style={[
          styles.swipeTabLabel, 
          { color: focused ? activeColor : inactiveColor }
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Pressable>
  );
}

interface CenterButtonProps {
  config: CenterButtonConfig;
  isActive: boolean;
  onPress: () => void;
}

function CenterButton({ config, isActive, onPress }: CenterButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.88, { damping: 15, stiffness: 350 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }, [scale]);

  const iconName = isActive ? config.iconFocused : config.icon;

  return (
    <Animated.View style={[styles.centerButtonAnimWrapper, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{ color: "rgba(0,0,0,0.2)", borderless: true, radius: 32 }}
        style={[
          styles.centerButton,
          { backgroundColor: config.color },
          isActive && styles.centerButtonActive,
          Platform.OS === "ios" && {
            shadowColor: config.color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isActive ? 0.7 : 0.45,
            shadowRadius: isActive ? 12 : 8,
          },
          Platform.OS === "android" && { elevation: 10 },
          Platform.OS === "web" && {
            boxShadow: isActive
              ? `0px 4px 20px rgba(200, 255, 61, 0.6), 0px 2px 8px rgba(0,0,0,0.4)`
              : `0px 4px 14px rgba(200, 255, 61, 0.35), 0px 2px 6px rgba(0,0,0,0.35)`,
          } as any,
        ]}
      >
        <Ionicons name={iconName} size={28} color="#000000" />
      </Pressable>
      <Text style={[styles.centerButtonLabel, { color: isActive ? config.color : Colors.dark.tabIconDefault }]}>
        {config.label}
      </Text>
    </Animated.View>
  );
}

interface TabIndicatorProps {
  scrollOffset: SharedValue<number>;
  tabCount: number;
  primaryColor: string;
  secondaryColor: string;
  containerWidth: number;
  centerButtonPagerIndex?: number;
}

function TabIndicator({ scrollOffset, tabCount, primaryColor, secondaryColor, containerWidth, centerButtonPagerIndex }: TabIndicatorProps) {
  const tabWidth = containerWidth / tabCount;
  
  const animatedStyle = useAnimatedStyle(() => {
    const isCenterActive = centerButtonPagerIndex !== undefined
      ? Math.abs(scrollOffset.value - centerButtonPagerIndex) < 0.5
      : false;
    const opacity = isCenterActive ? 0 : 1;
    return {
      opacity,
      transform: [{ translateX: withSpring(scrollOffset.value * tabWidth, { damping: 20, stiffness: 200 }) }],
    };
  });

  return (
    <Animated.View style={[styles.tabIndicator, { width: tabWidth }, animatedStyle]}>
      <LinearGradient
        colors={[primaryColor, secondaryColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.tabIndicatorGradient}
      />
    </Animated.View>
  );
}

interface SwipeableTabBarProps {
  tabs: TabConfig[];
  primaryColor?: string;
  secondaryColor?: string;
  inactiveColor?: string;
  children?: React.ReactNode;
  renderOverlay?: (currentTabKey: string) => React.ReactNode;
  onEdgeSwipeLeft?: () => void;
  initialPage?: number;
  onPageChange?: (index: number, key: string) => void;
  dividerAfterIndices?: number[];
  hideTabBar?: boolean;
  centerButtonConfig?: CenterButtonConfig;
}

export function SwipeableTabBar({ 
  tabs, 
  primaryColor = Colors.dark.primary,
  secondaryColor = Colors.dark.xpCyan,
  inactiveColor = Colors.dark.tabIconDefault,
  renderOverlay,
  onEdgeSwipeLeft,
  initialPage = 0,
  onPageChange,
  dividerAfterIndices = [],
  hideTabBar = false,
  centerButtonConfig,
}: SwipeableTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialPage);
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(() => new Set([initialPage]));
  // Task #1417 — Replaces the PagerView ref. Same imperative `setPage`
  // contract so TabNavigationContext can still drive the pager from
  // outside without code changes.
  const pagerRef = useRef<SwipeablePagerHandle | null>(null);
  const scrollOffset = useSharedValue(initialPage);
  // Snapshot of the page-fraction at gesture start. Lives on the UI
  // thread because the pan handlers run there.
  const startOffset = useSharedValue(initialPage);
  // Worklet-side flag that prevents the edge-swipe-left callback from
  // firing more than once per gesture.
  const edgeSwipeTriggeredSV = useSharedValue(false);
  const { registerPager, registerWebTabSetter, scrollEnabled, notifyActiveTab } = useTabNavigation();

  const isWeb = Platform.OS === "web";
  const containerWidth = isWeb ? Math.min(windowWidth, 480) : windowWidth;

  const webSetTab = useCallback((index: number) => {
    setCurrentIndex(index);
    scrollOffset.value = index;
    setVisitedTabs(prev => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    if (onPageChange && tabs[index]) {
      onPageChange(index, tabs[index].key);
    }
    notifyActiveTab(index, tabs[index]?.key ?? "");
  }, [scrollOffset, onPageChange, tabs, notifyActiveTab]);

  useEffect(() => {
    if (isWeb) {
      registerWebTabSetter(webSetTab);
    }
  }, [isWeb, registerWebTabSetter, webSetTab]);

  // Task #1417 — Programmatic page change. Replaces PagerView's native
  // `setPage`. Animates `scrollOffset` with the same spring used for
  // gesture snaps so the indicator and tab-item scaling animate too.
  const setPage = useCallback((index: number) => {
    if (index < 0 || index >= tabs.length) return;
    scrollOffset.value = withSpring(index, { damping: 22, stiffness: 200 });
    startOffset.value = index;
    setCurrentIndex(index);
    setVisitedTabs(prev => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    if (onPageChange && tabs[index]) {
      onPageChange(index, tabs[index].key);
    }
    notifyActiveTab(index, tabs[index]?.key ?? "");
  }, [scrollOffset, startOffset, tabs, onPageChange, notifyActiveTab]);

  // Expose the imperative handle to TabNavigationContext. We assign in
  // an effect so consumers always see the latest closure of `setPage`.
  useEffect(() => {
    pagerRef.current = { setPage };
  }, [setPage]);

  useEffect(() => {
    registerPager(pagerRef, tabs);
  }, [registerPager, tabs]);

  // Worklet-friendly callback fired when a swipe lands on a new page.
  // Mirrors the previous PagerView `onPageSelected` behaviour: tracks
  // visited tabs, fires the Light haptic, and invokes `onPageChange`.
  const handleSwipeSettled = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    setVisitedTabs(prev => {
      if (prev.has(newIndex)) return prev;
      const next = new Set(prev);
      next.add(newIndex);
      return next;
    });
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (onPageChange && tabs[newIndex]) {
      onPageChange(newIndex, tabs[newIndex].key);
    }
    notifyActiveTab(newIndex, tabs[newIndex]?.key ?? "");
  }, [onPageChange, tabs, notifyActiveTab]);

  const triggerEdgeSwipeLeft = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onEdgeSwipeLeft?.();
  }, [onEdgeSwipeLeft]);

  // Task #1417 — JS-controlled horizontal pager. Replaces PagerView on
  // native to remove the iOS Fabric cold-start commit-stall (PagerView
  // is a native-controlled component that defers its first paint until
  // an interaction even when its children are already mounted).
  const panGesture = useMemo(() => {
    const tabsLength = tabs.length;
    const hasEdgeSwipe = !!onEdgeSwipeLeft;
    return Gesture.Pan()
      .enabled(scrollEnabled && !isWeb)
      // Require some horizontal motion before activating so vertical
      // scrolls inside tab content still work.
      .activeOffsetX([-12, 12])
      .failOffsetY([-15, 15])
      .onStart(() => {
        "worklet";
        startOffset.value = scrollOffset.value;
        edgeSwipeTriggeredSV.value = false;
      })
      .onUpdate((e) => {
        "worklet";
        const offsetDelta = -e.translationX / containerWidth;
        let next = startOffset.value + offsetDelta;
        const minOffset = 0;
        const maxOffset = tabsLength - 1;
        // Rubber-band overscroll so the user gets tactile feedback at
        // the edges (matches PagerView's `overdrag` behaviour).
        if (next < minOffset) {
          next = minOffset + (next - minOffset) * 0.4;
        } else if (next > maxOffset) {
          next = maxOffset + (next - maxOffset) * 0.4;
        }
        scrollOffset.value = next;

        // Edge-swipe-left: user is on tab 0 and pulling rightward
        // (translation > 0), which moves `scrollOffset` below 0. Fire
        // the callback once per gesture, matching the old threshold.
        if (
          hasEdgeSwipe &&
          startOffset.value === 0 &&
          next < -0.1 &&
          !edgeSwipeTriggeredSV.value
        ) {
          edgeSwipeTriggeredSV.value = true;
          runOnJS(triggerEdgeSwipeLeft)();
        }
      })
      .onFinalize((e, success) => {
        "worklet";
        // Snap to the nearest page, optionally projecting velocity to
        // bias toward the next/previous page on a fast flick.
        const projected = scrollOffset.value + (-e.velocityX / containerWidth) * 0.15;
        let target = success ? Math.round(projected) : Math.round(scrollOffset.value);
        if (target < 0) target = 0;
        if (target > tabsLength - 1) target = tabsLength - 1;
        scrollOffset.value = withSpring(target, {
          damping: 22,
          stiffness: 200,
          mass: 0.6,
          overshootClamping: true,
        });
        if (target !== startOffset.value) {
          runOnJS(handleSwipeSettled)(target);
        }
        edgeSwipeTriggeredSV.value = false;
      });
  }, [
    scrollEnabled,
    isWeb,
    containerWidth,
    tabs.length,
    onEdgeSwipeLeft,
    scrollOffset,
    startOffset,
    edgeSwipeTriggeredSV,
    handleSwipeSettled,
    triggerEdgeSwipeLeft,
  ]);

  const navigateToPage = useCallback((index: number) => {
    if (isWeb) {
      webSetTab(index);
    } else {
      setPage(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isWeb, webSetTab, setPage]);

  const currentTabKey = tabs[currentIndex].key;

  // Render only the active tab. Keeps the heavy tab children unmounted
  // when off-screen — same contract as the previous PagerView impl.
  // Each cell still occupies `containerWidth` so the row-translate
  // animation has something to slide.
  const screens = useMemo(() => 
    tabs.map((tab, index) => {
      const TabComponent = tab.component;
      const shouldRender = index === currentIndex;
      return (
        <View key={tab.key} style={[styles.pageItem, { width: containerWidth }]}>
          {shouldRender ? <TabComponent /> : null}
        </View>
      );
    }), [tabs, currentIndex, containerWidth]
  );

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollOffset.value * containerWidth }],
  }));

  const pagerRowStyle = useMemo(() => ({
    flexDirection: "row" as const,
    width: containerWidth * tabs.length,
    height: "100%" as const,
  }), [containerWidth, tabs.length]);

  const centerPagerIndex = centerButtonConfig?.pagerIndex;

  const regularTabBarContent = (
    <>
      <TabIndicator 
        scrollOffset={scrollOffset} 
        tabCount={tabs.length}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        containerWidth={containerWidth}
      />
      
      <View style={styles.swipeTabRow}>
        {tabs.map((tab, index) => (
          <React.Fragment key={tab.key}>
            <SwipeableTabItem
              tab={tab}
              index={index}
              currentIndex={currentIndex}
              scrollOffset={scrollOffset}
              onPress={() => navigateToPage(index)}
              activeColor={primaryColor}
              inactiveColor={inactiveColor}
            />
            {dividerAfterIndices.includes(index) ? (
              <View style={styles.tabDivider} />
            ) : null}
          </React.Fragment>
        ))}
      </View>
    </>
  );

  const centerTabBarContent = centerButtonConfig ? (
    <>
      <TabIndicator 
        scrollOffset={scrollOffset} 
        tabCount={tabs.length}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        containerWidth={containerWidth}
        centerButtonPagerIndex={centerPagerIndex}
      />

      <View style={styles.swipeTabRow}>
        {tabs.map((tab, index) => {
          if (index === centerPagerIndex) {
            return <View key={tab.key} style={styles.swipeTabItem} />;
          }
          return (
            <SwipeableTabItem
              key={tab.key}
              tab={tab}
              index={index}
              currentIndex={currentIndex}
              scrollOffset={scrollOffset}
              onPress={() => navigateToPage(index)}
              activeColor={primaryColor}
              inactiveColor={inactiveColor}
            />
          );
        })}
      </View>
    </>
  ) : null;

  const bottomPadding = insets.bottom > 0 ? insets.bottom : 16;

  return (
    <View style={styles.container}>
      {isWeb ? (
        <View style={styles.pageContainer}>
          {screens[currentIndex]}
        </View>
      ) : (
        <View style={styles.pagerView}>
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[pagerRowStyle, animatedRowStyle]}>
              {screens}
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      {!hideTabBar && (
        <View style={[styles.swipeTabBar, { paddingBottom: bottomPadding }]}>
          <View style={styles.swipeTabBarBackground}>
            <LinearGradient
              colors={[primaryColor + "40", "transparent", secondaryColor + "40"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tabBarTopLine}
            />
            {Platform.OS === "ios" ? (
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.androidTabBackground]} />
            )}
          </View>
          
          {centerButtonConfig ? centerTabBarContent : regularTabBarContent}

          {centerButtonConfig ? (
            <View style={styles.centerButtonContainer} pointerEvents="box-none">
              <CenterButton
                config={centerButtonConfig}
                isActive={currentIndex === centerButtonConfig.pagerIndex}
                onPress={() => navigateToPage(centerButtonConfig.pagerIndex)}
              />
            </View>
          ) : null}
        </View>
      )}

      {renderOverlay ? renderOverlay(currentTabKey) : null}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  pagerView: {
    flex: 1,
    overflow: "hidden",
  },
  pageContainer: {
    flex: 1,
  },
  pageItem: {
    height: "100%",
  },
  swipeTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    overflow: "visible",
  },
  swipeTabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  swipeTabRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 8,
  },
  swipeTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  tabItemHovered: {
    opacity: 0.7,
  },
  swipeTabIconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  swipeTabLabel: {
    fontSize: Platform.OS === "web" ? 10 : 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  tabIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 3,
    zIndex: 20,
  },
  tabIndicatorGradient: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 2,
  },
  tabBarTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10,
  },
  androidTabBackground: {
    backgroundColor: "rgba(11, 13, 16, 0.98)",
  },
  tabIconGlow: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    opacity: 0.2,
  },
  tabBadgeDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.dark.backgroundRoot,
  },
  tabDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "center",
  },
  centerButtonContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  centerButtonAnimWrapper: {
    alignItems: "center",
    marginTop: -8,
    zIndex: 200,
    elevation: 200,
  },
  centerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.15)",
  },
  centerButtonActive: {
    borderColor: "rgba(255,255,255,0.3)",
  },
  centerButtonLabel: {
    fontSize: Platform.OS === "web" ? 10 : 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginTop: 4,
  },
}));
