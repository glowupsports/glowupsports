import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

interface InviteInfo {
  valid: boolean;
  invitedEmail: string | null;
  invitedName: string | null;
  expiresAt: string;
}

interface ProviderInviteRegistrationScreenProps {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProviderInviteRegistrationScreen({
  token,
  onSuccess,
  onCancel,
}: ProviderInviteRegistrationScreenProps) {
  const insets = useSafeAreaInsets();
  const { loginWithToken } = useAuth();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { data: inviteData, isLoading: inviteLoading, error: inviteError } = useQuery<InviteInfo>({
    queryKey: ["/api/provider-invites/verify", token],
    queryFn: async () => {
      const response = await fetch(new URL(`/api/provider-invites/verify/${token}`, getApiUrl()).toString());
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Invalid invite");
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (inviteData?.invitedEmail) setEmail(inviteData.invitedEmail);
    if (inviteData?.invitedName) setName(inviteData.invitedName);
  }, [inviteData?.invitedEmail, inviteData?.invitedName]);

  const registerMutation = useMutation({
    mutationFn: async (data: {
      token: string;
      username: string;
      name: string;
      email: string;
      password: string;
    }) => {
      const response = await apiRequest("POST", "/auth/register/provider", data);
      return response.json();
    },
    onSuccess: async (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loginWithToken(data.token, data.user);
      onSuccess();
    },
    onError: (error: any) => {
      Alert.alert("Registration Failed", error.message || "Please try again");
    },
  });

  const handleRegister = () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername || normalizedUsername.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      Alert.alert("Error", "Username can only contain letters, numbers, and underscores");
      return;
    }
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your display name");
      return;
    }
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    registerMutation.mutate({
      token,
      username: normalizedUsername,
      name: name.trim(),
      email: email.trim(),
      password,
    });
  };

  if (inviteLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={[Colors.dark.primary, Colors.dark.xpCyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerTopLine} />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Verifying invite...</Text>
        </View>
      </View>
    );
  }

  if (inviteError || !inviteData?.valid) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={[Colors.dark.primary, Colors.dark.xpCyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerTopLine} />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <Ionicons name="close-circle" size={64} color={Colors.dark.error} />
          <Text style={styles.errorTitle}>INVALID INVITE</Text>
          <Text style={styles.errorText}>
            {(inviteError as Error)?.message || "This invite link is invalid or has expired."}
          </Text>
          <Pressable style={styles.backButton} onPress={onCancel}>
            <Ionicons name="arrow-back" size={20} color={Colors.dark.buttonText} />
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const daysLeft = Math.ceil(
    (new Date(inviteData.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]} style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={[Colors.dark.primary, Colors.dark.xpCyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerTopLine} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeCard}>
          <LinearGradient colors={[`${Colors.dark.primary}20`, "transparent"]} style={styles.cardGradient} />
          <View style={styles.iconWrapper}>
            <Ionicons name="construct" size={32} color={Colors.dark.primary} />
          </View>
          <Text style={styles.welcomeText}>You&apos;ve been invited to join</Text>
          <Text style={styles.platformName}>Glow Up Sports</Text>
          <Text style={styles.roleLabel}>as a Service Provider</Text>
          <View style={styles.expiryBadge}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.expiryText}>Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>CREATE YOUR ACCOUNT</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USERNAME *</Text>
            <View style={styles.inputRow}>
              <Ionicons name="at-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Choose a unique username"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
              />
            </View>
            <Text style={styles.hint}>Letters, numbers, and underscores only</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DISPLAY NAME *</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name or business name"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>EMAIL *</Text>
            <View style={[styles.inputRow, inviteData.invitedEmail ? styles.disabledWrapper : undefined]}>
              <Ionicons name="mail-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, inviteData.invitedEmail ? styles.inputDisabled : undefined]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                editable={!inviteData.invitedEmail}
              />
            </View>
            {inviteData.invitedEmail ? (
              <Text style={styles.hint}>This email was pre-set by the platform</Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD *</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.dark.textMuted}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CONFIRM PASSWORD *</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={Colors.dark.textMuted}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
              />
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.submitButton, registerMutation.isPending && styles.submitDisabled]}
          onPress={handleRegister}
          disabled={registerMutation.isPending}
        >
          {registerMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.submitText}>JOIN AS PROVIDER</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.cancelLink} onPress={onCancel}>
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 10,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.dark.error,
    textAlign: "center",
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 12,
    marginTop: Spacing.md,
  },
  backButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  welcomeCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    padding: Spacing.xl,
    alignItems: "center",
    overflow: "hidden",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.dark.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  welcomeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  platformName: {
    ...Typography.h2,
    color: Colors.dark.primary,
    fontWeight: "800",
  },
  roleLabel: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  expiryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${Colors.dark.xpCyan}10`,
    paddingVertical: 4,
    paddingHorizontal: Spacing.md,
    borderRadius: 20,
    marginTop: Spacing.xs,
  },
  expiryText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  form: {
    gap: Spacing.md,
  },
  formTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    paddingVertical: 4,
  },
  inputDisabled: {
    color: Colors.dark.textMuted,
  },
  disabledWrapper: {
    opacity: 0.6,
  },
  hint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginLeft: 2,
  },
  submitButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Colors.dark.buttonText,
    fontWeight: "800",
    fontSize: 15,
  },
  cancelLink: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  cancelLinkText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
});
