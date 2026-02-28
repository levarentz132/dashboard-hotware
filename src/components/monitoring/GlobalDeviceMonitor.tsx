"use client";

import { useEffect, useRef, useCallback } from "react";
import { getElectronHeaders } from "@/lib/config";
import { showNotification } from "@/lib/notifications";
import nxAPI from "@/lib/nxapi";
import Cookies from "js-cookie";

interface CloudSystem {
  id: string;
  name: string;
}

interface DeviceInfo {
  id: string;
  name: string;
  status: string;
  vendor?: string;
  model?: string;
}

interface MonitoringSnapshot {
  timestamp: string;
  systems: {
    systemId: string;
    systemName: string;
    deviceCount: number;
    status: "success" | "failed";
    devices?: any[];
  }[];
  summary: {
    totalSystems: number;
    successfulSystems: number;
    totalDevices: number;
  };
}

/**
 * Global Device Monitor
 * Continuously monitors /devices endpoint every 30 seconds across all cloud systems
 * Runs in the background on all pages
 * Saves changes to JSON file for comparison
 */
export function GlobalDeviceMonitor() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const systemsRef = useRef<CloudSystem[]>([]);
  const previousSnapshotRef = useRef<MonitoringSnapshot | null>(null);
  const lastNotifiedStatusRef = useRef<Record<string, string>>({});

  console.log("[GlobalDeviceMonitor] ⚡ Component rendering");

  // Debug: Log component mount
  useEffect(() => {
    console.log("[GlobalDeviceMonitor] ✅ Component mounted - monitoring will start");
    return () => console.log("[GlobalDeviceMonitor] ❌ Component unmounted");
  }, []);

  /**
   * Fetch all available systems (Local + Cloud)
   */
  const fetchAllSystems = useCallback(async () => {
    const allSystems: CloudSystem[] = [];

    // 1. Add Local System baseline if found in cookies
    const localId = Cookies.get("nx_system_id") || Cookies.get("nx_server_id");
    if (localId) {
      allSystems.push({
        id: localId.replace(/[{}]/g, ""),
        name: "Local Server"
      });
    }

    try {
      const response = await fetch("/api/cloud/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...getElectronHeaders(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        const systems = Array.isArray(data) ? data : data?.systems || [];

        console.log(`[GlobalDeviceMonitor] Found ${systems.length} cloud systems`);

        systems.forEach((s: any) => {
          const cleanId = s.id.replace(/[{}]/g, "");
          if (!allSystems.find(existing => existing.id.replace(/[{}]/g, "") === cleanId)) {
            allSystems.push({
              id: s.id,
              name: s.name,
            });
          }
        });
      }
    } catch (error) {
      console.error("[GlobalDeviceMonitor] Error fetching cloud systems:", error);
    }

    console.log(`[GlobalDeviceMonitor] Total systems to monitor: ${allSystems.length}`);
    return allSystems;
  }, []);

  /**
   * Check devices for a specific system
   */
  const checkDevicesForSystem = useCallback(async (systemId: string, systemName: string) => {
    try {
      const response = await fetch(
        `/api/nx/devices?systemId=${encodeURIComponent(systemId)}&systemName=${encodeURIComponent(systemName)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...getElectronHeaders(),
          },
        }
      );

      if (response.ok) {
        const devices = await response.json();
        const deviceCount = Array.isArray(devices) ? devices.length : 0;
        console.log(
          `[GlobalDeviceMonitor] ✓ ${systemName}: ${deviceCount} devices (Status: ${response.status})`
        );
        return {
          success: true,
          deviceCount,
          systemId,
          systemName,
          devices: devices // Include full device data for comparison
        };
      } else {
        console.warn(
          `[GlobalDeviceMonitor] ✗ ${systemName}: Failed with status ${response.status}`
        );
        return { success: false, deviceCount: 0, systemId, systemName, devices: [] };
      }
    } catch (error) {
      console.error(`[GlobalDeviceMonitor] Error checking devices for ${systemName}:`, error);
      return { success: false, deviceCount: 0, systemId, systemName, devices: [] };
    }
  }, []);

  /**
   * Create event in NX system when camera status changes
   */
  const triggerCameraEvent = useCallback(async (cameraName: string, cameraId: string, systemId: string, systemName: string, status: 'online' | 'offline') => {
    try {
      const isOnline = status === 'online';
      const caption = isOnline ? "Camera Online" : "Camera Offline";
      const description = `Camera "${cameraName}" is ${isOnline ? "back online" : "now offline"}.`;

      console.log(`[GlobalDeviceMonitor] 📡 Triggering ${caption} for ${cameraName} on ${systemName}`);

      // Temporarily set systemId to target system for the API call
      const originalSystemId = nxAPI.getSystemId();
      nxAPI.setSystemId(systemId);

      await nxAPI.createGenericEvent({
        source: systemName || "VMS Server",
        caption: caption,
        description: description,
        deviceIds: [cameraId],
        level: isOnline ? "info" : "warning",
        state: "instant"
      });

      // Restore original systemId
      if (originalSystemId) nxAPI.setSystemId(originalSystemId);

      console.log(`[GlobalDeviceMonitor] ✅ ${caption} event created successfully for ${cameraName}`);
    } catch (error) {
      console.error(`[GlobalDeviceMonitor] ❌ Error triggering status event:`, error);
    }
  }, []);

  /**
   * Load previous snapshot from API (if exists)
   */
  const loadPreviousSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/api/device-monitor", {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const snapshot = await response.json();
        previousSnapshotRef.current = snapshot;
        console.log(`[GlobalDeviceMonitor] 📂 Loaded previous snapshot: ${snapshot.summary?.totalDevices || 0} devices`);
        return snapshot;
      }
    } catch (error) {
      console.log("[GlobalDeviceMonitor] No previous snapshot found (first run)");
    }
    return null;
  }, []);

  /**
   * Compare two snapshots to detect changes and notify about status changes
   */
  const hasChanges = useCallback(async (current: MonitoringSnapshot, previous: MonitoringSnapshot | null): Promise<boolean> => {
    let hasAnyChanges = !previous; // If no previous snapshot, it's the first run, so there are "changes" to establish baseline
    const isFirstRun = !previous;

    // Compare summary
    if (!isFirstRun && current.summary.totalDevices !== previous!.summary.totalDevices) hasAnyChanges = true;
    if (!isFirstRun && current.summary.successfulSystems !== previous!.summary.successfulSystems) hasAnyChanges = true;

    // Compare each system and detect device status changes
    for (const currentSystem of current.systems) {
      const previousSystem = previous?.systems.find(s => s.systemId === currentSystem.systemId);

      if (!previousSystem) {
        hasAnyChanges = true;
        continue;
      }

      if (currentSystem.deviceCount !== previousSystem.deviceCount) hasAnyChanges = true;
      if (currentSystem.status !== previousSystem.status) hasAnyChanges = true;

      // Check individual device status changes
      const currentDevices = currentSystem.devices || [];
      const previousDevices = previousSystem.devices || [];

      for (const currentDevice of currentDevices) {
        const previousDevice = previousDevices.find((d: any) => d.id === currentDevice.id);

        if (previousDevice && previousDevice.status !== currentDevice.status) {
          hasAnyChanges = true;

          // Normalize status strings for comparison
          const currentStatus = (currentDevice.status || '').toLowerCase().trim();
          const previousStatus = (previousDevice.status || '').toLowerCase().trim();

          // Definitions of online/offline
          const isStatusOnline = (s: string) => s === 'online' || s === 'recording';
          const isStatusOffline = (s: string) => s === 'offline' || s === 'unauthorized' || s === 'no-access';

          const isNowOnline = isStatusOnline(currentStatus);
          const wasOnline = isStatusOnline(previousStatus);
          const isNowOffline = isStatusOffline(currentStatus);
          const wasOffline = isStatusOffline(previousStatus);

          if (previousStatus !== currentStatus) {
            console.log(`[GlobalDeviceMonitor] 📊 Device ${currentDevice.name} status transition: "${previousStatus}" → "${currentStatus}"`);
          }

          const deviceKey = `${currentSystem.systemId}:${currentDevice.id}`;
          const lastNotified = lastNotifiedStatusRef.current[deviceKey];

          if (!isFirstRun && !wasOnline && isNowOnline && lastNotified !== 'online') {
            // Device came online
            console.log(`[GlobalDeviceMonitor] 🟢 ALERT: ${currentDevice.name} (${currentSystem.systemName}) came ONLINE`);

            await triggerCameraEvent(
              currentDevice.name || currentDevice.id,
              currentDevice.id,
              currentSystem.systemId,
              currentSystem.systemName,
              'online'
            );

            showNotification({
              type: 'success',
              title: '🟢 Camera Online',
              message: `${currentDevice.name || currentDevice.id} in ${currentSystem.systemName} is now online`
            });

            lastNotifiedStatusRef.current[deviceKey] = 'online';
          } else if (!isFirstRun && !wasOffline && isNowOffline && lastNotified !== 'offline') {
            // Device went offline
            console.log(`[GlobalDeviceMonitor] 🔴 ALERT: ${currentDevice.name} (${currentSystem.systemName}) went OFFLINE`);

            await triggerCameraEvent(
              currentDevice.name || currentDevice.id,
              currentDevice.id,
              currentSystem.systemId,
              currentSystem.systemName,
              'offline'
            );

            showNotification({
              type: 'error',
              title: '🔴 Camera Offline',
              message: `${currentDevice.name || currentDevice.id} in ${currentSystem.systemName} is now offline`
            });

            lastNotifiedStatusRef.current[deviceKey] = 'offline';
          } else if (previousStatus !== currentStatus) {
            // Track status for other transitions without notifying if it's just e.g. 'recording' -> 'online' (both online)
            lastNotifiedStatusRef.current[deviceKey] = currentStatus;
          }

          // INITIALIZATION: If we haven't tracked this device yet, record its current baseline status
          if (lastNotified === undefined) {
            lastNotifiedStatusRef.current[deviceKey] = isNowOnline ? 'online' : (isNowOffline ? 'offline' : currentStatus);
            console.log(`[GlobalDeviceMonitor] 📝 Initializing baseline status for ${currentDevice.name} to "${lastNotifiedStatusRef.current[deviceKey]}"`);
          }

          // If ANY change was detected (online or offline), broadcast it so UI can refresh
          if (previousDevice && previousDevice.status !== currentDevice.status) {
            window.dispatchEvent(new CustomEvent('nx:device-status-changed', {
              detail: {
                deviceId: currentDevice.id,
                systemId: currentSystem.systemId,
                status: currentDevice.status
              }
            }));
          }
        }
      }

      // Deep compare devices (check for device changes)
      if (JSON.stringify(currentSystem.devices) !== JSON.stringify(previousSystem.devices)) {
        hasAnyChanges = true;
      }
    }

    // Check for removed systems
    if (!isFirstRun && current.systems.length !== previous!.systems.length) hasAnyChanges = true;

    return hasAnyChanges;
  }, [triggerCameraEvent]);

  /**
   * Save monitoring snapshot to JSON file via API
   */
  const saveSnapshot = useCallback(async (snapshot: MonitoringSnapshot) => {
    try {
      const response = await fetch("/api/device-monitor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshot),
      });

      if (response.ok) {
        console.log(`[GlobalDeviceMonitor] 💾 Snapshot saved: ${snapshot.summary.totalDevices} devices across ${snapshot.summary.totalSystems} systems`);
      } else {
        console.warn("[GlobalDeviceMonitor] Failed to save snapshot");
      }
    } catch (error) {
      console.error("[GlobalDeviceMonitor] Error saving snapshot:", error);
    }
  }, []);

  /**
   * Check all systems' devices
   */
  const checkAllDevices = useCallback(async () => {
    const systems = systemsRef.current;

    if (systems.length === 0) {
      console.log("[GlobalDeviceMonitor] No online systems to monitor");
      return;
    }

    console.log(`[GlobalDeviceMonitor] 🔄 Checking devices for ${systems.length} system(s)...`);

    // Check all systems in parallel
    const results = await Promise.all(
      systems.map((system) => checkDevicesForSystem(system.id, system.name))
    );

    const successCount = results.filter((r) => r.success).length;
    const totalDevices = results.reduce((sum, r) => sum + r.deviceCount, 0);

    // Log individual device statuses
    console.log(`[GlobalDeviceMonitor] 📋 Monitoring results: ${totalDevices} total devices`);
    results.forEach(result => {
      if (result.success && result.devices) {
        let onlineCount = 0;
        let offlineCount = 0;
        result.devices.forEach((device: any) => {
          const status = (device.status || 'unknown').toLowerCase();
          if (status === 'online' || status === 'recording') onlineCount++;
          else if (status === 'offline') offlineCount++;
        });
        console.log(`  System: ${result.systemName} -> ${onlineCount} online, ${offlineCount} offline`);
      }
    });

    // Create current snapshot
    const currentSnapshot: MonitoringSnapshot = {
      timestamp: new Date().toISOString(),
      systems: results.map(r => ({
        systemId: r.systemId,
        systemName: r.systemName,
        deviceCount: r.deviceCount,
        status: r.success ? "success" : "failed",
        devices: r.devices || []
      })),
      summary: {
        totalSystems: systems.length,
        successfulSystems: successCount,
        totalDevices: totalDevices
      }
    };

    // Compare with previous snapshot
    const changed = await hasChanges(currentSnapshot, previousSnapshotRef.current);

    if (changed) {
      console.log(`[GlobalDeviceMonitor] 🔔 Changes detected! Saving to JSON...`);
      await saveSnapshot(currentSnapshot);
      previousSnapshotRef.current = currentSnapshot;
    } else {
      console.log(`[GlobalDeviceMonitor] ℹ️ No changes detected, skipping save`);
    }

    console.log(
      `[GlobalDeviceMonitor] ✓ Monitoring complete: ${successCount}/${systems.length} systems, ${totalDevices} total devices`
    );
  }, [checkDevicesForSystem, hasChanges, saveSnapshot]);

  /**
   * Initialize monitoring
   */
  const initializeMonitoring = useCallback(async () => {
    // Prevent duplicate initialization - check if interval is already running
    if (intervalRef.current) {
      console.log("[GlobalDeviceMonitor] ⏭️ Already running, skipping");
      return;
    }

    console.log("[GlobalDeviceMonitor] 🚀 Initializing global device monitoring...");

    // Load previous snapshot for comparison
    await loadPreviousSnapshot();

    // Fetch available systems
    const systems = await fetchAllSystems();
    systemsRef.current = systems;

    if (systems.length === 0) {
      console.warn("[GlobalDeviceMonitor] No systems found. Monitoring disabled.");
      return;
    }

    console.log(
      `[GlobalDeviceMonitor] Found ${systems.length} system(s): ${systems.map((s: any) => s.name).join(", ")}`
    );

    // Initial check
    await checkAllDevices();

    // Set up 30-second interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      checkAllDevices();
    }, 10000);

    console.log("[GlobalDeviceMonitor] ✓ Monitoring started (30s interval)");
  }, [loadPreviousSnapshot, fetchAllSystems, checkAllDevices]);

  /**
   * Start monitoring on mount
   */
  useEffect(() => {
    console.log("[GlobalDeviceMonitor] 🔧 Starting initialization...");

    const startMonitoring = async () => {
      try {
        await initializeMonitoring();
      } catch (error) {
        console.error("[GlobalDeviceMonitor] ❌ Failed to initialize:", error);
      }
    };

    startMonitoring();

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        console.log("[GlobalDeviceMonitor] 🛑 Monitoring stopped");
      }
    };
  }, [initializeMonitoring]);

  // This component doesn't render anything
  return null;
}

export default GlobalDeviceMonitor;
