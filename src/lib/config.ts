// Nx Witness API Configuration
import { getNxServerConfig, getNxCloudConfig } from "./connection-settings";

// Helper to get dynamic API config (reads localStorage on client)
function getApiConfig() {
  const server = getNxServerConfig();
  return {
    baseURL: "/api/nx",
    serverURL: process.env.NEXT_PUBLIC_API_URL,
    wsURL: process.env.NEXT_PUBLIC_WS_URL,
    username: server.username,
    password: server.password,
    systemId: process.env.NEXT_PUBLIC_NX_SYSTEM_ID,
    serverHost: server.host,
    serverPort: server.port,
    fallbackURLs: ["/api/nx"],
  };
}

// Export as getter so it reads fresh values each time
export const API_CONFIG = new Proxy({} as ReturnType<typeof getApiConfig>, {
  get(_target, prop: string) {
    return getApiConfig()[prop as keyof ReturnType<typeof getApiConfig>];
  },
});

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
function getCloudConfig() {
  const cloud = getNxCloudConfig();
  return {
    username: cloud.username,
    password: cloud.password,
    autoLoginEnabled: true,
    baseURL: "https://meta.nxvms.com",
  };
}

export const CLOUD_CONFIG = new Proxy({} as ReturnType<typeof getCloudConfig>, {
  get(_target, prop: string) {
    return getCloudConfig()[prop as keyof ReturnType<typeof getCloudConfig>];
  },
});

// Generate Basic Auth header for NX Cloud API
export function getCloudAuthHeader(): string {
  const cloud = getNxCloudConfig();
  const credentials = `${cloud.username}:${cloud.password}`;
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
