import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type ResetNav = NativeStackNavigationProp<RootStackParamList, "ResetPassword">;
type ResetRoute = RouteProp<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen() {
  const navigation = useNavigation<ResetNav>();
  const route = useRoute<ResetRoute>();
  const { resetPasswordWithToken } = useAuth();

  const token = useMemo(() => route.params?.token ?? "", [route.params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenMissing = !token;

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const res = await resetPasswordWithToken(token, password);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Could not reset password.");
      return;
    }
    Alert.alert(
      "Password reset",
      "Your password has been updated. You can now sign in.",
      [{ text: "Sign in", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }) }],
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Ionicons name="lock-closed" size={32} color={Colors.dark.xpCyan} />
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          {tokenMissing
            ? "This page needs a reset link from your email. Please open the link we sent you."
            : "Choose a new password for your Glow Up Sports account."}
        </Text>

        {!tokenMissing && (
          <>
            <Text style={styles.label}>NEW PASSWORD</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.dark.textMuted}
                secureTextEntry={!show}
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <Pressable onPress={() => setShow(!show)}>
                <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[styles.input, styles.singleInput]}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter password"
              placeholderTextColor={Colors.dark.textMuted}
              secureTextEntry={!show}
              autoComplete="new-password"
              textContentType="newPassword"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#0A0A0B" /> : <Text style={styles.buttonText}>Set new password</Text>}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => navigation.reset({ index: 0, routes: [{ name: "Login" }] })}>
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 24, paddingTop: 80 },
  card: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  title: { color: Colors.dark.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: Colors.dark.textMuted, fontSize: 14, lineHeight: 20 },
  label: { color: Colors.dark.textMuted, fontSize: 11, fontWeight: "700", marginTop: 8, letterSpacing: 1 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: Colors.dark.text, paddingVertical: 14, fontSize: 16 },
  singleInput: { backgroundColor: Colors.dark.surface, borderRadius: 10, paddingHorizontal: 12 },
  error: { color: "#FF6B6B", fontSize: 14, marginTop: 4 },
  button: {
    marginTop: 16,
    backgroundColor: Colors.dark.xpCyan,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#0A0A0B", fontWeight: "800", fontSize: 16 },
  link: { color: Colors.dark.xpCyan, textAlign: "center", marginTop: 12, fontWeight: "600" },
});
