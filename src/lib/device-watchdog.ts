/**
 * Server-Side Background Watchdog for Cameras & VMS Systems
 * Runs 24/7 headlessly in the Node.js process without any active browser tabs.
 */

import {
  readDeviceMonitorSnapshot,
  writeDeviceMonitorSnapshot,
  type DeviceMonitorSnapshot,
} from "@/lib/device-monitor-store";
import {
  getValidServerCloudSession,
} from "@/lib/cloud-session-store";
import {
  getNxSystems,
  getNxSystemToken,
  getNxDevices,
  createNxEvent,
} from "@/lib/nx-cloud-service";
import {
  readNotifications,
  writeNotifications,
  type StoredNotification,
} from "@/lib/notifications-store";
import logger from "@/lib/logger";

declare global {
  var _deviceWatchdogInterval: NodeJS.Timeout | undefined;
  var _deviceWatchdogIsRunning: boolean | undefined;
  var _deviceWatchdogLastRun: string | undefined;
  var _deviceWatchdogLastError: string | undefined;
  var _deviceWatchdogLastCheckSummary: {
    totalSystems: number;
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
  } | undefined;
}

export interface WatchdogStatus {
  active: boolean;
  isRunningCheck: boolean;
  lastRun?: string;
  lastError?: string;
  summary?: {
    totalSystems: number;
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
  };
}

function isStatusOnline(status: string | undefined | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === "online" || s === "recording";
}

function isStatusOffline(status: string | undefined | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === "offline" || s === "unauthorized" || s === "no-access";
}

/**
 * Record a persistent notification on the server
 */
async function recordNotification(
  userKey: string,
  notification: Omit<StoredNotification, "id" | "timestamp" | "read">,
) {
  try {
    const all = await readNotifications();
    const list = all[userKey] || [];
    const newEntry: StoredNotification = {
      id: `wd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      read: false,
      ...notification,
    };
    // Keep last 150 notifications per user
    all[userKey] = [newEntry, ...list.slice(0, 149)];
    await writeNotifications(all);
  } catch (err: any) {
    logger.error("[DeviceWatchdog] Failed to save notification:", err.message);
  }
}

/**
 * Execute a single monitoring cycle
 */
export async function runDeviceWatchdogCycle(): Promise<DeviceMonitorSnapshot | null> {
  if (globalThis._deviceWatchdogIsRunning) {
    logger.debug("[DeviceWatchdog] Previous cycle still in progress, skipping.");
    return null;
  }

  globalThis._deviceWatchdogIsRunning = true;
  globalThis._deviceWatchdogLastRun = new Date().toISOString();

  try {
    const session = await getValidServerCloudSession();

    if (!session || !session.refreshToken) {
      const msg = "No cloud session available. Waiting for OAuth login or NX_CLOUD_REFRESH_TOKEN.";
      globalThis._deviceWatchdogLastError = msg;
      return null;
    }

    const systems = await getNxSystems(session.accessToken);
    if (!systems || systems.length === 0) {
      logger.debug("[DeviceWatchdog] No systems found for account.");
      return null;
    }

    const previousSnapshot = await readDeviceMonitorSnapshot();
    const userNotificationKey = session.email || "admin";

    const systemSnapshots: DeviceMonitorSnapshot["systems"] = [];
    let grandTotalDevices = 0;
    let grandOnlineDevices = 0;
    let grandOfflineDevices = 0;

    for (const sys of systems) {
      const cleanSysId = sys.id.replace(/[{}]/g, "");
      try {
        const systemToken = await getNxSystemToken(session.refreshToken, cleanSysId);
        const devices = await getNxDevices(cleanSysId, systemToken);

        const mappedDevices = devices.map((d) => ({
          id: d.id,
          name: d.name || "Camera",
          status: d.status || "Offline",
          serverId: d.serverId,
          typeId: d.typeId,
        }));

        grandTotalDevices += mappedDevices.length;

        // Find previous devices for comparison
        const prevSys = previousSnapshot?.systems?.find(
          (s) => s.systemId.replace(/[{}]/g, "") === cleanSysId,
        );
        const prevDevicesMap = new Map<string, string>();
        if (prevSys?.devices) {
          for (const pd of prevSys.devices) {
            prevDevicesMap.set(pd.id, pd.status);
          }
        }

        // Compare each device for status transition
        for (const currentDev of mappedDevices) {
          const currentOnline = isStatusOnline(currentDev.status);
          const currentOffline = isStatusOffline(currentDev.status);

          if (currentOnline) grandOnlineDevices++;
          if (currentOffline) grandOfflineDevices++;

          const prevStatus = prevDevicesMap.get(currentDev.id);

          // If we had a baseline status in the previous snapshot
          if (prevStatus !== undefined) {
            const wasOnline = isStatusOnline(prevStatus);
            const wasOffline = isStatusOffline(prevStatus);

            // 1. Camera went OFFLINE
            if (wasOnline && currentOffline) {
              console.warn(
                `[DeviceWatchdog] 🔴 OFFLINE ALERT: Camera '${currentDev.name}' in '${sys.name}' went offline!`,
              );

              // Create event in NX Witness
              await createNxEvent(cleanSysId, systemToken, {
                caption: `Camera Disconnected: ${currentDev.name}`,
                description: `Camera '${currentDev.name}' has lost connection to the server. (Reported by 24/7 Watchdog)`,
                source: sys.name,
                cameraId: currentDev.id,
                timestamp: Date.now().toString(),
              }).catch((e) => console.warn(`[DeviceWatchdog] NxEvent failed: ${e.message}`));

              // Store persistent notification
              await recordNotification(userNotificationKey, {
                type: "error",
                title: "🔴 Camera Offline",
                message: `${currentDev.name} in ${sys.name} has lost connection`,
                systemId: sys.id,
                deviceId: currentDev.id,
              });
            }

            // 2. Camera came back ONLINE
            if (wasOffline && currentOnline) {
              console.log(
                `[DeviceWatchdog] 🟢 ONLINE ALERT: Camera '${currentDev.name}' in '${sys.name}' is back online!`,
              );

              // Create event in NX Witness
              await createNxEvent(cleanSysId, systemToken, {
                caption: `Camera Online: ${currentDev.name}`,
                description: `Camera '${currentDev.name}' has been reconnected. (Reported by 24/7 Watchdog)`,
                source: sys.name,
                cameraId: currentDev.id,
                timestamp: Date.now().toString(),
              }).catch((e) => console.warn(`[DeviceWatchdog] NxEvent failed: ${e.message}`));

              // Store persistent notification
              await recordNotification(userNotificationKey, {
                type: "success",
                title: "🟢 Camera Online",
                message: `${currentDev.name} in ${sys.name} is now back online`,
                systemId: sys.id,
                deviceId: currentDev.id,
              });
            }
          }
        }

        systemSnapshots.push({
          systemId: sys.id,
          systemName: sys.name,
          deviceCount: mappedDevices.length,
          status: "success",
          devices: mappedDevices,
        });
      } catch (err: any) {
        logger.warn(
          `[DeviceWatchdog] Failed to query system '${sys.name}' (${sys.id}): ${err.message}`,
        );
        systemSnapshots.push({
          systemId: sys.id,
          systemName: sys.name,
          deviceCount: 0,
          status: "failed",
          devices: [],
        });
      }
    }

    const newSnapshot: DeviceMonitorSnapshot = {
      timestamp: new Date().toISOString(),
      systems: systemSnapshots,
      summary: {
        totalSystems: systemSnapshots.length,
        successfulSystems: systemSnapshots.filter((s) => s.status === "success").length,
        totalDevices: grandTotalDevices,
      },
    };

    // Save snapshot to disk (and update Redis)
    await writeDeviceMonitorSnapshot(newSnapshot);

    globalThis._deviceWatchdogLastCheckSummary = {
      totalSystems: systemSnapshots.length,
      totalDevices: grandTotalDevices,
      onlineDevices: grandOnlineDevices,
      offlineDevices: grandOfflineDevices,
    };
    globalThis._deviceWatchdogLastError = undefined;

    return newSnapshot;
  } catch (err: any) {
    globalThis._deviceWatchdogLastError = err.message || "Unknown watchdog error";
    console.error("[DeviceWatchdog] Check error:", err);
    return null;
  } finally {
    globalThis._deviceWatchdogIsRunning = false;
  }
}

/**
 * Start the 24/7 background watchdog
 */
export function startDeviceWatchdog(intervalMs: number = 30000): void {
  if (globalThis._deviceWatchdogInterval) {
    console.log("[DeviceWatchdog] Watchdog is already running.");
    return;
  }

  console.log(`[DeviceWatchdog] 🚀 Starting 24/7 camera watchdog (interval: ${intervalMs / 1000}s)`);

  // Run initial check after a slight delay to allow server initialization
  setTimeout(() => {
    runDeviceWatchdogCycle().catch((err) =>
      console.error("[DeviceWatchdog] Initial run error:", err),
    );
  }, 5000);

  globalThis._deviceWatchdogInterval = setInterval(() => {
    runDeviceWatchdogCycle().catch((err) =>
      console.error("[DeviceWatchdog] Periodic check error:", err),
    );
  }, intervalMs);
}

/**
 * Stop the watchdog timer
 */
export function stopDeviceWatchdog(): void {
  if (globalThis._deviceWatchdogInterval) {
    clearInterval(globalThis._deviceWatchdogInterval);
    globalThis._deviceWatchdogInterval = undefined;
    console.log("[DeviceWatchdog] 🛑 Watchdog stopped.");
  }
}

/**
 * Get current watchdog status
 */
export function getDeviceWatchdogStatus(): WatchdogStatus {
  return {
    active: !!globalThis._deviceWatchdogInterval,
    isRunningCheck: !!globalThis._deviceWatchdogIsRunning,
    lastRun: globalThis._deviceWatchdogLastRun,
    lastError: globalThis._deviceWatchdogLastError,
    summary: globalThis._deviceWatchdogLastCheckSummary,
  };
}
