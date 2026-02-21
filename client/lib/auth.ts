import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "@auth_token";
const AUTH_USER_KEY = "@auth_user";
const CURRENT_ACADEMY_KEY = "@current_academy_id";

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

const GUEST_MODE_KEY = "@guest_mode";

export async function saveGuestMode(): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
  } catch (error) {
    console.error("Failed to save guest mode:", error);
  }
}

export async function clearGuestMode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
  } catch (error) {
    console.error("Failed to clear guest mode:", error);
  }
}

export async function isGuestMode(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(GUEST_MODE_KEY);
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

// Attempt to refresh the token before logging out
async function attemptTokenRefresh(): Promise<boolean> {
  if (!currentToken) {
    console.log("[Auth] No token to refresh");
    return false;
  }

  // Prevent multiple simultaneous refresh attempts
  if (isRefreshing && refreshPromise) {
    console.log("[Auth] Refresh already in progress, waiting...");
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      console.log("[Auth] Attempting token refresh...");
      
      // Dynamic import to avoid circular dependency
      const { getApiUrl } = await import("./query-client");
      const baseUrl = getApiUrl();
      const url = new URL("/auth/refresh", baseUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          console.log("[Auth] Token refreshed successfully");
          currentToken = data.token;
          await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
          return true;
        }
      }

      console.log("[Auth] Token refresh failed with status:", response.status);
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
  console.log("[Auth] Received 401, attempting token refresh first...");
  
  // Try to refresh the token
  const refreshSuccess = await attemptTokenRefresh();
  
  if (refreshSuccess) {
    console.log("[Auth] Token refreshed, retrying original request...");
    // Token was refreshed, the caller should retry the request
    return;
  }

  console.log("[Auth] Token refresh failed, triggering logout");
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
      AsyncStorage.getItem(AUTH_TOKEN_KEY),
      AsyncStorage.getItem(AUTH_USER_KEY),
      AsyncStorage.getItem(CURRENT_ACADEMY_KEY),
    ]);
    
    if (token) {
      currentToken = token;
    }
    
    if (academyId) {
      currentAcademyId = academyId;
    }
    
    const user = userJson ? JSON.parse(userJson) : null;
    
    // Initialize current academy from user if not already set
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

export async function saveAuthState(token: string, user: AuthUser): Promise<void> {
  try {
    currentToken = token;
    await Promise.all([
      AsyncStorage.setItem(AUTH_TOKEN_KEY, token),
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)),
    ]);
  } catch (error) {
    console.error("Failed to save auth state:", error);
  }
}

export async function clearAuthState(): Promise<void> {
  try {
    currentToken = null;
    currentAcademyId = null;
    await Promise.all([
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
      AsyncStorage.removeItem(AUTH_USER_KEY),
      AsyncStorage.removeItem(CURRENT_ACADEMY_KEY),
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
    AsyncStorage.setItem(CURRENT_ACADEMY_KEY, academyId).catch(console.error);
  } else {
    AsyncStorage.removeItem(CURRENT_ACADEMY_KEY).catch(console.error);
  }
}

export async function loadCurrentAcademyId(): Promise<string | null> {
  try {
    const academyId = await AsyncStorage.getItem(CURRENT_ACADEMY_KEY);
    currentAcademyId = academyId;
    return academyId;
  } catch (error) {
    console.error("Failed to load current academy ID:", error);
    return null;
  }
}
