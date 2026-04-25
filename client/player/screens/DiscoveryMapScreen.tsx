import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { apiFetch } from "@/lib/query-client";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Local navigation contract: only the routes this screen targets, including
// nested-tab targets for OpenMatches (Play tab) and TournamentDetail (Growth tab).
type DiscoveryMapNav = {
  DiscoveryMap: { initialFilter?: FilterKey } | undefined;
  AcademyPublicProfile: { academyId: string };
  ClassesDiscovery: { sessionId?: string } | undefined;
  PlayerTabs:
    | { screen: "PlayStack"; params: { screen: "OpenMatches"; params?: { matchId?: string } } }
    | { screen: "Growth"; params: { screen: "TournamentDetail"; params: { tournamentId: string } } };
};
// react-native-maps is a native module. On builds where the native side
// isn't linked (e.g. an OTA shipping the screen ahead of a fresh native
// build) the require can throw at module-eval time and produce a white
// screen on navigate. We require it lazily inside a try/catch so the
// screen can fall back to a list view instead of crashing.
let MapViewLib: any = null;
let MarkerLib: any = null;
let PROVIDER_DEFAULT_VAL: any = undefined;
let MAPS_LOAD_ERROR: Error | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const maps = require("react-native-maps");
  MapViewLib = maps.default ?? maps.MapView;
  MarkerLib = maps.Marker;
  PROVIDER_DEFAULT_VAL = maps.PROVIDER_DEFAULT;
} catch (e: any) {
  MAPS_LOAD_ERROR = e instanceof Error ? e : new Error(String(e));
  console.warn("[DiscoveryMap] react-native-maps failed to load:", MAPS_LOAD_ERROR.message);
}
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

type FilterKey = "all" | "academies" | "lessons" | "matches" | "tournaments";
type PinType = "academy" | "lesson" | "match" | "tournament";

interface PinMeta {
  academyId?: string;
  sessionId?: string;
  matchId?: string;
  tournamentId?: string;
  rating?: number | null;
  startTime?: string | Date | null;
  date?: string | Date | null;
  maxPlayers?: number | null;
  spotsLeft?: number | null;
  ballLevel?: string | null;
  matchType?: string | null;
  status?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  sport?: string | null;
}

interface MapPin {
  id: string;
  type: PinType;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  country?: string | null;
  city?: string | null;
  meta?: PinMeta;
}

interface MapApiResponse {
  pins: MapPin[];
  count: number;
  defaultCenter: { lat: number; lng: number; source: string } | null;
}

const PIN_COLORS: Record<PinType, string> = {
  academy: "#22C55E",
  lesson: "#EAB308",
  match: "#3B82F6",
  tournament: "#A855F7",
};

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];
const FILTERS: { key: FilterKey; label: string; icon: IoniconsName }[] = [
  { key: "all", label: "All", icon: "apps" },
  { key: "academies", label: "Academies", icon: "school" },
  { key: "lessons", label: "Lessons", icon: "tennisball" },
  { key: "matches", label: "Matches", icon: "people" },
  { key: "tournaments", label: "Tournaments", icon: "trophy" },
];

const WORLD_REGION: Region = {
  latitude: 0,
  longitude: 0,
  latitudeDelta: 170,
  longitudeDelta: 360,
};

function parseDefaultCenter(value: unknown): { lat: number; lng: number; source: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const source = typeof v.source === "string" ? v.source : "";
  return { lat, lng, source };
}

function sanitizePin(value: unknown): MapPin | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const type = v.type;
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(PIN_COLORS, type)) return null;
  const id = typeof v.id === "string" ? v.id : v.id != null ? String(v.id) : "";
  if (!id) return null;
  const meta: PinMeta =
    v.meta && typeof v.meta === "object" ? (v.meta as PinMeta) : {};
  return {
    id,
    type: type as PinType,
    lat,
    lng,
    title: typeof v.title === "string" ? v.title : "",
    subtitle: typeof v.subtitle === "string" ? v.subtitle : undefined,
    country: typeof v.country === "string" ? v.country : null,
    city: typeof v.city === "string" ? v.city : null,
    meta,
  };
}

function bboxFromRegion(r: Region): string {
  const minLat = r.latitude - r.latitudeDelta / 2;
  const maxLat = r.latitude + r.latitudeDelta / 2;
  const minLng = r.longitude - r.longitudeDelta / 2;
  const maxLng = r.longitude + r.longitudeDelta / 2;
  return `${minLat.toFixed(4)},${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)}`;
}

type ClusterLevel = "country" | "city" | "block" | "none";

function clusterLevelForZoom(latitudeDelta: number): ClusterLevel {
  // World view → country-level grouping (~10° buckets ≈ country scale)
  if (latitudeDelta > 30) return "country";
  // Country view → city-level grouping (~1° buckets ≈ metro scale)
  if (latitudeDelta > 5) return "city";
  // City view → small block grouping for dense areas
  if (latitudeDelta > 1) return "block";
  // Street view → individual pins
  return "none";
}

function gridSizeForLevel(level: ClusterLevel): number | null {
  switch (level) {
    case "country": return 10;
    case "city": return 1;
    case "block": return 0.2;
    case "none": return null;
  }
}

interface Cluster {
  key: string;
  lat: number;
  lng: number;
  count: number;
  pins: MapPin[];
}

function bucketKeyFor(level: ClusterLevel, p: MapPin, grid: number | null): string {
  // For country/city zoom, prefer the actual country/city the backend attached
  // so a cluster is "all pins in Spain" not "all pins in this 10° square".
  if (level === "country" && p.country) return `country:${p.country}`;
  if (level === "city" && p.city) return `city:${p.country ?? "?"}:${p.city}`;
  if (grid != null) {
    const gx = Math.floor(p.lng / grid);
    const gy = Math.floor(p.lat / grid);
    return `grid:${gx}:${gy}`;
  }
  return `single:${p.id}`;
}

function clusterPins(pins: MapPin[], level: ClusterLevel, grid: number | null): { clusters: Cluster[]; singles: MapPin[] } {
  if (level === "none") return { clusters: [], singles: pins };
  const map = new Map<string, MapPin[]>();
  for (const p of pins) {
    const k = bucketKeyFor(level, p, grid);
    const arr = map.get(k);
    if (arr) arr.push(p);
    else map.set(k, [p]);
  }
  const clusters: Cluster[] = [];
  const singles: MapPin[] = [];
  map.forEach((items, key) => {
    if (items.length === 1) {
      singles.push(items[0]);
    } else {
      let lat = 0, lng = 0;
      for (const it of items) { lat += it.lat; lng += it.lng; }
      clusters.push({
        key,
        lat: lat / items.length,
        lng: lng / items.length,
        count: items.length,
        pins: items,
      });
    }
  });
  return { clusters, singles };
}

function PinDot({ color, size = 18, count }: { color: string; size?: number; count?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: "#0E1117",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {count != null ? (
        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text>
      ) : null}
    </View>
  );
}

function InlineMapErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + Spacing.xl, alignItems: "center", justifyContent: "center", padding: Spacing.lg }]}>
      <Ionicons name="map-outline" size={36} color={Colors.dark.textMuted} />
      <Text style={[styles.empty, { marginTop: Spacing.md }]}>
        {message || "Couldn't load map"}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          marginTop: Spacing.lg,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          backgroundColor: Colors.dark.primary,
          borderRadius: BorderRadius.md,
        }}
      >
        <Text style={{ color: "#0E1117", fontWeight: "700" }}>Retry</Text>
      </Pressable>
    </View>
  );
}

export default function DiscoveryMapScreen() {
  const [boundaryKey, setBoundaryKey] = useState(0);
  return (
    <ErrorBoundary
      key={boundaryKey}
      FallbackComponent={({ resetError }) => (
        <InlineMapErrorState
          onRetry={() => {
            resetError();
            setBoundaryKey((k) => k + 1);
          }}
        />
      )}
    >
      <DiscoveryMapScreenInner />
    </ErrorBoundary>
  );
}

function DiscoveryMapScreenInner() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<DiscoveryMapNav>>();
  const route = useRoute<RouteProp<DiscoveryMapNav, "DiscoveryMap">>();
  const [filter, setFilter] = useState<FilterKey>(route.params?.initialFilter ?? "all");
  const [region, setRegion] = useState<Region>(WORLD_REGION);
  const [debouncedRegion, setDebouncedRegion] = useState<Region>(WORLD_REGION);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mapRef = useRef<any>(null);
  const mapsAvailable = !!MapViewLib && !MAPS_LOAD_ERROR;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [centeredFromFallback, setCenteredFromFallback] = useState(false);

  // Initial centering: try device location → (later) player country centroid → world.
  // Each Location.* call is wrapped so a rejection (denied permission, missing
  // services, slow/failed GPS) is logged but cannot crash the screen mount.
  useEffect(() => {
    let cancelled = false;
    const tryCall = async <T,>(label: string, p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch (e) {
        console.warn(`[DiscoveryMap] ${label} failed:`, e);
        return null;
      }
    };
    const init = async () => {
      if (Platform.OS === "web") return;
      const perm = await tryCall(
        "getForegroundPermissionsAsync",
        Location.getForegroundPermissionsAsync(),
      );
      let granted = !!perm?.granted;
      if (!granted && perm?.canAskAgain !== false) {
        const req = await tryCall(
          "requestForegroundPermissionsAsync",
          Location.requestForegroundPermissionsAsync(),
        );
        granted = !!req?.granted;
        if (!req?.granted && req?.canAskAgain === false) {
          if (!cancelled) setPermissionDenied(true);
        }
      } else if (!granted) {
        if (!cancelled) setPermissionDenied(true);
      }
      if (!granted) return;
      const loc =
        (await tryCall(
          "getLastKnownPositionAsync",
          Location.getLastKnownPositionAsync({}),
        )) ||
        (await tryCall(
          "getCurrentPositionAsync",
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        ));
      if (cancelled || !loc?.coords) return;
      const { latitude, longitude } = loc.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      setUserLocation({ lat: latitude, lng: longitude });
      const next: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.4,
        longitudeDelta: 0.4,
      };
      setRegion(next);
      setDebouncedRegion(next);
      mapRef.current?.animateToRegion(next, 600);
      setCenteredFromFallback(true);
    };
    init();
    return () => { cancelled = true; };
     
  }, []);

  const onRegionChangeComplete = useCallback((r: Region) => {
    setRegion(r);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedRegion(r), 350);
  }, []);

  const types = useMemo(() => {
    if (filter === "all") return "academies,lessons,matches,tournaments";
    return filter;
  }, [filter]);

  const queryKey = useMemo(() => [
    "/api/discovery/map",
    types,
    Platform.OS === "web" ? "world" : bboxFromRegion(debouncedRegion),
  ], [types, debouncedRegion]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<MapApiResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ types });
      if (Platform.OS !== "web") params.set("bbox", bboxFromRegion(debouncedRegion));
      const resp = await apiFetch(`/api/discovery/map?${params.toString()}`);
      if (!resp.ok) throw new Error("Failed to load map data");
      let json: unknown;
      try {
        json = await resp.json();
      } catch (e) {
        console.warn("[DiscoveryMap] failed to parse JSON response:", e);
        json = {};
      }
      // Defensive default: never let missing/oddly-shaped fields blow up
      // downstream clustering/render code.
      const root: Record<string, unknown> =
        typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
      const rawPins = root.pins;
      const safePins = Array.isArray(rawPins) ? (rawPins as MapPin[]) : [];
      const safeDefaultCenter = parseDefaultCenter(root.defaultCenter);
      const rawCount = typeof root.count === "number" ? root.count : Number(root.count);
      return {
        pins: safePins,
        count: Number.isFinite(rawCount) ? rawCount : safePins.length,
        defaultCenter: safeDefaultCenter,
      };
    },
    staleTime: 30_000,
    retry: 1,
  });

  // Apply server-provided defaultCenter (player country centroid) when device
  // location wasn't available — this is the required fallback before world.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (centeredFromFallback) return;
    if (userLocation) return;
    const dc = data?.defaultCenter;
    if (!dc) return;
    const next: Region = {
      latitude: dc.lat,
      longitude: dc.lng,
      latitudeDelta: 12,
      longitudeDelta: 12,
    };
    setRegion(next);
    setDebouncedRegion(next);
    mapRef.current?.animateToRegion(next, 600);
    setCenteredFromFallback(true);
  }, [data?.defaultCenter, userLocation, centeredFromFallback]);

  // Final pin sanitization: strip anything missing finite lat/lng, an id, or
  // a known type so a single bad row from the API can't crash clustering.
  const pins: MapPin[] = useMemo(() => {
    const raw: unknown[] = Array.isArray(data?.pins) ? (data!.pins as unknown[]) : [];
    const out: MapPin[] = [];
    for (const item of raw) {
      const pin = sanitizePin(item);
      if (pin) out.push(pin);
    }
    return out;
  }, [data?.pins]);
  const clusterLevel = clusterLevelForZoom(region.latitudeDelta);
  const grid = gridSizeForLevel(clusterLevel);
  const { clusters, singles } = useMemo(
    () => clusterPins(pins, clusterLevel, grid),
    [pins, clusterLevel, grid],
  );

  const handlePinPress = useCallback((pin: MapPin) => {
    setSelectedPin(pin);
  }, []);

  const handleClusterPress = useCallback((c: Cluster) => {
    const next: Region = {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: Math.max(region.latitudeDelta / 3, 0.05),
      longitudeDelta: Math.max(region.longitudeDelta / 3, 0.05),
    };
    mapRef.current?.animateToRegion(next, 500);
  }, [region.latitudeDelta, region.longitudeDelta]);

  const handleOpenEntity = useCallback(() => {
    if (!selectedPin) return;
    const m = selectedPin.meta ?? {};
    const pin = selectedPin;
    setSelectedPin(null);
    switch (pin.type) {
      case "academy":
        if (m.academyId) {
          navigation.navigate("AcademyPublicProfile", { academyId: m.academyId });
        }
        break;
      case "lesson":
        // Pass the selected sessionId to ClassesDiscovery so it can highlight
        // / scroll to the chosen class. The list screen can ignore the param
        // safely if it doesn't yet support deep-linking.
        navigation.navigate("ClassesDiscovery", m.sessionId ? { sessionId: m.sessionId } : undefined);
        break;
      case "match":
        // OpenMatches lives inside the Play tab stack — navigate via PlayerTabs
        // and pass the matchId for deep-linking.
        navigation.navigate("PlayerTabs", {
          screen: "PlayStack",
          params: {
            screen: "OpenMatches",
            params: m.matchId ? { matchId: m.matchId } : undefined,
          },
        });
        break;
      case "tournament":
        if (m.tournamentId) {
          // TournamentDetail lives inside the Growth tab stack.
          navigation.navigate("PlayerTabs", {
            screen: "Growth",
            params: { screen: "TournamentDetail", params: { tournamentId: m.tournamentId } },
          });
        }
        break;
    }
  }, [selectedPin, navigation]);

  const headerTop = insets.top + Spacing.sm;

  // ---------------- Fallback: list (web OR maps native module unavailable) ----------------
  if (Platform.OS === "web" || !mapsAvailable) {
    const fallbackMessage = Platform.OS === "web"
      ? "Open the app on your phone to see the interactive global map. Showing the world list below."
      : "Map view needs the latest app version from the store. Showing the world list below.";
    return (
      <View style={[styles.root, { paddingTop: headerTop }]}>
        <FilterBar filter={filter} onChange={setFilter} />
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
        >
          <View style={styles.webNotice}>
            <Ionicons name="map-outline" size={20} color={Colors.dark.textMuted} />
            <Text style={styles.webNoticeText}>{fallbackMessage}</Text>
          </View>
          {isLoading ? (
            <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.lg }} />
          ) : isError ? (
            <View style={{ alignItems: "center", marginTop: Spacing.xl }}>
              <Text style={styles.empty}>Couldn&apos;t load map data.</Text>
              <Pressable
                onPress={() => refetch()}
                style={{
                  marginTop: Spacing.md,
                  paddingHorizontal: Spacing.lg,
                  paddingVertical: Spacing.sm,
                  backgroundColor: Colors.dark.primary,
                  borderRadius: BorderRadius.md,
                }}
              >
                <Text style={{ color: "#0E1117", fontWeight: "700" }}>Retry</Text>
              </Pressable>
            </View>
          ) : pins.length === 0 ? (
            <Text style={styles.empty}>Nothing to show yet.</Text>
          ) : (
            pins.map((p) => (
              <Pressable key={p.id} onPress={() => handlePinPress(p)} style={styles.listRow}>
                <PinDot color={PIN_COLORS[p.type]} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.listTitle} numberOfLines={1}>{p.title}</Text>
                  {p.subtitle ? <Text style={styles.listSubtitle} numberOfLines={1}>{p.subtitle}</Text> : null}
                </View>
                <Text style={styles.listType}>{p.type}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
        <PinSheet pin={selectedPin} onClose={() => setSelectedPin(null)} onOpen={handleOpenEntity} />
      </View>
    );
  }

  // ---------------- Native: map ----------------
  return (
    <View style={styles.root}>
      <MapViewLib
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT_VAL}
        initialRegion={region}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {clusters.map((c) => (
          <MarkerLib
            key={`c:${c.key}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            onPress={() => handleClusterPress(c)}
            tracksViewChanges={false}
          >
            <View style={styles.clusterPin}>
              <Text style={styles.clusterPinText}>{c.count > 99 ? "99+" : c.count}</Text>
            </View>
          </MarkerLib>
        ))}
        {singles.map((p) => (
          <MarkerLib
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            onPress={() => handlePinPress(p)}
            tracksViewChanges={false}
          >
            <PinDot color={PIN_COLORS[p.type]} size={20} />
          </MarkerLib>
        ))}
      </MapViewLib>

      <View style={[styles.topOverlay, { paddingTop: headerTop }]} pointerEvents="box-none">
        <FilterBar filter={filter} onChange={setFilter} />
        {permissionDenied ? (
          <Pressable
            style={styles.permBanner}
            onPress={() => {
              if (Platform.OS === "web") return;
              Linking.openSettings().catch((e) => {
                console.warn("[DiscoveryMap] openSettings failed:", e);
              });
            }}
          >
            <Ionicons name="location-outline" size={14} color="#fff" />
            <Text style={styles.permBannerText}>Enable location to center the map on you</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.legend, { bottom: insets.bottom + Spacing.lg }]} pointerEvents="none">
        {(["academy", "lesson", "match", "tournament"] as PinType[]).map((t) => (
          <View key={t} style={styles.legendItem}>
            <PinDot color={PIN_COLORS[t]} size={10} />
            <Text style={styles.legendLabel}>{t}</Text>
          </View>
        ))}
      </View>

      {(isLoading || isFetching) ? (
        <View style={[styles.loadingBadge, { top: headerTop + 60 }]} pointerEvents="none">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : null}

      {isError ? (
        <Pressable
          onPress={() => refetch()}
          style={[styles.permBanner, { position: "absolute", top: headerTop + 60, alignSelf: "center" }]}
        >
          <Ionicons name="alert-circle-outline" size={14} color="#fff" />
          <Text style={styles.permBannerText}>Couldn&apos;t load map data. Tap to retry.</Text>
        </Pressable>
      ) : null}

      {userLocation ? (
        <Pressable
          style={[styles.locateBtn, { bottom: insets.bottom + Spacing.lg + 60 }]}
          onPress={() => {
            mapRef.current?.animateToRegion({
              latitude: userLocation.lat,
              longitude: userLocation.lng,
              latitudeDelta: 0.4,
              longitudeDelta: 0.4,
            }, 500);
          }}
        >
          <Ionicons name="locate" size={20} color={Colors.dark.text} />
        </Pressable>
      ) : null}

      <PinSheet pin={selectedPin} onClose={() => setSelectedPin(null)} onOpen={handleOpenEntity} />
    </View>
  );
}

function FilterBar({ filter, onChange }: { filter: FilterKey; onChange: (k: FilterKey) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterBar}
    >
      {FILTERS.map((f) => {
        const active = f.key === filter;
        return (
          <Pressable
            key={f.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f.key)}
          >
            <Ionicons
              name={f.icon}
              size={14}
              color={active ? "#0E1117" : Colors.dark.text}
            />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PinSheet({ pin, onClose, onOpen }: {
  pin: MapPin | null;
  onClose: () => void;
  onOpen: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!pin) return null;
  const ctaLabel = pin.type === "match" ? "RSVP"
    : pin.type === "lesson" ? "Book"
    : "Open";
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <PinDot color={PIN_COLORS[pin.type]} size={16} />
          <ThemedText style={styles.sheetType}>{pin.type.toUpperCase()}</ThemedText>
        </View>
        <ThemedText style={styles.sheetTitle} numberOfLines={2}>{pin.title}</ThemedText>
        {pin.subtitle ? (
          <ThemedText style={styles.sheetSubtitle} numberOfLines={2}>{pin.subtitle}</ThemedText>
        ) : null}
        <SheetMeta pin={pin} />
        <View style={styles.sheetActions}>
          <Pressable style={styles.sheetSecondary} onPress={onClose}>
            <Text style={styles.sheetSecondaryText}>Close</Text>
          </Pressable>
          <Pressable style={styles.sheetPrimary} onPress={onOpen}>
            <Text style={styles.sheetPrimaryText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SheetMeta({ pin }: { pin: MapPin }) {
  const m = pin.meta || {};
  if (pin.type === "match" && m.spotsLeft != null) {
    return <Text style={styles.sheetMeta}>{`${m.spotsLeft} spot${m.spotsLeft === 1 ? "" : "s"} left${m.matchType ? " • " + m.matchType : ""}`}</Text>;
  }
  if (pin.type === "lesson" && m.startTime) {
    try {
      const d = new Date(m.startTime as string);
      return <Text style={styles.sheetMeta}>{d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>;
    } catch { return null; }
  }
  if (pin.type === "tournament" && m.startDate) {
    return <Text style={styles.sheetMeta}>{`${m.startDate}${m.endDate ? " → " + m.endDate : ""}`}</Text>;
  }
  if (pin.type === "academy" && m.rating) {
    return <Text style={styles.sheetMeta}>{`★ ${Number(m.rating).toFixed(1)}`}</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0E1117" },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  filterBar: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: "rgba(20,24,32,0.85)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "#2A3142",
  },
  chipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  chipText: { color: Colors.dark.text, fontSize: FontSizes.sm, fontWeight: "600" },
  chipTextActive: { color: "#0E1117" },
  permBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginHorizontal: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: BorderRadius.full,
  },
  permBannerText: { color: "#fff", fontSize: FontSizes.xs },
  clusterPin: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: "#0E1117",
    alignItems: "center",
    justifyContent: "center",
  },
  clusterPinText: { color: "#0E1117", fontWeight: "700", fontSize: 13 },
  legend: {
    position: "absolute",
    left: Spacing.md,
    flexDirection: "row",
    gap: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendLabel: { color: "#fff", fontSize: 10, textTransform: "capitalize" },
  loadingBadge: {
    position: "absolute",
    right: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  locateBtn: {
    position: "absolute",
    right: Spacing.md,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(20,24,32,0.95)",
    borderWidth: 1, borderColor: "#2A3142",
    alignItems: "center", justifyContent: "center",
  },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#161B24",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: "#2A3142",
    marginBottom: Spacing.sm,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetType: { color: Colors.dark.textMuted, fontSize: FontSizes.xs, fontWeight: "700", letterSpacing: 1 },
  sheetTitle: { color: Colors.dark.text, fontSize: FontSizes.lg, fontWeight: "700" },
  sheetSubtitle: { color: Colors.dark.textMuted, fontSize: FontSizes.sm },
  sheetMeta: { color: Colors.dark.text, fontSize: FontSizes.sm, marginTop: 2 },
  sheetActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },
  sheetSecondary: {
    flex: 1, paddingVertical: 12, borderRadius: BorderRadius.md,
    backgroundColor: "#1F2533", alignItems: "center",
  },
  sheetSecondaryText: { color: Colors.dark.text, fontWeight: "600" },
  sheetPrimary: {
    flex: 1, paddingVertical: 12, borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary, alignItems: "center",
  },
  sheetPrimaryText: { color: "#0E1117", fontWeight: "700" },
  webNotice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: Spacing.md,
    backgroundColor: "#161B24",
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  webNoticeText: { color: Colors.dark.textMuted, fontSize: FontSizes.sm, flex: 1 },
  empty: { color: Colors.dark.textMuted, textAlign: "center", marginTop: Spacing.xl },
  listRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: "#1E2332",
  },
  listTitle: { color: Colors.dark.text, fontSize: FontSizes.md, fontWeight: "600" },
  listSubtitle: { color: Colors.dark.textMuted, fontSize: FontSizes.xs, marginTop: 2 },
  listType: { color: Colors.dark.textMuted, fontSize: FontSizes.xs, textTransform: "uppercase", letterSpacing: 1 },
});
