import logger from "@/lib/logger";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  Image,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { LanguageSelectorModal } from "@/components/LanguageSelectorModal";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { setAuthToken, saveAuthState } from "@/lib/auth";
import CountryCodePicker, { getDefaultCountry, CountryCode } from "@/components/CountryCodePicker";
import {
  SavedAccount,
  getSavedAccounts,
  saveAccount,
  removeAccount,
  checkBiometricSupport,
} from "@/lib/savedAccounts";

type AuthMode = "login" | "player_register" | "coach_info" | "academy_apply" | "invite_code";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

interface PremiumInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  secureTextEntry?: boolean;
  showToggle?: boolean;
  onToggle?: () => void;
  showPassword?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: "username" | "password" | "email" | "name" | "off";
  rightElement?: React.ReactNode;
}

function PremiumInput({ 
  value, 
  onChangeText, 
  placeholder, 
  icon, 
  iconColor = Colors.dark.primary,
  secureTextEntry = false,
  showToggle = false,
  onToggle,
  showPassword = false,
  autoCapitalize = "none",
  autoComplete = "off",
  rightElement,
}: PremiumInputProps) {
  const focusAnim = useSharedValue(0);
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    focusAnim.value = withTiming(1, { duration: 200 });
  };

  const handleBlur = () => {
    setIsFocused(false);
    focusAnim.value = withTiming(0, { duration: 200 });
  };

  const glowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusAnim.value,
      [0, 1],
      ["rgba(255,255,255,0.08)", iconColor]
    ),
    shadowOpacity: focusAnim.value * 0.4,
  }));

  return (
    <AnimatedView style={[premiumInputStyles.container, glowStyle, { shadowColor: iconColor }]}>
      <Ionicons name={icon} size={20} color={isFocused ? iconColor : Colors.dark.textMuted} style={premiumInputStyles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.3)"
        secureTextEntry={secureTextEntry && !showPassword}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={premiumInputStyles.input}
      />
      {showToggle && onToggle ? (
        <Pressable onPress={onToggle} style={premiumInputStyles.toggleButton}>
          <Ionicons 
            name={showPassword ? "eye-off" : "eye"} 
            size={20} 
            color={Colors.dark.textMuted} 
          />
        </Pressable>
      ) : null}
      {rightElement}
    </AnimatedView>
  );
}

const premiumInputStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
  },
  icon: {
    marginRight: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
    paddingVertical: 0,
    // @ts-ignore — web-only property to suppress focus outline
    outlineStyle: Platform.OS === 'web' ? 'none' : undefined,
  },
  toggleButton: {
    padding: 4,
    marginLeft: 8,
  },
});

interface RoleOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  color: string;
  onPress: () => void;
  compact?: boolean;
}

function RoleOption({ icon, title, color, onPress, compact = false }: RoleOptionProps) {
  const scale = useSharedValue(1);
  const glowAnim = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      glowAnim.value,
      [0, 1],
      ["rgba(255,255,255,0.06)", `${color}80`]
    ),
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
    glowAnim.value = withTiming(1, { duration: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    glowAnim.value = withTiming(0, { duration: 200 });
  };

  return (
    <AnimatedPressable
      style={[compact ? styles.roleOptionCompact : styles.roleOption, animatedStyle, glowStyle]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <View style={[styles.roleIconCompact, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={compact ? 22 : 24} color={color} />
      </View>
      <Text style={styles.roleTitleCompact} numberOfLines={1}>{title}</Text>
    </AnimatedPressable>
  );
}

function PremiumButton({ 
  onPress, 
  title, 
  isLoading = false,
  disabled = false,
  colors = [Colors.dark.primary, "#1FA030"] as const,
}: { 
  onPress: () => void; 
  title: string; 
  isLoading?: boolean;
  disabled?: boolean;
  colors?: readonly [string, string, ...string[]];
}) {
  const scale = useSharedValue(1);
  const glowAnim = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 + glowAnim.value * 0.4,
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
      glowAnim.value = withTiming(1, { duration: 150 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    glowAnim.value = withTiming(0, { duration: 200 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || isLoading}
      style={[
        premiumButtonStyles.container, 
        animatedStyle, 
        glowStyle,
        { shadowColor: colors[0] },
        disabled && { opacity: 0.6 }
      ]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={premiumButtonStyles.gradient}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={premiumButtonStyles.text}>{title}</Text>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const premiumButtonStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 8,
  },
  gradient: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});

function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const metCount = checks.filter((c) => c.met).length;
  const strength = metCount <= 1 ? "Weak" : metCount <= 3 ? "Fair" : metCount <= 4 ? "Good" : "Strong";
  const strengthColor = metCount <= 1 ? "#FF4444" : metCount <= 3 ? "#FFAA00" : metCount <= 4 ? "#00CCFF" : "#00FF88";
  const progress = metCount / checks.length;

  if (!password) return null;

  return (
    <View style={strengthStyles.container}>
      <View style={strengthStyles.barTrack}>
        <View style={[strengthStyles.barFill, { width: `${progress * 100}%`, backgroundColor: strengthColor }]} />
      </View>
      <Text style={[strengthStyles.label, { color: strengthColor }]}>{strength}</Text>
      <View style={strengthStyles.checkList}>
        {checks.map((check) => (
          <View key={check.label} style={strengthStyles.checkRow}>
            <Ionicons
              name={check.met ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={check.met ? "#00FF88" : "rgba(255,255,255,0.25)"}
            />
            <Text style={[strengthStyles.checkText, check.met && strengthStyles.checkTextMet]}>
              {check.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const strengthStyles = StyleSheet.create({
  container: { marginTop: 8, gap: 6 },
  barTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  checkList: { flexDirection: "row", flexWrap: "wrap", gap: 4, rowGap: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 4, width: "48%" },
  checkText: { fontSize: 11, color: "rgba(255,255,255,0.35)" },
  checkTextMet: { color: "rgba(255,255,255,0.7)" },
});

export default function LoginScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { login, loginWithApple, loginAsGuest, registerPlayer, refreshAuth } = useAuth();

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
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteData, setInviteData] = useState<{ academyName: string; email: string | null; role: string; isPlayerInvite?: boolean; playerId?: string; playerName?: string | null } | null>(null);
  const [inviteValidated, setInviteValidated] = useState(false);
  const [inviteFieldErrors, setInviteFieldErrors] = useState<{
    email?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
  }>({});

  // OTP verification state
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [isNewEmail, setIsNewEmail] = useState<boolean | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    error: string | null;
    suggestions: string[];
  }>({ checking: false, available: null, error: null, suggestions: [] });
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInviteRegisteringRef = useRef(false);

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [biometryType, setBiometryType] = useState<string | null>(null);

  const glowRingScale = useSharedValue(1);
  const glowRingOpacity = useSharedValue(0.5);

  const glowRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowRingScale.value }],
    opacity: glowRingOpacity.value,
  }));

  useEffect(() => {
    loadSavedAccounts();
    checkBiometrics();
    glowRingScale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    glowRingOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, []);

  const loadSavedAccounts = async () => {
    const accounts = await getSavedAccounts();
    setSavedAccounts(accounts);
  };

  const checkBiometrics = async () => {
    const { available, biometryType: type } = await checkBiometricSupport();
    if (available && type) {
      setBiometryType(type);
    }
  };

  const handleQuickLogin = (account: SavedAccount) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUsername(account.username);
  };

  const handleRemoveAccount = async (account: SavedAccount) => {
    const confirmed = Platform.OS === "web"
      ? window.confirm(`Remove ${account.displayName} from saved accounts?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Remove Account",
            `Remove ${account.displayName} from quick login?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Remove", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        });
    if (confirmed) {
      await removeAccount(account.username);
      loadSavedAccounts();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

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
    setInviteCode("");
    setInviteData(null);
    setInviteValidated(false);
    setInviteFieldErrors({});
    setUsernameStatus({ checking: false, available: null, error: null, suggestions: [] });
    // Reset OTP state
    setOtpCode("");
    setOtpSent(false);
    setOtpVerified(false);
    setIsNewEmail(null);
    setResendCooldown(0);
  };

  // Check if email is new and requires OTP
  const checkEmailStatus = async (emailValue: string) => {
    if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setIsNewEmail(null);
      return;
    }

    try {
      const response = await apiRequest("POST", "/auth/check-email", { email: emailValue });
      const data = await response.json();
      setIsNewEmail(data.isNewEmail);
      // Reset OTP state when email changes
      if (data.isNewEmail) {
        setOtpSent(false);
        setOtpVerified(false);
        setOtpCode("");
      }
    } catch (error) {
      logger.log("[Email Check] Error:", error);
      setIsNewEmail(null);
    }
  };

  // Send OTP to email
  const handleSendOTP = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    setOtpSending(true);
    try {
      const response = await apiRequest("POST", "/auth/otp/send", { email });
      const data = await response.json();
      
      if (data.success) {
        setOtpSent(true);
        setResendCooldown(60);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Code Sent", "A verification code has been sent to your email");
        
        // Start cooldown timer
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        Alert.alert("Error", data.error || "Failed to send verification code");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to send verification code. Please try again.");
    } finally {
      setOtpSending(false);
    }
  };

  // Verify OTP code
  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert("Error", "Please enter the 6-digit code");
      return;
    }

    setOtpSending(true);
    try {
      const response = await apiRequest("POST", "/auth/otp/verify", { email, code: otpCode });
      const data = await response.json();
      
      if (data.verified || data.success) {
        setOtpVerified(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Invalid Code", data.error || "The verification code is incorrect");
      }
    } catch (error: any) {
      let errorMessage = "Failed to verify code. Please try again.";
      try {
        const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ''));
        if (parsed.error) errorMessage = parsed.error;
      } catch {}
      Alert.alert("Error", errorMessage);
    } finally {
      setOtpSending(false);
    }
  };

  const checkUsernameAvailability = async (value: string) => {
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    const normalizedValue = value.toLowerCase().trim();
    
    if (normalizedValue.length < 3) {
      setUsernameStatus({ checking: false, available: null, error: null, suggestions: [] });
      return;
    }

    setUsernameStatus(prev => ({ ...prev, checking: true }));

    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await apiRequest("GET", `/auth/check-username/${normalizedValue}`);
        const data = await response.json();
        
        setUsernameStatus({
          checking: false,
          available: data.available,
          error: data.available ? null : data.error,
          suggestions: data.suggestions || [],
        });
      } catch (error) {
        setUsernameStatus({ checking: false, available: null, error: null, suggestions: [] });
      }
    }, 500);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if ((mode === "invite_code" && inviteValidated) || mode === "player_register") {
      checkUsernameAvailability(value);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setUsername(suggestion);
    setUsernameStatus({ checking: false, available: true, error: null, suggestions: [] });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLogin = async () => {
    logger.log("[Login] handleLogin called, username:", username, "hasPassword:", !!password);
    if (!username || !password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const normalizedUsername = username.toLowerCase();
      logger.log("[Login] Attempting login for:", normalizedUsername);
      const result = await login(normalizedUsername, password);
      logger.log("[Login] Login result:", { success: result.success, hasUser: !!result.user, error: result.error });
      if (result.success && result.user) {
        await saveAccount(
          normalizedUsername,
          result.user.displayName || normalizedUsername,
          result.user.role as "coach" | "player" | "owner" | "parent",
          result.user.profilePhotoUrl || undefined
        );
        loadSavedAccounts();
      } else if (!result.success) {
        const errorMsg = result.error || t("auth.invalidCredentials");
        logger.log("[Login] Login failed:", errorMsg);
        Alert.alert(t("common.error"), errorMsg);
      }
    } catch (error: any) {
      console.error("[Login] Login exception:", error);
      const msg = error?.message || "Something went wrong. Please try again.";
      Alert.alert("Login Failed", `Could not connect to the server.\n\n${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken || !credential.user) {
        Alert.alert(t("common.error"), "Apple Sign-In did not return required information.");
        return;
      }

      setIsSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const result = await loginWithApple(credential.identityToken, credential.user);

      if (result.success && result.user) {
        await saveAccount(
          result.user.username || "apple_user",
          result.user.displayName || "Apple User",
          result.user.role as "coach" | "player" | "owner" | "parent",
          result.user.profilePhotoUrl || undefined
        );
        loadSavedAccounts();
      } else if (result.code === "APPLE_NOT_LINKED") {
        Alert.alert(
          "Apple ID Not Linked",
          "No account is linked to this Apple ID. Please log in with your username and password first, then link your Apple ID in Settings.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(t("common.error"), result.error || "Apple Sign-In failed");
      }
    } catch (error: any) {
      if (error.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      console.error("Apple Sign-In error:", error);
      Alert.alert(t("common.error"), "Apple Sign-In failed. Please try again.");
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

    // Check if this is a new email and OTP is required
    if (isNewEmail && !otpVerified) {
      Alert.alert("Verification Required", "Please verify your email first by entering the code sent to your inbox");
      return;
    }

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

    const fullPhone = `${countryCode.dial}${phone.trim().replace(/\s/g, '')}`;

    try {
      const result = await registerPlayer({
        username: normalizedUsername,
        firstName,
        lastName,
        email,
        password,
        phone: fullPhone,
        otpCode: isNewEmail ? otpCode : undefined,
      });
      if (!result.success) {
        // Check if OTP is required
        if (result.error?.includes("verification required") || result.requiresOTP) {
          setIsNewEmail(true);
          const message = result.error && !result.error.toLowerCase().includes("verification required")
            ? result.error
            : "Please verify your email to complete registration";
          Alert.alert("Verification Required", message);
        } else {
          Alert.alert("Registration Failed", result.error || "Please try again");
        }
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

  const handleValidateInvite = async () => {
    if (!inviteCode.trim()) {
      Alert.alert("Error", "Please enter an invite code");
      return;
    }

    const code = inviteCode.trim().toUpperCase();

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await apiRequest("GET", `/auth/invite/${code}`);
      const data = await response.json();
      
      if (data.valid) {
        setInviteData({
          academyName: data.academyName,
          email: data.email,
          role: data.role,
          isPlayerInvite: data.isPlayerInvite || false,
          playerId: data.playerId,
          playerName: data.playerName,
        });
        setEmail(data.email || "");
        setInviteValidated(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Invalid Code", data.error || "This invite code is not valid or has expired");
      }
    } catch (error: any) {
      let errorMessage = "Could not validate invite code. Please try again.";
      
      if (error.message) {
        const match = error.message.match(/^\d+:\s*(.+)/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            errorMessage = parsed.error || errorMessage;
          } catch {
            errorMessage = match[1];
          }
        }
      }
      
      Alert.alert("Invalid Invite", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteRegister = async () => {
    if (isSubmitting || isInviteRegisteringRef.current) return;
    isInviteRegisteringRef.current = true;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedUsername = username.toLowerCase();
    const fieldErrors: typeof inviteFieldErrors = {};

    if (!email) fieldErrors.email = "Email is required";
    else if (!emailRegex.test(email)) fieldErrors.email = "Enter a valid email address";

    if (!username) fieldErrors.username = "Username is required";
    else if (normalizedUsername.length < 3) fieldErrors.username = "At least 3 characters";
    else if (!/^[a-z0-9_]+$/.test(normalizedUsername)) fieldErrors.username = "Letters, numbers, underscores only";

    if (!firstName) fieldErrors.firstName = "First name is required";
    if (!lastName) fieldErrors.lastName = "Last name is required";

    if (!password) fieldErrors.password = "Password is required";
    else if (password.length < 8) fieldErrors.password = "At least 8 characters";

    if (Object.keys(fieldErrors).length > 0) {
      setInviteFieldErrors(fieldErrors);
      isInviteRegisteringRef.current = false;
      return;
    }

    setInviteFieldErrors({});
    const code = inviteCode.trim().toUpperCase();

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Use different endpoint for player invites
      const endpoint = inviteData?.isPlayerInvite 
        ? "/auth/register/player-invite"
        : "/auth/register/invite";
      
      const response = await apiRequest("POST", endpoint, {
        token: code,
        username: normalizedUsername,
        email: email.toLowerCase().trim(),
        firstName,
        lastName,
        password,
        phone: phone ? `${countryCode.dial}${phone.trim().replace(/\s/g, '')}` : undefined,
        playerId: inviteData?.playerId,
      });
      const data = await response.json();
      
      if (data.token && data.user) {
        // Auto-login: save the token and user, then refresh auth to navigate to app
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetForm();
        
        // Save auth state and immediately log in
        setAuthToken(data.token);
        await saveAuthState(data.token, {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          role: data.user.role,
          academyId: data.user.academyId || null,
          coachId: data.user.coachId || null,
          playerId: data.user.playerId || null,
        }, data.refreshToken);
        
        // Trigger app navigation by refreshing auth
        await refreshAuth();
      } else if (data.user || data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetForm();
        const message = data.message || (inviteData?.isPlayerInvite
          ? `Your player account has been created successfully. You can now sign in with username "${normalizedUsername}".`
          : `Your account has been created successfully! You can now sign in with username "${normalizedUsername}".`);
        Alert.alert(
          "Welcome to the team!",
          message,
          [{ text: t("auth.loginButton"), onPress: () => handleModeChange("login") }]
        );
      } else {
        Alert.alert("Registration Failed", data.error || "Please try again");
      }
    } catch (error: any) {
      logger.log("[InviteRegister] Error:", error.message);
      let errorMessage = "Something went wrong. Please try again.";
      if (error.message) {
        try {
          const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ''));
          if (parsed.error) {
            errorMessage = parsed.error;
          }
        } catch {
          if (error.message.includes("Username already taken")) {
            errorMessage = "Username already taken. Please choose a different one.";
          } else if (error.message.includes("Invalid invite")) {
            errorMessage = "This invite code is not valid or has expired.";
          } else if (error.message.includes("Missing required")) {
            errorMessage = "Please fill in all required fields.";
          }
        }
      }
      Alert.alert("Error", errorMessage);
    } finally {
      setIsSubmitting(false);
      isInviteRegisteringRef.current = false;
    }
  };

  const handleModeChange = (newMode: AuthMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
    resetForm();
    setApplicationSubmitted(false);
  };

  const getRoleIcon = (role: string): keyof typeof Ionicons.glyphMap => {
    switch (role) {
      case "coach": return "tennisball";
      case "player": return "person";
      case "owner": return "business";
      case "parent": return "people";
      default: return "person";
    }
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case "coach": return Colors.dark.primary;
      case "player": return Colors.dark.xpCyan;
      case "owner": return Colors.dark.gold;
      case "parent": return "#9B59B6";
      default: return Colors.dark.textMuted;
    }
  };

  const renderSavedAccounts = () => {
    if (savedAccounts.length === 0) return null;

    return (
      <View style={styles.savedAccountsSection}>
        <Text style={styles.savedAccountsTitle}>{t("auth.savedAccounts")}</Text>
        <Text style={styles.savedAccountsHint}>
          Tap to select
        </Text>
        <View style={styles.savedAccountsList}>
          {savedAccounts.map((account) => (
            <View key={account.username} style={{ position: "relative" }}>
              <Pressable
                style={[
                  styles.savedAccountItem,
                  username === account.username && styles.savedAccountItemSelected,
                ]}
                onPress={() => handleQuickLogin(account)}
              >
                <View style={[styles.savedAccountAvatar, { borderColor: getRoleColor(account.role) }]}>
                  {account.avatarUrl ? (
                    <Image 
                      source={{ uri: account.avatarUrl }} 
                      style={styles.savedAccountPhoto}
                    />
                  ) : (
                    <Ionicons 
                      name={getRoleIcon(account.role)} 
                      size={20} 
                      color={getRoleColor(account.role)} 
                    />
                  )}
                </View>
                <Text style={styles.savedAccountName} numberOfLines={1}>
                  {account.displayName}
                </Text>
                <Text style={styles.savedAccountRole}>{account.role}</Text>
              </Pressable>
              <Pressable
                style={styles.savedAccountDeleteButton}
                onPress={() => handleRemoveAccount(account)}
                hitSlop={6}
              >
                <Ionicons name="close" size={12} color={Colors.dark.text} />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.savedAccountsDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("auth.switchAccount")}</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>
    );
  };

  const renderLoginForm = () => (
    <>
      {renderSavedAccounts()}
      
      <View style={styles.inputsContainer}>
        <PremiumInput
          value={username}
          onChangeText={setUsername}
          placeholder={t("auth.usernamePlaceholder")}
          icon="person-outline"
          iconColor={Colors.dark.primary}
          autoComplete="username"
        />

        <PremiumInput
          value={password}
          onChangeText={setPassword}
          placeholder={t("auth.passwordPlaceholder")}
          icon="lock-closed-outline"
          iconColor={Colors.dark.primary}
          secureTextEntry
          showToggle
          onToggle={() => setShowPassword(!showPassword)}
          showPassword={showPassword}
          autoComplete="password"
        />
      </View>

      <PremiumButton
        onPress={handleLogin}
        title={t("auth.loginButton")}
        isLoading={isSubmitting}
        disabled={isSubmitting}
      />

      {Platform.OS === "ios" ? (
        <View style={styles.appleSignInContainer}>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
            <View style={styles.dividerLine} />
          </View>
          <View style={styles.appleButtonWrapper}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t("auth.noAccount")}</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.roleGrid}>
        <View style={styles.roleRow}>
          <RoleOption
            icon="person"
            title={t("auth.rolePlayer")}
            color={Colors.dark.xpCyan}
            onPress={() => handleModeChange("player_register")}
            compact
          />
          <RoleOption
            icon="tennisball"
            title={t("auth.roleCoach")}
            color={Colors.dark.primary}
            onPress={() => handleModeChange("coach_info")}
            compact
          />
        </View>
        <View style={styles.roleRow}>
          <RoleOption
            icon="business"
            title={t("auth.roleAdmin")}
            color={Colors.dark.gold}
            onPress={() => handleModeChange("academy_apply")}
            compact
          />
          <RoleOption
            icon="key"
            title={t("auth.enterPin")}
            color="#9B59B6"
            onPress={() => handleModeChange("invite_code")}
            compact
          />
        </View>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.guestButton, { opacity: pressed ? 0.8 : 1 }]}
        onPress={async () => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          try {
            await loginAsGuest();
          } finally {
            setIsSubmitting(false);
          }
        }}
        disabled={isSubmitting}
      >
        <Ionicons name="eye-outline" size={18} color={Colors.dark.textSecondary} />
        <Text style={styles.guestButtonText}>Explore as Guest</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
      </Pressable>
    </>
  );

  const renderPlayerRegister = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.formTitle}>{t("auth.registerTitle")}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("auth.usernameLabel")}</Text>
        <View style={styles.glassInput}>
          <Ionicons name="at-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={username}
            onChangeText={handleUsernameChange}
            placeholder={t("auth.usernamePlaceholder")}
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="none"
            autoComplete="username"
            style={[styles.input, styles.usernameInput]}
          />
          {usernameStatus.checking ? (
            <View style={styles.usernameStatusIcon}>
              <ActivityIndicator size="small" color={Colors.dark.textMuted} />
            </View>
          ) : usernameStatus.available === true ? (
            <View style={styles.usernameStatusIcon}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
            </View>
          ) : usernameStatus.available === false ? (
            <View style={styles.usernameStatusIcon}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
            </View>
          ) : null}
        </View>
        {usernameStatus.error ? (
          <Text style={styles.usernameError}>{usernameStatus.error}</Text>
        ) : (
          <Text style={styles.hintText}>Letters, numbers, and underscores only</Text>
        )}
        {usernameStatus.suggestions.length > 0 ? (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsLabel}>Try these instead:</Text>
            <View style={styles.suggestionsRow}>
              {usernameStatus.suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => selectSuggestion(suggestion)}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>FIRST NAME</Text>
          <View style={styles.glassInput}>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="words"
              style={styles.input}
            />
          </View>
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>LAST NAME</Text>
          <View style={styles.glassInput}>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="words"
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>EMAIL</Text>
        <View style={styles.glassInput}>
          <Ionicons name="mail-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              // Reset OTP state when email changes
              setOtpSent(false);
              setOtpVerified(false);
              setOtpCode("");
              // Check if email is new after a delay
              if (text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
                checkEmailStatus(text);
              }
            }}
            placeholder="Enter your email"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
          {otpVerified ? (
            <View style={styles.usernameStatusIcon}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
            </View>
          ) : null}
        </View>
        {isNewEmail && !otpVerified ? (
          <Text style={styles.hintText}>New email - verification required</Text>
        ) : null}
      </View>

      {isNewEmail && !otpVerified ? (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>EMAIL VERIFICATION</Text>
          {!otpSent ? (
            <Pressable
              style={[styles.sendOtpButton, otpSending && styles.sendOtpButtonDisabled]}
              onPress={handleSendOTP}
              disabled={otpSending}
            >
              {otpSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                  <Text style={styles.sendOtpButtonText}>Send Verification Code</Text>
                </>
              )}
            </Pressable>
          ) : (
            <>
              <View style={styles.glassInput}>
                <Ionicons name="key-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
                <TextInput
                  value={otpCode}
                  onChangeText={(text) => setOtpCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.verifyOtpButton, (otpSending || otpCode.length !== 6) && styles.verifyOtpButtonDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={otpSending || otpCode.length !== 6}
                >
                  {otpSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.verifyOtpButtonText}>Verify</Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.otpActionsRow}>
                <Text style={styles.hintText}>Check your inbox for the code</Text>
                {resendCooldown > 0 ? (
                  <Text style={styles.resendCooldownText}>Resend in {resendCooldown}s</Text>
                ) : (
                  <Pressable onPress={handleSendOTP} disabled={otpSending}>
                    <Text style={styles.resendLink}>Resend Code</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>PHONE (FOR WHATSAPP)</Text>
        <View style={styles.phoneRow}>
          <CountryCodePicker
            selectedCountry={countryCode}
            onSelect={setCountryCode}
          />
          <View style={[styles.glassInput, styles.phoneInput]}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("auth.passwordLabel")}</Text>
        <View style={styles.glassInput}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t("auth.passwordPlaceholder")}
            placeholderTextColor={Colors.dark.textMuted}
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
        <PasswordStrengthIndicator password={password} />
      </View>

      <PremiumButton
        onPress={handlePlayerRegister}
        title={t("auth.registerButton")}
        isLoading={isSubmitting}
        disabled={isSubmitting}
        colors={[Colors.dark.xpCyan, "#00A8CC"]}
      />

      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        style={styles.inviteButton}
        onPress={() => handleModeChange("invite_code")}
      >
        <Ionicons name="key" size={18} color="#9B59B6" />
        <Text style={styles.inviteButtonText}>{t("auth.addAccount")}</Text>
      </Pressable>
    </>
  );

  const renderCoachInfo = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.formTitle}>JOIN AS COACH</Text>
      </View>

      <View style={styles.glassCard}>
        <LinearGradient
          colors={[`${Colors.dark.primary}20`, "transparent"]}
          style={styles.cardGradientOverlay}
        />
        <View style={styles.infoIconContainer}>
          <Ionicons name="tennisball" size={40} color={Colors.dark.primary} />
        </View>
        <Text style={styles.infoTitle}>How to Join as Coach</Text>
        <Text style={styles.infoText}>
          Coaches are invited by their academy. Ask your academy owner to send you an invite code.
        </Text>
      </View>

      <PremiumButton
        onPress={() => handleModeChange("invite_code")}
        title="I HAVE AN INVITE"
        colors={[Colors.dark.primary, "#1FA030"]}
      />

      <Pressable
        style={styles.secondaryButton}
        onPress={() => handleModeChange("login")}
      >
        <Text style={styles.secondaryButtonText}>{t("common.logIn")}</Text>
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
            <Text style={styles.formTitle}>APPLICATION SENT</Text>
          </View>

          <View style={styles.glassCard}>
            <LinearGradient
              colors={[`${Colors.dark.successNeon}20`, "transparent"]}
              style={styles.cardGradientOverlay}
            />
            <View style={[styles.infoIconContainer, { backgroundColor: `${Colors.dark.successNeon}20` }]}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.dark.successNeon} />
            </View>
            <Text style={[styles.infoTitle, { color: Colors.dark.successNeon }]}>Application Submitted!</Text>
            <Text style={styles.infoText}>
              Thank you for your interest. We'll review your application and get back to you via email within 48 hours.
            </Text>
          </View>

          <PremiumButton
            onPress={() => handleModeChange("login")}
            title="BACK TO LOGIN"
          />
        </>
      );
    }

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.formTitle}>ACADEMY APPLICATION</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>ACADEMY NAME</Text>
          <View style={styles.glassInput}>
            <Ionicons name="business-outline" size={18} color={Colors.dark.gold} style={styles.inputIcon} />
            <TextInput
              value={academyName}
              onChangeText={setAcademyName}
              placeholder="Your academy name"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>COUNTRY</Text>
          <View style={styles.glassInput}>
            <Ionicons name="globe-outline" size={18} color={Colors.dark.gold} style={styles.inputIcon} />
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>CONTACT PERSON</Text>
          <View style={styles.glassInput}>
            <Ionicons name="person-outline" size={18} color={Colors.dark.gold} style={styles.inputIcon} />
            <TextInput
              value={contactPerson}
              onChangeText={setContactPerson}
              placeholder="Your full name"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>EMAIL</Text>
          <View style={styles.glassInput}>
            <Ionicons name="mail-outline" size={18} color={Colors.dark.gold} style={styles.inputIcon} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Contact email"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PHONE (OPTIONAL)</Text>
          <View style={styles.glassInput}>
            <Ionicons name="call-outline" size={18} color={Colors.dark.gold} style={styles.inputIcon} />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Contact phone"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>TELL US ABOUT YOUR ACADEMY</Text>
          <View style={[styles.glassInput, styles.textAreaWrapper]}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Number of courts, coaches, players..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={4}
              style={[styles.input, styles.textArea]}
            />
          </View>
        </View>

        <PremiumButton
          onPress={handleAcademyApply}
          title="SUBMIT APPLICATION"
          isLoading={isSubmitting}
          disabled={isSubmitting}
          colors={[Colors.dark.gold, "#CC9900"]}
        />
      </>
    );
  };

  const renderInviteCode = () => {
    if (inviteValidated && inviteData) {
      return (
        <React.Fragment key="invite-registration">
          <View style={styles.formHeader}>
            <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
              <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.formTitle}>CREATE YOUR ACCOUNT</Text>
          </View>

          <View style={styles.glassCard}>
            <LinearGradient
              colors={[`${"#9B59B6"}20`, "transparent"]}
              style={styles.cardGradientOverlay}
            />
            <View style={[styles.infoIconContainer, { backgroundColor: "#9B59B620" }]}>
              <Ionicons name="checkmark-circle" size={32} color="#9B59B6" />
            </View>
            <Text style={[styles.infoTitle, { color: "#9B59B6" }]}>Invite Verified!</Text>
            <Text style={styles.infoText}>
              {inviteData.isPlayerInvite 
                ? `You're claiming the player profile "${inviteData.playerName}" at ${inviteData.academyName}`
                : `You're joining ${inviteData.academyName} as ${inviteData.role === "academy_owner" ? "Academy Owner" : inviteData.role}`
              }
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("common.email")}</Text>
            <View style={[styles.glassInput, inviteFieldErrors.email ? { borderColor: Colors.dark.error, borderWidth: 1 } : undefined]}>
              <Ionicons name="mail-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (inviteFieldErrors.email) setInviteFieldErrors(prev => ({ ...prev, email: undefined }));
                }}
                editable={true}
                placeholder="Enter your email"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
              />
            </View>
            {inviteFieldErrors.email ? (
              <Text style={styles.usernameError}>{inviteFieldErrors.email}</Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.usernameLabel")}</Text>
            <View style={[styles.glassInput, inviteFieldErrors.username ? { borderColor: Colors.dark.error, borderWidth: 1 } : undefined]}>
              <Ionicons name="at-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
              <TextInput
                value={username}
                onChangeText={(text) => {
                  handleUsernameChange(text);
                  if (inviteFieldErrors.username) setInviteFieldErrors(prev => ({ ...prev, username: undefined }));
                }}
                placeholder={t("auth.usernamePlaceholder")}
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                style={[styles.input, styles.usernameInput]}
              />
              {usernameStatus.checking ? (
                <View style={styles.usernameStatusIcon}>
                  <ActivityIndicator size="small" color={Colors.dark.textMuted} />
                </View>
              ) : usernameStatus.available === true ? (
                <View style={styles.usernameStatusIcon}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
                </View>
              ) : usernameStatus.available === false ? (
                <View style={styles.usernameStatusIcon}>
                  <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
                </View>
              ) : null}
            </View>
            {inviteFieldErrors.username ? (
              <Text style={styles.usernameError}>{inviteFieldErrors.username}</Text>
            ) : usernameStatus.error ? (
              <Text style={styles.usernameError}>{usernameStatus.error}</Text>
            ) : null}
            {usernameStatus.suggestions.length > 0 ? (
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsLabel}>Try these instead:</Text>
                <View style={styles.suggestionsRow}>
                  {usernameStatus.suggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      style={styles.suggestionChip}
                      onPress={() => selectSuggestion(suggestion)}
                    >
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>FIRST NAME</Text>
              <View style={[styles.glassInput, inviteFieldErrors.firstName ? { borderColor: Colors.dark.error, borderWidth: 1 } : undefined]}>
                <TextInput
                  value={firstName}
                  onChangeText={(text) => {
                    setFirstName(text);
                    if (inviteFieldErrors.firstName) setInviteFieldErrors(prev => ({ ...prev, firstName: undefined }));
                  }}
                  placeholder="First name"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>
              {inviteFieldErrors.firstName ? (
                <Text style={styles.usernameError}>{inviteFieldErrors.firstName}</Text>
              ) : null}
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>LAST NAME</Text>
              <View style={[styles.glassInput, inviteFieldErrors.lastName ? { borderColor: Colors.dark.error, borderWidth: 1 } : undefined]}>
                <TextInput
                  value={lastName}
                  onChangeText={(text) => {
                    setLastName(text);
                    if (inviteFieldErrors.lastName) setInviteFieldErrors(prev => ({ ...prev, lastName: undefined }));
                  }}
                  placeholder="Last name"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>
              {inviteFieldErrors.lastName ? (
                <Text style={styles.usernameError}>{inviteFieldErrors.lastName}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PHONE (OPTIONAL)</Text>
            <View style={styles.phoneRow}>
              <CountryCodePicker
                selectedCountry={countryCode}
                onSelect={setCountryCode}
              />
              <View style={[styles.glassInput, styles.phoneInput]}>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.passwordLabel")}</Text>
            <View style={[styles.glassInput, inviteFieldErrors.password ? { borderColor: Colors.dark.error, borderWidth: 1 } : undefined]}>
              <Ionicons name="lock-closed-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (inviteFieldErrors.password) setInviteFieldErrors(prev => ({ ...prev, password: undefined }));
                }}
                placeholder={t("auth.passwordPlaceholder")}
                placeholderTextColor={Colors.dark.textMuted}
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
            {inviteFieldErrors.password ? (
              <Text style={styles.usernameError}>{inviteFieldErrors.password}</Text>
            ) : null}
            <PasswordStrengthIndicator password={password} />
          </View>

          <PremiumButton
            onPress={handleInviteRegister}
            title={t("auth.registerButton")}
            isLoading={isSubmitting}
            disabled={isSubmitting}
            colors={["#9B59B6", "#8E44AD"]}
          />
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key="invite-code-entry">
        <View style={styles.formHeader}>
          <Pressable style={styles.backButton} onPress={() => handleModeChange("login")}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.formTitle}>ENTER INVITE CODE</Text>
        </View>

        <View style={styles.glassCard}>
          <LinearGradient
            colors={[`${"#9B59B6"}20`, "transparent"]}
            style={styles.cardGradientOverlay}
          />
          <View style={[styles.infoIconContainer, { backgroundColor: "#9B59B620" }]}>
            <Ionicons name="key" size={32} color="#9B59B6" />
          </View>
          <Text style={styles.infoTitle}>Join with Invite Code</Text>
          <Text style={styles.infoText}>
            Enter the 6-character invite code you received from your coach or academy.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>INVITE CODE</Text>
          <View style={styles.glassInput}>
            <Ionicons name="key-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
            <TextInput
              value={inviteCode}
              onChangeText={(text) => setInviteCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="Enter your 6-character invite code"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              style={styles.input}
            />
          </View>
        </View>

        <PremiumButton
          onPress={handleValidateInvite}
          title="VALIDATE CODE"
          isLoading={isSubmitting}
          disabled={isSubmitting}
          colors={["#9B59B6", "#8E44AD"]}
        />

        <Pressable
          style={styles.secondaryButton}
          onPress={() => handleModeChange("login")}
        >
          <Text style={styles.secondaryButtonText}>{t("common.logIn")}</Text>
        </Pressable>
      </React.Fragment>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#080C10", "#0A1015", "#080C10"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <Pressable
        style={[styles.languageButton, { top: insets.top + 12 }]}
        onPress={() => setShowLanguageModal(true)}
        hitSlop={8}
      >
        <Ionicons name="globe-outline" size={22} color={Colors.dark.textSecondary} />
      </Pressable>

      <LanguageSelectorModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        {mode === "login" ? (
          <View style={styles.loginHero}>
            <LinearGradient
              colors={["rgba(200,255,61,0.10)", "rgba(200,255,61,0.03)", "rgba(0,0,0,0)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.courtDecorLine, styles.courtDecorH1]} />
            <View style={[styles.courtDecorLine, styles.courtDecorH2]} />
            <View style={styles.courtDecorV} />
            <View style={styles.courtDecorCenter} />

            <View style={styles.heroLogoOuter}>
              <Animated.View style={[styles.heroGlowRing, glowRingStyle]} />
              <Image
                source={require("../../../assets/images/logo.png")}
                style={styles.heroLogoImg}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.heroHeadline}>STEP ONTO THE COURT</Text>

            <View style={styles.heroTaglineRow}>
              <View style={styles.heroAccentLine} />
              <Text style={styles.heroSubtitle}>Play. Improve. Glow.</Text>
              <View style={styles.heroAccentLine} />
            </View>
          </View>
        ) : null}

        <View style={styles.form}>
          {mode === "login" ? renderLoginForm() : null}
          {mode === "player_register" ? renderPlayerRegister() : null}
          {mode === "coach_info" ? renderCoachInfo() : null}
          {mode === "academy_apply" ? renderAcademyApply() : null}
          {mode === "invite_code" ? renderInviteCode() : null}
        </View>

        {mode !== "login" ? (
          <Pressable style={styles.toggleButton} onPress={() => handleModeChange("login")}>
            <Text style={styles.toggleText}>{t("auth.hasAccount")} {t("auth.signInLink")}</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  languageButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  loginHero: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    marginBottom: Spacing.lg,
    marginHorizontal: -Spacing.lg,
    overflow: "hidden",
    minHeight: 260,
    position: "relative",
  },
  courtDecorLine: {
    position: "absolute",
    backgroundColor: "rgba(200, 255, 61, 0.07)",
  },
  courtDecorH1: {
    left: 0,
    right: 0,
    height: 1,
    top: "30%",
  },
  courtDecorH2: {
    left: 0,
    right: 0,
    height: 1,
    top: "70%",
  },
  courtDecorV: {
    top: 0,
    bottom: 0,
    width: 1,
    left: "50%",
    backgroundColor: "rgba(200, 255, 61, 0.07)",
  },
  courtDecorCenter: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.10)",
    left: "50%",
    top: "50%",
    marginLeft: -30,
    marginTop: -30,
  },
  heroLogoOuter: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  heroGlowRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: GlowColors.primary,
    backgroundColor: "rgba(200, 255, 61, 0.05)",
  },
  heroLogoImg: {
    width: 180,
    height: 80,
  },
  heroHeadline: {
    fontSize: 14,
    fontWeight: "900",
    color: GlowColors.primary,
    letterSpacing: 3.5,
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  heroTaglineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.xl,
    width: "100%",
  },
  heroAccentLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#C8FF3D",
    opacity: 0.3,
  },
  heroSubtitle: {
    fontSize: 12,
    color: "#B8BCC6",
    letterSpacing: 1.5,
    fontWeight: "500",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLogo: {
    width: 200,
    height: 100,
    marginBottom: Spacing.sm,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 4,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400",
    color: Colors.dark.textMuted,
  },
  inputsContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  roleGrid: {
    gap: Spacing.sm,
  },
  roleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  roleOptionCompact: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: Spacing.xs,
  },
  roleIconCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitleCompact: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
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
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  formTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    letterSpacing: 1,
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
    letterSpacing: 1,
  },
  glassInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(13, 24, 32, 0.8)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md + 4,
    color: Colors.dark.text,
    fontSize: 16,
    // @ts-ignore — web-only property to suppress focus outline
    outlineStyle: Platform.OS === 'web' ? 'none' : undefined,
  },
  usernameInput: {
    paddingRight: 40,
  },
  usernameStatusIcon: {
    position: "absolute" as const,
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center" as const,
  },
  usernameError: {
    ...Typography.caption,
    color: Colors.dark.error,
    marginTop: 4,
  },
  suggestionsContainer: {
    marginTop: Spacing.sm,
  },
  suggestionsLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  suggestionsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: `${Colors.dark.primary}20`,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  suggestionText: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  textAreaWrapper: {
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.sm,
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
  gamingButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginTop: Spacing.lg,
  },
  gamingButtonGradient: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  gamingButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.xl,
    gap: Spacing.md,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: `${Colors.dark.primary}30`,
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
    padding: Spacing.lg,
    backgroundColor: "rgba(13, 24, 32, 0.6)",
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  roleIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  roleContent: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  roleDescription: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  glassCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  cardGradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  infoIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${Colors.dark.primary}15`,
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
  hintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
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
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(155, 89, 182, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(155, 89, 182, 0.3)",
    gap: Spacing.sm,
  },
  inviteButtonText: {
    ...Typography.body,
    color: "#9B59B6",
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
  savedAccountsSection: {
    marginBottom: Spacing.sm,
  },
  savedAccountsTitle: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
    letterSpacing: 1,
  },
  savedAccountsHint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  savedAccountsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  savedAccountItem: {
    alignItems: "center",
    width: 72,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  savedAccountItemSelected: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: GlowColors.primary,
  },
  savedAccountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Backgrounds.card,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
    overflow: "hidden",
  },
  savedAccountPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  savedAccountName: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  savedAccountRole: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
    textTransform: "capitalize",
  },
  savedAccountDeleteButton: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 60, 60, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  savedAccountsDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  sendOtpButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  sendOtpButtonDisabled: {
    opacity: 0.6,
  },
  sendOtpButtonText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "600",
  },
  verifyOtpButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginLeft: Spacing.sm,
  },
  verifyOtpButtonDisabled: {
    opacity: 0.6,
  },
  verifyOtpButtonText: {
    ...Typography.small,
    color: "#fff",
    fontWeight: "700",
  },
  otpActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  resendCooldownText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  resendLink: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  appleSignInContainer: {
    marginTop: Spacing.md,
  },
  appleButtonWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  appleButton: {
    width: "100%",
    height: 50,
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: Spacing.md,
  },
  guestButtonText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
    flex: 1,
    textAlign: "center",
  },
});
