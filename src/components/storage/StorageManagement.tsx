"use client";

import { isAdmin } from "@/lib/auth";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  AlertCircle,
  HardDrive,
  Cloud,
  ChevronDown,
  Database,
  Server,
  LogIn,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Archive,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

import { getElectronHeaders } from "@/lib/config";
import Cookies from "js-cookie";
import { useCloudSystems } from "@/hooks/use-async-data";
import { cn } from "@/lib/utils";

type ViewMode = "local" | "cloud";

interface StorageStatusInfo {
  url: string;
  storageId: string;
  totalSpace: string;
  freeSpace: string;
  reservedSpace: string;
  isExternal: boolean;
  isWritable: boolean;
  isUsedForWriting: boolean;
  isBackup: boolean;
  isOnline: boolean;
  storageType: string;
  runtimeFlags: string;
  persistentFlags: string;
  serverId: string;
  name: string;
}

interface Storage {
  id: string;
  serverId: string;
  name: string;
  path: string;
  type?: string;
  spaceLimitB?: number;
  isUsedForWriting?: boolean;
  isBackup?: boolean;
  status?: string;
  statusInfo?: StorageStatusInfo | null;
}

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

interface StorageFormData {
  name: string;
  path: string;
  type: string;
  spaceLimitB: number;
  isUsedForWriting: boolean;
  isBackup: boolean;
}

const defaultFormData: StorageFormData = {
  name: "",
  path: "",
  type: "local",
  spaceLimitB: 10737418240, // 10 GB default
  isUsedForWriting: true,
  isBackup: false,
};

const STORAGE_TYPES = [
  { value: "local", label: "Local Storage" },
  { value: "network", label: "Network (NAS - Manual)" },
  { value: "smb", label: "SMB (NAS - Auto)" },
];

export default function StorageManagement() {
  const { user: localUser } = useAuth();
  const isUserAdmin = isAdmin(localUser);
  const canEditStorage = isUserAdmin || localUser?.privileges?.find(p => p.module === "storage")?.can_edit === true;

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("local");

  const { data: cloudSystems, loading: loadingSystems, refetch: refetchCloudSystems } = useCloudSystems();
  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(null);

  // Storage state (for cloud)
  const [storages, setStorages] = useState<Storage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local storage state
  const [localStorages, setLocalStorages] = useState<Storage[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Auth state
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // CRUD modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedStorage, setSelectedStorage] = useState<Storage | null>(null);
  const [formData, setFormData] = useState<StorageFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (cloudSystems.length > 0 && !selectedSystem) {
      const firstOnline = cloudSystems.find((s) => s.stateOfHealth === "online");
      if (firstOnline) {
        setSelectedSystem(firstOnline as CloudSystem);
      }
    }
  }, [cloudSystems, selectedSystem]);

  // Auto-login function (disabled - authentication handled by Dual-Login flow)
  const attemptAutoLogin = useCallback(async (systemId: string) => {
    // Authentication is now handled centrally by the Dual-Login flow
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
        setRequiresAuth(false);
        setShowLoginForm(false);
        setLoginForm({ username: "", password: "" });
        // Refresh storages
        fetchStorages(selectedSystem);
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

  // Fetch storages
  const fetchStorages = useCallback(
    async (system: CloudSystem) => {
      if (!system || system.stateOfHealth !== "online") return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`);

        if (response.status === 401) {
          setRequiresAuth(true);
          // Try auto-login
          const autoLoginSuccess = await attemptAutoLogin(system.id);
          if (autoLoginSuccess) {
            // Retry fetch
            const retryResponse = await fetch(`/api/cloud/storages?systemId=${encodeURIComponent(system.id)}`);
            if (retryResponse.ok) {
              const data = await retryResponse.json();
              setStorages(Array.isArray(data) ? data : []);
              setRequiresAuth(false);
            }
          }
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

  // Fetch local storages directly from the NX server (Local First)
  const fetchLocalStorages = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    if (!localUserStr) return;

    let localUserInfo: any;
    try {
      localUserInfo = JSON.parse(localUserStr);
    } catch {
      return;
    }

    const token = localUserInfo?.token;
    if (!token) return;

    setLoadingLocal(true);
    setLocalError(null);

    try {
      // 1. Fetch storage config from v3
      const v3Response = await fetch("/nx/rest/v3/servers/this/storages", {
        headers: { "x-runtime-guid": token, Accept: "application/json" },
      });

      if (!v3Response.ok) throw new Error("Failed to fetch local storages (v3)");
      const storagesV3 = await v3Response.json();

      // 2. Fetch live usage stats from v4
      const v4Response = await fetch("/nx/rest/v3/servers/this/storages/*/status", {
        headers: { "x-runtime-guid": token, Accept: "application/json" },
      });

      let statusData: any[] = [];
      if (v4Response.ok) {
        statusData = await v4Response.json();
      }

      const cleanId = (id: string) => id.toLowerCase().replace(/[{}]/g, "");

      const mappedStorages: Storage[] = (Array.isArray(storagesV3) ? storagesV3 : []).map((item: any) => {
        // Match v4 status by storageId
        const statusInfo = Array.isArray(statusData)
          ? statusData.find((s: any) => cleanId(s.storageId) === cleanId(item.id))
          : null;

        const totalSpace = String(statusInfo?.totalSpace ?? item.totalSpace ?? item.totalSpaceB ?? 0);
        const freeSpace = String(statusInfo?.freeSpace ?? item.freeSpace ?? item.freeSpaceB ?? 0);
        const reservedSpace = String(item.spaceLimitB ?? item.reservedSpaceB ?? 0);

        return {
          id: item.id || "",
          serverId: item.serverId || item.parentId || "",
          name: item.name || item.url || "Unknown",
          path: item.url || item.path || "",
          type: item.storageType || item.type || "local",
          spaceLimitB: Number(item.spaceLimitB || item.reservedSpaceB || 0),
          isUsedForWriting: !!item.isUsedForWriting,
          isBackup: !!item.isBackup,
          status: (statusInfo?.isOnline ?? item.isOnline) ? "Online" : "Offline",
          statusInfo: {
            url: item.url || item.path || "",
            storageId: item.id || "",
            totalSpace,
            freeSpace,
            reservedSpace,
            isExternal: !!(statusInfo?.isExternal ?? item.isExternal),
            isWritable: !!(statusInfo?.isWritable ?? item.isWritable ?? true),
            isUsedForWriting: !!(statusInfo?.isUsedForWriting ?? item.isUsedForWriting),
            isBackup: !!(statusInfo?.isBackup ?? item.isBackup),
            isOnline: !!(statusInfo?.isOnline ?? item.isOnline),
            storageType: statusInfo?.storageType || item.storageType || item.type || "local",
            runtimeFlags: statusInfo?.runtimeFlags || "",
            persistentFlags: statusInfo?.persistentFlags || "",
            serverId: item.serverId || item.parentId || "",
            name: statusInfo?.name || item.name || item.url || "Unknown",
          },
        };
      });

      setLocalStorages(mappedStorages);
      setLocalError(null);
    } catch (err) {
      console.error("[Storage] Local fetch failed:", err);
      setLocalError(err instanceof Error ? err.message : "Failed to fetch local storages");
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  // Initial load - always fetch local data immediately
  useEffect(() => {
    fetchLocalStorages();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch storages when system changes (cloud mode)
  useEffect(() => {
    if (viewMode === "cloud" && selectedSystem) {
      fetchStorages(selectedSystem);
    }
  }, [viewMode, selectedSystem, fetchStorages]);

  // Format bytes to human readable
  const formatBytes = (bytes: string | number): string => {
    const numBytes = typeof bytes === "string" ? parseInt(bytes) : bytes;
    if (isNaN(numBytes) || numBytes === 0) return "0 B";

    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(numBytes) / Math.log(1024));
    return `${(numBytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Calculate usage percentage
  const getUsagePercentage = (storage: Storage): number => {
    if (!storage.statusInfo) return 0;
    const total = parseInt(storage.statusInfo.totalSpace);
    const free = parseInt(storage.statusInfo.freeSpace);
    if (isNaN(total) || isNaN(free) || total === 0) return 0;
    return Math.round(((total - free) / total) * 100);
  };

  // Get status color
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case "Online":
      case "Recording":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "Offline":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "Unauthorized":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30";
    }
  };

  // Get storage type icon
  const getStorageTypeIcon = (type?: string) => {
    switch (type) {
      case "local":
        return <HardDrive className="w-5 h-5" />;
      case "network":
      case "smb":
        return <Server className="w-5 h-5" />;
      default:
        return <Database className="w-5 h-5" />;
    }
  };

  // Get current storages based on view mode
  const currentStorages = viewMode === "local" ? localStorages : storages;
  const currentLoading = viewMode === "local" ? loadingLocal : loading;
  const currentError = viewMode === "local" ? localError : error;

  // Calculate totals
  const totalStorage = currentStorages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.totalSpace || "0");
    }
    return acc;
  }, 0);

  const totalUsed = currentStorages.reduce((acc, s) => {
    if (s.statusInfo) {
      const total = parseInt(s.statusInfo.totalSpace || "0");
      const free = parseInt(s.statusInfo.freeSpace || "0");
      return acc + (total - free);
    }
    return acc;
  }, 0);

  const totalFree = currentStorages.reduce((acc, s) => {
    if (s.statusInfo) {
      return acc + parseInt(s.statusInfo.freeSpace || "0");
    }
    return acc;
  }, 0);

  const onlineStorages = currentStorages.filter((s) => s.status === "Online" || s.statusInfo?.isOnline).length;

  // Get server ID from storages (assuming all storages belong to the same server)
  const getServerId = (): string => {
    if (currentStorages.length > 0 && currentStorages[0].serverId) {
      return currentStorages[0].serverId;
    }
    return "this"; // Default to "this" which represents the current server
  };

  // Open create modal
  const handleOpenCreate = () => {
    setFormData(defaultFormData);
    setSaveError(null);
    setShowCreateModal(true);
  };

  // Open edit modal
  const handleOpenEdit = (storage: Storage) => {
    setSelectedStorage(storage);
    setFormData({
      name: storage.name,
      path: storage.path,
      type: storage.type || "local",
      spaceLimitB: storage.spaceLimitB || 10737418240,
      isUsedForWriting: storage.isUsedForWriting ?? true,
      isBackup: storage.isBackup ?? false,
    });
    setSaveError(null);
    setShowEditModal(true);
  };

  // Open delete dialog
  const handleOpenDelete = (storage: Storage) => {
    setSelectedStorage(storage);
    setShowDeleteDialog(true);
  };

  // Create storage
  const handleCreate = async () => {
    if (!selectedSystem || !formData.name || !formData.path) {
      setSaveError("Name and path are required");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const serverId = getServerId();
      const response = await fetch(
        `/api/cloud/storages?systemId=${encodeURIComponent(selectedSystem.id)}&serverId=${encodeURIComponent(
          serverId,
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            path: formData.path,
            type: formData.type,
            spaceLimitB: formData.spaceLimitB,
            isUsedForWriting: formData.isUsedForWriting,
            isBackup: formData.isBackup,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create storage");
      }

      setShowCreateModal(false);
      fetchStorages(selectedSystem);
    } catch (err) {
      console.error("Error creating storage:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to create storage");
    } finally {
      setSaving(false);
    }
  };

  // Update storage
  const handleUpdate = async () => {
    if (!selectedSystem || !selectedStorage || !formData.name || !formData.path) {
      setSaveError("Name and path are required");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/cloud/storages/${selectedStorage.id}?systemId=${encodeURIComponent(
          selectedSystem.id,
        )}&serverId=${encodeURIComponent(selectedStorage.serverId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedStorage.id,
            serverId: selectedStorage.serverId,
            name: formData.name,
            path: formData.path,
            type: formData.type,
            spaceLimitB: formData.spaceLimitB,
            isUsedForWriting: formData.isUsedForWriting,
            isBackup: formData.isBackup,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update storage");
      }

      setShowEditModal(false);
      setSelectedStorage(null);
      fetchStorages(selectedSystem);
    } catch (err) {
      console.error("Error updating storage:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to update storage");
    } finally {
      setSaving(false);
    }
  };

  // Delete storage
  const handleDelete = async () => {
    if (!selectedSystem || !selectedStorage) return;

    setSaving(true);

    try {
      const response = await fetch(
        `/api/cloud/storages/${selectedStorage.id}?systemId=${encodeURIComponent(
          selectedSystem.id,
        )}&serverId=${encodeURIComponent(selectedStorage.serverId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete storage");
      }

      setShowDeleteDialog(false);
      setSelectedStorage(null);
      fetchStorages(selectedSystem);
    } catch (err) {
      console.error("Error deleting storage:", err);
      setError(err instanceof Error ? err.message : "Failed to delete storage");
    } finally {
      setSaving(false);
    }
  };

  // Parse GB to bytes
  const parseGBToBytes = (gb: string): number => {
    const num = parseFloat(gb);
    if (isNaN(num)) return 10737418240;
    return Math.round(num * 1024 * 1024 * 1024);
  };

  // Format bytes to GB for display
  const formatBytesToGB = (bytes: number): string => {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2);
  };

  // Handle refresh based on view mode
  const handleRefresh = () => {
    if (viewMode === "local") {
      fetchLocalStorages();
    } else if (selectedSystem) {
      fetchStorages(selectedSystem);
    }
  };

  const showNoCloudAlert = viewMode === "cloud" && cloudSystems.length === 0 && !loadingSystems;

  return (
    <div className="space-y-6 select-none pb-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-cyan-500/10 to-blue-500/20 text-cyan-600 dark:text-cyan-400 rounded-2xl border border-cyan-500/20 shadow-sm">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              Storage Management
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Disk drives, Network Attached Storage (NAS), capacity metrics, and write status
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <button
              onClick={() => setViewMode("local")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                viewMode === "local"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Local</span>
            </button>
            <button
              onClick={() => setViewMode("cloud")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                viewMode === "cloud"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud</span>
            </button>
          </div>

          {/* System Selector - only for cloud mode */}
          {viewMode === "cloud" && cloudSystems.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 h-9 text-xs rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80">
                  <Cloud className="w-3.5 h-3.5 text-blue-500" />
                  <span className="truncate max-w-[150px]">{selectedSystem?.name || "Select System"}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl" align="end">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Cloud System</p>
                  {loadingSystems ? (
                    <div className="flex items-center justify-center py-4">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {cloudSystems.map((system) => (
                        <button
                          key={system.id}
                          onClick={() => setSelectedSystem(system)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                            selectedSystem?.id === system.id
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold"
                              : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                          }`}
                          disabled={system.stateOfHealth !== "online"}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{system.name}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                system.stateOfHealth === "online" ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                          </div>
                          {system.accessRole === "owner" && <span className="text-[10px] font-semibold text-purple-600">Owner</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => {
              if (viewMode === "cloud" && !selectedSystem && cloudSystems.length === 0) {
                refetchCloudSystems();
              } else {
                handleRefresh();
              }
            }}
            disabled={currentLoading || loadingSystems}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl disabled:opacity-50 text-xs font-semibold h-9 transition-all shadow-sm hover:shadow"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${currentLoading || loadingSystems ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <>
        {/* Auth Required - only for cloud mode */}
        {viewMode === "cloud" && requiresAuth && !showLoginForm && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-bold text-sm text-amber-700 dark:text-amber-400">Authentication Required</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">Please login to view storages for {selectedSystem?.name}</p>
                </div>
              </div>
              <Button size="sm" className="rounded-xl text-xs font-semibold" onClick={() => setShowLoginForm(true)}>
                <LogIn className="w-3.5 h-3.5 mr-1.5" />
                Login
              </Button>
            </div>
          </div>
        )}

        {/* Login Form - only for cloud mode */}
        {viewMode === "cloud" && showLoginForm && (
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-4">Login to {selectedSystem?.name}</h3>
            <div className="space-y-3.5 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Username</label>
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs bg-slate-50/50 dark:bg-slate-800/50"
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs bg-slate-50/50 dark:bg-slate-800/50 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && <p className="text-xs text-rose-600 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">{loginError}</p>}

              <div className="flex gap-2 pt-1">
                <Button size="sm" className="rounded-xl text-xs font-semibold" onClick={handleLogin} disabled={loggingIn}>
                  {loggingIn ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5 mr-1.5" />
                      Login
                    </>
                  )}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl text-xs font-semibold" onClick={() => setShowLoginForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Overview */}
        {(viewMode === "local" || (viewMode === "cloud" && !requiresAuth)) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Storages</span>
                <Database className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{currentStorages.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">Online Disks</span>
                <Wifi className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {onlineStorages}/{currentStorages.length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-cyan-500 uppercase tracking-wider">Free Capacity</span>
                <HardDrive className="h-4 w-4 text-cyan-500" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-cyan-600 dark:text-cyan-400">{formatBytes(totalFree)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">Used / Capacity</span>
                <Archive className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-base font-bold tracking-tight">
                <span className="text-amber-600 dark:text-amber-400">{formatBytes(totalUsed)}</span>
                <span className="text-slate-400 mx-1">/</span>
                <span className="text-slate-600 dark:text-slate-300">{formatBytes(totalStorage)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Storage List */}
        {viewMode === "local" ? (
          // Local Storage List
          <div className="space-y-4">
            {loadingLocal ? (
              <div className="flex items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading local storages...</span>
              </div>
            ) : localError ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-rose-500">
                <AlertCircle className="w-6 h-6 mb-2" />
                <span className="text-sm font-medium text-center">{localError}</span>
                <Button variant="outline" size="sm" className="mt-4 rounded-xl text-xs font-semibold" onClick={fetchLocalStorages}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            ) : localStorages.length === 0 ? (
              <div className="flex items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-slate-400">
                <Database className="w-6 h-6 mr-2" />
                <span className="text-sm font-medium">No local storages found</span>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {localStorages.map((storage, index) => {
                  const usagePercent = getUsagePercentage(storage);
                  const isOnline = storage.status === "Online" || storage.statusInfo?.isOnline;
                  const isLastAndOdd = localStorages.length % 2 !== 0 && index === localStorages.length - 1;

                  return (
                    <Card
                      key={storage.id}
                      className={cn(
                        "border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md",
                        !isOnline && "opacity-60",
                        isLastAndOdd && "md:col-span-2"
                      )}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "p-2.5 rounded-xl shrink-0 border",
                                isOnline
                                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                  : "bg-slate-500/10 text-slate-500 border-slate-500/20"
                              )}
                            >
                              {getStorageTypeIcon(storage.type)}
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-base font-bold text-slate-900 dark:text-white truncate">
                                {storage.name}
                              </CardTitle>
                              <CardDescription className="text-xs font-mono text-slate-400 truncate max-w-[220px]">
                                {storage.path}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn(getStatusColor(storage.status), "shrink-0 text-xs rounded-lg px-2.5 py-0.5 font-semibold")}>
                            {isOnline ? <Wifi className="w-3.5 h-3.5 mr-1" /> : <WifiOff className="w-3.5 h-3.5 mr-1" />}
                            <span>{storage.status || "Unknown"}</span>
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {/* Usage Bar */}
                        {storage.statusInfo && (
                          <div className="space-y-1.5 bg-slate-50/60 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                            <div className="flex justify-between text-xs font-mono text-slate-600 dark:text-slate-300">
                              <span>
                                Used:{" "}
                                {formatBytes(
                                  parseInt(storage.statusInfo.totalSpace) - parseInt(storage.statusInfo.freeSpace)
                                )}
                              </span>
                              <span className="font-bold">{usagePercent}%</span>
                            </div>
                            <Progress
                              value={usagePercent}
                              className={cn(
                                "h-2 rounded-full",
                                usagePercent > 90
                                  ? "[&>div]:bg-rose-500"
                                  : usagePercent > 70
                                  ? "[&>div]:bg-amber-500"
                                  : "[&>div]:bg-emerald-500"
                              )}
                            />
                            <div className="flex justify-between text-[11px] font-mono text-slate-400">
                              <span>Free: {formatBytes(storage.statusInfo.freeSpace)}</span>
                              <span>Total: {formatBytes(storage.statusInfo.totalSpace)}</span>
                            </div>
                          </div>
                        )}

                        {/* Storage Info Badges */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="secondary" className="text-xs rounded-lg uppercase tracking-wider font-semibold">
                            {storage.type || "Unknown"}
                          </Badge>

                          {storage.isUsedForWriting || storage.statusInfo?.isUsedForWriting ? (
                            <Badge variant="secondary" className="text-xs rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Writing
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-semibold">
                              <XCircle className="w-3 h-3 mr-1" />
                              Read-only
                            </Badge>
                          )}

                          {(storage.isBackup || storage.statusInfo?.isBackup) && (
                            <Badge variant="secondary" className="text-xs rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-semibold">
                              <Archive className="w-3 h-3 mr-1" />
                              Backup
                            </Badge>
                          )}

                          {storage.statusInfo?.isExternal && (
                            <Badge variant="secondary" className="text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-semibold">
                              External
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // Cloud Storage List - only show when authenticated
          !requiresAuth && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading storages...</span>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-rose-500">
                  <AlertCircle className="w-6 h-6 mr-2" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              ) : !selectedSystem ? (
                <div className="flex items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-slate-400">
                  <Cloud className="w-6 h-6 mr-2" />
                  <span className="text-sm font-medium">Select a cloud system to view storages</span>
                </div>
              ) : storages.length === 0 ? (
                <div className="flex items-center justify-center p-12 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-slate-400">
                  <Database className="w-6 h-6 mr-2" />
                  <span className="text-sm font-medium">No storages found</span>
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {storages.map((storage, index) => {
                    const usagePercent = getUsagePercentage(storage);
                    const isOnline = storage.status === "Online" || storage.statusInfo?.isOnline;
                    const isLastAndOdd = storages.length % 2 !== 0 && index === storages.length - 1;

                    return (
                      <Card
                        key={storage.id}
                        className={cn(
                          "border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md",
                          !isOnline && "opacity-60",
                          isLastAndOdd && "md:col-span-2"
                        )}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  "p-2.5 rounded-xl shrink-0 border",
                                  isOnline
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                    : "bg-slate-500/10 text-slate-500 border-slate-500/20"
                                )}
                              >
                                {getStorageTypeIcon(storage.type)}
                              </div>
                              <div className="min-w-0">
                                <CardTitle className="text-base font-bold text-slate-900 dark:text-white truncate">
                                  {storage.statusInfo?.name || storage.name}
                                </CardTitle>
                                <CardDescription className="text-xs font-mono text-slate-400 truncate max-w-[220px]">
                                  {storage.statusInfo?.url || storage.path}
                                </CardDescription>
                              </div>
                            </div>
                            <Badge variant="outline" className={cn(getStatusColor(storage.status), "shrink-0 text-xs rounded-lg px-2.5 py-0.5 font-semibold")}>
                              {isOnline ? <Wifi className="w-3.5 h-3.5 mr-1" /> : <WifiOff className="w-3.5 h-3.5 mr-1" />}
                              <span>{storage.status || "Unknown"}</span>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-0">
                          {/* Usage Bar */}
                          {storage.statusInfo && (
                            <div className="space-y-1.5 bg-slate-50/60 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                              <div className="flex justify-between text-xs font-mono text-slate-600 dark:text-slate-300">
                                <span>Free: {formatBytes(storage.statusInfo.freeSpace)}</span>
                                <span className="font-bold">{usagePercent}%</span>
                              </div>
                              <Progress
                                value={usagePercent}
                                className={cn(
                                  "h-2 rounded-full",
                                  usagePercent > 90
                                    ? "[&>div]:bg-rose-500"
                                    : usagePercent > 70
                                    ? "[&>div]:bg-amber-500"
                                    : "[&>div]:bg-blue-500"
                                )}
                              />
                              <div className="flex justify-end text-[11px] font-mono text-slate-400">
                                <span>
                                  {formatBytes(
                                    parseInt(storage.statusInfo.totalSpace) - parseInt(storage.statusInfo.freeSpace)
                                  )} / {formatBytes(storage.statusInfo.totalSpace)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Storage Info Badges */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Badge variant="secondary" className="text-xs rounded-lg uppercase tracking-wider font-semibold">
                              {storage.statusInfo?.storageType || storage.type || "Unknown"}
                            </Badge>

                            {storage.isUsedForWriting || storage.statusInfo?.isUsedForWriting ? (
                              <Badge variant="secondary" className="text-xs rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Writing
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-semibold">
                                <XCircle className="w-3 h-3 mr-1" />
                                Read-only
                              </Badge>
                            )}

                            {(storage.isBackup || storage.statusInfo?.isBackup) && (
                              <Badge variant="secondary" className="text-xs rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-semibold">
                                <Archive className="w-3 h-3 mr-1" />
                                Backup
                              </Badge>
                            )}

                            {storage.statusInfo?.isExternal && (
                              <Badge variant="secondary" className="text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-semibold">
                                External
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}

        {/* Create Storage Modal - only for cloud mode */}
        {
          viewMode === "cloud" && (
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Storage</DialogTitle>
                  <DialogDescription>Create a new storage location for {selectedSystem?.name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Storage Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Main Storage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="path">Path *</Label>
                    <Input
                      id="path"
                      value={formData.path}
                      onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                      placeholder="e.g., /mnt/storage or C:\Storage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Storage Type</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {STORAGE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="spaceLimit">Reserved Space (GB)</Label>
                    <Input
                      id="spaceLimit"
                      type="number"
                      value={formatBytesToGB(formData.spaceLimitB)}
                      onChange={(e) => setFormData({ ...formData, spaceLimitB: parseGBToBytes(e.target.value) })}
                      placeholder="10"
                      min="0"
                    />
                    <p className="text-xs text-gray-500">Recommended: 10 GB for local, 100 GB for NAS</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isUsedForWriting}
                        onChange={(e) => setFormData({ ...formData, isUsedForWriting: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Allow Writing</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isBackup}
                        onChange={(e) => setFormData({ ...formData, isBackup: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Use as Backup</span>
                    </label>
                  </div>

                  {saveError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{saveError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={saving}>
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Storage
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }

        {/* Edit Storage Modal - only for cloud mode */}
        {
          viewMode === "cloud" && (
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Edit Storage</DialogTitle>
                  <DialogDescription>Update storage settings for {selectedStorage?.name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Storage Name *</Label>
                    <Input
                      id="edit-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Main Storage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-path">Path *</Label>
                    <Input
                      id="edit-path"
                      value={formData.path}
                      onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                      placeholder="e.g., /mnt/storage or C:\Storage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-type">Storage Type</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {STORAGE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-spaceLimit">Reserved Space (GB)</Label>
                    <Input
                      id="edit-spaceLimit"
                      type="number"
                      value={formatBytesToGB(formData.spaceLimitB)}
                      onChange={(e) => setFormData({ ...formData, spaceLimitB: parseGBToBytes(e.target.value) })}
                      placeholder="10"
                      min="0"
                    />
                    <p className="text-xs text-gray-500">Recommended: 10 GB for local, 100 GB for NAS</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isUsedForWriting}
                        onChange={(e) => setFormData({ ...formData, isUsedForWriting: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Allow Writing</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isBackup}
                        onChange={(e) => setFormData({ ...formData, isBackup: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Use as Backup</span>
                    </label>
                  </div>

                  {saveError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{saveError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEditModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdate} disabled={saving}>
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }

        {/* Delete Confirmation Dialog - only for cloud mode */}
        {
          viewMode === "cloud" && (
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Storage</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{selectedStorage?.name}</strong>?
                    <br />
                    <span className="text-red-600">This action cannot be undone.</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={saving}>
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </>
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
      </>
    </div>
  );
}
