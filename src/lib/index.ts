/**
 * Central export for all services
 * Services handle business logic and data operations
 */

// Re-export lib utilities
export { cn } from "./utils";
export { API_CONFIG, API_ENDPOINTS, CLOUD_CONFIG } from "./config";

// Re-export cloud API utilities
export {
  buildCloudUrl,
  buildCloudHeaders,
  validateSystemId,
  fetchFromCloudApi,
  postToCloudApi,
  createAuthErrorResponse,
  createFetchErrorResponse,
  createConnectionErrorResponse,
  type CloudApiOptions,
  type CloudApiError,
} from "./cloud-api";

// Re-export status utilities
export {
  getStatusColor,
  getStatusDotColor,
  getStatusVariant,
  normalizeStatus,
  sortByStatus,
  getOnlineOfflineBadgeClass,
  getRoleBadgeClass,
  formatBytes,
  formatDate,
  formatRelativeTime,
  STATUS_COLORS,
  CAMERA_STATUS_ORDER,
  type StatusType,
  type StatusVariant,
} from "./status-utils";

// Re-export NX API
export { nxAPI, default as NxWitnessAPI } from "./nxapi";
export type { NxCamera, NxEvent, NxSystemInfo, NxMetricsAlarm, NxMetricsAlarmsResponse } from "./nxapi";

// Re-export JSON storage utilities
export {
  // Dashboard Layout
  getDashboardLayouts,
  saveDashboardLayouts,
  getLayoutsByUserId,
  getLayoutById,
  getActiveLayout,
  createLayout,
  updateLayout,
  upsertLayoutByName,
  deleteLayout,
  // Server Location
  getServerLocationStore,
  saveServerLocationStore,
  getAllServerLocations,
  getServerLocationByName,
  upsertServerLocation,
  deleteServerLocation,
  // User Storage
  getUserStore,
  saveUserStore,
  getAllUsers,
  findUserById,
  findUserByUsername,
  findUserByEmail,
  userExists,
  createUser,
  updateLastLogin,
  updateUser,
  deleteUser,
  toUserPublic,
  // Generic JSON utilities
  readJsonFile,
  writeJsonFile,
  type DashboardLayoutData,
  type ServerLocationData,
  type UserData,
  type UserPublicData,
  type UserRole,
} from "./json-storage";
