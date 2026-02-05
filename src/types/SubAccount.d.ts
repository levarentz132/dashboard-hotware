// Sub-Account Types
// Types for sub-account management system

export interface Privilege {
  module: string; // e.g., "cameras", "alarms", "storage", "analytics", "users"
  can_view: boolean;
  can_edit: boolean;
}

export interface SubAccount {
  id: number;
  parent_id: number; // ID of the parent/main account
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  privileges: Privilege[];
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export interface SubAccountCreateRequest {
  username: string;
  email: string;
  password: string;
  full_name: string;
  is_active: boolean;
  privileges: Privilege[];
}

export interface SubAccountUpdateRequest {
  username?: string;
  email?: string;
  password?: string; // Optional - only if changing password
  full_name?: string;
  is_active?: boolean;
  privileges?: Privilege[];
}

export interface SubAccountListResponse {
  success: boolean;
  message?: string;
  data?: SubAccount[];
  total?: number;
}

export interface SubAccountResponse {
  success: boolean;
  message?: string;
  data?: SubAccount;
}

// Available modules for privileges
export const AVAILABLE_MODULES = [
  { id: "dashboard", label: "Dashboard", description: "Lihat dan kelola dashboard" },
  { id: "cameras", label: "Camera Inventory", description: "Kelola kamera dan perangkat" },
  { id: "health", label: "System Health", description: "Monitor kesehatan sistem" },
  { id: "alarms", label: "Alarm Console", description: "Kelola alarm dan notifikasi" },
  { id: "audits", label: "User Logs", description: "Lihat log aktivitas pengguna" },
  { id: "analytics", label: "Analytics", description: "Lihat analitik dan laporan" },
  { id: "storage", label: "Storage", description: "Kelola penyimpanan" },
  { id: "users", label: "User Management", description: "Kelola pengguna NX System" },
  { id: "subaccounts", label: "Sub Accounts", description: "Kelola sub-akun" },
] as const;

export type ModuleId = (typeof AVAILABLE_MODULES)[number]["id"];
