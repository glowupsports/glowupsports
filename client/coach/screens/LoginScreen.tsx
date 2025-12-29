import React, { useState } from "react";
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
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import CountryCodePicker, { getDefaultCountry, CountryCode } from "@/components/CountryCodePicker";

type AuthMode = "login" | "player_register" | "coach_info" | "academy_apply";

interface RoleOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
  onPress: () => void;
}

function RoleOption({ icon, title, description, color, onPress }: RoleOptionProps) {
  return (
    <Pressable
      style={styles.roleOption}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.roleIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.roleContent}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, registerPlayer } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>(getDefaultCountry());
  const [academyName, setAcademyName] = useState("");
  const [country, setCountry] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setCountryCode(getDefaultCountry());
    setAcademyName("");
    setCountry("");
    setContactPerson("");
    setDescription("");
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Normalize username to lowercase for consistency
      const result = await login(username.toLowerCase(), password);
      if (!result.success) {
        Alert.alert("Login Failed", result.error || "Please check your credentials");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlayerRegister = async () => {
    if (!username || !firstName || !lastName || !email || !password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    if (!phone.trim()) {
      Alert.alert("Error", "Phone number is required for WhatsApp communication");
      return;
    }

    // Normalize username to lowercase
    const normalizedUsername = username.toLowerCase();

    if (normalizedUsername.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      Alert.alert("Error", "Username can only contain letters, numbers, and underscores");
      return;
    }

    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Combine country code with phone number (E.164 format, no spaces)
    const fullPhone = `${countryCode.dial}${phone.trim().replace(/\s/g, '')}`;

    try {
      const result = await registerPlayer({
        username: normalizedUsername,
        firstName,
        lastName,
        email,
        password,
        phone: fullPhone,
      });
      if (!result.success) {
        Alert.alert("Registration Failed", result.error || "Please try again");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcademyApply = async () => {
    if (!academyName || !country || !contactPerson || !email) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await apiRequest("POST", "/auth/apply/academy", {
        academyName,
        country,
        contactPerson,
        email,
        phone: phone || undefined,
        description: description || undefined,
      });
      setApplicationSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert("Application Failed", error.message || "Please try again");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModeChange = (newMode: AuthMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
    resetForm();
    setApplicationSubmitted(false);
  };

  const renderLoginForm = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Enter your username"
          placeholderTextColor={Colors.dark.disabled}
          autoCapitalize="none"
          autoComplete="username"
          style={styles.input}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={Colors.dark.disabled}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            style={[styles.input, styles.passwordInput]}
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={Colors.dark.tabIconDefault}
            />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleLogin}
        disabled={isSubmitting}
      >
        <LinearGradient
          colors={[Colors.dark.primary, "#1FA030"]}
          style={styles.submitGradient}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.dark.text} />
          ) : (
            <Text style={styles.submitText}>Sign In</Text>
          )}
        </LinearGradient>
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>New to Glow Up Sports?</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.roleOptions}>
        <RoleOption
          icon="person"
          title="I'm a Player"
          description="Create your account and join an academy"
          color={Colors.dark.xpCyan}
          onPress={() => handleModeChange("player_register")}
        />
        <RoleOption
          icon="tennisball"
          title="I'm a Coach"
          description="Join with an invite from your academy"
          color={Colors.dark.primary}
          onPress={() => handleModeChange("coach_info")}
        />
        <RoleOption
          icon="business"
          title="I own an Academy"
          description="Apply to join the platform"
          color={Colors.dark.gold}
          onPress={() => handleModeChange("academy_apply")}
        />
      </View>
    </>
  );

  const renderPlayerRegister = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.formTitle}>Create Player Account</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Choose a unique username"
          placeholderTextColor={Colors.dark.disabled}
          autoCapitalize="none"
          autoComplete="username"
          style={styles.input}
        />
        <Text style={styles.hintText}>Letters, numbers, and underscores only</Text>
      </View>

      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={Colors.dark.disabled}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={Colors.dark.disabled}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          placeholderTextColor={Colors.dark.disabled}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={styles.input}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone (for WhatsApp)</Text>
        <View style={styles.phoneRow}>
          <CountryCodePicker
            selectedCountry={countryCode}
            onSelect={setCountryCode}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={Colors.dark.disabled}
            keyboardType="phone-pad"
            style={[styles.input, styles.phoneInput]}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Min 8 characters"
            placeholderTextColor={Colors.dark.disabled}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            style={[styles.input, styles.passwordInput]}
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={Colors.dark.tabIconDefault}
            />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handlePlayerRegister}
        disabled={isSubmitting}
      >
        <LinearGradient
          colors={[Colors.dark.xpCyan, "#00A0CC"]}
          style={styles.submitGradient}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.dark.text} />
          ) : (
            <Text style={styles.submitText}>Create Account</Text>
          )}
        </LinearGradient>
      </Pressable>

      <Text style={styles.noteText}>
        After creating your account, you can join an academy to start training with a coach.
      </Text>
    </>
  );

  const renderCoachInfo = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.formTitle}>Coach Registration</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <Ionicons name="mail" size={32} color={Colors.dark.primary} />
        </View>
        <Text style={styles.infoTitle}>Invite Required</Text>
        <Text style={styles.infoText}>
          Coaches need an invitation from an academy to join. Contact your academy owner to receive an invite link.
        </Text>
        <Text style={styles.infoText}>
          If you have an invite link, click on it to complete your registration.
        </Text>
      </View>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => handleModeChange("login")}
      >
        <Text style={styles.secondaryButtonText}>Back to Login</Text>
      </Pressable>
    </>
  );

  const renderAcademyApply = () => {
    if (applicationSubmitted) {
      return (
        <>
          <View style={styles.formHeader}>
            <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
              <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.formTitle}>Application Submitted</Text>
          </View>

          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
            </View>
            <Text style={styles.successTitle}>Thank You!</Text>
            <Text style={styles.successText}>
              Your academy application has been submitted. We will review it and get back to you via email.
            </Text>
          </View>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => handleModeChange("login")}
          >
            <Text style={styles.secondaryButtonText}>Back to Login</Text>
          </Pressable>
        </>
      );
    }

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.formTitle}>Apply for Academy</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Academy Name</Text>
          <TextInput
            value={academyName}
            onChangeText={setAcademyName}
            placeholder="Your academy name"
            placeholderTextColor={Colors.dark.disabled}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Country</Text>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder="Country"
            placeholderTextColor={Colors.dark.disabled}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Contact Person</Text>
          <TextInput
            value={contactPerson}
            onChangeText={setContactPerson}
            placeholder="Your name"
            placeholderTextColor={Colors.dark.disabled}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Contact email"
            placeholderTextColor={Colors.dark.disabled}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone (optional)</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Contact phone"
            placeholderTextColor={Colors.dark.disabled}
            keyboardType="phone-pad"
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us about your academy"
            placeholderTextColor={Colors.dark.disabled}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textArea]}
          />
        </View>

        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleAcademyApply}
          disabled={isSubmitting}
        >
          <LinearGradient
            colors={[Colors.dark.gold, "#CC9900"]}
            style={styles.submitGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.dark.backgroundRoot} />
            ) : (
              <Text style={[styles.submitText, { color: Colors.dark.backgroundRoot }]}>
                Submit Application
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </>
    );
  };

  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
      style={styles.container}
    >
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        {mode === "login" ? (
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="tennisball" size={48} color={Colors.dark.primary} />
            </View>
            <Text style={styles.title}>Glow Up Sports</Text>
            <Text style={styles.subtitle}>Welcome back</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          {mode === "login" ? renderLoginForm() : null}
          {mode === "player_register" ? renderPlayerRegister() : null}
          {mode === "coach_info" ? renderCoachInfo() : null}
          {mode === "academy_apply" ? renderAcademyApply() : null}
        </View>

        {mode !== "login" ? (
          <Pressable style={styles.toggleButton} onPress={() => handleModeChange("login")}>
            <Text style={styles.toggleText}>Already have an account? Sign in</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  form: {
    gap: Spacing.md,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  formTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  phoneRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  phoneInput: {
    flex: 1,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  submitButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginTop: Spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  submitText: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.xl,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  dividerText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  roleOptions: {
    gap: Spacing.sm,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  roleContent: {
    flex: 1,
  },
  roleTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  roleDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  noteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  hintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  infoIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  infoText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  successCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  successIcon: {
    marginBottom: Spacing.sm,
  },
  successTitle: {
    ...Typography.h2,
    color: Colors.dark.primary,
  },
  successText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  secondaryButtonText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  toggleButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  toggleText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
});
