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
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import * as Location from "expo-location";

// ── Leaflet.js map HTML ───────────────────────────────────────────────────────
// Uses OpenStreetMap tiles (free, no API key). Tap or drag pin to set location.
// Communicates back via postMessage({ lat, lng }).
function buildLeafletHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #1a1a2e; }
    .leaflet-control-attribution { font-size: 10px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    var pinHtml = '<div style="width:22px;height:22px;background:#C8FF3D;border-radius:50%;border:3px solid #000;box-shadow:0 2px 8px rgba(0,0,0,0.5);margin:-11px 0 0 -11px"></div>';
    var icon = L.divIcon({ html: pinHtml, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
    var marker = L.marker([${lat}, ${lng}], { icon: icon, draggable: true }).addTo(map);
    function postCoords(latlng) {
      var msg = JSON.stringify({ lat: latlng.lat, lng: latlng.lng });
      if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(msg); }
      else { window.parent.postMessage(msg, '*'); }
    }
    marker.on('dragend', function(e) { postCoords(e.target.getLatLng()); });
    map.on('click', function(e) { marker.setLatLng(e.latlng); postCoords(e.latlng); });
    // Listen for 'jump' messages from React Native to move the map+pin
    function onMsg(e) {
      try {
        var d = JSON.parse(e.data || e.detail);
        if (d && d.jump) { marker.setLatLng([d.lat, d.lng]); map.setView([d.lat, d.lng], 15); }
      } catch(err) {}
    }
    document.addEventListener('message', onMsg);
    window.addEventListener('message', onMsg);
  </script>
</body>
</html>`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export function MapLocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: MapLocationPickerModalProps) {
  const [currentLat, setCurrentLat] = useState(initialLat ?? DEFAULT_LAT);
  const [currentLng, setCurrentLng] = useState(initialLng ?? DEFAULT_LNG);
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [leafletHtml, setLeafletHtml] = useState<string>("");
  const [webViewKey, setWebViewKey] = useState(0);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<InstanceType<typeof WebView>>(null);

  // Build map HTML and resolve initial address when modal opens
  useEffect(() => {
    if (visible) {
      const lat = initialLat ?? DEFAULT_LAT;
      const lng = initialLng ?? DEFAULT_LNG;
      setCurrentLat(lat);
      setCurrentLng(lng);
      setAddress(null);
      setLeafletHtml(buildLeafletHtml(lat, lng));
      setWebViewKey((k) => k + 1);
      setTimeout(() => reverseGeocode(lat, lng), 300);
    }
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

  // Called when the Leaflet map posts coordinates (tap or drag)
  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const { lat, lng } = JSON.parse(event.nativeEvent.data) as {
          lat: number;
          lng: number;
        };
        setCurrentLat(lat);
        setCurrentLng(lng);
        if (reverseTimer.current) clearTimeout(reverseTimer.current);
        reverseTimer.current = setTimeout(() => reverseGeocode(lat, lng), 400);
      } catch {
        // malformed message — ignore
      }
    },
    [reverseGeocode]
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
      setCurrentLat(latitude);
      setCurrentLng(longitude);
      // Tell the Leaflet map to jump to new coordinates
      const jumpMsg = JSON.stringify({ jump: true, lat: latitude, lng: longitude });
      if (webViewRef.current) {
        webViewRef.current.postMessage(jumpMsg);
      }
      reverseGeocode(latitude, longitude);
    } catch {
      Alert.alert("Location Error", "Could not get your current location.");
    } finally {
      setLocating(false);
    }
  }, [reverseGeocode]);

  const handleConfirm = () => {
    if (!address) return;
    onConfirm({ address, lat: currentLat, lng: currentLng });
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
        {/* Header */}
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

        {/* Leaflet map via WebView */}
        <View style={styles.mapWrapper}>
          {leafletHtml ? (
            <WebView
              key={webViewKey}
              ref={webViewRef}
              source={{ html: leafletHtml }}
              style={StyleSheet.absoluteFill}
              onMessage={handleWebViewMessage}
              javaScriptEnabled
              scrollEnabled={false}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder]}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          )}
        </View>

        {/* Bottom sheet */}
        <View style={styles.bottomSheet}>
          <Text style={styles.dragHint}>
            Tap the map or drag the pin to pick a location
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
              <Text style={[styles.addressText, { color: Colors.dark.textMuted }]}>
                Tap anywhere on the map to pin a location
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
    paddingTop: Platform.OS === "android" ? Spacing.xl + Spacing.lg : Spacing.xl + Spacing.md,
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
  mapPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
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
