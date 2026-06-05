/**
 * User-visible scheduled recording error logs — source of truth: data/scheduled_error_logs.json
 */

import path from "path";
import { randomUUID } from "crypto";
import { formatAuditDate } from "@/lib/recording-logger";
import { readJsonWithCacheOrDefault, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";

export const SCHEDULED_ERROR_LOGS_FILE = path.join(
  process.cwd(),
  "data",
  "scheduled_error_logs.json",
);

export interface ScheduledErrorLogEntry {
  id: string;
  cameraId: string;
  cameraName: string;
  systemId: string;
  timestamp: string;
  message: string;
  createdAtMs: number;
}

export interface ScheduledErrorLogsData {
  entries: ScheduledErrorLogEntry[];
}

function emptyStore(): ScheduledErrorLogsData {
  return { entries: [] };
}

function isStoreData(data: unknown): data is ScheduledErrorLogsData {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as ScheduledErrorLogsData).entries)
  );
}

function normalizeCameraId(cameraId: string): string {
  return cameraId.replace(/[{}]/g, "").toLowerCase();
}

export async function readScheduledErrorLogs(): Promise<ScheduledErrorLogsData> {
  const data = await readJsonWithCacheOrDefault({
    filePath: SCHEDULED_ERROR_LOGS_FILE,
    redisKey: redisKeys.scheduledErrorLogs(),
    validate: isStoreData,
    defaultValue: emptyStore,
  });
  return { entries: data.entries || [] };
}

export async function writeScheduledErrorLogs(data: ScheduledErrorLogsData): Promise<void> {
  await writeJsonWithCache(
    SCHEDULED_ERROR_LOGS_FILE,
    redisKeys.scheduledErrorLogs(),
    { entries: data.entries || [] },
  );
}

export function entryKey(entry: Pick<ScheduledErrorLogEntry, "cameraId" | "timestamp" | "message">): string {
  return `${normalizeCameraId(entry.cameraId)}|${entry.timestamp}|${entry.message}`;
}

/** Append a user-visible error log (deduped by camera + timestamp + message). */
export async function appendScheduledErrorLog(input: {
  cameraId: string;
  cameraName: string;
  systemId?: string;
  message: string;
  timestamp?: string;
}): Promise<ScheduledErrorLogEntry | null> {
  const message = input.message?.trim();
  if (!message || !input.cameraId) return null;

  const data = await readScheduledErrorLogs();
  const timestamp = input.timestamp || formatAuditDate(new Date());
  const cameraId = input.cameraId.replace(/[{}]/g, "");
  const key = entryKey({ cameraId, timestamp, message });

  if (data.entries.some((e) => entryKey(e) === key)) {
    return data.entries.find((e) => entryKey(e) === key) ?? null;
  }

  const entry: ScheduledErrorLogEntry = {
    id: randomUUID(),
    cameraId,
    cameraName: input.cameraName || "Camera",
    systemId: input.systemId || "",
    timestamp,
    message,
    createdAtMs: Date.now(),
  };

  data.entries.unshift(entry);
  if (data.entries.length > 500) {
    data.entries = data.entries.slice(0, 500);
  }

  await writeScheduledErrorLogs(data);
  return entry;
}

export async function getScheduledErrorLogsForCamera(
  cameraId: string,
): Promise<ScheduledErrorLogEntry[]> {
  const nid = normalizeCameraId(cameraId);
  const data = await readScheduledErrorLogs();
  return data.entries
    .filter((e) => normalizeCameraId(e.cameraId) === nid)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function dismissScheduledErrorLog(entryId: string): Promise<boolean> {
  const data = await readScheduledErrorLogs();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== entryId);
  if (data.entries.length === before) return false;
  await writeScheduledErrorLogs(data);
  return true;
}

export async function dismissAllScheduledErrorLogsForCamera(cameraId: string): Promise<number> {
  const nid = normalizeCameraId(cameraId);
  const data = await readScheduledErrorLogs();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => normalizeCameraId(e.cameraId) !== nid);
  const removed = before - data.entries.length;
  if (removed > 0) await writeScheduledErrorLogs(data);
  return removed;
}

export async function getAllScheduledErrorLogs(): Promise<ScheduledErrorLogEntry[]> {
  const data = await readScheduledErrorLogs();
  return [...data.entries].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function getCamerasWithScheduledErrorLogs(): Promise<
  Array<{ cameraId: string; cameraName: string; systemId: string; count: number }>
> {
  const data = await readScheduledErrorLogs();
  const map = new Map<
    string,
    { cameraId: string; cameraName: string; systemId: string; count: number }
  >();
  for (const e of data.entries) {
    const nid = normalizeCameraId(e.cameraId);
    const existing = map.get(nid);
    if (existing) {
      existing.count += 1;
      if (!existing.cameraName && e.cameraName) existing.cameraName = e.cameraName;
    } else {
      map.set(nid, {
        cameraId: e.cameraId,
        cameraName: e.cameraName,
        systemId: e.systemId,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}
