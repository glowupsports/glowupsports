import logger from "@/lib/logger";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, Colors } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const NEWS_SPORT_PREF_KEY = "@news_sport_preference";
type SportKey = "tennis" | "padel" | "pickleball";
const SPORT_LABELS: Record<SportKey, string> = {
  tennis: "TENNIS",
  padel: "PADEL",
  pickleball: "PICKLEBALL",
};

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
  scrollSpeed = 35,
}: NewsTickerProps) {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [sport, setSport] = useState<SportKey>("tennis");

  useEffect(() => {
    AsyncStorage.getItem(NEWS_SPORT_PREF_KEY).then((val) => {
      if (val && ["tennis", "padel", "pickleball"].includes(val)) {
        setSport(val as SportKey);
      }
    }).catch(() => {});
  }, []);

  const { data: newsData, isLoading } = useQuery<{ articles: NewsArticle[] }>({
    queryKey: ["/api/player/news", sport],
    queryFn: async () => {
      const res = await apiFetch(`/api/player/news?sport=${sport}`);
      if (!res.ok) return { articles: [] };
      return res.json();
    },
    refetchInterval: 15 * 60 * 1000,
  });

  const articles = newsData?.articles || [];
  const articlesKey = articles.map(a => a.id).join(",");

  useEffect(() => {
    setMeasuredWidth(0);
  }, [articlesKey]);

  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(glowPulse);
  }, [glowPulse]);

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

  const glowLineStyle = useAnimatedStyle(() => {
    const opacity = 0.4 + glowPulse.value * 0.6;
    return { opacity };
  });

  const liveDotStyle = useAnimatedStyle(() => {
    const scale = 1 + glowPulse.value * 0.3;
    const pulseOpacity = 0.6 + glowPulse.value * 0.4;
    return {
      transform: [{ scale }],
      opacity: pulseOpacity,
    };
  });

  const handleArticlePress = async (link: string) => {
    if (link && link !== "#") {
      try {
        await Linking.openURL(link);
      } catch (error) {
        logger.log("Could not open link:", link);
      }
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return t("news.justNow");
    if (diffHours < 24) return t("news.hoursAgo", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t("news.daysAgo", { count: diffDays });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingDot} />
          <Text style={styles.loadingText}>{t("news.loadingNews")}</Text>
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
        colors={["rgba(255, 255, 255, 0.06)" + "F2", "rgba(255, 255, 255, 0.06)" + "E6", "rgba(255, 255, 255, 0.06)" + "F2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBg}
      />
      
      <Animated.View style={[styles.neonGlowLine, glowLineStyle]} />
      
      <View style={styles.labelContainer}>
        <Animated.View style={[styles.liveDot, liveDotStyle]} />
        <View style={styles.liveDotRing} />
        <Text style={styles.labelText}>{SPORT_LABELS[sport]}</Text>
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
          {renderTickerContent()}
        </Animated.View>
      </View>

      <LinearGradient
        colors={["transparent", "rgba(255, 255, 255, 0.06)" + "F2"]}
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
  const { t } = useTranslation();
  const handlePress = async () => {
    if (article.link && article.link !== "#") {
      try {
        await Linking.openURL(article.link);
      } catch (error) {
        logger.log("Could not open link");
      }
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return t("news.justNow");
    if (diffHours < 24) return t("news.hoursAgo", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t("news.daysAgo", { count: diffDays });
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
          <Feather name="globe" size={10} color={GlowColors.primary} />
          <Text style={styles.newsSourceText}>{article.source}</Text>
        </View>
        <Text style={styles.newsTimeText}>{formatTimeAgo(article.publishedAt)}</Text>
      </View>
      <Text style={styles.newsCardTitle} numberOfLines={2}>
        {article.title}
      </Text>
      <View style={styles.readMoreRow}>
        <Text style={styles.readMoreText}>{t("news.readMore")}</Text>
        <Feather name="arrow-right" size={12} color={GlowColors.primary} />
      </View>
    </Pressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    height: 42,
    overflow: "hidden",
    position: "relative",
    borderTopWidth: 1,
    borderTopColor: GlowColors.primary + "33",
    borderBottomWidth: 1,
    borderBottomColor: GlowColors.primary + "33",
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  neonGlowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: GlowColors.primary,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    zIndex: 5,
  },
  labelContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingLeft: Spacing.sm,
    backgroundColor: Backgrounds.card + "FA",
    zIndex: 10,
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: GlowColors.primary + "4D",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GlowColors.primary,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    zIndex: 2,
  },
  liveDotRing: {
    position: "absolute",
    left: Spacing.sm - 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: GlowColors.primary + "40",
  },
  labelText: {
    color: GlowColors.primary,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.5,
    textShadowColor: GlowColors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    marginLeft: 4,
  },
  tickerContainer: {
    flex: 1,
    marginLeft: 90,
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
    backgroundColor: `${GlowColors.primary}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  sourceText: {
    color: GlowColors.primary,
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    color: GlowColors.primary,
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
    color: GlowColors.primary,
    fontSize: 11,
    fontWeight: "600",
  },
}));
