/**
 * FFmpeg job queue — persisted in Redis forever (SET, no TTL).
 * Legacy `data/ffmpeg_queue.json` is migrated once on first read.
 */

import fs from "fs";
import path from "path";
import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";
import type { FFmpegJob } from "@/lib/ffmpeg-queue-types";

export const LEGACY_FFMPEG_QUEUE_FILE = path.join(process.cwd(), "data", "ffmpeg_queue.json");

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, "");
}

async function migrateFromLegacyFile(): Promise<FFmpegJob[] | null> {
  try {
    if (!fs.existsSync(LEGACY_FFMPEG_QUEUE_FILE)) return null;
    const raw = stripBom(fs.readFileSync(LEGACY_FFMPEG_QUEUE_FILE, "utf-8"));
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed) ? (parsed as FFmpegJob[]) : [];
    await cacheSetJson(redisKeys.ffmpegQueue(), jobs);
    return jobs;
  } catch (err) {
    console.warn("[ffmpeg-queue-store] Legacy file migration failed:", err);
    return null;
  }
}

/** Read the full queue from Redis (persistent). */
export async function readFfmpegQueue(): Promise<FFmpegJob[]> {
  const cached = await cacheGetJson<FFmpegJob[]>(redisKeys.ffmpegQueue());
  if (Array.isArray(cached)) {
    return cached;
  }

  const migrated = await migrateFromLegacyFile();
  if (migrated) return migrated;

  return [];
}

/** Write the full queue to Redis (overwrites prior value, no expiration). */
export async function writeFfmpegQueue(jobs: FFmpegJob[]): Promise<void> {
  await cacheSetJson(redisKeys.ffmpegQueue(), jobs);
}
