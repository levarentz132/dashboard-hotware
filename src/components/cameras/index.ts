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
  CameraLocationCache,
  CameraLocationData,
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
  // Camera Locations
  fetchCameraLocation,
  fetchCameraLocations,
  saveCameraLocation,
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
export {
  getStatusDescription,
  getStatusBadgeStyle,
  formatCameraLocation,
  formatCameraLocationFull,
  searchInLocation,
  getUniqueLocationValues,
  getUniqueVendors,
} from "./camera-utils";
