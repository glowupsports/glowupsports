import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { getApiUrl } from "@/lib/query-client";
import { 
  loadAuthState, 
  saveAuthState, 
  clearAuthState, 
  setAuthToken,
  AuthUser 
} from "@/lib/auth";
import { useAppMode, getModesForRole, getDefaultModeForRole } from "@/context/AppModeContext";

interface Coach {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  level: number | null;
  totalXp: number | null;
  academyId: string | null;
}

interface Academy {
  id: string;
  name: string;
  slug: string;
}

interface PlayerRegisterData {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  coach: Coach | null;
  academy: Academy | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  registerPlayer: (data: PlayerRegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  academyName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [academy, setAcademy] = useState<Academy | null>(null);
  const { setMode, setAvailableModes } = useAppMode();
  const setAvailableModesRef = useRef(setAvailableModes);
  setAvailableModesRef.current = setAvailableModes;

  const fetchUserData = useCallback(async (token: string) => {
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
        console.log("[AuthContext] Received user data:", { hasUser: !!data.user, hasCoach: !!data.coach, hasAcademy: !!data.academy });
        setUser(data.user);
        setCoach(data.coach);
        setAcademy(data.academy);
        
        const userRole = data.user?.role || "player";
        const availableModes = getModesForRole(userRole);
        const defaultMode = getDefaultModeForRole(userRole);
        console.log("[AuthContext] Setting modes for role:", userRole, "modes:", availableModes, "default:", defaultMode);
        setAvailableModesRef.current(availableModes, defaultMode);
        
        return true;
      }
      console.log("[AuthContext] /api/me returned status:", response.status);
      return false;
    } catch (error) {
      console.error("[AuthContext] Failed to fetch user data:", error);
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      console.log("[AuthContext] Starting auth init...");
      try {
        const authState = await loadAuthState();
        console.log("[AuthContext] Loaded auth state:", { hasToken: !!authState.token, hasUser: !!authState.user });
        
        if (authState.token && authState.user && isMounted) {
          setAuthToken(authState.token);
          console.log("[AuthContext] Fetching user data...");
          const success = await fetchUserData(authState.token);
          console.log("[AuthContext] Fetch user data result:", success);
          if (success && isMounted) {
            setIsAuthenticated(true);
            console.log("[AuthContext] User authenticated successfully");
          } else {
            console.log("[AuthContext] Clearing auth state due to failed fetch");
            await clearAuthState();
          }
        } else {
          console.log("[AuthContext] No stored auth state, showing login");
        }
      } catch (error) {
        console.error("[AuthContext] Auth init error:", error);
      } finally {
        if (isMounted) {
          console.log("[AuthContext] Setting isLoading to false");
          setIsLoading(false);
        }
      }
    };
    
    initAuth();
    
    return () => {
      isMounted = false;
    };
  }, [fetchUserData]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
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
      
      await saveAuthState(data.token, data.user);
      setAuthToken(data.token);
      await fetchUserData(data.token);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
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
      
      await saveAuthState(data.token, data.user);
      setAuthToken(data.token);
      await fetchUserData(data.token);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      console.error("Registration error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const registerPlayer = async (playerData: PlayerRegisterData): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/register/player", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(playerData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || "Registration failed" };
      }
      
      await saveAuthState(data.token, data.user);
      setAuthToken(data.token);
      await fetchUserData(data.token);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      console.error("Player registration error:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const logout = async () => {
    console.log("[AuthContext] Logout called");
    try {
      await clearAuthState();
      setAuthToken(null);
      setIsAuthenticated(false);
      setUser(null);
      setCoach(null);
      setAcademy(null);
      console.log("[AuthContext] Logout successful");
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

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        coach,
        academy,
        login,
        register,
        registerPlayer,
        logout,
        refreshAuth,
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
