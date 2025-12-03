import { ICamera } from "@/types/Device";

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
  createDevice: (payload: ICamera) => "/devices",

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
  metricsAlarms: '/system/metrics/alarms',
  // Analytics
  analytics: "/analytics",
  reports: "/reports",
};

export default API_CONFIG;
