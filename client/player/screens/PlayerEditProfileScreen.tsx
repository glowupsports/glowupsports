import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
} from "react-native";
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
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    ballLevel?: string | null;
    dominantHand?: string | null;
    backhandType?: string | null;
    tshirtSize?: string | null;
    height?: number | null;
    bio?: string | null;
    medicalNotes?: string | null;
    parentEmail?: string | null;
    isAdult?: boolean;
  } | null;
};

const BALL_LEVELS = [
  { value: "blue", label: "Blue", color: "#4FC3F7" },
  { value: "red", label: "Red", color: "#FF4D4D" },
  { value: "orange", label: "Orange", color: "#FF851B" },
  { value: "green", label: "Green", color: "#C8FF3D" },
  { value: "yellow", label: "Yellow", color: "#FFD700" },
  { value: "glow", label: "Glow", color: "#E040FB" },
];

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

function PillChips({
  options,
  selected,
  onSelect,
  getColor,
}: {
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (val: string) => void;
  getColor?: (val: string) => string;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const isSelected = selected === opt.value;
        const accentColor = getColor ? getColor(opt.value) : Colors.dark.primary;
        return (
          <Pressable
            key={opt.value}
            style={[
              styles.pill,
              isSelected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            onPress={() => onSelect(opt.value)}
          >
            <Text
              style={[
                styles.pillText,
                isSelected && { color: accentColor === Colors.dark.primary ? "#000" : "#fff" },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  const [height, setHeight] = useState("");
  const [tshirtSize, setTshirtSize] = useState<string | null>(null);
  const [ballLevel, setBallLevel] = useState<string | null>(null);
  const [dominantHand, setDominantHand] = useState<string | null>(null);
  const [backhandType, setBackhandType] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMedical, setShowMedical] = useState(false);

  useEffect(() => {
    if (player) {
      setName(player.name || "");
      setPhone(player.phone || "");
      setDateOfBirth(player.dateOfBirth || "");
      setHeight(player.height != null ? String(player.height) : "");
      setTshirtSize(player.tshirtSize || null);
      setBallLevel(player.ballLevel || null);
      setDominantHand(player.dominantHand || null);
      setBackhandType(player.backhandType || null);
      setBio(player.bio || "");
      setMedicalNotes(player.medicalNotes || "");
      setParentEmail(player.parentEmail || "");
      if (player.medicalNotes) setShowMedical(true);
    }
  }, [player]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        ballLevel: ballLevel || undefined,
        dominantHand: dominantHand || undefined,
        backhandType: backhandType || undefined,
        tshirtSize: tshirtSize || undefined,
        height: height ? parseInt(height, 10) : undefined,
        bio: bio.trim() || undefined,
        medicalNotes: medicalNotes.trim() || undefined,
      };
      if (!(player?.isAdult ?? true)) {
        body.parentEmail = parentEmail.trim() || undefined;
      }
      return apiRequest("PATCH", "/api/player/me/info", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Error", "Name is required");
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
  }, [name, phone, dateOfBirth, height, tshirtSize, ballLevel, dominantHand, backhandType, bio, medicalNotes, parentEmail, updateMutation.isPending]);

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

  const isMinor = player ? player.isAdult === false : false;

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      {/* Personal Info */}
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
          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.readOnly]}>
            <Text style={styles.readOnlyText}>{player?.email || ""}</Text>
          </View>
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

        <View style={styles.formGroup}>
          <Text style={styles.label}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            value={height}
            onChangeText={setHeight}
            placeholder="175"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>T-Shirt Size</Text>
          <PillChips
            options={TSHIRT_SIZES.map((s) => ({ value: s, label: s }))}
            selected={tshirtSize}
            onSelect={setTshirtSize}
          />
        </View>
      </View>

      {/* Game Profile */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Profile</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Ball Level</Text>
          <PillChips
            options={BALL_LEVELS}
            selected={ballLevel}
            onSelect={setBallLevel}
            getColor={(val) => BALL_LEVELS.find((b) => b.value === val)?.color ?? Colors.dark.primary}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Dominant Hand</Text>
          <PillChips
            options={[
              { value: "right", label: "Right" },
              { value: "left", label: "Left" },
            ]}
            selected={dominantHand}
            onSelect={setDominantHand}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Backhand</Text>
          <PillChips
            options={[
              { value: "single", label: "Single" },
              { value: "double", label: "Double" },
            ]}
            selected={backhandType}
            onSelect={setBackhandType}
          />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Bio</Text>
            <Text style={styles.charCount}>{bio.length}/500</Text>
          </View>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, 500))}
            placeholder="Tell others about yourself..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </View>

      {/* Medical */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Medical (Optional)</Text>

        {!showMedical && !medicalNotes ? (
          <Pressable
            style={styles.addMedicalBtn}
            onPress={() => setShowMedical(true)}
          >
            <Text style={styles.addMedicalText}>Add medical notes</Text>
          </Pressable>
        ) : (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Medical Notes</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={medicalNotes}
              onChangeText={setMedicalNotes}
              placeholder="Any relevant medical information..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        )}
      </View>

      {/* Parent / Guardian (minors only) */}
      {isMinor ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parent / Guardian</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Parent Email</Text>
            <TextInput
              style={styles.input}
              value={parentEmail}
              onChangeText={setParentEmail}
              placeholder="parent@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
      ) : null}
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
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  charCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
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
  multilineInput: {
    minHeight: 90,
    paddingTop: Spacing.sm + 2,
  },
  readOnly: {
    opacity: 0.6,
    justifyContent: "center",
  },
  readOnlyText: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
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
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  pillText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  addMedicalBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addMedicalText: {
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
