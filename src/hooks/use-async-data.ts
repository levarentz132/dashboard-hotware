"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getElectronHeaders } from "@/lib/config";
import { fetchCloudSystems, sortCloudSystems } from "@/lib/api/cloud-systems";
import { parseError } from "@/hooks/parse-error";
import { useCloudSystemsQuery } from "@/hooks/use-cloud-systems-query";
import type { CloudSystem } from "@/types/cloud-system";

export type { CloudSystem };
export { fetchCloudSystems, sortCloudSystems };
export { parseError };

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
      if (message !== "SYSTEM_ID_REQUIRED") {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchOnMount) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, ...deps]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Fetch data from cloud relay via proxy
 */
export async function fetchFromCloudRelay<T>(cloudId: string, endpoint: string): Promise<T | null> {
  try {
    const response = await fetch(`/api/nx${endpoint}?systemId=${encodeURIComponent(cloudId)}`, {
      method: "GET",
      credentials: "include",
      headers: {
        ...getElectronHeaders(),
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Hook for cloud systems — backed by TanStack Query (shared cache).
 */
export function useCloudSystems(): UseAsyncDataReturn<CloudSystem[]> {
  const { data, isLoading, error, refetch } = useCloudSystemsQuery();

  return {
    data: data ?? [],
    loading: isLoading,
    error: error ? parseError(error) : null,
    refetch: async () => {
      await refetch();
    },
  };
}
