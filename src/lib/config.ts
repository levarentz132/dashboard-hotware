import { NextRequest } from "next/server";

// In Electron, we inject the local AppData config via window.electronConfig
const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;

/**
 * Helper to resolve config from headers (server-side) or window (client-side)
 */
export function getDynamicConfig(request?: Request | NextRequest) {
  if (typeof window !== 'undefined') {
    return (window as any).electronConfig || null;
  }

  if (request) {
    const headers = (request as any).headers;
    // Check for Electron-specific headers passed from the frontend
    return {
      NEXT_PUBLIC_NX_SYSTEM_ID: headers.get('x-electron-system-id'),
      NEXT_PUBLIC_NX_USERNAME: headers.get('x-electron-username'),
      NX_ADMIN_HASH: headers.get('x-electron-admin-hash'),
      NX_CLOUD_TOKEN: headers.get('x-electron-cloud-token'),
    };
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
  password: process.env.NEXT_PUBLIC_NX_PASSWORD,
  systemId: extConfig?.NEXT_PUBLIC_NX_SYSTEM_ID || process.env.NEXT_PUBLIC_NX_SYSTEM_ID,
  serverHost: process.env.NEXT_PUBLIC_NX_SERVER_HOST,
  serverPort: process.env.NEXT_PUBLIC_NX_SERVER_PORT,
  adminHash: extConfig?.NX_ADMIN_HASH || process.env.NX_ADMIN_HASH,
  hashedPassword: extConfig?.NX_ADMIN_HASH || process.env.NX_ADMIN_HASH,
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
  baseURL: "https://meta.nxvms.com",
};

// Generate Auth header for NX Cloud API
export function getCloudAuthHeader(request?: Request | NextRequest): string {
  const dynamicConfig = getDynamicConfig(request);
  const token = dynamicConfig?.NX_CLOUD_TOKEN || CLOUD_CONFIG.token;

  // Prefer Token-based auth
  if (token) {
    return `Bearer ${token}`;
  }

  // Fallback to Basic Auth (legacy) - read directly from env to avoid object typing issues
  const username = process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME;
  const password = process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD;

  if (!username || !password) {
    return "";
  }

  const credentials = `${username}:${password}`;
  const base64Credentials =
    typeof window !== "undefined" ? btoa(credentials) : Buffer.from(credentials).toString("base64");
  return `Basic ${base64Credentials}`;
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