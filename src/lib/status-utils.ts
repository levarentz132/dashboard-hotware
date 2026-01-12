/**
 * Shared status utilities for consistent UI across components
 */

export type StatusType = "online" | "offline" | "warning" | "critical" | "healthy" | "unknown";
export type StatusVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Status color mappings for text and backgrounds
 */
export const STATUS_COLORS = {
  // Background colors
  bg: {
    healthy: "bg-green-50",
    online: "bg-green-50",
    warning: "bg-yellow-50",
    critical: "bg-red-50",
    offline: "bg-red-50",
    unknown: "bg-gray-50",
  },
  // Text colors
  text: {
    healthy: "text-green-600",
    online: "text-green-600",
    warning: "text-yellow-600",
    critical: "text-red-600",
    offline: "text-red-600",
    unknown: "text-gray-600",
  },
  // Dot/indicator colors
  dot: {
    healthy: "bg-green-500",
    online: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
    offline: "bg-red-500",
    unknown: "bg-gray-500",
  },
  // Border colors
  border: {
    healthy: "border-green-200",
    online: "border-green-200",
    warning: "border-yellow-200",
    critical: "border-red-200",
    offline: "border-red-200",
    unknown: "border-gray-200",
  },
} as const;

/**
 * Get combined status color classes
 */
export function getStatusColor(status: string): string {
  const normalizedStatus = normalizeStatus(status);
  return `${STATUS_COLORS.text[normalizedStatus]} ${STATUS_COLORS.bg[normalizedStatus]}`;
}

/**
 * Get status dot color class
 */
export function getStatusDotColor(status: string): string {
  const normalizedStatus = normalizeStatus(status);
  return STATUS_COLORS.dot[normalizedStatus];
}

/**
 * Get status badge variant for shadcn Badge component
 */
export function getStatusVariant(status: string): StatusVariant {
  const normalizedStatus = status?.toLowerCase() || "unknown";
  switch (normalizedStatus) {
    case "online":
    case "recording":
    case "healthy":
      return "default";
    case "offline":
    case "critical":
      return "destructive";
    default:
      return "secondary";
  }
}

/**
 * Normalize various status strings to standard types
 */
export function normalizeStatus(status: string): StatusType {
  const s = status?.toLowerCase() || "unknown";
  switch (s) {
    case "online":
    case "recording":
    case "connected":
    case "active":
      return "online";
    case "offline":
    case "disconnected":
    case "unavailable":
      return "offline";
    case "healthy":
    case "ok":
    case "good":
      return "healthy";
    case "warning":
    case "degraded":
      return "warning";
    case "critical":
    case "error":
    case "failed":
      return "critical";
    default:
      return "unknown";
  }
}

/**
 * Camera status order for sorting (lower = higher priority / shown first)
 */
export const CAMERA_STATUS_ORDER: Record<string, number> = {
  offline: 0,
  unauthorized: 1,
  notdefined: 2,
  incompatible: 3,
  online: 4,
  recording: 5,
};

/**
 * Sort cameras by status (offline first, then problems, then online)
 */
export function sortByStatus<T extends { status?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const statusA = a.status?.toLowerCase() || "unknown";
    const statusB = b.status?.toLowerCase() || "unknown";
    return (CAMERA_STATUS_ORDER[statusA] ?? 3) - (CAMERA_STATUS_ORDER[statusB] ?? 3);
  });
}

/**
 * Badge color for online/offline status
 */
export function getOnlineOfflineBadgeClass(isOnline: boolean): string {
  return isOnline ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
}

/**
 * Badge color for role (owner vs other)
 */
export function getRoleBadgeClass(role: string): string {
  const isOwner = role === "owner";
  return isOwner ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800";
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Format date to localized string
 */
export function formatDate(date: Date | string, locale: string = "id-ID"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return formatDate(d);
}
