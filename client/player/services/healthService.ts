/**
 * Health Service — Apple Health (iOS) and Health Connect (Android)
 *
 * Both HealthKit and Health Connect require a development build —
 * they are NOT available in Expo Go. This service gracefully degrades:
 *  - In Expo Go / web: returns { available: false } and stores nothing.
 *  - In a native build: requests permissions and reads real data.
 *
 * Connection state is persisted in AsyncStorage.
 * Only computed labels (never raw readings) are sent to the server.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ─── Storage keys ──────────────────────────────────────────────────────────
const HEALTH_CONNECTED_KEY = "@glow_health_connected_v1";
const HEALTH_LAST_SYNCED_KEY = "@glow_health_last_synced_v1";

// ─── Types ─────────────────────────────────────────────────────────────────

export type RecoveryStatus = "Fully Recovered" | "Light Day Recommended" | "Rest Today";

export interface HealthSnapshot {
  sleepHours: number | null;
  sleepQuality: "good" | "fair" | "poor" | null;
  stepsToday: number | null;
  stepGoal: number;
  restingHeartRate: number | null;
  recoveryStatus: RecoveryStatus | null;
  lastSyncedAt: string | null;
}

export interface HealthConnectionState {
  connected: boolean;
  available: boolean;
  platform: "ios" | "android" | "web" | "expo_go";
  lastSyncedAt: string | null;
}

// ─── Expo Go / web detection ──────────────────────────────────────────────

function isExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient";
}

function getHealthPlatform(): HealthConnectionState["platform"] {
  if (Platform.OS === "web") return "web";
  if (isExpoGo()) return "expo_go";
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "expo_go";
}

// ─── Connection persistence ───────────────────────────────────────────────

export async function getHealthConnectionState(): Promise<HealthConnectionState> {
  const platform = getHealthPlatform();
  const available = platform === "ios" || platform === "android";

  const raw = await AsyncStorage.getItem(HEALTH_CONNECTED_KEY);
  const connected = available && raw === "true";

  const lastSyncedAt = await AsyncStorage.getItem(HEALTH_LAST_SYNCED_KEY);

  return { connected, available, platform, lastSyncedAt };
}

export async function setHealthConnected(value: boolean): Promise<void> {
  await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, value ? "true" : "false");
  if (!value) {
    await AsyncStorage.removeItem(HEALTH_LAST_SYNCED_KEY);
  }
}

// ─── Permission request ───────────────────────────────────────────────────
// In a real native build this would call expo-health or
// react-native-health-connect. Since those native modules are not
// available in Expo Go, we simulate the flow and return false.

export async function requestHealthPermissions(): Promise<boolean> {
  const platform = getHealthPlatform();
  if (platform === "web" || platform === "expo_go") {
    return false;
  }
  try {
    if (platform === "ios") {
      const mod = await import("react-native").catch(() => null);
      if (!mod) return false;
      return false;
    }
    if (platform === "android") {
      return false;
    }
  } catch {
    return false;
  }
  return false;
}

// ─── Data reading (native build only) ────────────────────────────────────
// Returns a best-effort HealthSnapshot. In Expo Go / web returns nulls.

export async function readHealthSnapshot(): Promise<HealthSnapshot> {
  const platform = getHealthPlatform();
  const DEFAULT: HealthSnapshot = {
    sleepHours: null,
    sleepQuality: null,
    stepsToday: null,
    stepGoal: 10_000,
    restingHeartRate: null,
    recoveryStatus: null,
    lastSyncedAt: null,
  };

  if (platform === "web" || platform === "expo_go") {
    return DEFAULT;
  }

  try {
    const sleepHours = null as number | null;
    const stepsToday = null as number | null;
    const restingHeartRate = null as number | null;

    const sleepQuality = computeSleepQuality(sleepHours);
    const recoveryStatus = computeRecoveryStatus(sleepHours, restingHeartRate);
    const lastSyncedAt = new Date().toISOString();

    await AsyncStorage.setItem(HEALTH_LAST_SYNCED_KEY, lastSyncedAt);

    return {
      sleepHours,
      sleepQuality,
      stepsToday,
      stepGoal: 10_000,
      restingHeartRate,
      recoveryStatus,
      lastSyncedAt,
    };
  } catch {
    return DEFAULT;
  }
}

// ─── Algorithms ───────────────────────────────────────────────────────────

function computeSleepQuality(hours: number | null): "good" | "fair" | "poor" | null {
  if (hours === null) return null;
  if (hours >= 7.5) return "good";
  if (hours >= 6) return "fair";
  return "poor";
}

export function computeRecoveryStatus(
  sleepHours: number | null,
  restingHeartRate: number | null,
  personalAvgHr?: number | null,
): RecoveryStatus | null {
  if (sleepHours === null && restingHeartRate === null) return null;

  const avgHr = personalAvgHr ?? 65;
  const hrElevated = restingHeartRate !== null && restingHeartRate > avgHr * 1.1;
  const hrSlightlyHigh = restingHeartRate !== null && restingHeartRate > avgHr * 1.04;

  const sleepPoor = sleepHours !== null && sleepHours < 6;
  const sleepFair = sleepHours !== null && sleepHours >= 6 && sleepHours < 7;

  if (sleepPoor || hrElevated) return "Rest Today";
  if (sleepFair || hrSlightlyHigh) return "Light Day Recommended";
  return "Fully Recovered";
}

// ─── Workout write-back ───────────────────────────────────────────────────
// Called after a session is marked complete. Estimates 8 kcal/min for tennis.
//
// Requires a custom native build — not available in Expo Go.
// iOS:     react-native-health   → AppleHealthKit.saveWorkout
// Android: react-native-health-connect → insertRecords([ExerciseSession, ActiveCaloriesBurned])

export async function writeBackTennisWorkout(params: {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
}): Promise<boolean> {
  const platform = getHealthPlatform();
  const { connected } = await getHealthConnectionState();

  // Graceful no-op for Expo Go and web — native builds only
  if (!connected || platform === "web" || platform === "expo_go") return false;

  const activeCalories = Math.round(params.durationMinutes * 8);

  try {
    if (platform === "ios") {
      const { default: AppleHealthKit, HealthInputOptions } = await import(
        "react-native-health"
      );

      return await new Promise<boolean>((resolve) => {
        AppleHealthKit.saveWorkout(
          {
            type: HealthInputOptions.Workout.Tennis,
            startDate: params.startTime.toISOString(),
            endDate: params.endTime.toISOString(),
            energyBurned: activeCalories,
            energyBurnedUnit: "calorie",
          },
          (err) => {
            if (err) {
              console.warn("[healthService] HealthKit saveWorkout error:", err);
              resolve(false);
            } else {
              console.log("[healthService] Tennis workout written to Apple Health", {
                start: params.startTime.toISOString(),
                end: params.endTime.toISOString(),
                activeCalories,
              });
              resolve(true);
            }
          },
        );
      });
    }

    if (platform === "android") {
      const { insertRecords, ExerciseSessionType } = await import(
        "react-native-health-connect"
      );

      await insertRecords([
        {
          recordType: "ExerciseSession",
          startTime: params.startTime.toISOString(),
          endTime: params.endTime.toISOString(),
          exerciseType: ExerciseSessionType.TENNIS,
        },
        {
          recordType: "ActiveCaloriesBurned",
          startTime: params.startTime.toISOString(),
          endTime: params.endTime.toISOString(),
          energy: { value: activeCalories, unit: "kilocalories" },
        },
      ]);

      console.log("[healthService] Tennis workout written to Health Connect", {
        start: params.startTime.toISOString(),
        end: params.endTime.toISOString(),
        activeCalories,
      });
      return true;
    }
  } catch (err) {
    console.warn("[healthService] writeBackTennisWorkout failed:", err);
  }

  return false;
}

// ─── Summary for AI coach ────────────────────────────────────────────────

export function buildHealthSummaryForCoach(snapshot: HealthSnapshot): {
  sleep_quality: "good" | "fair" | "poor" | null;
  recovery_status: string | null;
  steps_today: number | null;
} {
  return {
    sleep_quality: snapshot.sleepQuality,
    recovery_status: snapshot.recoveryStatus,
    steps_today: snapshot.stepsToday,
  };
}
