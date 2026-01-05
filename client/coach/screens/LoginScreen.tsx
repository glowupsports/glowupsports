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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
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

interface RoleOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
  onPress: () => void;
}

function RoleOption({ icon, title, description, color, onPress }: RoleOptionProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      style={[styles.roleOption, animatedStyle]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <View style={[styles.roleIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.roleContent}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </AnimatedPressable>
  );
}

function GamingButton({ 
  onPress, 
  title, 
  isLoading = false,
  disabled = false,
  colors = [Colors.dark.primary, "#1FA030"],
}: { 
  onPress: () => void; 
  title: string; 
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
      style={[styles.gamingButton, animatedStyle, disabled && { opacity: 0.6 }]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gamingButtonGradient}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.dark.text} />
        ) : (
          <Text style={styles.gamingButtonText}>{title}</Text>
        )}
      </LinearGradient>
    </AnimatedPressable>
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
  const [inviteCode, setInviteCode] = useState("");
  const [inviteData, setInviteData] = useState<{ academyName: string; email: string | null; role: string } | null>(null);
  const [inviteValidated, setInviteValidated] = useState(false);

  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    error: string | null;
    suggestions: string[];
  }>({ checking: false, available: null, error: null, suggestions: [] });
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const isInviteRegisteringRef = useRef(false);

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [biometryType, setBiometryType] = useState<string | null>(null);

  useEffect(() => {
    loadSavedAccounts();
    checkBiometrics();
    
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

  const handleRemoveAccount = (account: SavedAccount) => {
    Alert.alert(
      "Remove Account",
      `Remove ${account.displayName} from quick login?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeAccount(account.username);
            loadSavedAccounts();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
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
    setUsernameStatus({ checking: false, available: null, error: null, suggestions: [] });
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
    if (!username || !password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const normalizedUsername = username.toLowerCase();
      const result = await login(normalizedUsername, password);
      if (result.success && result.user) {
        await saveAccount(
          normalizedUsername,
          normalizedUsername,
          result.user.role as "coach" | "player" | "owner" | "parent"
        );
        loadSavedAccounts();
      } else if (!result.success) {
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

  const handleValidateInvite = async () => {
    if (!inviteCode.trim()) {
      Alert.alert("Error", "Please enter an invite code");
      return;
    }

    const code = inviteCode.trim().split("/").pop() || inviteCode.trim();

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
    
    if (!username || !firstName || !lastName || !password || !email) {
      Alert.alert("Error", "Please fill in all required fields");
      isInviteRegisteringRef.current = false;
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      isInviteRegisteringRef.current = false;
      return;
    }

    const normalizedUsername = username.toLowerCase();

    if (normalizedUsername.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters");
      isInviteRegisteringRef.current = false;
      return;
    }

    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      Alert.alert("Error", "Username can only contain letters, numbers, and underscores");
      isInviteRegisteringRef.current = false;
      return;
    }

    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      isInviteRegisteringRef.current = false;
      return;
    }

    const code = inviteCode.trim().split("/").pop() || inviteCode.trim();

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await apiRequest("POST", "/auth/register/invite", {
        token: code,
        username: normalizedUsername,
        email: email.toLowerCase().trim(),
        firstName,
        lastName,
        password,
        phone: phone ? `${countryCode.dial}${phone.trim().replace(/\s/g, '')}` : undefined,
      });
      const data = await response.json();
      
      if (data.token || data.user) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetForm();
        Alert.alert(
          "Welcome to the team!",
          `Your account has been created successfully. You can now sign in with username "${normalizedUsername}".`,
          [{ text: "Sign In", onPress: () => handleModeChange("login") }]
        );
      } else {
        Alert.alert("Registration Failed", data.error || "Please try again");
      }
    } catch (error: any) {
      console.log("[InviteRegister] Error:", error.message);
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
            errorMessage = "This invite link is invalid or has expired.";
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
        <Text style={styles.savedAccountsTitle}>QUICK LOGIN</Text>
        <Text style={styles.savedAccountsHint}>
          Tap to select, hold to remove
        </Text>
        <View style={styles.savedAccountsList}>
          {savedAccounts.map((account) => (
            <Pressable
              key={account.username}
              style={[
                styles.savedAccountItem,
                username === account.username && styles.savedAccountItemSelected,
              ]}
              onPress={() => handleQuickLogin(account)}
              onLongPress={() => handleRemoveAccount(account)}
            >
              <View style={[styles.savedAccountAvatar, { borderColor: getRoleColor(account.role) }]}>
                <Ionicons 
                  name={getRoleIcon(account.role)} 
                  size={20} 
                  color={getRoleColor(account.role)} 
                />
              </View>
              <Text style={styles.savedAccountName} numberOfLines={1}>
                {account.displayName}
              </Text>
              <Text style={styles.savedAccountRole}>{account.role}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.savedAccountsDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or enter manually</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>
    );
  };

  const renderLoginForm = () => (
    <>
      {renderSavedAccounts()}
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>USERNAME</Text>
        <View style={styles.glassInput}>
          <Ionicons name="person-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your username"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="none"
            autoComplete="username"
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>PASSWORD</Text>
        <View style={styles.glassInput}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
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
      </View>

      <GamingButton
        onPress={handleLogin}
        title="SIGN IN"
        isLoading={isSubmitting}
        disabled={isSubmitting}
      />

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
        <RoleOption
          icon="key"
          title="I have an invite code"
          description="Join with a code from your platform owner"
          color="#9B59B6"
          onPress={() => handleModeChange("invite_code")}
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
        <Text style={styles.formTitle}>CREATE PLAYER ACCOUNT</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>USERNAME</Text>
        <View style={styles.glassInput}>
          <Ionicons name="at-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={username}
            onChangeText={handleUsernameChange}
            placeholder="Choose a unique username"
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
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>
      </View>

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
        <Text style={styles.label}>PASSWORD</Text>
        <View style={styles.glassInput}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.xpCyan} style={styles.inputIcon} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Create a secure password"
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
        <Text style={styles.hintText}>At least 8 characters</Text>
      </View>

      <GamingButton
        onPress={handlePlayerRegister}
        title="CREATE ACCOUNT"
        isLoading={isSubmitting}
        disabled={isSubmitting}
        colors={[Colors.dark.xpCyan, "#00A8CC"]}
      />
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
          Coaches are invited by their academy. Ask your academy owner to send you an invite link.
        </Text>
      </View>

      <GamingButton
        onPress={() => handleModeChange("invite_code")}
        title="I HAVE AN INVITE"
        colors={[Colors.dark.primary, "#1FA030"]}
      />

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

          <GamingButton
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

        <GamingButton
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
        <>
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
              You're joining {inviteData.academyName} as {inviteData.role === "academy_owner" ? "Academy Owner" : inviteData.role}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{inviteData.email ? "EMAIL (FROM INVITE)" : "EMAIL"}</Text>
            <View style={[styles.glassInput, inviteData.email ? { opacity: 0.7 } : undefined]}>
              <Ionicons name="mail-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={inviteData.email ? undefined : setEmail}
                editable={!inviteData.email}
                placeholder={inviteData.email ? undefined : "Enter your email"}
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>USERNAME</Text>
            <View style={styles.glassInput}>
              <Ionicons name="at-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
              <TextInput
                value={username}
                onChangeText={handleUsernameChange}
                placeholder="Choose a unique username"
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
            {usernameStatus.error ? (
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
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.glassInput}>
              <Ionicons name="lock-closed-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create a secure password"
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
          </View>

          <GamingButton
            onPress={handleInviteRegister}
            title="CREATE ACCOUNT"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            colors={["#9B59B6", "#8E44AD"]}
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
            Enter the invite code or paste the full invite link you received from the platform owner.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>INVITE CODE OR LINK</Text>
          <View style={styles.glassInput}>
            <Ionicons name="key-outline" size={18} color="#9B59B6" style={styles.inputIcon} />
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Paste your invite code or link"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        </View>

        <GamingButton
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
          <Text style={styles.secondaryButtonText}>Back to Login</Text>
        </Pressable>
      </>
    );
  };

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
              <LinearGradient
                colors={[`${Colors.dark.primary}30`, `${Colors.dark.xpCyan}20`]}
                style={styles.iconGradient}
              />
              <Ionicons name="tennisball" size={48} color={Colors.dark.primary} />
            </View>
            <Text style={styles.title}>GLOW UP SPORTS</Text>
            <Text style={styles.subtitle}>Welcome back</Text>
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
            <Text style={styles.toggleText}>Already have an account? Sign in</Text>
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
  headerTopLine: {
    height: 3,
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
    overflow: "hidden",
  },
  iconGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    letterSpacing: 2,
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
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
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
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
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
    marginTop: Spacing.md,
  },
  gamingButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  gamingButtonText: {
    ...Typography.h4,
    color: Colors.dark.text,
    letterSpacing: 1,
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
    padding: Spacing.md,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
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
  glassCard: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
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
    marginBottom: Spacing.lg,
  },
  savedAccountsTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  savedAccountsHint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
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
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  savedAccountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
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
  savedAccountsDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});
