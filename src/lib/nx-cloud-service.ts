import { NextRequest } from "next/server";

export const CLOUD_HOST = "https://nxvms.com";
export const DEFAULT_CLIENT_ID = "api-tool";

export interface NxCloudSystem {
  id: string;
  name: string;
  accessRole?: string;
  stateOfHealth?: string;
  ownerAccountEmail?: string;
  isOnline?: boolean;
  version?: string;
}

export interface NormalizedDevice {
  id: string;
  name: string;
  status: string;
  serverId: string;
  vendor: string;
  model: string;
  deviceType: string;
  lastSeen?: string | number;
  offlineTime?: string | number;
  [key: string]: any;
}

// In-memory cache for system-scoped access tokens to minimize token requests
// Key: `${refreshToken.substring(0, 16)}:${cloudSystemId}`, Value: { token: string, expiresAt: number }
const systemTokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * 1. Build Nx Cloud Authorization URL
 */
export function getNxAuthorizationUrl(redirectUrl: string, clientId: string = DEFAULT_CLIENT_ID): string {
  const authUrl = new URL(`${CLOUD_HOST}/authorize`);
  authUrl.searchParams.set("redirect_url", redirectUrl);
  authUrl.searchParams.set("client_id", clientId);
  return authUrl.toString();
}

/**
 * 2. Exchange OAuth Authorization Code for Access & Refresh Tokens
 */
export async function exchangeNxAuthorizationCode(code: string, clientId: string = DEFAULT_CLIENT_ID): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  user_email?: string;
}> {
  const response = await fetch(`${CLOUD_HOST}/cdb/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      response_type: "token",
      code,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to exchange authorization code: HTTP ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * 3. Refresh Nx Cloud Token or Request Scoped Token
 */
export async function refreshNxCloudToken(
  refreshToken: string,
  scope?: string,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}> {
  const bodyPayload: Record<string, string> = {
    grant_type: "refresh_token",
    response_type: "token",
    refresh_token: refreshToken,
  };

  if (clientId) {
    bodyPayload["client_id"] = clientId;
  }

  if (scope) {
    bodyPayload["scope"] = scope;
  }

  const response = await fetch(`${CLOUD_HOST}/cdb/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh token (scope: ${scope || "global"}): HTTP ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * 4. Get Systems Accessible to Account (Owned + Shared)
 */
export async function getNxSystems(accessToken: string): Promise<NxCloudSystem[]> {
  const response = await fetch(`${CLOUD_HOST}/api/systems/`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch cloud systems: HTTP ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data) ? data : data?.items || [];

  return rawList.map((sys: any) => ({
    id: sys.id || sys.cloudSystemId,
    name: sys.name || sys.systemName || sys.id,
    accessRole: sys.accessRole || "user",
    stateOfHealth: sys.stateOfHealth || (sys.isOnline ? "online" : "offline"),
    ownerAccountEmail: sys.ownerAccountEmail,
    isOnline: sys.isOnline !== undefined ? sys.isOnline : sys.stateOfHealth === "online",
    version: sys.version,
  }));
}

/**
 * 5. Generate System-Scoped Token
 * Requests a token specifically scoped to cloudSystemId using scope="cloudSystemId=<cloudSystemId>"
 * Caches token in memory until near expiration (default 5 minutes buffer).
 */
export async function getNxSystemToken(refreshToken: string, cloudSystemId: string): Promise<string> {
  const cacheKey = `${refreshToken.substring(0, 16)}:${cloudSystemId}`;
  const now = Date.now();
  const cached = systemTokenCache.get(cacheKey);

  if (cached && cached.expiresAt > now + 30000) {
    return cached.token;
  }

  const scope = `cloudSystemId=${cloudSystemId}`;
  const tokenData = await refreshNxCloudToken(refreshToken, scope);

  const expiresInMs = (tokenData.expires_in || 3600) * 1000;
  systemTokenCache.set(cacheKey, {
    token: tokenData.access_token,
    expiresAt: now + expiresInMs,
  });

  return tokenData.access_token;
}

/**
 * 6. Get Device List from Nx Witness System via Relay
 * - Target: https://{cloudSystemId}.relay.vmsproxy.com/rest/v4/devices
 * - Manually handles HTTP 307/301/302/308 redirects while PRESERVING Authorization header.
 * - Normalizes camera device response and strips sensitive credentials / internal URLs.
 */
export async function getNxDevices(cloudSystemId: string, systemAccessToken: string): Promise<NormalizedDevice[]> {
  const cleanId = cloudSystemId.trim().replace(/[{}]/g, "");
  const initialUrl = `https://${cleanId}.relay.vmsproxy.com/rest/v4/devices`;
  const headers = {
    Authorization: `Bearer ${systemAccessToken}`,
    Accept: "application/json",
  };

  let response = await fetch(initialUrl, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  // Handle Nx Relay 307/301/302/308 redirects while explicitly preserving Authorization header
  if ([301, 302, 307, 308].includes(response.status)) {
    const redirectUrl = response.headers.get("location");
    if (redirectUrl) {
      console.log(`[NxRelay] Following HTTP ${response.status} redirect to: ${redirectUrl}`);
      response = await fetch(redirectUrl, {
        method: "GET",
        headers,
      });
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch devices from system ${cleanId}: HTTP ${response.status} - ${errorText.substring(0, 250)}`);
  }

  const rawDevices = await response.json();
  const deviceList = Array.isArray(rawDevices) ? rawDevices : rawDevices?.items || [];

  return deviceList.map((d: any) => {
    // Determine online/offline status
    let statusStr = "Offline";
    if (d.status === "Online" || d.status === "online" || d.state === "Online" || d.isOnline === true) {
      statusStr = "Online";
    } else if (d.status) {
      statusStr = String(d.status);
    }

    return {
      ...d,
      id: String(d.id || d.guid || ""),
      name: String(d.name || d.userDefinedName || "Camera"),
      status: statusStr,
      serverId: String(d.serverId || d.serverIdGuid || ""),
      vendor: String(d.vendor || d.manufacturer || "Generic"),
      model: String(d.model || "IP Camera"),
      deviceType: String(d.deviceType || d.type || "Camera"),
      lastSeen: d.lastSeen || d.offlineTime || d.updatedAt,
    };
  });
}

/**
 * 7. Get Event Log from Nx Witness System via Relay
 * - Target: https://{cloudSystemId}.relay.vmsproxy.com/api/getEvents
 * - Manually handles HTTP 307/301/302/308 redirects preserving Authorization header.
 */
export async function getNxEvents(cloudSystemId: string, systemAccessToken: string): Promise<any[]> {
  const cleanId = cloudSystemId.trim().replace(/[{}]/g, "");
  const headers = {
    Authorization: `Bearer ${systemAccessToken}`,
    Accept: "application/json",
  };

  const endpointsToTry = [
    `https://${cleanId}.relay.vmsproxy.com/api/getEvents?limit=200`,
    `https://${cleanId}.relay.vmsproxy.com/rest/v4/events`,
    `https://${cleanId}.relay.vmsproxy.com/rest/v3/events`,
  ];

  for (const targetUrl of endpointsToTry) {
    try {
      let response = await fetch(targetUrl, {
        method: "GET",
        headers,
        redirect: "manual",
      });

      if ([301, 302, 307, 308].includes(response.status)) {
        const redirectUrl = response.headers.get("location");
        if (redirectUrl) {
          response = await fetch(redirectUrl, { method: "GET", headers });
        }
      }

      if (response.ok) {
        const rawData = await response.json();
        const items = Array.isArray(rawData) ? rawData : rawData?.items || rawData?.events || rawData?.reply || [];
        if (items.length > 0) {
          return items;
        }
      }
    } catch (e: any) {
      console.warn(`[NxRelay Events] Endpoint try failed for ${targetUrl}:`, e.message);
    }
  }

  return [];
}

/**
 * 8. Create / Trigger Generic Event on Nx Witness System via Relay
 * - Attempts modern REST v4 Generic Event trigger first: POST https://{cloudSystemId}.relay.vmsproxy.com/rest/v4/events/generic
 * - Falls back to legacy trigger: GET https://{cloudSystemId}.relay.vmsproxy.com/api/createEvent?...
 * - Handles 301/302/307/308 redirects while preserving Authorization headers.
 */
export async function createNxEvent(
  cloudSystemId: string,
  systemAccessToken: string,
  eventPayload: {
    caption: string;
    description?: string;
    source?: string;
    timestamp?: string;
    metadata?: any;
    cameraId?: string;
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  const cleanId = cloudSystemId.trim().replace(/[{}]/g, "");
  const serverTimestamp = eventPayload.timestamp || Date.now().toString();

  // 1. Try modern REST v4 API Generic Events
  try {
    const initialUrl = `https://${cleanId}.relay.vmsproxy.com/rest/v4/events/generic`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${systemAccessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const restPayload: any = {
      caption: eventPayload.caption,
      description: eventPayload.description || eventPayload.caption,
      source: eventPayload.source || "VMS Server",
      timestamp: serverTimestamp,
    };

    if (eventPayload.metadata) {
      restPayload.metadata = eventPayload.metadata;
    } else if (eventPayload.cameraId) {
      restPayload.metadata = { cameraRefs: [eventPayload.cameraId] };
    }

    const bodyString = JSON.stringify(restPayload);

    let response = await fetch(initialUrl, {
      method: "POST",
      headers,
      body: bodyString,
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        console.log(`[NxRelay CreateEvent] Following HTTP ${response.status} redirect to: ${redirectUrl}`);
        const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        try {
          response = await fetch(redirectUrl, {
            method: "POST",
            headers,
            body: bodyString,
          });
        } finally {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
        }
      }
    }

    if (response.ok) {
      const data = await response.json().catch(() => ({ success: true }));
      console.log(`[NxRelay CreateEvent] ✅ Successfully created event via Cloud REST v4: ${eventPayload.caption}`);
      return { success: true, data };
    }

    console.warn(`[NxRelay CreateEvent] REST v4 returned status ${response.status}, attempting legacy API fallback...`);
  } catch (err: any) {
    console.warn(`[NxRelay CreateEvent] REST v4 error: ${err.message}, attempting legacy API fallback...`);
  }

  // 2. Fallback to legacy API: /api/createEvent
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("timestamp", serverTimestamp);
    queryParams.set("caption", eventPayload.caption);
    if (eventPayload.description) queryParams.set("description", eventPayload.description);
    if (eventPayload.source) queryParams.set("source", eventPayload.source);

    const legacyUrl = `https://${cleanId}.relay.vmsproxy.com/api/createEvent?${queryParams.toString()}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${systemAccessToken}`,
      Accept: "application/json",
    };

    let response = await fetch(legacyUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        try {
          response = await fetch(redirectUrl, {
            method: "GET",
            headers,
          });
        } finally {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
        }
      }
    }

    if (response.ok) {
      const data = await response.json().catch(() => ({ success: true }));
      console.log(`[NxRelay CreateEvent] ✅ Successfully created event via Cloud legacy API: ${eventPayload.caption}`);
      return { success: true, data };
    }

    const errText = await response.text();
    return { success: false, error: `Cloud event creation failed: HTTP ${response.status} - ${errText}` };
  } catch (err: any) {
    return { success: false, error: `Cloud legacy event error: ${err.message}` };
  }
}

