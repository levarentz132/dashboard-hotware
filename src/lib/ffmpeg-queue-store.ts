/**
 * FFmpeg job queue — source of truth: data/ffmpeg_queue.json
 * Redis holds a read-through cache (invalidated when the file mtime changes).
 */

import path from "path";
import { readJsonWithCacheOrDefault, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";
import type { FFmpegJob } from "@/lib/ffmpeg-queue-types";

export const FFMPEG_QUEUE_FILE = path.join(process.cwd(), "data", "ffmpeg_queue.json");

/** @deprecated Use FFMPEG_QUEUE_FILE */
export const LEGACY_FFMPEG_QUEUE_FILE = FFMPEG_QUEUE_FILE;

function isFfmpegJobArray(data: unknown): data is FFmpegJob[] {
  return Array.isArray(data);
}

/** Read the full queue (JSON file, with Redis cache). */
export async function readFfmpegQueue(): Promise<FFmpegJob[]> {
  return readJsonWithCacheOrDefault({
    filePath: FFMPEG_QUEUE_FILE,
    redisKey: redisKeys.ffmpegQueue(),
    validate: isFfmpegJobArray,
    defaultValue: () => [],
  });
}

/** Write the full queue to JSON and refresh Redis cache. */
export async function writeFfmpegQueue(jobs: FFmpegJob[]): Promise<void> {
  await writeJsonWithCache(FFMPEG_QUEUE_FILE, redisKeys.ffmpegQueue(), jobs);
}
