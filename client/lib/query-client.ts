import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // Check for EXPO_PUBLIC_DOMAIN first (set by the workflow)
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    // If it already includes port, use as-is, otherwise it's the full API URL
    if (envDomain.includes(":")) {
      return `https://${envDomain}/`;
    }
    return `https://${envDomain}/`;
  }

  // For web, detect the current origin and use port 5000
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    
    // If we're on localhost, use port 5000
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:5000/`;
    }
    
    // If we're on a replit domain, the API is on port 5000
    // External Replit URLs use subdomains with port mapping
    if (hostname.includes("replit")) {
      // Remove any existing port and add :5000
      const baseHostname = hostname.split(":")[0];
      return `${protocol}//${baseHostname}:5000/`;
    }
    
    // Default: use same origin
    return `${protocol}//${hostname}${port ? `:${port}` : ""}/`;
  }
  
  // For native (iOS/Android), use the Expo host URI to find the dev machine
  if (Platform.OS !== "web") {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      // hostUri is like "192.168.1.100:8081" or tunnel URL
      const host = hostUri.split(":")[0];
      // Check if it's a tunnel URL (contains letters, not just IP)
      if (host.match(/[a-zA-Z]/)) {
        // Tunnel mode - use HTTPS with the domain
        return `https://${host}/`;
      }
      // Local IP - use HTTP with port 5000
      return `http://${host}:5000/`;
    }
  }
  
  // Final fallback
  return "http://localhost:5000/";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
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

    const res = await fetch(url);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
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
