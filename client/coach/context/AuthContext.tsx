import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { loginRevenueCat, logoutRevenueCat } from "@/lib/revenuecat";
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
  loginWithToken: (token: string, user: AuthUser) => Promise<void>;
  loginWithApple: (identityToken: string, appleUser: string) => Promise<{ success: boolean; error?: string; code?: string; user?: AuthUser }>;
  loginAsGuest: () => Promise<void>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  registerPlayer: (data: PlayerRegisterData) => Promise<{ success: boolean; error?: string; requiresOTP?: boolean }>;
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
    queryClient.clear();
    await clearAuthState();
    setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
    setCoach(null);
    setAcademy(null);
  }, [queryClient, isGuest]);

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

  const loginWithToken = async (token: string, user: AuthUser): Promise<void> => {
    queryClient.clear();
    await saveAuthState(token, user);
    setAuthToken(token);
    await fetchUserData(token, true);
    setIsAuthenticated(true);
  };

  const loginWithApple = async (identityToken: string, appleUser: string): Promise<{ success: boolean; error?: string; code?: string; user?: AuthUser }> => {
    try {
      queryClient.clear();
      
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/apple/login", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityToken, user: appleUser }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || "Apple Sign-In failed", code: data.code };
      }
      
      await saveAuthState(data.token, data.user, data.refreshToken);
      setAuthToken(data.token);
      await fetchUserData(data.token, true);
      setIsAuthenticated(true);
      
      return { success: true, user: data.user };
    } catch (error) {
      console.error("Apple login error:", error);
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

  const logout = async () => {
    logger.log("[AuthContext] Logout called");
    try {
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
        loginAsGuest,
        register,
        registerPlayer,
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
