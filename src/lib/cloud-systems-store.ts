/**
 * Cloud systems list — Redis cache keyed by auth fingerprint (SET, no TTL).
 */

import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";
import type { CloudSystem } from "@/types/cloud-system";

const STALE_MARKER = { __stale: true as const };

function isStaleDoc(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "__stale" in (value as object)
  );
}

export function normalizeCloudSystemsPayload(data: unknown): CloudSystem[] {
  if (Array.isArray(data)) return data as CloudSystem[];
  if (data && typeof data === "object" && "systems" in data) {
    const systems = (data as { systems?: unknown }).systems;
    return Array.isArray(systems) ? (systems as CloudSystem[]) : [];
  }
  return [];
}

export async function readCloudSystemsList(
  authFingerprint: string,
): Promise<CloudSystem[] | null> {
  const doc = await cacheGetJson<CloudSystem[] | typeof STALE_MARKER>(
    redisKeys.cloudSystems(authFingerprint),
  );
  if (!doc || isStaleDoc(doc) || !Array.isArray(doc)) return null;
  return doc;
}

export async function writeCloudSystemsList(
  authFingerprint: string,
  systems: CloudSystem[],
): Promise<void> {
  await cacheSetJson(redisKeys.cloudSystems(authFingerprint), systems);
}

export async function syncCloudSystemsFromApiResponse(
  authFingerprint: string,
  data: unknown,
): Promise<CloudSystem[]> {
  const systems = normalizeCloudSystemsPayload(data);
  if (systems.length > 0) {
    await writeCloudSystemsList(authFingerprint, systems);
  }
  return systems;
}

export async function markCloudSystemsStale(authFingerprint: string): Promise<void> {
  await cacheSetJson(redisKeys.cloudSystems(authFingerprint), STALE_MARKER);
}
