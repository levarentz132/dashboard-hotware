// Authentication Service
// JWT operations for external authentication

import { SignJWT, jwtVerify } from "jose";
import { AUTH_CONFIG, AUTH_MESSAGES } from "./constants";
import type { UserPublic, JWTPayload, JWTCreatePayload, AuthTokens } from "./types";

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
// Session Operations (JWT-based, no database)
// ============================================================================

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

  // Reconstruct user from refresh token payload
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
