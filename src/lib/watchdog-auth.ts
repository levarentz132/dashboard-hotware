import { readScheduledRecordings } from "./scheduled-recordings-store";
import { readAppSettings } from "./server-settings";
import { API_CONFIG } from "./config";
import { getVmsSessionToken } from "./vms-auth";

declare global {
  var _lastActiveVmsAuth: string | undefined;
  var _lastActiveVmsUser: string | undefined;
}

/**
 * Stores the most recent active VMS authentication token in memory.
 */
export function setLastActiveAuthToken(token: string, username?: string) {
  if (!token || token === "undefined" || token === "SERVER_MANAGED") return;
  global._lastActiveVmsAuth = token;
  if (username) {
    global._lastActiveVmsUser = username;
  }
}

/**
 * Gets the in-memory last active token.
 */
export function getLastActiveAuthToken(): string | null {
  return global._lastActiveVmsAuth || null;
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
 * 1. Global in-memory last active token
 * 2. Disk scheduled_recordings globalAuthFallback
 * 3. Fresh VMS session token via vms-auth if service credentials exist
 */
export async function getFallbackAuthToken(host?: string, port?: string): Promise<string | null> {
  // 1. In-memory last active token
  if (global._lastActiveVmsAuth) {
    return global._lastActiveVmsAuth;
  }

  // 2. Persisted fallback token from scheduled_recordings.json
  try {
    const data = await readScheduledRecordings();
    if (data.globalAuthFallback && typeof data.globalAuthFallback === "string") {
      global._lastActiveVmsAuth = data.globalAuthFallback;
      return data.globalAuthFallback;
    }
  } catch {}

  // 3. Try to acquire fresh VMS session token using service/server credentials
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
        global._lastActiveVmsAuth = freshToken;
        return freshToken;
      }
    }
  } catch {}

  return null;
}

