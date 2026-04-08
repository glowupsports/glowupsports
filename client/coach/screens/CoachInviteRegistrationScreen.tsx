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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import CountryCodePicker, { getDefaultCountry, CountryCode } from "@/components/CountryCodePicker";
import { TshirtSizePicker } from "@/components/TshirtSizePicker";
import { TshirtSize } from "@shared/schema";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

function GamingButton({ 
  onPress, 
  title, 
  icon,
  isLoading = false,
  disabled = false,
  colors = [Colors.dark.primary, "#1FA030"],
}: { 
  onPress: () => void; 
  title: string; 
  icon?: string;
  isLoading?: boolean;
  disabled?: boolean;
  colors?: string[];
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || isLoading}
      style={[styles.gamingButton, animatedStyle, disabled && styles.gamingButtonDisabled]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gamingButtonGradient}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.dark.buttonText} />
        ) : (
          <>
            {icon ? (
              <Ionicons name={icon as any} size={20} color={Colors.dark.buttonText} />
            ) : null}
            <Text style={styles.gamingButtonText}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
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
  const [tshirtSize, setTshirtSize] = useState<TshirtSize | undefined>(undefined);
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
      tshirtSize?: TshirtSize;
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
      tshirtSize,
    });
  };

  if (inviteLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
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
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="close-circle" size={64} color={Colors.dark.error} />
          </View>
          <Text style={styles.errorTitle}>INVALID INVITE</Text>
          <Text style={styles.errorText}>
            {(inviteError as Error)?.message || "This invite link is invalid or has expired."}
          </Text>
          <GamingButton
            onPress={onCancel}
            title="GO BACK"
            icon="arrow-back"
            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
          />
        </View>
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
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.glassCard}>
          <LinearGradient
            colors={[`${Colors.dark.primary}20`, "transparent"]}
            style={styles.cardGradientOverlay}
          />
          <View style={styles.academyIcon}>
            <Ionicons name="tennisball" size={32} color={Colors.dark.primary} />
          </View>
          <Text style={styles.welcomeText}>You're invited to join</Text>
          <Text style={styles.academyName}>{inviteData.academyName}</Text>
          <Text style={styles.roleText}>as a {inviteData.role}</Text>
          <View style={styles.expiryBadge}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.expiryText}>
              Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>CREATE YOUR ACCOUNT</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USERNAME *</Text>
            <View style={styles.glassInput}>
              <Ionicons name="at-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Choose a unique username"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoComplete="username"
              />
            </View>
            <Text style={styles.hintText}>Letters, numbers, and underscores only</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FULL NAME *</Text>
            <View style={styles.glassInput}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>EMAIL *</Text>
            <View style={[styles.glassInput, inviteData.invitedEmail && styles.inputDisabledWrapper]}>
              <Ionicons name="mail-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, inviteData.invitedEmail && styles.inputDisabled]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={Colors.dark.textMuted}
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
            <Text style={styles.inputLabel}>PASSWORD *</Text>
            <View style={styles.glassInput}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.dark.textMuted}
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
            <Text style={styles.inputLabel}>CONFIRM PASSWORD *</Text>
            <View style={styles.glassInput}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={Colors.dark.textMuted}
                secureTextEntry={!showPassword}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PHONE (FOR WHATSAPP) *</Text>
            <View style={styles.phoneRow}>
              <CountryCodePicker
                selectedCountry={countryCode}
                onSelect={setCountryCode}
              />
              <View style={[styles.glassInput, styles.phoneInputWrapper]}>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>SPECIALTY (OPTIONAL)</Text>
            <View style={styles.glassInput}>
              <Ionicons name="tennisball-outline" size={18} color={Colors.dark.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={specialty}
                onChangeText={setSpecialty}
                placeholder="e.g., Junior coaching, Advanced technique"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>T-SHIRT SIZE (OPTIONAL)</Text>
            <TshirtSizePicker value={tshirtSize} onChange={setTshirtSize} />
            <Text style={styles.inputHint}>For academy merchandise and giveaways</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <GamingButton
            onPress={handleRegister}
            title="JOIN ACADEMY"
            icon="checkmark-circle"
            isLoading={registerMutation.isPending}
            disabled={registerMutation.isPending}
          />

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
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.lg,
  },
  errorIconContainer: {
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  glassCard: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
    overflow: "hidden",
  },
  cardGradientOverlay: {
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
    backgroundColor: `${Colors.dark.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
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
    backgroundColor: `${Colors.dark.xpCyan}15`,
    gap: Spacing.xs,
  },
  expiryText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  form: {
    marginBottom: Spacing.xl,
  },
  formTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  hintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  glassInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  inputIcon: {
    marginRight: Spacing.sm,
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
  passwordInput: {
    paddingRight: Spacing.md,
  },
  inputDisabledWrapper: {
    opacity: 0.7,
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
  gamingButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  gamingButtonDisabled: {
    opacity: 0.6,
  },
  gamingButtonGradient: {
    flexDirection: "row",
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  gamingButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  cancelButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
});
