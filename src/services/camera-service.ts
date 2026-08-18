/**
 * Camera service - handles all camera-related API calls
 */

import { getCloudAuthHeader, getElectronHeaders } from "@/lib/config";
import type { CloudSystem, CloudCamera, Province, Regency, District, Village } from "@/components/cameras/types";

// ============================================
// Cloud Systems API
// ============================================

export { fetchCloudSystems } from "@/lib/api/cloud-systems";

/**
 * Fetch cameras from a specific cloud system
 */
export async function fetchCloudCameras(system: CloudSystem): Promise<CloudCamera[]> {
  const isSystemOnline = system.stateOfHealth === "online" || system.isOnline === true || system.isOnline === undefined;
  if (!isSystemOnline) return [];

  try {
    const response = await fetch(
      `/api/cloud/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...getElectronHeaders()
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const devices = await response.json();
    const cameraDevices = Array.isArray(devices) ? devices : [];

    return cameraDevices.map((device: Record<string, unknown>) => ({
      ...device,
      id: device.id as string,
      name: device.name as string,
      systemId: system.id,
      systemName: system.name,
    }));
  } catch (err) {
    console.error(`Error fetching cameras from ${system.name}:`, err);
    return [];
  }
}

// ============================================
// System Login API
// ============================================

export interface LoginResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Login to a specific cloud system
 */
export async function loginToSystem(systemId: string, username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch("/api/cloud/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemId,
        username,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || "Login failed" };
    }

    return { success: true, token: data.token };
  } catch (err) {
    console.error(`Login error for system ${systemId}:`, err);
    return { success: false, error: "Connection error. Please try again." };
  }
}

/**
 * Logout from a specific cloud system
 */
export async function logoutFromSystem(systemId: string): Promise<boolean> {
  try {
    await fetch(`/api/cloud/login?systemId=${systemId}`, {
      method: "DELETE",
    });
    return true;
  } catch (err) {
    console.error(`Logout error:`, err);
    return false;
  }
}

// ============================================
// Location Hierarchy API (Indonesia)
// ============================================

/**
 * Fetch all provinces
 */
export async function fetchProvinces(): Promise<Province[]> {
  try {
    const response = await fetch("/api/locations/provinces");
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (err) {
    console.error("Failed to fetch provinces:", err);
    return [];
  }
}

/**
 * Fetch regencies by province
 */
export async function fetchRegencies(provinceId: string): Promise<Regency[]> {
  if (!provinceId) return [];
  try {
    const response = await fetch(`/api/locations/regencies?province_id=${provinceId}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (err) {
    console.error("Failed to fetch regencies:", err);
    return [];
  }
}

/**
 * Fetch districts by regency
 */
export async function fetchDistricts(regencyId: string): Promise<District[]> {
  if (!regencyId) return [];
  try {
    const response = await fetch(`/api/locations/districts?regency_id=${regencyId}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (err) {
    console.error("Failed to fetch districts:", err);
    return [];
  }
}

/**
 * Fetch villages by district
 */
export async function fetchVillages(districtId: string): Promise<Village[]> {
  if (!districtId) return [];
  try {
    const response = await fetch(`/api/locations/villages?district_id=${districtId}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (err) {
    console.error("Failed to fetch villages:", err);
    return [];
  }
}

// ============================================
// Session login state (no passwords persisted)
// ============================================

export interface StoredCredentials {
  [systemId: string]: {
    username?: string;
    loggedIn: boolean;
    token?: string;
  };
}

let sessionLoginState: StoredCredentials = {};

/**
 * Load per-system login flags for the current browser session only.
 */
export function loadStoredCredentials(): StoredCredentials {
  return { ...sessionLoginState };
}

/**
 * Persist login flags in memory — never stores passwords.
 */
export function saveStoredCredentials(credentials: StoredCredentials): void {
  sessionLoginState = Object.fromEntries(
    Object.entries(credentials).map(([systemId, cred]) => [
      systemId,
      {
        username: cred.username,
        loggedIn: cred.loggedIn,
        token: cred.token,
      },
    ]),
  );
}

/**
 * Clear login state for one system.
 */
export function removeStoredCredentials(systemId: string): StoredCredentials {
  const current = loadStoredCredentials();
  delete current[systemId];
  saveStoredCredentials(current);
  return current;
}
