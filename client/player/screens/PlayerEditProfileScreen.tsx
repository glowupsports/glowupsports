import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Platform, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { HeaderButton } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { apiRequest } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ProfileData = {
  player: {
    id: string;
    name: string;
    phone?: string | null;
    dateOfBirth?: string | null;
    parentName?: string | null;
    parentPhone?: string | null;
  } | null;
};

export default function PlayerEditProfileScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data: profileData } = useQuery<ProfileData>({
    queryKey: ["/api/player/me/profile"],
  });

  const player = profileData?.player;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (player) {
      setName(player.name || "");
      setPhone(player.phone || "");
      setDateOfBirth(player.dateOfBirth || "");
      setParentName(player.parentName || "");
      setParentPhone(player.parentPhone || "");
    }
  }, [player]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/player/me/info", {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        parentName: parentName.trim() || undefined,
        parentPhone: parentPhone.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Name is required");
      } else {
        Alert.alert("Error", "Name is required");
      }
      return;
    }
    updateMutation.mutate();
  };

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <HeaderButton onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtn}>Cancel</Text>
        </HeaderButton>
      ),
      headerRight: () => (
        <HeaderButton onPress={handleSave} disabled={updateMutation.isPending}>
          <Text style={[styles.saveBtn, updateMutation.isPending && styles.disabledBtn]}>
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Text>
        </HeaderButton>
      ),
    });
  }, [name, phone, dateOfBirth, parentName, parentPhone, updateMutation.isPending]);

  const selectedDate = dateOfBirth ? new Date(dateOfBirth) : new Date();

  const handleDateChange = (_event: unknown, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (date) {
      setDateOfBirth(date.toISOString().split("T")[0]);
    }
  };

  const formattedDob = dateOfBirth
    ? new Date(dateOfBirth + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Select date";

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Info</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+971 50 123 4567"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <Pressable
            style={[styles.input, styles.dateInput]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={{ color: dateOfBirth ? Colors.dark.text : Colors.dark.textMuted }}>
              {formattedDob}
            </Text>
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
          )}
          {showDatePicker && Platform.OS === "ios" && (
            <Pressable
              onPress={() => setShowDatePicker(false)}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Parent / Guardian</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Parent Name</Text>
          <TextInput
            style={styles.input}
            value={parentName}
            onChangeText={setParentName}
            placeholder="Parent name"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Parent Phone</Text>
          <TextInput
            style={styles.input}
            value={parentPhone}
            onChangeText={setParentPhone}
            placeholder="+971 50 123 4567"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="phone-pad"
          />
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    color: Colors.dark.text,
    ...Typography.body,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateInput: {
    justifyContent: "center",
  },
  doneBtn: {
    alignItems: "flex-end",
    paddingVertical: Spacing.xs,
  },
  doneBtnText: {
    color: Colors.dark.primary,
    ...Typography.body,
  },
  cancelBtn: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
  },
  saveBtn: {
    color: Colors.dark.primary,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  disabledBtn: {
    opacity: 0.5,
  },
});
