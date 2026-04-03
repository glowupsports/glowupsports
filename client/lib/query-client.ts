import logger from "./logger";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken, triggerUnauthorized, getCurrentAcademyId, getRefreshedToken } from "./auth";
import { validateEnv, isDevelopment, logEnvStatus } from "./env";

import { Platform } from "react-native";

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
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {
    ...getAuthHeaders(),
  };
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

async function fetchWithRetry(url: URL, unauthorizedBehavior: UnauthorizedBehavior, retryCount = 0): Promise<any> {
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
