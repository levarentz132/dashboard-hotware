"use client";

import nxAPI, { NxSystemInfo } from "@/lib/nxapi";
import { useCallback, useEffect, useState } from "react";

// Interface for cloud system
interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
}

// Custom hook for system info (with cloud relay support)
export function useSystemInfo(cloudId?: string) {
  const [systemInfo, setSystemInfo] = useState<NxSystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [availableSystems, setAvailableSystems] = useState<CloudSystem[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(cloudId || null);

  // Fetch available cloud systems
  const fetchCloudSystems = useCallback(async () => {
    try {
      // Fetching cloud systems
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.log("[useSystemInfo] Cloud systems fetch failed:", response.status);
        return [];
      }

      const data = await response.json();
      const systems: CloudSystem[] = data.systems || [];

      // Sort: owner first, then online systems
      systems.sort((a, b) => {
        if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
        if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
        if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
        if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
        return 0;
      });

        // Cloud systems loaded
      setAvailableSystems(systems);
      return systems;
    } catch (err) {
      console.error("[useSystemInfo] Error fetching cloud systems:", err);
      return [];
    }
  }, []);

  // Fetch system info from cloud relay
  const fetchSystemInfoFromCloud = useCallback(async (cloudSystemId: string) => {
    try {
      console.log("[useSystemInfo] Fetching from cloud relay:", cloudSystemId);
      const cloudUrl = `https://${cloudSystemId}.relay.vmsproxy.com/rest/v3/system/info`;

      const response = await fetch(cloudUrl, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Cloud relay error: ${response.status}`);
      }

      const info = await response.json();
      console.log("[useSystemInfo] Cloud relay system info:", info);
      return info as NxSystemInfo;
    } catch (err) {
      console.error("[useSystemInfo] Cloud relay error:", err);
      return null;
    }
  }, []);

  const fetchSystemInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetching system info

      // If cloudId is provided, use cloud relay
      if (selectedCloudId) {
        const cloudInfo = await fetchSystemInfoFromCloud(selectedCloudId);
        if (cloudInfo) {
          setSystemInfo(cloudInfo);
          setConnected(true);
          setError(null);
          return;
        }
      }

      // Try to get cloud systems and use the first online one with owner role
      const systems = await fetchCloudSystems();
      if (systems.length > 0) {
        // Find the first online system (prefer owner)
        const onlineSystem = systems.find((s) => s.stateOfHealth === "online");
        if (onlineSystem) {
          setSelectedCloudId(onlineSystem.id);
          const cloudInfo = await fetchSystemInfoFromCloud(onlineSystem.id);
          if (cloudInfo) {
            setSystemInfo(cloudInfo);
            setConnected(true);
            setError(null);
            return;
          }
        }
      }

      // Fallback to local API
      const connectionTest = await nxAPI.testConnection();
      console.log("[useSystemInfo] Local connection test result:", connectionTest);

      if (!connectionTest) {
        setSystemInfo(null);
        setConnected(false);
        setError("Cannot connect to Nx Witness server. Check server status and credentials.");
        return;
      }

      const info = await nxAPI.getSystemInfo();
      console.log("[useSystemInfo] Local system info result:", info);

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
  }, [selectedCloudId, fetchCloudSystems, fetchSystemInfoFromCloud]);

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

  // Switch to a different cloud system
  const switchSystem = useCallback(
    async (newCloudId: string) => {
      setSelectedCloudId(newCloudId);
      const cloudInfo = await fetchSystemInfoFromCloud(newCloudId);
      if (cloudInfo) {
        setSystemInfo(cloudInfo);
        setConnected(true);
        setError(null);
      }
    },
    [fetchSystemInfoFromCloud]
  );

  useEffect(() => {
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
    availableSystems,
    selectedCloudId,
    switchSystem,
  };
}
