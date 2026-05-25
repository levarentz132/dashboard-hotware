import {
  useCamerasQuery,
  useDeviceTypeQuery,
  useDevicesQuery,
} from "@/hooks/use-nx-queries";

export function useCameras(systemId?: string) {
  const { data: cameras, loading, error, refetch } = useCamerasQuery(systemId);
  return { cameras, loading, error, refetch };
}

export function useDeviceType(systemId?: string) {
  const { data: deviceType, loading, error, refetch } = useDeviceTypeQuery(systemId);
  return { deviceType, loading, error, refetch };
}

export function useDevices(systemId?: string) {
  const { data: device, loading, error, refetch } = useDevicesQuery(systemId);
  return { device, loading, error, refetch };
}
