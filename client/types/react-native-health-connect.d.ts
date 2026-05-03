declare module "react-native-health-connect" {
  export interface TimeRangeFilter {
    operator: "between";
    startTime: string;
    endTime: string;
  }

  export interface ExerciseSessionRecord {
    recordType: "ExerciseSession";
    startTime: string;
    endTime: string;
    exerciseType: number;
    title?: string;
  }

  export interface EnergyRecord {
    unit: "kilocalories" | "calories" | "joules" | "kilojoules";
    value: number;
  }

  export interface ActiveCaloriesBurnedRecord {
    recordType: "ActiveCaloriesBurned";
    startTime: string;
    endTime: string;
    energy: EnergyRecord;
  }

  export type HealthRecord = ExerciseSessionRecord | ActiveCaloriesBurnedRecord;

  export interface InsertRecordsResult {
    recordIdsList: string[];
  }

  /** Exercise type constants — subset relevant to this app */
  export const ExerciseSessionType: {
    TENNIS: 76;
    RUNNING: 56;
    WALKING: 79;
    CYCLING: 8;
    [key: string]: number;
  };

  export function initialize(): Promise<boolean>;
  export function requestPermission(
    permissions: Array<{ accessType: "read" | "write"; recordType: string }>,
  ): Promise<boolean>;
  export function insertRecords(records: HealthRecord[]): Promise<InsertRecordsResult>;
}
