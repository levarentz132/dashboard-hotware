// Authentication Constants
// Centralized configuration for authentication system

export const AUTH_CONFIG = {
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET,
  // Short-lived access token; renewed via refresh token
  JWT_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",

  // Cookie Configuration
  COOKIE_NAME: "auth_token",
  COOKIE_REFRESH_NAME: "refresh_token",
  // Keep access cookie aligned with access token TTL
  COOKIE_MAX_AGE: 60 * 15, // 15 minutes in seconds
  COOKIE_REFRESH_MAX_AGE: 60 * 60 * 24 * 7, // 7 days in seconds

  // Password Configuration
  BCRYPT_SALT_ROUNDS: 12,
  MIN_PASSWORD_LENGTH: 8,

  // Rate Limiting
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 15,

  // Session Configuration
  SESSION_CHECK_INTERVAL: 60 * 1000, // 1 minute
  // Not used for refresh-token based flows; keep small to avoid extending sessions via access token alone
  TOKEN_REFRESH_THRESHOLD: 60 * 2, // 2 minutes
} as const;

export const AUTH_ROUTES = {
  LOGIN: "/login",
  LOGOUT: "/logout",
  DASHBOARD: "/",
  API_LOGIN: "/auth/login",
  API_LOGOUT: "/auth/logout",
  API_SESSION: "/auth/session",
  API_REFRESH: "/auth/refresh",
} as const;

export const PUBLIC_ROUTES = [
  AUTH_ROUTES.LOGIN,
  "/auth/login",
] as const;

export const AUTH_MESSAGES = {
  LOGIN_SUCCESS: "Login berhasil",
  LOGIN_FAILED: "Username atau password salah",
  LOGOUT_SUCCESS: "Logout berhasil",
  REGISTER_SUCCESS: "Registrasi berhasil",
  REGISTER_FAILED: "Registrasi gagal",
  SESSION_EXPIRED: "Sesi telah berakhir, silakan login kembali",
  UNAUTHORIZED: "Anda tidak memiliki akses ke halaman ini",
  USER_EXISTS: "Username atau email sudah terdaftar",
  INVALID_TOKEN: "Token tidak valid",
  SERVER_ERROR: "Terjadi kesalahan server",
  VALIDATION_ERROR: "Data tidak valid",
  ACCOUNT_LOCKED: "Akun terkunci sementara karena terlalu banyak percobaan login",
  ACCOUNT_INACTIVE: "Akun tidak aktif",
  PASSWORD_TOO_SHORT: `Password minimal ${AUTH_CONFIG.MIN_PASSWORD_LENGTH} karakter`,
} as const;

export const ROLE_PERMISSIONS = {
  admin: ["read", "write", "delete", "manage_users", "manage_system"],
  operator: ["read", "write", "manage_cameras"],
  viewer: ["read"],
} as const;
