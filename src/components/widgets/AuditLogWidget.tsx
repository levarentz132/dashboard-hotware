"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";
import { CloudLoginDialog } from "@/components/cloud/CloudLoginDialog";

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
  AR_CameraInsert: { label: "Camera Added", color: "bg-blue-100 text-blue-800 border-blue-200", icon: "camera" },
  AR_CameraUpdate: {
    label: "Camera Updated",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: "camera",
  },
  AR_CameraRemove: { label: "Camera Removed", color: "bg-red-100 text-red-800 border-red-200", icon: "camera" },
  AR_ServerUpdate: {
    label: "Server Updated",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    icon: "server",
  },
  AR_UserUpdate: { label: "User Updated", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: "user" },
  AR_UserInsert: { label: "User Added", color: "bg-teal-100 text-teal-800 border-teal-200", icon: "user" },
  AR_UserRemove: { label: "User Removed", color: "bg-orange-100 text-orange-800 border-orange-200", icon: "user" },
  AR_SettingsChange: { label: "Settings", color: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: "settings" },
  AR_MitmAttack: { label: "Security!", color: "bg-red-200 text-red-900 border-red-300", icon: "shield" },
  AR_StorageInsert: {
    label: "Storage Added",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: "storage",
  },
  AR_StorageUpdate: { label: "Storage Updated", color: "bg-lime-100 text-lime-800 border-lime-200", icon: "storage" },
  AR_StorageRemove: { label: "Storage Removed", color: "bg-rose-100 text-rose-800 border-rose-200", icon: "storage" },
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

export default function AuditLogWidget({ systemId }: { systemId?: string }) {
  const router = useRouter();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const autoLoginBlockedSystemsRef = useRef<Set<string>>(new Set());
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});

  // Fetch devices for name mapping
  const fetchDevices = useCallback(async (targetSystemId: string) => {
    try {
      const response = await fetch(`/api/cloud/devices?systemId=${encodeURIComponent(targetSystemId)}`);
      if (response.ok) {
        const devices = await response.json();
        const map: Record<string, string> = {};
        devices.forEach((device: any) => {
          map[device.id] = device.name;
          map[`{${device.id}}`] = device.name;
        });
        setDeviceMap(map);
      }
    } catch (err) {
      console.error("Error fetching devices:", err);
    }
  }, []);

  const getResourceName = (resourceId: string): string => {
    return deviceMap[resourceId] || resourceId;
  };

  // Auto-login (disabled - using Dual-Login flow)
  const attemptAutoLogin = useCallback(async (targetSystemId: string) => {
    return false;
  }, []);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(
    async (targetSystemId: string, retry = false) => {
      try {
        // Get logs from last 7 days
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        const fromDateFormatted = fromDate.toISOString();

        const response = await fetch(
          `/api/cloud/audit-log?systemId=${encodeURIComponent(targetSystemId)}&from=${encodeURIComponent(
            fromDateFormatted,
          )}`,
          {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
          },
        );

        if (response.status === 401 && !retry) {
          const hasAutoLoginCreds = false; // Disabled - using Dual-Login flow
          const autoLoginBlocked = autoLoginBlockedSystemsRef.current.has(targetSystemId);

          if (hasAutoLoginCreds && !autoLoginBlocked) {
            const success = await attemptAutoLogin(targetSystemId);
            if (success) {
              return fetchAuditLogs(targetSystemId, true);
            }
            // Mark blocked to avoid repeated loops on retry
            autoLoginBlockedSystemsRef.current.add(targetSystemId);
            setError("Cloud login failed. Please login manually.");
            return;
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
    [attemptAutoLogin],
  );

  // Load data
  const loadData = useCallback(
    async (targetSystemId: string) => {
      setLoading(true);
      setError(null);
      await Promise.all([fetchAuditLogs(targetSystemId), fetchDevices(targetSystemId)]);
      setLoading(false);
    },
    [fetchAuditLogs, fetchDevices],
  );

  useEffect(() => {
    if (systemId) {
      loadData(systemId);
    } else {
      setLoading(false);
      setAuditLogs([]);
    }
  }, [systemId, loadData]);

  // Stats
  const stats = useMemo(() => {
    const loginCount = auditLogs.filter((l) => l.eventType === "AR_Login").length;
    const changeCount = auditLogs.filter((l) =>
      ["AR_CameraUpdate", "AR_ServerUpdate", "AR_UserUpdate", "AR_SettingsChange", "AR_StorageUpdate"].includes(
        l.eventType,
      ),
    ).length;
    const securityCount = auditLogs.filter((l) => l.eventType === "AR_MitmAttack").length;
    const userCount = new Set(auditLogs.map((l) => l.authSession?.userName).filter(Boolean)).size;
    return {
      login: loginCount,
      changes: changeCount,
      security: securityCount,
      total: auditLogs.length,
      users: userCount,
    };
  }, [auditLogs]);

  const handleRefresh = () => {
    if (systemId) {
      loadData(systemId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading user logs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-sm text-red-500">{error}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-1" /> Retry
            </Button>
            {systemId && (
              <Button size="sm" onClick={() => setShowLoginDialog(true)}>
                <LogIn className="w-4 h-4 mr-1" /> Login
              </Button>
            )}
          </div>
        </div>
        {systemId && (
          <CloudLoginDialog
            open={showLoginDialog}
            onOpenChange={setShowLoginDialog}
            systemId={systemId}
            systemName={systemId} // We don't have name here easily, systemId is okay for dialog
            onLoginSuccess={() => {
              setError(null);
              autoLoginBlockedSystemsRef.current.delete(systemId);
              handleRefresh();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg shrink-0">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base block truncate">
              User Activity Log
            </span>
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
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/40 dark:to-green-900/20 rounded-xl p-2.5 border border-green-100 dark:border-green-900/30 text-center">
          <div className="text-xl font-bold text-green-600 dark:text-green-400">{stats.login}</div>
          <div className="text-[9px] font-medium text-green-600/70 uppercase">Logins</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 rounded-xl p-2.5 border border-blue-100 dark:border-blue-900/30 text-center">
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.changes}</div>
          <div className="text-[9px] font-medium text-blue-600/70 uppercase">Changes</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/40 dark:to-orange-900/20 rounded-xl p-2.5 border border-orange-100 dark:border-orange-900/30 text-center">
          <div className="text-xl font-bold text-orange-600 dark:text-orange-400">{stats.users}</div>
          <div className="text-[9px] font-medium text-orange-600/70 uppercase">Users</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/20 rounded-xl p-2.5 border border-red-100 dark:border-red-900/30 text-center">
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{stats.security}</div>
          <div className="text-[9px] font-medium text-red-600/70 uppercase">Alerts</div>
        </div>
      </div>

      {/* Audit Log List */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 custom-scrollbar pr-1">
        {auditLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
            <Activity className="h-8 w-8 mb-2" />
            <p className="text-xs">No user logs available</p>
          </div>
        ) : (
          auditLogs.slice(0, 10).map((log, index) => {
            const eventInfo = getEventInfo(log.eventType);
            const timestamp = log.createdTimeSec;

            return (
              <div
                key={`${log.createdTimeSec}-${index}`}
                className={cn(
                  "group relative flex items-start gap-2 p-2 rounded-lg border transition-all duration-200",
                  "bg-gray-50/80 dark:bg-gray-800/40 border-gray-200/60 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-900",
                  "hover:shadow-sm hover:bg-white dark:hover:bg-gray-800",
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-transform group-hover:scale-105",
                    eventInfo.color.split(" ")[0].replace("bg-", "bg-opacity-20 bg-"),
                  )}
                >
                  {getEventIcon(eventInfo.icon, cn("h-3.5 w-3.5", eventInfo.color.split(" ")[1]))}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {log.authSession?.userName || "System"}
                    </p>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
                            {formatRelativeTime(timestamp)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{new Date(timestamp * 1000).toLocaleString()}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Badge
                      variant="outline"
                      className={cn("h-3.5 text-[8px] px-1 font-medium border-opacity-50", eventInfo.color)}
                    >
                      {eventInfo.label}
                    </Badge>
                    {log.authSession?.userHost && (
                      <span className="text-[9px] text-muted-foreground/70 truncate flex items-center gap-1">
                        <Monitor className="h-2 w-2" />
                        {log.authSession.userHost === "::1" ? "Localhost" : log.authSession.userHost}
                      </span>
                    )}
                  </div>

                  {log.resources && log.resources.length > 0 && (
                    <div className="bg-white/40 dark:bg-gray-900/40 rounded p-1 mt-0.5 border border-black/5 dark:border-white/5">
                      <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-1 italic">
                        {log.resources.map((r) => getResourceName(r)).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {auditLogs.length > 10 && (
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[10px] h-8 text-muted-foreground hover:text-blue-600 transition-colors"
              onClick={() => router.push("/?section=audits")}
            >
              View More (+{auditLogs.length - 10})
            </Button>
          </div>
        )}
      </div>

      {systemId && (
        <CloudLoginDialog
          open={showLoginDialog}
          onOpenChange={setShowLoginDialog}
          systemId={systemId}
          systemName={systemId}
          onLoginSuccess={() => {
            setError(null);
            autoLoginBlockedSystemsRef.current.delete(systemId);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
