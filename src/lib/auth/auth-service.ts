// Authentication Service
// Core authentication utilities: password hashing, JWT operations, user management

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { readJsonFile, writeJsonFile } from "@/lib/json-storage";
import { AUTH_CONFIG, AUTH_MESSAGES } from "./constants";
import type {
  User,
  UserPublic,
  JWTPayload,
  JWTCreatePayload,
  AuthResponse,
  LoginCredentials,
  RegisterData,
  AuthTokens,
} from "./types";

// ============================================================================
// JSON Storage for Users
// ============================================================================

interface UserStore {
  nextId: number;
  users: User[];
}

const USERS_FILE = "users.json";

const defaultUserStore: UserStore = {
  nextId: 1,
  users: [],
};

async function getUserStore(): Promise<UserStore> {
  return readJsonFile(USERS_FILE, defaultUserStore);
}

async function saveUserStore(store: UserStore): Promise<void> {
  return writeJsonFile(USERS_FILE, store);
}

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
 * Sign JWT with custom payload (for token creation with string expiration)
 */
export async function signJWT(payload: JWTCreatePayload): Promise<string> {
  const token = await new SignJWT({
    sub: payload.sub,
    username: payload.username,
    email: payload.email,
    role: payload.role,
    ...(payload.type ? { type: payload.type } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(secretKey);

  return token;
}

/**
 * Generate JWT refresh token
 */
export async function generateRefreshToken(user: UserPublic): Promise<string> {
  const token = await new SignJWT({
    sub: user.id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
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
  const [accessToken, refreshToken] = await Promise.all([generateAccessToken(user), generateRefreshToken(user)]);

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
// User JSON Storage Operations
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
  const store = await getUserStore();
  return store.users.find((u) => u.username === username) || null;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const store = await getUserStore();
  return store.users.find((u) => u.email === email) || null;
}

/**
 * Find user by ID
 */
export async function findUserById(id: number): Promise<User | null> {
  const store = await getUserStore();
  return store.users.find((u) => u.id === id) || null;
}

/**
 * Create new user
 */
export async function createUser(data: RegisterData): Promise<UserPublic> {
  const store = await getUserStore();
  const passwordHash = await hashPassword(data.password);
  const now = new Date().toISOString();

  const newUser: User = {
    id: store.nextId,
    username: data.username,
    email: data.email,
    password_hash: passwordHash,
    role: data.role || "viewer",
    is_active: true,
    created_at: new Date(now),
    updated_at: new Date(now),
    last_login: undefined,
  };

  store.users.push(newUser);
  store.nextId++;
  await saveUserStore(store);

  return toUserPublic(newUser);
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(userId: number): Promise<void> {
  const store = await getUserStore();
  const userIndex = store.users.findIndex((u) => u.id === userId);

  if (userIndex !== -1) {
    store.users[userIndex].last_login = new Date();
    store.users[userIndex].updated_at = new Date();
    await saveUserStore(store);
  }
}

/**
 * Check if username or email already exists
 */
export async function userExists(
  username: string,
  email: string,
): Promise<{ exists: boolean; field?: "username" | "email" }> {
  const store = await getUserStore();

  const existingByUsername = store.users.find((u) => u.username === username);
  if (existingByUsername) {
    return { exists: true, field: "username" };
  }

  const existingByEmail = store.users.find((u) => u.email === email);
  if (existingByEmail) {
    return { exists: true, field: "email" };
  }

  return { exists: false };
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
 *
 * For external authentication, we don't need database lookup
 * since all user info is already in the JWT payload
 */
export async function validateSession(
  token: string,
): Promise<{ valid: boolean; user?: UserPublic; newToken?: string }> {
  const payload = await verifyToken(token);

  if (!payload) {
    return { valid: false };
  }

  // Reconstruct user from JWT payload (works without database)
  const userPublic: UserPublic = {
    id: parseInt(payload.sub),
    username: payload.username,
    email: payload.email,
    role: payload.role,
    is_active: true, // If token is valid, user is active
    created_at: new Date(),
    last_login: new Date(),
  };

  return { valid: true, user: userPublic };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; message?: string }> {
  const payload = await verifyToken(refreshToken);

  if (!payload) {
    return { success: false, message: AUTH_MESSAGES.INVALID_TOKEN };
  }

  if (payload.type !== "refresh") {
    return { success: false, message: AUTH_MESSAGES.INVALID_TOKEN };
  }

  // Reconstruct user from refresh token payload to avoid DB dependency
  const userPublic: UserPublic = {
    id: parseInt(payload.sub),
    username: payload.username,
    email: payload.email,
    role: payload.role,
    is_active: true,
    created_at: new Date(),
    last_login: new Date(),
  };

  if (!userPublic.id || !userPublic.username || !userPublic.email || !userPublic.role) {
    return { success: false, message: AUTH_MESSAGES.INVALID_TOKEN };
  }

  const [accessToken, newRefreshToken] = await Promise.all([
    generateAccessToken(userPublic),
    // Rotate refresh token on every refresh
    generateRefreshToken(userPublic),
  ]);

  return { success: true, accessToken, refreshToken: newRefreshToken };
}
