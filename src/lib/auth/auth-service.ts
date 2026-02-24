// Authentication Service
// JWT operations for external authentication

import { jwtVerify, importSPKI } from "jose";
import { AUTH_CONFIG, AUTH_MESSAGES } from "./constants";
import { callExternalRefreshAPI, getExternalPublicKey } from "./external-api";
import type { UserPublic, JWTPayload, AuthTokens } from "./types";

// ============================================================================
// JWT Utilities (Edge-compatible using jose)
// ============================================================================

let cachedPublicKey: any = null;
let cachedPublicKeyRaw: string | null = null;

/**
 * Get the public key for verification
 */
async function getPublicKey() {
  try {
    // 1. Return cached key if available and we've already imported it successfully
    if (cachedPublicKey && cachedPublicKeyRaw) {
      return cachedPublicKey;
    }

    const publicKeyPEM = await getExternalPublicKey();

    if (!publicKeyPEM || typeof publicKeyPEM !== 'string') {
      throw new Error(`Public key is not a valid string: ${typeof publicKeyPEM}`);
    }

    const trimmedKey = publicKeyPEM.trim();

    // 2. Double-check if raw key is same as cached (in case we didn't have cachedPublicKey for some reason)
    if (cachedPublicKeyRaw === trimmedKey && cachedPublicKey) {
      return cachedPublicKey;
    }

    // SPKI is for Public Keys (BEGIN PUBLIC KEY)
    const publicKey = await importSPKI(trimmedKey, "RS256");

    cachedPublicKey = publicKey;
    cachedPublicKeyRaw = trimmedKey;

    return publicKey;
  } catch (error) {
    console.error("[Auth Service] Error importing public key:", error);
    // FALLBACK
    return new TextEncoder().encode(AUTH_CONFIG.JWT_SECRET || "fallback-secret");
  }
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as JWTPayload;
  } catch (error: any) {
    if (error?.code === 'ERR_JWT_EXPIRED') {
      // This is expected behavior when token expires
      // console.log("[Auth Service] Token expired, client should refresh");
      return null;
    }
    console.error("[Auth Service] Token verification failed:", error);
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
// Session Operations (Now using remote tokens)
// ============================================================================

/**
 * Validate session from token
 */
export async function validateSession(
  token: string,
): Promise<{ valid: boolean; user?: UserPublic; newToken?: string }> {
  const payload = await verifyToken(token);

  if (!payload) {
    return { valid: false };
  }

  // Reconstruct user from JWT payload
  const userPublic: UserPublic = {
    id: parseInt(payload.sub),
    username: payload.username,
    email: payload.email,
    role: payload.role,
    system_id: payload.system_id,
    privileges: payload.privileges,
    is_active: true, // If token is valid, user is active
    created_at: new Date(),
    last_login: new Date(),
  };

  return { valid: true, user: userPublic };
}

/**
 * Refresh access token using remote external API
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; message?: string }> {
  try {
    const data = await callExternalRefreshAPI(refreshToken);

    if (!data.success || !data.access_token) {
      return {
        success: false,
        message: data.message || AUTH_MESSAGES.INVALID_TOKEN
      };
    }

    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token
    };
  } catch (error) {
    console.error("[Auth Service] Refresh error:", error);
    return { success: false, message: "Gagal menyegarkan token" };
  }
}

/**
 * Check if the user is authorized to access the requested system
 * Compares the user's licensed system_id with the requested systemId
 */
export function isAuthorizedForSystem(userSystemId: string, requestedSystemId: string): boolean {
  if (!userSystemId || !requestedSystemId) {
    return false;
  }
  return userSystemId === requestedSystemId;
}

/**
 * Get system_id from JWT token
 */
export async function getSystemIdFromToken(token: string): Promise<string | null> {
  const payload = await verifyToken(token);
  return payload?.system_id || null;
}

// Local token generation removed as we now use tokens from the external API
// generateAccessToken, generateRefreshToken, generateTokens, signJWT are deprecated
