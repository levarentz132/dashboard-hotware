// Authentication Types
// Centralized type definitions for authentication system

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

export type UserRole = "admin" | "operator" | "viewer";

export interface UserPublic {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  last_login?: Date;
}

// Payload for creating JWT tokens (exp can be string like "24h")
export interface JWTCreatePayload {
  sub: string; // user id
  username: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number | string; // number (Unix timestamp) or string duration (e.g., "24h")
}

// Verified JWT payload (exp is always Unix timestamp number)
export interface JWTPayload {
  sub: string; // user id
  username: string;
  email: string;
  role: UserRole;
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
  register: (data: RegisterData) => Promise<AuthResponse>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}
