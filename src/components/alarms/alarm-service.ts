/**
 * Alarm service - handles all alarm/event-related API calls and utilities
 */

import { getCloudAuthHeader } from "@/lib/config";
import type { CloudSystem, EventLog } from "./types";

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
        Authorization: getCloudAuthHeader(),
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
 * Fetch events from cloud system
 */
export async function fetchCloudEvents(
  systemId: string,
  systemName: string,
  options?: {
    from?: number;
    to?: number;
    limit?: number;
  },
): Promise<EventLog[]> {
  try {
    const params = new URLSearchParams({
      systemId,
      systemName,
    });

    if (options?.from) params.append("from", String(options.from));
    if (options?.to) params.append("to", String(options.to));
    if (options?.limit) params.append("limit", String(options.limit));

    const response = await fetch(`/api/cloud/events?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Error fetching events from ${systemName}:`, err);
    return [];
  }
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format timestamp from microseconds
 */
export function formatTimestamp(timestampUsec: string): string {
  if (!timestampUsec) return "N/A";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return timestampUsec;
  const date = new Date(ms);
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
 * Format relative time
 */
export function formatRelativeTime(timestampUsec: string): string {
  if (!timestampUsec) return "";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return "";

  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} hari lalu`;
  return formatTimestamp(timestampUsec);
}

// ============================================
// Label Mappings
// ============================================

const EVENT_TYPE_LABELS: Record<string, string> = {
  undefinedEvent: "Undefined Event",
  cameraMotionEvent: "Motion Detected",
  cameraInputEvent: "Camera Input",
  cameraDisconnectEvent: "Camera Offline",
  storageFailureEvent: "Storage Failure",
  networkIssueEvent: "Network Issue",
  cameraIpConflictEvent: "IP Conflict",
  serverFailureEvent: "Server Failure",
  serverConflictEvent: "Server Conflict",
  serverStartEvent: "Server Started",
  licenseIssueEvent: "License Issue",
  backupFinishedEvent: "Backup Complete",
  softwareTriggerEvent: "Software Trigger",
  analyticsSdkEvent: "Analytics Event",
  pluginDiagnosticEvent: "Plugin Diagnostic",
  poeOverBudgetEvent: "PoE Over Budget",
  fanErrorEvent: "Fan Error",
  analyticsSdkObjectDetected: "Object Detected",
  serverCertificateError: "Certificate Error",
  ldapSyncIssueEvent: "LDAP Sync Issue",
  saasIssueEvent: "Cloud Issue",
  systemHealthEvent: "System Health",
  maxSystemHealthEvent: "Critical Health",
  anyCameraEvent: "Camera Event",
  anyServerEvent: "Server Event",
  anyEvent: "System Event",
  userDefinedEvent: "Custom Event",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  undefinedAction: "Undefined",
  cameraOutputAction: "Camera Output",
  bookmarkAction: "Bookmark Created",
  cameraRecordingAction: "Recording Started",
  panicRecordingAction: "Panic Recording",
  sendMailAction: "Email Sent",
  diagnosticsAction: "Diagnostics",
  showPopupAction: "Popup Shown",
  playSoundAction: "Sound Playing",
  playSoundOnceAction: "Sound Played",
  sayTextAction: "Text Announced",
  executePtzPresetAction: "PTZ Preset",
  showTextOverlayAction: "Text Overlay",
  showOnAlarmLayoutAction: "Alarm Layout",
  execHttpRequestAction: "HTTP Request",
  acknowledgeAction: "Acknowledged",
  fullscreenCameraAction: "Fullscreen",
  exitFullscreenAction: "Exit Fullscreen",
  openLayoutAction: "Layout Opened",
  buzzerAction: "Buzzer",
  pushNotificationAction: "Push Sent",
};

/**
 * Get event type label
 */
export function getEventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] || eventType;
}

/**
 * Get action type label
 */
export function getActionTypeLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] || actionType;
}

// ============================================
// Level Configuration
// ============================================

export interface LevelConfig {
  variant: "destructive" | "outline" | "secondary";
  bgClass: string;
  borderClass: string;
  textClass: string;
  label: string;
}

/**
 * Get level configuration for styling
 */
export function getLevelConfig(level: string): LevelConfig {
  switch (level?.toLowerCase()) {
    case "error":
      return {
        variant: "destructive",
        bgClass: "bg-red-50 dark:bg-red-950/20",
        borderClass: "border-red-200 dark:border-red-800",
        textClass: "text-red-700 dark:text-red-400",
        label: "Error",
      };
    case "warning":
      return {
        variant: "outline",
        bgClass: "bg-amber-50 dark:bg-amber-950/20",
        borderClass: "border-amber-200 dark:border-amber-800",
        textClass: "text-amber-700 dark:text-amber-400",
        label: "Warning",
      };
    case "info":
    default:
      return {
        variant: "secondary",
        bgClass: "bg-blue-50 dark:bg-blue-950/20",
        borderClass: "border-blue-200 dark:border-blue-800",
        textClass: "text-blue-700 dark:text-blue-400",
        label: "Info",
      };
  }
}

// ============================================
// Filtering Utilities
// ============================================

/**
 * Filter events by criteria
 */
export function filterEvents(
  events: EventLog[],
  filters: {
    level?: string;
    eventType?: string;
    search?: string;
  },
): EventLog[] {
  return events.filter((event) => {
    const eventLevel = event.eventParams?.metadata?.level || "info";
    const eventType = event.eventParams?.eventType || "";
    const caption = event.eventParams?.caption || "";
    const description = event.eventParams?.description || "";
    const resourceName = event.eventParams?.resourceName || "";

    // Level filter
    if (filters.level && filters.level !== "all" && eventLevel !== filters.level) {
      return false;
    }

    // Event type filter
    if (filters.eventType && filters.eventType !== "all" && eventType !== filters.eventType) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        caption.toLowerCase().includes(searchLower) ||
        description.toLowerCase().includes(searchLower) ||
        resourceName.toLowerCase().includes(searchLower) ||
        eventType.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;
    }

    return true;
  });
}

/**
 * Count events by level
 */
export function countEventsByLevel(events: EventLog[]): {
  total: number;
  error: number;
  warning: number;
  info: number;
} {
  const counts = { total: events.length, error: 0, warning: 0, info: 0 };

  events.forEach((event) => {
    const level = event.eventParams?.metadata?.level || "info";
    switch (level.toLowerCase()) {
      case "error":
        counts.error++;
        break;
      case "warning":
        counts.warning++;
        break;
      default:
        counts.info++;
    }
  });

  return counts;
}
