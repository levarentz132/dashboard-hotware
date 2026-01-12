/**
 * Central export for all custom hooks
 * Organized for clean imports throughout the application
 */

// Core async data hook
export {
  useAsyncData,
  parseError,
  sortCloudSystems,
  fetchCloudSystems,
  fetchFromCloudRelay,
  useCloudSystems,
  type AsyncState,
  type UseAsyncDataReturn,
  type UseAsyncDataOptions,
  type CloudSystem,
} from "./use-async-data";

// NX API hooks
export { useEvents, useAlarms, useRealTimeUpdates, useModules } from "./useNxAPI";
export { useCameras, useDeviceType, useDevices } from "./useNxAPI-camera";
export { useServers } from "./useNxAPI-server";
export { useSystemInfo } from "./useNxAPI-system";

// UI hooks
export { useIsMobile } from "./use-mobile";
