import Redis from "ioredis";

let client: Redis | null = null;
let connectAttempted = false;
let lastConnectError: string | null = null;

function isRedisEnabled(): boolean {
  if (process.env.REDIS_ENABLED === "false") return false;
  if (typeof window !== "undefined") return false;
  return true;
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://127.0.0.1:6379";
}

/**
 * Lazy singleton Redis client (server-only).
 */
export function getRedisClient(): Redis | null {
  if (!isRedisEnabled()) return null;
  if (client) return client;

  connectAttempted = true;
  client = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 2000,
  });

  client.on("error", (err) => {
    lastConnectError = err.message;
  });

  return client;
}

export async function isRedisAvailable(): Promise<boolean> {
  if (!isRedisEnabled()) return false;
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export function getLastRedisError(): string | null {
  return lastConnectError;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
  }
  connectAttempted = false;
}
