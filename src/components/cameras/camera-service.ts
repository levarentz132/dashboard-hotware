/**
 * Camera service - handles all camera-related API calls
 */

import { getCloudAuthHeader, getElectronHeaders } from "@/lib/config";
import type { CloudSystem, CloudCamera, Province, Regency, District, Village } from "./types";

// ============================================
// Cloud Systems API
// ============================================

/**
 * Fetch all cloud systems from internal proxy
 */
export async function fetchCloudSystems(): Promise<CloudSystem[]> {
  try {
    const response = await fetch("/api/cloud/systems", {
      method: "GET",
      credentials: "include",
      headers: {
        ...getElectronHeaders()
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    const systems: CloudSystem[] = data.systems || [];

    // Sort: owner first, then online systems
    systems.sort((a, b) => {
      if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
      if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
      if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
      if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
      return 0;
    });

    return systems;
  } catch (err) {
    console.error("Error fetching cloud systems:", err);
    return [];
  }
}

/**
 * Fetch cameras from a specific cloud system
 */
export async function fetchCloudCameras(system: CloudSystem): Promise<CloudCamera[]> {
  if (system.stateOfHealth !== "online") return [];

  try {
    const response = await fetch(
      `/api/nx/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
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
// Credentials Persistence
// ============================================

const CREDENTIALS_KEY = "nxSystemCredentials";

export interface StoredCredentials {
  [systemId: string]: {
    username: string;
    password: string;
    token?: string;
    loggedIn: boolean;
  };
}

/**
 * Load credentials from localStorage
 */
export function loadStoredCredentials(): StoredCredentials {
  try {
    const saved = localStorage.getItem(CREDENTIALS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error("Error loading saved credentials:", err);
  }
  return {};
}

/**
 * Save credentials to localStorage
 */
export function saveStoredCredentials(credentials: StoredCredentials): void {
  try {
    if (Object.keys(credentials).length > 0) {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
    } else {
      localStorage.removeItem(CREDENTIALS_KEY);
    }
  } catch (err) {
    console.error("Error saving credentials to localStorage:", err);
  }
}

/**
 * Remove credentials for a system
 */
export function removeStoredCredentials(systemId: string): StoredCredentials {
  const current = loadStoredCredentials();
  delete current[systemId];
  saveStoredCredentials(current);
  return current;
}
