"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { HardDrive, Database, RefreshCw, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInventorySync } from "@/hooks/use-inventory-sync";
import { getElectronHeaders } from "@/lib/config";
import Cookies from "js-cookie";

interface StorageStatusInfo {
  storageId: string;
  totalSpace: string;
  freeSpace: string;
  isOnline: boolean;
}

interface Storage {
  id: string;
  name: string;
  status?: string;
  statusInfo?: StorageStatusInfo | null;
  systemId?: string;
}

export default function StorageSummaryWidget({ systemId: propSystemId }: { systemId?: string }) {
  // 1. Define Fetchers
  const fetchLocalStorages = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    if (!localUserStr) return null;

    try {
      const localUser = JSON.parse(localUserStr);
      const sid = Cookies.get("nx_system_id") || localUser.serverId || "local";

      // Fetch storage list (v3)
      const listResp = await fetch("/nx/rest/v3/servers/this/storages", {
        headers: { "x-runtime-guid": localUser.token }
      });

      // Fetch storage status (v4)
      const statusResp = await fetch("/nx/rest/v4/servers/this/storages/*/status", {
        headers: { "x-runtime-guid": localUser.token }
      });

      if (!listResp.ok) return null;

      const listData = await listResp.json();
      const statusData = await statusResp.json();

      const merged = (Array.isArray(listData) ? listData : []).map((storage: any) => {
        const sid_clean = storage.id.replace(/[{}]/g, '');
        const status = (Array.isArray(statusData) ? statusData : []).find((s: any) =>
          s.storageId.replace(/[{}]/g, '') === sid_clean
        );
        return {
          ...storage,
          statusInfo: status || null,
          systemId: sid
        };
      });

      return {
        systemId: sid,
        systemName: "Local Server",
        items: merged,
        stateOfHealth: "online"
      };
    } catch (e) {
      console.error("[StorageWidget] Local fetch failed:", e);
      return null;
    }
  }, []);

  const fetchCloudStoragesForSystem = useCallback(async (system: { id: string, name: string }) => {
    try {
      const response = await fetch(
        `/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`,
        {
          headers: {
            Accept: "application/json",
            ...getElectronHeaders()
          },
        },
      );

      if (response.status >= 400) return [];
      const data = await response.json();
      return (Array.isArray(data) ? data : []).map((storage: any) => ({
        ...storage,
        systemId: system.id
      }));
    } catch (err) {
      console.error(`[StorageWidget] Error fetching storages from ${system.name}:`, err);
      return [];
    }
  }, []);

  // 2. Use Inventory sync hook
  const {
    dataBySystem,
    loading,
    error,
    refetch
  } = useInventorySync<Storage>(
    fetchLocalStorages,
    fetchCloudStoragesForSystem
  );

  // 3. Consolidated storage list
  const storages = useMemo(() => {
    return dataBySystem.flatMap(sys => sys.items);
  }, [dataBySystem]);

  // Format bytes to human readable
  const formatBytes = (bytes: string | number): string => {
    const numBytes = typeof bytes === "string" ? parseInt(bytes) : bytes;
    if (isNaN(numBytes) || numBytes === 0) return "0 B";

    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(numBytes) / Math.log(1024));
    return `${(numBytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Calculate totals
  const totalStorage = useMemo(() => storages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.totalSpace || "0");
    }
    return acc;
  }, 0), [storages]);

  const totalUsed = useMemo(() => storages.reduce((acc, s) => {
    if (s.statusInfo) {
      const total = parseInt(s.statusInfo.totalSpace || "0");
      const free = parseInt(s.statusInfo.freeSpace || "0");
      return acc + (total - free);
    }
    return acc;
  }, 0), [storages]);

  const totalFree = useMemo(() => storages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.freeSpace || "0");
    }
    return acc;
  }, 0), [storages]);

  const onlineStorages = storages.filter((s) => s.status === "Online" || s.statusInfo?.isOnline).length;
  const usagePercentage = totalStorage > 0 ? Math.round((totalUsed / totalStorage) * 100) : 0;

  const handleRefresh = () => {
    refetch();
  };

  if (loading && storages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading storage...</span>
      </div>
    );
  }

  if (error && storages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
          <RefreshCw className="w-4 h-4 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg shrink-0">
            <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base block truncate">Storage Overview</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Total usage progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total Usage</span>
          <span className="font-medium">{usagePercentage}%</span>
        </div>
        <Progress value={usagePercentage} className="h-2" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2">
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <Database className="w-4 h-4" />
            <span className="text-xs">Total</span>
          </div>
          <p className="text-sm font-bold mt-1">{formatBytes(totalStorage)}</p>
        </div>

        <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2">
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs">Free</span>
          </div>
          <p className="text-sm font-bold mt-1">{formatBytes(totalFree)}</p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-2">
          <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
            <HardDrive className="w-4 h-4" />
            <span className="text-xs">Used</span>
          </div>
          <p className="text-sm font-bold mt-1">{formatBytes(totalUsed)}</p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-2">
          <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
            {onlineStorages > 0 ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span className="text-xs">Drives</span>
          </div>
          <p className="text-sm font-bold mt-1">
            {onlineStorages}/{storages.length}
          </p>
        </div>
      </div>

      {/* Storage list (compact) */}
      {storages.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          <p className="text-xs text-muted-foreground">Storage Drives</p>
          {storages.slice(0, 4).map((storage) => {
            const total = parseInt(storage.statusInfo?.totalSpace || "0");
            const free = parseInt(storage.statusInfo?.freeSpace || "0");
            const used = total - free;
            const percent = total > 0 ? Math.round((used / total) * 100) : 0;
            const isOnline = storage.status === "Online" || storage.statusInfo?.isOnline;

            return (
              <div key={`${storage.systemId}-${storage.id}`} className="flex items-center gap-2 text-xs p-1.5 bg-muted/50 rounded">
                <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
                <span className="truncate flex-1">{storage.name}</span>
                <Badge variant="outline" className="text-[10px] h-5">
                  {percent}%
                </Badge>
              </div>
            );
          })}
          {storages.length > 4 && (
            <p className="text-[10px] text-muted-foreground text-center">+{storages.length - 4} more</p>
          )}
        </div>
      )}

      {storages.length === 0 && !loading && (
        <div className="text-center text-xs text-muted-foreground py-2">No storage found</div>
      )}
    </div>
  );
}
