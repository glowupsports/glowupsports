import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getApiUrl } from "@/lib/query-client";
import { setAuthToken, saveAuthState } from "@/lib/auth";
import { useAuth } from "@/coach/context/AuthContext";

interface ClaimInviteScreenProps {
  inviteToken: string;
  onBack: () => void;
}

export function ClaimInviteScreen({ inviteToken, onBack }: ClaimInviteScreenProps) {
  const insets = useSafeAreaInsets();
  const { refreshAuth } = useAuth();

  const [previewLoading, setPreviewLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [academyName, setAcademyName] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchPreview() {
      try {
        setPreviewLoading(true);
        const url = new URL(`/api/player-invites/${encodeURIComponent(inviteToken)}/preview`, getApiUrl());
        const res = await fetch(url.toString());
        if (!res.ok) {
          setPreviewError(res.status === 404 ? "This invite link has already been used or is no longer valid." : "Could not load invite details.");
          return;
        }
        const data = await res.json();
        setPlayerName(data.playerName);
        setAcademyName(data.academyName);
        setPlayerId(data.playerId);

        const parts = (data.playerName as string).trim().split(/\s+/);
        if (parts.length >= 2) {
          setFirstName(parts[0]);
          setLastName(parts.slice(1).join(" "));
        } else {
          setFirstName(data.playerName);
          setLastName("");
        }
      } catch {
        setPreviewError("Failed to connect. Please check your connection and try again.");
      } finally {
        setPreviewLoading(false);
      }
    }
    fetchPreview();
  }, [inviteToken]);

  const handleSubmit = async () => {
    if (!playerId) return;

    const trimUsername = username.trim().toLowerCase();
    const trimEmail = email.trim();
    const trimFirst = firstName.trim();
    const trimLast = lastName.trim();
    const trimPassword = password;

    if (!trimUsername || !trimEmail || !trimFirst || !trimLast || !trimPassword) {
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }
    if (trimPassword.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(new URL("/auth/register/player-invite", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          username: trimUsername,
          email: trimEmail,
          firstName: trimFirst,
          lastName: trimLast,
          password: trimPassword,
          playerId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert("Error", data.error || "Registration failed. Please try again.");
        return;
      }

      if (data.token && data.user) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setAuthToken(data.token);
        await saveAuthState(
          data.token,
          {
            id: data.user.id,
            username: data.user.username,
            email: data.user.email,
            role: data.user.role,
            academyId: data.user.academyId || null,
            coachId: data.user.coachId || null,
            playerId: data.user.playerId || null,
          },
          data.refreshToken,
        );
        await refreshAuth();
      } else {
        Alert.alert("Account Created", "Your account is ready. Please sign in.", [
          { text: "OK", onPress: onBack },
        ]);
      }
    } catch {
      Alert.alert("Error", "Could not connect. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Claim Invite</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {previewLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading invite...</Text>
          </View>
        ) : previewError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
            <Text style={styles.errorText}>{previewError}</Text>
            <Pressable style={styles.backLink} onPress={onBack}>
              <Text style={styles.backLinkText}>Go back</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <LinearGradient
              colors={[Colors.dark.primary + "20", Colors.dark.xpCyan + "10"]}
              style={styles.welcomeCard}
            >
              <View style={styles.welcomeIconRow}>
                <View style={styles.welcomeIconWrap}>
                  <Ionicons name="tennisball" size={28} color={Colors.dark.buttonText} />
                </View>
              </View>
              <Text style={styles.welcomeTitle}>
                Welcome, {playerName}!
              </Text>
              <Text style={styles.welcomeSubtitle}>
                Your spot at{" "}
                <Text style={{ color: Colors.dark.text, fontWeight: "700" }}>{academyName}</Text>{" "}
                is ready. Create your account below.
              </Text>
            </LinearGradient>

            <View style={styles.form}>
              <Text style={styles.sectionLabel}>YOUR DETAILS</Text>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="words"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <Text style={styles.sectionLabel}>CREATE YOUR LOGIN</Text>

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Choose a username"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoComplete="username"
              />

              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={Colors.dark.textMuted}
                  />
                </Pressable>
              </View>

              <Pressable
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitBtnGradient}
                >
                  {submitting ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
                      <Text style={styles.submitBtnText}>Create My Account</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: Spacing.md,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  backLink: {
    marginTop: Spacing.sm,
  },
  backLinkText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  welcomeCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  welcomeIconRow: {
    marginBottom: Spacing.md,
  },
  welcomeIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
    letterSpacing: -0.3,
  },
  welcomeSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  form: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1.5,
    marginTop: Spacing.md,
    marginBottom: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: 4,
    marginTop: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  eyeBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  submitBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 15,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
});
