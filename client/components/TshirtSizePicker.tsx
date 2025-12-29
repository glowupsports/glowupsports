import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Typography, Spacing, BorderRadius } from "@/constants/theme";
import { tshirtSizes, TshirtSize } from "@shared/schema";

interface TshirtSizePickerProps {
  value: TshirtSize | undefined;
  onChange: (size: TshirtSize) => void;
}

export function TshirtSizePicker({ value, onChange }: TshirtSizePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelect = (size: TshirtSize) => {
    onChange(size);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable
        style={styles.picker}
        onPress={() => setModalVisible(true)}
      >
        <Feather name="tag" size={18} color={Colors.dark.textMuted} />
        <Text style={[styles.pickerText, !value && styles.placeholder]}>
          {value || "Select size"}
        </Text>
        <Feather name="chevron-down" size={18} color={Colors.dark.textMuted} />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select T-Shirt Size</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={8}
              >
                <Feather name="x" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <FlatList
              data={tshirtSizes}
              keyExtractor={(item) => item}
              numColumns={3}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.sizeButton,
                    value === item && styles.sizeButtonSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.sizeText,
                      value === item && styles.sizeTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  pickerText: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
  },
  placeholder: {
    color: Colors.dark.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modal: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  grid: {
    gap: Spacing.sm,
  },
  sizeButton: {
    flex: 1,
    margin: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  sizeButtonSelected: {
    backgroundColor: Colors.dark.primary,
  },
  sizeText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sizeTextSelected: {
    color: Colors.dark.backgroundRoot,
  },
});
