import { useEffect, useMemo, useRef, useState } from "react";
import * as Localization from "expo-localization";
import * as Location from "expo-location";

import { useAuth } from "@/coach/context/AuthContext";

export type CountrySource = "profile" | "locale" | "gps";

// Resolve an ISO 3166-1 alpha-2 region code to its English country name.
// Uses Intl.DisplayNames when available (Hermes / modern JSC), so every valid
// region is covered without maintaining a hand-edited list. Falls back to a
// small built-in map for engines without Intl.DisplayNames.
const FALLBACK_ISO_TO_COUNTRY: Record<string, string> = {
  AE: "United Arab Emirates",
  ID: "Indonesia",
  NL: "Netherlands",
  GB: "United Kingdom",
  US: "United States",
  SA: "Saudi Arabia",
  QA: "Qatar",
  BH: "Bahrain",
  KW: "Kuwait",
  OM: "Oman",
  EG: "Egypt",
  AU: "Australia",
  SG: "Singapore",
  MY: "Malaysia",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  BE: "Belgium",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  PL: "Poland",
  IN: "India",
  PK: "Pakistan",
  ZA: "South Africa",
  KE: "Kenya",
  NG: "Nigeria",
  BR: "Brazil",
  AR: "Argentina",
  MX: "Mexico",
  CA: "Canada",
  NZ: "New Zealand",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  TH: "Thailand",
  PH: "Philippines",
  VN: "Vietnam",
  PT: "Portugal",
  TR: "Turkey",
  GR: "Greece",
  IE: "Ireland",
  AT: "Austria",
  FI: "Finland",
  CZ: "Czechia",
  RO: "Romania",
  HU: "Hungary",
  RU: "Russia",
  UA: "Ukraine",
};

type DisplayNamesCtor = new (locales: string[], opts: { type: "region" }) => Intl.DisplayNames;

function getDisplayNamesCtor(): DisplayNamesCtor | null {
  if (typeof Intl === "undefined") return null;
  const candidate = (Intl as { DisplayNames?: unknown }).DisplayNames;
  return typeof candidate === "function" ? (candidate as DisplayNamesCtor) : null;
}

let displayNamesInstance: Intl.DisplayNames | null | undefined;
function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNamesInstance !== undefined) return displayNamesInstance;
  const Ctor = getDisplayNamesCtor();
  if (!Ctor) {
    displayNamesInstance = null;
    return null;
  }
  try {
    displayNamesInstance = new Ctor(["en"], { type: "region" });
  } catch {
    displayNamesInstance = null;
  }
  return displayNamesInstance;
}

export function isoToCountryName(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const code = iso.toUpperCase();
  const dn = getDisplayNames();
  if (dn) {
    try {
      const name = dn.of(code);
      // Intl returns the input back when it can't resolve; treat that as null.
      if (name && name !== code) return name;
    } catch {
      // fall through to map
    }
  }
  return FALLBACK_ISO_TO_COUNTRY[code] ?? null;
}

function localeCountry(): string | null {
  try {
    const region = Localization.getLocales?.()[0]?.regionCode ?? null;
    return isoToCountryName(region);
  } catch {
    return null;
  }
}

export interface UsePlayerCountryOptions {
  /**
   * Caller-provided GPS coordinates (e.g. from a screen that already obtained
   * permission). When set, takes precedence over the hook's silent GPS check.
   */
  coords?: { lat: number; lng: number } | null;
  /**
   * When true, the hook silently checks existing foreground location permission
   * (without prompting). If already granted, it fetches a current position and
   * reverse-geocodes it. Default: true.
   */
  enableSilentGps?: boolean;
}

export interface ResolvedCountry {
  country: string | null;
  source: CountrySource | null;
  isResolving: boolean;
}

/**
 * Resolves the player's country for browsing local content (e.g. nearby coaches).
 *
 * Order of precedence:
 *   1. Saved profile country (`user.country` or `user.academyCountry`)
 *   2. Reverse-geocoded GPS coordinates — uses caller-provided `coords` when
 *      set, otherwise silently uses an existing foreground permission (it
 *      never prompts on its own)
 *   3. Device locale region code mapped to a country name
 *
 * The resolved value matches the format stored on academies (full English
 * country name) so it lines up with the server-side filter.
 */
function isCoords(value: unknown): value is { lat: number; lng: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { lat?: unknown }).lat === "number" &&
    typeof (value as { lng?: unknown }).lng === "number"
  );
}

export function usePlayerCountry(
  optionsOrCoords?: UsePlayerCountryOptions | { lat: number; lng: number } | null,
): ResolvedCountry {
  const options: UsePlayerCountryOptions = isCoords(optionsOrCoords)
    ? { coords: optionsOrCoords }
    : (optionsOrCoords ?? {});
  const externalCoords = options.coords ?? null;
  const enableSilentGps = options.enableSilentGps !== false;

  const { user } = useAuth();
  const profileCountry = user?.country || user?.academyCountry || null;

  const [internalCoords, setInternalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsCountry, setGpsCountry] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const lastCoordsRef = useRef<string | null>(null);
  const silentGpsAttemptedRef = useRef(false);

  // Step A: silently obtain coords from existing permission if the caller
  // didn't pass any and we still need a country.
  useEffect(() => {
    if (profileCountry || externalCoords || internalCoords) return;
    if (!enableSilentGps || silentGpsAttemptedRef.current) return;
    silentGpsAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (cancelled || !perm.granted) return;
        setIsResolving(true);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
        if (cancelled) return;
        setInternalCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // No-op: fall back to locale.
      } finally {
        if (!cancelled) setIsResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileCountry, externalCoords, internalCoords, enableSilentGps]);

  // Step B: reverse-geocode whichever coords we have (caller wins over silent).
  const activeCoords = externalCoords ?? internalCoords;
  useEffect(() => {
    if (profileCountry || !activeCoords) return;
    const key = `${activeCoords.lat.toFixed(3)},${activeCoords.lng.toFixed(3)}`;
    if (lastCoordsRef.current === key) return;
    lastCoordsRef.current = key;

    let cancelled = false;
    setIsResolving(true);
    Location.reverseGeocodeAsync({ latitude: activeCoords.lat, longitude: activeCoords.lng })
      .then((results) => {
        if (cancelled) return;
        const first = results?.[0];
        const name = first?.country || isoToCountryName(first?.isoCountryCode ?? null);
        setGpsCountry(name || null);
      })
      .catch(() => {
        if (!cancelled) setGpsCountry(null);
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileCountry, activeCoords?.lat, activeCoords?.lng]);

  return useMemo<ResolvedCountry>(() => {
    if (profileCountry) return { country: profileCountry, source: "profile", isResolving: false };
    if (gpsCountry) return { country: gpsCountry, source: "gps", isResolving };
    const fromLocale = localeCountry();
    if (fromLocale) return { country: fromLocale, source: "locale", isResolving };
    return { country: null, source: null, isResolving };
  }, [profileCountry, gpsCountry, isResolving]);
}
