/**
 * Central export for cameras module
 */

// Types
export type {
  CloudSystem,
  CloudCamera,
  CamerasBySystem,
  SystemCredentials,
  CameraDevice,
  Province,
  Regency,
  District,
  Village,
} from "./types";

// Service functions
export {
  // Cloud Systems
  fetchCloudSystems,
  fetchCloudCameras,
  // Login
  loginToSystem,
  logoutFromSystem,
  type LoginResult,
  // Location Hierarchy
  fetchProvinces,
  fetchRegencies,
  fetchDistricts,
  fetchVillages,
  // Credentials
  loadStoredCredentials,
  saveStoredCredentials,
  removeStoredCredentials,
  type StoredCredentials,
} from "./camera-service";

// Utility functions
export { getStatusDescription, getStatusBadgeStyle, getUniqueVendors } from "./camera-utils";
