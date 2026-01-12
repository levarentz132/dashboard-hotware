/**
 * Widgets barrel exports
 */

// Types
export type { CloudSystem, EventLog, Storage, StorageStatusInfo, AuditLogEntry } from "./types";

// Service functions
export {
  // Cloud systems
  fetchCloudSystems,
  getFirstOnlineSystem,
  attemptAutoLogin,
  // Events/Alarms
  fetchServers,
  fetchEvents,
  // Storage
  fetchStorages,
  // Audit logs
  fetchAuditLogs,
  // Formatting
  formatRelativeTimeUsec,
  formatRelativeTimeSec,
  getEventTypeLabel,
  getLevelConfig,
  // Storage utilities
  formatBytes,
  getStorageUsagePercentage,
  calculateStorageStats,
} from "./widget-service";

// Widget components
export { default as AlarmConsoleWidget } from "./AlarmConsoleWidget";
export { default as APIStatusWidget } from "./APIStatusWidget";
export { default as AuditLogWidget } from "./AuditLogWidget";
export { default as CameraOverviewWidget } from "./CameraOverviewWidget";
export { default as ConnectionStatusWidget } from "./ConnectionStatusWidget";
export { default as RecentAlarmsWidget } from "./RecentAlarmsWidget";
export { default as StorageSummaryWidget } from "./StorageSummaryWidget";
export { default as SystemStatusWidget } from "./SystemStatusWidget";
