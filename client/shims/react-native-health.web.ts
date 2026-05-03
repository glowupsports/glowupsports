const AppleHealthKit: any = {
  initHealthKit: () => {},
  getAuthStatus: (_opts: any, cb: any) => cb(null, { permissions: {} }),
  requestPermissions: (_opts: any, cb: any) => cb(null),
  saveWorkout: (_opts: any, cb: any) => cb(null),
  getStepCount: (_opts: any, cb: any) => cb(null, { value: 0 }),
  getSleepSamples: (_opts: any, cb: any) => cb(null, []),
  getHeartRateSamples: (_opts: any, cb: any) => cb(null, []),
};

export const HealthInputOptions = {
  Workout: { Tennis: "Tennis" },
  Permissions: {},
};

export const HealthKitPermissions = {};

export default AppleHealthKit;
