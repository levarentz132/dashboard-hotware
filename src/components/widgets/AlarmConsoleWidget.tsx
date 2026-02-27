"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  AlertCircle,
  Bell,
  Camera,
  Server,
  HardDrive,
  Activity,
  Clock,
  Zap,
  WifiOff,
  AlertTriangle,
  XCircle,
  Info,
  Network,
  Shield,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getElectronHeaders } from "@/lib/config";
import { useInventorySync } from "@/hooks/use-inventory-sync";
import Cookies from "js-cookie";

interface EventLog {
  timestampMs: number;
  eventData: {
    reason: string;
    serverId: string;
    state: string;
    timestamp: string;
    type: string;
  };
  actionData: {
    acknowledge: boolean;
    attributes: any[];
    caption: string;
    clientAction: string;
    customIcon: string;
    description: string;
    deviceIds: string[];
    extendedCaption: string;
    icon: string;
    id: string;
    interval: string;
    level: string;
    objectTrackId: string;
    objectTypeId: string;
    originPeerId: string;
    ruleId: string;
    serverId: string;
    sourceName: string;
    state: string;
    timestamp: string;
    tooltip: string;
    type: string;
    url: string;
    users: {
      all: boolean;
      ids: string[];
    };
  };
  aggregatedInfo: {
    total: number;
    firstEventsData: any[];
    lastEventsData: any[];
  };
  ruleId: string;
  flags: string;
  systemId?: string;
}

// Helper functions
const formatRelativeTime = (timestampUsec: string): string => {
  if (!timestampUsec) return "";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return "";

  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return `${Math.floor(diff / 604800000)}w ago`;
};

const getEventTypeLabel = (eventType: string): string => {
  const labels: Record<string, string> = {
    cameraMotionEvent: "Motion",
    cameraDisconnectEvent: "Offline",
    storageFailureEvent: "Storage",
    networkIssueEvent: "Network",
    serverFailureEvent: "Server",
    serverStartEvent: "Server On",
    licenseIssueEvent: "License",
    systemHealthEvent: "Health",
    serverConflictEvent: "Server Conflict",
  };
  return labels[eventType] || eventType.replace("Event", "");
};

const getEventIcon = (iconName: string, eventType: string) => {
  const iconClass = "h-3.5 w-3.5";

  // Use icon hint from actionData if available, otherwise fallback to eventType
  const searchStr = (iconName || eventType || "").toLowerCase();

  if (searchStr.includes("motion")) return <Zap className={iconClass} />;
  if (searchStr.includes("camera")) return <Camera className={iconClass} />;
  if (searchStr.includes("disconnect") || searchStr.includes("failure") || searchStr.includes("offline")) {
    if (searchStr.includes("server")) return <Server className={iconClass} />;
    return <WifiOff className={iconClass} />;
  }
  if (searchStr.includes("server")) return <Server className={iconClass} />;
  if (searchStr.includes("storage")) return <HardDrive className={iconClass} />;
  if (searchStr.includes("network")) return <Network className={iconClass} />;
  if (searchStr.includes("license")) return <Shield className={iconClass} />;
  if (searchStr.includes("health")) return <Activity className={iconClass} />;
  if (searchStr.includes("conflict")) return <AlertTriangle className={iconClass} />;
  if (searchStr.includes("start")) return <Wifi className={iconClass} />;

  return <Bell className={iconClass} />;
};

const getLevelConfig = (level: string) => {
  const normalizedLevel = level?.toLowerCase();

  if (normalizedLevel === "critical" || normalizedLevel === "error") {
    return {
      bgClass: "bg-red-50 dark:bg-red-950/30",
      borderClass: "border-red-200 dark:border-red-800",
      textClass: "text-red-600",
      icon: <XCircle className="h-4 w-4 text-red-500" />,
    };
  }

  if (normalizedLevel === "warning") {
    return {
      bgClass: "bg-amber-50 dark:bg-amber-950/30",
      borderClass: "border-amber-200 dark:border-amber-800",
      textClass: "text-amber-600",
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    };
  }

  return {
    bgClass: "bg-blue-50 dark:bg-blue-950/30",
    borderClass: "border-blue-200 dark:border-blue-800",
    textClass: "text-blue-600",
    icon: <Info className="h-4 w-4 text-blue-500" />,
  };
};

export default function AlarmConsoleWidget({ systemId: propSystemId }: { systemId?: string }) {
  const router = useRouter();

  // 1. Define Fetchers
  const fetchLocalAlarms = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    if (!localUserStr) return null;

    try {
      const localUser = JSON.parse(localUserStr);
      const sid = Cookies.get("nx_system_id") || localUser.serverId || "local";

      // Use local proxy with specific 'this' server endpoint
      const response = await fetch("/nx/rest/v4/events/log", {
        headers: {
          "x-runtime-guid": localUser.token,
          "Accept": "application/json"
        }
      });

      if (!response.ok) return null;
      const data = await response.json();
      const items = Array.isArray(data) ? data : [];

      return {
        systemId: sid,
        systemName: "Local Server",
        items,
        stateOfHealth: "online"
      };
    } catch (e) {
      console.error("[AlarmWidget] Local fetch failed:", e);
      return null;
    }
  }, []);

  const fetchCloudAlarmsForSystem = useCallback(async (system: { id: string, name: string }) => {
    try {
      const response = await fetch(`/api/cloud/events?systemId=${encodeURIComponent(system.id)}`, {
        headers: {
          Accept: "application/json",
          ...getElectronHeaders(),
        },
      });

      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`[AlarmWidget] Error fetching alarms from ${system.name}:`, e);
      return [];
    }
  }, []);

  // 2. Use Inventory sync hook
  const {
    dataBySystem,
    loading,
    error,
    refetch
  } = useInventorySync<EventLog>(
    fetchLocalAlarms,
    fetchCloudAlarmsForSystem
  );

  // 3. Consolidated events list
  const events = useMemo(() => {
    return dataBySystem
      .flatMap(sys => sys.items.map(item => ({ ...item, systemId: sys.systemId })))
      .sort((a, b) => {
        // Use actionData.timestamp (usec) for sorting
        const timeA = parseInt(a.actionData?.timestamp || "0");
        const timeB = parseInt(b.actionData?.timestamp || "0");
        return timeB - timeA;
      });
  }, [dataBySystem]);

  // Stats
  const stats = useMemo(() => {
    const errorCount = events.filter((e) => {
      const level = e.actionData?.level?.toLowerCase();
      return level === "error" || level === "critical";
    }).length;

    const warningCount = events.filter((e) => e.actionData?.level?.toLowerCase() === "warning").length;

    const infoCount = events.filter((e) => {
      const level = e.actionData?.level?.toLowerCase();
      return level !== "error" && level !== "critical" && level !== "warning";
    }).length;

    return { error: errorCount, warning: warningCount, info: infoCount, total: events.length };
  }, [events]);

  const handleRefresh = () => {
    refetch();
  };

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading alarms...</span>
      </div>
    );
  }

  if (error && events.length === 0) {
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
          <div className="p-1.5 sm:p-2 bg-orange-50 dark:bg-orange-950/30 rounded-lg shrink-0">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base block truncate">Alarm Console</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw className={cn("w-4 h-4 text-gray-500", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 dark:bg-red-950 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-red-600">{stats.error}</div>
          <div className="text-[10px] text-red-500">Error</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-amber-600">{stats.warning}</div>
          <div className="text-[10px] text-amber-500">Warning</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.info}</div>
          <div className="text-[10px] text-blue-500">Info</div>
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 custom-scrollbar pr-1">
        {events.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">No alarms</div>
        ) : (
          events.slice(0, 5).map((event, index) => {
            const level = event.actionData?.level || "info";
            const levelConfig = getLevelConfig(level);
            const eventType = event.eventData?.type || "unknown";
            const timestamp = event.actionData?.timestamp || event.eventData?.timestamp;

            return (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg border text-xs",
                  levelConfig.bgClass,
                  levelConfig.borderClass,
                )}
              >
                <div className="shrink-0 mt-0.5">{levelConfig.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge variant="outline" className="h-5 gap-1 text-[10px] px-1.5">
                      {getEventIcon(event.actionData?.icon, eventType)}
                      {getEventTypeLabel(eventType)}
                    </Badge>
                    {event.aggregatedInfo?.total > 1 && (
                      <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
                        x{event.aggregatedInfo.total}
                      </Badge>
                    )}
                  </div>
                  <p className="font-medium truncate text-gray-800 dark:text-gray-200">
                    {event.actionData?.caption || event.actionData?.sourceName || "Event"}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mb-0.5">
                    {event.actionData?.description}
                  </p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(timestamp)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{new Date(parseInt(timestamp) / 1000).toLocaleString()}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            );
          })
        )}
        {events.length > 5 && (
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[10px] h-8 text-muted-foreground hover:text-orange-600 transition-colors"
              onClick={() => router.push("/?section=alarms")}
            >
              View More (+{events.length - 5})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
