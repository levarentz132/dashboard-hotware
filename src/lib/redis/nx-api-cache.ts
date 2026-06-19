/**
 * Redis-backed cache + single-flight deduplication for /api/nx (cloud-api) GETs.
 */

import { createHash } from "crypto";
import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";
import {
  isCloudSystemsEndpoint,
  isDeviceMutationEndpoint,
  isDevicesListEndpoint,
  isDevicesStatusEndpoint,
} from "@/lib/redis/nx-cache-policy";
import { syncCloudSystemsFromApiResponse } from "@/lib/cloud-systems-store";
import {
  markDevicesCachesStale,
  syncDevicesFromListResponse,
  syncDevicesStatusResponse,
} from "@/lib/nx-devices-store";

export interface CloudApiCacheEntry {
  data: unknown;
  status: number;
  cachedAt: number;
  etag?: string;
  lastModified?: string;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function getAuthFingerprint(
  headers: Record<string, string>,
  basicAuthHeader?: string | null,
): string {
  const auth = headers["Authorization"] || headers["authorization"] || basicAuthHeader || "";
  const guid = headers["x-runtime-guid"] || "";
  return `${auth}:${guid}`;
}

export function cloudApiGetCacheKey(
  systemId: string,
  endpoint: string,
  queryParams: URLSearchParams | undefined,
  authFingerprint: string,
): string {
  const qs = queryParams?.toString() || "";
  const raw = `GET:${systemId}:${endpoint}:${qs}:${authFingerprint}`;
  return redisKeys.nxApi(hashKey(raw));
}

const inFlight = new Map<string, Promise<unknown>>();

/** Coalesce concurrent identical NX API requests into one upstream fetch. */
export async function singleFlightNxRequest<T>(
  flightKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(flightKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlight.delete(flightKey);
  });

  inFlight.set(flightKey, promise);
  return promise;
}

export async function readCloudApiCache(
  cacheKey: string,
): Promise<CloudApiCacheEntry | null> {
  const entry = await cacheGetJson<CloudApiCacheEntry>(cacheKey);
  if (!entry || entry.data === null || entry.data === undefined) {
    return null;
  }
  if (
    typeof entry.data === "object" &&
    entry.data !== null &&
    "__stale" in (entry.data as object)
  ) {
    return null;
  }
  return entry;
}

export async function writeCloudApiCache(
  cacheKey: string,
  data: unknown,
  status = 200,
  meta?: { etag?: string; lastModified?: string; ttlSeconds?: number },
): Promise<void> {
  await cacheSetJson(
    cacheKey,
    {
      data,
      status,
      cachedAt: Date.now(),
      etag: meta?.etag,
      lastModified: meta?.lastModified,
    } satisfies CloudApiCacheEntry,
    meta?.ttlSeconds,
  );
}

/** After GET: persist response and refresh shared device documents when applicable. */
export async function afterCloudApiGetCached(
  systemId: string,
  endpoint: string,
  cacheKey: string,
  data: unknown,
  status: number,
  meta?: { etag?: string; lastModified?: string; authFingerprint?: string },
): Promise<void> {
  let ttlSeconds: number | undefined;

  if (endpoint.includes("/devices/status")) {
    ttlSeconds = 5; // 5 seconds cache for status updates
  } else if (endpoint.includes("/devices")) {
    ttlSeconds = 10; // 10 seconds cache for full devices inventory list
  } else if (endpoint.includes("/api/getEvents") || endpoint.includes("/system/metrics/alarms")) {
    ttlSeconds = 10; // 10 seconds cache for events and alarms
  } else {
    ttlSeconds = 60; // 60 seconds cache for other endpoints
  }

  await writeCloudApiCache(cacheKey, data, status, { ...meta, ttlSeconds });

  if (meta?.authFingerprint && isCloudSystemsEndpoint(endpoint)) {
    await syncCloudSystemsFromApiResponse(meta.authFingerprint, data);
  }

  if (systemId && isDevicesListEndpoint(endpoint)) {
    await syncDevicesFromListResponse(systemId, data);
  } else if (systemId && isDevicesStatusEndpoint(endpoint)) {
    await syncDevicesStatusResponse(systemId, data);
  }
}

/** After mutation: mark device aggregates stale; overwrite GET cache when body returned. */
export async function afterCloudApiMutation(
  systemId: string,
  endpoint: string,
  method: string,
  cacheKey: string,
  responseData?: unknown,
): Promise<void> {
  if (systemId && isDeviceMutationEndpoint(endpoint, method)) {
    await markDevicesCachesStale(systemId);
  }

  if (responseData !== undefined) {
    await writeCloudApiCache(cacheKey, responseData, 200);
    if (systemId && isDevicesListEndpoint(endpoint)) {
      await syncDevicesFromListResponse(systemId, responseData);
    }
  }
}
