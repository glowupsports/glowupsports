import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { ProTennisColors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface NewsArticle {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  thumbnail?: string;
}

interface NewsTickerProps {
  style?: any;
  autoScroll?: boolean;
  scrollSpeed?: number;
}

export function NewsTicker({
  style,
  autoScroll = true,
  scrollSpeed = 50,
}: NewsTickerProps) {
  const translateX = useSharedValue(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const { data: newsData, isLoading } = useQuery<{ articles: NewsArticle[] }>({
    queryKey: ["/api/player/news"],
    refetchInterval: 15 * 60 * 1000,
  });

  const articles = newsData?.articles || [];
  const articlesKey = articles.map(a => a.id).join(",");

  useEffect(() => {
    setMeasuredWidth(0);
  }, [articlesKey]);

  useEffect(() => {
    if (autoScroll && articles.length > 0 && measuredWidth > 0) {
      const duration = (measuredWidth / scrollSpeed) * 1000;
      translateX.value = 0;
      
      const timer = setTimeout(() => {
        translateX.value = withRepeat(
          withTiming(-measuredWidth, {
            duration,
            easing: Easing.linear,
          }),
          -1,
          false
        );
      }, 100);

      return () => {
        clearTimeout(timer);
        cancelAnimation(translateX);
      };
    }

    return () => {
      cancelAnimation(translateX);
    };
  }, [articles.length, autoScroll, measuredWidth, scrollSpeed, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleArticlePress = async (link: string) => {
    if (link && link !== "#") {
      try {
        await Linking.openURL(link);
      } catch (error) {
        console.log("Could not open link:", link);
      }
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingDot} />
          <Text style={styles.loadingText}>Loading tennis news...</Text>
        </View>
      </View>
    );
  }

  if (articles.length === 0) {
    return null;
  }

  const renderTickerContent = () => (
    <>
      {articles.map((article, index) => (
        <Pressable
          key={`${article.id}-${index}`}
          onPress={() => handleArticlePress(article.link)}
          style={({ pressed }) => [
            styles.articleItem,
            pressed && styles.articlePressed,
          ]}
        >
          <View style={styles.sourceTag}>
            <Text style={styles.sourceText}>{article.source}</Text>
          </View>
          <Text style={styles.articleTitle} numberOfLines={1}>
            {article.title}
          </Text>
          <Text style={styles.timeAgo}>{formatTimeAgo(article.publishedAt)}</Text>
          <View style={styles.separator}>
            <Feather name="circle" size={4} color={ProTennisColors.textMuted} />
          </View>
        </Pressable>
      ))}
    </>
  );

  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={["rgba(0, 0, 0, 0.9)", "rgba(21, 27, 41, 0.95)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBg}
      />
      
      <View style={styles.labelContainer}>
        <View style={styles.liveDot} />
        <Text style={styles.labelText}>TENNIS</Text>
      </View>

      <View style={styles.tickerContainer}>
        <Animated.View
          style={[styles.tickerContent, animatedStyle]}
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            if (width > 0 && width !== measuredWidth) {
              setMeasuredWidth(width);
            }
          }}
        >
          {renderTickerContent()}
          {renderTickerContent()}
        </Animated.View>
      </View>

      <LinearGradient
        colors={["transparent", "rgba(9, 14, 23, 0.95)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeRight}
        pointerEvents="none"
      />
    </View>
  );
}

interface NewsCardProps {
  article: NewsArticle;
  style?: any;
}

export function NewsCard({ article, style }: NewsCardProps) {
  const handlePress = async () => {
    if (article.link && article.link !== "#") {
      try {
        await Linking.openURL(article.link);
      } catch (error) {
        console.log("Could not open link");
      }
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.newsCard,
        pressed && styles.newsCardPressed,
        style,
      ]}
    >
      <View style={styles.newsCardHeader}>
        <View style={styles.newsSourceBadge}>
          <Feather name="globe" size={10} color={ProTennisColors.neonCyan} />
          <Text style={styles.newsSourceText}>{article.source}</Text>
        </View>
        <Text style={styles.newsTimeText}>{formatTimeAgo(article.publishedAt)}</Text>
      </View>
      <Text style={styles.newsCardTitle} numberOfLines={2}>
        {article.title}
      </Text>
      <View style={styles.readMoreRow}>
        <Text style={styles.readMoreText}>Read more</Text>
        <Feather name="arrow-right" size={12} color={ProTennisColors.neonCyan} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 40,
    overflow: "hidden",
    position: "relative",
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  labelContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    backgroundColor: ProTennisColors.midnightBlue,
    zIndex: 10,
    gap: Spacing.xs,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.1)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ProTennisColors.electricGreen,
  },
  labelText: {
    color: ProTennisColors.electricGreen,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 1,
  },
  tickerContainer: {
    flex: 1,
    marginLeft: 80,
    overflow: "hidden",
  },
  tickerContent: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
  },
  articleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 40,
    gap: Spacing.sm,
  },
  articlePressed: {
    opacity: 0.7,
  },
  sourceTag: {
    backgroundColor: `${ProTennisColors.neonCyan}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  sourceText: {
    color: ProTennisColors.neonCyan,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  articleTitle: {
    color: ProTennisColors.white,
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 300,
  },
  timeAgo: {
    color: ProTennisColors.textMuted,
    fontSize: 11,
  },
  separator: {
    marginHorizontal: Spacing.lg,
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ProTennisColors.textMuted,
  },
  loadingText: {
    color: ProTennisColors.textMuted,
    fontSize: 12,
  },
  newsCard: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  newsCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  newsCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  newsSourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  newsSourceText: {
    color: ProTennisColors.neonCyan,
    fontSize: 10,
    fontWeight: "600",
  },
  newsTimeText: {
    color: ProTennisColors.textMuted,
    fontSize: 10,
  },
  newsCardTitle: {
    color: ProTennisColors.white,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  readMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  readMoreText: {
    color: ProTennisColors.neonCyan,
    fontSize: 11,
    fontWeight: "600",
  },
});
