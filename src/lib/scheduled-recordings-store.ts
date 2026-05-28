/**
 * Scheduled recordings — persisted in Redis forever (SET, no TTL).
 * Legacy `data/scheduled_recordings.json` is migrated once on first read.
 */

import fs from "fs";
import path from "path";
import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";

export const LEGACY_SCHEDULED_FILE = path.join(process.cwd(), "data", "scheduled_recordings.json");

export interface ScheduledRecordingsData {
  schedules: any[];
  originalSchedules: Record<string, unknown>;
  nxLocationIp?: string;
  nxLocationPort?: string;
  appPort?: string;
  [key: string]: unknown;
}

export function emptyScheduledRecordings(): ScheduledRecordingsData {
  return {
    schedules: [],
    originalSchedules: {},
  };
}

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, "");
}

async function migrateFromLegacyFile(): Promise<ScheduledRecordingsData | null> {
  try {
    if (!fs.existsSync(LEGACY_SCHEDULED_FILE)) return null;
    const raw = stripBom(fs.readFileSync(LEGACY_SCHEDULED_FILE, "utf-8"));
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as ScheduledRecordingsData;
    await cacheSetJson(redisKeys.scheduledRecordings(), parsed);
    return parsed;
  } catch (err) {
    console.warn("[scheduled-store] Legacy file migration failed:", err);
    return null;
  }
}

/** Read full schedule document from Redis (persistent). */
export async function readScheduledRecordings(): Promise<ScheduledRecordingsData> {
  const cached = await cacheGetJson<ScheduledRecordingsData>(redisKeys.scheduledRecordings());
  if (cached && Array.isArray(cached.schedules)) {
    return {
      ...emptyScheduledRecordings(),
      ...cached,
      schedules: cached.schedules || [],
      originalSchedules: cached.originalSchedules || {},
    };
  }

  const migrated = await migrateFromLegacyFile();
  if (migrated) return migrated;

  return emptyScheduledRecordings();
}

/** Write full schedule document to Redis (overwrites prior value, no expiration). */
export async function writeScheduledRecordings(data: ScheduledRecordingsData): Promise<void> {
  await cacheSetJson(redisKeys.scheduledRecordings(), {
    ...data,
    schedules: data.schedules || [],
    originalSchedules: data.originalSchedules || {},
  });
}
