/**
 * Storage utilities - formatting and helper functions
 */

import type { Storage } from "./types";

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: string | number): string {
  const numBytes = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(numBytes) || numBytes === 0) return "0 B";

  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(1024));
  return `${(numBytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format bytes to GB for display
 */
export function formatBytesToGB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

/**
 * Parse GB to bytes
 */
export function parseGBToBytes(gb: string): number {
  const num = parseFloat(gb);
  if (isNaN(num)) return 10737418240; // 10 GB default
  return Math.round(num * 1024 * 1024 * 1024);
}

// ============================================
// Calculation Utilities
// ============================================

/**
 * Calculate usage percentage for a storage
 */
export function getUsagePercentage(storage: Storage): number {
  if (!storage.statusInfo) return 0;
  const total = parseInt(storage.statusInfo.totalSpace);
  const free = parseInt(storage.statusInfo.freeSpace);
  if (isNaN(total) || isNaN(free) || total === 0) return 0;
  return Math.round(((total - free) / total) * 100);
}

/**
 * Calculate total storage from array of storages
 */
export function calculateTotalStorage(storages: Storage[]): number {
  return storages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.totalSpace || "0");
    }
    return acc;
  }, 0);
}

/**
 * Calculate total used storage
 */
export function calculateTotalUsed(storages: Storage[]): number {
  return storages.reduce((acc, s) => {
    if (s.statusInfo) {
      const total = parseInt(s.statusInfo.totalSpace || "0");
      const free = parseInt(s.statusInfo.freeSpace || "0");
      return acc + (total - free);
    }
    return acc;
  }, 0);
}

/**
 * Calculate total free storage
 */
export function calculateTotalFree(storages: Storage[]): number {
  return storages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.freeSpace || "0");
    }
    return acc;
  }, 0);
}

/**
 * Count online storages
 */
export function countOnlineStorages(storages: Storage[]): number {
  return storages.filter((s) => s.status === "Online" || s.statusInfo?.isOnline).length;
}

/**
 * Get server ID from storages (assuming all belong to same server)
 */
export function getServerId(storages: Storage[]): string {
  if (storages.length > 0 && storages[0].serverId) {
    return storages[0].serverId;
  }
  return "this"; // Default to "this" which represents the current server
}

// ============================================
// Status Utilities
// ============================================

/**
 * Get status color class
 */
export function getStatusColor(status?: string): string {
  switch (status) {
    case "Online":
    case "Recording":
      return "bg-green-100 text-green-800";
    case "Offline":
      return "bg-red-100 text-red-800";
    case "Unauthorized":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Get usage color based on percentage
 */
export function getUsageColor(percentage: number): string {
  if (percentage >= 90) return "text-red-600";
  if (percentage >= 75) return "text-amber-600";
  return "text-green-600";
}

/**
 * Get progress bar color based on percentage
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 75) return "bg-amber-500";
  return "bg-blue-500";
}
