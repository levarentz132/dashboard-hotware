/**
 * JSON file store with optional Redis read-through cache.
 *
 * Source of truth: `data/*.json` on disk.
 * Redis: speed layer only — invalidated when the file mtime changes.
 */

import fs from "fs";
import path from "path";
import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";

export interface JsonStoreCacheOptions<T> {
  filePath: string;
  redisKey: string;
  validate: (data: unknown) => data is T;
}

interface CachedJsonEnvelope<T> {
  data: T;
  mtimeMs: number;
}

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, "");
}

function getFileMtimeMs(filePath: string): number | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function readJsonFile(filePath: string): unknown | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const raw = stripBom(fs.readFileSync(filePath, "utf-8"));
    if (!raw.trim()) return undefined;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[json-store] Failed to read ${filePath}:`, err);
    return undefined;
  }
}

function writeJsonFile(filePath: string, data: unknown): number {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
  return fs.statSync(filePath).mtimeMs;
}

function isEnvelope<T>(value: unknown): value is CachedJsonEnvelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "mtimeMs" in value &&
    typeof (value as CachedJsonEnvelope<T>).mtimeMs === "number"
  );
}

async function warmRedisCache<T>(
  redisKey: string,
  data: T,
  mtimeMs: number,
): Promise<void> {
  await cacheSetJson(redisKey, { data, mtimeMs } satisfies CachedJsonEnvelope<T>);
}

/**
 * Read a JSON document. File is authoritative; Redis is a mtime-scoped cache.
 * If only Redis has data (legacy), it is persisted to disk once.
 */
export async function readJsonWithCache<T>(
  options: JsonStoreCacheOptions<T>,
): Promise<T | null> {
  const { filePath, redisKey, validate } = options;
  const fileMtimeMs = getFileMtimeMs(filePath);

  if (fileMtimeMs !== null) {
    const cached = await cacheGetJson<CachedJsonEnvelope<T> | T>(redisKey);
    if (isEnvelope<T>(cached) && cached.mtimeMs === fileMtimeMs && validate(cached.data)) {
      return cached.data;
    }

    const fromFile = readJsonFile(filePath);
    if (fromFile !== undefined && validate(fromFile)) {
      await warmRedisCache(redisKey, fromFile, fileMtimeMs);
      return fromFile;
    }

    if (fromFile !== undefined) {
      console.warn(`[json-store] Invalid JSON document at ${filePath}`);
    }
    return null;
  }

  const cached = await cacheGetJson<CachedJsonEnvelope<T> | T>(redisKey);
  if (isEnvelope<T>(cached) && validate(cached.data)) {
    writeJsonFile(filePath, cached.data);
    await warmRedisCache(redisKey, cached.data, getFileMtimeMs(filePath) ?? Date.now());
    return cached.data;
  }
  if (cached !== null && validate(cached)) {
    writeJsonFile(filePath, cached);
    const mtimeMs = getFileMtimeMs(filePath) ?? Date.now();
    await warmRedisCache(redisKey, cached, mtimeMs);
    return cached;
  }

  return null;
}

export async function readJsonWithCacheOrDefault<T>(
  options: JsonStoreCacheOptions<T> & { defaultValue: () => T },
): Promise<T> {
  const value = await readJsonWithCache(options);
  return value ?? options.defaultValue();
}

/** Persist to JSON first, then refresh the Redis cache entry. */
export async function writeJsonWithCache<T>(
  filePath: string,
  redisKey: string,
  data: T,
): Promise<void> {
  const mtimeMs = writeJsonFile(filePath, data);
  await warmRedisCache(redisKey, data, mtimeMs);
}
