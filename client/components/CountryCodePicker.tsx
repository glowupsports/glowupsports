import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  TextInput,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export interface CountryCode {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

const COUNTRY_CODES: CountryCode[] = [
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "AE" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "SA" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "QA" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "KW" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "BH" },
  { code: "OM", name: "Oman", dial: "+968", flag: "OM" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "EG" },
  { code: "JO", name: "Jordan", dial: "+962", flag: "JO" },
  { code: "LB", name: "Lebanon", dial: "+961", flag: "LB" },
  { code: "US", name: "United States", dial: "+1", flag: "US" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "GB" },
  { code: "DE", name: "Germany", dial: "+49", flag: "DE" },
  { code: "FR", name: "France", dial: "+33", flag: "FR" },
  { code: "ES", name: "Spain", dial: "+34", flag: "ES" },
  { code: "IT", name: "Italy", dial: "+39", flag: "IT" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "NL" },
  { code: "BE", name: "Belgium", dial: "+32", flag: "BE" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "CH" },
  { code: "AT", name: "Austria", dial: "+43", flag: "AT" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "SE" },
  { code: "NO", name: "Norway", dial: "+47", flag: "NO" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "DK" },
  { code: "FI", name: "Finland", dial: "+358", flag: "FI" },
  { code: "PL", name: "Poland", dial: "+48", flag: "PL" },
  { code: "RU", name: "Russia", dial: "+7", flag: "RU" },
  { code: "IN", name: "India", dial: "+91", flag: "IN" },
  { code: "PK", name: "Pakistan", dial: "+92", flag: "PK" },
  { code: "CN", name: "China", dial: "+86", flag: "CN" },
  { code: "JP", name: "Japan", dial: "+81", flag: "JP" },
  { code: "KR", name: "South Korea", dial: "+82", flag: "KR" },
  { code: "AU", name: "Australia", dial: "+61", flag: "AU" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "NZ" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "BR" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "MX" },
  { code: "CA", name: "Canada", dial: "+1", flag: "CA" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "ZA" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "NG" },
  { code: "KE", name: "Kenya", dial: "+254", flag: "KE" },
  { code: "PH", name: "Philippines", dial: "+63", flag: "PH" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "SG" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "MY" },
  { code: "TH", name: "Thailand", dial: "+66", flag: "TH" },
  { code: "ID", name: "Indonesia", dial: "+62", flag: "ID" },
  { code: "VN", name: "Vietnam", dial: "+84", flag: "VN" },
  { code: "TR", name: "Turkey", dial: "+90", flag: "TR" },
  { code: "GR", name: "Greece", dial: "+30", flag: "GR" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "PT" },
  { code: "IE", name: "Ireland", dial: "+353", flag: "IE" },
  { code: "IL", name: "Israel", dial: "+972", flag: "IL" },
];

const getFlagEmoji = (countryCode: string): string => {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

interface CountryCodePickerProps {
  selectedCountry: CountryCode;
  onSelect: (country: CountryCode) => void;
}

export const getDefaultCountry = (): CountryCode => {
  return COUNTRY_CODES.find((c) => c.code === "AE") || COUNTRY_CODES[0];
};

export default function CountryCodePicker({
  selectedCountry,
  onSelect,
}: CountryCodePickerProps) {
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = COUNTRY_CODES.filter(
    (country) =>
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.dial.includes(searchQuery) ||
      country.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (country: CountryCode) => {
    onSelect(country);
    setIsOpen(false);
    setSearchQuery("");
  };

  const renderCountryItem = ({ item }: { item: CountryCode }) => (
    <Pressable
      style={[
        styles.countryItem,
        item.code === selectedCountry.code && styles.countryItemSelected,
      ]}
      onPress={() => handleSelect(item)}
    >
      <Text style={styles.flagText}>{getFlagEmoji(item.flag)}</Text>
      <View style={styles.countryInfo}>
        <Text style={styles.countryName}>{item.name}</Text>
        <Text style={styles.countryDial}>{item.dial}</Text>
      </View>
      {item.code === selectedCountry.code ? (
        <Ionicons name="checkmark" size={20} color={Colors.dark.primary} />
      ) : null}
    </Pressable>
  );

  return (
    <>
      <Pressable style={styles.picker} onPress={() => setIsOpen(true)}>
        <Text style={styles.flagText}>{getFlagEmoji(selectedCountry.flag)}</Text>
        <Text style={styles.dialCode}>{selectedCountry.dial}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.md }]}>
            <Text style={styles.modalTitle}>Select Country</Text>
            <Pressable onPress={() => setIsOpen(false)} hitSlop={12} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search country or code..."
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="none"
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            renderItem={renderCountryItem}
            contentContainerStyle={styles.countryList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  picker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    minWidth: 100,
  },
  flagText: {
    fontSize: 20,
  },
  dialCode: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    paddingVertical: Spacing.sm,
  },
  countryList: {
    paddingHorizontal: Spacing.lg,
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  countryItemSelected: {
    backgroundColor: `${GlowColors.primary}20`,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  countryDial: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
}));
