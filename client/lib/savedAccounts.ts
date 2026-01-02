import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export interface SavedAccount {
  username: string;
  displayName: string;
  role: "coach" | "player" | "owner" | "parent";
  avatarUrl?: string;
  lastLogin: number;
}

const SAVED_ACCOUNTS_KEY = "gus_saved_accounts_v2";

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const data = await SecureStore.getItemAsync(SAVED_ACCOUNTS_KEY);
    if (!data) return [];
    const accounts = JSON.parse(data) as SavedAccount[];
    return accounts.sort((a, b) => b.lastLogin - a.lastLogin);
  } catch {
    return [];
  }
}

export async function saveAccount(
  username: string,
  displayName: string,
  role: "coach" | "player" | "owner" | "parent",
  avatarUrl?: string
): Promise<void> {
  try {
    const accounts = await getSavedAccounts();
    const existingIndex = accounts.findIndex(
      (a) => a.username.toLowerCase() === username.toLowerCase()
    );

    const account: SavedAccount = {
      username: username.toLowerCase(),
      displayName,
      role,
      avatarUrl,
      lastLogin: Date.now(),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = account;
    } else {
      accounts.unshift(account);
    }

    const limitedAccounts = accounts.slice(0, 10);
    await SecureStore.setItemAsync(
      SAVED_ACCOUNTS_KEY,
      JSON.stringify(limitedAccounts)
    );
  } catch (error) {
    console.error("Failed to save account:", error);
  }
}

export async function removeAccount(username: string): Promise<void> {
  try {
    const accounts = await getSavedAccounts();
    const filtered = accounts.filter(
      (a) => a.username.toLowerCase() !== username.toLowerCase()
    );
    await SecureStore.setItemAsync(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to remove account:", error);
  }
}

export async function checkBiometricSupport(): Promise<{
  available: boolean;
  biometryType: string | null;
}> {
  try {
    if (Platform.OS === "web") {
      return { available: false, biometryType: null };
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { available: false, biometryType: null };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      return { available: false, biometryType: null };
    }

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let biometryType: string | null = null;

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometryType = "Face ID";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometryType = "Fingerprint";
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometryType = "Iris";
    }

    return { available: true, biometryType };
  } catch {
    return { available: false, biometryType: null };
  }
}
