import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import logger from "@/lib/logger";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";
import { getApiUrl } from "@/lib/query-client";

export type WhatsNewSlide = {
  id: string;
  icon: string;
  title: string;
  body: string;
};

type ReleaseNotesResponse = {
  version: string;
  fromVersion: string | null;
  role: string;
  locale: string;
  slides: WhatsNewSlide[];
};

const STORAGE_VERSION_PREFIX = "@glow_whatsnew_seen_v_";
const STORAGE_DISABLED_PREFIX = "@glow_whatsnew_disabled_";

function getCurrentVersion(): string {
  // iOS and Android run on different versions in app.json (e.g. 1.3.4 / 1.3.5).
  // Prefer the platform-specific version so the storage key matches what the
  // user actually has installed — otherwise an iOS user on 1.3.4 would key off
  // the Android 1.3.5 string and never see the carousel for an iOS-only bump.
  const cfg = Constants.expoConfig;
  const platformVersion =
    Platform.OS === "ios"
      ? (cfg?.ios as { version?: string } | undefined)?.version
      : Platform.OS === "android"
        ? (cfg?.android as { version?: string } | undefined)?.version
        : undefined;
  if (platformVersion && /^[\w.\-]{1,32}$/.test(platformVersion)) {
    return platformVersion;
  }
  return cfg?.version || "0.0.0";
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i += 1) {
    const av = partsA[i] || 0;
    const bv = partsB[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function deriveRole(userRole: string | undefined, mode: string | undefined): string {
  // The auth role is the only place that distinguishes "parent" from "player",
  // so check it first. AppMode values are:
  //   "player" | "coach" | "admin" | "academy_owner" | "platform" | "service_provider"
  // (there is no "parent" mode).
  const r = String(userRole || "").toLowerCase();
  if (r === "parent") return "parent";

  // Then prefer the live AppMode for users who can switch (e.g. an academy
  // owner who is currently impersonating "player").
  if (mode === "coach") return "coach";
  if (mode === "academy_owner" || mode === "platform" || mode === "admin") return "owner";
  if (mode === "player") return "player";

  // Final fall-back: auth role.
  if (r === "coach" || r === "assistant") return "coach";
  if (r === "platform_owner" || r === "academy_owner") return "owner";
  return "player";
}

function storageKeyForVersion(userId: string | null | undefined): string {
  return `${STORAGE_VERSION_PREFIX}${userId || "guest"}`;
}

function storageKeyForDisabled(userId: string | null | undefined): string {
  return `${STORAGE_DISABLED_PREFIX}${userId || "guest"}`;
}

export async function setWhatsNewDisabled(
  userId: string | null | undefined,
  disabled: boolean,
): Promise<void> {
  await AsyncStorage.setItem(
    storageKeyForDisabled(userId),
    disabled ? "1" : "0",
  );
}

export async function getWhatsNewDisabled(
  userId: string | null | undefined,
): Promise<boolean> {
  const v = await AsyncStorage.getItem(storageKeyForDisabled(userId));
  return v === "1";
}

export async function markVersionSeen(
  userId: string | null | undefined,
  version: string,
): Promise<void> {
  await AsyncStorage.setItem(storageKeyForVersion(userId), version);
}

export async function getLastSeenVersion(
  userId: string | null | undefined,
): Promise<string | null> {
  return AsyncStorage.getItem(storageKeyForVersion(userId));
}

/**
 * Hook that decides whether the auto "What's New" carousel should appear on
 * boot, fetches the slides, and exposes dismiss + disable callbacks.
 *
 * Decision flow (auto mode):
 *   - skip if not authenticated
 *   - skip if user toggled "Don't show again at updates"
 *   - if no `lastSeenVersion`, treat the current version as already seen
 *     (first install / first login should NOT see release notes for past work)
 *   - else show only when `currentVersion > lastSeenVersion`
 */
export function useWhatsNew(): {
  shouldShow: boolean;
  isLoading: boolean;
  version: string;
  fromVersion: string | null;
  slides: WhatsNewSlide[];
  dismiss: () => Promise<void>;
  disableForever: () => Promise<void>;
} {
  const { user, isAuthenticated } = useAuth();
  const { mode } = useAppMode();
  const { i18n } = useTranslation();
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined);
  const [disabled, setDisabled] = useState<boolean | undefined>(undefined);

  const currentVersion = getCurrentVersion();
  const role = deriveRole(user?.role, mode);
  const locale = (i18n.language || "en").slice(0, 2);
  const userId = user?.id || null;

  // Load AsyncStorage state whenever the active user changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [seen, dis] = await Promise.all([
          getLastSeenVersion(userId),
          getWhatsNewDisabled(userId),
        ]);
        if (cancelled) return;
        if (seen === null) {
          // First time we ever evaluate this user — seed the lastSeen so they
          // don't get a "What's New" on initial install for old releases.
          await markVersionSeen(userId, currentVersion);
          setLastSeen(currentVersion);
        } else {
          setLastSeen(seen);
        }
        setDisabled(dis);
      } catch (err) {
        logger.warn?.("[WhatsNew] AsyncStorage load failed:", err);
        setLastSeen(currentVersion);
        setDisabled(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, currentVersion]);

  const versionIsNewer = useMemo(() => {
    if (!lastSeen) return false;
    return compareVersions(currentVersion, lastSeen) > 0;
  }, [currentVersion, lastSeen]);

  const enabled =
    !!isAuthenticated &&
    disabled === false &&
    versionIsNewer &&
    lastSeen !== undefined;

  const queryUrl = useMemo(() => {
    const base = getApiUrl();
    const url = new URL("/api/release-notes", base);
    url.searchParams.set("version", currentVersion);
    if (lastSeen) url.searchParams.set("since", lastSeen);
    url.searchParams.set("role", role);
    url.searchParams.set("locale", locale);
    return url.toString();
  }, [currentVersion, lastSeen, role, locale]);

  const { data, isLoading } = useQuery<ReleaseNotesResponse>({
    queryKey: ["/api/release-notes", currentVersion, role, locale, lastSeen ?? ""],
    queryFn: async () => {
      const res = await fetch(queryUrl);
      if (!res.ok) throw new Error(`release-notes ${res.status}`);
      return (await res.json()) as ReleaseNotesResponse;
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1h — slides for a fixed version don't change
    retry: 0,
  });

  const dismiss = useCallback(async () => {
    await markVersionSeen(userId, currentVersion);
    setLastSeen(currentVersion);
  }, [userId, currentVersion]);

  const disableForever = useCallback(async () => {
    await setWhatsNewDisabled(userId, true);
    await markVersionSeen(userId, currentVersion);
    setDisabled(true);
    setLastSeen(currentVersion);
  }, [userId, currentVersion]);

  const slides = data?.slides || [];
  const shouldShow = enabled && !isLoading && slides.length > 0;

  return {
    shouldShow,
    isLoading,
    version: currentVersion,
    fromVersion: data?.fromVersion ?? lastSeen ?? null,
    slides,
    dismiss,
    disableForever,
  };
}

/**
 * Lightweight version of the same data flow used by the "View latest updates"
 * button in Settings — bypasses the lastSeen / disabled gating and always
 * fetches the current version's slides on demand.
 */
export function useWhatsNewOnDemand(): {
  fetch: () => Promise<{ version: string; slides: WhatsNewSlide[] }>;
} {
  const { user } = useAuth();
  const { mode } = useAppMode();
  const { i18n } = useTranslation();
  const fetchOnce = useCallback(async () => {
    const currentVersion = getCurrentVersion();
    const role = deriveRole(user?.role, mode);
    const locale = (i18n.language || "en").slice(0, 2);
    const base = getApiUrl();
    const url = new URL("/api/release-notes", base);
    url.searchParams.set("version", currentVersion);
    url.searchParams.set("role", role);
    url.searchParams.set("locale", locale);
    // Manual launcher requests fallback slides so the user never sees an
    // empty "View latest updates" pane — different from the boot gate which
    // silently dismisses on empty.
    url.searchParams.set("fallback", "1");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`release-notes ${res.status}`);
    const data = (await res.json()) as ReleaseNotesResponse;
    return { version: currentVersion, slides: data.slides || [] };
  }, [user?.role, mode, i18n.language]);
  return { fetch: fetchOnce };
}
