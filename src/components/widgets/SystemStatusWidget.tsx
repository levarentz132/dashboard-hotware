"use client";

import { useState, useCallback, useMemo } from "react";
import { Server, Wifi, Database, Cpu, AlertCircle, RefreshCw } from "lucide-react";
import { getStatusColor, getStatusDotColor } from "@/lib/status-utils";
import { useInventorySync } from "@/hooks/use-inventory-sync";
import { getElectronHeaders } from "@/lib/config";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";

interface SystemStatusInfo {
  guid: string;
  name: string;
  status: string;
  version?: string;
}

export default function SystemStatusWidget({ systemId: propSystemId }: { systemId?: string }) {
  // 1. Define Fetchers
  const fetchLocalSystem = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    if (!localUserStr) return null;

    try {
      const localUser = JSON.parse(localUserStr);
      const sid = Cookies.get("nx_system_id") || localUser.serverId || "local";

      const response = await fetch("/nx/rest/v4/servers/this", {
        headers: {
          "Accept": "application/json",
          "x-runtime-guid": localUser.token
        }
      });

      if (!response.ok) return null;
      const data = await response.json();

      return {
        systemId: sid,
        systemName: data.name || "Local Server",
        items: [data as SystemStatusInfo],
        stateOfHealth: data.status?.toLowerCase() === "online" ? "online" : "offline"
      };
    } catch (e) {
      console.error("[SystemStatusWidget] Local fetch failed:", e);
      return null;
    }
  }, []);

  const fetchCloudSystemInfo = useCallback(async (system: { id: string, name: string }) => {
    try {
      const response = await fetch(
        `/api/nx/servers/this?systemId=${encodeURIComponent(system.id)}`,
        {
          headers: {
            Accept: "application/json",
            ...getElectronHeaders()
          },
        },
      );

      if (!response.ok) return [];
      const data = await response.json();
      return [data as SystemStatusInfo];
    } catch (err) {
      console.error(`[SystemStatusWidget] Error fetching system info from ${system.name}:`, err);
      return [];
    }
  }, []);

  // 2. Use Inventory sync hook
  const {
    dataBySystem,
    loading,
    error,
    refetch
  } = useInventorySync<SystemStatusInfo>(
    fetchLocalSystem,
    fetchCloudSystemInfo
  );

  // 3. Consolidated Stats
  const systemStats = useMemo(() => {
    // Determine which systems to show
    const targetSystems = propSystemId && propSystemId !== "all"
      ? dataBySystem.filter(s => s.systemId === propSystemId)
      : dataBySystem;

    const totalCount = targetSystems.length;
    const onlineCount = targetSystems.filter(s => s.stateOfHealth === "online").length;
    const isOffline = totalCount === 0 || (onlineCount === 0 && !loading);

    // Pick name for the 'System' row
    let displayName = "System Offline";
    if (totalCount === 1) {
      displayName = targetSystems[0].systemName;
    } else if (totalCount > 1) {
      displayName = `${totalCount} Systems`;
    } else if (loading) {
      displayName = "Syncing...";
    }

    if (isOffline && !loading) {
      return [
        { label: "Server Status", value: "Offline", status: "critical" as const, icon: Server },
        { label: "Network", value: "Disconnected", status: "critical" as const, icon: Wifi },
        { label: "Database", value: "Unavailable", status: "critical" as const, icon: Database },
        { label: "System", value: displayName, status: "critical" as const, icon: Cpu },
      ];
    }

    const allHealthy = onlineCount === totalCount && totalCount > 0;

    return [
      {
        label: "Server Status",
        value: allHealthy ? "Online" : `${onlineCount}/${totalCount} Online`,
        status: allHealthy ? "healthy" : (onlineCount > 0 ? "warning" : "critical") as any,
        icon: Server
      },
      {
        label: "Network",
        value: onlineCount > 0 ? "Connected" : "Disconnected",
        status: onlineCount > 0 ? "healthy" : "critical" as any,
        icon: Wifi
      },
      {
        label: "Database",
        value: onlineCount > 0 ? "Active" : "Offline",
        status: onlineCount > 0 ? "healthy" : "critical" as any,
        icon: Database
      },
      {
        label: "System",
        value: displayName,
        status: allHealthy ? "healthy" : "warning" as any,
        icon: Cpu
      },
    ];
  }, [dataBySystem, propSystemId, loading]);

  const handleRefresh = () => {
    refetch();
  };

  if (loading && dataBySystem.length === 0) {
    return (
      <div className="h-full flex flex-col p-2 sm:p-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <Server className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-bold text-sm sm:text-base">System Status</span>
          </div>
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="text-gray-500 text-sm">Syncing systems...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg shrink-0">
            <Server className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base block truncate">System Status</span>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4 text-gray-400", loading && "animate-spin")} />
        </button>
      </div>

      <div className="space-y-2.5 flex-1 overflow-auto">
        {systemStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={cn("p-1.5 rounded-lg", getStatusColor(stat.status))}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{stat.label}</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">{stat.value}</div>
                </div>
              </div>
              <div className={cn("w-2.5 h-2.5 rounded-full", getStatusDotColor(stat.status))}></div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[9px] text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Some systems unreachable
          </p>
        </div>
      )}
    </div>
  );
}
