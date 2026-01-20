// Nx Witness API Configuration
export const API_CONFIG = {
  // Use Next.js API proxy to avoid CORS issues
  baseURL: "/api/nx",
  // Direct server URL for server-side requests
  serverURL: process.env.NEXT_PUBLIC_API_URL || "https://localhost:7001/rest/v3",
  wsURL: process.env.NEXT_PUBLIC_WS_URL || "wss://localhost:7001/ws",
  username: process.env.NEXT_PUBLIC_NX_USERNAME || "admin",
  password: process.env.NEXT_PUBLIC_NX_PASSWORD || "Farrel123",
  serverHost: process.env.NEXT_PUBLIC_NX_SERVER_HOST || "localhost",
  serverPort: process.env.NEXT_PUBLIC_NX_SERVER_PORT || "7001",
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
  // Cloud credentials for auto-login (set via environment variables for security)
  username: process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME || "farel.it12@gmail.com",
  password: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD || "farrel354313",
  // Enable auto-login when credentials are configured
  autoLoginEnabled: true,
  // Base URL for NX Cloud API
  baseURL: "https://meta.nxvms.com",
};

// Generate Basic Auth header for NX Cloud API
export function getCloudAuthHeader(): string {
  const credentials = `${CLOUD_CONFIG.username}:${CLOUD_CONFIG.password}`;
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
