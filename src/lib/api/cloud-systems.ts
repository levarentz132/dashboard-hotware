/**
 * Single source of truth for cloud systems fetching and caching.
 */

import Cookies from "js-cookie";
import { API_CONFIG } from "@/lib/config";
import { apiFetch } from "@/lib/http-client";
import { getBrowserQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { CloudSystem } from "@/types/cloud-system";

const CLOUD_CACHE_TTL_MS = 5 * 60 * 1000;

let cloudSystemsCache: { data: CloudSystem[]; timestamp: number } | null = null;
let inFlightFetch: Promise<CloudSystem[]> | null = null;

/**
 * Sort cloud systems: owner first, then online systems.
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
 * Clear module-level cache (call on auth changes).
 */
export function invalidateCloudSystemsCache(): void {
  cloudSystemsCache = null;
  inFlightFetch = null;
}

/**
 * Invalidate module cache and React Query cache when available.
 */
export function invalidateCloudSystems(): void {
  invalidateCloudSystemsCache();
  const queryClient = getBrowserQueryClient();
  if (queryClient) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cloudSystems.all });
  }
}

async function fetchLocalSystemsAsCloudSystems(): Promise<CloudSystem[]> {
  if (typeof window === "undefined") return [];

  let systemId = API_CONFIG.systemId;
  if (!systemId) {
    const cookieIp = Cookies.get("nx_location_ip");
    const cookiePort = Cookies.get("nx_location_port");
    if (cookieIp && cookiePort) {
      systemId = `${cookieIp}:${cookiePort}`;
    }
  }
  if (!systemId) systemId = "localhost:7001";

  const [infoRes, serversRes] = await Promise.allSettled([
    apiFetch(`/api/nx/system/info?systemId=${encodeURIComponent(systemId)}`),
    apiFetch(`/api/nx/servers?systemId=${encodeURIComponent(systemId)}`),
  ]);

  let systemName = "";
  let systemVersion = "";
  if (infoRes.status === "fulfilled" && infoRes.value.ok) {
    try {
      const info = await infoRes.value.json();
      if (info?.name) {
        systemName = info.name;
        systemVersion = info.version || "";
      }
    } catch {
      /* ignore parse errors */
    }
  }

  let servers: Array<Record<string, unknown>> = [];
  if (serversRes.status === "fulfilled" && serversRes.value.ok) {
    try {
      servers = await serversRes.value.json();
    } catch {
      /* ignore parse errors */
    }
  }

  if (Array.isArray(servers) && servers.length > 0) {
    return servers.map((server) => ({
      id: String(server.id),
      name: String(server.name),
      stateOfHealth:
        server.status === "Online" || server.status === "online" ? "online" : "offline",
      accessRole: "owner",
      version: String(server.version || systemVersion),
      ownerFullName: "Local",
      isLocal: true,
      systemName,
    }));
  }

  if (systemName) {
    return [
      {
        id: `${systemId}_sys`,
        name: systemName,
        stateOfHealth: "online",
        accessRole: "owner",
        version: systemVersion,
        ownerFullName: "Local",
        isLocal: true,
        systemName,
      },
    ];
  }

  if (systemId) {
    return [
      {
        id: systemId,
        name: "Local Server",
        stateOfHealth: "online",
        accessRole: "owner",
        ownerFullName: "Local",
        isLocal: true,
      },
    ];
  }

  return [];
}

async function fetchCloudSystemsUncached(): Promise<CloudSystem[]> {
  const cloudSessionStr = Cookies.get("nx_cloud_session");
  let cloudToken = "";
  if (cloudSessionStr) {
    try {
      const session = JSON.parse(cloudSessionStr);
      cloudToken = session.accessToken || "";
    } catch {
      /* ignore invalid session cookie */
    }
  }

  let systems: CloudSystem[] = [];
  let fetchError = false;

  try {
    const response = await apiFetch("/api/cloud/systems", {
      method: "GET",
      headers: cloudToken ? { "X-Electron-Cloud-Token": cloudToken } : undefined,
    });

    if (response.ok) {
      const data = await response.json();
      systems = Array.isArray(data) ? data : data.systems || [];
    } else {
      fetchError = true;
    }
  } catch (err) {
    console.warn("[cloud-systems] Cloud systems fetch error:", err);
    fetchError = true;
  }

  if (fetchError || systems.length === 0) {
    const localSystems = await fetchLocalSystemsAsCloudSystems();
    if (localSystems.length > 0) {
      systems = localSystems;
    }
  }

  const sortedSystems = sortCloudSystems(systems);
  cloudSystemsCache = { data: sortedSystems, timestamp: Date.now() };
  return sortedSystems;
}

/**
 * Fetch cloud systems via internal API proxy with TTL cache and in-flight deduplication.
 */
export async function fetchCloudSystems(force = false): Promise<CloudSystem[]> {
  if (
    !force &&
    cloudSystemsCache &&
    Date.now() - cloudSystemsCache.timestamp < CLOUD_CACHE_TTL_MS
  ) {
    return cloudSystemsCache.data;
  }

  if (!force && inFlightFetch) {
    return inFlightFetch;
  }

  const fetchPromise = fetchCloudSystemsUncached().finally(() => {
    if (inFlightFetch === fetchPromise) {
      inFlightFetch = null;
    }
  });

  inFlightFetch = fetchPromise;
  return fetchPromise;
}
