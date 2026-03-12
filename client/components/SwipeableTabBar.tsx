import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { StyleSheet, View, Platform, Pressable, useWindowDimensions, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import PagerView from "react-native-pager-view";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { useTabNavigation } from "./TabNavigationContext";

export interface TabConfig {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  component: React.ComponentType<any>;
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

interface TabIndicatorProps {
  scrollOffset: SharedValue<number>;
  tabCount: number;
  primaryColor: string;
  secondaryColor: string;
  containerWidth: number;
}

function TabIndicator({ scrollOffset, tabCount, primaryColor, secondaryColor, containerWidth }: TabIndicatorProps) {
  const tabWidth = containerWidth / tabCount;
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
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
}: SwipeableTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialPage);
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(() => new Set([initialPage]));
  const pagerRef = useRef<PagerView>(null);
  const scrollOffset = useSharedValue(initialPage);
  const lastScrollOffset = useRef(initialPage);
  const edgeSwipeTriggered = useRef(false);
  const { registerPager, registerWebTabSetter, scrollEnabled, notifyActiveTab } = useTabNavigation();

  const isWeb = Platform.OS === "web";
  const containerWidth = isWeb ? Math.min(windowWidth, 480) : windowWidth;

  useEffect(() => {
    registerPager(pagerRef, tabs);
  }, [registerPager, tabs]);

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

  const handlePageSelected = useCallback((e: any) => {
    const newIndex = e.nativeEvent.position;
    setCurrentIndex(newIndex);
    scrollOffset.value = newIndex;
    edgeSwipeTriggered.current = false;
    setVisitedTabs(prev => {
      if (prev.has(newIndex)) return prev;
      const next = new Set(prev);
      next.add(newIndex);
      return next;
    });
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (onPageChange) {
      onPageChange(newIndex, tabs[newIndex].key);
    }
  }, [scrollOffset, onPageChange, tabs]);

  const handlePageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    const currentOffset = position + offset;
    scrollOffset.value = currentOffset;
    
    if (onEdgeSwipeLeft && position === 0 && offset < 0 && !edgeSwipeTriggered.current) {
      if (lastScrollOffset.current >= 0 && currentOffset < -0.1) {
        edgeSwipeTriggered.current = true;
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onEdgeSwipeLeft();
      }
    }
    
    lastScrollOffset.current = currentOffset;
  }, [scrollOffset, onEdgeSwipeLeft]);

  const navigateToPage = useCallback((index: number) => {
    if (isWeb) {
      webSetTab(index);
    } else {
      pagerRef.current?.setPage(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isWeb, webSetTab]);

  const currentTabKey = tabs[currentIndex].key;

  const screens = useMemo(() => 
    tabs.map((tab, index) => {
      const TabComponent = tab.component;
      const shouldRender = index === currentIndex;
      return (
        <View key={tab.key} style={styles.pageContainer}>
          {shouldRender ? <TabComponent /> : <View style={styles.pageContainer} />}
        </View>
      );
    }), [tabs, currentIndex]
  );

  const tabBarContent = (
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

  const bottomPadding = insets.bottom > 0 ? insets.bottom : 16;

  return (
    <View style={styles.container}>
      {isWeb ? (
        <View style={styles.pageContainer}>
          {screens[currentIndex]}
        </View>
      ) : (
        <PagerView
          ref={pagerRef}
          style={styles.pagerView}
          initialPage={initialPage}
          onPageSelected={handlePageSelected}
          onPageScroll={handlePageScroll}
          overdrag={true}
          overScrollMode="never"
          scrollEnabled={scrollEnabled}
        >
          {screens}
        </PagerView>
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
          
          {tabBarContent}
        </View>
      )}

      {!hideTabBar && renderOverlay ? renderOverlay(currentTabKey) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  pagerView: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
  },
  swipeTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
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
  tabDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "center",
  },
});
