import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import {
  SUPPORTED_LANGUAGES,
  setStoredLanguage,
  type LanguageCode,
} from "@/i18n";
import { Colors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface LanguageSelectorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LanguageSelectorModal({
  visible,
  onClose,
}: LanguageSelectorModalProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const handleLanguageChange = async (langCode: LanguageCode) => {
    if (langCode === i18n.language) {
      onClose();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setStoredLanguage(langCode);
    await i18n.changeLanguage(langCode);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { marginTop: insets.top }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Ionicons name="globe-outline" size={22} color={Colors.dark.xpCyan} />
            <Text style={styles.title}>{t("player.settings.language")}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#999" />
            </Pressable>
          </View>

          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = i18n.language === lang.code;
            return (
              <Pressable
                key={lang.code}
                style={[styles.langRow, isSelected && styles.langRowSelected]}
                onPress={() => handleLanguageChange(lang.code as LanguageCode)}
              >
                <View style={styles.langInfo}>
                  <Text style={[styles.langNative, isSelected && styles.langNativeSelected]}>
                    {lang.nativeLabel}
                  </Text>
                  <Text style={styles.langEnglish}>{lang.label}</Text>
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.dark.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function LanguageHeaderButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Pressable
        style={styles.headerBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowModal(true);
        }}
      >
        <Ionicons name="globe-outline" size={18} color={Colors.dark.xpCyan} />
      </Pressable>
      <LanguageSelectorModal
        visible={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    width: "85%",
    maxWidth: 340,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(0,255,200,0.15)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  langRowSelected: {
    backgroundColor: "rgba(204,255,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(204,255,0,0.2)",
  },
  langInfo: {
    gap: 2,
  },
  langNative: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  langNativeSelected: {
    color: Colors.dark.primary,
  },
  langEnglish: {
    color: "#888",
    fontSize: 12,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,255,200,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,255,200,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
}));
