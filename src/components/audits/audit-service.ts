/**
 * Audit service - handles all audit-related API calls
 */

import { CLOUD_CONFIG } from "@/lib/config";
import type { CloudSystem, CloudDevice, AuditLogEntry, EventTypeInfo } from "./types";
import { EVENT_TYPE_INFO } from "./types";

// ============================================
// Cloud Systems API
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

/**
 * Fetch devices for name mapping
 */
export async function fetchDevices(systemId: string): Promise<Record<string, string>> {
  try {
    const response = await fetch(`/api/cloud/devices?systemId=${encodeURIComponent(systemId)}`);
    if (response.ok) {
      const devices: CloudDevice[] = await response.json();
      const map: Record<string, string> = {};
      devices.forEach((device) => {
        map[device.id] = device.name;
        map[`{${device.id}}`] = device.name;
      });
      return map;
    }
  } catch (err) {
    console.error("Error fetching devices:", err);
  }
  return {};
}

// ============================================
// Authentication
// ============================================

/**
 * Attempt auto-login with configured credentials
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
// Audit Log API
// ============================================

export interface FetchAuditLogsResult {
  logs: AuditLogEntry[];
  requiresAuth: boolean;
  error?: string;
}

/**
 * Fetch audit logs from cloud system
 */
export async function fetchAuditLogs(
  system: CloudSystem,
  fromDate: string,
  autoLogin: boolean = true
): Promise<FetchAuditLogsResult> {
  if (!system || system.stateOfHealth !== "online") {
    return { logs: [], requiresAuth: false };
  }

  try {
    const fromDateFormatted = new Date(fromDate).toISOString();
    const response = await fetch(
      `/api/cloud/audit-log?systemId=${encodeURIComponent(system.id)}&from=${encodeURIComponent(fromDateFormatted)}`
    );

    if (response.status === 401) {
      if (autoLogin) {
        const autoLoginSuccess = await attemptAutoLogin(system.id);
        if (autoLoginSuccess) {
          const retryResponse = await fetch(
            `/api/cloud/audit-log?systemId=${encodeURIComponent(system.id)}&from=${encodeURIComponent(
              fromDateFormatted
            )}`
          );
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            const logs = data.reply || data;
            return { logs: Array.isArray(logs) ? logs : [], requiresAuth: false };
          }
        }
      }
      return { logs: [], requiresAuth: true };
    }

    if (!response.ok) {
      return { logs: [], requiresAuth: false, error: "Failed to fetch audit logs" };
    }

    const data = await response.json();
    const logs = data.reply || data;
    return { logs: Array.isArray(logs) ? logs : [], requiresAuth: false };
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    return { logs: [], requiresAuth: false, error: "Failed to fetch audit logs" };
  }
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format timestamp from seconds
 */
export function formatTimestamp(timestampSec: number): string {
  if (!timestampSec) return "-";
  const date = new Date(timestampSec * 1000);
  return date.toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format relative time from seconds
 */
export function formatRelativeTime(timestampSec: number): string {
  if (!timestampSec) return "";
  const now = Date.now();
  const diff = now - timestampSec * 1000;

  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}h lalu`;
  return `${Math.floor(diff / 604800000)}mg lalu`;
}

/**
 * Get event info for event type
 */
export function getEventInfo(eventType: string): EventTypeInfo {
  return (
    EVENT_TYPE_INFO[eventType] || {
      label: eventType
        .replace("AR_", "")
        .replace(/([A-Z])/g, " $1")
        .trim(),
      color: "bg-gray-100 text-gray-800",
      icon: "activity",
    }
  );
}

// ============================================
// Filtering Utilities
// ============================================

/**
 * Filter audit logs by criteria
 */
export function filterAuditLogs(
  logs: AuditLogEntry[],
  filters: {
    searchTerm?: string;
    eventType?: string;
    user?: string;
  }
): AuditLogEntry[] {
  return logs.filter((log) => {
    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const matchesSearch =
        log.eventType.toLowerCase().includes(searchLower) ||
        log.authSession?.userName?.toLowerCase().includes(searchLower) ||
        log.authSession?.userHost?.toLowerCase().includes(searchLower) ||
        log.resources?.some((r) => r.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;
    }

    // Event type filter
    if (filters.eventType && filters.eventType !== "all" && log.eventType !== filters.eventType) {
      return false;
    }

    // User filter
    if (filters.user && filters.user !== "all" && log.authSession?.userName !== filters.user) {
      return false;
    }

    return true;
  });
}

/**
 * Get unique event types from logs
 */
export function getUniqueEventTypes(logs: AuditLogEntry[]): string[] {
  return Array.from(new Set(logs.map((log) => log.eventType))).sort();
}

/**
 * Get unique users from logs
 */
export function getUniqueUsers(logs: AuditLogEntry[]): string[] {
  return Array.from(new Set(logs.map((log) => log.authSession?.userName).filter(Boolean))).sort() as string[];
}
