"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  AlertCircle,
  User,
  Clock,
  Server,
  Cloud,
  ChevronDown,
  Activity,
  Camera,
  Settings,
  Shield,
  LogIn,
  Search,
  Filter,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Separator } from "../ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { getElectronHeaders, API_CONFIG } from "@/lib/config";
import Cookies from "js-cookie";
import { useCloudSystems } from "@/hooks/use-async-data";

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

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

interface CloudDevice {
  id: string;
  name: string;
}

// Event type descriptions and icons
const EVENT_TYPE_INFO: Record<string, { label: string; color: string; icon: string }> = {
  AR_Login: { label: "User Login", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: "login" },
  AR_Logout: { label: "User Logout", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20", icon: "logout" },
  AR_CameraInsert: { label: "Camera Added", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", icon: "camera" },
  AR_CameraUpdate: { label: "Camera Updated", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: "camera" },
  AR_CameraRemove: { label: "Camera Removed", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", icon: "camera" },
  AR_ServerUpdate: { label: "Server Updated", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20", icon: "server" },
  AR_UserUpdate: { label: "User Updated", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20", icon: "user" },
  AR_UserInsert: { label: "User Added", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20", icon: "user" },
  AR_UserRemove: { label: "User Removed", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20", icon: "user" },
  AR_SystemNameChanged: { label: "System Name Changed", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20", icon: "settings" },
  AR_SettingsChange: { label: "Settings Changed", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20", icon: "settings" },
  AR_DatabaseRestore: { label: "Database Restored", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: "database" },
  AR_MitmAttack: { label: "Security Alert", color: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40", icon: "shield" },
  AR_StorageInsert: { label: "Storage Added", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: "storage" },
  AR_StorageUpdate: { label: "Storage Updated", color: "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20", icon: "storage" },
  AR_StorageRemove: { label: "Storage Removed", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", icon: "storage" },
};

export default function AuditLog() {
  // Helper: read cloud OAuth token from cookie and build headers for API proxy calls.
  // Sending the token as X-Electron-Cloud-Token is the most reliable path because
  // getDynamicConfig() on the server reads this header directly (path 1),
  // avoiding the fragile cookie-string regex fallback (path 2).
  const getCloudHeaders = useCallback((): Record<string, string> => {
    const cloudSessionStr = Cookies.get("nx_cloud_session");
    let cloudToken = "";
    if (cloudSessionStr) {
      try {
        const session = JSON.parse(cloudSessionStr);
        cloudToken = session.accessToken || "";
      } catch (e) { /* malformed cookie */ }
    }
    const headers = {
      ...getElectronHeaders(),
      ...(cloudToken ? { "X-Electron-Cloud-Token": cloudToken } : {}),
    };

    return headers;
  }, []);
  // Cloud systems state - Initialized with local system (Local-First)
  // Using custom location from cookies if available, otherwise defaults to 127.0.0.1:7001
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>(() => {
    const cookieIp = Cookies.get("nx_location_ip");
    const cookiePort = Cookies.get("nx_location_port") || "7001";
    const localId = cookieIp ? `${cookieIp}:${cookiePort}` : "127.0.0.1:7001";
    
    return [{
      id: localId,
      name: "Local System",
      stateOfHealth: "online",
      accessRole: "owner"
    }];
  });

  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(() => {
    const cookieIp = Cookies.get("nx_location_ip");
    const cookiePort = Cookies.get("nx_location_port") || "7001";
    const localId = cookieIp ? `${cookieIp}:${cookiePort}` : "127.0.0.1:7001";

    return {
      id: localId,
      name: "Local System",
      stateOfHealth: "online",
      accessRole: "owner"
    };
  });

  const { data: fetchedCloudSystems, loading: loadingSystems, refetch: refetchCloudSystems } =
    useCloudSystems();

  // Device name mapping
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEventType, setFilterEventType] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");

  const [date, setDate] = useState<DateRange | undefined>(undefined);

  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [displayCount, setDisplayCount] = useState(20);

  // No longer needed: Auth state removed as it is handled by the proxy
  // (requiresAuth, showLoginForm, etc.)

  useEffect(() => {
    if (fetchedCloudSystems.length === 0) return;

    let systems = [...fetchedCloudSystems];
    setCloudSystems((prev) => {
      const localEntry = prev.find((s) => s.name === "Local System") || prev[0];
      if (localEntry && !systems.find((s) => s.name === "Local System")) {
        systems.unshift(localEntry);
      }
      systems.sort((a, b) => {
        if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
        if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
        if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
        if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
        return 0;
      });
      return systems;
    });

    // Auto-select first online Cloud System if current selection is Local System or null
    const firstOnlineCloud = systems.find((s) => s.name !== "Local System" && s.stateOfHealth === "online") || systems.find((s) => s.stateOfHealth === "online");
    if (firstOnlineCloud) {
      setSelectedSystem((prev) => (prev?.name === "Local System" || !prev ? firstOnlineCloud : prev));
    }
  }, [fetchedCloudSystems]);

  // Fetch devices for name mapping
  const fetchDevices = useCallback(async (systemId: string) => {
    try {
      const response = await fetch(`/api/cloud/devices?systemId=${encodeURIComponent(systemId)}`, {
        credentials: "include",
        headers: getCloudHeaders(),
      });
      if (response.ok) {
        const devices: CloudDevice[] = await response.json();
        const map: Record<string, string> = {};
        devices.forEach((device) => {
          // Store both with and without braces
          map[device.id] = device.name;
          map[`{${device.id}}`] = device.name;
        });
        setDeviceMap(map);
      }
    } catch (err) {
      console.error("Error fetching devices:", err);
    }
  }, [getCloudHeaders]);

  // removed attemptAdminLogin and handleLogin logic

  // Fetch audit logs
  const fetchAuditLogs = useCallback(
    async (system: CloudSystem) => {
      if (!system || system.stateOfHealth !== "online") return;

      setLoading(true);
      setError(null);

      try {
        let queryParams = `systemId=${encodeURIComponent(system.id)}`;

        if (date?.from) {
          // Format dates
          // from: start of the selected from day
          const fromDateFormatted = new Date(date.from);
          fromDateFormatted.setHours(0, 0, 0, 0);

          // to: end of the selected to day, OR end of the from day if only from is selected
          const toDateTarget = date.to || date.from;
          const toDateFormatted = new Date(toDateTarget);
          toDateFormatted.setHours(23, 59, 59, 999);

          queryParams += `&from=${encodeURIComponent(fromDateFormatted.toISOString())}`;
          queryParams += `&to=${encodeURIComponent(toDateFormatted.toISOString())}`;
        } else {
          // No date selected, fetch most recent logs with a reasonable limit
          queryParams += `&limit=200`;
        }

        const response = await fetch(`/api/cloud/audit-log?${queryParams}`, {
          credentials: "include",
          headers: getCloudHeaders(),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const statusMsg =
            response.status === 401 || response.status === 403
              ? "Akses ditolak: Membutuhkan akun Administrator / Power User pada VMS"
              : errData.error || "Gagal mengambil user logs dari server VMS";
          throw new Error(statusMsg);
        }

        const data = await response.json();
        const logs = Array.isArray(data)
          ? data
          : Array.isArray(data?.reply)
          ? data.reply
          : Array.isArray(data?.result)
          ? data.result
          : Array.isArray(data?.records)
          ? data.records
          : Array.isArray(data?.auditLog)
          ? data.auditLog
          : [];

        if (!Array.isArray(logs) || (logs.length === 0 && data?.error)) {
          throw new Error(data?.error || "Gagal memproses data user logs dari server");
        }

        setAuditLogs(logs);
      } catch (err: any) {
        console.error("Error fetching audit logs:", err);
        setError(err.message || "Gagal mengambil user logs");
      } finally {
        setLoading(false);
      }
    },
    [date, getCloudHeaders],
  );

  // Fetch logs and devices when system changes
  useEffect(() => {
    if (selectedSystem) {
      fetchAuditLogs(selectedSystem);
      fetchDevices(selectedSystem.id);
    }
  }, [selectedSystem, fetchAuditLogs, fetchDevices]);

  // Get resource name from ID
  const getResourceName = (resourceId: string): string => {
    return deviceMap[resourceId] || resourceId;
  };

  // Format timestamp
  const formatTimestamp = (timestampSec: number): string => {
    if (!timestampSec) return "-";
    const date = new Date(timestampSec * 1000);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Get event info
  const getEventInfo = (eventType: string) => {
    return (
      EVENT_TYPE_INFO[eventType] || {
        label: eventType
          .replace("AR_", "")
          .replace(/([A-Z])/g, " $1")
          .trim(),
        color: "bg-gray-100 text-gray-800",
        icon: "activity",
      }
    );
  };

  // Get icon component
  const getEventIcon = (iconType: string) => {
    switch (iconType) {
      case "login":
        return <LogIn className="w-4 h-4" />;
      case "camera":
        return <Camera className="w-4 h-4" />;
      case "server":
        return <Server className="w-4 h-4" />;
      case "user":
        return <User className="w-4 h-4" />;
      case "settings":
        return <Settings className="w-4 h-4" />;
      case "shield":
        return <Shield className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  // Get unique event types for filter
  const uniqueEventTypes = Array.from(new Set(auditLogs.map((log) => log.eventType))).sort();

  // Get unique users for filter
  const uniqueUsers = Array.from(new Set(auditLogs.map((log) => log.authSession?.userName).filter(Boolean))).sort();

  // Filter logs
  const filteredLogs = auditLogs.filter((log) => {
    // Search filter
    const matchesSearch =
      !searchTerm ||
      log.eventType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.authSession?.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.authSession?.userHost?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resources?.some((r) => r.toLowerCase().includes(searchTerm.toLowerCase()));

    // Event type filter
    const matchesEventType = filterEventType === "all" || log.eventType === filterEventType;

    // User filter
    const matchesUser = filterUser === "all" || log.authSession?.userName === filterUser;

    return matchesSearch && matchesEventType && matchesUser;
  });

  // Sort by time descending
  const sortedLogs = [...filteredLogs].sort((a, b) => b.createdTimeSec - a.createdTimeSec);

  // Paginate
  const displayedLogs = sortedLogs.slice(0, displayCount);

  // Active filter count
  // Check if a specific date range is active
  const isDateChanged = !!date?.from;

  const activeFilterCount = [
    filterEventType !== "all",
    filterUser !== "all",
    isDateChanged
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    setFilterEventType("all");
    setFilterUser("all");
    setDate(undefined);
    setSearchTerm("");
  };

  const isCloudEmpty = cloudSystems.length === 0;

  return (
    <div className="space-y-6 select-none pb-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20 shadow-sm">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              User Logs
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Audit trails, user access events, and system configuration logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 justify-end">
          {cloudSystems.length > 0 && selectedSystem && (
            <Select
              value={selectedSystem.id}
              onValueChange={(sysId) => {
                const sys = cloudSystems.find((s) => s.id === sysId);
                if (sys) {
                  setSelectedSystem(sys);
                }
              }}
            >
              <SelectTrigger className="h-9 px-3.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
                <Cloud className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <SelectValue placeholder="Pilih System">{selectedSystem.name}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                {cloudSystems.map((sys) => (
                  <SelectItem key={sys.id} value={sys.id} className="text-xs cursor-pointer font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          sys.stateOfHealth === "online" ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      <span>{sys.name}</span>
                      {sys.accessRole && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 capitalize ml-1">
                          ({sys.accessRole})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Refresh Button on the far right */}
          <button
            onClick={() => {
              if (selectedSystem) {
                fetchAuditLogs(selectedSystem);
              } else {
                refetchCloudSystems();
              }
            }}
            disabled={loading || loadingSystems}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl disabled:opacity-50 text-xs font-semibold h-9 transition-all shadow-sm hover:shadow shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading || loadingSystems ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Cloud Systems Loading Skeleton */}
      {loadingSystems && isCloudEmpty && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      <>
        {/* Filters */}
        <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 select-none">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search events, users, resources..."
                  className="w-full pl-10 pr-10 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs select-text bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white h-10 transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 select-none"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <Popover open={showFilters} onOpenChange={setShowFilters}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`gap-2 flex-1 sm:flex-none select-none min-w-[110px] w-auto justify-between h-10 px-3.5 text-xs rounded-xl border-slate-200 dark:border-slate-700 ${
                        hasActiveFilters
                          ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold"
                          : "bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 shrink-0 text-slate-500" />
                        <span>Filter</span>
                        {hasActiveFilters && (
                          <Badge variant="secondary" className="h-4 w-4 p-0 flex items-center justify-center text-[10px] shrink-0 bg-blue-600 text-white border-0">
                            {activeFilterCount}
                          </Badge>
                        )}
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">Filter Audit Logs</h4>
                        {hasActiveFilters && (
                          <button
                            onClick={clearFilters}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      <Separator className="bg-slate-200/80 dark:bg-slate-800" />

                      <div className="space-y-3">
                        {/* Event Type Filter */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                            Event Type
                          </label>
                          <Select value={filterEventType} onValueChange={setFilterEventType}>
                            <SelectTrigger className="w-full h-9 text-xs rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <SelectValue placeholder="All Event Types" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                              <SelectItem value="all" className="text-xs">All Event Types</SelectItem>
                              {uniqueEventTypes.map((type) => (
                                <SelectItem key={type} value={type} className="text-xs">
                                  {getEventInfo(type).label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* User Filter */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                            User
                          </label>
                          <Select value={filterUser} onValueChange={setFilterUser}>
                            <SelectTrigger className="w-full h-9 text-xs rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <SelectValue placeholder="All Users" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                              <SelectItem value="all" className="text-xs">All Users</SelectItem>
                              {uniqueUsers.map((user) => (
                                <SelectItem key={user} value={user} className="text-xs">
                                  {user}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Date Range Filter */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                            Date Range
                          </label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal h-9 text-xs rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
                                  !date && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                                {date?.from ? (
                                  date.to ? (
                                    <>
                                      {format(date.from, "LLL dd, y")} -{" "}
                                      {format(date.to, "LLL dd, y")}
                                    </>
                                  ) : (
                                    format(date.from, "LLL dd, y")
                                  )
                                ) : (
                                  <span>Pick a date</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl" align="end">
                              <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={date?.from}
                                selected={date}
                                onSelect={setDate}
                                numberOfMonths={2}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <Button onClick={() => setShowFilters(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold h-9">
                        Apply Filters
                      </Button>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 text-center"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {hasActiveFilters && (
              <>
                <Separator className="my-2 bg-slate-200/80 dark:bg-slate-800" />
                <div className="flex flex-wrap gap-2 pt-1">
                  {filterEventType !== "all" && (
                    <Badge variant="secondary" className="flex items-center gap-1.5 py-1 px-2.5 text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      Type: {getEventInfo(filterEventType).label}
                      <X className="w-3 h-3 cursor-pointer hover:text-blue-900 dark:hover:text-blue-200" onClick={() => setFilterEventType("all")} />
                    </Badge>
                  )}
                  {filterUser !== "all" && (
                    <Badge variant="secondary" className="flex items-center gap-1.5 py-1 px-2.5 text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      User: {filterUser}
                      <X className="w-3 h-3 cursor-pointer hover:text-blue-900 dark:hover:text-blue-200" onClick={() => setFilterUser("all")} />
                    </Badge>
                  )}
                  {isDateChanged && date?.from && (
                    <Badge variant="secondary" className="flex items-center gap-1.5 py-1 px-2.5 text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      Date: {format(date.from, "LLL dd, y")}
                      {date.to ? ` - ${format(date.to, "LLL dd, y")}` : ""}
                      <X className="w-3 h-3 cursor-pointer hover:text-blue-900 dark:hover:text-blue-200" onClick={() => {
                        const today = new Date();
                        setDate({
                          from: today,
                          to: undefined
                        });
                      }} />
                    </Badge>
                  )}
                  <button onClick={clearFilters} className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2">Clear all</button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Events</span>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{filteredLogs.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">Active Users</span>
              <User className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{uniqueUsers.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">Login Events</span>
              <LogIn className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {filteredLogs.filter((l) => l.eventType === "AR_Login").length}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-purple-500 uppercase tracking-wider">Event Types</span>
              <Shield className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">{uniqueEventTypes.length}</div>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white dark:bg-slate-900/60 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading audit logs...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center p-12 text-rose-500">
              <AlertCircle className="w-6 h-6 mr-2" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          ) : !selectedSystem ? (
            <div className="flex items-center justify-center p-12 text-slate-400">
              <Activity className="w-6 h-6 mr-2" />
              <span className="text-sm font-medium">Select a system to view audit logs</span>
            </div>
          ) : displayedLogs.length === 0 ? (
            <div className="flex items-center justify-center p-12 text-slate-400">
              <Activity className="w-6 h-6 mr-2" />
              <span className="text-sm font-medium">No audit logs found</span>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Event
                      </th>
                      <th className="px-4 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Resources
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {displayedLogs.map((log, index) => {
                      const eventInfo = getEventInfo(log.eventType);
                      return (
                        <tr key={`${log.createdTimeSec}-${index}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center text-xs font-mono text-slate-600 dark:text-slate-300">
                              <Clock className="w-3.5 h-3.5 mr-2 text-slate-400 shrink-0" />
                              {formatTimestamp(log.createdTimeSec)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${eventInfo.color}`}
                            >
                              {getEventIcon(eventInfo.icon)}
                              <span>{eventInfo.label}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center text-xs">
                              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mr-2.5 shrink-0 text-slate-500">
                                <User className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white">{log.authSession?.userName || "System"}</span>
                                {log.authSession?.userHost && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {log.authSession.userHost === "::1" ? "Localhost" : log.authSession.userHost}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px] lg:max-w-xs truncate font-mono">
                              {log.resources && log.resources.length > 0
                                ? log.resources
                                    .slice(0, 2)
                                    .map((r) => getResourceName(r))
                                    .join(", ") + (log.resources.length > 2 ? ` +${log.resources.length - 2} more` : "")
                                : "-"}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-2.5 p-3">
                {displayedLogs.map((log, index) => {
                  const eventInfo = getEventInfo(log.eventType);
                  return (
                    <div
                      key={`${log.createdTimeSec}-${index}`}
                      className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${eventInfo.color}`}
                        >
                          {getEventIcon(eventInfo.icon)}
                          {eventInfo.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                          {formatTimestamp(log.createdTimeSec)}
                        </span>
                      </div>
                      <div className="flex flex-col text-xs">
                        <div className="flex items-center font-bold text-slate-900 dark:text-white">
                          <User className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0" />
                          <span>{log.authSession?.userName || "System"}</span>
                        </div>
                        {log.authSession?.userHost && (
                          <span className="text-[10px] font-mono text-slate-400 ml-5">
                            {log.authSession.userHost === "::1" ? "Localhost" : log.authSession.userHost}
                          </span>
                        )}
                      </div>
                      {log.resources && log.resources.length > 0 && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate pt-1 border-t border-slate-200/60 dark:border-slate-800">
                          <span className="font-semibold">Resources:</span>{" "}
                          {log.resources
                            .slice(0, 2)
                            .map((r) => getResourceName(r))
                            .join(", ")}
                          {log.resources.length > 2 && ` +${log.resources.length - 2} more`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {sortedLogs.length > displayCount && (
                <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 text-center">
                  <Button variant="outline" size="sm" className="rounded-xl text-xs font-semibold" onClick={() => setDisplayCount((prev) => prev + 20)}>
                    Load More ({sortedLogs.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </>
    </div>
  );
}
