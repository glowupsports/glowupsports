import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "@auth_token";
const AUTH_USER_KEY = "@auth_user";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  playerId: string | null;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
}

let currentToken: string | null = null;

export function getAuthToken(): string | null {
  return currentToken;
}

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

export async function loadAuthState(): Promise<AuthState> {
  try {
    const [token, userJson] = await Promise.all([
      AsyncStorage.getItem(AUTH_TOKEN_KEY),
      AsyncStorage.getItem(AUTH_USER_KEY),
    ]);
    
    if (token) {
      currentToken = token;
    }
    
    const user = userJson ? JSON.parse(userJson) : null;
    
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
    await Promise.all([
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
      AsyncStorage.removeItem(AUTH_USER_KEY),
    ]);
  } catch (error) {
    console.error("Failed to clear auth state:", error);
  }
}
