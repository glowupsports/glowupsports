import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Colors } from "@/constants/theme";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { getApiUrl } from "@/lib/query-client";

type AcademySlugResolverRouteParams = {
  AcademySlugResolver: { slug: string };
};

export default function AcademySlugResolverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AcademySlugResolverRouteParams, "AcademySlugResolver">>();
  const { slug } = route.params;
  const didNavigate = useRef(false);

  useEffect(() => {
    if (!slug || didNavigate.current) return;
    let cancelled = false;

    async function resolve() {
      try {
        const url = new URL(`/api/academies/by-slug/${encodeURIComponent(slug)}`, getApiUrl());
        const res = await fetch(url.toString());
        if (cancelled) return;
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        if (cancelled || didNavigate.current) return;
        didNavigate.current = true;
        navigation.replace("AcademyPublicProfile", { academyId: data.academyId });
      } catch {
        if (!cancelled && !didNavigate.current) {
          didNavigate.current = true;
          Alert.alert("Academy not found", "This academy link is no longer valid.", [
            { text: "OK", onPress: () => navigation.goBack() },
          ]);
        }
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [slug, navigation]);

  return (
    <View style={styles.container}>
      <TennisBallSpinner size="large" color={Colors.dark.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
