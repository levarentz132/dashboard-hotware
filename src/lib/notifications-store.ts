/**
 * Persistent notifications — source of truth: data/notifications.json
 * Redis holds a read-through cache (invalidated when the file mtime changes).
 */

import path from "path";
import { readJsonWithCacheOrDefault, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";

export const NOTIFICATIONS_FILE = path.join(process.cwd(), "data", "notifications.json");

/** @deprecated Use NOTIFICATIONS_FILE */
export const LEGACY_NOTIFICATIONS_FILE = NOTIFICATIONS_FILE;

export interface StoredNotification {
  id: string;
  type: "success" | "info" | "warning" | "error";
  title: string;
  message: string;
  systemId?: string;
  deviceId?: string;
  startTimeMs?: number;
  endTimeMs?: number;
  durationMs?: number;
  timestamp: number;
  read: boolean;
}

export type NotificationsByUser = Record<string, StoredNotification[]>;

export function emptyNotifications(): NotificationsByUser {
  return {};
}

function isNotificationsByUser(data: unknown): data is NotificationsByUser {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/** Read all users' notifications (JSON file, with Redis cache). */
export async function readNotifications(): Promise<NotificationsByUser> {
  return readJsonWithCacheOrDefault({
    filePath: NOTIFICATIONS_FILE,
    redisKey: redisKeys.notifications(),
    validate: isNotificationsByUser,
    defaultValue: emptyNotifications,
  });
}

/** Write all users' notifications to JSON and refresh Redis cache. */
export async function writeNotifications(data: NotificationsByUser): Promise<void> {
  await writeJsonWithCache(NOTIFICATIONS_FILE, redisKeys.notifications(), data);
}
