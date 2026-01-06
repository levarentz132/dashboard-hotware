"use client";

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
  Monitor,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { CLOUD_CONFIG } from "@/lib/config";

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
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("local");

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<CloudSystem | null>(null);
  const [loadingSystems, setLoadingSystems] = useState(false);

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
    [attemptAutoLogin]
  );

  // Fetch local storages from localhost:7001
  const fetchLocalStorages = useCallback(async () => {
    setLoadingLocal(true);
    setLocalError(null);

    try {
      const response = await fetch("/api/nx/storages");
      const data = await response.json();

      // Check for error response
      if (!response.ok || data.error) {
        console.error("Local storage API error:", data);
        throw new Error(data.error || data.details || "Failed to fetch local storages");
      }

      console.log("Local storage data received:", data);

      // Map the response to Storage interface
      // NX Witness API v3 may return different field names
      const mappedStorages: Storage[] = (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) => {
        // Log each item for debugging
        console.log("Mapping storage item:", item);

        // Get space values - try multiple possible field names
        const totalSpace = item.totalSpace || item.totalSpaceB || item.spaceLimit || item.spaceLimitB || 0;
        const freeSpace = item.freeSpace || item.freeSpaceB || 0;
        const reservedSpace = item.reservedSpace || item.reservedSpaceB || item.spaceLimitB || 0;

        return {
          id: (item.id as string) || "",
          serverId: (item.serverId as string) || (item.parentId as string) || "",
          name: (item.name as string) || (item.url as string) || "Unknown",
          path: (item.url as string) || (item.path as string) || "",
          type: (item.storageType as string) || (item.type as string) || "local",
          spaceLimitB: Number(reservedSpace) || 0,
          isUsedForWriting: (item.isUsedForWriting as boolean) ?? false,
          isBackup: (item.isBackup as boolean) ?? false,
          status: (item.isOnline as boolean) ? "Online" : "Offline",
          statusInfo: {
            url: (item.url as string) || (item.path as string) || "",
            storageId: (item.id as string) || "",
            totalSpace: String(totalSpace),
            freeSpace: String(freeSpace),
            reservedSpace: String(reservedSpace),
            isExternal: (item.isExternal as boolean) ?? false,
            isWritable: (item.isWritable as boolean) ?? true,
            isUsedForWriting: (item.isUsedForWriting as boolean) ?? false,
            isBackup: (item.isBackup as boolean) ?? false,
            isOnline: (item.isOnline as boolean) ?? false,
            storageType: (item.storageType as string) || (item.type as string) || "local",
            runtimeFlags: (item.runtimeFlags as string) || "",
            persistentFlags: (item.persistentFlags as string) || "",
            serverId: (item.serverId as string) || (item.parentId as string) || "",
            name: (item.name as string) || (item.url as string) || "Unknown",
          },
        };
      });

      setLocalStorages(mappedStorages);
      setLocalError(null);
    } catch (err) {
      console.error("Error fetching local storages:", err);
      setLocalError(
        err instanceof Error
          ? err.message
          : "Failed to fetch local storages. Make sure the local server is running on localhost:7001"
      );
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (viewMode === "cloud") {
      fetchCloudSystems();
    } else {
      fetchLocalStorages();
    }
  }, [viewMode, fetchCloudSystems, fetchLocalStorages]);

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
        return "bg-green-100 text-green-800";
      case "Offline":
        return "bg-red-100 text-red-800";
      case "Unauthorized":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
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
          serverId
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
        }
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
          selectedSystem.id
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
        }
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
          selectedSystem.id
        )}&serverId=${encodeURIComponent(selectedStorage.serverId)}`,
        { method: "DELETE" }
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Storage Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and manage {viewMode === "local" ? "local" : "cloud"} system storages
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Storage Button - only for cloud mode with selected system */}
          {viewMode === "cloud" && !requiresAuth && selectedSystem && (
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Storage</span>
            </Button>
          )}

          {/* System Selector - only for cloud mode */}
          {viewMode === "cloud" && (
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
          )}

          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={currentLoading || (viewMode === "cloud" && !selectedSystem)}
          >
            <RefreshCw className={`w-4 h-4 ${currentLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="local" className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Local Server
          </TabsTrigger>
          <TabsTrigger value="cloud" className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            Cloud Systems
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Auth Required - only for cloud mode */}
      {viewMode === "cloud" && requiresAuth && !showLoginForm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Authentication Required</p>
                <p className="text-sm text-yellow-600">Please login to view storages for {selectedSystem?.name}</p>
              </div>
            </div>
            <Button onClick={() => setShowLoginForm(true)}>
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          </div>
        </div>
      )}

      {/* Login Form - only for cloud mode */}
      {viewMode === "cloud" && showLoginForm && (
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

      {/* Stats Overview - show for local mode or when cloud mode is authenticated */}
      {(viewMode === "local" || (viewMode === "cloud" && !requiresAuth)) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total Storages</CardDescription>
              <CardTitle className="text-2xl">{currentStorages.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Online</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {onlineStorages}/{currentStorages.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total Capacity</CardDescription>
              <CardTitle className="text-2xl">{formatBytes(totalStorage)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Used / Free</CardDescription>
              <CardTitle className="text-lg">
                <span className="text-orange-600">{formatBytes(totalUsed)}</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="text-green-600">{formatBytes(totalFree)}</span>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Storage List */}
      {viewMode === "local" ? (
        // Local Storage List
        <div className="space-y-4">
          {loadingLocal ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-lg border">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-gray-600">Loading local storages...</span>
            </div>
          ) : localError ? (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg border text-red-600">
              <AlertCircle className="w-6 h-6 mb-2" />
              <span className="text-center">{localError}</span>
              <Button variant="outline" size="sm" className="mt-4" onClick={fetchLocalStorages}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : localStorages.length === 0 ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-lg border text-gray-500">
              <Database className="w-6 h-6 mr-2" />
              <span>No local storages found</span>
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
              {localStorages.map((storage, index) => {
                const usagePercent = getUsagePercentage(storage);
                const isOnline = storage.status === "Online" || storage.statusInfo?.isOnline;
                const isLastAndOdd = localStorages.length % 2 !== 0 && index === localStorages.length - 1;

                return (
                  <Card
                    key={storage.id}
                    className={`${!isOnline ? "opacity-60" : ""} ${isLastAndOdd ? "sm:col-span-2" : ""}`}
                  >
                    <CardHeader className="pb-2 sm:pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div
                            className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${
                              isOnline ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {getStorageTypeIcon(storage.type)}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm sm:text-base truncate">{storage.name}</CardTitle>
                            <CardDescription className="text-xs truncate max-w-[120px] sm:max-w-[200px]">
                              {storage.path}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className={`${getStatusColor(storage.status)} shrink-0 text-xs`}>
                          {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                          <span className="hidden xs:inline">{storage.status || "Unknown"}</span>
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 sm:space-y-3 pt-0">
                      {/* Usage Bar */}
                      {storage.statusInfo && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] sm:text-xs text-gray-500">
                            <span>
                              Used:{" "}
                              {formatBytes(
                                parseInt(storage.statusInfo.totalSpace) - parseInt(storage.statusInfo.freeSpace)
                              )}
                            </span>
                            <span>{usagePercent}%</span>
                          </div>
                          <Progress
                            value={usagePercent}
                            className={`h-1.5 sm:h-2 ${
                              usagePercent > 90
                                ? "[&>div]:bg-red-500"
                                : usagePercent > 70
                                ? "[&>div]:bg-yellow-500"
                                : "[&>div]:bg-green-500"
                            }`}
                          />
                          <div className="flex justify-between text-[10px] sm:text-xs text-gray-500">
                            <span>Free: {formatBytes(storage.statusInfo.freeSpace)}</span>
                            <span>Total: {formatBytes(storage.statusInfo.totalSpace)}</span>
                          </div>
                        </div>
                      )}

                      {/* Storage Info */}
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        <Badge variant="secondary" className="text-[10px] sm:text-xs">
                          {storage.type || "Unknown"}
                        </Badge>

                        {storage.isUsedForWriting || storage.statusInfo?.isUsedForWriting ? (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs bg-green-50 text-green-700">
                            <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            Writing
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs bg-gray-50 text-gray-600">
                            <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            Read-only
                          </Badge>
                        )}

                        {(storage.isBackup || storage.statusInfo?.isBackup) && (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs bg-purple-50 text-purple-700">
                            <Archive className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            Backup
                          </Badge>
                        )}

                        {storage.statusInfo?.isExternal && (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs bg-blue-50 text-blue-700">
                            External
                          </Badge>
                        )}
                      </div>

                      {/* Space Limit */}
                      {storage.spaceLimitB && storage.spaceLimitB > 0 && (
                        <div className="text-[10px] sm:text-xs text-gray-500">
                          Reserved: {formatBytes(storage.spaceLimitB)}
                        </div>
                      )}
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
              <div className="flex items-center justify-center p-8 bg-white rounded-lg border">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">Loading storages...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center p-8 bg-white rounded-lg border text-red-600">
                <AlertCircle className="w-6 h-6 mr-2" />
                <span>{error}</span>
              </div>
            ) : !selectedSystem ? (
              <div className="flex items-center justify-center p-8 bg-white rounded-lg border text-gray-500">
                <Cloud className="w-6 h-6 mr-2" />
                <span>Select a cloud system to view storages</span>
              </div>
            ) : storages.length === 0 ? (
              <div className="flex items-center justify-center p-8 bg-white rounded-lg border text-gray-500">
                <Database className="w-6 h-6 mr-2" />
                <span>No storages found</span>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
                {storages.map((storage, index) => {
                  const usagePercent = getUsagePercentage(storage);
                  const isOnline = storage.status === "Online" || storage.statusInfo?.isOnline;
                  // Make last item span full width if odd count
                  const isLastAndOdd = storages.length % 2 !== 0 && index === storages.length - 1;

                  return (
                    <Card
                      key={storage.id}
                      className={`${!isOnline ? "opacity-60" : ""} ${isLastAndOdd ? "sm:col-span-2" : ""}`}
                    >
                      <CardHeader className="pb-2 sm:pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div
                              className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${
                                isOnline ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {getStorageTypeIcon(storage.type)}
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-sm sm:text-base truncate">{storage.name}</CardTitle>
                              <CardDescription className="text-xs truncate max-w-[120px] sm:max-w-[200px]">
                                {storage.path}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline" className={`${getStatusColor(storage.status)} shrink-0 text-xs`}>
                            {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                            <span className="hidden xs:inline">{storage.status || "Unknown"}</span>
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 sm:space-y-3 pt-0">
                        {/* Usage Bar */}
                        {storage.statusInfo && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] sm:text-xs text-gray-500">
                              <span>
                                Used:{" "}
                                {formatBytes(
                                  parseInt(storage.statusInfo.totalSpace) - parseInt(storage.statusInfo.freeSpace)
                                )}
                              </span>
                              <span>{usagePercent}%</span>
                            </div>
                            <Progress
                              value={usagePercent}
                              className={`h-1.5 sm:h-2 ${
                                usagePercent > 90
                                  ? "[&>div]:bg-red-500"
                                  : usagePercent > 70
                                  ? "[&>div]:bg-yellow-500"
                                  : "[&>div]:bg-green-500"
                              }`}
                            />
                            <div className="flex justify-between text-[10px] sm:text-xs text-gray-500">
                              <span>Free: {formatBytes(storage.statusInfo.freeSpace)}</span>
                              <span>Total: {formatBytes(storage.statusInfo.totalSpace)}</span>
                            </div>
                          </div>
                        )}

                        {/* Storage Info */}
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">
                            {storage.type || "Unknown"}
                          </Badge>

                          {storage.isUsedForWriting || storage.statusInfo?.isUsedForWriting ? (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs bg-green-50 text-green-700">
                              <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              Writing
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs bg-gray-50 text-gray-600">
                              <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              Read-only
                            </Badge>
                          )}

                          {(storage.isBackup || storage.statusInfo?.isBackup) && (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs bg-purple-50 text-purple-700">
                              <Archive className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              Backup
                            </Badge>
                          )}

                          {storage.statusInfo?.isExternal && (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs bg-blue-50 text-blue-700">
                              External
                            </Badge>
                          )}
                        </div>

                        {/* Space Limit */}
                        {storage.spaceLimitB && storage.spaceLimitB > 0 && (
                          <div className="text-[10px] sm:text-xs text-gray-500">
                            Reserved: {formatBytes(storage.spaceLimitB)}
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => handleOpenEdit(storage)}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleOpenDelete(storage)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
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
      {viewMode === "cloud" && (
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
      )}

      {/* Edit Storage Modal - only for cloud mode */}
      {viewMode === "cloud" && (
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
      )}

      {/* Delete Confirmation Dialog - only for cloud mode */}
      {viewMode === "cloud" && (
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
      )}
    </div>
  );
}
