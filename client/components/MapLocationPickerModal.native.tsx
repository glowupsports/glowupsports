import React, { useState, useCallback, useEffect, useRef } from "react";
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
import MapView, { Marker, MapPressEvent, MarkerDragStartEndEvent, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import * as Location from "expo-location";

// ── Shared types (mirrored in .tsx for web) ───────────────────────────────────
export interface MapLocationResult {
  address: string;
  lat: number;
  lng: number;
}

export interface MapLocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: MapLocationResult) => void;
  initialLat?: number | null;
  initialLng?: number | null;
}

const DEFAULT_LAT = 25.2048;
const DEFAULT_LNG = 55.2708;
const DEFAULT_DELTA = 0.005;

// ── Native implementation (iOS & Android) ─────────────────────────────────────
export function MapLocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: MapLocationPickerModalProps) {
  const [markerLat, setMarkerLat] = useState(initialLat ?? DEFAULT_LAT);
  const [markerLng, setMarkerLng] = useState(initialLng ?? DEFAULT_LNG);
  const [region, setRegion] = useState<Region>({
    latitude: initialLat ?? DEFAULT_LAT,
    longitude: initialLng ?? DEFAULT_LNG,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  });
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!visible) return;

    // If a saved location exists, center on it immediately
    if (initialLat != null && initialLng != null) {
      setMarkerLat(initialLat);
      setMarkerLng(initialLng);
      setRegion({
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      });
      setAddress(null);
      setTimeout(() => reverseGeocode(initialLat, initialLng), 300);
      return;
    }

    // No saved location — try GPS first
    setAddress(null);
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = loc.coords;
          setMarkerLat(latitude);
          setMarkerLng(longitude);
          setRegion({
            latitude,
            longitude,
            latitudeDelta: DEFAULT_DELTA,
            longitudeDelta: DEFAULT_DELTA,
          });
          reverseGeocode(latitude, longitude);
          return;
        }
      } catch {
        // GPS unavailable — fall through to default
      }
      // Final fallback: default Dubai coordinates
      setMarkerLat(DEFAULT_LAT);
      setMarkerLng(DEFAULT_LNG);
      setRegion({
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LNG,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      });
      reverseGeocode(DEFAULT_LAT, DEFAULT_LNG);
    })();
  }, [visible, initialLat, initialLng]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const res = await apiFetch(
        `/api/maps/reverse-geocode?lat=${lat}&lng=${lng}&detailed=true`
      );
      if (res.ok) {
        const data = (await res.json()) as { formattedAddress?: string };
        setAddress(data.formattedAddress ?? null);
      } else {
        setAddress(null);
      }
    } catch {
      setAddress(null);
    } finally {
      setResolving(false);
    }
  }, []);

  const scheduleReverseGeocode = useCallback(
    (lat: number, lng: number) => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseTimer.current = setTimeout(() => reverseGeocode(lat, lng), 400);
    },
    [reverseGeocode]
  );

  const handleMarkerDragEnd = useCallback(
    (e: MarkerDragStartEndEvent) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setMarkerLat(latitude);
      setMarkerLng(longitude);
      scheduleReverseGeocode(latitude, longitude);
    },
    [scheduleReverseGeocode]
  );

  const handleMapPress = useCallback(
    (e: MapPressEvent) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setMarkerLat(latitude);
      setMarkerLng(longitude);
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        },
        200
      );
      scheduleReverseGeocode(latitude, longitude);
    },
    [scheduleReverseGeocode]
  );

  const handleUseGPS = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission",
          "Allow location access to use your current position."
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      setMarkerLat(latitude);
      setMarkerLng(longitude);
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        },
        400
      );
      scheduleReverseGeocode(latitude, longitude);
    } catch {
      Alert.alert("Location Error", "Could not get your current location.");
    } finally {
      setLocating(false);
    }
  }, [scheduleReverseGeocode]);

  const handleConfirm = () => {
    if (!address) return;
    onConfirm({ address, lat: markerLat, lng: markerLng });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Pick Location</Text>
          <Pressable
            style={[styles.headerBtn, locating && styles.btnDisabled]}
            onPress={handleUseGPS}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Ionicons name="navigate" size={20} color={Colors.dark.primary} />
            )}
          </Pressable>
        </View>

        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            onPress={handleMapPress}
            showsUserLocation={false}
            showsMyLocationButton={false}
          >
            <Marker
              coordinate={{ latitude: markerLat, longitude: markerLng }}
              draggable
              onDragEnd={handleMarkerDragEnd}
              pinColor="#C8FF3D"
            />
          </MapView>
        </View>

        <View style={styles.bottomSheet}>
          <Text style={styles.dragHint}>
            Tap or drag the pin to set your location
          </Text>

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
              <Ionicons
                name="location-outline"
                size={14}
                color={Colors.dark.textMuted}
              />
              <Text
                style={[styles.addressText, { color: Colors.dark.textMuted }]}
              >
                Tap anywhere on the map to pin your location
              </Text>
            </View>
          )}

          <Pressable
            style={[
              styles.confirmBtn,
              (!address || resolving) && styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!address || resolving}
          >
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={
                !address || resolving
                  ? Colors.dark.textMuted
                  : Colors.dark.backgroundDefault
              }
            />
            <Text
              style={[
                styles.confirmBtnText,
                (!address || resolving) && { color: Colors.dark.textMuted },
              ]}
            >
              Confirm Location
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop:
      Platform.OS === "android"
        ? Spacing.xl + Spacing.lg
        : Spacing.xl + Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerBtn: {
    padding: Spacing.sm,
    minWidth: 40,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.4,
  },
  mapWrapper: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
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
