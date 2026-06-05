/**
 * Redis JSON cache helpers (read-through / write-through for `data/*.json` stores).
 *
 * Persistent app data lives on disk under `data/`. Redis accelerates reads and
 * can be flushed without losing state. NX proxy / device list entries are
 * plain cache overlays on upstream API responses.
 */

import { createHash } from "crypto";
import { getRedisClient, isRedisAvailable } from "@/lib/redis/client";
import { redisKeys } from "@/lib/redis/keys";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  if (!(await isRedisAvailable())) {
    return null;
  }

  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn("[redis-store] GET failed:", err);
    return null;
  }
}

/** Write JSON to Redis cache (no TTL). App data keys are refreshed via json-store-cache after disk writes. */
export async function cacheSetJson(key: string, value: unknown): Promise<void> {
  if (!(await isRedisAvailable())) {
    console.warn("[redis-store] SET skipped — Redis unavailable");
    return;
  }

  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(key, JSON.stringify(value));
  } catch (err) {
    console.warn("[redis-store] SET failed:", err);
  }
}

export function nxProxyCacheKey(rawKey: string): string {
  return redisKeys.nxProxy(hashKey(rawKey));
}

export function recordingsCacheKey(rawKey: string): string {
  return redisKeys.recordings(rawKey.replace(/[^a-zA-Z0-9:_-]/g, "_"));
}

/** Cache key used for NX proxy GET responses (also used when overwriting after mutations). */
export function nxProxyGetCacheKey(
  targetUrl: string,
  authorization: string,
  runtimeGuid: string,
): string {
  return nxProxyCacheKey(`GET:${targetUrl}:${authorization}:${runtimeGuid}`);
}

/**
 * After a successful mutation, overwrite the GET cache entry for the same URL
 * so clients see fresh data without DEL/SCAN cleanup.
 */
export async function overwriteNxProxyGetCache(
  targetUrl: string,
  authorization: string,
  runtimeGuid: string,
  entry: { data: string; headers: Record<string, string>; status: number },
): Promise<void> {
  await cacheSetJson(nxProxyGetCacheKey(targetUrl, authorization, runtimeGuid), entry);
}
