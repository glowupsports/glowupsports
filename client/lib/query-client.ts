import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken, triggerUnauthorized, getCurrentAcademyId } from "./auth";
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

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      console.log("[API] Received 401, triggering unauthorized handler");
      triggerUnauthorized();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const academyId = getCurrentAcademyId();
  if (academyId) {
    headers["X-Academy-Id"] = academyId;
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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: "include",
    });

    if (res.status === 401) {
      console.log("[QueryClient] Received 401 for", queryKey.join("/"));
      triggerUnauthorized();
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
