/**
 * Persistent Cloud Session Storage
 * Source of truth: data/nx_cloud_session.json
 * Allows the server backend to run 24/7 without needing any active browser tabs.
 */

import path from "path";
import { readJsonWithCache, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";
import { refreshNxCloudToken, loginNxCloudWithPassword } from "@/lib/nx-cloud-service";

export const CLOUD_SESSION_FILE = path.join(
  process.cwd(),
  "data",
  "nx_cloud_session.json",
);

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
  const current = (await readServerCloudSession()) || {};
  const updated: ServerCloudSession = {
    accessToken: session.accessToken || current.accessToken || "",
    refreshToken: session.refreshToken || current.refreshToken || "",
    email: session.email || current.email,
    ownerSystemId: session.ownerSystemId || current.ownerSystemId,
    updatedAt: Date.now(),
  };

  await writeJsonWithCache(CLOUD_SESSION_FILE, REDIS_CLOUD_SESSION_KEY, updated);
  console.log(`[CloudSessionStore] 💾 Cloud session saved for ${updated.email || "account"}`);
}

/**
 * Read the raw session from disk/cache without refreshing
 */
export async function readServerCloudSession(): Promise<ServerCloudSession | null> {
  return readJsonWithCache<ServerCloudSession>({
    filePath: CLOUD_SESSION_FILE,
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
    const username =
      process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME ||
      process.env.NX_CLOUD_USERNAME;
    const password =
      process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD ||
      process.env.NX_CLOUD_PASSWORD;

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
