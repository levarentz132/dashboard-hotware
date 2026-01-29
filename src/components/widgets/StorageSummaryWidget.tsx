"use client";

import { useState, useEffect, useCallback } from "react";
import { HardDrive, Database, RefreshCw, AlertCircle, CheckCircle, XCircle, LogIn, Eye, EyeOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";

interface StorageStatusInfo {
  totalSpace: string;
  freeSpace: string;
  isOnline: boolean;
}

interface Storage {
  id: string;
  name: string;
  status?: string;
  statusInfo?: StorageStatusInfo | null;
}

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
}

export default function StorageSummaryWidget() {
  const [storages, setStorages] = useState<Storage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  // Fetch cloud systems and auto-select first online (same logic as StorageManagement)
  const fetchCloudSystems = useCallback(async () => {
    setLoading(true);
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
        setError("Failed to connect to cloud");
        return;
      }

      const data = await response.json();
      const systems: CloudSystem[] = data.systems || [];

      // Sort: owner first, then online systems (same as StorageManagement)
      systems.sort((a, b) => {
        if ((a as any).accessRole === "owner" && (b as any).accessRole !== "owner") return -1;
        if ((a as any).accessRole !== "owner" && (b as any).accessRole === "owner") return 1;
        if (a.stateOfHealth === "online" && b.stateOfHealth !== "online") return -1;
        if (a.stateOfHealth !== "online" && b.stateOfHealth === "online") return 1;
        return 0;
      });

      const firstOnline = systems.find((s) => s.stateOfHealth === "online");
      if (firstOnline) {
        setSelectedSystem(firstOnline);
      } else {
        setError("No online system found");
        setLoading(false);
      }
    } catch (err) {
      console.error("Error fetching cloud systems:", err);
      setError("Failed to connect to cloud");
      setLoading(false);
    }
  }, []);

  // Auto-login function - always try with config credentials
  const attemptAutoLogin = useCallback(async (systemId: string) => {
    // Always try auto-login if credentials exist in config
    if (!CLOUD_CONFIG.username || !CLOUD_CONFIG.password) {
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

      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Manual login handler
  const handleLogin = async () => {
    if (!selectedSystem || !loginForm.username || !loginForm.password) return;

    setLoggingIn(true);
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
        setRequiresAuth(false);
        setShowLoginForm(false);
        setLoginForm({ username: "", password: "" });
        fetchStorages(selectedSystem);
      } else {
        setError("Login failed");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  // Fetch storages
  const fetchStorages = useCallback(
    async (system: CloudSystem) => {
      if (!system || system.stateOfHealth !== "online") return;

      setLoading(true);
      setError(null);

      try {
        // Langsung fetch, session sudah ada di cookie dari login sebelumnya
        const response = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`);

        if (response.status === 401) {
          // Session belum ada, coba auto-login dulu
          const autoLoginSuccess = await attemptAutoLogin(system.id);
          if (autoLoginSuccess) {
            // Retry fetch after successful login
            const retryResponse = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`);
            if (retryResponse.ok) {
              const data = await retryResponse.json();
              setStorages(Array.isArray(data) ? data : []);
              setRequiresAuth(false);
              setLoading(false);
              return;
            }
          }
          // Auto-login gagal, minta user login manual
          setRequiresAuth(true);
          setShowLoginForm(true);
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch storages");
        }

        const data = await response.json();
        setStorages(Array.isArray(data) ? data : []);
        setRequiresAuth(false);
      } catch (err) {
        console.error("Error fetching storages:", err);
        setError("Failed to fetch storages");
      } finally {
        setLoading(false);
      }
    },
    [attemptAutoLogin],
  );

  // Initial load
  useEffect(() => {
    fetchCloudSystems();
  }, [fetchCloudSystems]);

  // Fetch storages when system changes
  useEffect(() => {
    if (selectedSystem) {
      fetchStorages(selectedSystem);
    }
  }, [selectedSystem, fetchStorages]);

  // Format bytes to human readable
  const formatBytes = (bytes: string | number): string => {
    const numBytes = typeof bytes === "string" ? parseInt(bytes) : bytes;
    if (isNaN(numBytes) || numBytes === 0) return "0 B";

    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(numBytes) / Math.log(1024));
    return `${(numBytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Calculate totals
  const totalStorage = storages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.totalSpace || "0");
    }
    return acc;
  }, 0);

  const totalUsed = storages.reduce((acc, s) => {
    if (s.statusInfo) {
      const total = parseInt(s.statusInfo.totalSpace || "0");
      const free = parseInt(s.statusInfo.freeSpace || "0");
      return acc + (total - free);
    }
    return acc;
  }, 0);

  const totalFree = storages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.freeSpace || "0");
    }
    return acc;
  }, 0);

  const onlineStorages = storages.filter((s) => s.status === "Online" || s.statusInfo?.isOnline).length;
  const usagePercentage = totalStorage > 0 ? Math.round((totalUsed / totalStorage) * 100) : 0;

  const handleRefresh = () => {
    if (selectedSystem) {
      fetchStorages(selectedSystem);
    } else {
      fetchCloudSystems();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading storage...</span>
      </div>
    );
  }

  // Show login form when auth required
  if (requiresAuth && showLoginForm) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 text-amber-600">
          <LogIn className="w-5 h-5" />
          <span className="font-medium text-sm">Login Required</span>
        </div>
        <p className="text-xs text-muted-foreground">Please login to view storage data</p>
        <div className="space-y-2">
          <Input
            placeholder="Username/Email"
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            className="h-8 text-sm"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              className="h-8 text-sm pr-8"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button
            size="sm"
            className="w-full h-8"
            onClick={handleLogin}
            disabled={loggingIn || !loginForm.username || !loginForm.password}
          >
            {loggingIn ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <LogIn className="w-4 h-4 mr-1" />}
            Login
          </Button>
        </div>
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
          <RefreshCw className="w-4 h-4 text-gray-500" />
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
              <div key={storage.id} className="flex items-center gap-2 text-xs p-1.5 bg-muted/50 rounded">
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
