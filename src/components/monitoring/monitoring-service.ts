/**
 * Monitoring service - handles all monitoring/system health API calls
 */

import type { CloudSystem } from "@/hooks/use-async-data";

// ============================================
// Types
// ============================================

export interface SystemInfoData {
  name?: string;
  version?: string;
  cloudSystemId?: string;
  [key: string]: unknown;
}

export interface ServerLocationData {
  server_name: string;
  latitude: number | null;
  longitude: number | null;
}

// ============================================
// Cloud System API
// ============================================

/**
 * Fetch system details from cloud relay
 */
export async function fetchSystemDetails(cloudId: string): Promise<SystemInfoData | null> {
  try {
    const response = await fetch(`https://${cloudId}.relay.vmsproxy.com/rest/v3/system/info`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`Error fetching system details for ${cloudId}:`, err);
    return null;
  }
}

/**
 * Fetch details for multiple systems
 */
export async function fetchAllSystemDetails(systems: CloudSystem[]): Promise<Map<string, SystemInfoData | null>> {
  const details = new Map<string, SystemInfoData | null>();
  const onlineSystems = systems.filter((s) => s.stateOfHealth === "online");

  await Promise.all(
    onlineSystems.map(async (system) => {
      const data = await fetchSystemDetails(system.id);
      details.set(system.id, data);
    })
  );

  return details;
}

// ============================================
// Server Location API
// ============================================

/**
 * Fetch all server locations from database
 */
export async function fetchServerLocations(): Promise<Map<string, ServerLocationData>> {
  const locationsMap = new Map<string, ServerLocationData>();

  try {
    const response = await fetch("/api/server-location");
    if (response.ok) {
      const data = await response.json();
      data.locations?.forEach((loc: ServerLocationData) => {
        locationsMap.set(loc.server_name, loc);
      });
    }
  } catch (err) {
    console.error("Error fetching server locations:", err);
  }

  return locationsMap;
}

/**
 * Save server location
 */
export async function saveServerLocation(serverName: string, latitude: number, longitude: number): Promise<boolean> {
  try {
    const response = await fetch("/api/server-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_name: serverName,
        latitude,
        longitude,
      }),
    });
    return response.ok;
  } catch (err) {
    console.error("Error saving server location:", err);
    return false;
  }
}

/**
 * Delete server location
 */
export async function deleteServerLocation(serverName: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/server-location?server_name=${encodeURIComponent(serverName)}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch (err) {
    console.error("Error deleting server location:", err);
    return false;
  }
}

// ============================================
// Utilities
// ============================================

/**
 * Open Google Maps with coordinates
 */
export function openInGoogleMaps(lat: number, lng: number): void {
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
}
