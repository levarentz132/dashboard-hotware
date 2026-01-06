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
  Calendar,
  Activity,
  Camera,
  Settings,
  Shield,
  LogIn,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { CLOUD_CONFIG } from "@/lib/config";

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
  AR_Login: { label: "User Login", color: "bg-green-100 text-green-800", icon: "login" },
  AR_Logout: { label: "User Logout", color: "bg-gray-100 text-gray-800", icon: "logout" },
  AR_CameraInsert: { label: "Camera Added", color: "bg-blue-100 text-blue-800", icon: "camera" },
  AR_CameraUpdate: { label: "Camera Updated", color: "bg-yellow-100 text-yellow-800", icon: "camera" },
  AR_CameraRemove: { label: "Camera Removed", color: "bg-red-100 text-red-800", icon: "camera" },
  AR_ServerUpdate: { label: "Server Updated", color: "bg-purple-100 text-purple-800", icon: "server" },
  AR_UserUpdate: { label: "User Updated", color: "bg-indigo-100 text-indigo-800", icon: "user" },
  AR_UserInsert: { label: "User Added", color: "bg-teal-100 text-teal-800", icon: "user" },
  AR_UserRemove: { label: "User Removed", color: "bg-orange-100 text-orange-800", icon: "user" },
  AR_SystemNameChanged: { label: "System Name Changed", color: "bg-pink-100 text-pink-800", icon: "settings" },
  AR_SettingsChange: { label: "Settings Changed", color: "bg-cyan-100 text-cyan-800", icon: "settings" },
  AR_DatabaseRestore: { label: "Database Restored", color: "bg-amber-100 text-amber-800", icon: "database" },
  AR_MitmAttack: { label: "Security Alert", color: "bg-red-200 text-red-900", icon: "shield" },
  AR_StorageInsert: { label: "Storage Added", color: "bg-emerald-100 text-emerald-800", icon: "storage" },
  AR_StorageUpdate: { label: "Storage Updated", color: "bg-lime-100 text-lime-800", icon: "storage" },
  AR_StorageRemove: { label: "Storage Removed", color: "bg-rose-100 text-rose-800", icon: "storage" },
};

export default function AuditLog() {
  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(null);
  const [loadingSystems, setLoadingSystems] = useState(false);

  // Device name mapping
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEventType, setFilterEventType] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(() => {
    // Default to 7 days ago
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 16);
  });

  // Pagination
  const [displayCount, setDisplayCount] = useState(20);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    setLoadingSystems(true);
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        setError("Failed to fetch cloud systems");
        return;
      }

      const data = await response.json();
      const systems: CloudSystem[] = data.systems || [];

      // Sort: owner first, then online systems
      systems.sort((a, b) => {
        if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
        if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
        if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
        if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
        return 0;
      });

      setCloudSystems(systems);

      // Auto-select first online system
      const firstOnline = systems.find((s) => s.stateOfHealth === "online");
      if (firstOnline) {
        setSelectedSystem(firstOnline);
      }
    } catch (err) {
      console.error("Error fetching cloud systems:", err);
      setError("Failed to connect to cloud");
    } finally {
      setLoadingSystems(false);
    }
  }, []);

  // Fetch devices for name mapping
  const fetchDevices = useCallback(async (systemId: string) => {
    try {
      const response = await fetch(`/api/cloud/devices?systemId=${encodeURIComponent(systemId)}`);
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
  }, []);

  // Auto-login function
  const attemptAutoLogin = useCallback(async (systemId: string) => {
    if (!CLOUD_CONFIG.autoLoginEnabled || !CLOUD_CONFIG.username || !CLOUD_CONFIG.password) {
      return false;
    }

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

      if (response.ok) {
        setIsLoggedIn(true);
        setRequiresAuth(false);
        return true;
      }
    } catch (err) {
      console.error("Auto-login failed:", err);
    }
    return false;
  }, []);

  // Manual login
  const handleLogin = async () => {
    if (!selectedSystem || !loginForm.username || !loginForm.password) {
      setLoginError("Username and password are required");
      return;
    }

    setLoggingIn(true);
    setLoginError(null);

    try {
      const response = await fetch("/api/cloud/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId: selectedSystem.id,
          username: loginForm.username,
          password: loginForm.password,
        }),
      });

      if (response.ok) {
        setIsLoggedIn(true);
        setRequiresAuth(false);
        setShowLoginForm(false);
        setLoginForm({ username: "", password: "" });
        // Refresh audit logs
        fetchAuditLogs(selectedSystem);
      } else {
        const data = await response.json();
        setLoginError(data.error || "Login failed");
      }
    } catch {
      setLoginError("Connection error");
    } finally {
      setLoggingIn(false);
    }
  };

  // Fetch audit logs
  const fetchAuditLogs = useCallback(
    async (system: CloudSystem) => {
      if (!system || system.stateOfHealth !== "online") return;

      setLoading(true);
      setError(null);

      try {
        // Format from date
        const fromDateFormatted = new Date(fromDate).toISOString();

        const response = await fetch(
          `/api/cloud/audit-log?systemId=${encodeURIComponent(system.id)}&from=${encodeURIComponent(fromDateFormatted)}`
        );

        if (response.status === 401) {
          setRequiresAuth(true);
          // Try auto-login
          const autoLoginSuccess = await attemptAutoLogin(system.id);
          if (autoLoginSuccess) {
            // Retry fetch
            const retryResponse = await fetch(
              `/api/cloud/audit-log?systemId=${encodeURIComponent(system.id)}&from=${encodeURIComponent(
                fromDateFormatted
              )}`
            );
            if (retryResponse.ok) {
              const data = await retryResponse.json();
              const logs = data.reply || data;
              setAuditLogs(Array.isArray(logs) ? logs : []);
              setRequiresAuth(false);
            }
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch audit logs");
        }

        const data = await response.json();
        const logs = data.reply || data;
        setAuditLogs(Array.isArray(logs) ? logs : []);
        setIsLoggedIn(true);
        setRequiresAuth(false);
      } catch (err) {
        console.error("Error fetching audit logs:", err);
        setError("Failed to fetch audit logs");
      } finally {
        setLoading(false);
      }
    },
    [fromDate, attemptAutoLogin]
  );

  // Initial load
  useEffect(() => {
    fetchCloudSystems();
  }, [fetchCloudSystems]);

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
    return date.toLocaleString("id-ID", {
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">User Log</h1>
          <p className="text-sm text-gray-500 mt-1">User activity history from cloud systems</p>
        </div>

        <div className="flex items-center gap-2">
          {/* System Selector */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{selectedSystem?.name || "Select System"}</span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Select Cloud System</p>
                {loadingSystems ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  </div>
                ) : cloudSystems.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">No systems found</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {cloudSystems.map((system) => (
                      <button
                        key={system.id}
                        onClick={() => setSelectedSystem(system)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedSystem?.id === system.id
                            ? "bg-blue-100 text-blue-800"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                        disabled={system.stateOfHealth !== "online"}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{system.name}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              system.stateOfHealth === "online" ? "bg-green-500" : "bg-gray-400"
                            }`}
                          />
                        </div>
                        {system.accessRole === "owner" && <span className="text-xs text-purple-600">Owner</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={() => selectedSystem && fetchAuditLogs(selectedSystem)}
            disabled={loading || !selectedSystem}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search events, users, resources..."
              className="pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* From Date */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Event Type Filter */}
          <select
            value={filterEventType}
            onChange={(e) => setFilterEventType(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Event Types</option>
            {uniqueEventTypes.map((type) => (
              <option key={type} value={type}>
                {getEventInfo(type).label}
              </option>
            ))}
          </select>

          {/* User Filter */}
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Users</option>
            {uniqueUsers.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {(filterEventType !== "all" || filterUser !== "all" || searchTerm) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterEventType("all");
                setFilterUser("all");
                setSearchTerm("");
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Auth Required */}
      {requiresAuth && !showLoginForm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Authentication Required</p>
                <p className="text-sm text-yellow-600">Please login to view audit logs for {selectedSystem?.name}</p>
              </div>
            </div>
            <Button onClick={() => setShowLoginForm(true)}>
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          </div>
        </div>
      )}

      {/* Login Form */}
      {showLoginForm && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Login to {selectedSystem?.name}</h3>
          <div className="space-y-3 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{loginError}</p>}

            <div className="flex gap-2">
              <Button onClick={handleLogin} disabled={loggingIn}>
                {loggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Login
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowLoginForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats - only show when authenticated */}
      {!requiresAuth && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-gray-900">{filteredLogs.length}</div>
            <div className="text-xs text-gray-500">Total Events</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-blue-600">{uniqueUsers.length}</div>
            <div className="text-xs text-gray-500">Active Users</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-green-600">
              {filteredLogs.filter((l) => l.eventType === "AR_Login").length}
            </div>
            <div className="text-xs text-gray-500">Login Events</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-purple-600">{uniqueEventTypes.length}</div>
            <div className="text-xs text-gray-500">Event Types</div>
          </div>
        </div>
      )}

      {/* Audit Log Table - only show when authenticated */}
      {!requiresAuth && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-gray-600">Loading audit logs...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center p-8 text-red-600">
              <AlertCircle className="w-6 h-6 mr-2" />
              <span>{error}</span>
            </div>
          ) : !selectedSystem ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <Cloud className="w-6 h-6 mr-2" />
              <span>Select a cloud system to view audit logs</span>
            </div>
          ) : displayedLogs.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <Activity className="w-6 h-6 mr-2" />
              <span>No audit logs found</span>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Resources
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedLogs.map((log, index) => {
                      const eventInfo = getEventInfo(log.eventType);
                      return (
                        <tr key={`${log.createdTimeSec}-${index}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center text-xs lg:text-sm text-gray-600">
                              <Clock className="w-3.5 h-3.5 mr-1.5 text-gray-400 hidden lg:block" />
                              {formatTimestamp(log.createdTimeSec)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${eventInfo.color}`}
                            >
                              {getEventIcon(eventInfo.icon)}
                              <span className="hidden lg:inline">{eventInfo.label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center text-xs lg:text-sm">
                              <User className="w-3.5 h-3.5 mr-1.5 text-gray-400 hidden lg:block" />
                              <span className="font-medium text-gray-900">{log.authSession?.userName || "-"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-xs text-gray-500 max-w-[150px] lg:max-w-xs truncate">
                              {log.resources?.length > 0
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
              <div className="md:hidden space-y-2 p-2">
                {displayedLogs.map((log, index) => {
                  const eventInfo = getEventInfo(log.eventType);
                  return (
                    <div
                      key={`${log.createdTimeSec}-${index}`}
                      className="bg-gray-50 border rounded-lg p-2.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${eventInfo.color}`}
                        >
                          {getEventIcon(eventInfo.icon)}
                          {eventInfo.label}
                        </span>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">
                          {formatTimestamp(log.createdTimeSec)}
                        </span>
                      </div>
                      <div className="flex items-center text-sm">
                        <User className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                        <span className="font-medium text-gray-900 text-xs">{log.authSession?.userName || "-"}</span>
                      </div>
                      {log.resources?.length > 0 && (
                        <div className="text-[10px] text-gray-500 truncate">
                          <span className="font-medium">Resources:</span>{" "}
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
                <div className="p-3 border-t text-center">
                  <Button variant="outline" size="sm" onClick={() => setDisplayCount((prev) => prev + 20)}>
                    Load More ({sortedLogs.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
