// Connection Settings Service
// Manages NX Server and Cloud credentials in localStorage
// Falls back to environment variables if no settings are stored

"use client";

const STORAGE_KEY = "hotware-connection-settings";

export interface NxServerSettings {
  host: string;
  port: string;
  username: string;
  password: string;
}

export interface NxCloudSettings {
  username: string;
  password: string;
}

export interface ConnectionSettings {
  nxServer: NxServerSettings;
  nxCloud: NxCloudSettings;
}

const DEFAULT_SETTINGS: ConnectionSettings = {
  nxServer: {
    host: "localhost",
    port: "7001",
    username: "",
    password: "",
  },
  nxCloud: {
    username: "",
    password: "",
  },
};

/**
 * Get connection settings from localStorage
 */
export function getConnectionSettings(): ConnectionSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ConnectionSettings;
      return {
        nxServer: { ...DEFAULT_SETTINGS.nxServer, ...parsed.nxServer },
        nxCloud: { ...DEFAULT_SETTINGS.nxCloud, ...parsed.nxCloud },
      };
    }
  } catch (e) {
    console.warn("[ConnectionSettings] Failed to read settings:", e);
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save connection settings to localStorage
 */
export function saveConnectionSettings(settings: ConnectionSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Dispatch event so other components can react to changes
    window.dispatchEvent(new CustomEvent("connection-settings-changed", { detail: settings }));
  } catch (e) {
    console.warn("[ConnectionSettings] Failed to save settings:", e);
  }
}

/**
 * Check if connection settings have been configured
 */
export function hasConnectionSettings(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;

    const parsed = JSON.parse(stored) as ConnectionSettings;
    // At minimum, NX server credentials should be set
    return !!(parsed.nxServer?.username && parsed.nxServer?.password);
  } catch {
    return false;
  }
}

/**
 * Clear all connection settings
 */
export function clearConnectionSettings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("connection-settings-changed", { detail: null }));
}

/**
 * Get NX Server settings with env fallback
 * Priority: localStorage > env variables > defaults
 */
export function getNxServerConfig() {
  const settings = getConnectionSettings();
  return {
    host: settings.nxServer.host || process.env.NEXT_PUBLIC_NX_SERVER_HOST || "localhost",
    port: settings.nxServer.port || process.env.NEXT_PUBLIC_NX_SERVER_PORT || "7001",
    username: settings.nxServer.username || process.env.NEXT_PUBLIC_NX_USERNAME || "",
    password: settings.nxServer.password || process.env.NEXT_PUBLIC_NX_PASSWORD || "",
  };
}

/**
 * Get NX Cloud settings with env fallback
 * Priority: localStorage > env variables > empty
 */
export function getNxCloudConfig() {
  const settings = getConnectionSettings();
  return {
    username: settings.nxCloud.username || process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME || "",
    password: settings.nxCloud.password || process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD || "",
  };
}
