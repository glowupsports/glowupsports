import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, apiRequest, setSupervisorQueryCoachId, setCoachReadOnlyMode } from "@/lib/query-client";
import { loginRevenueCat, logoutRevenueCat } from "@/lib/revenuecat";
// Task #1455 — `deferredHydrateAndPersist` removed from the bootstrap
// path. The persisted god-cache hydrate was player-only and contributed
// to the "frozen until swipe" iOS cold-start where coach/admin/owner
// roles loaded fine. We now mirror coach: no extra AsyncStorage blob
// read on cold start. `clearGodCache` is still used on logout/401 to
// flush any leftover snapshot from previous sessions.
import {
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
  saveGuestMode,
  isGuestMode,
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

// Task #1466 — player record folded into /api/me, mirroring the coach
// contract. `usePlayer()` reads from `useAuth().player` so cold-start
// Home paints with real player data on the first frame, no separate
// `/api/player/me` round-trip. Shape must match `buildAuthPlayerPayload`
// in server/routes/player-auth.ts.
export interface AuthPlayer {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  ballLevel: string | null;
  level: number;
  xp: number;
  glowScore: number;
  dateOfBirth: string | null;
  academyId: string | null;
  coachId: string | null;
  profilePhotoUrl: string | null;
  isAdult: boolean;
  glowMmr: number;
  glowRank: number;
  totalMatchesPlayed: number;
  chatEnabled: boolean | null;
  communityEnabled: boolean | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  attendanceStreak: number | null;
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
  player: AuthPlayer | null;
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
  // Task #1467 — partial in-place updater for `player`. Lets the
  // player home/AI Coach god-route success paths mirror fresh
  // dashboard/profile fields (level, xp, glowScore, glowMmr,
  // glowRank, totalMatchesPlayed, profilePhotoUrl, ...) back into
  // AuthContext.player so screens that read via `usePlayer()`
  // (Growth, Me, profile header, etc.) stay live without the user
  // having to background + foreground the app or trigger a full
  // `refreshAuth()`. No-op when the user is not a player.
  patchPlayer: (patch: Partial<AuthPlayer>) => void;
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
  const [player, setPlayer] = useState<AuthPlayer | null>(null);
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
        logger.log("[AuthContext] Received user data:", { hasUser: !!data.user, hasCoach: !!data.coach, hasAcademy: !!data.academy, hasPlayer: !!data.player });
        setUser(data.user);
        setCoach(data.coach);
        setAcademy(data.academy);
        // Task #1466 — fold player into auth state. PlayerContext now
        // reads from useAuth().player instead of a second `/api/player/me`
        // round-trip, mirroring how CoachContext derives coach from auth.
        setPlayer(data.player ?? null);

        // Task #1455 — god-cache hydrate removed from the login-success
        // path. Coach/admin/owner never ran this and load instantly;
        // the player-only AsyncStorage blob read was a measurable
        // bridge-stall on iOS cold start. The home god-query
        // (`/api/player/me/home-data`) replaces the persisted snapshot
        // as the source of truth and arrives before the user can read
        // the screen anyway.

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
    setPlayer(null);
    // Clear supervisor mode module-level flags so a new login never
    // inherits a previous session's supervisor state.
    setSupervisorQueryCoachId(null);
    setCoachReadOnlyMode(false);
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

        // Task #1580 — restore guest session for returning guests. If the
        // guest flag is set but there's no real auth token, re-enter guest
        // mode so the login screen is skipped, just like a logged-in user.
        const guestFlag = await isGuestMode();
        if (guestFlag) {
          // Keep the flag in place so each subsequent cold-start also restores
          // guest mode automatically, until the user explicitly signs in/out.
          logger.log("[AuthContext] Restoring guest session");
          setUser(GUEST_USER);
          setIsGuest(true);
          const guestModes = getModesForRole("player");
          const guestDefault = getDefaultModeForRole("player");
          setAvailableModesRef.current(guestModes, guestDefault);
          setModeRef.current(guestDefault);
          setIsAuthenticated(true);
          if (isMounted) setIsLoading(false);
          return;
        }

        await clearGuestMode();

        const authState = await loadAuthState();
        logger.log("[AuthContext] Loaded auth state:", { hasToken: !!authState.token, hasUser: !!authState.user });
        
        if (authState.token && authState.user && isMounted) {
          setAuthToken(authState.token);
          // Task #1455 — god-cache hydrate removed from the
          // session-restore path. Coach/admin/owner never had this and
          // load fine; the player-only blob hydrate was the largest
          // remaining cold-start hit on iOS Fabric. The home
          // god-query fires immediately on tab-mount and that single
          // round-trip is faster than the AsyncStorage read + replay
          // it used to fall back to.
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
    setPlayer(null);
    const availableModes = getModesForRole("player");
    const defaultMode = getDefaultModeForRole("player");
    setAvailableModesRef.current(availableModes, defaultMode);
    setModeRef.current(defaultMode);
    // Task #1580 — persist guest flag so returning guests skip the login
    // screen until they explicitly sign in or out.
    await saveGuestMode();
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
      
      let data: any;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: response.status >= 500
            ? "The server is temporarily starting up. Please try again in a moment."
            : "Unexpected server response. Please try again.",
        };
      }

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

  const loginWithToken = async (token: string, incomingUser: AuthUser, refreshToken?: string): Promise<void> => {
    // Task #1387 — clear persisted god-cache for the previous (state)
    // account. The parameter is named `incomingUser` deliberately so it
    // does NOT shadow the closure's state `user`. The earlier name
    // `user` caused us to clear the *incoming* account's cache while
    // leaving the outgoing player's blob on disk — meaning the next
    // cold start could re-hydrate the wrong player. Caught in #1387
    // code review on 2026-04-26.
    await clearGodCache(user?.playerId ?? undefined);
    queryClient.clear();
    await saveAuthState(token, incomingUser, refreshToken);
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

      let data: any;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: response.status >= 500
            ? "The server is temporarily starting up. Please try again in a moment."
            : "Unexpected server response. Please try again.",
        };
      }

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

      let body: any;
      try {
        body = await response.json();
      } catch {
        return {
          success: false,
          error: response.status >= 500
            ? "The server is temporarily starting up. Please try again in a moment."
            : "Unexpected server response. Please try again.",
        };
      }

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
      setPlayer(null);
      // Clear supervisor mode module-level flags so a new login never
      // inherits this session's supervisor state.
      setSupervisorQueryCoachId(null);
      setCoachReadOnlyMode(false);
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

  // Task #1467 — see interface comment. Functional setState so we
  // never overwrite an unrelated field that came in from a concurrent
  // /api/me refresh, and never touch state when there is no player
  // (coach/admin/owner sessions).
  const patchPlayer = useCallback((patch: Partial<AuthPlayer>) => {
    setPlayer((prev) => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
  }, []);

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
        player,
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
        patchPlayer,
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
