"use client";

import { useEffect, useRef, useCallback } from "react";
import { getElectronHeaders } from "@/lib/config";
import { showNotification } from "@/lib/notifications";

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
   * Fetch all available cloud systems
   */
  const fetchCloudSystems = useCallback(async () => {
    try {
      const response = await fetch("/api/cloud/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...getElectronHeaders(),
        },
      });

      if (!response.ok) {
        console.warn("[GlobalDeviceMonitor] Failed to fetch cloud systems");
        return [];
      }

      const data = await response.json();
      const systems = Array.isArray(data) ? data : data?.systems || [];
      
      // Only monitor the first system to avoid duplicate events
      if (systems.length === 0) return [];
      
      const firstSystem = systems[0];
      console.log(`[GlobalDeviceMonitor] Using first system only: ${firstSystem.name}`);
      
      return [{
        id: firstSystem.id,
        name: firstSystem.name,
      }];
    } catch (error) {
      console.error("[GlobalDeviceMonitor] Error fetching cloud systems:", error);
      return [];
    }
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
   * Create event in NX system when camera comes online
   */
  const createCameraOnlineEvent = useCallback(async (cameraName: string, systemId: string, systemName: string) => {
    try {
      const timestamp = new Date().toISOString();
      const caption = `${cameraName} is online`;

      console.log(`[GlobalDeviceMonitor] 📡 Creating event: ${caption}`);

      const response = await fetch('/api/nx/create-event', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...getElectronHeaders(),
        },
        body: JSON.stringify({
          timestamp,
          caption,
          systemId,
          systemName,
        }),
      });

      if (response.ok) {
        console.log(`[GlobalDeviceMonitor] ✅ Event created successfully for ${cameraName}`);
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.warn(`[GlobalDeviceMonitor] ⚠️ Failed to create event: ${response.status}`, error);
      }
    } catch (error) {
      console.error(`[GlobalDeviceMonitor] ❌ Error creating event:`, error);
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
    if (!previous) return true; // First run, always has changes

    // Compare summary
    if (current.summary.totalDevices !== previous.summary.totalDevices) return true;
    if (current.summary.successfulSystems !== previous.summary.successfulSystems) return true;

    let hasAnyChanges = false;

    // Compare each system and detect device status changes
    for (const currentSystem of current.systems) {
      const previousSystem = previous.systems.find(s => s.systemId === currentSystem.systemId);
      
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
          
          console.log(`[GlobalDeviceMonitor] 📊 Device ${currentDevice.name}: ${previousStatus} → ${currentStatus}`);
          
          // Notify about status change
          const isNowOnline = currentStatus === 'online';
          const wasOffline = previousStatus === 'offline';
          const isNowOffline = currentStatus === 'offline';
          const wasOnline = previousStatus === 'online';
          
          const deviceKey = `${currentSystem.systemId}:${currentDevice.id}`;
          const lastNotifiedStatus = lastNotifiedStatusRef.current[deviceKey];

          if (wasOffline && isNowOnline && lastNotifiedStatus !== 'online') {
            // Device came online
            console.log(`[GlobalDeviceMonitor] 🟢 ALERT: ${currentDevice.name} (${currentSystem.systemName}) came ONLINE`);
            
            // Create event in NX system - await to ensure it executes
            await createCameraOnlineEvent(
              currentDevice.name || currentDevice.id, 
              currentSystem.systemId,
              currentSystem.systemName
            );
            
            showNotification({
              type: 'success',
              title: '🟢 Camera Online',
              message: `${currentDevice.name || currentDevice.id} in ${currentSystem.systemName} is now online`
            });
            
            // Mark as notified AFTER successful event creation
            lastNotifiedStatusRef.current[deviceKey] = 'online';
          } else {
            // Track status for non-online transitions
            lastNotifiedStatusRef.current[deviceKey] = currentStatus;
          }
        }
      }

      // Deep compare devices (check for device changes)
      if (JSON.stringify(currentSystem.devices) !== JSON.stringify(previousSystem.devices)) {
        hasAnyChanges = true;
      }
    }

    // Check for removed systems
    if (current.systems.length !== previous.systems.length) hasAnyChanges = true;

    return hasAnyChanges;
  }, [createCameraOnlineEvent]);

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
    console.log(`[GlobalDeviceMonitor] 📋 Current Device Statuses:`);
    results.forEach(result => {
      if (result.success && result.devices) {
        console.log(`\n  System: ${result.systemName}`);
        result.devices.forEach((device: any) => {
          const status = (device.status || 'unknown').toLowerCase();
          const statusIcon = status === 'online' ? '🟢' : status === 'offline' ? '🔴' : '⚪';
          console.log(`    ${statusIcon} ${device.name || device.id} - Status: ${device.status}`);
        });
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
    const systems = await fetchCloudSystems();
    systemsRef.current = systems;

    if (systems.length === 0) {
      console.warn("[GlobalDeviceMonitor] No systems found. Monitoring disabled.");
      return;
    }

    console.log(
      `[GlobalDeviceMonitor] Found ${systems.length} system(s): ${systems.map((s) => s.name).join(", ")}`
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
  }, [loadPreviousSnapshot, fetchCloudSystems, checkAllDevices]);

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
