import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import * as Location from "expo-location";

// react-native-maps only works on native (iOS/Android).
// On web we show a simple GPS-based fallback.
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== "web") {
  try {
    const maps = require("react-native-maps");
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {
    // maps unavailable
  }
}

interface MapLocationResult {
  address: string;
  lat: number;
  lng: number;
}

interface MapLocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: MapLocationResult) => void;
  initialLat?: number | null;
  initialLng?: number | null;
}

const DEFAULT_LAT = 25.2048;
const DEFAULT_LNG = 55.2708;
const DEFAULT_DELTA = 0.01;

export function MapLocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: MapLocationPickerModalProps) {
  const [region, setRegion] = useState({
    latitude: initialLat ?? DEFAULT_LAT,
    longitude: initialLng ?? DEFAULT_LNG,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  });
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitialResolve = useRef(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      const lat = initialLat ?? DEFAULT_LAT;
      const lng = initialLng ?? DEFAULT_LNG;
      setRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      });
      setAddress(null);
      didInitialResolve.current = false;
      // Resolve initial address after short delay
      setTimeout(() => {
        reverseGeocode(lat, lng);
        didInitialResolve.current = true;
      }, 400);
    }
  }, [visible, initialLat, initialLng]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const res = await apiFetch(
        `/api/maps/reverse-geocode?lat=${lat}&lng=${lng}&detailed=true`
      );
      if (res.ok) {
        const data = await res.json();
        setAddress(data.formattedAddress || null);
      } else {
        setAddress(null);
      }
    } catch {
      setAddress(null);
    } finally {
      setResolving(false);
    }
  }, []);

  const handleRegionChangeComplete = useCallback(
    (newRegion: typeof region) => {
      setRegion(newRegion);
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseTimer.current = setTimeout(() => {
        reverseGeocode(newRegion.latitude, newRegion.longitude);
      }, 600);
    },
    [reverseGeocode]
  );

  const handleUseGPS = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location Permission", "Allow location access to use your current position.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const newRegion = {
        latitude,
        longitude,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      };
      setRegion(newRegion);
      reverseGeocode(latitude, longitude);
    } catch {
      Alert.alert("Location Error", "Could not get your current location.");
    } finally {
      setLocating(false);
    }
  }, [reverseGeocode]);

  const handleConfirm = () => {
    if (!address) return;
    onConfirm({ address, lat: region.latitude, lng: region.longitude });
    onClose();
  };

  // ── Web fallback ──────────────────────────────────────────────────────────
  if (Platform.OS === "web" || !MapView) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.webOverlay}>
          <View style={styles.webCard}>
            <View style={styles.webHeader}>
              <Text style={styles.webTitle}>Pick Location</Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.dark.text} />
              </Pressable>
            </View>

            <View style={styles.webBody}>
              <Ionicons name="map" size={48} color={Colors.dark.textMuted} style={{ marginBottom: Spacing.md }} />
              <Text style={styles.webHint}>
                Tap the button below to detect your current GPS location, then confirm to save it.
              </Text>

              <Pressable
                style={[styles.gpsBtn, locating && styles.gpsBtnDisabled]}
                onPress={handleUseGPS}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={Colors.dark.backgroundDefault} />
                ) : (
                  <Ionicons name="navigate" size={16} color={Colors.dark.backgroundDefault} />
                )}
                <Text style={styles.gpsBtnText}>
                  {locating ? "Detecting..." : "Use my current location"}
                </Text>
              </Pressable>

              {resolving ? (
                <ActivityIndicator size="small" color={Colors.dark.textMuted} style={{ marginTop: Spacing.md }} />
              ) : address ? (
                <View style={styles.addressBox}>
                  <Ionicons name="location" size={14} color={Colors.dark.primary} />
                  <Text style={styles.addressText}>{address}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              style={[styles.confirmBtn, (!address || resolving) && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!address || resolving}
            >
              <Text style={styles.confirmBtnText}>Confirm Location</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Native map picker ─────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.nativeContainer}>
        {/* Header */}
        <View style={styles.nativeHeader}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.nativeTitle}>Pick Location</Text>
          <Pressable
            style={[styles.nativeGpsBtn, locating && styles.gpsBtnDisabled]}
            onPress={handleUseGPS}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Ionicons name="navigate" size={18} color={Colors.dark.primary} />
            )}
          </Pressable>
        </View>

        {/* Map */}
        <View style={styles.mapWrapper}>
          <MapView
            style={StyleSheet.absoluteFill}
            region={region}
            onRegionChangeComplete={handleRegionChangeComplete}
            showsUserLocation
            showsMyLocationButton={false}
          />

          {/* Fixed center pin */}
          <View style={styles.pinContainer} pointerEvents="none">
            <Ionicons name="location" size={40} color={Colors.dark.primary} />
            <View style={styles.pinShadow} />
          </View>
        </View>

        {/* Bottom sheet */}
        <View style={styles.bottomSheet}>
          <Text style={styles.dragHint}>Drag the map to move the pin</Text>

          {resolving ? (
            <View style={styles.addressRow}>
              <ActivityIndicator size="small" color={Colors.dark.textMuted} />
              <Text style={[styles.addressText, { marginLeft: Spacing.sm }]}>
                Finding address...
              </Text>
            </View>
          ) : address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location" size={14} color={Colors.dark.primary} />
              <Text style={styles.addressText} numberOfLines={2}>
                {address}
              </Text>
            </View>
          ) : (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={[styles.addressText, { color: Colors.dark.textMuted }]}>
                Move the map to select a location
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.confirmBtn, (!address || resolving) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!address || resolving}
          >
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={(!address || resolving) ? Colors.dark.textMuted : Colors.dark.backgroundDefault}
            />
            <Text style={[
              styles.confirmBtnText,
              (!address || resolving) && { color: Colors.dark.textMuted },
            ]}>
              Confirm Location
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Web ──
  webOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  webCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl + 16,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  webTitle: {
    flex: 1,
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  webBody: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  webHint: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  gpsBtnDisabled: {
    opacity: 0.5,
  },
  gpsBtnText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundDefault,
  },

  // ── Native ──
  nativeContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  nativeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl + Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  nativeTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  nativeGpsBtn: {
    padding: Spacing.sm,
  },
  mapWrapper: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  pinContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  pinShadow: {
    width: 8,
    height: 4,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.25)",
    marginTop: -2,
  },
  bottomSheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl + Spacing.md,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  dragHint: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },

  // ── Shared ──
  closeBtn: {
    padding: Spacing.sm,
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    width: "100%",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
  },
  addressText: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.dark.border,
  },
  confirmBtnText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.backgroundDefault,
  },
});
