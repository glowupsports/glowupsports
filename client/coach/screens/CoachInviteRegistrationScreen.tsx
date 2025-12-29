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
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import CountryCodePicker, { getDefaultCountry, CountryCode } from "@/components/CountryCodePicker";

interface InviteInfo {
  valid: boolean;
  role: string;
  academyName: string;
  invitedEmail: string | null;
  expiresAt: string;
}

interface CoachInviteRegistrationScreenProps {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CoachInviteRegistrationScreen({
  token,
  onSuccess,
  onCancel,
}: CoachInviteRegistrationScreenProps) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>(getDefaultCountry());
  const [specialty, setSpecialty] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { data: inviteData, isLoading: inviteLoading, error: inviteError } = useQuery<InviteInfo>({
    queryKey: ["/api/invites/verify", token],
    queryFn: async () => {
      const response = await fetch(new URL(`/api/invites/verify/${token}`, getApiUrl()).toString());
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Invalid invite");
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (inviteData?.invitedEmail) {
      setEmail(inviteData.invitedEmail);
    }
  }, [inviteData?.invitedEmail]);

  const registerMutation = useMutation({
    mutationFn: async (data: {
      token: string;
      username: string;
      name: string;
      email: string;
      password: string;
      phone?: string;
      specialty?: string;
    }) => {
      const response = await apiRequest("POST", "/auth/register/coach", data);
      return response.json();
    },
    onSuccess: async (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Welcome!",
        `You've successfully joined ${inviteData?.academyName || "the academy"} as a coach.`,
        [{ text: "Continue", onPress: () => login(data.user, data.token) }]
      );
      onSuccess();
    },
    onError: (error: any) => {
      Alert.alert("Registration Failed", error.message || "Please try again");
    },
  });

  const handleRegister = () => {
    // Normalize username to lowercase
    const normalizedUsername = username.trim().toLowerCase();
    
    if (!normalizedUsername) {
      Alert.alert("Error", "Please enter a username");
      return;
    }
    if (normalizedUsername.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      Alert.alert("Error", "Username can only contain letters, numbers, and underscores");
      return;
    }
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return;
    }
    if (!phone.trim()) {
      Alert.alert("Error", "Phone number is required for WhatsApp communication");
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

    // Combine country code with phone number (E.164 format, no spaces)
    const fullPhone = `${countryCode.dial}${phone.trim().replace(/\s/g, '')}`;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    registerMutation.mutate({
      token,
      username: normalizedUsername,
      name: name.trim(),
      email: email.trim(),
      password,
      phone: fullPhone,
      specialty: specialty.trim() || undefined,
    });
  };

  if (inviteLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Verifying invite...</Text>
      </View>
    );
  }

  if (inviteError || !inviteData?.valid) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.errorIcon}>
          <Ionicons name="close-circle" size={64} color={Colors.dark.error} />
        </View>
        <Text style={styles.errorTitle}>Invalid Invite</Text>
        <Text style={styles.errorText}>
          {(inviteError as Error)?.message || "This invite link is invalid or has expired."}
        </Text>
        <Pressable style={styles.backButton} onPress={onCancel}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const daysLeft = Math.ceil(
    (new Date(inviteData.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <LinearGradient
            colors={[`${Colors.dark.primary}30`, "transparent"]}
            style={styles.headerGradient}
          />
          <View style={[styles.academyIcon, { backgroundColor: `${Colors.dark.primary}20` }]}>
            <Ionicons name="tennisball" size={32} color={Colors.dark.primary} />
          </View>
          <Text style={styles.welcomeText}>You're invited to join</Text>
          <Text style={styles.academyName}>{inviteData.academyName}</Text>
          <Text style={styles.roleText}>as a {inviteData.role}</Text>
          <View style={styles.expiryBadge}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.expiryText}>
              Invite expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Create Your Account</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="at-outline" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Choose a unique username"
                placeholderTextColor={Colors.dark.disabled}
                autoCapitalize="none"
                autoComplete="username"
              />
            </View>
            <Text style={styles.hintText}>Letters, numbers, and underscores only</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={Colors.dark.disabled}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={[styles.input, inviteData.invitedEmail && styles.inputDisabled]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={Colors.dark.disabled}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!inviteData.invitedEmail}
              />
            </View>
            {inviteData.invitedEmail ? (
              <Text style={styles.inputHint}>
                This email was pre-set by the academy
              </Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.dark.disabled}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={Colors.dark.textMuted}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={Colors.dark.disabled}
                secureTextEntry={!showPassword}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone (for WhatsApp) *</Text>
            <View style={styles.phoneRow}>
              <CountryCodePicker
                selectedCountry={countryCode}
                onSelect={setCountryCode}
              />
              <View style={[styles.inputWrapper, styles.phoneInputWrapper]}>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.dark.disabled}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Specialty (optional)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="tennisball-outline" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.input}
                value={specialty}
                onChangeText={setSpecialty}
                placeholder="e.g., Junior coaching, Advanced technique"
                placeholderTextColor={Colors.dark.disabled}
              />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.registerButton, registerMutation.isPending && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.dark.backgroundRoot} />
                <Text style={styles.registerButtonText}>Join Academy</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.lg,
  },
  errorIcon: {
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  backButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  academyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  welcomeText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  academyName: {
    ...Typography.h1,
    color: Colors.dark.primary,
    textAlign: "center",
    marginVertical: Spacing.xs,
  },
  roleText: {
    ...Typography.body,
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  expiryBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    gap: Spacing.xs,
  },
  expiryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  form: {
    marginBottom: Spacing.xl,
  },
  formTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  hintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  phoneRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  phoneInputWrapper: {
    flex: 1,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  inputDisabled: {
    color: Colors.dark.textMuted,
  },
  inputHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  actions: {
    gap: Spacing.md,
  },
  registerButton: {
    flexDirection: "row",
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
    gap: Spacing.sm,
  },
  registerButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
