// Task #1271 — Outsider invite modal.
//
// Generates an outside-invite token via POST /api/outside-invites and lets
// the user share the resulting deep link via WhatsApp / SMS / Email / Copy /
// the system Share sheet. The link points at /i/<token> on the API host —
// taps from devices without the app installed get the public landing page
// with App Store / Play Store buttons; taps from devices with the app
// installed reach the InviteClaim screen via the deferred deep link.

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Linking,
  Share,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
} from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Props {
  visible: boolean;
  onClose: () => void;
  inviterName?: string | null;
  targetType?: "play" | "match_challenge" | "open_match";
  targetId?: string | null;
  message?: string | null;
}

interface InviteResponse {
  token: string;
  url: string;
  deepLink: string;
  expiresAt: string;
}

export function OutsideInviteModal({
  visible,
  onClose,
  inviterName,
  targetType = "play",
  targetId = null,
  message,
}: Props) {
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setInvite(null);
      setError(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest("POST", "/api/outside-invites", {
          targetType,
          targetId,
          message: message || null,
        });
        const data = (await res.json()) as InviteResponse;
        if (!cancelled) setInvite(data);
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message?.includes("rate_limited")
              ? "Daily invite limit reached. Try again tomorrow."
              : "Couldn't create the invite. Try again.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, targetType, targetId, message]);

  const composeMessage = (): string => {
    const who = inviterName ? `${inviterName} on Glow Up Sports` : "me on Glow Up Sports";
    return `Want to play tennis? Join ${who}: ${invite?.url ?? ""}`;
  };

  const handleWhatsApp = async () => {
    if (!invite) return;
    Haptics.selectionAsync();
    const url = `whatsapp://send?text=${encodeURIComponent(composeMessage())}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error();
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "WhatsApp not installed",
        "Install WhatsApp or pick another channel.",
      );
    }
  };

  const handleSms = async () => {
    if (!invite) return;
    Haptics.selectionAsync();
    // The OS sms: URL scheme is universally available on iOS and Android
    // and falls back gracefully to a "no SMS app" prompt on web.
    const sep = Platform.OS === "ios" ? "&" : "?";
    const url = `sms:${sep}body=${encodeURIComponent(composeMessage())}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("SMS unavailable", "Try a different channel.");
    }
  };

  const handleEmail = async () => {
    if (!invite) return;
    Haptics.selectionAsync();
    const url = `mailto:?subject=${encodeURIComponent(
      `${inviterName || "A friend"} invited you to play tennis`,
    )}&body=${encodeURIComponent(composeMessage())}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Email unavailable", "Try a different channel.");
    }
  };

  const handleCopy = async () => {
    if (!invite) return;
    Haptics.selectionAsync();
    await Clipboard.setStringAsync(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleShareSheet = async () => {
    if (!invite) return;
    Haptics.selectionAsync();
    try {
      await Share.share({ message: composeMessage(), url: invite.url });
    } catch {
      // user cancelled
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>Invite a friend</Text>
              <Text style={styles.title}>Bring someone new</Text>
            </View>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.dark.primary} />
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={onClose} style={styles.errorBtn}>
                <Text style={styles.errorBtnText}>Close</Text>
              </Pressable>
            </View>
          ) : invite ? (
            <>
              <Text style={styles.linkBoxLabel}>Your invite link</Text>
              <Pressable style={styles.linkBox} onPress={handleCopy}>
                <Text numberOfLines={1} style={styles.linkText}>
                  {invite.url}
                </Text>
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={18}
                  color={copied ? Colors.dark.primary : Colors.dark.textSecondary}
                />
              </Pressable>
              <View style={styles.channelGrid}>
                <ChannelButton
                  icon="logo-whatsapp"
                  color="#25D366"
                  label="WhatsApp"
                  onPress={handleWhatsApp}
                />
                <ChannelButton
                  icon="chatbubble"
                  color="#34A853"
                  label="SMS"
                  onPress={handleSms}
                />
                <ChannelButton
                  icon="mail"
                  color="#EA4335"
                  label="Email"
                  onPress={handleEmail}
                />
                <ChannelButton
                  icon="share-social"
                  color={Colors.dark.primary}
                  label="More"
                  onPress={handleShareSheet}
                />
              </View>
              <Text style={styles.note}>
                When they tap the link, they&apos;ll land on a preview page
                with App Store / Play Store buttons. After install
                they&apos;ll see your invite waiting in the app.
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ChannelButton({
  icon,
  color,
  label,
  onPress,
}: {
  icon: any;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.channelBtn} onPress={onPress}>
      <View style={[styles.channelIcon, { backgroundColor: color + "1F" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.channelLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.borderSubtle,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  eyebrow: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  errorBox: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    textAlign: "center",
    fontSize: FontSizes.sm,
  },
  errorBtn: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  errorBtnText: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  linkBoxLabel: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: Spacing.sm,
  },
  linkText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
  },
  channelGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
  },
  channelBtn: {
    alignItems: "center",
    gap: 6,
  },
  channelIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  channelLabel: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  note: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    marginTop: Spacing.lg,
    lineHeight: 16,
  },
});
