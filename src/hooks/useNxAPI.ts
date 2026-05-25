"use client";

import { useState, useEffect } from "react";
import { useEventsQuery, useAlarmsQuery, useModulesQuery } from "@/hooks/use-nx-queries";

/** Backward-compatible wrapper around TanStack Query. */
export function useEvents(limit: number = 50) {
  const { events, loading, error, refetch } = useEventsQuery(limit);
  return { events, loading, error, refetch };
}

/** @deprecated Prefer useAlarmsQuery — kept for backward-compatible return shape */
export function useAlarms() {
  const { alarms, loading, error, refetch } = useAlarmsQuery();
  return { alarms, loading, error, refetch };
}

/** Simulated real-time connection indicator (WebSocket not implemented). */
export function useRealTimeUpdates() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
      setIsConnected(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return { isConnected, lastUpdate };
}

/** @deprecated Prefer useModulesQuery — kept for backward-compatible return shape */
export function useModules() {
  const { modules, loading, error } = useModulesQuery();
  return { modules, loading, error };
}
