import nxAPI, { NxCamera } from "@/lib/nxapi";
import { ICamera, IDeviceType } from "@/types/Device";
import { useAsyncData } from "./use-async-data";

// Custom hook for cameras
export function useCameras() {
  const {
    data: cameras,
    loading,
    error,
    refetch,
  } = useAsyncData<NxCamera[]>(() => nxAPI.getCameras(), [], { fetchOnMount: true });
  return { cameras, loading, error, refetch };
}

// Get DeviceType
export function useDeviceType() {
  const {
    data: deviceType,
    loading,
    error,
    refetch,
  } = useAsyncData<IDeviceType[]>(() => nxAPI.getDeviceTypes(), [], { fetchOnMount: true });
  return { deviceType, loading, error, refetch };
}

export function useDevices() {
  const {
    data: device,
    loading,
    error,
    refetch,
  } = useAsyncData<ICamera[]>(() => nxAPI.getDevices(), [], { fetchOnMount: true });
  return { device, loading, error, refetch };
}
