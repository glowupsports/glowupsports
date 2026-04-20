import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated as RNAnimated, Dimensions, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { useGlassTint } from "@/hooks/useGlassTint";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type TickerItemType = "chat" | "goal" | "streak" | "news" | "achievement" | "notification";

export interface TickerItem {
  id: string;
  type: TickerItemType;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  text: string;
  timestamp?: string;
}

interface SocialTickerFooterProps {
  items?: TickerItem[];
  onItemPress?: (item: TickerItem) => void;
  onExpand?: () => void;
  isExpanded?: boolean;
}

function getIconForType(type: TickerItemType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "chat": return "chatbubble";
    case "goal": return "flag";
    case "streak": return "flame";
    case "news": return "megaphone";
    case "achievement": return "trophy";
    case "notification": return "notifications";
    default: return "ellipse";
  }
}

function getColorForType(type: TickerItemType): string {
  switch (type) {
    case "chat": return ProTennisColors.white;
    case "goal": return ProTennisColors.electricGreen;
    case "streak": return ProTennisColors.warning;
    case "news": return ProTennisColors.neonCyan;
    case "achievement": return ProTennisColors.electricGreen;
    case "notification": return ProTennisColors.neonCyan;
    default: return ProTennisColors.textMuted;
  }
}


function TickerContent({ items, scrollAnim }: { items: TickerItem[]; scrollAnim: RNAnimated.Value }) {
  const totalWidth = items.reduce((acc) => acc + 280, 0);
  
  const translateX = scrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -totalWidth],
  });

  return (
    <RNAnimated.View style={[styles.tickerTrack, { transform: [{ translateX }] }]}>
      {[...items, ...items].map((item, index) => (
        <View key={`${item.id}-${index}`} style={styles.tickerItem}>
          <Ionicons 
            name={item.icon || getIconForType(item.type)} 
            size={14} 
            color={item.color || getColorForType(item.type)} 
          />
          <Text style={styles.tickerText} numberOfLines={1}>{item.text}</Text>
        </View>
      ))}
    </RNAnimated.View>
  );
}

const EMPTY_STATE_ITEMS: TickerItem[] = [
  { id: "empty", type: "notification", icon: "flash", color: ProTennisColors.neonCyan, text: "Welcome! Your activity feed will appear here as you play" },
];

export function SocialTickerFooter({ 
  items = [], 
  onItemPress, 
  onExpand,
  isExpanded = false 
}: SocialTickerFooterProps) {
  const insets = useSafeAreaInsets();
  const scrollAnim = useRef(new RNAnimated.Value(0)).current;
  const [isPaused, setIsPaused] = useState(false);
  
  const displayItems = items.length > 0 ? items : EMPTY_STATE_ITEMS;
  
  useEffect(() => {
    if (isPaused || displayItems.length === 0) return;
    
    const animation = RNAnimated.loop(
      RNAnimated.timing(scrollAnim, {
        toValue: 1,
        duration: displayItems.length * 8000,
        useNativeDriver: true,
      })
    );
    
    animation.start();
    
    return () => animation.stop();
  }, [displayItems.length, isPaused]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPaused(!isPaused);
    onExpand?.();
  };

  return (
    <Animated.View 
      entering={SlideInDown.duration(400)}
      style={[styles.container, { paddingBottom: insets.bottom || Spacing.sm }]}
    >
      {Platform.OS === "ios" ? (
        <BlurView intensity={60} tint={glassTint} style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[ProTennisColors.midnightBlue + "F0", ProTennisColors.surfaceDark + "F8"]}
            style={StyleSheet.absoluteFill}
          />
        </BlurView>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.midnightBlue + "F5" }]} />
      )}
      
      <View style={styles.topBorder} />
      
      <Pressable style={styles.tickerContainer} onPress={handlePress}>
        <View style={styles.tickerMask}>
          <TickerContent items={displayItems} scrollAnim={scrollAnim} />
        </View>
        
        <View style={styles.expandButton}>
          <Ionicons 
            name={isPaused ? "play" : "pause"} 
            size={12} 
            color={ProTennisColors.textMuted} 
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  topBorder: {
    height: 1,
    backgroundColor: GlowColors.primary,
    opacity: 0.2,
  },
  tickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  tickerMask: {
    flex: 1,
    overflow: "hidden",
  },
  tickerTrack: {
    flexDirection: "row",
    alignItems: "center",
  },
  tickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    minWidth: 280,
  },
  tickerText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  expandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Backgrounds.elevated,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: Spacing.sm,
  },
}));
