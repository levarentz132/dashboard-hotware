"use client";

import nxAPI, { NxSystemInfo } from "@/lib/nxapi";
import { useCallback, useEffect, useState } from "react";
import { getCloudAuthHeader } from "@/lib/config";

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
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(cloudId || nxAPI.getSystemId());

  // Fetch available cloud systems
  const fetchCloudSystems = useCallback(async () => {
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: getCloudAuthHeader(),
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

      setAvailableSystems(systems);
      return systems;
    } catch (err) {
      console.error("[useSystemInfo] Error fetching cloud systems:", err);
      return [];
    }
  }, []);

  const fetchSystemInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // If we don't have a selected system ID, try to find one
      if (!selectedCloudId) {
        const systems = await fetchCloudSystems();
        if (systems.length > 0) {
          const onlineSystem = systems.find((s) => s.stateOfHealth === "online");
          if (onlineSystem) {
            setSelectedCloudId(onlineSystem.id);
            nxAPI.setSystemId(onlineSystem.id);
          }
        }
      } else {
        // Ensure nxAPI is synchronized
        nxAPI.setSystemId(selectedCloudId);
      }

      if (!nxAPI.getSystemId()) {
        setLoading(false);
        return;
      }

      // Check connection (this now uses cloud relay via proxy if systemId is set)
      const connectionTest = await nxAPI.testConnection();

      if (!connectionTest) {
        setSystemInfo(null);
        setConnected(false);
        setError("Cannot connect to Nx Witness server. Check cloud relay status.");
        return;
      }

      const info = await nxAPI.getSystemInfo();

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
      const message = err instanceof Error ? err.message : "Failed to fetch system info";
      if (message !== "SYSTEM_ID_REQUIRED") {
        setError(message);
      }
      setSystemInfo(null);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [selectedCloudId, fetchCloudSystems]);

  const testConnection = useCallback(async () => {
    try {
      setLoading(true);
      const isConnected = await nxAPI.testConnection();

      setConnected(isConnected);
      if (isConnected) {
        await fetchSystemInfo();
      } else {
        setError("Connection test failed");
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
      nxAPI.setSystemId(newCloudId);
      await fetchSystemInfo();
    },
    [fetchSystemInfo],
  );

  useEffect(() => {
    if (cloudId !== undefined) {
      setSelectedCloudId(cloudId);
      nxAPI.setSystemId(cloudId);
    }
  }, [cloudId]);

  useEffect(() => {
    fetchSystemInfo();
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

