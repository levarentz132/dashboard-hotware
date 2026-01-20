/**
 * Widget service - shared utilities for dashboard widgets
 */

import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";
import type { CloudSystem, EventLog, Storage, AuditLogEntry } from "./types";

// ============================================
// Cloud Systems (shared across widgets)
// ============================================

/**
 * Fetch cloud systems sorted by owner/online status
 */
export async function fetchCloudSystems(): Promise<CloudSystem[]> {
  try {
    const response = await fetch("https://meta.nxvms.com/cdb/systems", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: getCloudAuthHeader(),
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const systems: CloudSystem[] = data.systems || [];

    // Sort: owner first, then online
    systems.sort((a, b) => {
      if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
      if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
      if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
      if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
      return 0;
    });

    return systems;
  } catch {
    return [];
  }
}

/**
 * Get first online system
 */
export function getFirstOnlineSystem(systems: CloudSystem[]): CloudSystem | null {
  return systems.find((s) => s.stateOfHealth === "online") || null;
}

// ============================================
// Authentication (shared)
// ============================================

/**
 * Attempt auto-login with config credentials
 */
export async function attemptAutoLogin(systemId: string): Promise<boolean> {
  if (!CLOUD_CONFIG.username || !CLOUD_CONFIG.password) return false;

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
  } catch {
    return false;
  }
}

// ============================================
// Events/Alarms Widget
// ============================================

/**
 * Fetch servers for a system
 */
export async function fetchServers(
  systemId: string,
  autoLogin: boolean = true,
): Promise<{ serverId: string | null; requiresAuth: boolean }> {
  try {
    const response = await fetch(`/api/cloud/servers?systemId=${encodeURIComponent(systemId)}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (response.status === 401 && autoLogin) {
      const success = await attemptAutoLogin(systemId);
      if (success) {
        return fetchServers(systemId, false);
      }
      return { serverId: null, requiresAuth: true };
    }

    if (!response.ok) return { serverId: null, requiresAuth: false };

    const data = await response.json();
    const servers = Array.isArray(data) ? data : [];
    const serverId = servers.length > 0 ? servers[0].id : null;

    return { serverId, requiresAuth: false };
  } catch {
    return { serverId: null, requiresAuth: false };
  }
}

/**
 * Fetch events from cloud system
 */
export async function fetchEvents(systemId: string, systemName: string, serverId: string): Promise<EventLog[]> {
  try {
    const params = new URLSearchParams({
      systemId,
      systemName,
      serverId,
      limit: "50",
    });

    const response = await fetch(`/api/cloud/events?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ============================================
// Storage Widget
// ============================================

/**
 * Fetch storages from cloud system
 */
export async function fetchStorages(
  systemId: string,
  autoLogin: boolean = true,
): Promise<{ storages: Storage[]; requiresAuth: boolean }> {
  try {
    const response = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(systemId)}`);

    if (response.status === 401 && autoLogin) {
      const success = await attemptAutoLogin(systemId);
      if (success) {
        return fetchStorages(systemId, false);
      }
      return { storages: [], requiresAuth: true };
    }

    if (!response.ok) return { storages: [], requiresAuth: false };

    const data = await response.json();
    return { storages: Array.isArray(data) ? data : [], requiresAuth: false };
  } catch {
    return { storages: [], requiresAuth: false };
  }
}

// ============================================
// Audit Log Widget
// ============================================

/**
 * Fetch audit logs from cloud system
 */
export async function fetchAuditLogs(
  systemId: string,
  daysBack: number = 7,
  autoLogin: boolean = true,
): Promise<{ logs: AuditLogEntry[]; requiresAuth: boolean }> {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateFormatted = fromDate.toISOString();

    const response = await fetch(
      `/api/cloud/audit-log?systemId=${encodeURIComponent(systemId)}&from=${encodeURIComponent(fromDateFormatted)}`,
      {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );

    if (response.status === 401 && autoLogin) {
      const success = await attemptAutoLogin(systemId);
      if (success) {
        return fetchAuditLogs(systemId, daysBack, false);
      }
      return { logs: [], requiresAuth: true };
    }

    if (!response.ok) return { logs: [], requiresAuth: false };

    const data = await response.json();
    const logs = data.reply || data;
    return { logs: Array.isArray(logs) ? logs : [], requiresAuth: false };
  } catch {
    return { logs: [], requiresAuth: false };
  }
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format relative time from microseconds
 */
export function formatRelativeTimeUsec(timestampUsec: string): string {
  if (!timestampUsec) return "";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return "";

  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}h lalu`;
  return `${Math.floor(diff / 604800000)}mg lalu`;
}

/**
 * Format relative time from seconds
 */
export function formatRelativeTimeSec(timestampSec: number): string {
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
 * Get event type short label
 */
export function getEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    cameraMotionEvent: "Motion",
    cameraDisconnectEvent: "Offline",
    storageFailureEvent: "Storage",
    networkIssueEvent: "Network",
    serverFailureEvent: "Server",
    serverStartEvent: "Server On",
    licenseIssueEvent: "License",
    systemHealthEvent: "Health",
    serverConflictEvent: "Conflict",
  };
  return labels[eventType] || eventType.replace("Event", "");
}

/**
 * Get level config for styling events
 */
export function getLevelConfig(level: string): {
  bgClass: string;
  borderClass: string;
  textClass: string;
} {
  switch (level?.toLowerCase()) {
    case "error":
      return {
        bgClass: "bg-red-50 dark:bg-red-950/30",
        borderClass: "border-red-200 dark:border-red-800",
        textClass: "text-red-600",
      };
    case "warning":
      return {
        bgClass: "bg-amber-50 dark:bg-amber-950/30",
        borderClass: "border-amber-200 dark:border-amber-800",
        textClass: "text-amber-600",
      };
    default:
      return {
        bgClass: "bg-blue-50 dark:bg-blue-950/30",
        borderClass: "border-blue-200 dark:border-blue-800",
        textClass: "text-blue-600",
      };
  }
}

// ============================================
// Storage Utilities
// ============================================

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: string | number): string {
  const numBytes = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(numBytes) || numBytes === 0) return "0 B";

  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(1024));
  return `${(numBytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Calculate storage usage percentage
 */
export function getStorageUsagePercentage(storage: Storage): number {
  if (!storage.statusInfo) return 0;
  const total = parseInt(storage.statusInfo.totalSpace);
  const free = parseInt(storage.statusInfo.freeSpace);
  if (isNaN(total) || isNaN(free) || total === 0) return 0;
  return Math.round(((total - free) / total) * 100);
}

/**
 * Calculate total storage stats
 */
export function calculateStorageStats(storages: Storage[]): {
  totalSpace: number;
  usedSpace: number;
  freeSpace: number;
  onlineCount: number;
} {
  let totalSpace = 0;
  let freeSpace = 0;
  let onlineCount = 0;

  storages.forEach((storage) => {
    if (storage.statusInfo) {
      totalSpace += parseInt(storage.statusInfo.totalSpace || "0");
      freeSpace += parseInt(storage.statusInfo.freeSpace || "0");
      if (storage.statusInfo.isOnline) onlineCount++;
    }
  });

  return {
    totalSpace,
    usedSpace: totalSpace - freeSpace,
    freeSpace,
    onlineCount,
  };
}
