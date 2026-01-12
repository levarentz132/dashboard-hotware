/**
 * Storage service - handles all storage-related API calls
 */

import { CLOUD_CONFIG } from "@/lib/config";
import type { CloudSystem, Storage, StorageFormData, StorageStatusInfo } from "./types";

// ============================================
// Cloud Systems API (shared pattern)
// ============================================

/**
 * Fetch all cloud systems from NX Cloud
 */
export async function fetchCloudSystems(): Promise<CloudSystem[]> {
  try {
    const response = await fetch("https://meta.nxvms.com/cdb/systems", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
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

// ============================================
// Authentication
// ============================================

/**
 * Auto-login to cloud system
 */
export async function attemptAutoLogin(systemId: string): Promise<boolean> {
  if (!CLOUD_CONFIG.autoLoginEnabled || !CLOUD_CONFIG.username || !CLOUD_CONFIG.password) {
    return false;
  }

  try {
    const response = await fetch("/api/cloud/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemId,
        username: CLOUD_CONFIG.username,
        password: CLOUD_CONFIG.password,
      }),
    });

    return response.ok;
  } catch (err) {
    console.error("Auto-login failed:", err);
    return false;
  }
}

/**
 * Manual login to cloud system
 */
export async function loginToCloudSystem(
  systemId: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/cloud/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemId, username, password }),
    });

    if (response.ok) {
      return { success: true };
    }

    const data = await response.json();
    return { success: false, error: data.error || "Login failed" };
  } catch {
    return { success: false, error: "Connection error" };
  }
}

// ============================================
// Cloud Storages API
// ============================================

export interface FetchStoragesResult {
  storages: Storage[];
  requiresAuth: boolean;
  error?: string;
}

/**
 * Fetch storages from cloud system
 */
export async function fetchCloudStorages(system: CloudSystem, autoLogin: boolean = true): Promise<FetchStoragesResult> {
  if (!system || system.stateOfHealth !== "online") {
    return { storages: [], requiresAuth: false };
  }

  try {
    const response = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`);

    if (response.status === 401) {
      // Try auto-login
      if (autoLogin) {
        const autoLoginSuccess = await attemptAutoLogin(system.id);
        if (autoLoginSuccess) {
          // Retry fetch
          const retryResponse = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`);
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            return { storages: Array.isArray(data) ? data : [], requiresAuth: false };
          }
        }
      }
      return { storages: [], requiresAuth: true };
    }

    if (!response.ok) {
      return { storages: [], requiresAuth: false, error: "Failed to fetch storages" };
    }

    const data = await response.json();
    return { storages: Array.isArray(data) ? data : [], requiresAuth: false };
  } catch (err) {
    console.error("Error fetching storages:", err);
    return { storages: [], requiresAuth: false, error: "Failed to fetch storages" };
  }
}

/**
 * Create storage in cloud system
 */
export async function createCloudStorage(
  systemId: string,
  serverId: string,
  formData: StorageFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `/api/cloud/storages?systemId=${encodeURIComponent(systemId)}&serverId=${encodeURIComponent(serverId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          path: formData.path,
          type: formData.type,
          spaceLimitB: formData.spaceLimitB,
          isUsedForWriting: formData.isUsedForWriting,
          isBackup: formData.isBackup,
        }),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || "Failed to create storage" };
    }

    return { success: true };
  } catch (err) {
    console.error("Error creating storage:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create storage" };
  }
}

/**
 * Update storage in cloud system
 */
export async function updateCloudStorage(
  systemId: string,
  storageId: string,
  serverId: string,
  formData: StorageFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `/api/cloud/storages/${storageId}?systemId=${encodeURIComponent(systemId)}&serverId=${encodeURIComponent(
        serverId
      )}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: storageId,
          serverId: serverId,
          name: formData.name,
          path: formData.path,
          type: formData.type,
          spaceLimitB: formData.spaceLimitB,
          isUsedForWriting: formData.isUsedForWriting,
          isBackup: formData.isBackup,
        }),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || "Failed to update storage" };
    }

    return { success: true };
  } catch (err) {
    console.error("Error updating storage:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update storage" };
  }
}

/**
 * Delete storage from cloud system
 */
export async function deleteCloudStorage(
  systemId: string,
  storageId: string,
  serverId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `/api/cloud/storages/${storageId}?systemId=${encodeURIComponent(systemId)}&serverId=${encodeURIComponent(
        serverId
      )}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || "Failed to delete storage" };
    }

    return { success: true };
  } catch (err) {
    console.error("Error deleting storage:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete storage" };
  }
}

// ============================================
// Local Storages API
// ============================================

/**
 * Fetch local storages from localhost:7001
 */
export async function fetchLocalStorages(): Promise<{ storages: Storage[]; error?: string }> {
  try {
    const response = await fetch("/api/nx/storages");
    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Local storage API error:", data);
      return {
        storages: [],
        error: data.error || data.details || "Failed to fetch local storages",
      };
    }

    // Map the response to Storage interface
    const mappedStorages: Storage[] = (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) => {
      const totalSpace = item.totalSpace || item.totalSpaceB || item.spaceLimit || item.spaceLimitB || 0;
      const freeSpace = item.freeSpace || item.freeSpaceB || 0;
      const reservedSpace = item.reservedSpace || item.reservedSpaceB || item.spaceLimitB || 0;

      return {
        id: (item.id as string) || "",
        serverId: (item.serverId as string) || (item.parentId as string) || "",
        name: (item.name as string) || (item.url as string) || "Unknown",
        path: (item.url as string) || (item.path as string) || "",
        type: (item.storageType as string) || (item.type as string) || "local",
        spaceLimitB: Number(reservedSpace) || 0,
        isUsedForWriting: (item.isUsedForWriting as boolean) ?? false,
        isBackup: (item.isBackup as boolean) ?? false,
        status: (item.isOnline as boolean) ? "Online" : "Offline",
        statusInfo: {
          url: (item.url as string) || (item.path as string) || "",
          storageId: (item.id as string) || "",
          totalSpace: String(totalSpace),
          freeSpace: String(freeSpace),
          reservedSpace: String(reservedSpace),
          isExternal: (item.isExternal as boolean) ?? false,
          isWritable: (item.isWritable as boolean) ?? true,
          isUsedForWriting: (item.isUsedForWriting as boolean) ?? false,
          isBackup: (item.isBackup as boolean) ?? false,
          isOnline: (item.isOnline as boolean) ?? false,
          storageType: (item.storageType as string) || (item.type as string) || "local",
          runtimeFlags: (item.runtimeFlags as string) || "",
          persistentFlags: (item.persistentFlags as string) || "",
          serverId: (item.serverId as string) || (item.parentId as string) || "",
          name: (item.name as string) || (item.url as string) || "Unknown",
        } as StorageStatusInfo,
      };
    });

    return { storages: mappedStorages };
  } catch (err) {
    console.error("Error fetching local storages:", err);
    return {
      storages: [],
      error:
        err instanceof Error
          ? err.message
          : "Failed to fetch local storages. Make sure the local server is running on localhost:7001",
    };
  }
}
