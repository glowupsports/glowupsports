// Module-level singleton for guest intent persistence.
// Stores a serializable navigation intent (route name + params) — NOT
// raw closures — so the stored value is safe across component remounts
// and navigator resets that occur during the logout → login flow.

export interface GuestIntent {
  routeName: string;
  routeParams?: Record<string, unknown>;
}

let _pendingIntent: GuestIntent | null = null;

export function storePendingGuestIntent(intent: GuestIntent): void {
  _pendingIntent = intent;
}

export function consumePendingGuestIntent(): GuestIntent | null {
  const intent = _pendingIntent;
  _pendingIntent = null;
  return intent;
}

export function clearPendingGuestIntent(): void {
  _pendingIntent = null;
}

export function hasPendingGuestIntent(): boolean {
  return _pendingIntent !== null;
}
