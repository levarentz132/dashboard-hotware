// Authentication Types
// Centralized type definitions for authentication system

export interface Privilege {
  module: string;
  can_view: boolean;
  can_edit: boolean;
}

export interface Organization {
  id: number;
  name: string;
  system_id: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole; // Kept for backward compatibility
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

export type UserRole = "admin" | "operator" | "viewer";

export interface Role {
  id: number;
  name: string;
}

export interface UserPublic {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role?: UserRole | Role; // Support both old string and new object role
  system_id: string; // The system ID this user is licensed for
  organizations?: Organization[]; // New: organizations the user belongs to
  privileges?: Privilege[]; // New: user's access privileges
  is_active: boolean;
  created_at: Date | string;
  last_login?: Date | string | null;
}

// Payload for creating JWT tokens (exp can be string like "24h")
export interface JWTCreatePayload {
  sub: string; // user id
  username: string;
  email: string;
  role?: UserRole; // Optional for backward compatibility
  system_id: string; // The system ID this user is licensed for
  privileges?: Privilege[]; // User's access privileges
  type?: "access" | "refresh";
  iat: number;
  exp: number | string; // number (Unix timestamp) or string duration (e.g., "24h")
}

// Verified JWT payload (exp is always Unix timestamp number)
export interface JWTPayload {
  sub: string; // user id
  username: string;
  email: string;
  role?: UserRole; // Optional for backward compatibility
  system_id: string; // The system ID this user is licensed for
  privileges?: Privilege[]; // User's access privileges
  type?: "access" | "refresh";
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
  system_id?: string;
  server_id?: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: UserPublic;
  tokens?: AuthTokens;
}

export interface SessionData {
  user: UserPublic;
  isAuthenticated: boolean;
  expiresAt: number;
}

export interface AuthState {
  user: UserPublic | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}
