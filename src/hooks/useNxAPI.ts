"use client";

import { useState, useEffect, useCallback } from "react";
import { nxAPI, NxEvent } from "@/lib/nxapi";

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
