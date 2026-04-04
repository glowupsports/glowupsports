import { createClient } from '@replit/revenuecat-sdk/client';
import { listCustomerActiveEntitlements, type CustomerEntitlement } from '@replit/revenuecat-sdk';

interface ConnectionSettings {
  settings: {
    expires_at?: string;
    access_token?: string;
    oauth?: { credentials?: { access_token?: string } };
  };
}

let connectionSettings: ConnectionSettings | null = null;

async function getApiKey(): Promise<string> {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token!;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=revenuecat',
    {
      headers: {
        Accept: 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    }
  );
  const json = await response.json();
  connectionSettings = json.items?.[0] as ConnectionSettings | null;

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('RevenueCat not connected');
  }
  return accessToken;
}

export async function getUncachableRevenueCatClient() {
  const apiKey = await getApiKey();
  return createClient({
    baseUrl: 'https://api.revenuecat.com/v2',
    headers: { Authorization: 'Bearer ' + apiKey },
  });
}

const REVENUECAT_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

/**
 * Check if a user has an active RevenueCat entitlement.
 * Returns null if RevenueCat is not configured (caller should fall back to other checks).
 * Returns false if configured but the user has no active entitlement.
 */
export async function hasActiveEntitlement(
  userId: string,
  entitlementIdentifier: string
): Promise<boolean | null> {
  if (!REVENUECAT_PROJECT_ID) {
    return null;
  }

  try {
    const client = await getUncachableRevenueCatClient();

    const { data, error } = await listCustomerActiveEntitlements({
      client,
      path: { project_id: REVENUECAT_PROJECT_ID, customer_id: userId },
      query: { limit: 20 },
    });

    if (error) {
      if (typeof error === 'object' && 'type' in error && error.type === 'customer_not_found') {
        return false;
      }
      console.error('[RevenueCat] Error fetching entitlements:', error);
      return null;
    }

    const items: CustomerEntitlement[] = data?.items ?? [];
    return items.some((e) => e.lookup_key === entitlementIdentifier);
  } catch (err) {
    console.error('[RevenueCat] hasActiveEntitlement failed:', err);
    return null;
  }
}
