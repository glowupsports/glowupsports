declare module "react-native-health" {
  export interface HealthKitPermissions {
    permissions: {
      read?: string[];
      write?: string[];
    };
  }

  export interface SaveWorkoutOptions {
    type: string;
    startDate: string;
    endDate: string;
    energyBurned?: number;
    energyBurnedUnit?: string;
    distance?: number;
    distanceUnit?: string;
  }

  export const HealthInputOptions: {
    Workout: {
      Tennis: string;
      Running: string;
      Walking: string;
      Cycling: string;
      [key: string]: string;
    };
  };

  export const HealthUnit: {
    calorie: "calorie";
    kilocalorie: "kilocalorie";
    meter: "meter";
    mile: "mile";
    [key: string]: string;
  };

  interface AppleHealthKit {
    initHealthKit(
      permissions: HealthKitPermissions,
      callback: (err: string, results: Record<string, unknown>) => void,
    ): void;
    saveWorkout(
      options: SaveWorkoutOptions,
      callback: (err: string | null, results: unknown) => void,
    ): void;
    isAvailable(callback: (err: unknown, available: boolean) => void): void;
  }

  const AppleHealthKit: AppleHealthKit;
  export default AppleHealthKit;
}
