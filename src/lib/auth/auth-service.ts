// Authentication Service
// Core authentication utilities: password hashing, JWT operations, user management

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";
import { db } from "@/lib/db";
import { AUTH_CONFIG, AUTH_MESSAGES } from "./constants";
import type { User, UserPublic, JWTPayload, AuthResponse, LoginCredentials, RegisterData, AuthTokens } from "./types";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

// ============================================================================
// Password Utilities
// ============================================================================

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  message?: string;
} {
  if (password.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
    return { valid: false, message: AUTH_MESSAGES.PASSWORD_TOO_SHORT };
  }

  // Check for at least one uppercase, lowercase, number
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumber) {
    return {
      valid: false,
      message: "Password harus mengandung huruf besar, huruf kecil, dan angka",
    };
  }

  return { valid: true };
}

// ============================================================================
// JWT Utilities (Edge-compatible using jose)
// ============================================================================

const secretKey = new TextEncoder().encode(AUTH_CONFIG.JWT_SECRET);

/**
 * Generate JWT access token
 */
export async function generateAccessToken(user: UserPublic): Promise<string> {
  const token = await new SignJWT({
    sub: user.id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(AUTH_CONFIG.JWT_EXPIRES_IN)
    .sign(secretKey);

  return token;
}

/**
 * Generate JWT refresh token
 */
export async function generateRefreshToken(userId: number): Promise<string> {
  const token = await new SignJWT({
    sub: userId.toString(),
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(AUTH_CONFIG.JWT_REFRESH_EXPIRES_IN)
    .sign(secretKey);

  return token;
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokens(user: UserPublic): Promise<AuthTokens> {
  const [accessToken, refreshToken] = await Promise.all([generateAccessToken(user), generateRefreshToken(user.id)]);

  return { accessToken, refreshToken };
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired or about to expire
 */
export function isTokenExpiringSoon(payload: JWTPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = payload.exp - now;
  return timeRemaining < AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD;
}

// ============================================================================
// User Database Operations
// ============================================================================

/**
 * Convert database row to UserPublic (safe for client)
 */
function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

/**
 * Find user by username
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
  return rows.length > 0 ? (rows[0] as User) : null;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
  return rows.length > 0 ? (rows[0] as User) : null;
}

/**
 * Find user by ID
 */
export async function findUserById(id: number): Promise<User | null> {
  const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows.length > 0 ? (rows[0] as User) : null;
}

/**
 * Create new user
 */
export async function createUser(data: RegisterData): Promise<UserPublic> {
  const passwordHash = await hashPassword(data.password);

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO users (username, email, password_hash, role, is_active, created_at, updated_at) 
     VALUES (?, ?, ?, ?, true, NOW(), NOW())`,
    [data.username, data.email, passwordHash, data.role || "viewer"]
  );

  const user = await findUserById(result.insertId);
  if (!user) throw new Error("Failed to create user");

  return toUserPublic(user);
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(userId: number): Promise<void> {
  await db.execute("UPDATE users SET last_login = NOW() WHERE id = ?", [userId]);
}

/**
 * Check if username or email already exists
 */
export async function userExists(
  username: string,
  email: string
): Promise<{ exists: boolean; field?: "username" | "email" }> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT username, email FROM users WHERE username = ? OR email = ?",
    [username, email]
  );

  if (rows.length === 0) return { exists: false };

  const existing = rows[0] as { username: string; email: string };
  if (existing.username === username) {
    return { exists: true, field: "username" };
  }
  return { exists: true, field: "email" };
}

// ============================================================================
// Authentication Operations
// ============================================================================

/**
 * Login user with credentials
 */
export async function loginUser(credentials: LoginCredentials): Promise<AuthResponse> {
  try {
    const user = await findUserByUsername(credentials.username);

    if (!user) {
      return {
        success: false,
        message: AUTH_MESSAGES.LOGIN_FAILED,
      };
    }

    if (!user.is_active) {
      return {
        success: false,
        message: AUTH_MESSAGES.ACCOUNT_INACTIVE,
      };
    }

    const isValidPassword = await verifyPassword(credentials.password, user.password_hash);

    if (!isValidPassword) {
      return {
        success: false,
        message: AUTH_MESSAGES.LOGIN_FAILED,
      };
    }

    // Update last login
    await updateLastLogin(user.id);

    const userPublic = toUserPublic(user);
    const tokens = await generateTokens(userPublic);

    return {
      success: true,
      message: AUTH_MESSAGES.LOGIN_SUCCESS,
      user: userPublic,
      tokens,
    };
  } catch (error) {
    console.error("Login error:", error);
    return {
      success: false,
      message: AUTH_MESSAGES.SERVER_ERROR,
    };
  }
}

/**
 * Register new user
 */
export async function registerUser(data: RegisterData): Promise<AuthResponse> {
  try {
    // Validate password
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        message: passwordValidation.message || AUTH_MESSAGES.VALIDATION_ERROR,
      };
    }

    // Check if user already exists
    const exists = await userExists(data.username, data.email);
    if (exists.exists) {
      return {
        success: false,
        message: exists.field === "username" ? "Username sudah digunakan" : "Email sudah terdaftar",
      };
    }

    // Create user
    const user = await createUser(data);
    const tokens = await generateTokens(user);

    return {
      success: true,
      message: AUTH_MESSAGES.REGISTER_SUCCESS,
      user,
      tokens,
    };
  } catch (error) {
    console.error("Register error:", error);
    return {
      success: false,
      message: AUTH_MESSAGES.SERVER_ERROR,
    };
  }
}

/**
 * Validate session from token
 */
export async function validateSession(
  token: string
): Promise<{ valid: boolean; user?: UserPublic; newToken?: string }> {
  const payload = await verifyToken(token);

  if (!payload) {
    return { valid: false };
  }

  const user = await findUserById(parseInt(payload.sub));

  if (!user || !user.is_active) {
    return { valid: false };
  }

  const userPublic = toUserPublic(user);

  // Check if token needs refresh
  if (isTokenExpiringSoon(payload)) {
    const newToken = await generateAccessToken(userPublic);
    return { valid: true, user: userPublic, newToken };
  }

  return { valid: true, user: userPublic };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ success: boolean; accessToken?: string; message?: string }> {
  const payload = await verifyToken(refreshToken);

  if (!payload) {
    return { success: false, message: AUTH_MESSAGES.INVALID_TOKEN };
  }

  const user = await findUserById(parseInt(payload.sub));

  if (!user || !user.is_active) {
    return { success: false, message: AUTH_MESSAGES.ACCOUNT_INACTIVE };
  }

  const accessToken = await generateAccessToken(toUserPublic(user));

  return { success: true, accessToken };
}
