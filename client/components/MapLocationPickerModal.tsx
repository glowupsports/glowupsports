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
import WebView from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import * as Location from "expo-location";

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
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(msg);
      } else {
        window.parent.postMessage(msg, '*');
      }
    }
    marker.on('dragend', function(e) { postCoords(e.target.getLatLng()); });
    map.on('click', function(e) { marker.setLatLng(e.latlng); postCoords(e.latlng); });
    window.addEventListener('message', function(e) {
      try {
        var d = JSON.parse(e.data);
        if (d && d.jump) { marker.setLatLng([d.lat, d.lng]); map.setView([d.lat, d.lng], 15); }
      } catch(err) {}
    });
    document.addEventListener('message', function(e) {
      try {
        var d = JSON.parse(e.data);
        if (d && d.jump) { marker.setLatLng([d.lat, d.lng]); map.setView([d.lat, d.lng], 15); }
      } catch(err) {}
    });
  </script>
</body>
</html>`;
}

export function MapLocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: MapLocationPickerModalProps) {
  const [currentLat, setCurrentLat] = useState(DEFAULT_LAT);
  const [currentLng, setCurrentLng] = useState(DEFAULT_LNG);
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [leafletHtml, setLeafletHtml] = useState<string>("");
  const [mapKey, setMapKey] = useState(0);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<WebView>(null);

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

  const initMap = useCallback(
    (lat: number, lng: number) => {
      setCurrentLat(lat);
      setCurrentLng(lng);
      setLeafletHtml(buildLeafletHtml(lat, lng));
      setMapKey((k) => k + 1);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  useEffect(() => {
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setAddress(null);

    if (initialLat != null && initialLng != null) {
      initMap(initialLat, initialLng);
      return;
    }

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
        // GPS unavailable — use Dubai defaults
      }
      initMap(lat, lng);
    })();
  }, [visible, initialLat, initialLng]);

  const handleCoordinates = useCallback(
    (lat: number, lng: number) => {
      setCurrentLat(lat);
      setCurrentLng(lng);
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseTimer.current = setTimeout(() => reverseGeocode(lat, lng), 400);
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
      webViewRef.current?.injectJavaScript(
        `(function(){
          var d = ${JSON.stringify({ jump: true, lat: latitude, lng: longitude })};
          marker.setLatLng([d.lat, d.lng]);
          map.setView([d.lat, d.lng], 15);
        })()`
      );
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
          {leafletHtml ? (
            <WebView
              key={mapKey}
              ref={webViewRef}
              source={{ html: leafletHtml }}
              javaScriptEnabled
              style={{ flex: 1 }}
              onMessage={(e) => {
                try {
                  const d = JSON.parse(e.nativeEvent.data) as {
                    lat?: number;
                    lng?: number;
                  };
                  if (
                    typeof d.lat === "number" &&
                    typeof d.lng === "number"
                  ) {
                    handleCoordinates(d.lat, d.lng);
                  }
                } catch {
                  // ignore malformed messages
                }
              }}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder]}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          )}
        </View>

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
              <Text
                style={[styles.addressText, { color: Colors.dark.textMuted }]}
              >
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
    paddingTop: Spacing.xl + Spacing.md,
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
