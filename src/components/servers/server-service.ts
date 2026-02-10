/**
 * Server service - handles all server-related API calls
 */

import { getCloudAuthHeader, getElectronHeaders } from "@/lib/config";
import type { ServerInfo } from "./types";

// ============================================
// Cloud Systems/Servers API
// ============================================

/**
 * Fetch all cloud systems (servers) from NX Cloud
 */
export async function fetchCloudServers(): Promise<{ servers: ServerInfo[]; error?: string }> {
  try {
    const response = await fetch("/api/cloud/systems", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getElectronHeaders(),
      },
    });

    if (!response.ok) {
      return {
        servers: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const systemsList = data.systems || data;
    const servers = Array.isArray(systemsList) ? systemsList : [];

    // Sort: owner first, then by name
    servers.sort((a: ServerInfo, b: ServerInfo) => {
      if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
      if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    return { servers };
  } catch (err) {
    console.error("Error fetching servers:", err);
    return {
      servers: [],
      error: err instanceof Error ? err.message : "Failed to fetch servers",
    };
  }
}

/**
 * Fetch server details from cloud relay
 */
export async function fetchServerDetails(systemId: string): Promise<{ server: ServerInfo | null; error?: string }> {
  try {
    const response = await fetch(`/api/nx/system/info?systemId=${encodeURIComponent(systemId)}`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...getElectronHeaders(),
      },
    });

    if (!response.ok) {
      return { server: null, error: `Failed to fetch server details: ${response.status}` };
    }

    const data = await response.json();
    return { server: data };
  } catch (err) {
    console.error(`Error fetching server details for ${systemId}:`, err);
    return {
      server: null,
      error: err instanceof Error ? err.message : "Failed to fetch server details",
    };
  }
}

// ============================================
// Server Utilities
// ============================================

/**
 * Check if server is online
 */
export function isServerOnline(server: ServerInfo): boolean {
  return server.stateOfHealth === "online";
}

/**
 * Check if user is owner of server
 */
export function isServerOwner(server: ServerInfo): boolean {
  return server.accessRole === "owner";
}

/**
 * Get server status badge class
 */
export function getServerStatusClass(server: ServerInfo): string {
  return server.stateOfHealth === "online" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600";
}

/**
 * Format physical memory
 */
export function formatMemory(bytes?: number): string {
  if (!bytes) return "N/A";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

/**
 * Format system runtime
 */
export function formatRuntime(runtime?: string): string {
  if (!runtime) return "N/A";
  return runtime;
}
