import { NextRequest } from "next/server";

// In Electron, we inject the local AppData config via window.electronConfig
const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;

/**
 * Helper to get Electron headers for client-side fetch calls
 */
export function getElectronHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const extConfig = (window as any).electronConfig;
  if (!extConfig) return {};

  return {
    'X-Electron-System-ID': extConfig.NEXT_PUBLIC_NX_SYSTEM_ID || '',
    'X-Electron-Username': extConfig.NEXT_PUBLIC_NX_USERNAME || '',
    'X-Electron-VMS-Password': extConfig.NEXT_PUBLIC_NX_PASSWORD || '',
    'X-Electron-VMS-Password-Encrypted': extConfig.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED || '',
    'X-Electron-Cloud-Username': extConfig.NEXT_PUBLIC_NX_CLOUD_USERNAME || '',
    'X-Electron-Cloud-Password': extConfig.NEXT_PUBLIC_NX_CLOUD_PASSWORD || '',
    'X-Electron-Cloud-Password-Encrypted': extConfig.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED || '',
    'X-Electron-Cloud-Token': extConfig.NX_CLOUD_TOKEN || '',
    'X-Electron-Server-Host': extConfig.NEXT_PUBLIC_NX_SERVER_HOST || '',
    'X-Electron-Server-Port': extConfig.NEXT_PUBLIC_NX_SERVER_PORT || '',
  };
}

export function isSecureContext(): boolean {
  // Always false in development
  if (process.env.NODE_ENV !== "production") return false;

  // Check environment variable (set in Electron main process)
  const envHostname = process.env.HOSTNAME?.toLowerCase();
  if (envHostname === "localhost" || envHostname === "127.0.0.1" || envHostname === "0.0.0.0") return false;

  // Check client-side window object
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    return !(hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local"));
  }

  // If we are on the server and HOSTNAME is not set, we default to secure=true 
  // ONLY if it doesn't look like we are in a local environment.
  // Note: Electron main.js should always set HOSTNAME=localhost
  return true;
}

/**
 * Internal helper for server-side decryption (Electron parity)
 */
function decryptPassword(encryptedData: string | null): string | null {
  if (!encryptedData || typeof window !== 'undefined') return null;
  try {
    const crypto = require('crypto');
    const os = require('os');
    const machineId = os.hostname() + os.platform() + os.arch();
    const key = crypto.createHash('sha256').update(machineId).digest();
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[Config] Decryption failed:', error);
    return null;
  }
}

let cachedConfig: Record<string, string> | null = null;
let lastReadTime = 0;
const CACHE_TTL = 2000; // Cache for 2 seconds to avoid excessive disk I/O

/**
 * Server-side helper to read persistent config from .env.local on disk.
 * This ensures that even remote browsers receive the configuration set up by the host.
 */
function getServerSideConfig(): Record<string, string> {
  if (typeof window !== 'undefined') return {};
  
  const now = Date.now();
  if (cachedConfig && (now - lastReadTime < CACHE_TTL)) {
    return cachedConfig;
  }

  const fs = require('fs');
  const path = require('path');
  let configPath = process.env.EXT_CONFIG_PATH;
  
  // Dev Fallback: Try to find the Electron config file in the default AppData folder if running in dev mode
  if (!configPath) {
    const home = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
    const fallbackPath = path.join(home, 'hotware-dashboard', '.env.local');
    if (fs.existsSync(fallbackPath)) {
      configPath = fallbackPath;
      // console.log(`[Config] Using fallback config path: ${configPath}`);
    } else {
      // console.warn(`[Config] Fallback config path NOT found: ${fallbackPath}`);
    }
  }

  if (!configPath || !fs.existsSync(configPath)) {
    const envConfig = {
      NEXT_PUBLIC_NX_SYSTEM_ID: process.env.NEXT_PUBLIC_NX_SYSTEM_ID || '',
      // NEXT_PUBLIC_NX_USERNAME: process.env.NEXT_PUBLIC_NX_USERNAME || '',
      // NEXT_PUBLIC_NX_PASSWORD: process.env.NEXT_PUBLIC_NX_PASSWORD || '',
      NEXT_PUBLIC_NX_USERNAME: 'LippoTest',
      NEXT_PUBLIC_NX_PASSWORD: 'Lippo.123',
      NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED: process.env.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED || '',
      NEXT_PUBLIC_NX_CLOUD_USERNAME: process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME || '',
      NEXT_PUBLIC_NX_CLOUD_PASSWORD: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD || '',
      NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED || '',
      NX_CLOUD_TOKEN: process.env.NX_CLOUD_TOKEN || '',
      NEXT_PUBLIC_NX_SERVER_HOST: process.env.NEXT_PUBLIC_NX_SERVER_HOST || '',
      NEXT_PUBLIC_NX_SERVER_PORT: process.env.NEXT_PUBLIC_NX_SERVER_PORT || '',
    };
    cachedConfig = envConfig;
    lastReadTime = now;
    return envConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const lines = content.split('\n');
    const config: Record<string, string> = {};
    lines.forEach((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join('=').trim();
      }
    });
    // console.log(`[Config] Loaded config from disk: ${config.NEXT_PUBLIC_NX_SERVER_HOST}`);
    cachedConfig = config;
    lastReadTime = now;
    return config;
  } catch (e) {
    console.error('[Config] Failed to read disk config:', e);
    return {};
  }
}

/**
 * Helper to resolve config from headers (server-side) or window (client-side)
 */
export function getDynamicConfig(request?: Request | NextRequest) {
  if (typeof window !== 'undefined') {
    return (window as any).electronConfig || null;
  }

  // Use headers if available (Local Electron requests)
  let headersConfig: any = null;
  if (request) {
    const headers = (request as any).headers;
    const isHeadersObject = typeof headers.get === 'function';

    const getH = (key: string) => {
      if (isHeadersObject) return headers.get(key);
      const lowerKey = key.toLowerCase();
      const keys = Object.keys(headers);
      const actualKey = keys.find(k => k.toLowerCase() === lowerKey);
      return actualKey ? headers[actualKey] : null;
    };

    const hSystemId = getH('x-electron-system-id');
    if (hSystemId) {
      headersConfig = {
        NEXT_PUBLIC_NX_SYSTEM_ID: hSystemId,
        NEXT_PUBLIC_NX_USERNAME: getH('x-electron-username'),
        NEXT_PUBLIC_NX_PASSWORD: getH('x-electron-vms-password'),
        NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED: getH('x-electron-vms-password-encrypted'),
        NEXT_PUBLIC_NX_CLOUD_USERNAME: getH('x-electron-cloud-username'),
        NEXT_PUBLIC_NX_CLOUD_PASSWORD: getH('x-electron-cloud-password'),
        NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED: getH('x-electron-cloud-password-encrypted'),
        NX_CLOUD_TOKEN: getH('x-electron-cloud-token'),
        NEXT_PUBLIC_NX_SERVER_HOST: getH('x-electron-server-host'),
        NEXT_PUBLIC_NX_SERVER_PORT: getH('x-electron-server-port'),
      };
    }
  }

  // Fallback to disk configuration (Remote Network users or missing headers)
  const diskConfig = getServerSideConfig();

  // Auto-detect local IP if host is missing (but NOT if explicitly set to localhost)
  // DISABLED: Keep localhost as-is if explicitly configured
  // if (diskConfig && !diskConfig.NEXT_PUBLIC_NX_SERVER_HOST) {
  //   try {
  //     const os = require('os');
  //     const interfaces = os.networkInterfaces();
  //     for (const name of Object.keys(interfaces)) {
  //       const netIfaces = interfaces[name];
  //       if (!netIfaces) continue;
  //       for (const iface of netIfaces) {
  //         if (iface.family === 'IPv4' && !iface.internal) {
  //           diskConfig.NEXT_PUBLIC_NX_SERVER_HOST = iface.address;
  //           break;
  //         }
  //       }
  //       if (diskConfig.NEXT_PUBLIC_NX_SERVER_HOST && diskConfig.NEXT_PUBLIC_NX_SERVER_HOST !== 'localhost') break;
  //     }
  //   } catch (e) {
  //     // ignore
  //   }
  // }

  return headersConfig || diskConfig;
}

// Nx Witness API Configuration
export const API_CONFIG = {
  // Use Next.js API proxy to avoid CORS issues
  baseURL: "/api/nx",
  // Direct server URL for server-side requests
  serverURL: process.env.NEXT_PUBLIC_API_URL,
  wsURL: process.env.NEXT_PUBLIC_WS_URL,
  
  // Dynamic getters to ensure we always use the latest config (disk or headers)
  get username() { return getDynamicConfig()?.NEXT_PUBLIC_NX_USERNAME; },
  get vmsPasswordHash() { return getDynamicConfig()?.NEXT_PUBLIC_NX_PASSWORD; },
  get cloudUsername() { return getDynamicConfig()?.NEXT_PUBLIC_NX_CLOUD_USERNAME; },
  get cloudPasswordHash() { return getDynamicConfig()?.NEXT_PUBLIC_NX_CLOUD_PASSWORD; },
  get password() { return getDynamicConfig()?.NEXT_PUBLIC_NX_PASSWORD; },
  get systemId() { return getDynamicConfig()?.NEXT_PUBLIC_NX_SYSTEM_ID; },
  get serverHost() { return getDynamicConfig()?.NEXT_PUBLIC_NX_SERVER_HOST; },
  get serverPort() { return getDynamicConfig()?.NEXT_PUBLIC_NX_SERVER_PORT; },

  // Fallback URLs to try (now through proxy)
  fallbackURLs: ["/api/nx"],
};

// Nx Witness REST v3 API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  login: "/login/sessions",
  logout: "/logout",

  // Server Information
  servers: "/servers",
  serverInfo: "/servers/{id}",
  serverStatus: "/servers/{id}/status",

  // Cameras (REST v3)
  devices: "/devices",
  deviceById: (id: string) => `/devices/${id}`,
  deviceStatus: "/devices/status",
  deviceTypes: "/devices/*/types",
  createDevice: "/devices",
  modifyDevice: (id: string) => `/devices/${id}`,
  deleteDevice: (id: string) => `/devices/${id}`,

  // Events and Rules (Legacy /api)
  events: "/api/getEvents",
  rules: "/api/getRules",
  bookmarks: "/api/getBookmarks",

  // System Information
  systemInfo: "/system/info",
  moduleInformation: "/moduleInformation",

  // Storage
  storages: "/servers/{serverId}/storages",
  storageById: (serverId: string, storageId: string) => `/servers/${serverId}/storages/${storageId}`,
  createStorage: (serverId: string) => `/servers/${serverId}/storages`,
  updateStorage: (serverId: string, storageId: string) => `/servers/${serverId}/storages/${storageId}`,
  deleteStorage: (serverId: string, storageId: string) => `/servers/${serverId}/storages/${storageId}`,

  // Metrics / Alarms
  metricsAlarms: "/system/metrics/alarms",
  // Analytics
  analytics: "/analytics",
  reports: "/reports",
};

// NX Cloud Configuration for auto-login
export const CLOUD_CONFIG = {
  // Secure Cloud Token (New)
  get token() { return getDynamicConfig()?.NX_CLOUD_TOKEN; },
  // Enable auto-login when token is configured
  autoLoginEnabled: true,
  // Base URL for NX Cloud API
  baseURL: "https://nxvms.com",
};

// Generate Auth header for NX Cloud API
export function getCloudAuthHeader(request?: Request | NextRequest): string {
  if (typeof window !== 'undefined') {
    return ""; // Auth header should be handled by the server proxy
  }

  const dynamicConfig = getDynamicConfig(request);

  // 1. Prefer static env / Electron-injected token
  const token = dynamicConfig?.NX_CLOUD_TOKEN || process.env.NX_CLOUD_TOKEN;
  if (token && token !== 'undefined' && token.length > 20) {
    if (token.toLowerCase().startsWith('bearer ')) return token;
    return `Bearer ${token}`;
  }

  // 2. Fall back to the OAuth token stored in the nx_cloud_session cookie
  //    This is set by the browser-side OAuth flow in NxAuthentication
  if (request) {
    try {
      const cookieHeader = (request as NextRequest).headers?.get('cookie') || '';
      const match = cookieHeader.match(/(?:^|;\s*)nx_cloud_session=([^;]+)/);
      if (match) {
        const session = JSON.parse(decodeURIComponent(match[1]));
        const accessToken = session?.accessToken;
        if (accessToken && accessToken.length > 20) {
          return `Bearer ${accessToken}`;
        }
      }
    } catch {
      // Malformed cookie — ignore
    }
  }

  return "";
}

// Helper to make authenticated fetch to NX Cloud
export async function fetchCloudAPI(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${CLOUD_CONFIG.baseURL}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: getCloudAuthHeader(),
      ...options.headers,
    },
  });
}

export default API_CONFIG;