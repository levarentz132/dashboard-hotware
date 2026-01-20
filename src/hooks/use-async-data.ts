"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getCloudAuthHeader } from "@/lib/config";

/**
 * State interface for async data fetching hooks
 */
export interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Return type for data fetching hooks
 */
export interface UseAsyncDataReturn<T> extends AsyncState<T> {
  refetch: () => Promise<void>;
}

/**
 * Options for useAsyncData hook
 */
export interface UseAsyncDataOptions {
  /** Auto-refresh interval in milliseconds (0 = disabled) */
  refreshInterval?: number;
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean;
  /** Dependencies that trigger refetch */
  deps?: unknown[];
}

/**
 * Generic hook factory for async data fetching
 * Reduces boilerplate for common fetch patterns
 *
 * @param fetchFn - Async function that fetches data
 * @param initialData - Initial state for data
 * @param options - Configuration options
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  initialData: T,
  options: UseAsyncDataOptions = {},
): UseAsyncDataReturn<T> {
  const { refreshInterval = 0, fetchOnMount = true, deps = [] } = options;

  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(fetchOnMount);
  const [error, setError] = useState<string | null>(null);

  // Use ref to avoid stale closure in interval
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFnRef.current();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (fetchOnMount) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, ...deps]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Parse error from various error types
 */
export function parseError(err: unknown, defaultMessage: string = "An error occurred"): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return defaultMessage;
}

/**
 * Cloud system interface (shared across hooks)
 */
export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
  ownerFullName?: string;
  ownerAccountEmail?: string;
}

/**
 * Sort cloud systems: owner first, then online systems
 */
export function sortCloudSystems(systems: CloudSystem[]): CloudSystem[] {
  return [...systems].sort((a, b) => {
    if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
    if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
    if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
    if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
    return 0;
  });
}

/**
 * Fetch cloud systems from meta API
 */
export async function fetchCloudSystems(): Promise<CloudSystem[]> {
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
    throw new Error(`Failed to fetch cloud systems: ${response.status}`);
  }

  const data = await response.json();
  const systems: CloudSystem[] = data.systems || [];
  return sortCloudSystems(systems);
}

/**
 * Fetch data from cloud relay
 */
export async function fetchFromCloudRelay<T>(cloudId: string, endpoint: string): Promise<T | null> {
  try {
    const response = await fetch(`https://${cloudId}.relay.vmsproxy.com${endpoint}`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Hook for cloud systems
 */
export function useCloudSystems() {
  return useAsyncData<CloudSystem[]>(fetchCloudSystems, [], {
    refreshInterval: 60000, // Refresh every minute
  });
}
