/**
 * User-visible scheduled recording error logs — source of truth: data/scheduled_error_logs.json
 */

import path from "path";
import { randomUUID } from "crypto";
import { formatAuditDate } from "@/lib/recording-logger";
import { parseRecordingLogTimestamp } from "@/lib/recording-log-utils";
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
  /** Keys user dismissed — prevents audit re-sync from re-adding them. */
  dismissedKeys?: string[];
}

function emptyStore(): ScheduledErrorLogsData {
  return { entries: [], dismissedKeys: [] };
}

function dedupeEntries(entries: ScheduledErrorLogEntry[]): ScheduledErrorLogEntry[] {
  const seen = new Map<string, ScheduledErrorLogEntry>();
  for (const entry of entries) {
    const key = entryKey(entry);
    const existing = seen.get(key);
    if (!existing || getErrorLogSortMs(entry) > getErrorLogSortMs(existing)) {
      seen.set(key, entry);
    }
  }
  return sortEntriesNewestFirst(Array.from(seen.values()));
}

function normalizeDismissedKey(key: string): string {
  const parts = key.split("|");
  if (parts.length >= 3) {
    return `${parts[0]}|${parts.slice(2).join("|")}`;
  }
  return key;
}

function normalizeStore(data: ScheduledErrorLogsData): ScheduledErrorLogsData {
  const dismissedKeys = Array.from(
    new Set((data.dismissedKeys || []).map(normalizeDismissedKey)),
  );
  return {
    entries: dedupeEntries(data.entries || []),
    dismissedKeys,
  };
}

export function getErrorLogSortMs(entry: Pick<ScheduledErrorLogEntry, "timestamp" | "createdAtMs">): number {
  const fromTimestamp = parseRecordingLogTimestamp(entry.timestamp);
  if (fromTimestamp > 0) return fromTimestamp;
  return entry.createdAtMs || 0;
}

function sortEntriesNewestFirst(entries: ScheduledErrorLogEntry[]): ScheduledErrorLogEntry[] {
  return [...entries].sort((a, b) => getErrorLogSortMs(b) - getErrorLogSortMs(a));
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
  return normalizeStore(data);
}

export async function writeScheduledErrorLogs(data: ScheduledErrorLogsData): Promise<void> {
  await writeJsonWithCache(
    SCHEDULED_ERROR_LOGS_FILE,
    redisKeys.scheduledErrorLogs(),
    normalizeStore(data),
  );
}

export function entryKey(entry: Pick<ScheduledErrorLogEntry, "cameraId" | "message">): string {
  return `${normalizeCameraId(entry.cameraId)}|${entry.message}`;
}

/** Append a user-visible error log (deduped by camera + message). */
export async function appendScheduledErrorLog(input: {
  cameraId: string;
  cameraName: string;
  systemId?: string;
  message: string;
  timestamp?: string;
}): Promise<ScheduledErrorLogEntry | null> {
  const message = input.message?.trim();
  if (!message || !input.cameraId) return null;

  const data = normalizeStore(await readScheduledErrorLogs());
  const cameraId = input.cameraId.replace(/[{}]/g, "");
  const key = entryKey({ cameraId, message });

  if (data.dismissedKeys!.includes(key)) {
    return null;
  }

  if (data.entries.some((e) => entryKey(e) === key)) {
    return data.entries.find((e) => entryKey(e) === key) ?? null;
  }

  const timestamp = input.timestamp || formatAuditDate(new Date());
  const createdAtMs = parseRecordingLogTimestamp(timestamp) || Date.now();

  const entry: ScheduledErrorLogEntry = {
    id: randomUUID(),
    cameraId,
    cameraName: input.cameraName || "Camera",
    systemId: input.systemId || "",
    timestamp,
    message,
    createdAtMs,
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
  const data = normalizeStore(await readScheduledErrorLogs());
  return sortEntriesNewestFirst(
    data.entries.filter((e) => normalizeCameraId(e.cameraId) === nid),
  );
}

export async function dismissScheduledErrorLog(entryId: string): Promise<boolean> {
  const data = normalizeStore(await readScheduledErrorLogs());
  const target = data.entries.find((e) => e.id === entryId);
  if (!target) return false;

  const key = entryKey(target);
  if (!data.dismissedKeys!.includes(key)) {
    data.dismissedKeys!.push(key);
  }
  data.entries = data.entries.filter((e) => e.id !== entryId);
  await writeScheduledErrorLogs(data);
  return true;
}

export async function dismissAllScheduledErrorLogsForCamera(cameraId: string): Promise<number> {
  const nid = normalizeCameraId(cameraId);
  const data = normalizeStore(await readScheduledErrorLogs());
  const before = data.entries.length;
  const dismissed = new Set(data.dismissedKeys);

  for (const entry of data.entries) {
    if (normalizeCameraId(entry.cameraId) !== nid) continue;
    dismissed.add(entryKey(entry));
  }

  data.dismissedKeys = Array.from(dismissed);
  data.entries = data.entries.filter((e) => normalizeCameraId(e.cameraId) !== nid);
  const removed = before - data.entries.length;
  if (removed > 0) {
    await writeScheduledErrorLogs(data);
  }
  return removed;
}

export async function dismissAllScheduledErrorLogs(): Promise<number> {
  const data = normalizeStore(await readScheduledErrorLogs());
  const before = data.entries.length;
  const dismissed = new Set(data.dismissedKeys);

  for (const entry of data.entries) {
    dismissed.add(entryKey(entry));
  }

  data.dismissedKeys = Array.from(dismissed);
  data.entries = [];
  if (before > 0) {
    await writeScheduledErrorLogs(data);
  }
  return before;
}

export async function getAllScheduledErrorLogs(): Promise<ScheduledErrorLogEntry[]> {
  const data = normalizeStore(await readScheduledErrorLogs());
  return sortEntriesNewestFirst(data.entries);
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
