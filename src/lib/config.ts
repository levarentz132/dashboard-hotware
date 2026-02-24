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
  };
}

export function isSecureContext(): boolean {
  // Always false in development
  if (process.env.NODE_ENV !== "production") return false;

  // Check environment variable (set in Electron main process)
  const envHostname = process.env.HOSTNAME?.toLowerCase();
  if (envHostname === "localhost" || envHostname === "127.0.0.1") return false;

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

/**
 * Helper to resolve config from headers (server-side) or window (client-side)
 */
export function getDynamicConfig(request?: Request | NextRequest) {
  if (typeof window !== 'undefined') {
    return (window as any).electronConfig || null;
  }

  if (request) {
    const headers = (request as any).headers;
    const isHeadersObject = typeof headers.get === 'function';

    // Helper for case-insensitive lookup
    const getH = (key: string) => {
      if (isHeadersObject) return headers.get(key);
      const lowerKey = key.toLowerCase();
      // For plain objects, we need to manually find the key
      const keys = Object.keys(headers);
      const actualKey = keys.find(k => k.toLowerCase() === lowerKey);
      return actualKey ? headers[actualKey] : null;
    };

    const config = {
      NEXT_PUBLIC_NX_SYSTEM_ID: getH('x-electron-system-id'),
      NEXT_PUBLIC_NX_USERNAME: getH('x-electron-username'),
      NEXT_PUBLIC_NX_PASSWORD: getH('x-electron-vms-password'),
      NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED: getH('x-electron-vms-password-encrypted'),
      NEXT_PUBLIC_NX_CLOUD_USERNAME: getH('x-electron-cloud-username'),
      NEXT_PUBLIC_NX_CLOUD_PASSWORD: getH('x-electron-cloud-password'),
      NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED: getH('x-electron-cloud-password-encrypted'),
      NX_CLOUD_TOKEN: getH('x-electron-cloud-token'),
    };

    // DEBUG: Log detected electron headers
    const electronHeaders: any = {};
    if (isHeadersObject) {
      headers.forEach((v: string, k: string) => {
        if (k.toLowerCase().startsWith('x-electron-')) electronHeaders[k] = v ? '(set)' : '(empty)';
      });
    } else {
      Object.keys(headers).forEach(k => {
        if (k.toLowerCase().startsWith('x-electron-')) electronHeaders[k] = headers[k] ? '(set)' : '(empty)';
      });
    }

    if (Object.keys(electronHeaders).length > 0 && !request.url.includes('api/nx')) {
      console.log(`[DynamicConfig] Headers for ${request.url}:`, electronHeaders);
    }

    return config;
  }

  return null;
}

// Nx Witness API Configuration
export const API_CONFIG = {
  // Use Next.js API proxy to avoid CORS issues
  baseURL: "/api/nx",
  // Direct server URL for server-side requests
  serverURL: process.env.NEXT_PUBLIC_API_URL,
  wsURL: process.env.NEXT_PUBLIC_WS_URL,
  username: extConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME,
  vmsPasswordHash: extConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD,
  cloudUsername: extConfig?.NEXT_PUBLIC_NX_CLOUD_USERNAME || process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME,
  cloudPasswordHash: extConfig?.NEXT_PUBLIC_NX_CLOUD_PASSWORD || process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD,
  password: process.env.NEXT_PUBLIC_NX_PASSWORD,
  systemId: extConfig?.NEXT_PUBLIC_NX_SYSTEM_ID || process.env.NEXT_PUBLIC_NX_SYSTEM_ID,
  serverHost: process.env.NEXT_PUBLIC_NX_SERVER_HOST,
  serverPort: process.env.NEXT_PUBLIC_NX_SERVER_PORT,
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

  // Events and Rules (REST v3)
  events: "/events",
  rules: "/rules",
  bookmarks: "/bookmarks",

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
  token: extConfig?.NX_CLOUD_TOKEN || process.env.NX_CLOUD_TOKEN,
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

  // Use Cloud Token (Bearer) - This is the primary and now ONLY authentication method
  const token = dynamicConfig?.NX_CLOUD_TOKEN || process.env.NX_CLOUD_TOKEN;
  if (token && token !== 'undefined' && token.length > 20) {
    if (token.toLowerCase().startsWith('bearer ')) return token;
    return `Bearer ${token}`;
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