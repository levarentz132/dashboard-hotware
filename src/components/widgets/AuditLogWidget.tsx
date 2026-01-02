"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  AlertCircle,
  User,
  Clock,
  Activity,
  Monitor,
  Settings,
  Shield,
  LogIn,
  Server,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CLOUD_CONFIG } from "@/lib/config";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

interface AuthSession {
  id: string;
  userName: string;
  userHost: string;
  userAgent: string;
}

interface AuditLogEntry {
  createdTimeSec: number;
  rangeStartSec: number;
  rangeEndSec: number;
  eventType: string;
  resources: string[];
  params: string;
  authSession: AuthSession;
}

// Event type config
const EVENT_TYPE_INFO: Record<string, { label: string; color: string; icon: string }> = {
  AR_Login: { label: "Login", color: "bg-green-100 text-green-800 border-green-200", icon: "login" },
  AR_Logout: { label: "Logout", color: "bg-gray-100 text-gray-800 border-gray-200", icon: "logout" },
  AR_CameraInsert: { label: "Camera +", color: "bg-blue-100 text-blue-800 border-blue-200", icon: "camera" },
  AR_CameraUpdate: { label: "Camera ~", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: "camera" },
  AR_CameraRemove: { label: "Camera -", color: "bg-red-100 text-red-800 border-red-200", icon: "camera" },
  AR_ServerUpdate: { label: "Server ~", color: "bg-purple-100 text-purple-800 border-purple-200", icon: "server" },
  AR_UserUpdate: { label: "User ~", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: "user" },
  AR_UserInsert: { label: "User +", color: "bg-teal-100 text-teal-800 border-teal-200", icon: "user" },
  AR_UserRemove: { label: "User -", color: "bg-orange-100 text-orange-800 border-orange-200", icon: "user" },
  AR_SettingsChange: { label: "Settings", color: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: "settings" },
  AR_MitmAttack: { label: "Security!", color: "bg-red-200 text-red-900 border-red-300", icon: "shield" },
  AR_StorageInsert: {
    label: "Storage +",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: "storage",
  },
  AR_StorageUpdate: { label: "Storage ~", color: "bg-lime-100 text-lime-800 border-lime-200", icon: "storage" },
  AR_StorageRemove: { label: "Storage -", color: "bg-rose-100 text-rose-800 border-rose-200", icon: "storage" },
};

// Helper functions
const formatRelativeTime = (timestampSec: number): string => {
  if (!timestampSec) return "";
  const now = Date.now();
  const diff = now - timestampSec * 1000;

  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}h lalu`;
  return `${Math.floor(diff / 604800000)}mg lalu`;
};

const getEventInfo = (eventType: string) => {
  return (
    EVENT_TYPE_INFO[eventType] || {
      label: eventType.replace("AR_", "").substring(0, 10),
      color: "bg-gray-100 text-gray-800 border-gray-200",
      icon: "activity",
    }
  );
};

const getEventIcon = (iconType: string, className = "h-3.5 w-3.5") => {
  switch (iconType) {
    case "login":
    case "logout":
      return <LogIn className={className} />;
    case "camera":
      return <Monitor className={className} />;
    case "server":
      return <Server className={className} />;
    case "user":
      return <User className={className} />;
    case "settings":
      return <Settings className={className} />;
    case "shield":
      return <Shield className={className} />;
    default:
      return <Activity className={className} />;
  }
};

export default function AuditLogWidget() {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(null);

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
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

  // Fetch audit logs
  const fetchAuditLogs = useCallback(
    async (system: CloudSystem, retry = false) => {
      if (!system || system.stateOfHealth !== "online") return;

      try {
        // Get logs from last 7 days
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        const fromDateFormatted = fromDate.toISOString();

        const response = await fetch(
          `/api/cloud/audit-log?systemId=${encodeURIComponent(system.id)}&from=${encodeURIComponent(
            fromDateFormatted
          )}`,
          {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );

        if (response.status === 401 && !retry) {
          const success = await attemptAutoLogin(system.id);
          if (success) {
            return fetchAuditLogs(system, true);
          }
          setError("Login required");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch");
        }

        const data = await response.json();
        const logs = data.reply || data;
        const sortedLogs = Array.isArray(logs)
          ? logs.sort((a: AuditLogEntry, b: AuditLogEntry) => b.createdTimeSec - a.createdTimeSec)
          : [];

        setAuditLogs(sortedLogs);
        setError(null);
      } catch {
        setError("Failed to fetch audit logs");
      }
    },
    [attemptAutoLogin]
  );

  // Load data when system is selected
  const loadData = useCallback(
    async (system: CloudSystem) => {
      if (!system || system.stateOfHealth !== "online") return;

      setLoading(true);
      setError(null);
      await fetchAuditLogs(system);
      setLoading(false);
    },
    [fetchAuditLogs]
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
    const loginCount = auditLogs.filter((l) => l.eventType === "AR_Login").length;
    const changeCount = auditLogs.filter((l) =>
      ["AR_CameraUpdate", "AR_ServerUpdate", "AR_UserUpdate", "AR_SettingsChange", "AR_StorageUpdate"].includes(
        l.eventType
      )
    ).length;
    const securityCount = auditLogs.filter((l) => l.eventType === "AR_MitmAttack").length;
    return { login: loginCount, changes: changeCount, security: securityCount, total: auditLogs.length };
  }, [auditLogs]);

  const handleRefresh = () => {
    if (selectedSystem) {
      loadData(selectedSystem);
    } else {
      fetchCloudSystems();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading audit logs...</span>
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
    <div className="p-2 space-y-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          <span className="font-medium text-sm">Audit Log</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-7 w-7 p-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-green-600">{stats.login}</div>
          <div className="text-[10px] text-green-500">Logins</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.changes}</div>
          <div className="text-[10px] text-blue-500">Changes</div>
        </div>
        <div className="bg-red-50 dark:bg-red-950 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-red-600">{stats.security}</div>
          <div className="text-[10px] text-red-500">Security</div>
        </div>
      </div>

      {/* Audit Log List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {auditLogs.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">No audit logs</div>
        ) : (
          auditLogs.slice(0, 6).map((log, index) => {
            const eventInfo = getEventInfo(log.eventType);
            const timestamp = log.createdTimeSec;

            return (
              <div
                key={`${log.createdTimeSec}-${index}`}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg border text-xs",
                  "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                )}
              >
                <div className="shrink-0 mt-0.5">{getEventIcon(eventInfo.icon, "h-4 w-4 text-gray-500")}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge variant="outline" className={cn("h-5 text-[10px] px-1.5", eventInfo.color)}>
                      {eventInfo.label}
                    </Badge>
                  </div>
                  <p className="font-medium truncate text-gray-800 dark:text-gray-200">
                    {log.authSession?.userName || "System"}
                  </p>
                  {log.authSession?.userHost && (
                    <p className="text-[10px] text-muted-foreground truncate">{log.authSession.userHost}</p>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(timestamp)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{new Date(timestamp * 1000).toLocaleString()}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            );
          })
        )}
        {auditLogs.length > 6 && (
          <p className="text-[10px] text-muted-foreground text-center py-1">+{auditLogs.length - 6} more logs</p>
        )}
      </div>
    </div>
  );
}
