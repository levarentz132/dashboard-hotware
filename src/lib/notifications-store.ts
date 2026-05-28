/**
 * Persistent notifications — stored in Redis forever (SET, no TTL).
 * Legacy `data/notifications.json` is migrated once on first read.
 */

import fs from "fs";
import path from "path";
import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";

export const LEGACY_NOTIFICATIONS_FILE = path.join(process.cwd(), "data", "notifications.json");

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

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, "");
}

async function migrateFromLegacyFile(): Promise<NotificationsByUser | null> {
  try {
    if (!fs.existsSync(LEGACY_NOTIFICATIONS_FILE)) return null;
    const raw = stripBom(fs.readFileSync(LEGACY_NOTIFICATIONS_FILE, "utf-8"));
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as NotificationsByUser;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    await cacheSetJson(redisKeys.notifications(), parsed);
    return parsed;
  } catch (err) {
    console.warn("[notifications-store] Legacy file migration failed:", err);
    return null;
  }
}

/** Read all users' notifications from Redis (persistent). */
export async function readNotifications(): Promise<NotificationsByUser> {
  const cached = await cacheGetJson<NotificationsByUser>(redisKeys.notifications());
  if (cached && typeof cached === "object" && !Array.isArray(cached)) {
    return cached;
  }

  const migrated = await migrateFromLegacyFile();
  if (migrated) return migrated;

  return emptyNotifications();
}

/** Write all users' notifications to Redis (overwrites prior value, no expiration). */
export async function writeNotifications(data: NotificationsByUser): Promise<void> {
  await cacheSetJson(redisKeys.notifications(), data);
}
