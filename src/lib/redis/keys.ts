/** Redis key namespaces for Hotware Dashboard */

export const REDIS_PREFIX = process.env.REDIS_KEY_PREFIX || "hotware";

function safeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_");
}

export const redisKeys = {
  nxProxy: (hash: string) => `${REDIS_PREFIX}:nx:${hash}`,
  /** Hashed GET cache for /api/nx cloud-api relay */
  nxApi: (hash: string) => `${REDIS_PREFIX}:nx:api:${hash}`,
  recordings: (key: string) => `${REDIS_PREFIX}:recordings:${key}`,
  devices: (systemId: string) => `${REDIS_PREFIX}:nx:devices:${safeKeyPart(systemId)}`,
  devicesStatus: (systemId: string) =>
    `${REDIS_PREFIX}:nx:devices:status:${safeKeyPart(systemId)}`,
  devicesIndex: (systemId: string) =>
    `${REDIS_PREFIX}:nx:devices:index:${safeKeyPart(systemId)}`,
  devicesSummary: (systemId: string) =>
    `${REDIS_PREFIX}:nx:devices:summary:${safeKeyPart(systemId)}`,
  cloudSystems: (authFingerprint: string) =>
    `${REDIS_PREFIX}:cloud_systems:${safeKeyPart(authFingerprint)}`,
  deviceMonitorLatest: () => `${REDIS_PREFIX}:device_monitor:latest` as const,
  /** Cache mirror of data/scheduled_recordings.json */
  scheduledRecordings: () => `${REDIS_PREFIX}:scheduled_recordings` as const,
  /** Cache mirror of data/ffmpeg_queue.json */
  ffmpegQueue: () => `${REDIS_PREFIX}:ffmpeg_queue` as const,
  /** Cache mirror of data/notifications.json */
  notifications: () => `${REDIS_PREFIX}:notifications` as const,
  /** Cache mirror of data/scheduled_error_logs.json */
  scheduledErrorLogs: () => `${REDIS_PREFIX}:scheduled_error_logs` as const,
} as const;
