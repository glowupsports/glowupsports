import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { styles } from "./adminPlayersStyles";

const BALL_LEVELS = ["blue", "red", "orange", "green", "yellow", "glow"];

function getBallLevelColor(level?: string): string {
  switch (level?.toLowerCase()) {
    case "blue": return "#3B82F6";
    case "red": return "#EF4444";
    case "orange": return "#F97316";
    case "green": return "#22C55E";
    case "yellow": return "#EAB308";
    case "adult":
    case "glow": return "#00E5FF";
    default: return Colors.dark.textMuted;
  }
}

export type AdminPlayerFormData = {
  name: string;
  email: string;
  phone: string;
  ballLevel: string;
  parentName: string;
  parentPhone: string;
  dateOfBirth: string;
};
type FormData = AdminPlayerFormData;

interface AdminAddPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  editingPlayer: { id: string; name: string } | null;
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function AdminAddPlayerModal({
  visible,
  onClose,
  editingPlayer,
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
}: AdminAddPlayerModalProps) {
  const insets = useSafeAreaInsets();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const selectedDate = formData.dateOfBirth ? new Date(formData.dateOfBirth) : new Date();

  const handleDateChange = (_event: unknown, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (date) {
      const iso = date.toISOString().split("T")[0];
      setFormData((prev) => ({ ...prev, dateOfBirth: iso }));
    }
  };

  const formattedDob = formData.dateOfBirth
    ? new Date(formData.dateOfBirth + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Select date";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {editingPlayer ? "Edit Player" : "Add Player"}
          </Text>
          <Pressable onPress={onSubmit} disabled={isSubmitting}>
            <Text style={[styles.saveButton, isSubmitting && styles.disabledButton]}>
              {isSubmitting ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat
          style={styles.formScroll}
          contentContainerStyle={styles.form}
        >
          <View style={styles.formGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
              placeholder="Player name"
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
              placeholder="player@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
              placeholder="+971 50 123 4567"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <Pressable
              style={[styles.input, { justifyContent: "center" }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: formData.dateOfBirth ? Colors.dark.text : Colors.dark.textMuted }}>
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
                style={{ alignItems: "flex-end", paddingVertical: 4 }}
              >
                <Text style={{ color: Colors.dark.orange }}>Done</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Ball Level</Text>
            <View style={styles.ballLevelSelector}>
              {BALL_LEVELS.map((level) => (
                <Pressable
                  key={level}
                  style={[
                    styles.ballLevelOption,
                    formData.ballLevel === level && styles.ballLevelSelected,
                    { borderColor: getBallLevelColor(level) },
                  ]}
                  onPress={() => {
                    setFormData((prev) => ({ ...prev, ballLevel: level }));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <View style={[styles.ballLevelDot, { backgroundColor: getBallLevelColor(level) }]} />
                  <Text style={[styles.ballLevelText, { color: getBallLevelColor(level) }]}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.formDivider}>
            <Text style={styles.formDividerText}>Parent/Guardian</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Parent Name</Text>
            <TextInput
              style={styles.input}
              value={formData.parentName}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, parentName: text }))}
              placeholder="Parent name"
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Parent Phone</Text>
            <TextInput
              style={styles.input}
              value={formData.parentPhone}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, parentPhone: text }))}
              placeholder="+971 50 123 4567"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}
