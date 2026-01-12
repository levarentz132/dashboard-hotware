/**
 * User types - interfaces for user management module
 */

// User interface based on NX Witness API
export interface NxUser {
  id: string;
  name: string;
  fullName?: string;
  email?: string;
  type: "local" | "temporaryLocal" | "ldap" | "cloud";
  groupIds?: string[];
  isEnabled?: boolean;
  temporaryToken?: {
    startS?: number;
    endS?: number;
    expiresAfterLoginS?: number;
    token?: string;
  };
}

// User Group interface
export interface NxUserGroup {
  id: string;
  name: string;
  description?: string;
  parentGroupId?: string;
  permissions?: string[];
}

// Time unit type for expires after login
export type TimeUnit = "minutes" | "hours" | "days";

// Form data for creating/editing users
export interface UserFormData {
  name: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  type: "local" | "temporaryLocal" | "cloud";
  groupIds: string[];
  isEnabled: boolean;
  // Temporary user specific
  startS?: number;
  endS?: number;
  expiresAfterLoginS?: number;
  // Expires after login UI state
  expiresAfterLoginEnabled: boolean;
  expiresAfterLoginValue: number;
  expiresAfterLoginUnit: TimeUnit;
}

export const initialUserFormData: UserFormData = {
  name: "",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  type: "local",
  groupIds: [],
  isEnabled: true,
  startS: undefined,
  endS: undefined,
  expiresAfterLoginS: undefined,
  expiresAfterLoginEnabled: false,
  expiresAfterLoginValue: 1,
  expiresAfterLoginUnit: "days",
};
