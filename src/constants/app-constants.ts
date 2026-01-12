/**
 * Application-wide constants
 * Centralized to avoid magic values and enable easy maintenance
 */

// ============================================
// API Configuration Constants
// ============================================

export const API_TIMEOUTS = {
  DEFAULT: 10000, // 10 seconds
  LOGIN: 8000, // 8 seconds
  HEALTH_CHECK: 5000, // 5 seconds
  LONG_OPERATION: 30000, // 30 seconds
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;

// ============================================
// Refresh Intervals (in milliseconds)
// ============================================

export const REFRESH_INTERVALS = {
  REAL_TIME: 5000, // 5 seconds - for critical real-time data
  ALARMS: 10000, // 10 seconds - for alarms/alerts
  EVENTS: 30000, // 30 seconds - for event logs
  SYSTEM_STATUS: 60000, // 1 minute - for system health
  DASHBOARD: 120000, // 2 minutes - for dashboard widgets
} as const;

// ============================================
// UI Constants
// ============================================

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
  MAX_PAGE_SIZE: 100,
} as const;

export const CHART_COLORS = {
  PRIMARY: "#3b82f6", // blue-500
  SUCCESS: "#22c55e", // green-500
  WARNING: "#f59e0b", // amber-500
  DANGER: "#ef4444", // red-500
  INFO: "#06b6d4", // cyan-500
  MUTED: "#6b7280", // gray-500
} as const;

// ============================================
// Camera Status Constants
// ============================================

export const CAMERA_STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  RECORDING: "recording",
  UNAUTHORIZED: "unauthorized",
  NOT_DEFINED: "notdefined",
  INCOMPATIBLE: "incompatible",
} as const;

export const CAMERA_STATUS_PRIORITY: Record<string, number> = {
  [CAMERA_STATUS.OFFLINE]: 0,
  [CAMERA_STATUS.UNAUTHORIZED]: 1,
  [CAMERA_STATUS.NOT_DEFINED]: 2,
  [CAMERA_STATUS.INCOMPATIBLE]: 3,
  [CAMERA_STATUS.ONLINE]: 4,
  [CAMERA_STATUS.RECORDING]: 5,
} as const;

// ============================================
// System Health Status Constants
// ============================================

export const SYSTEM_STATUS = {
  HEALTHY: "healthy",
  ONLINE: "online",
  WARNING: "warning",
  CRITICAL: "critical",
  OFFLINE: "offline",
  UNKNOWN: "unknown",
} as const;

// ============================================
// Cloud API Constants
// ============================================

export const CLOUD_API = {
  META_URL: "https://meta.nxvms.com",
  RELAY_DOMAIN: "relay.vmsproxy.com",
  SYSTEMS_ENDPOINT: "/cdb/systems",
  LOGIN_ENDPOINT: "/cdb/oauth2/token",
} as const;

export const ACCESS_ROLES = {
  OWNER: "owner",
  ADMINISTRATOR: "administrator",
  VIEWER: "viewer",
  CUSTOM: "custom",
} as const;

// ============================================
// Storage Constants
// ============================================

export const STORAGE_UNITS = {
  BYTES: "Bytes",
  KB: "KB",
  MB: "MB",
  GB: "GB",
  TB: "TB",
  PB: "PB",
} as const;

export const BYTES_PER_UNIT = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
} as const;

// ============================================
// Date/Time Constants
// ============================================

export const DATE_FORMATS = {
  DEFAULT_LOCALE: "id-ID",
  DATE_TIME: {
    year: "numeric" as const,
    month: "short" as const,
    day: "numeric" as const,
    hour: "2-digit" as const,
    minute: "2-digit" as const,
  },
  DATE_ONLY: {
    year: "numeric" as const,
    month: "short" as const,
    day: "numeric" as const,
  },
  TIME_ONLY: {
    hour: "2-digit" as const,
    minute: "2-digit" as const,
    second: "2-digit" as const,
  },
} as const;

// ============================================
// Form Validation Constants
// ============================================

export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 1,
  MAX_NAME_LENGTH: 255,
  MAX_URL_LENGTH: 2048,
  MIN_LATITUDE: -90,
  MAX_LATITUDE: 90,
  MIN_LONGITUDE: -180,
  MAX_LONGITUDE: 180,
} as const;

// ============================================
// Error Messages
// ============================================

export const ERROR_MESSAGES = {
  // Auth errors
  AUTH_REQUIRED: "Authentication required",
  AUTH_FAILED: "Authentication failed",
  SESSION_EXPIRED: "Session expired, please login again",

  // Network errors
  NETWORK_ERROR: "Network error, please check your connection",
  SERVER_UNAVAILABLE: "Server is unavailable",
  CONNECTION_TIMEOUT: "Connection timed out",

  // Data errors
  FETCH_FAILED: "Failed to fetch data",
  SAVE_FAILED: "Failed to save data",
  DELETE_FAILED: "Failed to delete",
  NOT_FOUND: "Resource not found",

  // Validation errors
  REQUIRED_FIELD: "This field is required",
  INVALID_FORMAT: "Invalid format",
  INVALID_COORDINATES: "Invalid coordinates",
} as const;

// ============================================
// Success Messages
// ============================================

export const SUCCESS_MESSAGES = {
  SAVED: "Successfully saved",
  DELETED: "Successfully deleted",
  UPDATED: "Successfully updated",
  EXPORTED: "Successfully exported",
  IMPORTED: "Successfully imported",
} as const;
