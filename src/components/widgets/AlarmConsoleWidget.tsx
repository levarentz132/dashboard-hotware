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
import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

interface EventLog {
  actionType: string;
  eventParams: {
    eventType: string;
    eventTimestampUsec: string;
    eventResourceId: string;
    resourceName: string;
    caption: string;
    description: string;
    metadata: {
      level: string;
    };
  };
  aggregationCount: number;
}

// Helper functions
const formatRelativeTime = (timestampUsec: string): string => {
  if (!timestampUsec) return "";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return "";

  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}h lalu`;
  return `${Math.floor(diff / 604800000)}mg lalu`;
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
    serverConflictEvent: "Conflict",
  };
  return labels[eventType] || eventType.replace("Event", "");
};

const getEventIcon = (eventType: string) => {
  const iconClass = "h-3.5 w-3.5";
  if (eventType.includes("Motion") || eventType.includes("motion")) return <Zap className={iconClass} />;
  if (eventType.includes("camera") || eventType.includes("Camera")) return <Camera className={iconClass} />;
  if (eventType.includes("Disconnect") || eventType.includes("disconnect")) return <WifiOff className={iconClass} />;
  if (eventType.includes("server") || eventType.includes("Server")) return <Server className={iconClass} />;
  if (eventType.includes("storage") || eventType.includes("Storage")) return <HardDrive className={iconClass} />;
  if (eventType.includes("network") || eventType.includes("Network")) return <Network className={iconClass} />;
  if (eventType.includes("license") || eventType.includes("License")) return <Shield className={iconClass} />;
  if (eventType.includes("health") || eventType.includes("Health")) return <Activity className={iconClass} />;
  if (eventType.includes("Conflict") || eventType.includes("conflict")) return <AlertTriangle className={iconClass} />;
  if (eventType.includes("Start") || eventType.includes("start")) return <Wifi className={iconClass} />;
  return <Bell className={iconClass} />;
};

const getLevelConfig = (level: string) => {
  switch (level?.toLowerCase()) {
    case "error":
      return {
        bgClass: "bg-red-50 dark:bg-red-950/30",
        borderClass: "border-red-200 dark:border-red-800",
        textClass: "text-red-600",
        icon: <XCircle className="h-4 w-4 text-red-500" />,
      };
    case "warning":
      return {
        bgClass: "bg-amber-50 dark:bg-amber-950/30",
        borderClass: "border-amber-200 dark:border-amber-800",
        textClass: "text-amber-600",
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      };
    default:
      return {
        bgClass: "bg-blue-50 dark:bg-blue-950/30",
        borderClass: "border-blue-200 dark:border-blue-800",
        textClass: "text-blue-600",
        icon: <Info className="h-4 w-4 text-blue-500" />,
      };
  }
};

export default function AlarmConsoleWidget() {
  const router = useRouter();
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(null);
  const [serverId, setServerId] = useState<string | null>(null);

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: getCloudAuthHeader(),
        },
      });

      if (!response.ok) {
        setError("Failed to connect");
        setLoading(false);
        return;
      }

      const data = await response.json();
      const systems: CloudSystem[] = data.systems || [];

      // Sort: owner first, then online
      systems.sort((a, b) => {
        if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
        if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
        if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
        if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
        return 0;
      });

      const firstOnline = systems.find((s) => s.stateOfHealth === "online");
      if (firstOnline) {
        setSelectedSystem(firstOnline);
      } else {
        setError("No system online");
        setLoading(false);
      }
    } catch {
      setError("Connection failed");
      setLoading(false);
    }
  }, []);

  // Auto-login
  const attemptAutoLogin = useCallback(async (systemId: string) => {
    if (!CLOUD_CONFIG.username || !CLOUD_CONFIG.password) return false;

    try {
      const response = await fetch("/api/cloud/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId,
          username: CLOUD_CONFIG.username,
          password: CLOUD_CONFIG.password,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Fetch servers for a system
  const fetchServers = useCallback(
    async (systemId: string, retry = false): Promise<string | null> => {
      try {
        const response = await fetch(`/api/cloud/servers?systemId=${encodeURIComponent(systemId)}`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401 && !retry) {
          // Try auto-login
          const success = await attemptAutoLogin(systemId);
          if (success) {
            return fetchServers(systemId, true);
          }
          return null;
        }

        if (!response.ok) return null;

        const servers = await response.json();
        if (Array.isArray(servers) && servers.length > 0) {
          return servers[0].id;
        }
        return null;
      } catch {
        return null;
      }
    },
    [attemptAutoLogin],
  );

  // Fetch events
  const fetchEvents = useCallback(
    async (systemId: string, srvId: string, retry = false) => {
      try {
        const params = new URLSearchParams({
          systemId: systemId,
          serverId: srvId,
        });

        const response = await fetch(`/api/cloud/events?${params.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401 && !retry) {
          const success = await attemptAutoLogin(systemId);
          if (success) {
            return fetchEvents(systemId, srvId, true);
          }
          setError("Login required");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch");
        }

        const data = await response.json();
        const sortedEvents = Array.isArray(data)
          ? data.sort((a: EventLog, b: EventLog) => {
            const timeA = parseInt(a.eventParams?.eventTimestampUsec || "0");
            const timeB = parseInt(b.eventParams?.eventTimestampUsec || "0");
            return timeB - timeA;
          })
          : [];

        setEvents(sortedEvents);
        setError(null);
      } catch {
        setError("Failed to fetch alarms");
      }
    },
    [attemptAutoLogin],
  );

  // Load data when system is selected
  const loadData = useCallback(
    async (system: CloudSystem) => {
      if (!system || system.stateOfHealth !== "online") return;

      setLoading(true);
      setError(null);

      // Get server ID first
      const srvId = await fetchServers(system.id);
      if (!srvId) {
        setError("No server found");
        setLoading(false);
        return;
      }

      setServerId(srvId);
      await fetchEvents(system.id, srvId);
      setLoading(false);
    },
    [fetchServers, fetchEvents],
  );

  useEffect(() => {
    fetchCloudSystems();
  }, [fetchCloudSystems]);

  useEffect(() => {
    if (selectedSystem) {
      loadData(selectedSystem);
    }
  }, [selectedSystem, loadData]);

  // Stats
  const stats = useMemo(() => {
    const errorCount = events.filter((e) => e.eventParams?.metadata?.level === "error").length;
    const warningCount = events.filter((e) => e.eventParams?.metadata?.level === "warning").length;
    const infoCount = events.filter(
      (e) => e.eventParams?.metadata?.level !== "error" && e.eventParams?.metadata?.level !== "warning",
    ).length;
    return { error: errorCount, warning: warningCount, info: infoCount, total: events.length };
  }, [events]);

  const handleRefresh = () => {
    if (selectedSystem && serverId) {
      setLoading(true);
      fetchEvents(selectedSystem.id, serverId).finally(() => setLoading(false));
    } else if (selectedSystem) {
      loadData(selectedSystem);
    } else {
      fetchCloudSystems();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading alarms...</span>
      </div>
    );
  }

  if (error) {
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
            const level = event.eventParams?.metadata?.level || "info";
            const levelConfig = getLevelConfig(level);
            const eventType = event.eventParams?.eventType || "unknown";
            const timestamp = event.eventParams?.eventTimestampUsec;

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
                      {getEventIcon(eventType)}
                      {getEventTypeLabel(eventType)}
                    </Badge>
                    {event.aggregationCount > 1 && (
                      <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
                        x{event.aggregationCount}
                      </Badge>
                    )}
                  </div>
                  <p className="font-medium truncate text-gray-800 dark:text-gray-200">
                    {event.eventParams?.caption || event.eventParams?.resourceName || "Event"}
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
