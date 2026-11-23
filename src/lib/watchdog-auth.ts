import { readScheduledRecordings } from "./scheduled-recordings-store";
import { readAppSettings } from "./server-settings";
import { API_CONFIG } from "./config";
import { getVmsSessionToken } from "./vms-auth";

declare global {
  var _lastActiveVmsAuth: string | undefined;
  var _lastActiveVmsUser: string | undefined;
  var _lastAdminVmsAuth: string | undefined;
  var _lastAdminVmsUser: string | undefined;
  var _masterSnapshotAuth: string | undefined;
  var _masterSnapshotUser: string | undefined;
  var _userVmsAuthMap: Record<string, string> | undefined;
}

/**
 * Checks if a user is the master snapshot execution user (e.g. "test user", "admin").
 */
export function isMasterSnapshotUser(username?: string, isAdmin?: boolean): boolean {
  if (isAdmin) return true;
  if (!username) return false;
  const lower = username.toLowerCase();
  return lower.includes("test") || lower.includes("admin") || lower === "service" || lower === "system";
}

/**
 * Stores active VMS authentication tokens in memory.
 * Preserves master execution token (test user / admin) separately so non-admin logins do not downgrade watchdog permissions.
 */
export function setLastActiveAuthToken(token: string, username?: string, isAdmin?: boolean) {
  if (!token || token === "undefined" || token === "SERVER_MANAGED") return;
  global._lastActiveVmsAuth = token;
  if (username) {
    global._lastActiveVmsUser = username;
    if (!global._userVmsAuthMap) global._userVmsAuthMap = {};
    global._userVmsAuthMap[username.toLowerCase()] = token;
  }
  if (isMasterSnapshotUser(username, isAdmin)) {
    global._masterSnapshotAuth = token;
    global._masterSnapshotUser = username || "test user";
    global._lastAdminVmsAuth = token;
    if (username) {
      global._lastAdminVmsUser = username;
    }
  }
}

/**
 * Explicitly sets the designated master snapshot token (test user).
 */
export function setMasterSnapshotAuth(token: string, username?: string) {
  if (!token || token === "undefined" || token === "SERVER_MANAGED") return;
  global._masterSnapshotAuth = token;
  if (username) {
    global._masterSnapshotUser = username;
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
  return global._masterSnapshotAuth || global._lastAdminVmsAuth || null;
}

export const DEFAULT_VMS_SERVICE_USER = "test.user";
export const DEFAULT_VMS_SERVICE_PASS = "Lippo.123";

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
      API_CONFIG.username ||
      DEFAULT_VMS_SERVICE_USER;
    const password =
      (settings.vmsServicePassword as string) ||
      process.env.VMS_SERVICE_PASSWORD ||
      process.env.NEXT_PUBLIC_NX_PASSWORD ||
      API_CONFIG.password ||
      DEFAULT_VMS_SERVICE_PASS;

    if (username && password) {
      const creds = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
      return `Basic ${creds}`;
    }
  } catch (e) {}
  return null;
}

/**
 * Resolves the best available master/fallback auth token for background watchdog tasks.
 * Order of priority:
 * 1. Master snapshot account token (test user / admin)
 * 2. Persisted masterSnapshotAuth from disk
 * 3. Fresh VMS session token via service credentials
 * 4. User-specific active token
 * 5. General in-memory last active token
 */
export async function getFallbackAuthToken(
  host?: string,
  port?: string,
  preferredUser?: string,
): Promise<string | null> {
  // 1. In-memory master snapshot token (test user / admin has access to all cameras)
  if (global._masterSnapshotAuth) {
    return global._masterSnapshotAuth;
  }
  if (global._lastAdminVmsAuth) {
    return global._lastAdminVmsAuth;
  }

  // 2. Persisted master snapshot token from scheduled_recordings.json
  try {
    const data = await readScheduledRecordings();
    if (data.masterSnapshotAuth && typeof data.masterSnapshotAuth === "string") {
      global._masterSnapshotAuth = data.masterSnapshotAuth;
      return data.masterSnapshotAuth;
    }
    if (data.adminAuthFallback && typeof data.adminAuthFallback === "string") {
      global._masterSnapshotAuth = data.adminAuthFallback;
      return data.adminAuthFallback;
    }
    const userTokens = data.userAuthTokens as Record<string, string> | undefined;
    if (userTokens) {
      // Look for any test user or admin token stored
      for (const [uname, uToken] of Object.entries(userTokens)) {
        if (isMasterSnapshotUser(uname, false) && uToken) {
          global._masterSnapshotAuth = uToken;
          return uToken;
        }
      }
    }
    if (preferredUser && userTokens?.[preferredUser.toLowerCase()]) {
      return userTokens[preferredUser.toLowerCase()];
    }
  } catch {}

  // 3. User-specific active token if specified
  if (preferredUser && global._userVmsAuthMap?.[preferredUser.toLowerCase()]) {
    return global._userVmsAuthMap[preferredUser.toLowerCase()];
  }

  // 4. Try to acquire fresh VMS session token using service/server credentials
  try {
    const settings = readAppSettings();
    const username =
      (settings.vmsServiceUsername as string) ||
      process.env.VMS_SERVICE_USER ||
      process.env.NEXT_PUBLIC_NX_USERNAME ||
      API_CONFIG.username ||
      DEFAULT_VMS_SERVICE_USER;
    const password =
      (settings.vmsServicePassword as string) ||
      process.env.VMS_SERVICE_PASSWORD ||
      process.env.NEXT_PUBLIC_NX_PASSWORD ||
      API_CONFIG.password ||
      DEFAULT_VMS_SERVICE_PASS;

    const targetHost = host || settings.nxServerHost || API_CONFIG.serverHost || "localhost";
    const targetPort = port || String(settings.nxServerPort || API_CONFIG.serverPort || "7001");

    if (username && password) {
      const freshToken = await getVmsSessionToken(targetHost, targetPort, username, password);
      if (freshToken) {
        global._masterSnapshotAuth = freshToken;
        global._lastActiveVmsAuth = freshToken;
        return freshToken;
      }
    }
  } catch {}

  // 5. General in-memory last active token
  if (global._lastActiveVmsAuth) {
    return global._lastActiveVmsAuth;
  }

  // 6. Last resort global fallback
  try {
    const data = await readScheduledRecordings();
    if (data.globalAuthFallback && typeof data.globalAuthFallback === "string") {
      return data.globalAuthFallback;
    }
  } catch {}

  return null;
}
