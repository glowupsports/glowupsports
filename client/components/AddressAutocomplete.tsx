import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";

interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressResult {
  address: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  initialValue?: string;
}

export function AddressAutocomplete({
  onSelect,
  placeholder = "Search for an address...",
  initialValue = "",
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(initialValue);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(initialValue ?? "");
    setGeocodeError(null);
    setPredictions([]);
    setShowDropdown(false);
  }, [initialValue]);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(`/api/maps/places-autocomplete?input=${encodeURIComponent(text)}`);
      if (response.ok) {
        const data = await response.json();
        setPredictions(data.predictions || []);
        setShowDropdown((data.predictions || []).length > 0);
      }
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPredictions(text);
    }, 350);
  };

  const handleSelect = async (prediction: Prediction) => {
    setShowDropdown(false);
    setQuery(prediction.description);
    setResolving(true);
    setGeocodeError(null);
    try {
      const response = await apiFetch(`/api/maps/geocode?placeId=${encodeURIComponent(prediction.placeId)}`);
      if (response.ok) {
        const data = await response.json();
        onSelect({
          address: data.formattedAddress || prediction.description,
          lat: data.lat,
          lng: data.lng,
        });
      } else {
        setGeocodeError("Could not resolve coordinates for this address.");
      }
    } catch {
      setGeocodeError("Could not connect to location service. Please try again.");
    } finally {
      setResolving(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setPredictions([]);
    setShowDropdown(false);
    setGeocodeError(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color={Colors.dark.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.dark.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {resolving ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} style={styles.rightIcon} />
        ) : loading ? (
          <ActivityIndicator size="small" color={Colors.dark.textMuted} style={styles.rightIcon} />
        ) : query.length > 0 ? (
          <Pressable onPress={handleClear} style={styles.rightIcon}>
            <Ionicons name="close-circle" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {geocodeError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color={Colors.dark.error} />
          <Text style={styles.errorText}>{geocodeError}</Text>
        </View>
      ) : null}

      {showDropdown ? (
        <View style={styles.dropdown}>
          <ScrollView
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            style={styles.dropdownScroll}
          >
            {predictions.map((pred, index) => (
              <Pressable
                key={pred.placeId}
                style={[styles.predictionRow, index < predictions.length - 1 && styles.predictionRowBorder]}
                onPress={() => handleSelect(pred)}
              >
                <Ionicons name="location-outline" size={14} color={Colors.dark.primary} style={styles.predIcon} />
                <View style={styles.predText}>
                  <Text style={styles.predMain} numberOfLines={1}>{pred.mainText}</Text>
                  {pred.secondaryText ? (
                    <Text style={styles.predSub} numberOfLines={1}>{pred.secondaryText}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 100,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  rightIcon: {
    marginLeft: Spacing.xs,
    padding: 2,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: 2,
    maxHeight: 220,
    overflow: "hidden",
    zIndex: 200,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  predictionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  predictionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  predIcon: {
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  predText: {
    flex: 1,
  },
  predMain: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  predSub: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  errorText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.error,
    flex: 1,
  },
});
