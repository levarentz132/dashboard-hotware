"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getCloudAuthHeader, getElectronHeaders, API_CONFIG } from "@/lib/config";
import Cookies from "js-cookie";

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
      if (message !== "SYSTEM_ID_REQUIRED") {
        setError(message);
      }
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
  isLocal?: boolean;
  systemName?: string;
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

// Global cache for cloud systems to avoid redundant meta-API calls
let cloudSystemsCache: { data: CloudSystem[]; timestamp: number } | null = null;
const CLOUD_CACHE_TTL = 300000; // 5 minutes

/**
 * Fetch local systems/servers as CloudSystem objects for fallback
 */
async function fetchLocalSystemsAsCloudSystems(): Promise<CloudSystem[]> {
  if (typeof window === 'undefined') return [];

  const systemId = API_CONFIG.systemId || 'localhost:7001';

  // 1. Fetch both System Info and Servers
  const [infoRes, serversRes] = await Promise.allSettled([
    fetch(`/api/nx/system/info?systemId=${encodeURIComponent(systemId)}`, { headers: getElectronHeaders() }),
    fetch(`/api/nx/servers?systemId=${encodeURIComponent(systemId)}`, { headers: getElectronHeaders() })
  ]);

  let systemName = '';
  let systemVersion = '';
  if (infoRes.status === 'fulfilled' && infoRes.value.ok) {
    try {
      const info = await infoRes.value.json();
      if (info && info.name) {
        systemName = info.name;
        systemVersion = info.version || '';
      }
    } catch (e) { }
  }

  let servers: any[] = [];
  if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
    try {
      servers = await serversRes.value.json();
    } catch (e) { }
  }

  // Use a Map to deduplicate by name (case-insensitive)
  // We prefer the Server entries!
  const results: CloudSystem[] = [];

  // 2. Add Servers first if found
  if (Array.isArray(servers) && servers.length > 0) {
    servers.forEach(server => {
      results.push({
        id: server.id, // Real UUID (e.g., {ef78cdcb-...})
        name: server.name,
        stateOfHealth: server.status === 'Online' || server.status === 'online' ? 'online' : 'offline',
        accessRole: 'owner',
        version: server.version || systemVersion,
        ownerFullName: 'Local',
        isLocal: true,
        systemName: systemName // Store the system name for location fallback
      });
    });
    return results;
  }

  // 3. Fallback to System entry ONLY if no servers found
  if (systemName) {
    return [{
      id: `${systemId}_sys`, // Synthetic ID
      name: systemName,
      stateOfHealth: 'online',
      accessRole: 'owner',
      version: systemVersion,
      ownerFullName: 'Local',
      isLocal: true,
      systemName: systemName
    }];
  }

  // 4. Final resort fallback
  if (systemId) {
    return [{
      id: systemId,
      name: 'Local Server',
      stateOfHealth: 'online',
      accessRole: 'owner',
      version: '',
      ownerFullName: 'Local',
      isLocal: true
    }];
  }

  return [];
}

/**
 * Fetch cloud systems from internal API proxy
 */
export async function fetchCloudSystems(): Promise<CloudSystem[]> {
  // Return from cache if valid (short cache time for cloud systems)
  if (cloudSystemsCache && Date.now() - cloudSystemsCache.timestamp < CLOUD_CACHE_TTL) {
    return cloudSystemsCache.data;
  }

  // Get cloud token from Cookies if available
  const cloudSessionStr = Cookies.get("nx_cloud_session");
  let cloudToken = "";
  if (cloudSessionStr) {
    try {
      const session = JSON.parse(cloudSessionStr);
      cloudToken = session.accessToken || "";
    } catch (e) { }
  }

  let systems: CloudSystem[] = [];
  let fetchError = false;

  try {
    const response = await fetch("/api/cloud/systems", {
      method: "GET",
      credentials: "include",
      headers: {
        ...getElectronHeaders(),
        ...(cloudToken ? { "X-Electron-Cloud-Token": cloudToken } : {}),
      }
    });

    if (response.ok) {
      const data = await response.json();
      systems = Array.isArray(data) ? data : (data.systems || []);
    } else {
      fetchError = true;
    }
  } catch (err) {
    console.warn("[use-async-data] Cloud systems fetch error:", err);
    fetchError = true;
  }

  // FALLBACK: If cloud fetch failed or returned no systems, try local servers
  if (fetchError || systems.length === 0) {
    const localSystems = await fetchLocalSystemsAsCloudSystems();
    if (localSystems.length > 0) {
      systems = localSystems;
    }
  }

  const sortedSystems = sortCloudSystems(systems);

  // Update cache
  cloudSystemsCache = { data: sortedSystems, timestamp: Date.now() };

  return sortedSystems;
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
        ...getElectronHeaders()
      }
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
