"use client";

import { useState, useEffect } from "react";
import { nxAPI, NxEvent } from "@/lib/nxapi";
import { useAsyncData } from "./use-async-data";

// Custom hook for events
export function useEvents(limit: number = 50) {
  const {
    data: events,
    loading,
    error,
    refetch,
  } = useAsyncData<NxEvent[]>(() => nxAPI.getEvents(limit), [], { refreshInterval: 30000, deps: [limit] });
  return { events, loading, error, refetch };
}

// Custom hook for alarms
export function useAlarms() {
  const {
    data: alarms,
    loading,
    error,
    refetch,
  } = useAsyncData<NxEvent[]>(() => nxAPI.getAlarms(), [], { refreshInterval: 10000 });
  return { alarms, loading, error, refetch };
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

// Hook for module information
export function useModules() {
  const {
    data: modules,
    loading,
    error,
  } = useAsyncData<any[]>(
    async () => {
      const data = await nxAPI.getModuleInformation();
      if (data && data.modules && data.modules.length > 0) {
        return data.modules;
      }
      throw new Error("Server connected but no modules found. Check your Nx Witness system status.");
    },
    [],
    { fetchOnMount: true }
  );
  return { modules, loading, error };
}
