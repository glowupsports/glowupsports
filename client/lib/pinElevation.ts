// Family B — In-memory cache for the short-lived PIN-elevation token used by
// member-invite calls (and any other "fresh-PIN-required" surface). Lives in
// JS memory only — never persisted, never serialized.
//
// The server issues these via POST /api/family/elevate-pin with a 5-min TTL.
// Clients call requireElevatedPin() to grab a header value to attach to a
// privileged request; if the cached one is missing or stale, the caller is
// expected to prompt the user for their PIN and then call setElevationToken().

let elevationToken: string | null = null;
let elevationExpiresAt: number = 0;

const SAFETY_BUFFER_MS = 30 * 1000; // refresh ~30s before actual expiry

export function setElevationToken(token: string, ttlSeconds: number): void {
  elevationToken = token;
  elevationExpiresAt = Date.now() + ttlSeconds * 1000;
}

export function clearElevationToken(): void {
  elevationToken = null;
  elevationExpiresAt = 0;
}

export function getElevationToken(): string | null {
  if (!elevationToken) return null;
  if (Date.now() + SAFETY_BUFFER_MS > elevationExpiresAt) {
    clearElevationToken();
    return null;
  }
  return elevationToken;
}

/** Returns headers to attach to a privileged request, or null if not elevated. */
export function getElevationHeaders(): Record<string, string> | null {
  const tok = getElevationToken();
  if (!tok) return null;
  return { "X-PIN-Elevation": tok };
}
