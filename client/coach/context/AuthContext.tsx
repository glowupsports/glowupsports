import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { loginRevenueCat, logoutRevenueCat } from "@/lib/revenuecat";
import {
  hydrateGodCache,
  startGodCachePersistence,
  clearGodCache,
} from "@/lib/queryCachePersist";
import { 
  loadAuthState, 
  saveAuthState, 
  clearAuthState, 
  setAuthToken,
  setOnUnauthorizedCallback,
  AuthUser,
  GUEST_USER,
  clearGuestMode,
} from "@/lib/auth";
import { useAppMode, getModesForRole, getDefaultModeForRole } from "@/context/AppModeContext";
import { TshirtSize } from "@shared/schema";

interface Coach {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  level: number | null;
  totalXp: number | null;
  academyId: string | null;
  photoUrl: string | null;
  specialty: string | null;
  bio: string | null;
}

interface Academy {
  id: string;
  name: string;
  slug: string;
  timezone?: string | null;
}

interface PlayerRegisterData {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  tshirtSize?: TshirtSize;
  dateOfBirth?: string;
  height?: number;
  otpCode?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  coach: Coach | null;
  academy: Academy | null;
  isGuest: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  loginWithToken: (token: string, user: AuthUser, refreshToken?: string) => Promise<void>;
  loginWithApple: (identityToken: string, appleUser: string, email?: string | null) => Promise<{ success: boolean; error?: string; code?: string; user?: AuthUser; linkedToExisting?: boolean }>;
  registerWithApple: (data: {
    identityToken: string;
    appleUser: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth: string;
  }) => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  loginAsGuest: () => Promise<void>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  registerPlayer: (data: PlayerRegisterData) => Promise<{ success: boolean; error?: string; requiresOTP?: boolean }>;
  requestPasswordReset: (identifier: string) => Promise<{ success: boolean; error?: string; noEmail?: boolean; message?: string }>;
  resetPassword: (identifier: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordWithToken: (token: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  isImpersonating: boolean;
  impersonatedAcademyName: string | null;
  startImpersonation: (academyId: string, academyName: string) => Promise<{ success: boolean; error?: string }>;
  stopImpersonation: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  academyName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IMPERSONATION_ORIGINAL_TOKEN_KEY = "@impersonation_original_token";
const IMPERSONATION_ORIGINAL_USER_KEY = "@impersonation_original_user";
const IMPERSONATION_ACADEMY_NAME_KEY = "@impersonation_academy_name";
const IMPERSONATION_ORIGINAL_MODE_KEY = "@impersonation_original_mode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [academy, setAcademy] = useState<Academy | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedAcademyName, setImpersonatedAcademyName] = useState<string | null>(null);
  const { mode, setMode, setAvailableModes } = useAppMode();
  const setAvailableModesRef = useRef(setAvailableModes);
  setAvailableModesRef.current = setAvailableModes;
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const queryClient = useQueryClient();

  const fetchUserData = useCallback(async (token: string, forceDefaultMode: boolean = false) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/api/me", apiUrl).toString(), {
        headers: { 
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const text = await response.text();
        if (!text) {
          console.error("[AuthContext] Empty response from /api/me");
          return false;
        }
        const data = JSON.parse(text);
        logger.log("[AuthContext] Received user data:", { hasUser: !!data.user, hasCoach: !!data.coach, hasAcademy: !!data.academy });
        setUser(data.user);
        setCoach(data.coach);
        setAcademy(data.academy);

        // Task #1387 — As soon as we know the active player, hydrate the
        // persisted god-cache from disk and start write-through. This is
        // the "instant first paint" knob: by the time the player nav
        // mounts, Schedule / Profile / Home / Progress / Play already
        // have their last-known payload primed into react-query.
        if (data.user?.playerId) {
          hydrateGodCache(queryClient, data.user.playerId).catch(() => {});
          startGodCachePersistence(queryClient, data.user.playerId);
        }

        if (data.user?.id) {
          loginRevenueCat(data.user.id).catch(() => {});
        }
        
        const userRole = data.user?.role || "player";
        const availableModes = getModesForRole(userRole);
        const defaultMode = getDefaultModeForRole(userRole);
        logger.log("[AuthContext] Setting modes for role:", userRole, "modes:", availableModes, "default:", defaultMode);
        setAvailableModesRef.current(availableModes, defaultMode);
        
        if (forceDefaultMode && defaultMode) {
          logger.log("[AuthContext] Forcing default mode for role:", defaultMode);
          setModeRef.current(defaultMode);
        }
        
        return true;
      }
      logger.log("[AuthContext] /api/me returned status:", response.status);
      return false;
    } catch (error) {
      console.error("[AuthContext] Failed to fetch user data:", error);
      return false;
    }
  }, []);

  const handleUnauthorized = useCallback(async () => {
    if (isGuest) {
      logger.log("[AuthContext] Ignoring 401 in guest mode");
      return;
    }
    logger.log("[AuthContext] Handling unauthorized - clearing auth state and forcing re-login");
    // Task #1387 — flush persisted god-cache for the previously-active
    // player BEFORE clearing react-query, otherwise the next account
    // could see a single frame of the old player's data on cold start.
    const prevPlayerId = user?.playerId ?? undefined;
    await clearGodCache(prevPlayerId);
    queryClient.clear();
    await clearAuthState();
    setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
    setCoach(null);
    setAcademy(null);
  }, [queryClient, isGuest, user?.playerId]);

  useEffect(() => {
    setOnUnauthorizedCallback(handleUnauthorized);
    return () => {
      setOnUnauthorizedCallback(null);
    };
  }, [handleUnauthorized]);

  useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      logger.log("[AuthContext] Starting auth init...");
      try {
        const impersonationAcademy = await AsyncStorage.getItem(IMPERSONATION_ACADEMY_NAME_KEY);
        if (impersonationAcademy) {
          setIsImpersonating(true);
          setImpersonatedAcademyName(impersonationAcademy);
        }

        await clearGuestMode();

        const authState = await loadAuthState();
        logger.log("[AuthContext] Loaded auth state:", { hasToken: !!authState.token, hasUser: !!authState.user });
        
        if (authState.token && authState.user && isMounted) {
          setAuthToken(authState.token);
          // Task #1387 — pre-hydrate the god-cache from disk BEFORE the
          // /api/me round-trip. The cached `authState.user` already
          // carries `playerId` from the previous session, so we can
          // start filling react-query while the auth refresh is still
          // in-flight. This is the bulk of the cold-start latency win:
          // by the time NavigationContainer mounts the player tabs,
          // their useQuery calls return the persisted snapshot
          // synchronously and the screen renders with content.
          const cachedPlayerId =
            (authState.user as { playerId?: string | null } | null)?.playerId;
          if (cachedPlayerId) {
            hydrateGodCache(queryClient, cachedPlayerId).catch(() => {});
            startGodCachePersistence(queryClient, cachedPlayerId);
          }
          logger.log("[AuthContext] Fetching user data...");
          const success = await fetchUserData(authState.token);
          logger.log("[AuthContext] Fetch user data result:", success);
          if (success && isMounted) {
            setIsAuthenticated(true);
            logger.log("[AuthContext] User authenticated successfully");
          } else {
            logger.log("[AuthContext] Clearing auth state due to failed fetch");
            await clearAuthState();
          }
        } else {
          logger.log("[AuthContext] No stored auth state, showing login");
        }
      } catch (error) {
        console.error("[AuthContext] Auth init error:", error);
      } finally {
        if (isMounted) {
          logger.log("[AuthContext] Setting isLoading to false");
          setIsLoading(false);
        }
      }
    };
    
    initAuth();
    
    return () => {
      isMounted = false;
    };
  }, [fetchUserData]);

  const loginAsGuest = async () => {
    logger.log("[AuthContext] Guest login");
    // Task #1387 — flush persisted god-cache for whoever was logged
    // in before so the guest never sees one frame of their data.
    await clearGodCache(user?.playerId ?? undefined);
    queryClient.clear();
    setUser(GUEST_USER);
    setIsGuest(true);
    setCoach(null);
    setAcademy(null);
    const availableModes = getModesForRole("player");
    const defaultMode = getDefaultModeForRole("player");
    setAvailableModesRef.current(availableModes, defaultMode);
    setModeRef.current(defaultMode);
    setIsAuthenticated(true);
  };

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: AuthUser }> => {
    try {
      // Task #1387 — clear persisted god-cache for the previous account
      // before swapping into the new one. See handleUnauthorized.
      await clearGodCache(user?.playerId ?? undefined);
      queryClient.clear();
      
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/login", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || "Login failed" };
      }
      
      await saveAuthState(data.token, data.user, data.refreshToken);
      setAuthToken(data.token);
      await fetchUserData(data.token, true);
      setIsAuthenticated(true);
      
      return { success: true, user: data.user };
    } catch (error: any) {
      console.error("Login error:", error);
      const isNetworkError = error?.message?.includes("fetch") || error?.message?.includes("network") || error?.message?.includes("Failed");
      const errorMsg = isNetworkError 
        ? "Cannot reach the server. Please check your connection and try again."
        : (error?.message || "Login failed. Please try again.");
      return { success: false, error: errorMsg };
    }
  };

  const loginWithToken = async (token: string, user: AuthUser, refreshToken?: string): Promise<void> => {
    // Task #1387 — clear persisted god-cache for the previous account.
    await clearGodCache(user?.playerId ?? undefined);
    queryClient.clear();
    await saveAuthState(token, user, refreshToken);
    setAuthToken(token);
    await fetchUserData(token, true);
    setIsAuthenticated(true);
  };

  const loginWithApple = async (
    identityToken: string,
    appleUser: string,
    email?: string | null,
  ): Promise<{ success: boolean; error?: string; code?: string; user?: AuthUser; linkedToExisting?: boolean }> => {
    try {
      // Task #1387 — clear persisted god-cache for the previous account.
      await clearGodCache(user?.playerId ?? undefined);
      queryClient.clear();

      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/apple/login", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityToken, user: appleUser, email: email || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "Apple Sign-In failed", code: data.code };
      }

      await saveAuthState(data.token, data.user, data.refreshToken);
      setAuthToken(data.token);
      await fetchUserData(data.token, true);
      setIsAuthenticated(true);

      return { success: true, user: data.user, linkedToExisting: !!data.linkedToExisting };
    } catch (error) {
      console.error("Apple login error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const registerWithApple = async (data: {
    identityToken: string;
    appleUser: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth: string;
  }): Promise<{ success: boolean; error?: string; user?: AuthUser }> => {
    try {
      // Task #1387 — clear persisted god-cache for the previous account.
      await clearGodCache(user?.playerId ?? undefined);
      queryClient.clear();

      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/apple/register", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityToken: data.identityToken,
          user: data.appleUser,
          email: data.email ?? null,
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          dateOfBirth: data.dateOfBirth,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        return { success: false, error: body.error || "Apple Sign-In registration failed" };
      }

      await saveAuthState(body.token, body.user, body.refreshToken);
      setAuthToken(body.token);
      await fetchUserData(body.token, true);
      setIsAuthenticated(true);

      return { success: true, user: body.user };
    } catch (error) {
      console.error("Apple register error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const register = async (registerData: RegisterData): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/register", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || "Registration failed" };
      }
      
      await saveAuthState(data.token, data.user, data.refreshToken);
      setAuthToken(data.token);
      await fetchUserData(data.token, true);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      console.error("Registration error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const registerPlayer = async (playerData: PlayerRegisterData): Promise<{ success: boolean; error?: string; requiresOTP?: boolean }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/register/player", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(playerData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Check if OTP verification is required
        if (data.requiresOTP) {
          return { success: false, error: data.error || "Email verification required", requiresOTP: true };
        }
        return { success: false, error: data.error || "Registration failed" };
      }
      
      await saveAuthState(data.token, data.user, data.refreshToken);
      setAuthToken(data.token);
      await fetchUserData(data.token, true);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      console.error("Player registration error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const requestPasswordReset = async (
    identifier: string,
  ): Promise<{ success: boolean; error?: string; noEmail?: boolean; message?: string }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/forgot-password", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || "Could not send reset code." };
      }
      return { success: true, noEmail: !!data?.noEmail, message: data?.message };
    } catch (error) {
      console.error("Forgot password error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const resetPassword = async (
    identifier: string,
    code: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/reset-password", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || "Could not reset password." };
      }
      return { success: true };
    } catch (error) {
      console.error("Reset password error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const resetPasswordWithToken = async (
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/reset-password-token", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || "Could not reset password." };
      }
      return { success: true };
    } catch (error) {
      console.error("Reset password (token) error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const logout = async () => {
    logger.log("[AuthContext] Logout called");
    try {
      // Task #1387 — flush persisted god-cache for the current player
      // BEFORE wiping react-query, so a subsequent login by a different
      // account never hydrates from the previous account's snapshot.
      const prevPlayerId = user?.playerId ?? undefined;
      await clearGodCache(prevPlayerId);
      queryClient.clear();
      await clearAuthState();
      await clearGuestMode();
      setAuthToken(null);
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
      setCoach(null);
      setAcademy(null);
      logoutRevenueCat().catch(() => {});
      logger.log("[AuthContext] Logout successful");
    } catch (error) {
      console.error("[AuthContext] Logout error:", error);
    }
  };

  const refreshAuth = async () => {
    const authState = await loadAuthState();
    if (authState.token) {
      await fetchUserData(authState.token);
    }
  };

  const startImpersonation = async (academyId: string, academyName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const currentAuthState = await loadAuthState();
      if (!currentAuthState.token || !currentAuthState.user) {
        return { success: false, error: "Not authenticated" };
      }

      await AsyncStorage.setItem(IMPERSONATION_ORIGINAL_TOKEN_KEY, currentAuthState.token);
      await AsyncStorage.setItem(IMPERSONATION_ORIGINAL_USER_KEY, JSON.stringify(currentAuthState.user));
      await AsyncStorage.setItem(IMPERSONATION_ORIGINAL_MODE_KEY, mode);

      const response = await apiRequest("POST", `/api/platform/impersonate/${academyId}`);
      const data = await response.json();

      if (!data.success) {
        await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
        await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_USER_KEY);
        await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_MODE_KEY);
        return { success: false, error: data.error || "Impersonation failed" };
      }

      await AsyncStorage.setItem(IMPERSONATION_ACADEMY_NAME_KEY, academyName);
      await saveAuthState(data.token, {
        id: currentAuthState.user.id,
        username: currentAuthState.user.username,
        email: currentAuthState.user.email,
        role: "academy_owner",
        academyId: academyId,
        coachId: data.coachId || null,
        playerId: data.playerId || null,
      });

      setAuthToken(data.token);
      // Task #1387 — clear persisted god-cache for the impersonator's
      // own player profile before swapping into the academy owner's view.
      await clearGodCache(user?.playerId ?? undefined);
      queryClient.clear();
      setIsImpersonating(true);
      setImpersonatedAcademyName(academyName);

      const ownerModes = getModesForRole("academy_owner");
      setAvailableModesRef.current(ownerModes);
      setModeRef.current("academy_owner");

      await fetchUserData(data.token, true);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Impersonation error:", error);
      await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
      await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_USER_KEY);
      await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_MODE_KEY);
      return { success: false, error: "Network error" };
    }
  };

  const stopImpersonation = async () => {
    try {
      const originalToken = await AsyncStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
      const originalUserStr = await AsyncStorage.getItem(IMPERSONATION_ORIGINAL_USER_KEY);
      const originalMode = await AsyncStorage.getItem(IMPERSONATION_ORIGINAL_MODE_KEY);

      await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
      await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_USER_KEY);
      await AsyncStorage.removeItem(IMPERSONATION_ACADEMY_NAME_KEY);
      await AsyncStorage.removeItem(IMPERSONATION_ORIGINAL_MODE_KEY);

      if (originalToken && originalUserStr) {
        const originalUser = JSON.parse(originalUserStr);
        await saveAuthState(originalToken, originalUser);
        setAuthToken(originalToken);
        // Task #1387 — clear god-cache for the impersonated user
        // before swapping back to the impersonator's own session.
        await clearGodCache(user?.playerId ?? undefined);
        queryClient.clear();
        setIsImpersonating(false);
        setImpersonatedAcademyName(null);

        const platformModes = getModesForRole("platform_owner");
        setAvailableModesRef.current(platformModes);
        setModeRef.current((originalMode as any) || "platform");

        await fetchUserData(originalToken, true);
        setIsAuthenticated(true);
      } else {
        setIsImpersonating(false);
        setImpersonatedAcademyName(null);
        await logout();
      }
    } catch (error) {
      console.error("[AuthContext] Stop impersonation error:", error);
      setIsImpersonating(false);
      setImpersonatedAcademyName(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        coach,
        academy,
        isGuest,
        login,
        loginWithToken,
        loginWithApple,
        registerWithApple,
        loginAsGuest,
        register,
        registerPlayer,
        requestPasswordReset,
        resetPassword,
        resetPasswordWithToken,
        logout,
        refreshAuth,
        isImpersonating,
        impersonatedAcademyName,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
