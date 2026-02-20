/**
 * User service - handles all user-related API calls and utilities
 */

import type { NxUser, NxUserGroup, UserFormData, TimeUnit } from "./types";
import { API_CONFIG, getElectronHeaders } from "@/lib/config";

// ============================================
// Users API
// ============================================

/**
 * Fetch all users from NX API
 */
export async function fetchUsers(systemId?: string): Promise<{ users: NxUser[]; error?: string; requiresAuth?: boolean }> {
  try {
    const url = systemId ? `/api/nx/users?systemId=${encodeURIComponent(systemId)}` : "/api/nx/users";
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getElectronHeaders(),
      },
    });

    if (!response.ok) {
      const data = await response.json();
      if (response.status === 401 || data.requiresAuth) {
        return { users: [], error: "Authentication required", requiresAuth: true };
      }
      return {
        users: [],
        error: `Failed to fetch users: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { users: Array.isArray(data) ? data : [] };
  } catch (err) {
    return {
      users: [],
      error: err instanceof Error ? err.message : "Failed to fetch users",
    };
  }
}

/**
 * Fetch all user groups from NX API
 */
export async function fetchUserGroups(systemId?: string): Promise<{ groups: NxUserGroup[]; error?: string }> {
  try {
    const url = systemId ? `/api/nx/userGroups?systemId=${encodeURIComponent(systemId)}` : "/api/nx/userGroups";
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getElectronHeaders(),
      },
    });

    if (!response.ok) {
      return {
        groups: [],
        error: `Failed to fetch user groups: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { groups: Array.isArray(data) ? data : [] };
  } catch (err) {
    return {
      groups: [],
      error: err instanceof Error ? err.message : "Failed to fetch user groups",
    };
  }
}

/**
 * Create a new user
 */
export async function createUser(formData: any, systemId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalize group IDs if present
    const normalizedData = { ...formData };
    if (Array.isArray(normalizedData.groupIds)) {
      normalizedData.groupIds = normalizedData.groupIds.map((id: string) => id.replace(/[{}]|%7B|%7D/gi, ""));
    }

    const url = systemId ? `/api/nx/users?systemId=${encodeURIComponent(systemId)}` : "/api/nx/users";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getElectronHeaders()
      },
      body: JSON.stringify(normalizedData),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || data.message || "Failed to create user" };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create user",
    };
  }
}

/**
 * Update an existing user
 */
export async function updateUser(
  userId: string,
  formData: any,
  systemId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalize IDs to strip curly braces if present (VMS REST v3 expects plain UUIDs)
    // We handle both literal { } and encoded %7B %7D
    const normalizedUserId = userId.replace(/[{}]|%7B|%7D/gi, "");

    // Normalize group IDs if present
    const normalizedData = { ...formData };
    if (Array.isArray(normalizedData.groupIds)) {
      normalizedData.groupIds = normalizedData.groupIds.map((id: string) => id.replace(/[{}]|%7B|%7D/gi, ""));
    }

    const url = systemId
      ? `/api/nx/users/${normalizedUserId}?systemId=${encodeURIComponent(systemId)}`
      : `/api/nx/users/${normalizedUserId}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getElectronHeaders()
      },
      body: JSON.stringify(normalizedData),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || data.message || "Failed to update user" };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update user",
    };
  }
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string, systemId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalize ID to strip curly braces
    const normalizedUserId = userId.replace(/[{}]|%7B|%7D/gi, "");

    const url = systemId
      ? `/api/nx/users/${normalizedUserId}?systemId=${encodeURIComponent(systemId)}`
      : `/api/nx/users/${normalizedUserId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        ...getElectronHeaders()
      }
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || data.message || "Failed to delete user" };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete user",
    };
  }
}

// ============================================
// Time Utilities
// ============================================

/**
 * Convert time value to seconds
 */
export function timeUnitToSeconds(value: number, unit: TimeUnit): number {
  switch (unit) {
    case "minutes":
      return value * 60;
    case "hours":
      return value * 3600;
    case "days":
      return value * 86400;
    default:
      return value;
  }
}

/**
 * Convert seconds to time unit
 */
export function secondsToTimeUnit(seconds: number): { value: number; unit: TimeUnit } {
  if (seconds % 86400 === 0) {
    return { value: seconds / 86400, unit: "days" };
  } else if (seconds % 3600 === 0) {
    return { value: seconds / 3600, unit: "hours" };
  } else {
    return { value: Math.floor(seconds / 60), unit: "minutes" };
  }
}

// ============================================
// User Utilities
// ============================================

/**
 * Get group name by ID
 */
export function getGroupName(groupId: string, groups: NxUserGroup[]): string {
  const group = groups.find((g) => g.id === groupId);
  return group ? group.name : groupId.substring(0, 8) + "...";
}

/**
 * Filter users by search term and type
 */
export function filterUsers(
  users: NxUser[],
  filters: {
    searchTerm?: string;
    type?: string;
  }
): NxUser[] {
  return users.filter((user) => {
    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const matchesSearch =
        user.name.toLowerCase().includes(searchLower) || (user.email && user.email.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;
    }

    // Type filter
    if (filters.type && filters.type !== "all" && user.type !== filters.type) {
      return false;
    }

    return true;
  });
}

/**
 * Get user type badge configuration
 */
export function getUserTypeBadge(type: NxUser["type"]): { label: string; className: string } {
  const config = {
    local: { label: "Local", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
    temporaryLocal: {
      label: "Temporary",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    },
    ldap: { label: "LDAP", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
    cloud: { label: "Cloud", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  };
  return config[type] || { label: type, className: "bg-gray-100 text-gray-800" };
}

/**
 * Validate user form data
 */
export function validateUserForm(formData: UserFormData, isEditing: boolean = false): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!formData.name.trim()) {
    errors.name = "Username is required";
  }

  if (!isEditing && !formData.password) {
    errors.password = "Password is required";
  }

  if (formData.password && formData.password !== formData.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = "Invalid email format";
  }

  return errors;
}
