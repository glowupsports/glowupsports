import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated as RNAnimated, Dimensions, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type TickerItemType = "chat" | "goal" | "streak" | "news" | "achievement" | "notification";

interface TickerItem {
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

const SAMPLE_ITEMS: TickerItem[] = [
  { id: "1", type: "goal", icon: "flag", color: ProTennisColors.electricGreen, text: "DAILY GOAL: Hit 50 Forehands (32/50)" },
  { id: "2", type: "streak", icon: "flame", color: ProTennisColors.warning, text: "STREAK: 5 Days Active" },
  { id: "3", type: "achievement", icon: "trophy", color: ProTennisColors.electricGreen, text: "Max just reached Level 8!" },
  { id: "4", type: "news", icon: "megaphone", color: ProTennisColors.neonCyan, text: "ACADEMY: Tournament starting Sunday!" },
  { id: "5", type: "chat", icon: "chatbubble", color: ProTennisColors.white, text: "Coach: Great work on your backhand today!" },
];

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

export function SocialTickerFooter({ 
  items = SAMPLE_ITEMS, 
  onItemPress, 
  onExpand,
  isExpanded = false 
}: SocialTickerFooterProps) {
  const insets = useSafeAreaInsets();
  const scrollAnim = useRef(new RNAnimated.Value(0)).current;
  const [isPaused, setIsPaused] = useState(false);
  
  useEffect(() => {
    if (isPaused || items.length === 0) return;
    
    const animation = RNAnimated.loop(
      RNAnimated.timing(scrollAnim, {
        toValue: 1,
        duration: items.length * 8000,
        useNativeDriver: true,
      })
    );
    
    animation.start();
    
    return () => animation.stop();
  }, [items.length, isPaused]);

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
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill}>
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
          <TickerContent items={items} scrollAnim={scrollAnim} />
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

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  topBorder: {
    height: 1,
    backgroundColor: ProTennisColors.electricGreen,
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
    color: ProTennisColors.white,
    flex: 1,
  },
  expandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ProTennisColors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: Spacing.sm,
  },
});
