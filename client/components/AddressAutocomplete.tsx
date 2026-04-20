import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

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
  placeId?: string;
  mainText?: string;
}

interface AddressAutocompleteProps {
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  initialValue?: string;
  mode?: "address" | "venue";
  country?: string;
}

interface DropdownPosition {
  x: number;
  y: number;
  width: number;
  inputBottom: number;
}

export function AddressAutocomplete({
  onSelect,
  placeholder = "Search for an address...",
  initialValue = "",
  mode = "address",
  country,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(initialValue);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<View>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(initialValue ?? "");
    setGeocodeError(null);
    setPredictions([]);
    setShowDropdown(false);
  }, [initialValue]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const measureContainer = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.measureInWindow((x, y, width, height) => {
        setDropdownPos({ x, y, width, inputBottom: y + height });
      });
    }
  }, []);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const modeParam = mode === "venue" ? "&mode=venue" : "";
      const countryParam = country ? `&country=${encodeURIComponent(country)}` : "";
      const response = await apiFetch(
        `/api/maps/places-autocomplete?input=${encodeURIComponent(text)}${modeParam}${countryParam}`
      );
      if (response.ok) {
        const data = await response.json();
        const preds = data.predictions || [];
        setPredictions(preds);
        if (preds.length > 0) {
          measureContainer();
          setShowDropdown(true);
        } else {
          setShowDropdown(false);
        }
      }
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [mode, country, measureContainer]);

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
      const response = await apiFetch(
        `/api/maps/geocode?placeId=${encodeURIComponent(prediction.placeId)}`
      );
      if (response.ok) {
        const data = await response.json();
        onSelect({
          address: data.formattedAddress || prediction.description,
          lat: data.lat,
          lng: data.lng,
          placeId: prediction.placeId,
          mainText: prediction.mainText,
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

  const screenHeight = Dimensions.get("window").height;
  const dropdownMaxHeight = 220;
  // Decide whether to show dropdown above or below the input
  const showAbove = dropdownPos
    ? dropdownPos.inputBottom + dropdownMaxHeight > screenHeight - 80
    : false;

  return (
    <View ref={containerRef} style={styles.container} collapsable={false}>
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

      {showDropdown && dropdownPos ? (
        <Modal
          transparent
          visible={showDropdown}
          animationType="none"
          onRequestClose={() => setShowDropdown(false)}
          statusBarTranslucent
        >
          {/* Dismiss layer */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDropdown(false)} />

          <View
            style={[
              styles.dropdown,
              {
                position: "absolute",
                left: dropdownPos.x,
                width: dropdownPos.width,
                ...(showAbove
                  ? { bottom: screenHeight - dropdownPos.y + 4 }
                  : { top: dropdownPos.inputBottom + 4 }),
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              style={{ maxHeight: dropdownMaxHeight }}
            >
              {predictions.map((pred, index) => (
                <Pressable
                  key={pred.placeId}
                  style={[
                    styles.predictionRow,
                    index < predictions.length - 1 && styles.predictionRowBorder,
                  ]}
                  onPress={() => handleSelect(pred)}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={Colors.dark.primary}
                    style={styles.predIcon}
                  />
                  <View style={styles.predText}>
                    <Text style={styles.predMain} numberOfLines={1}>
                      {pred.mainText}
                    </Text>
                    {pred.secondaryText ? (
                      <Text style={styles.predSub} numberOfLines={1}>
                        {pred.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 1,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      },
    }),
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
}));
