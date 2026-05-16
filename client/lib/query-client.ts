import logger from "./logger";
import { Alert } from "react-native";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken, triggerUnauthorized, getCurrentAcademyId, getRefreshedToken } from "./auth";
import { validateEnv, logEnvStatus } from "./env";
if (__DEV__) {
  logEnvStatus();
}

/**
 * Gets the base URL for the Express API server (e.g., "https://glow-up-sports--ltvjeugd.replit.app")
 * Uses EXPO_PUBLIC_API_URL (preferred) or falls back to EXPO_PUBLIC_DOMAIN
 * In development, keeps the port. In production, the URL has no port.
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  const { EXPO_PUBLIC_API_URL } = validateEnv();
  
  let url = EXPO_PUBLIC_API_URL;
  
  // Don't strip port - in development the Express server IS on port 5000
  // In production, the URL won't have a port anyway
  
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Gets the base URL for static assets (images, files) served from Express
 * Unlike getApiUrl(), this KEEPS the port 5000 for web because static files
 * are not proxied through the Expo dev server
 * @returns {string} The static assets base URL with full port
 */
export function getStaticAssetsUrl(): string {
  const { EXPO_PUBLIC_API_URL } = validateEnv();
  
  let url = EXPO_PUBLIC_API_URL;
  
  // Don't strip port for static assets - they're served directly from Express
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Builds a safe photo URL for display, handling all 3 possible formats:
 * 1. base64 data URL (data:image/...) → use as-is
 * 2. Full HTTP/HTTPS URL → use as-is
 * 3. Relative path (/uploads/photo.jpg) → prepend static assets base URL
 * Returns null for null/empty/undefined input.
 */
export function buildPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("http")) return url;
  return `${getStaticAssetsUrl()}${url}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      // Family F — peek at the body to see if this is an account-lock 401.
      // Locked sessions should NOT trigger a token refresh (the new token
      // would still get rejected, causing an infinite loop). We clear auth
      // and surface a typed error so callers can route to FamilyLobby.
      const cloned = res.clone();
      try {
        const body = await cloned.json();
        if (body?.error === "ACCOUNT_LOCKED" || body?.locked === true) {
          try {
            const { clearAuthState } = await import("./auth");
            await clearAuthState();
          } catch {}
          const err: any = new Error(
            body?.message || "This account is taking a break.",
          );
          err.code = "ACCOUNT_LOCKED";
          err.lockedUntil = body?.lockedUntil ?? null;
          err.status = 401;
          throw err;
        }
      } catch (peekErr: any) {
        if (peekErr?.code === "ACCOUNT_LOCKED") throw peekErr;
        // Body wasn't JSON — fall through to the existing refresh path.
      }
      logger.log("[API] Received 401, attempting token refresh...");
      await triggerUnauthorized();
      // After triggerUnauthorized, check if we got a new token
      const newToken = getRefreshedToken();
      if (newToken) {
        // Token was refreshed, throw a special error so caller can retry
        throw new Error("TOKEN_REFRESHED");
      }
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

let _activePlayerOverride: string | null = null;

export function setActivePlayerOverride(playerId: string | null) {
  _activePlayerOverride = playerId;
}

// ── Supervisor (coach overview) mode ──────────────────────────────────────────
// When an academy owner views a coach dashboard, these module-level vars are set
// so every coach API read automatically includes ?supervisorCoachId and every
// coach write mutation is blocked with an alert.
let _supervisorCoachId: string | null = null;
let _coachReadOnlyMode = false;

export function setSupervisorQueryCoachId(id: string | null) {
  _supervisorCoachId = id;
}

export function setCoachReadOnlyMode(enabled: boolean) {
  _coachReadOnlyMode = enabled;
}
// ─────────────────────────────────────────────────────────────────────────────

export function getActivePlayerOverride(): string | null {
  return _activePlayerOverride;
}

export function getEffectivePlayerId(authPlayerId: string | null | undefined): string | null {
  return _activePlayerOverride || authPlayerId || null;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const academyId = getCurrentAcademyId();
  if (academyId) {
    headers["X-Academy-Id"] = academyId;
  }

  if (_activePlayerOverride) {
    headers["X-Active-Player-Id"] = _activePlayerOverride;
  }
  
  return headers;
}

/**
 * Centralized fetch wrapper for API calls.
 * DO NOT USE relative URLs like fetch("/api/...") - they fail on native mobile!
 * Always use this function or getApiUrl() for all API requests.
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(path, baseUrl);
  
  return fetch(url.toString(), {
    credentials: "include",
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Block ALL write mutations when in supervisor read-only (coach overview) mode.
  // Only /auth/* routes are exempt (token refresh, OTP flows).
  // Note: academy owners have _coachReadOnlyMode=false even while supervising,
  // so this guard naturally allows their writes without any special casing.
  if (_coachReadOnlyMode) {
    const upper = method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(upper) && !route.startsWith("/auth/")) {
      Alert.alert(
        "Not available in overview mode",
        "This action is disabled while viewing as a coach. Exit overview mode to make changes.",
      );
      throw Object.assign(new Error("READ_ONLY_MODE"), { code: "READ_ONLY_MODE" });
    }
  }

  // Inject supervisorCoachId into write request bodies so the server can
  // attribute the action to the supervised coach instead of the caller.
  // This covers three cases:
  //   1. data is a plain object → spread supervisorCoachId in
  //   2. data is undefined/null → create a minimal { supervisorCoachId } body
  //      so bodyless POST calls (e.g. /leave with no payload) still work
  //   3. data is an array or primitive → leave as-is (uncommon for these routes)
  let effectiveData = data;
  if (_supervisorCoachId && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      effectiveData = { ...(data as Record<string, unknown>), supervisorCoachId: _supervisorCoachId };
    } else if (data === undefined || data === null) {
      effectiveData = { supervisorCoachId: _supervisorCoachId };
    }
  }

  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {
    ...getAuthHeaders(),
  };
  
  if (effectiveData) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: effectiveData ? JSON.stringify(effectiveData) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

async function fetchWithRetry(url: URL, unauthorizedBehavior: UnauthorizedBehavior, retryCount = 0): Promise<any> {
  // Inject supervisorCoachId for all coach-surface reads when in supervisor mode.
  // This covers both /api/coach/* (home, series, calendar) and /api/players
  // (academy-wide player list shown in the coach Players tab — data is the same
  // for any coach in the academy, but the backend validates the supervisor param).
  if (_supervisorCoachId && !url.searchParams.has("supervisorCoachId")) {
    const coachSurfacePaths = ["/api/coach/", "/api/players"];
    if (coachSurfacePaths.some((p) => url.pathname.startsWith(p))) {
      url.searchParams.set("supervisorCoachId", _supervisorCoachId);
    }
  }

  const res = await fetch(url, {
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (res.status === 401) {
    logger.log("[QueryClient] Received 401, attempting token refresh...");
    await triggerUnauthorized();
    
    // Check if token was refreshed
    const newToken = getRefreshedToken();
    if (newToken && retryCount === 0) {
      logger.log("[QueryClient] Token refreshed, retrying request...");
      return fetchWithRetry(url, unauthorizedBehavior, retryCount + 1);
    }
    
    if (unauthorizedBehavior === "returnNull") {
      return null;
    }
    throw new Error("401: Unauthorized");
  }

  await throwIfResNotOk(res);
  return await res.json();
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);
    return fetchWithRetry(url, unauthorizedBehavior);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: false,
    },
  },
});

export function prefetchQueries(queries: string[]) {
  queries.forEach((queryKey) => {
    queryClient.prefetchQuery({ queryKey: [queryKey] });
  });
}
