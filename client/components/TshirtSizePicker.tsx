import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Typography, Spacing, BorderRadius } from "@/constants/theme";
import { childTshirtSizes, adultTshirtSizes, TshirtSize } from "@shared/schema";

interface TshirtSizePickerProps {
  value: TshirtSize | undefined;
  onChange: (size: TshirtSize) => void;
  age?: number;
}

export function TshirtSizePicker({ value, onChange, age }: TshirtSizePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const isChild = age !== undefined && age < 17;
  const sizesToShow = isChild ? [...childTshirtSizes] : [...adultTshirtSizes];
  const title = isChild ? "Select Youth Size" : "Select T-Shirt Size";

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
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={8}
              >
                <Feather name="x" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {isChild ? (
              <Text style={styles.sizeGuide}>
                2T-4T: Toddler sizes{"\n"}
                YXS: 4-5 yrs | YS: 6-7 yrs | YM: 8-10 yrs{"\n"}
                YL: 12-14 yrs | YXL: 16 yrs
              </Text>
            ) : null}

            <View style={styles.grid}>
              {sizesToShow.map((item) => (
                <Pressable
                  key={item}
                  style={[
                    styles.sizeButton,
                    value === item && styles.sizeButtonSelected,
                  ]}
                  onPress={() => handleSelect(item as TshirtSize)}
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
              ))}
            </View>
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
    maxWidth: 340,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  sizeGuide: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  sizeButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
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
    color: Colors.dark.buttonText,
  },
});
