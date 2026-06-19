import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { getRedisClient, isRedisAvailable } from "@/lib/redis/client";

// Ensure SSL/TLS rejection is disabled for self-signed certificates
if (typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function getCacheKey(host: string, port: string, username: string): string {
  const cleanHost = host.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `vms_token:${cleanHost}:${port}:${username}`;
}

export async function getVmsSessionToken(
  host: string,
  port: string,
  username: string,
  password?: string
): Promise<string | null> {
  if (!username) return null;

  const cacheKey = getCacheKey(host, port, username);
  
  try {
    const cachedToken = await cacheGetJson<string>(cacheKey);
    if (cachedToken) {
      // console.log(`[VMS Auth] Found cached session token for ${username} at ${host}:${port}`);
      return cachedToken;
    }
  } catch (err: any) {
    console.warn(`[VMS Auth] Failed to read from Redis cache:`, err.message);
  }

  if (!password) {
    console.warn(`[VMS Auth] No password provided for VMS token acquisition of ${username} at ${host}:${port}`);
    return null;
  }

  const targetUrl = `https://${host}:${port}/rest/v3/login/sessions`;
  console.log(`[VMS Auth] Requesting fresh session token for ${username} from ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VMS Auth] Token request failed for ${username} (${response.status}):`, errText);
      return null;
    }

    const data = await response.json();
    const token = data?.token;
    if (!token) {
      console.error(`[VMS Auth] No token returned in response for ${username}:`, data);
      return null;
    }

    // Cache the token for 2 hours (7200 seconds)
    try {
      await cacheSetJson(cacheKey, token, 7200);
      console.log(`[VMS Auth] Successfully acquired and cached session token for ${username}`);
    } catch (err: any) {
      console.warn(`[VMS Auth] Failed to cache token in Redis:`, err.message);
    }
    
    return token;
  } catch (error: any) {
    console.error(`[VMS Auth] Connection failed to VMS ${targetUrl}:`, error.message);
    return null;
  }
}

export async function invalidateVmsSessionToken(
  host: string,
  port: string,
  username: string
): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const redis = getRedisClient();
  if (!redis) return;

  const cacheKey = getCacheKey(host, port, username);
  try {
    await redis.del(cacheKey);
    console.log(`[VMS Auth] Invalidated cached session token for ${username}`);
  } catch (error: any) {
    console.warn(`[VMS Auth] Failed to delete token cache key:`, error.message);
  }
}
