import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

export type AppVersionStatus = "ok" | "soft" | "force";

export interface PlatformVersionConfig {
  latestVersion: string;
  minSupportedVersion: string;
  storeUrl: string;
  releaseNotes?: string;
}

export interface AppVersionCheckResult {
  status: AppVersionStatus;
  installedVersion: string;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  storeUrl: string | null;
  releaseNotes: string | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
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

function getInstalledVersion(): string {
  // `nativeApplicationVersion` reflects the version baked into the binary
  // currently installed on the device — exactly what we want to compare
  // against the store. On web / unsupported platforms it's null, so we
  // fall back to "0.0.0" but the gate is short-circuited before we get
  // there.
  const v = Application.nativeApplicationVersion;
  if (v && /^[\w.\-]{1,32}$/.test(v)) return v;
  return "0.0.0";
}

type AppVersionApiResponse = Partial<
  Record<"ios" | "android", PlatformVersionConfig>
>;

async function fetchAppVersion(): Promise<AppVersionApiResponse> {
  const url = new URL("/api/app-version", getApiUrl()).toString();
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Failed to fetch app version: ${res.status}`);
  }
  return (await res.json()) as AppVersionApiResponse;
}

/**
 * Cold-start version check. On web returns "ok" without hitting the
 * network. On native:
 *   - installed >= latest                                   → "ok"
 *   - installed <  latest  AND installed >= minSupported    → "soft"
 *   - installed <  minSupported                             → "force"
 * Network failures fail-open ("ok") so a bad endpoint can never lock
 * users out of the app. ~5 min cache so 1000 cold opens don't
 * fan out into 1000 requests.
 */
export function useAppVersionCheck(): AppVersionCheckResult {
  const isWeb = Platform.OS === "web";
  const installedVersion = isWeb ? "web" : getInstalledVersion();

  const query = useQuery<AppVersionApiResponse>({
    queryKey: ["/api/app-version"],
    queryFn: fetchAppVersion,
    enabled: !isWeb,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const refetch = useCallback(async () => {
    if (isWeb) return;
    try {
      await query.refetch();
    } catch {
      // fail-open: never let a failed refresh break the gate
    }
  }, [isWeb, query]);

  return useMemo<AppVersionCheckResult>(() => {
    if (isWeb) {
      return {
        status: "ok",
        installedVersion: "web",
        latestVersion: null,
        minSupportedVersion: null,
        storeUrl: null,
        releaseNotes: null,
        isLoading: false,
        refetch,
      };
    }

    const platform: "ios" | "android" =
      Platform.OS === "android" ? "android" : "ios";
    const cfg = query.data?.[platform];

    if (!cfg) {
      return {
        status: "ok",
        installedVersion,
        latestVersion: null,
        minSupportedVersion: null,
        storeUrl: null,
        releaseNotes: null,
        isLoading: query.isLoading,
        refetch,
      };
    }

    const cmpLatest = compareVersions(installedVersion, cfg.latestVersion);
    const cmpMin = compareVersions(installedVersion, cfg.minSupportedVersion);

    let status: AppVersionStatus = "ok";
    if (cmpMin < 0) status = "force";
    else if (cmpLatest < 0) status = "soft";

    return {
      status,
      installedVersion,
      latestVersion: cfg.latestVersion,
      minSupportedVersion: cfg.minSupportedVersion,
      storeUrl: cfg.storeUrl,
      releaseNotes: cfg.releaseNotes ?? null,
      isLoading: query.isLoading,
      refetch,
    };
  }, [isWeb, installedVersion, query.data, query.isLoading, refetch]);
}
