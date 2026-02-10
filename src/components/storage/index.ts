/**
 * Storage barrel exports
 */

// Types
export type { StorageStatusInfo, Storage, CloudSystem, StorageFormData } from "./types";

export { defaultStorageFormData, STORAGE_TYPES } from "./types";

// Service functions
export {
  fetchCloudSystems,
  loginToCloudSystem,
  fetchCloudStorages,
  createCloudStorage,
  updateCloudStorage,
  deleteCloudStorage,
  fetchLocalStorages,
  type FetchStoragesResult,
} from "./storage-service";

// Utilities
export {
  formatBytes,
  formatBytesToGB,
  parseGBToBytes,
  getUsagePercentage,
  calculateTotalStorage,
  calculateTotalUsed,
  calculateTotalFree,
  countOnlineStorages,
  getServerId,
  getStatusColor,
  getUsageColor,
  getProgressColor,
} from "./storage-utils";

// Components
export { default as StorageManagement } from "./StorageManagement";
