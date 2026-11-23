import { readScheduledRecordings } from "./scheduled-recordings-store";
import { readAppSettings } from "./server-settings";
import { API_CONFIG } from "./config";
import { getVmsSessionToken } from "./vms-auth";

declare global {
  var _lastActiveVmsAuth: string | undefined;
  var _lastActiveVmsUser: string | undefined;
  var _lastAdminVmsAuth: string | undefined;
  var _lastAdminVmsUser: string | undefined;
  var _userVmsAuthMap: Record<string, string> | undefined;
}

/**
 * Stores active VMS authentication tokens in memory.
 * Preserves admin tokens separately so non-admin logins do not downgrade watchdog permissions.
 */
export function setLastActiveAuthToken(token: string, username?: string, isAdmin?: boolean) {
  if (!token || token === "undefined" || token === "SERVER_MANAGED") return;
  global._lastActiveVmsAuth = token;
  if (username) {
    global._lastActiveVmsUser = username;
    if (!global._userVmsAuthMap) global._userVmsAuthMap = {};
    global._userVmsAuthMap[username.toLowerCase()] = token;
  }
  if (isAdmin) {
    global._lastAdminVmsAuth = token;
    if (username) {
      global._lastAdminVmsUser = username;
    }
  }
}

/**
 * Gets the in-memory last active token.
 */
export function getLastActiveAuthToken(): string | null {
  return global._lastActiveVmsAuth || null;
}

/**
 * Gets the in-memory last admin token (which has access to all cameras).
 */
export function getLastAdminAuthToken(): string | null {
  return global._lastAdminVmsAuth || null;
}

/**
 * Resolves server-level basic auth header from settings or environment variables.
 * Supports VMS_SERVICE_USER / VMS_SERVICE_PASSWORD or settings.json vmsServiceUsername / vmsServicePassword.
 */
export function getServerBasicAuthHeader(): string | null {
  try {
    const settings = readAppSettings();
    const username =
      (settings.vmsServiceUsername as string) ||
      process.env.VMS_SERVICE_USER ||
      process.env.NEXT_PUBLIC_NX_USERNAME ||
      API_CONFIG.username;
    const password =
      (settings.vmsServicePassword as string) ||
      process.env.VMS_SERVICE_PASSWORD ||
      process.env.NEXT_PUBLIC_NX_PASSWORD ||
      API_CONFIG.password;

    if (username && password) {
      const creds = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
      return `Basic ${creds}`;
    }
  } catch (e) {}
  return null;
}

/**
 * Resolves the best available fallback auth token for background watchdog tasks.
 * Order of priority:
 * 1. Admin token (has access to ALL cameras across the entire VMS)
 * 2. Specific user's active token if scheduledBy is provided
 * 3. Fresh VMS session token via service credentials
 * 4. Last active token from memory or disk
 */
export async function getFallbackAuthToken(
  host?: string,
  port?: string,
  preferredUser?: string,
): Promise<string | null> {
  // 1. Admin in-memory token (always preferred for background tasks as it can access all cameras)
  if (global._lastAdminVmsAuth) {
    return global._lastAdminVmsAuth;
  }

  // 2. Specific user's active token if specified
  if (preferredUser && global._userVmsAuthMap?.[preferredUser.toLowerCase()]) {
    return global._userVmsAuthMap[preferredUser.toLowerCase()];
  }

  // 3. Check disk for persisted admin or user tokens
  try {
    const data = await readScheduledRecordings();
    if (data.adminAuthFallback && typeof data.adminAuthFallback === "string") {
      global._lastAdminVmsAuth = data.adminAuthFallback;
      return data.adminAuthFallback;
    }
    const userTokens = data.userAuthTokens as Record<string, string> | undefined;
    if (preferredUser && userTokens?.[preferredUser.toLowerCase()]) {
      return userTokens[preferredUser.toLowerCase()];
    }
    if (data.globalAuthFallback && typeof data.globalAuthFallback === "string") {
      return data.globalAuthFallback;
    }
  } catch {}

  // 4. Try to acquire fresh VMS session token using service/server credentials
  try {
    const settings = readAppSettings();
    const username =
      (settings.vmsServiceUsername as string) ||
      process.env.VMS_SERVICE_USER ||
      process.env.NEXT_PUBLIC_NX_USERNAME ||
      API_CONFIG.username;
    const password =
      (settings.vmsServicePassword as string) ||
      process.env.VMS_SERVICE_PASSWORD ||
      process.env.NEXT_PUBLIC_NX_PASSWORD ||
      API_CONFIG.password;

    const targetHost = host || settings.nxServerHost || API_CONFIG.serverHost || "localhost";
    const targetPort = port || String(settings.nxServerPort || API_CONFIG.serverPort || "7001");

    if (username && password) {
      const freshToken = await getVmsSessionToken(targetHost, targetPort, username, password);
      if (freshToken) {
        global._lastAdminVmsAuth = freshToken;
        global._lastActiveVmsAuth = freshToken;
        return freshToken;
      }
    }
  } catch {}

  // 5. General in-memory last active token
  if (global._lastActiveVmsAuth) {
    return global._lastActiveVmsAuth;
  }

  return null;
}
