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

export { useCloudSystemsQuery } from "./use-cloud-systems-query";
export { invalidateCloudSystems, invalidateCloudSystemsCache } from "@/lib/api/cloud-systems";

// NX API hooks
export { useEvents, useAlarms, useRealTimeUpdates, useModules } from "./useNxAPI";
export { useCameras, useDeviceType, useDevices } from "./useNxAPI-camera";
export { useServers } from "./useNxAPI-server";
export { useSystemInfo } from "./useNxAPI-system";
export {
  useEventsQuery,
  useAlarmsQuery,
  useModulesQuery,
  useCamerasQuery,
  useDeviceTypeQuery,
  useDevicesQuery,
  useServersQuery,
} from "./use-nx-queries";
export { useCloudSystemsWithOnline } from "./use-cloud-systems-with-online";
export { useOwnerCloudSystems } from "./use-owner-cloud-systems";

// UI hooks
export { useIsMobile } from "./use-mobile";
