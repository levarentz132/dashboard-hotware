/**
 * Redis-only server store (no TTL, no DEL cleanup, no in-memory fallback).
 *
 * Entries persist until overwritten by the same key or Redis is flushed.
 * AOF in redis.conf provides disk persistence — treat as a database, not a TTL cache.
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

/** Persist JSON at key until overwritten (no expiration). */
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
