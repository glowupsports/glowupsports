import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const AUTH_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const AUTH_USER_KEY = "auth_user";
const CURRENT_ACADEMY_KEY = "current_academy_id";

// SecureStore uses iOS Keychain / Android Keystore for hardware-backed encryption.
// On web, SecureStore is unavailable so we fall back to AsyncStorage.
// On native, we ONLY use SecureStore — errors are surfaced, never silently bypassed.
export async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem("@" + key);
  }
  return SecureStore.getItemAsync(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    return AsyncStorage.setItem("@" + key, value);
  }
  return SecureStore.setItemAsync(key, value);
}

export async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    return AsyncStorage.removeItem("@" + key);
  }
  return SecureStore.deleteItemAsync(key);
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  playerId: string | null;
  profilePhotoUrl?: string | null;
  displayName?: string;
  isGuest?: boolean;
}

const GUEST_MODE_KEY = "guest_mode";

export async function saveGuestMode(): Promise<void> {
  try {
    await secureSet(GUEST_MODE_KEY, "true");
  } catch (error) {
    console.error("Failed to save guest mode:", error);
  }
}

export async function clearGuestMode(): Promise<void> {
  try {
    await secureDelete(GUEST_MODE_KEY);
  } catch (error) {
    console.error("Failed to clear guest mode:", error);
  }
}

export async function isGuestMode(): Promise<boolean> {
  try {
    const val = await secureGet(GUEST_MODE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export const GUEST_USER: AuthUser = {
  id: "guest",
  username: "guest",
  email: "",
  role: "player",
  academyId: null,
  coachId: null,
  playerId: null,
  isGuest: true,
  displayName: "Guest",
};

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
}

let currentToken: string | null = null;
let currentAcademyId: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export function setOnUnauthorizedCallback(callback: (() => void) | null): void {
  onUnauthorizedCallback = callback;
}

async function attemptTokenRefresh(): Promise<boolean> {
  if (!currentToken) {
    return false;
  }

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { getApiUrl } = await import("./query-client");
      const baseUrl = getApiUrl();
      const url = new URL("/auth/refresh", baseUrl);

      // The refresh endpoint requires a refresh token (type=refresh, 90d lifetime)
      const storedRefreshToken = await secureGet(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        return false;
      }
      const tokenToUse = storedRefreshToken;

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenToUse}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          currentToken = data.token;
          await secureSet(AUTH_TOKEN_KEY, data.token);
          if (data.refreshToken) {
            await secureSet(REFRESH_TOKEN_KEY, data.refreshToken);
          }
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("[Auth] Token refresh error:", error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function triggerUnauthorized(): Promise<void> {
  const refreshSuccess = await attemptTokenRefresh();

  if (refreshSuccess) {
    return;
  }

  if (onUnauthorizedCallback) {
    onUnauthorizedCallback();
  }
}

export function getRefreshedToken(): string | null {
  return currentToken;
}

export function getAuthToken(): string | null {
  return currentToken;
}

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

export async function loadAuthState(): Promise<AuthState> {
  try {
    const [token, userJson, academyId] = await Promise.all([
      secureGet(AUTH_TOKEN_KEY),
      secureGet(AUTH_USER_KEY),
      secureGet(CURRENT_ACADEMY_KEY),
    ]);

    if (token) {
      currentToken = token;
    }

    if (academyId) {
      currentAcademyId = academyId;
    }

    const user = userJson ? JSON.parse(userJson) : null;

    if (!currentAcademyId && user?.academyId) {
      currentAcademyId = user.academyId;
    }

    return {
      token,
      user,
      isAuthenticated: !!token && !!user,
    };
  } catch (error) {
    console.error("Failed to load auth state:", error);
    return { token: null, user: null, isAuthenticated: false };
  }
}

export async function saveAuthState(token: string, user: AuthUser, refreshToken?: string): Promise<void> {
  try {
    currentToken = token;
    const saves: Promise<void>[] = [
      secureSet(AUTH_TOKEN_KEY, token),
      secureSet(AUTH_USER_KEY, JSON.stringify(user)),
    ];
    if (refreshToken) {
      saves.push(secureSet(REFRESH_TOKEN_KEY, refreshToken));
    }
    await Promise.all(saves);
  } catch (error) {
    console.error("Failed to save auth state:", error);
  }
}

export async function clearAuthState(): Promise<void> {
  try {
    currentToken = null;
    currentAcademyId = null;
    await Promise.all([
      secureDelete(AUTH_TOKEN_KEY),
      secureDelete(REFRESH_TOKEN_KEY),
      secureDelete(AUTH_USER_KEY),
      secureDelete(CURRENT_ACADEMY_KEY),
    ]);
  } catch (error) {
    console.error("Failed to clear auth state:", error);
  }
}

export function getCurrentAcademyId(): string | null {
  return currentAcademyId;
}

export function setCurrentAcademyId(academyId: string | null): void {
  currentAcademyId = academyId;
  if (academyId) {
    secureSet(CURRENT_ACADEMY_KEY, academyId).catch(console.error);
  } else {
    secureDelete(CURRENT_ACADEMY_KEY).catch(console.error);
  }
}

export async function loadCurrentAcademyId(): Promise<string | null> {
  try {
    const academyId = await secureGet(CURRENT_ACADEMY_KEY);
    currentAcademyId = academyId;
    return academyId;
  } catch (error) {
    console.error("Failed to load current academy ID:", error);
    return null;
  }
}
