import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, I18nManager, Pressable, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image as ExpoImage } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Spacing, BorderRadius, Colors, Backgrounds } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import logger from "@/lib/logger";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const NEWS_SPORT_PREF_KEY = "@news_sport_preference";
type SportKey = "tennis" | "padel" | "pickleball";

const SPORT_LABELS: Record<SportKey, string> = {
  tennis: "TENNIS",
  padel: "PADEL",
  pickleball: "PICKLEBALL",
};

const SPORT_TITLE_KEYS: Record<SportKey, { key: string; fallback: string }> = {
  tennis: { key: "news.sectionTitleTennis", fallback: "TENNIS NEWS" },
  padel: { key: "news.sectionTitlePadel", fallback: "PADEL NEWS" },
  pickleball: { key: "news.sectionTitlePickleball", fallback: "PICKLEBALL NEWS" },
};

interface NewsArticle {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  thumbnail?: string;
}

const CARD_WIDTH = 280;

function formatTimeAgo(dateStr: string, t: (k: string, opts?: any) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  if (diffHours < 1) return t("news.justNow");
  if (diffHours < 24) return t("news.hoursAgo", { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t("news.daysAgo", { count: diffDays });
}

function StripNewsCard({ article, sport }: { article: NewsArticle; sport: SportKey }) {
  const { t } = useTranslation();

  const handlePress = async () => {
    if (article.link && article.link !== "#") {
      try {
        await Linking.openURL(article.link);
      } catch {
        logger.log("Could not open link");
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="link"
      accessibilityLabel={article.title}
    >
      {article.thumbnail ? (
        <ExpoImage
          source={{ uri: article.thumbnail }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.sportPill}>
          <Text style={styles.sportPillText}>{SPORT_LABELS[sport]}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {article.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.sourceText} numberOfLines={1}>
            {article.source}
          </Text>
          <View style={styles.metaDot} />
          <Text style={styles.timeText} numberOfLines={1}>
            {formatTimeAgo(article.publishedAt, t)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function TennisNewsStrip() {
  const { t } = useTranslation();
  const [sport, setSport] = useState<SportKey>("tennis");

  useEffect(() => {
    AsyncStorage.getItem(NEWS_SPORT_PREF_KEY)
      .then((val) => {
        if (val && ["tennis", "padel", "pickleball"].includes(val)) {
          setSport(val as SportKey);
        }
      })
      .catch(() => {});
  }, []);

  const { data: newsData } = useQuery<{ articles: NewsArticle[] }>({
    queryKey: ["/api/player/news", sport],
    queryFn: async () => {
      const res = await apiFetch(`/api/player/news?sport=${sport}`);
      if (!res.ok) return { articles: [] };
      return res.json();
    },
    refetchInterval: 15 * 60 * 1000,
  });

  const articles = (newsData?.articles || []).slice(0, 10);

  if (articles.length === 0) {
    return null;
  }

  const titleSpec = SPORT_TITLE_KEYS[sport];

  return (
    <View style={styles.wrapper}>
      <View style={styles.divider}>
        <Ionicons name="newspaper-outline" size={12} color={Colors.dark.accentText} />
        <Text style={styles.dividerText}>{t(titleSpec.key, titleSpec.fallback)}</Text>
      </View>

      <FlatList
        horizontal
        data={articles}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        inverted={I18nManager.isRTL}
        renderItem={({ item }) => <StripNewsCard article={item} sport={sport} />}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    wrapper: {
      marginVertical: Spacing.sm,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    dividerText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
      color: Colors.dark.accentText,
    },
    listContent: {
      paddingHorizontal: Spacing.lg,
    },
    card: {
      width: CARD_WIDTH,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.chipBackground,
      overflow: "hidden",
    },
    cardPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    thumb: {
      width: "100%",
      height: 120,
      backgroundColor: Colors.dark.chipBackground,
    },
    cardBody: {
      padding: Spacing.md,
      gap: 6,
    },
    sportPill: {
      alignSelf: "flex-start",
      backgroundColor: Colors.dark.accentTextSoft,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.xs,
    },
    sportPillText: {
      color: Colors.dark.accentText,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.6,
    },
    cardTitle: {
      color: Colors.dark.text,
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 19,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    sourceText: {
      color: Colors.dark.textMuted,
      fontSize: 11,
      fontWeight: "600",
      flexShrink: 1,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: Colors.dark.textMuted,
    },
    timeText: {
      color: Colors.dark.textMuted,
      fontSize: 11,
    },
  })
);
