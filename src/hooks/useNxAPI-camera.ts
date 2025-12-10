import nxAPI, { NxCamera } from "@/lib/nxapi";
import { ICamera, IDeviceType } from "@/types/Device";
import { useCallback, useEffect, useState } from "react";

// Custom hook for cameras
export function useCameras() {
  const [cameras, setCameras] = useState<NxCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCameras = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const cameraData = await nxAPI.getCameras();
      setCameras(cameraData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch cameras");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  return { cameras, loading, error, refetch: fetchCameras };
}

// get DeviceType
export function useDeviceType() {
  const [deviceType, setDeviceType] = useState<IDeviceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevicesType = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceTypeData = await nxAPI.getDeviceTypes();
      setDeviceType(deviceTypeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch device Type");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevicesType();
  }, [fetchDevicesType]);

  return { deviceType, loading, error, refetch: fetchDevicesType };
}

export function useDevices() {
  const [device, setDevice] = useState<ICamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const deviceData = await nxAPI.getDevices();
      setDevice(deviceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch cameras");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return { device, loading, error, refetch: fetchDevices };
}
