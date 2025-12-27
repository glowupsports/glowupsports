import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { getApiUrl } from "@/lib/query-client";
import { 
  loadAuthState, 
  saveAuthState, 
  clearAuthState, 
  setAuthToken,
  AuthUser 
} from "@/lib/auth";

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

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  coach: Coach | null;
  academy: Academy | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
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

  const fetchUserData = useCallback(async (token: string) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/api/me", apiUrl).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setCoach(data.coach);
        setAcademy(data.academy);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to fetch user data:", error);
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      try {
        const authState = await loadAuthState();
        
        if (authState.token && authState.user && isMounted) {
          setAuthToken(authState.token);
          const success = await fetchUserData(authState.token);
          if (success && isMounted) {
            setIsAuthenticated(true);
          } else {
            await clearAuthState();
          }
        }
      } catch (error) {
        console.error("Auth init error:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    initAuth();
    
    return () => {
      isMounted = false;
    };
  }, [fetchUserData]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/auth/login", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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

  const logout = async () => {
    try {
      await clearAuthState();
      setAuthToken(null);
      setIsAuthenticated(false);
      setUser(null);
      setCoach(null);
      setAcademy(null);
    } catch (error) {
      console.error("Logout error:", error);
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
