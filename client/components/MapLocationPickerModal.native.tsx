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
import MapView, {
  Marker,
  MapPressEvent,
  MarkerDragStartEndEvent,
  Region,
} from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

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

function makeRegion(lat: number, lng: number): Region {
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  };
}

export function MapLocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: MapLocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [markerLat, setMarkerLat] = useState(initialLat ?? DEFAULT_LAT);
  const [markerLng, setMarkerLng] = useState(initialLng ?? DEFAULT_LNG);
  const [initialRegion] = useState<Region>(() =>
    makeRegion(initialLat ?? DEFAULT_LAT, initialLng ?? DEFAULT_LNG)
  );
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapView>(null);
  // Pending region to animate to once the map signals it is ready
  const pendingRegionRef = useRef<Region | null>(null);
  const mapReadyRef = useRef(false);

  const animateTo = useCallback((lat: number, lng: number, delay = 0) => {
    const r = makeRegion(lat, lng);
    if (mapReadyRef.current) {
      if (delay) {
        setTimeout(() => mapRef.current?.animateToRegion(r, 400), delay);
      } else {
        mapRef.current?.animateToRegion(r, 400);
      }
    } else {
      // Map not ready yet — store so onMapReady can apply it
      pendingRegionRef.current = r;
    }
  }, []);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    if (pendingRegionRef.current) {
      mapRef.current?.animateToRegion(pendingRegionRef.current, 400);
      pendingRegionRef.current = null;
    }
  }, []);

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

  useEffect(() => {
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      mapReadyRef.current = false;
      pendingRegionRef.current = null;
      return;
    }

    setAddress(null);

    // Saved coordinates → center on them
    if (initialLat != null && initialLng != null) {
      setMarkerLat(initialLat);
      setMarkerLng(initialLng);
      animateTo(initialLat, initialLng);
      setTimeout(() => reverseGeocode(initialLat, initialLng), 300);
      return;
    }

    // No saved coords → try GPS, fall back to Dubai
    (async () => {
      let lat = DEFAULT_LAT;
      let lng = DEFAULT_LNG;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {
        // GPS unavailable — keep Dubai defaults
      }
      setMarkerLat(lat);
      setMarkerLng(lng);
      animateTo(lat, lng);
      reverseGeocode(lat, lng);
    })();
  }, [visible, initialLat, initialLng]);

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
      mapRef.current?.animateToRegion(makeRegion(latitude, longitude), 200);
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
      mapRef.current?.animateToRegion(makeRegion(latitude, longitude), 400);
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
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
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
            initialRegion={initialRegion}
            onMapReady={handleMapReady}
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

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
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
}));
