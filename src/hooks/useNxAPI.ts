"use client";

import { useState, useEffect, useCallback } from "react";
import { nxAPI, NxCamera, NxEvent, NxSystemInfo } from "@/lib/nxapi";
import { ICamera, IDeviceType } from "@/types/Device";

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

// Custom hook for events
export function useEvents(limit: number = 50) {
  const [events, setEvents] = useState<NxEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const eventData = await nxAPI.getEvents(limit);
      setEvents(eventData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchEvents();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

// Custom hook for alarms
export function useAlarms() {
  const [alarms, setAlarms] = useState<NxEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlarms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const alarmData = await nxAPI.getAlarms();
      setAlarms(alarmData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch alarms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlarms();

    // Set up auto-refresh every 10 seconds for alarms
    const interval = setInterval(fetchAlarms, 10000);
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  return { alarms, loading, error, refetch: fetchAlarms };
}

// Custom hook for system info
export function useSystemInfo() {
  const [systemInfo, setSystemInfo] = useState<NxSystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const fetchSystemInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("[useSystemInfo] Fetching system info...");

      // First test the connection which handles authentication
      const connectionTest = await nxAPI.testConnection();
      console.log("[useSystemInfo] Connection test result:", connectionTest);

      if (!connectionTest) {
        setSystemInfo(null);
        setConnected(false);
        setError("Cannot connect to Nx Witness server. Check server status and credentials.");
        return;
      }

      // If connection is good, get system info
      const info = await nxAPI.getSystemInfo();
      console.log("[useSystemInfo] System info result:", info);

      if (info) {
        setSystemInfo(info);
        setConnected(true);
        setError(null);
      } else {
        setSystemInfo(null);
        setConnected(false);
        setError("Connected but no system info available.");
      }
    } catch (err) {
      console.error("[useSystemInfo] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch system info");
      setSystemInfo(null);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const testConnection = useCallback(async () => {
    try {
      console.log("[useSystemInfo] Manual connection test triggered");
      setLoading(true);
      const isConnected = await nxAPI.testConnection();
      console.log("[useSystemInfo] Manual connection test result:", isConnected);

      setConnected(isConnected);
      if (isConnected) {
        await fetchSystemInfo();
      } else {
        setError("Connection test failed - check server and credentials");
      }
      return isConnected;
    } catch (err) {
      console.error("[useSystemInfo] Connection test error:", err);
      setConnected(false);
      setError("Connection test failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchSystemInfo]);

  useEffect(() => {
    // Add a small delay to ensure environment variables are loaded
    const timer = setTimeout(() => {
      fetchSystemInfo();
    }, 1000);

    return () => clearTimeout(timer);
  }, [fetchSystemInfo]);

  return {
    systemInfo,
    loading,
    error,
    connected,
    refetch: fetchSystemInfo,
    testConnection,
  };
}

// Custom hook for real-time updates
export function useRealTimeUpdates() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    // This would connect to WebSocket for real-time updates
    // For now, we'll simulate with periodic updates
    const interval = setInterval(() => {
      setLastUpdate(new Date());
      setIsConnected(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return { isConnected, lastUpdate };
}

// Hook for server information
export function useServers() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await nxAPI.getServers();
        console.log("Server data received:", data); // Debug log

        // The API returns servers directly as an array, not wrapped in an object
        if (Array.isArray(data) && data.length > 0) {
          setServers(data);
          setError(null);
        } else if (data && typeof data === "object" && data.servers) {
          // Fallback for wrapped response
          setServers(data.servers);
          setError(null);
        } else {
          setServers([]);
          setError("Server connected but no servers found. Check your Nx Witness configuration.");
        }
      } catch (err) {
        console.error("Error fetching servers:", err); // Debug log
        setError("Cannot connect to Nx Witness server. Check server status and configuration.");
        setServers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, []);

  return { servers, loading, error };
}

// Hook for module information
export function useModules() {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await nxAPI.getModuleInformation();
        if (data && data.modules && data.modules.length > 0) {
          setModules(data.modules);
          setError(null);
        } else {
          setModules([]);
          setError("Server connected but no modules found. Check your Nx Witness system status.");
        }
      } catch (err) {
        setError("Cannot connect to Nx Witness server to fetch module information.");
        setModules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, []);

  return { modules, loading, error };
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
