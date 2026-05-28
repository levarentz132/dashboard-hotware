/**
 * Shared per-system device documents in Redis (full, summary, status, index).
 * Populated from successful GET /devices responses; marked stale on device mutations.
 */

import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";
import {
  buildDevicesSummary,
  type DeviceSummaryItem,
} from "@/lib/nx-devices-utils";

export type { DeviceSummaryItem } from "@/lib/nx-devices-utils";
export {
  buildDevicesSummary,
  mergeStatusWithSummary,
  normalizeDeviceStatusMap,
} from "@/lib/nx-devices-utils";

const STALE_MARKER = { __stale: true as const };

export interface DevicesIndexDocument {
  byCleanId: Record<string, string>;
  byIdLower: Record<string, string>;
  hashToId: Record<string, string>;
  updatedAt: number;
}

function sanitizeSystemId(systemId: string): string {
  return systemId.replace(/[{}]/g, "").toLowerCase().replace(/[^a-z0-9:_-]/g, "_");
}

function isStaleDoc(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "__stale" in (value as object)
  );
}

function normalizeDevicesList(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "reply" in data) {
    const reply = (data as { reply?: unknown }).reply;
    return Array.isArray(reply) ? reply : [];
  }
  return [];
}

export function buildDevicesIndex(devicesList: any[]): DevicesIndexDocument {
  const byCleanId: Record<string, string> = {};
  const byIdLower: Record<string, string> = {};
  const hashToId: Record<string, string> = {};

  for (const d of devicesList) {
    if (!d?.id) continue;
    const cleanId = String(d.id).replace(/[{}]/g, "").toLowerCase();
    const name = String(d.name || "")
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim();
    byCleanId[cleanId] = name;
    byIdLower[String(d.id).toLowerCase()] = name;
    hashToId[cleanId.slice(-4)] = d.id;
  }

  return {
    byCleanId,
    byIdLower,
    hashToId,
    updatedAt: Date.now(),
  };
}

export async function readDevicesFull(systemId: string): Promise<any[] | null> {
  const sid = sanitizeSystemId(systemId);
  const doc = await cacheGetJson<any[]>(redisKeys.devices(sid));
  if (!doc || isStaleDoc(doc) || !Array.isArray(doc)) return null;
  return doc;
}

export async function readDevicesSummary(
  systemId: string,
): Promise<DeviceSummaryItem[] | null> {
  const sid = sanitizeSystemId(systemId);
  const doc = await cacheGetJson<DeviceSummaryItem[]>(redisKeys.devicesSummary(sid));
  if (!doc || isStaleDoc(doc) || !Array.isArray(doc)) return null;
  return doc;
}

export async function readDevicesStatus(systemId: string): Promise<unknown | null> {
  const sid = sanitizeSystemId(systemId);
  const doc = await cacheGetJson(redisKeys.devicesStatus(sid));
  if (!doc || isStaleDoc(doc)) return null;
  return doc;
}

export async function getDeviceFromCache(
  systemId: string,
  deviceId: string,
): Promise<any | null> {
  const full = await readDevicesFull(systemId);
  if (!full) return null;
  const clean = deviceId.replace(/[{}]/g, "").toLowerCase();
  return (
    full.find(
      (d) => d?.id && String(d.id).replace(/[{}]/g, "").toLowerCase() === clean,
    ) ?? null
  );
}

export async function syncDevicesFromListResponse(
  systemId: string,
  data: unknown,
): Promise<void> {
  if (!systemId) return;

  const sid = sanitizeSystemId(systemId);
  const devicesList = normalizeDevicesList(data);
  const index = buildDevicesIndex(devicesList);
  const summary = buildDevicesSummary(devicesList);

  await Promise.all([
    cacheSetJson(redisKeys.devices(sid), devicesList),
    cacheSetJson(redisKeys.devicesSummary(sid), summary),
    cacheSetJson(redisKeys.devicesIndex(sid), index),
  ]);
}

export async function syncDevicesStatusResponse(
  systemId: string,
  data: unknown,
): Promise<void> {
  if (!systemId) return;
  const sid = sanitizeSystemId(systemId);
  await cacheSetJson(redisKeys.devicesStatus(sid), data);
}

export async function markDevicesCachesStale(systemId: string): Promise<void> {
  if (!systemId) return;
  const sid = sanitizeSystemId(systemId);
  await Promise.all([
    cacheSetJson(redisKeys.devices(sid), STALE_MARKER),
    cacheSetJson(redisKeys.devicesSummary(sid), STALE_MARKER),
    cacheSetJson(redisKeys.devicesStatus(sid), STALE_MARKER),
    cacheSetJson(redisKeys.devicesIndex(sid), STALE_MARKER),
  ]);
}

export async function readDevicesIndex(
  systemId: string,
): Promise<DevicesIndexDocument | null> {
  const sid = sanitizeSystemId(systemId);
  const doc = await cacheGetJson<DevicesIndexDocument>(redisKeys.devicesIndex(sid));
  if (!doc || isStaleDoc(doc)) return null;
  return doc;
}

export async function loadDeviceMapsForSystem(systemId: string): Promise<{
  nameMap: Map<string, string>;
  hashMap: Map<string, string>;
} | null> {
  const index = await readDevicesIndex(systemId);
  if (!index) return null;

  const nameMap = new Map<string, string>();
  for (const [k, v] of Object.entries(index.byCleanId)) {
    nameMap.set(k, v);
  }
  for (const [k, v] of Object.entries(index.byIdLower)) {
    nameMap.set(k, v);
  }

  const hashMap = new Map<string, string>();
  for (const [k, v] of Object.entries(index.hashToId)) {
    hashMap.set(k, v);
  }

  return { nameMap, hashMap };
}
