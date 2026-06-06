// Web shim for expo-notifications.
// The real package's DevicePushTokenAutoRegistration.fx.js side-effect module
// fires async operations with no .catch() at module-eval time on web, which
// produces a non-Error Promise rejection. React Native Web escalates that to a
// CDP Runtime.exceptionThrown event that Replit's canvas labels as a crash.
// Push notifications are not available on web anyway, so we replace the entire
// module with safe no-ops.
//
// ALL call-sites in usePushNotifications.ts, PlayerOnboardingV2.tsx, and
// FeedbackToast.tsx are already guarded by Platform.OS checks or are safe to
// call as no-ops on web.

const noop = () => {};
const noopAsync = async () => {};
const fakeSubscription = { remove: noop };

export const setNotificationHandler = noop;

export const addNotificationReceivedListener = (_listener: unknown) =>
  fakeSubscription;

export const addNotificationResponseReceivedListener = (_listener: unknown) =>
  fakeSubscription;

export const getPermissionsAsync = async () => ({
  status: "undetermined",
  granted: false,
  canAskAgain: false,
  expires: "never" as const,
  ios: undefined,
  android: undefined,
});

export const requestPermissionsAsync = async () => ({
  status: "denied",
  granted: false,
  canAskAgain: false,
  expires: "never" as const,
  ios: undefined,
  android: undefined,
});

export const setNotificationChannelAsync = noopAsync;
export const getDevicePushTokenAsync = noopAsync;
export const getExpoPushTokenAsync = noopAsync;
export const scheduleNotificationAsync = noopAsync;
export const cancelScheduledNotificationAsync = noopAsync;
export const cancelAllScheduledNotificationsAsync = noopAsync;
export const dismissAllNotificationsAsync = noopAsync;
export const getBadgeCountAsync = async () => 0;
export const setBadgeCountAsync = noopAsync;

export const SchedulableTriggerInputTypes = {
  TIME_INTERVAL: "timeInterval" as const,
  CALENDAR: "calendar" as const,
  DATE: "date" as const,
  DAILY: "daily" as const,
  WEEKLY: "weekly" as const,
  YEARLY: "yearly" as const,
};

export const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};

export type EventSubscription = typeof fakeSubscription;
export type Notification = Record<string, unknown>;
export type NotificationResponse = Record<string, unknown>;
