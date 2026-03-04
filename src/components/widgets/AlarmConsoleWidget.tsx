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
  CheckCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getElectronHeaders } from "@/lib/config";
import { useInventorySync } from "@/hooks/use-inventory-sync";
import Cookies from "js-cookie";
import { normalizeNxEvents } from "@/lib/nx-normalization";


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

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatTimestamp = (timestampUsec: string): string => {
  if (!timestampUsec) return "N/A";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return timestampUsec;
  const date = new Date(ms);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatRelativeTime = (timestampUsec: string): string => {
  if (!timestampUsec) return "";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return "";

  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
  return formatTimestamp(timestampUsec);
};

const getEventTypeLabel = (eventType: string, caption?: string): string => {
  if (eventType === "userDefinedEvent" && caption) return caption;
  const labels: Record<string, string> = {
    cameraMotionEvent: "Motion",
    cameraDisconnectEvent: "Camera Disconnected",
    deviceDisconnected: "Camera Disconnected",
    storageFailureEvent: "Storage",
    networkIssueEvent: "Network",
    serverFailureEvent: "Server",
    serverStartEvent: "Server On",
    serverStarted: "Server On",
    licenseIssueEvent: "License",
    systemHealthEvent: "Health",
    serverConflictEvent: "Server Conflict",
  };
  return labels[eventType] || eventType.replace("Event", "");
};

const getLevelConfig = (level: string, eventType?: string, caption?: string) => {
  const normalizedLevel = level?.toLowerCase();
  const type = eventType?.toLowerCase() || "";
  const cap = caption?.toLowerCase() || "";

  const isPositive = type.includes("start") || type.includes("online") ||
    cap.includes("online") || cap.includes("started") ||
    type.includes("finished") || type.includes("complete") ||
    cap.includes("finished") || cap.includes("complete");

  if (normalizedLevel === "critical" || normalizedLevel === "error") {
    return {
      bgClass: "bg-red-50 dark:bg-red-950/30",
      borderClass: "border-red-200 dark:border-red-800",
      textClass: "text-red-600",
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
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

  if (isPositive) {
    return {
      bgClass: "bg-green-50 dark:bg-green-950/30",
      borderClass: "border-green-200 dark:border-green-800",
      textClass: "text-green-600",
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
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
  const [globalCameras, setGlobalCameras] = useState<any[]>([]);
  const [globalServers, setGlobalServers] = useState<any[]>([]);

  // Fetch global cameras fallback
  useEffect(() => {
    const fetchGlobalCameras = async () => {
      try {
        const response = await fetch("/api/device-monitor");
        if (response.ok) {
          const snapshot = await response.json();
          const allDevices = (snapshot.systems || []).flatMap((s: any) => s.devices || []);
          setGlobalCameras(allDevices);
        }
      } catch (e) {
        console.error("[AlarmWidget] Failed to fetch global cameras lookup:", e);
      }
    };
    fetchGlobalCameras();
  }, []);

  // Sync servers as well for full name resolution
  useEffect(() => {
    const fetchAllServers = async () => {
      try {
        const systems = await fetch("/api/cloud/systems").then(res => res.json()).then(d => d.systems || []);
        const allServers: any[] = [];

        await Promise.allSettled(
          systems.map(async (sys: any) => {
            const res = await fetch(`/api/nx/servers?systemId=${encodeURIComponent(sys.id)}`);
            if (res.ok) {
              const data = await res.json();
              allServers.push(...(Array.isArray(data) ? data : []));
            }
          })
        );
        setGlobalServers(allServers);
      } catch (e) {
        console.log("[AlarmWidget] Failed to fetch servers for lookup", e);
      }
    };
    fetchAllServers();
  }, []);

  const resourceNameMap = useMemo(() => {
    const map = new Map<string, { name: string; type: "camera" | "server" }>();
    const addToMap = (id: string | undefined, name: string, type: "camera" | "server") => {
      if (!id) return;
      const cleanId = id.toLowerCase().replace(/[{}]/g, "");
      map.set(cleanId, { name, type });
      map.set(id.toLowerCase(), { name, type });
    };

    globalCameras.forEach(camera => addToMap(camera.id, camera.name || "Camera", "camera"));
    globalServers.forEach(server => addToMap(server.id, server.name || "Server", "server"));
    return map;
  }, [globalCameras, globalServers]);

  const getResourceName = useCallback((id: string | undefined) => {
    if (!id) return null;
    const cleanId = id.toLowerCase().replace(/[{}]/g, "");
    return resourceNameMap.get(cleanId) || resourceNameMap.get(id.toLowerCase()) || null;
  }, [resourceNameMap]);

  // 1. Define Fetchers
  const fetchLocalAlarms = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    if (!localUserStr) return null;

    try {
      const localUser = JSON.parse(localUserStr);
      const sid = Cookies.get("nx_system_id") || localUser.serverId || "local";

      // 1. Try v4 endpoint first
      const response = await fetch("/nx/rest/v4/events/log", {
        headers: {
          "x-runtime-guid": localUser.token,
          "Accept": "application/json"
        }
      });

      let items: EventLog[] = [];

      if (response.ok) {
        const data = await response.json();
        const rawItems = Array.isArray(data) ? data : [];
        if (rawItems.length > 0) {
          items = normalizeNxEvents(rawItems);
        }
      }

      // 2. Fallback to v3 if v4 failed or returned no items
      if (items.length === 0) {
        console.log(`[AlarmWidget] v4 failed or empty, trying v3 fallback for local server`);
        const v3Response = await fetch("/nx/api/getEvents", {
          headers: {
            "x-runtime-guid": localUser.token,
            "Accept": "application/json"
          }
        });

        if (v3Response.ok) {
          const v3Data = await v3Response.json();
          const v3Events = v3Data.reply || [];
          items = normalizeNxEvents(v3Events);
        }
      }

      if (items.length === 0 && !response.ok) return null;

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
      return normalizeNxEvents(Array.isArray(data) ? data : []);
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
    const allEvents = dataBySystem
      .flatMap(sys => sys.items.map(item => {
        const type = item.eventData?.type;
        const originalLevel = item.actionData?.level?.toLowerCase() || "info";
        let effectiveLevel = originalLevel;

        // Custom Severity Rules
        if (type === "cameraDisconnectEvent") {
          const timestamp = parseInt(item.actionData?.timestamp || item.eventData?.timestamp || "0");
          const now = Date.now() * 1000;
          const ageHours = (now - timestamp) / (1000000 * 3600);
          effectiveLevel = ageHours > 24 ? "critical" : "info";
        } else if (type === "serverFailureEvent" || type === "serverFailure") {
          effectiveLevel = "critical";
        } else if (type === "serverConflictEvent" || type === "serverConflict" || type === "storageFailureEvent" || item.actionData?.caption?.toLowerCase().includes("low disk space")) {
          effectiveLevel = "warning";
        } else if (type === "anyEvent" || type === "systemHealthEvent") {
          // General system events should be Info unless specifically handled above
          effectiveLevel = originalLevel === "warning" ? "info" : originalLevel;
        }

        return { ...item, systemId: sys.systemId, effectiveLevel };
      }));

    // Deduplicate disconnections preferring EARLIEST timestamp
    const sortedTimeline = [...allEvents].sort((a, b) => {
      const timeA = parseInt(a.actionData?.timestamp || a.eventData?.timestamp || "0");
      const timeB = parseInt(b.actionData?.timestamp || b.eventData?.timestamp || "0");
      return timeA - timeB;
    });

    const recentDisconnections = new Map<string, number>();
    const processedEvents: any[] = [];

    sortedTimeline.forEach(event => {
      const type = event.eventData?.type || "unknown";
      const isDisconnection = type === "cameraDisconnectEvent" || type === "deviceDisconnected";

      if (isDisconnection) {
        const deviceId = event.actionData?.deviceIds?.[0];
        if (deviceId) {
          const timestamp = parseInt(event.actionData?.timestamp || event.eventData?.timestamp || "0");
          const lastTime = recentDisconnections.get(deviceId);
          if (lastTime !== undefined && (timestamp - lastTime) < 60000000) {
            return;
          }
          recentDisconnections.set(deviceId, timestamp);
        }
      }
      processedEvents.push(event);
    });

    const uniqueMap = new Map<string, any>();
    processedEvents.forEach(event => {
      const timestamp = event.actionData?.timestamp || event.eventData?.timestamp || "0";
      const type = event.eventData?.type || event.actionData?.type || "unknown";
      const serverId = event.eventData?.serverId || event.actionData?.serverId || "unknown";
      const key = `${timestamp}-${type}-${serverId}`;

      const existing = uniqueMap.get(key);
      if (!existing) {
        uniqueMap.set(key, event);
      } else {
        const existingInfoScore = (existing.actionData?.caption ? 2 : 0) + (existing.actionData?.description ? 1 : 0);
        const currentInfoScore = (event.actionData?.caption ? 2 : 0) + (event.actionData?.description ? 1 : 0);

        const priority: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };
        const existingPrio = priority[(existing as any).effectiveLevel || existing.actionData?.level?.toLowerCase() || "info"] ?? 4;
        const currentPrio = priority[(event as any).effectiveLevel || event.actionData?.level?.toLowerCase() || "info"] ?? 4;

        if (currentInfoScore > existingInfoScore) {
          uniqueMap.set(key, event);
        } else if (currentInfoScore === existingInfoScore && currentPrio < existingPrio) {
          uniqueMap.set(key, event);
        }
      }
    });

    const deduplicatedEvents = Array.from(uniqueMap.values());

    // Return newest first for display
    return deduplicatedEvents.sort((a, b) => {
      const timeA = parseInt(a.actionData?.timestamp || a.eventData?.timestamp || "0");
      const timeB = parseInt(b.actionData?.timestamp || b.eventData?.timestamp || "0");
      return timeB - timeA;
    });
  }, [dataBySystem]);

  // Stats
  const stats = useMemo(() => {
    const errorCount = events.filter((e) => {
      const level = (e as any).effectiveLevel || e.actionData?.level?.toLowerCase();
      return level === "error" || level === "critical";
    }).length;

    const warningCount = events.filter((e) => ((e as any).effectiveLevel || e.actionData?.level?.toLowerCase()) === "warning").length;

    const infoCount = events.filter((e) => {
      const level = (e as any).effectiveLevel || e.actionData?.level?.toLowerCase();
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
            const eventType = event.eventData?.type || "unknown";
            const level = (event as any).effectiveLevel || event.actionData?.level || "info";
            const caption = event.actionData?.caption || event.actionData?.sourceName || "Event";
            const levelConfig = getLevelConfig(level, eventType, caption);
            const timestamp = event.actionData?.timestamp || event.eventData?.timestamp;

            let displayCaption = caption;
            let description = event.actionData?.description;

            const deviceIds = event.actionData?.deviceIds || [];
            let deviceName = "Camera";
            if (deviceIds.length > 0) {
              const res = getResourceName(deviceIds[0]);
              if (res) deviceName = res.name;
            } else if (event.actionData?.sourceName) {
              deviceName = event.actionData.sourceName;
            }

            if (eventType === "cameraDisconnectEvent" || eventType === "deviceDisconnected" || (displayCaption && displayCaption.toLowerCase().includes("disconnected"))) {
              if (displayCaption) {
                displayCaption = displayCaption.replace(/deviceDisconnected/g, "Camera Disconnected");
                displayCaption = displayCaption.replace(/device disconnected/i, "Camera Disconnected");
                displayCaption = displayCaption.replace(/device/i, "Camera");
              }

              // If description is missing or generic, use the custom template
              const isDescriptionEmptyOrGeneric = !description ||
                description === "deviceDisconnected" ||
                description === "cameraDisconnectEvent" ||
                description === displayCaption;

              if (isDescriptionEmptyOrGeneric && (eventType === "cameraDisconnectEvent" || eventType === "deviceDisconnected")) {
                description = `Camera '${deviceName}' has lost connection to the server. Please verify the camera's network connection.`;

                if (!displayCaption || displayCaption === "Camera Disconnected") {
                  displayCaption = `${deviceName} Disconnected`;
                }
              }
            }

            const originPeer = getResourceName(event.actionData?.originPeerId);

            return (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg border text-xs transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
                  levelConfig.bgClass,
                  levelConfig.borderClass,
                )}
              >
                <div className="shrink-0 mt-0.5">{levelConfig.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold truncate text-gray-900 dark:text-gray-100 flex-1">
                      {displayCaption}
                    </p>
                    {event.aggregatedInfo?.total > 1 && (
                      <Badge variant="secondary" className="h-4 text-[9px] px-1 font-bold shrink-0">
                        x{event.aggregatedInfo.total}
                      </Badge>
                    )}
                  </div>

                  {description && (
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-1 mb-1">
                      {description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-gray-500">
                    {/* Device info if relevant */}
                    {deviceName && deviceName !== "Camera" && (
                      <span className="flex items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
                        <Camera className="h-2.5 w-2.5" />
                        {deviceName}
                      </span>
                    )}

                    {/* Origin Peer info */}
                    {originPeer && (
                      <span className="flex items-center gap-1">
                        <Server className="h-2.5 w-2.5" />
                        {originPeer.name}
                      </span>
                    )}

                    {/* Relative Time */}
                    <span className="flex items-center gap-1 opacity-80">
                      <Clock className="h-2.5 w-2.5" />
                      {formatRelativeTime(timestamp)}
                    </span>
                  </div>
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
