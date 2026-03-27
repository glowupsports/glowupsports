import React from "react";
import { View, Text, Pressable, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
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

type FormData = {
  name: string;
  email: string;
  phone: string;
  ballLevel: string;
  parentName: string;
  parentPhone: string;
};

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
