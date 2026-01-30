import nxAPI, { NxCamera } from "@/lib/nxapi";
import { ICamera, IDeviceType } from "@/types/Device";
import { useAsyncData } from "./use-async-data";

// Custom hook for cameras
export function useCameras(systemId?: string) {
  const {
    data: cameras,
    loading,
    error,
    refetch,
  } = useAsyncData<NxCamera[]>(
    async () => {
      if (!systemId) return [];
      nxAPI.setSystemId(systemId);
      return await nxAPI.getCameras();
    },
    [],
    { fetchOnMount: !!systemId, deps: [systemId] }
  );
  return { cameras, loading, error, refetch };
}

// Get DeviceType
export function useDeviceType(systemId?: string) {
  const {
    data: deviceType,
    loading,
    error,
    refetch,
  } = useAsyncData<IDeviceType[]>(
    async () => {
      if (!systemId) return [];
      nxAPI.setSystemId(systemId);
      return await nxAPI.getDeviceTypes();
    },
    [],
    { fetchOnMount: !!systemId, deps: [systemId] }
  );
  return { deviceType, loading, error, refetch };
}

export function useDevices(systemId?: string) {
  const {
    data: device,
    loading,
    error,
    refetch,
  } = useAsyncData<ICamera[]>(
    async () => {
      if (!systemId) return [];
      nxAPI.setSystemId(systemId);
      return await nxAPI.getDevices();
    },
    [],
    { fetchOnMount: !!systemId, deps: [systemId] }
  );
  return { device, loading, error, refetch };
}
