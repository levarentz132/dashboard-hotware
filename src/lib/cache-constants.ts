/** Client + server cache timing aligned with Redis-backed NX metadata. */

/** Device/camera/server lists — Redis holds canonical copy; client can stay fresh longer. */
export const NX_DEVICES_STALE_MS = 3 * 60 * 1000;
export const NX_SERVERS_STALE_MS = 3 * 60 * 1000;
export const NX_DEVICE_TYPES_STALE_MS = 5 * 60 * 1000;

/** Live-ish data — shorter client windows. */
export const NX_EVENTS_STALE_MS = 30_000;
export const NX_ALARMS_STALE_MS = 10_000;
export const NX_MODULES_STALE_MS = 60_000;

/** Cloud systems list (server Redis + client React Query). */
export const CLOUD_SYSTEMS_STALE_MS = 5 * 60 * 1000;
export const CLOUD_SYSTEMS_REFETCH_MS = 5 * 60 * 1000;

/** Background device monitor — status-only poll interval. */
export const DEVICE_MONITOR_INTERVAL_MS = 60_000;
