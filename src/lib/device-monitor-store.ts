/**
 * Device monitor snapshot — persisted in Redis (SET, no TTL).
 * Legacy `data/device_monitor_history.json` migrates on first read.
 */

import fs from "fs";
import path from "path";
import { cacheGetJson, cacheSetJson } from "@/lib/redis/cache";
import { redisKeys } from "@/lib/redis/keys";

export const LEGACY_DEVICE_MONITOR_FILE = path.join(
  process.cwd(),
  "data",
  "device_monitor_history.json",
);

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

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, "");
}

async function migrateFromLegacyFile(): Promise<DeviceMonitorSnapshot | null> {
  try {
    if (!fs.existsSync(LEGACY_DEVICE_MONITOR_FILE)) return null;
    const raw = stripBom(fs.readFileSync(LEGACY_DEVICE_MONITOR_FILE, "utf-8"));
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as DeviceMonitorSnapshot;
    await cacheSetJson(redisKeys.deviceMonitorLatest(), parsed);
    return parsed;
  } catch (err) {
    console.warn("[device-monitor-store] Legacy migration failed:", err);
    return null;
  }
}

export async function readDeviceMonitorSnapshot(): Promise<DeviceMonitorSnapshot | null> {
  const cached = await cacheGetJson<DeviceMonitorSnapshot>(redisKeys.deviceMonitorLatest());
  if (cached?.timestamp) return cached;

  return migrateFromLegacyFile();
}

export async function writeDeviceMonitorSnapshot(
  snapshot: DeviceMonitorSnapshot,
): Promise<void> {
  await cacheSetJson(redisKeys.deviceMonitorLatest(), snapshot);
}
