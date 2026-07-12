/**
 * Scheduled recordings — source of truth: data/scheduled_recordings.json
 * Redis holds a read-through cache (invalidated when the file mtime changes).
 */

import path from "path";
import { readJsonWithCacheOrDefault, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";

export const SCHEDULED_RECORDINGS_FILE = path.join(
  process.cwd(),
  "data",
  "scheduled_recordings.json",
);

/** @deprecated Use SCHEDULED_RECORDINGS_FILE */
export const LEGACY_SCHEDULED_FILE = SCHEDULED_RECORDINGS_FILE;

export interface Policy {
  id: string;
  name: string;
  type: "video" | "screenshot";
  recurrence: "none" | "weekday" | "monthday";
  recurrenceDay?: number;
  startTime: string;
  endTime: string;
  date?: string; // ISO date string for "none" recurrence
  cameras: {
    id: string;
    name: string;
    systemId: string;
    systemName: string;
  }[];
  inactive?: boolean;
}

export interface ScheduledRecordingsData {
  policies?: Policy[];
  schedules: any[];
  originalSchedules: Record<string, unknown>;
  nxLocationIp?: string;
  nxLocationPort?: string;
  appPort?: string;
  [key: string]: unknown;
}

export function emptyScheduledRecordings(): ScheduledRecordingsData {
  return {
    policies: [],
    schedules: [],
    originalSchedules: {},
  };
}

function isScheduledRecordingsData(data: unknown): data is ScheduledRecordingsData {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as ScheduledRecordingsData).schedules)
  );
}

function normalizeScheduledRecordings(data: ScheduledRecordingsData): ScheduledRecordingsData {
  return {
    ...emptyScheduledRecordings(),
    ...data,
    policies: data.policies || [],
    schedules: data.schedules || [],
    originalSchedules: data.originalSchedules || {},
  };
}

/** Read full schedule document (JSON file, with Redis cache). */
export async function readScheduledRecordings(): Promise<ScheduledRecordingsData> {
  const data = await readJsonWithCacheOrDefault({
    filePath: SCHEDULED_RECORDINGS_FILE,
    redisKey: redisKeys.scheduledRecordings(),
    validate: isScheduledRecordingsData,
    defaultValue: emptyScheduledRecordings,
  });
  return normalizeScheduledRecordings(data);
}

/** Write full schedule document to JSON and refresh Redis cache. */
export async function writeScheduledRecordings(data: ScheduledRecordingsData): Promise<void> {
  await writeJsonWithCache(
    SCHEDULED_RECORDINGS_FILE,
    redisKeys.scheduledRecordings(),
    normalizeScheduledRecordings(data),
  );
}
