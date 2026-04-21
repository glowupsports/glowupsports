import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, I18nManager } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import { NewsCard } from "@/player/components/NewsTicker";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const NEWS_SPORT_PREF_KEY = "@news_sport_preference";
type SportKey = "tennis" | "padel" | "pickleball";

interface NewsArticle {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  thumbnail?: string;
}

const CARD_WIDTH = 280;

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

  return (
    <View style={styles.wrapper}>
      <View style={styles.divider}>
        <Ionicons name="newspaper-outline" size={12} color={Colors.dark.accentText} />
        <Text style={styles.dividerText}>
          {t("news.sectionTitle", "TENNIS NEWS")}
        </Text>
      </View>

      <FlatList
        horizontal
        data={articles}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        inverted={I18nManager.isRTL}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <NewsCard article={item} />
          </View>
        )}
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
    cardWrap: {
      width: CARD_WIDTH,
    },
  })
);
