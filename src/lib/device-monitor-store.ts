/**
 * Device monitor snapshot — source of truth: data/device_monitor_history.json
 * Redis holds a read-through cache (invalidated when the file mtime changes).
 */

import path from "path";
import { readJsonWithCache, writeJsonWithCache } from "@/lib/json-store-cache";
import { redisKeys } from "@/lib/redis/keys";

export const DEVICE_MONITOR_FILE = path.join(
  process.cwd(),
  "data",
  "device_monitor_history.json",
);

/** @deprecated Use DEVICE_MONITOR_FILE */
export const LEGACY_DEVICE_MONITOR_FILE = DEVICE_MONITOR_FILE;

export interface DeviceMonitorSnapshot {
  timestamp: string;
  systems: Array<{
    systemId: string;
    systemName: string;
    deviceCount: number;
    status: "success" | "failed";
    devices?: Array<{ id: string; name: string; status: string }>;
  }>;
  summary: {
    totalSystems: number;
    successfulSystems: number;
    totalDevices: number;
  };
}

function isDeviceMonitorSnapshot(data: unknown): data is DeviceMonitorSnapshot {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as DeviceMonitorSnapshot).timestamp === "string"
  );
}

export async function readDeviceMonitorSnapshot(): Promise<DeviceMonitorSnapshot | null> {
  return readJsonWithCache({
    filePath: DEVICE_MONITOR_FILE,
    redisKey: redisKeys.deviceMonitorLatest(),
    validate: isDeviceMonitorSnapshot,
  });
}

export async function writeDeviceMonitorSnapshot(
  snapshot: DeviceMonitorSnapshot,
): Promise<void> {
  await writeJsonWithCache(DEVICE_MONITOR_FILE, redisKeys.deviceMonitorLatest(), snapshot);
}
