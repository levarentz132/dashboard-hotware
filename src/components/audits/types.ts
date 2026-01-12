/**
 * Audit types - interfaces for audit log module
 */

export interface AuthSession {
  id: string;
  userName: string;
  userHost: string;
  userAgent: string;
}

export interface AuditLogEntry {
  createdTimeSec: number;
  rangeStartSec: number;
  rangeEndSec: number;
  eventType: string;
  resources: string[];
  params: string;
  authSession: AuthSession;
}

export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

export interface CloudDevice {
  id: string;
  name: string;
}

// Event type info structure
export interface EventTypeInfo {
  label: string;
  color: string;
  icon: string;
}

// Event type descriptions and icons
export const EVENT_TYPE_INFO: Record<string, EventTypeInfo> = {
  AR_Login: { label: "User Login", color: "bg-green-100 text-green-800", icon: "login" },
  AR_Logout: { label: "User Logout", color: "bg-gray-100 text-gray-800", icon: "logout" },
  AR_CameraInsert: { label: "Camera Added", color: "bg-blue-100 text-blue-800", icon: "camera" },
  AR_CameraUpdate: { label: "Camera Updated", color: "bg-yellow-100 text-yellow-800", icon: "camera" },
  AR_CameraRemove: { label: "Camera Removed", color: "bg-red-100 text-red-800", icon: "camera" },
  AR_ServerUpdate: { label: "Server Updated", color: "bg-purple-100 text-purple-800", icon: "server" },
  AR_UserUpdate: { label: "User Updated", color: "bg-indigo-100 text-indigo-800", icon: "user" },
  AR_UserInsert: { label: "User Added", color: "bg-teal-100 text-teal-800", icon: "user" },
  AR_UserRemove: { label: "User Removed", color: "bg-orange-100 text-orange-800", icon: "user" },
  AR_SystemNameChanged: { label: "System Name Changed", color: "bg-pink-100 text-pink-800", icon: "settings" },
  AR_SettingsChange: { label: "Settings Changed", color: "bg-cyan-100 text-cyan-800", icon: "settings" },
  AR_DatabaseRestore: { label: "Database Restored", color: "bg-amber-100 text-amber-800", icon: "database" },
  AR_MitmAttack: { label: "Security Alert", color: "bg-red-200 text-red-900", icon: "shield" },
  AR_StorageInsert: { label: "Storage Added", color: "bg-emerald-100 text-emerald-800", icon: "storage" },
  AR_StorageUpdate: { label: "Storage Updated", color: "bg-lime-100 text-lime-800", icon: "storage" },
  AR_StorageRemove: { label: "Storage Removed", color: "bg-rose-100 text-rose-800", icon: "storage" },
};
