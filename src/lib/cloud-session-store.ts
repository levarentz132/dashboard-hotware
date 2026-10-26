/**
 * Persistent Cloud Session Storage
 * Source of truth: data/nx_cloud_session.json
 * Allows the server backend to run 24/7 without needing any active browser tabs.
 */

import fs from "fs";
import path from "path";
import { readJsonWithCache, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";
import { refreshNxCloudToken, loginNxCloudWithPassword } from "@/lib/nx-cloud-service";

export function getCloudSessionFilePath(): string {
  const candidates = [
    path.join(process.cwd(), "data", "nx_cloud_session.json"),
    path.join(process.cwd(), "..", "..", "data", "nx_cloud_session.json"),
    path.join(process.cwd(), "..", "data", "nx_cloud_session.json"),
    "/www/wwwroot/108.136.246.113/dashboard-hotware/data/nx_cloud_session.json",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return candidates[0];
}

export const CLOUD_SESSION_FILE = getCloudSessionFilePath();

export interface ServerCloudSession {
  accessToken: string;
  refreshToken: string;
  email?: string;
  ownerSystemId?: string;
  updatedAt: number;
}

function isServerCloudSession(data: unknown): data is ServerCloudSession {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as ServerCloudSession).refreshToken === "string"
  );
}

const REDIS_CLOUD_SESSION_KEY = `${redisKeys.deviceMonitorLatest().split(":")[0]}:cloud_session`;

/**
 * Save server-side cloud session to disk (and Redis cache)
 */
export async function saveServerCloudSession(
  session: Partial<ServerCloudSession> & { refreshToken: string },
): Promise<void> {
  const filePath = getCloudSessionFilePath();
  const current = (await readServerCloudSession()) || {};
  const updated: ServerCloudSession = {
    accessToken: session.accessToken || current.accessToken || "",
    refreshToken: session.refreshToken || current.refreshToken || "",
    email: session.email || current.email,
    ownerSystemId: session.ownerSystemId || current.ownerSystemId,
    updatedAt: Date.now(),
  };

  await writeJsonWithCache(filePath, REDIS_CLOUD_SESSION_KEY, updated);
  console.log(`[CloudSessionStore] 💾 Cloud session saved for ${updated.email || "account"} to ${filePath}`);
}

/**
 * Read the raw session from disk/cache without refreshing
 */
export async function readServerCloudSession(): Promise<ServerCloudSession | null> {
  const filePath = getCloudSessionFilePath();
  return readJsonWithCache<ServerCloudSession>({
    filePath,
    redisKey: REDIS_CLOUD_SESSION_KEY,
    validate: isServerCloudSession,
  });
}

/**
 * Get a valid cloud session, automatically refreshing access_token if expired or missing,
 * or authenticating directly using cloud credentials if available in environment.
 */
export async function getValidServerCloudSession(): Promise<ServerCloudSession | null> {
  let session = await readServerCloudSession();

  // 1. Fallback to direct refresh token from environment
  if (!session?.refreshToken) {
    const envToken =
      process.env.NX_CLOUD_REFRESH_TOKEN ||
      process.env.NEXT_PUBLIC_NX_CLOUD_REFRESH_TOKEN;
    if (envToken) {
      session = {
        accessToken: "",
        refreshToken: envToken,
        updatedAt: 0,
      };
    }
  }

  // 2. Fallback to direct username & password authentication
  if (!session?.refreshToken) {
    let username =
      process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME ||
      process.env.NX_CLOUD_USERNAME;
    let password =
      process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD ||
      process.env.NX_CLOUD_PASSWORD;

    // In standalone mode, process.env might not be populated if .env wasn't sourced.
    // Directly check .env and .env.local on disk as a robust fallback.
    if (!username || !password) {
      try {
        const fs = require("fs");
        for (const file of [".env.local", ".env"]) {
          const p = path.join(process.cwd(), file);
          if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, "utf-8");
            for (const line of content.split(/\r?\n/)) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith("#")) continue;
              const eq = trimmed.indexOf("=");
              if (eq > 0) {
                const key = trimmed.substring(0, eq).trim();
                const val = trimmed.substring(eq + 1).trim().replace(/^['"]|['"]$/g, "");
                if ((key === "NEXT_PUBLIC_NX_CLOUD_USERNAME" || key === "NX_CLOUD_USERNAME") && !username) {
                  username = val;
                }
                if ((key === "NEXT_PUBLIC_NX_CLOUD_PASSWORD" || key === "NX_CLOUD_PASSWORD") && !password) {
                  password = val;
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    if (username && password) {
      try {
        console.log(`[CloudSessionStore] 🔐 Authenticating to Nx Cloud for ${username}...`);
        const loginData = await loginNxCloudWithPassword(username, password);
        session = {
          accessToken: loginData.access_token,
          refreshToken: loginData.refresh_token,
          email: username,
          updatedAt: Date.now(),
        };
        await saveServerCloudSession(session);
        console.log(`[CloudSessionStore] ✅ Successfully authenticated to Nx Cloud for ${username}`);
      } catch (err: any) {
        console.error("[CloudSessionStore] ❌ Direct username/password login failed:", err.message);
      }
    }
  }

  if (!session?.refreshToken) {
    return null;
  }

  // Tokens in Nx Cloud typically expire after 1 hour (3600s).
  // If token is older than 50 minutes or accessToken is missing, refresh it.
  const tokenAgeMs = Date.now() - (session.updatedAt || 0);
  const isExpired = !session.accessToken || tokenAgeMs > 50 * 60 * 1000;

  if (isExpired) {
    try {
      console.log("[CloudSessionStore] 🔄 Refreshing Nx Cloud access token for backend...");
      const refreshed = await refreshNxCloudToken(session.refreshToken);
      session.accessToken = refreshed.access_token;
      if (refreshed.refresh_token) {
        session.refreshToken = refreshed.refresh_token;
      }
      session.updatedAt = Date.now();
      await saveServerCloudSession(session);
      console.log("[CloudSessionStore] ✅ Nx Cloud access token refreshed successfully");
    } catch (err: any) {
      console.error("[CloudSessionStore] ❌ Failed to refresh cloud token:", err.message);
      // Return whatever session we have if refresh fails, or null
      if (!session.accessToken) return null;
    }
  }

  return session;
}
