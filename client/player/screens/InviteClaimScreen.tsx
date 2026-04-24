// Task #1271 — Outside-invite claim screen.
//
// Reached via deep link `glowupsports://i/<token>` (or the `/i/:token` HTTPS
// equivalent on the API host). Loads the public preview, shows the inviter's
// name + photo + message, then calls POST /api/outside-invites/:token/claim
// when the new player taps Accept. The server side handles auto-creation of
// the matching match_challenge + the inviter notification.

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
} from "@/constants/theme";
import { apiRequest, buildPhotoUrl, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

interface InvitePreview {
  token: string;
  targetType: "play" | "match_challenge" | "open_match";
  targetId: string | null;
  message: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  isClaimed: boolean;
  inviter: {
    playerId: string;
    name: string | null;
    profilePhotoUrl: string | null;
    ballLevel: string | null;
    city: string | null;
    country: string | null;
  };
}

export default function InviteClaimScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const token: string | undefined = route.params?.token;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneState, setDoneState] = useState<"accepted" | "declined" | null>(
    null,
  );
  const [challengeId, setChallengeId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This invite link is missing a token.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          new URL(
            `/api/outside-invites/${encodeURIComponent(token)}`,
            getApiUrl(),
          ).toString(),
        );
        if (!res.ok) throw new Error("invite_not_found");
        const data = (await res.json()) as InvitePreview;
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setError("This invite couldn't be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    if (!token || !preview) return;
    if (!isAuthenticated) {
      Alert.alert(
        "Sign in to accept",
        "Create your account or sign in, then tap the link again to accept.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign in",
            onPress: () => navigation.navigate("Login"),
          },
        ],
      );
      return;
    }
    setClaiming(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/outside-invites/${encodeURIComponent(token)}/claim`,
        {},
      );
      try {
        const json = await res.json();
        if (json?.challengeId) setChallengeId(String(json.challengeId));
      } catch {
        // body parse errors shouldn't block the success state
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDoneState("accepted");
    } catch (err: any) {
      Alert.alert(
        "Couldn't accept",
        err?.message?.includes("expired")
          ? "This invite has expired."
          : err?.message?.includes("already")
            ? "Looks like this invite has already been claimed."
            : "Something went wrong. Try again.",
      );
    } finally {
      setClaiming(false);
    }
  };

  const handleDecline = () => {
    Haptics.selectionAsync();
    setDoneState("declined");
  };

  const photo = buildPhotoUrl(preview?.inviter.profilePhotoUrl ?? null);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom },
      ]}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.dark.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons
              name="alert-circle"
              size={42}
              color={Colors.dark.textMuted}
            />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.btnGhostText}>Close</Text>
            </Pressable>
          </View>
        ) : preview ? (
          <>
            <Text style={styles.eyebrow}>You&apos;ve been invited</Text>
            <View style={styles.heroCard}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.heroAvatar} />
              ) : (
                <View style={[styles.heroAvatar, styles.heroAvatarPlaceholder]}>
                  <Ionicons
                    name="person"
                    size={48}
                    color={Colors.dark.textMuted}
                  />
                </View>
              )}
              <Text style={styles.heroName} numberOfLines={1}>
                {preview.inviter.name || "A Glow Up player"}
              </Text>
              {preview.inviter.city || preview.inviter.country ? (
                <Text style={styles.heroLocation}>
                  {[preview.inviter.city, preview.inviter.country]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              ) : null}
              <Text style={styles.heroBody}>
                wants to play tennis with you on Glow Up Sports.
              </Text>
              {preview.message ? (
                <View style={styles.messageBox}>
                  <Ionicons
                    name="chatbubble"
                    size={14}
                    color={Colors.dark.textSecondary}
                  />
                  <Text style={styles.messageText}>
                    &ldquo;{preview.message}&rdquo;
                  </Text>
                </View>
              ) : null}
            </View>

            {doneState === "accepted" ? (
              <View style={styles.successBox}>
                <Ionicons
                  name="checkmark-circle"
                  size={42}
                  color={Colors.dark.primary}
                />
                <Text style={styles.successTitle}>You&apos;re connected!</Text>
                <Text style={styles.successBody}>
                  We&apos;ve let {preview.inviter.name || "your inviter"} know.
                  {challengeId
                    ? " Open your matches to set up a time to play."
                    : " Open Play to set up a time to play."}
                </Text>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => {
                    if (challengeId) {
                      // Land in the matches list (Growth → Match) where the
                      // freshly created challenge is waiting to be scheduled.
                      navigation.navigate("Player", {
                        screen: "PlayerTabs",
                        params: {
                          screen: "Growth",
                          params: {
                            screen: "Match",
                            params: { initialTab: "upcoming" },
                          },
                        },
                      });
                    } else {
                      navigation.navigate("Player", {
                        screen: "PlayStack",
                        params: { screen: "Play" },
                      });
                    }
                  }}
                >
                  <Text style={styles.btnPrimaryText}>
                    {challengeId ? "View match" : "Go to Play"}
                  </Text>
                </Pressable>
              </View>
            ) : doneState === "declined" ? (
              <View style={styles.successBox}>
                <Ionicons
                  name="close-circle"
                  size={42}
                  color={Colors.dark.textMuted}
                />
                <Text style={styles.successTitle}>No worries</Text>
                <Text style={styles.successBody}>
                  You can still explore players any time from the Play tab.
                </Text>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={styles.btnPrimaryText}>Done</Text>
                </Pressable>
              </View>
            ) : preview.isExpired ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  This invite has expired. Ask {preview.inviter.name || "your inviter"} for a new one.
                </Text>
              </View>
            ) : preview.isClaimed ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  This invite has already been claimed.
                </Text>
              </View>
            ) : (
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={handleDecline}
                  disabled={claiming}
                >
                  <Text style={styles.btnGhostText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary, claiming && styles.disabled]}
                  onPress={handleAccept}
                  disabled={claiming}
                >
                  {claiming ? (
                    <ActivityIndicator size="small" color="#0B0D10" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Accept</Text>
                  )}
                </Pressable>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing["3xl"],
  },
  eyebrow: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
    alignSelf: "center",
  },
  heroCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  heroAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  heroAvatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroName: {
    color: Colors.dark.text,
    fontSize: FontSizes["2xl"],
    fontWeight: "700",
    marginTop: Spacing.sm,
  },
  heroLocation: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
  },
  heroBody: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
    textAlign: "center",
    marginTop: 4,
  },
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    alignSelf: "stretch",
  },
  messageText: {
    flex: 1,
    color: Colors.dark.text,
    fontStyle: "italic",
    fontSize: FontSizes.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: Colors.dark.primary,
  },
  btnPrimaryText: {
    color: "#0B0D10",
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  btnGhostText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    padding: Spacing.lg,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
  successBox: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  successTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700",
  },
  successBody: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
});
