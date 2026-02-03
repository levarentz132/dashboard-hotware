"use client";

import {
  Search,
  Grid,
  List,
  Camera,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  AlertCircle,
  Plus,
  Trash2,
  Cloud,
  Server,
  ChevronDown,
  ChevronRight,
  Filter,
  LogIn,
  Eye,
  EyeOff,
  X,
  Shield,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCameras, useDeviceType } from "@/hooks/useNxAPI-camera";
import { useServers } from "@/hooks/useNxAPI-server";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { fetchCloudSystems as getCachedCloudSystems } from "@/hooks/use-async-data";
import nxAPI, { NxSystemInfo } from "@/lib/nxapi";
import { CLOUD_CONFIG, API_CONFIG, getCloudAuthHeader } from "@/lib/config";
import { performAdminLogin } from "@/lib/auth-utils";
import { CloudLoginDialog } from "@/components/cloud/CloudLoginDialog";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
}

interface CameraDevice {
  id: string;
  name: string;
  physicalId: string;
  url: string;
  typeId: string;
  mac: string;
  serverId: string;
  vendor: string;
  model: string;
  logicalId: string;
  status: string;
  ip?: string;
  location?: string;
  type?: string;
  resolution?: string;
  fps?: number;
  group?: { id: string; name: string };
  credentials?: { user: string; password: string };
}

interface CamerasBySystem {
  systemId: string;
  systemName: string;
  cameras: CameraDevice[];
  stateOfHealth: string;
}

export default function CameraInventory() {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "cloud">("cloud");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");

  const systemId = selectedSystemId;

  // API hooks
  const { cameras, loading: loadingCameras, error: camerasError, refetch } = useCameras(systemId);
  const { connected, testConnection } = useSystemInfo(systemId);
  const { servers, loading: loadingServers, error: serversError } = useServers(systemId);
  const { deviceType } = useDeviceType(systemId);

  const loading = loadingCameras || loadingServers;
  const error = camerasError || serversError;

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [camerasBySystem, setCamerasBySystem] = useState<CamerasBySystem[]>([]);
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
  const [requiresAuth, setRequiresAuth] = useState(false);
  const loginAttemptedRef = useRef<Set<string>>(new Set());
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<Set<string>>(new Set());

  const isLoadingContent = loading || (viewMode === "cloud" && loadingCloud);


  // Admin login function for cloud systems
  const attemptAdminLogin = useCallback(
    async (targetSystemId: string, systemName: string): Promise<boolean> => {
      // Check if we already attempted for this system in this session
      if (loginAttemptedRef.current.has(targetSystemId)) {
        return false;
      }

      console.log(`[CameraInventory] Attempting Admin login to ${systemName}...`);
      loginAttemptedRef.current.add(targetSystemId);

      const success = await performAdminLogin(targetSystemId);

      if (success) {
        console.log(`[CameraInventory] Admin login success for ${systemName}`);
        setIsLoggedIn((prev) => new Set(prev).add(targetSystemId));
        // Refresh data
        refetch();
        return true;
      } else {
        return false;
      }
    },
    [refetch],
  );

  // Set default system and handle auth
  useEffect(() => {
    const getSystems = async () => {
      try {
        let currentSystems = cloudSystems;
        if (currentSystems.length === 0) {
          setLoadingCloud(true);
          currentSystems = await getCachedCloudSystems();
          setCloudSystems(currentSystems);
        }

        // Use provided systemId or default to first online
        const targetId = systemId || (currentSystems.length > 0 ? (currentSystems.find(s => s.stateOfHealth === "online") || currentSystems[0]).id : "");

        if (targetId && !selectedSystemId) {
          setSelectedSystemId(targetId);
        }

        if (targetId && !isLoggedIn.has(targetId) && !loginAttemptedRef.current.has(targetId)) {
          const system = currentSystems.find(s => s.id === targetId);
          const systemName = system?.name || targetId;
          const success = await attemptAdminLogin(targetId, systemName);
          if (!success && !isLoggedIn.has(targetId)) {
            setRequiresAuth(true);
          }
        }
      } catch (err) {
        console.error("Error fetching systems:", err);
      } finally {
        setLoadingCloud(false);
      }
    };
    getSystems();
  }, [selectedSystemId, systemId, attemptAdminLogin, isLoggedIn.has(selectedSystemId), cloudSystems.length]);

  // Get status description
  const getStatusDescription = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "offline":
        return "The Device is inaccessible.";
      case "unauthorized":
        return "The Device does not have correct credentials in the database.";
      case "recording":
        return "The Camera is online and recording the video stream.";
      case "online":
        return "The Device is online and accessible.";
      case "notdefined":
        return "The Device status is unknown. It may show up while Servers synchronize status information.";
      case "incompatible":
        return "The Server is incompatible (different System name or incompatible protocol version).";
      case "mismatchedcertificate":
        return "Server's DB certificate doesn't match the SSL handshake certificate.";
      default:
        return "Status unknown";
    }
  };

  // Get status color based on status type
  const getStatusBadgeStyle = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "online":
      case "recording":
        return "bg-green-100 text-green-800 border-green-200";
      case "offline":
        return "bg-red-100 text-red-800 border-red-200";
      case "unauthorized":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "notdefined":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "incompatible":
      case "mismatchedcertificate":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };



  // Fetch cameras from a specific cloud system
  const fetchCloudCameras = useCallback(async (system: CloudSystem): Promise<CameraDevice[]> => {
    if (system.stateOfHealth !== "online") return [];

    try {
      const response = await fetch(
        `/api/nx/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) return [];

      const devices = await response.json();
      const cameraDevices = Array.isArray(devices) ? devices : [];

      return cameraDevices.map((device: any) => ({
        ...device,
        systemId: system.id,
        systemName: system.name,
      }));
    } catch (err) {
      console.error(`Error fetching cameras from ${system.name}:`, err);
      return [];
    }
  }, []);

  const fetchAllCloudCameras = useCallback(async () => {
    try {
      setLoadingCloud(true);
      const systems = await getCachedCloudSystems();
      setCloudSystems(systems);

      const cloudPromises = systems.map(async (system) => {
        const cameras = await fetchCloudCameras(system);
        return {
          systemId: system.id,
          systemName: system.name,
          cameras,
          stateOfHealth: system.stateOfHealth,
        };
      });

      const results = await Promise.all(cloudPromises);
      setCamerasBySystem(results);

      // Auto-expand the first system if nothing is expanded yet
      if (results.length > 0) {
        setExpandedSystems((prev) => {
          if (prev.size === 0) {
            return new Set([results[0].systemId]);
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("Error fetching all cloud cameras:", err);
    } finally {
      setLoadingCloud(false);
    }
  }, [fetchCloudCameras]);

  // Toggle system expansion
  const toggleSystemExpansion = (systemId: string) => {
    setExpandedSystems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(systemId)) {
        newSet.delete(systemId);
      } else {
        newSet.add(systemId);
      }
      return newSet;
    });
  };

  // Cloud-only system handling
  useEffect(() => {
    if (viewMode === "cloud") {
      fetchAllCloudCameras();
    } else if (systemId) {
      refetch();
    }
  }, [systemId, refetch, viewMode, fetchAllCloudCameras]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<CameraDevice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    physicalId: "",
    url: "",
    typeId: "",
    mac: "",
    serverId: "",
    vendor: "",
    model: "",
    logicalId: "",
    groupId: "",
    groupName: "",
    credentialsUser: "",
    credentialsPassword: "",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    physicalId: "",
    url: "",
    typeId: "",
    mac: "",
    serverId: "",
    vendor: "",
    model: "",
    logicalId: "",
    groupId: "",
    groupName: "",
    credentialsUser: "",
    credentialsPassword: "",
  });

  // Form error states
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Auto-retry connection when component mounts
  useEffect(() => {
    if (!connected && !loading) {
      testConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set default serverId when servers load
  useEffect(() => {
    if (servers.length > 0 && !createForm.serverId) {
      setCreateForm((prev) => ({ ...prev, serverId: servers[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  const displayCameras = useMemo(() => {
    if (viewMode === "cloud") {
      return camerasBySystem.flatMap((sys) => sys.cameras);
    }
    return (cameras as CameraDevice[]) || [];
  }, [viewMode, camerasBySystem, cameras]);

  // Get unique vendors for filter
  const uniqueVendors = Array.from(new Set(displayCameras.map((c) => c.vendor).filter(Boolean))).sort() as string[];

  const filteredCameras = displayCameras.filter((camera) => {
    // Search filter
    const matchesSearch =
      !searchTerm ||
      camera.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (camera.location || camera.ip || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.model?.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    const matchesStatus = filterStatus === "all" || camera.status?.toLowerCase() === filterStatus.toLowerCase();

    // Vendor filter
    const matchesVendor = filterVendor === "all" || camera.vendor?.toLowerCase() === filterVendor.toLowerCase();

    return matchesSearch && matchesStatus && matchesVendor;
  });

  // Calculate stats based on displayCameras
  const statsSourceCameras = displayCameras;

  const totalCameras = statsSourceCameras.length;
  const onlineCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "online").length;
  const offlineCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "offline").length;
  const recordingCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "recording").length;
  const unauthorizedCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "unauthorized").length;
  const notDefinedCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "notdefined").length;
  const incompatibleCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "incompatible").length;
  const mismatchedCertCameras = statsSourceCameras.filter(
    (c) => c.status?.toLowerCase() === "mismatchedcertificate",
  ).length;

  // Handle Edit Camera
  const handleEditCamera = async (camera: CameraDevice) => {
    setSelectedCamera(camera);

    setEditForm({
      name: camera.name || "",
      physicalId: camera.physicalId || "",
      url: camera.url || "",
      typeId: camera.typeId || "",
      mac: camera.mac || "",
      serverId: camera.serverId || "",
      vendor: camera.vendor || "",
      model: camera.model || "",
      logicalId: camera.logicalId || "",
      groupId: camera.group?.id || "",
      groupName: camera.group?.name || "",
      credentialsUser: camera.credentials?.user || "",
      credentialsPassword: camera.credentials?.password || "",
    });
    setShowEditModal(true);
  };

  // Handle Create Camera
  const handleCreateCamera = async () => {
    try {
      // Clear previous errors
      setCreateErrors({});
      const errors: Record<string, string> = {};

      if (!createForm.name) errors.name = "Camera Name is required";
      if (!createForm.url) errors.url = "URL is required";
      if (!createForm.serverId) errors.serverId = "Server is required";
      if (!createForm.typeId) errors.typeId = "Device Type is required";
      if (!createForm.physicalId) errors.physicalId = "Physical ID is required";

      if (Object.keys(errors).length > 0) {
        setCreateErrors(errors);
        return;
      }

      setIsSubmitting(true);

      const payload = {
        name: createForm.name,
        physicalId: createForm.physicalId,
        url: createForm.url,
        typeId: createForm.typeId,
        mac: createForm.mac,
        serverId: createForm.serverId,
        vendor: createForm.vendor,
        model: createForm.model,
        logicalId: createForm.logicalId,
        group:
          createForm.groupId || createForm.groupName
            ? {
              id: createForm.groupId,
              name: createForm.groupName,
            }
            : undefined,
        credentials: {
          user: createForm.credentialsUser || "",
          password: createForm.credentialsPassword || "",
        },
      };

      const result = await nxAPI.addCamera(payload);

      if (result) {
        alert("Camera created successfully!");
        setShowCreateModal(false);
        // Reset form
        setCreateForm({
          name: "",
          physicalId: "",
          url: "",
          typeId: "",
          mac: "",
          serverId: servers.length > 0 ? servers[0].id : "",
          vendor: "",
          model: "",
          logicalId: "",
          groupId: "",
          groupName: "",
          credentialsUser: "",
          credentialsPassword: "",
        });
        refetch();
      }
    } catch (error: unknown) {
      console.error("[CameraInventory] Failed to create camera:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to create camera: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Update Camera
  const handleUpdateCamera = async () => {
    try {
      if (!selectedCamera) return;

      // Clear previous errors
      setEditErrors({});
      const errors: Record<string, string> = {};

      if (!editForm.name) errors.name = "Camera Name is required";
      if (!editForm.url) errors.url = "URL is required";
      if (!editForm.serverId) errors.serverId = "Server is required";
      if (!editForm.typeId) errors.typeId = "Device Type is required";
      if (!editForm.physicalId) errors.physicalId = "Physical ID is required";

      if (Object.keys(errors).length > 0) {
        setEditErrors(errors);
        return;
      }

      setIsSubmitting(true);

      const payload = {
        id: selectedCamera.id,
        name: editForm.name,
        physicalId: editForm.physicalId,
        url: editForm.url,
        typeId: editForm.typeId,
        mac: editForm.mac,
        serverId: editForm.serverId,
        vendor: editForm.vendor,
        model: editForm.model,
        logicalId: editForm.logicalId,
        group:
          editForm.groupId || editForm.groupName
            ? {
              id: editForm.groupId,
              name: editForm.groupName,
            }
            : undefined,
        credentials: {
          user: editForm.credentialsUser,
          password: editForm.credentialsPassword,
        },
      };

      const result = await nxAPI.updateCamera(selectedCamera.id, payload);

      if (result) {
        alert("Camera updated successfully!");
        setShowEditModal(false);
        setSelectedCamera(null);
        refetch();
      }
    } catch (error: unknown) {
      console.error("[CameraInventory] Failed to update camera:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to update camera: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Camera
  const handleDeleteCamera = async (camera: CameraDevice) => {
    const confirmDelete = confirm(
      `Are you sure you want to delete camera "${camera.name}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmDelete) return;

    try {
      setIsSubmitting(true);
      await nxAPI.deleteCamera(camera.id);
      alert("Camera deleted successfully!");
      // Force refresh the camera list
      await refetch();
    } catch (error: unknown) {
      console.error("[CameraInventory] Failed to delete camera:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // If it's a JSON parse error but the delete might have succeeded, still refresh
      if (errorMessage.includes("JSON") || errorMessage.includes("Unexpected end")) {
        alert("Camera may have been deleted. Refreshing list...");
        await refetch();
      } else {
        alert(`Failed to delete camera: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    return status?.toLowerCase() === "online" ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-600" />
    );
  };

  // Render Create Modal Content (now moved into main render)
  const renderCreateModal = () => {
    return (
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-semibold text-gray-900">Create New Camera</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Camera Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.name ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
                placeholder="Camera 1"
              />
              {createErrors.name && <p className="text-xs text-red-500 mt-1">{createErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createForm.url}
                onChange={(e) => setCreateForm({ ...createForm, url: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.url ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
                placeholder="rtsp://192.168.1.100:554/stream"
              />
              {createErrors.url && <p className="text-xs text-red-500 mt-1">{createErrors.url}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Server <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.serverId}
                onChange={(e) => setCreateForm({ ...createForm, serverId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.serverId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name || server.id}
                  </option>
                ))}
              </select>
              {createErrors.serverId && <p className="text-xs text-red-500 mt-1">{createErrors.serverId}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Device Type <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.typeId}
                onChange={(e) => setCreateForm({ ...createForm, typeId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.typeId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Device Type</option>
                {deviceType.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} - {type.manufacturer}
                  </option>
                ))}
              </select>
              {createErrors.typeId && <p className="text-xs text-red-500 mt-1">{createErrors.typeId}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  Physical ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.physicalId}
                  onChange={(e) => setCreateForm({ ...createForm, physicalId: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.physicalId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                    }`}
                />
                {createErrors.physicalId && <p className="text-xs text-red-500 mt-1">{createErrors.physicalId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                <input
                  type="text"
                  value={createForm.mac}
                  onChange={(e) => setCreateForm({ ...createForm, mac: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={createForm.vendor}
                  onChange={(e) => setCreateForm({ ...createForm, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={createForm.model}
                  onChange={(e) => setCreateForm({ ...createForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logical ID</label>
              <input
                type="text"
                value={createForm.logicalId}
                onChange={(e) => setCreateForm({ ...createForm, logicalId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="border-t pt-3 md:pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 md:mb-3">Credentials</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={createForm.credentialsUser}
                    onChange={(e) => setCreateForm({ ...createForm, credentialsUser: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={createForm.credentialsPassword}
                    onChange={(e) => setCreateForm({ ...createForm, credentialsPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4">
            <Button
              onClick={() => setShowCreateModal(false)}
              disabled={isSubmitting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCamera} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              {isSubmitting ? "Creating..." : "Create Camera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Render Edit Modal Content
  const renderEditModal = () => {
    if (!selectedCamera) return null;

    return (
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-semibold text-gray-900">Edit Camera</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Camera ID</label>
              <input
                type="text"
                value={selectedCamera.id}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-xs sm:text-sm truncate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Camera Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.name ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              />
              {editErrors.name && <p className="text-xs text-red-500 mt-1">{editErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.url ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              />
              {editErrors.url && <p className="text-xs text-red-500 mt-1">{editErrors.url}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Server <span className="text-red-500">*</span>
              </label>
              <select
                value={editForm.serverId}
                onChange={(e) => setEditForm({ ...editForm, serverId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.serverId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name || server.id}
                  </option>
                ))}
              </select>
              {editErrors.serverId && <p className="text-xs text-red-500 mt-1">{editErrors.serverId}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Device Type <span className="text-red-500">*</span>
              </label>
              <select
                value={editForm.typeId}
                onChange={(e) => setEditForm({ ...editForm, typeId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.typeId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Device Type</option>
                {deviceType.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} - {type.manufacturer}
                  </option>
                ))}
              </select>
              {editErrors.typeId && <p className="text-xs text-red-500 mt-1">{editErrors.typeId}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  Physical ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.physicalId}
                  onChange={(e) => setEditForm({ ...editForm, physicalId: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.physicalId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                    }`}
                />
                {editErrors.physicalId && <p className="text-xs text-red-500 mt-1">{editErrors.physicalId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                <input
                  type="text"
                  value={editForm.mac}
                  onChange={(e) => setEditForm({ ...editForm, mac: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={editForm.vendor}
                  onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logical ID</label>
              <input
                type="text"
                value={editForm.logicalId}
                onChange={(e) => setEditForm({ ...editForm, logicalId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="border-t pt-3 md:pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 md:mb-3">Credentials</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={editForm.credentialsUser}
                    onChange={(e) => setEditForm({ ...editForm, credentialsUser: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={editForm.credentialsPassword}
                    onChange={(e) => setEditForm({ ...editForm, credentialsPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4">
            <Button
              onClick={() => {
                setShowEditModal(false);
                setSelectedCamera(null);
              }}
              disabled={isSubmitting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateCamera} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              {isSubmitting ? "Updating..." : "Update Camera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };


  return (
    <div className="space-y-4 md:space-y-6">
      {/* Modals */}
      {renderCreateModal()}
      {renderEditModal()}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Camera Inventory</h1>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-xs sm:text-sm text-gray-600">{connected ? "Connected" : "Disconnected"}</span>
            {error && <AlertCircle className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 py-2 rounded-lg"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </Button>

          <Button
            onClick={() => {
              if (viewMode === "cloud") {
                fetchAllCloudCameras();
              } else {
                refetch();
              }
              testConnection();
            }}
            disabled={loading || loadingCloud}
            className="flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50"
            variant="outline"
          >
            {loading || loadingCloud ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <div className="flex items-center bg-white rounded-lg border p-1">
            <button
              onClick={() => setViewMode("cloud")}
              className={`p-2 rounded ${viewMode === "cloud" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
              title="Systems View"
            >
              <Cloud className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded ${viewMode === "grid" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded ${viewMode === "list" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <CloudLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        systemId={selectedSystemId}
        systemName={cloudSystems.find(s => s.id === selectedSystemId)?.name || selectedSystemId}
        onLoginSuccess={() => {
          setIsLoggedIn((prev) => new Set(prev).add(selectedSystemId));
          setRequiresAuth(false);
          refetch();
          testConnection();
        }}
      />

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search cameras, location, vendor..."
            className="pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center justify-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50 ${filterStatus !== "all" ||
                filterVendor !== "all"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : ""
                }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {(filterStatus !== "all" ||
                filterVendor !== "all") && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                    {
                      [
                        filterStatus !== "all",
                        filterVendor !== "all",
                      ].filter(Boolean).length
                    }
                  </span>
                )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
                <h4 className="font-semibold text-gray-900">Filters</h4>
                {(filterStatus !== "all" ||
                  filterVendor !== "all") && (
                    <button
                      onClick={() => {
                        setFilterStatus("all");
                        setFilterVendor("all");
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Clear all
                    </button>
                  )}
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="recording">Recording</option>
                  <option value="unauthorized">Unauthorized</option>
                </select>
              </div>

              {/* Vendor Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select
                  value={filterVendor}
                  onChange={(e) => setFilterVendor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Vendors</option>
                  {uniqueVendors.map((vendor) => (
                    <option key={vendor} value={vendor.toLowerCase()}>
                      {vendor}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setShowFilters(false)}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 sticky bottom-0"
              >
                Apply Filters
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
        <div className="bg-white p-2 md:p-3 rounded-lg border">
          <div className="text-lg md:text-xl font-bold text-gray-900">{totalCameras}</div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-green-200 bg-green-50">
          <div className="text-lg md:text-xl font-bold text-green-600">{onlineCameras}</div>
          <div className="text-xs text-gray-600">Online</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-red-200 bg-red-50">
          <div className="text-lg md:text-xl font-bold text-red-600">{offlineCameras}</div>
          <div className="text-xs text-gray-600">Offline</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-blue-200 bg-blue-50">
          <div className="text-lg md:text-xl font-bold text-blue-600">{recordingCameras}</div>
          <div className="text-xs text-gray-600">Recording</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-yellow-200 bg-yellow-50">
          <div className="text-lg md:text-xl font-bold text-yellow-600">{unauthorizedCameras}</div>
          <div className="text-xs text-gray-600">Unauthorized</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-gray-200 bg-gray-50">
          <div className="text-lg md:text-xl font-bold text-gray-500">{notDefinedCameras}</div>
          <div className="text-xs text-gray-600">NotDefined</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-orange-200 bg-orange-50">
          <div className="text-lg md:text-xl font-bold text-orange-600">{incompatibleCameras}</div>
          <div className="text-xs text-gray-600">Incompatible</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-purple-200 bg-purple-50">
          <div className="text-lg md:text-xl font-bold text-purple-600">{mismatchedCertCameras}</div>
          <div className="text-xs text-gray-600 truncate" title="Mismatched Certificate">
            Mismatched Cert
          </div>
        </div>
      </div>

      {/* Camera Grid/List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {isLoadingContent ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span className="text-gray-600">Loading cameras...</span>
          </div>
        ) : viewMode !== "cloud" && servers.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-center">
            <div className="space-y-4">
              <Server className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="text-lg font-medium text-gray-900">No Server Available</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Your system is connected but no servers are currently detected.
              </p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>
          </div>
        ) : viewMode !== "cloud" && displayCameras.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-center text-gray-500">
            <div className="space-y-4">
              <Camera className="w-12 h-12 text-gray-300 mx-auto" />
              <p>No camera detected in this system.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Add Camera
                </Button>
                <Button onClick={() => refetch()} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
              </div>
            </div>
          </div>
        ) : filteredCameras.length === 0 && viewMode !== "cloud" ? (
          <div className="flex items-center justify-center p-12 text-center text-gray-500">
            <div className="space-y-4">
              <Search className="w-12 h-12 text-gray-300 mx-auto" />
              <p>No cameras found matching your search and filter criteria.</p>
            </div>
          </div>
        ) : null}

        {/* Cloud View - All Systems with Cameras */}
        {viewMode === "cloud" && !isLoadingContent && (
          <div className="p-3 md:p-6 w-full">
            {camerasBySystem.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <Cloud className="w-6 h-6 mr-2" />
                <span>No systems found</span>
              </div>
            ) : (
              <div className="space-y-4">
                {camerasBySystem.map((systemData) => {
                  const isExpanded = expandedSystems.has(systemData.systemId);
                  const isOnline = systemData.stateOfHealth === "online";

                  // Filter cameras for this system
                  const filteredSystemCameras = systemData.cameras.filter((cam) => {
                    const matchesSearch =
                      !searchTerm ||
                      cam.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.model?.toLowerCase().includes(searchTerm.toLowerCase());

                    const matchesStatus =
                      filterStatus === "all" || cam.status?.toLowerCase() === filterStatus.toLowerCase();
                    const matchesVendor =
                      filterVendor === "all" || cam.vendor?.toLowerCase() === filterVendor.toLowerCase();

                    return (
                      matchesSearch &&
                      matchesStatus &&
                      matchesVendor
                    );
                  });

                  const onlineCount = filteredSystemCameras.filter((c) => c.status?.toLowerCase() === "online").length;
                  const offlineCount = filteredSystemCameras.filter(
                    (c) => c.status?.toLowerCase() === "offline",
                  ).length;

                  return (
                    <div key={systemData.systemId} className="border rounded-lg overflow-hidden">
                      {/* System Header */}
                      <button
                        onClick={() => toggleSystemExpansion(systemData.systemId)}
                        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                          <Server className="w-5 h-5 text-blue-600" />
                          <div className="text-left">
                            <div className="font-semibold text-gray-900">{systemData.systemName}</div>
                            <div className="text-xs text-gray-500">
                              {filteredSystemCameras.length} cameras
                              {searchTerm ||
                                filterStatus !== "all" ||
                                filterVendor !== "all"
                                ? ` (filtered from ${systemData.cameras.length})`
                                : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1 text-green-600">
                              <Wifi className="w-3 h-3" /> {onlineCount}
                            </span>
                            <span className="flex items-center gap-1 text-red-600">
                              <WifiOff className="w-3 h-3" /> {offlineCount}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${isOnline ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              }`}
                          >
                            {isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </button>

                      {/* System Cameras */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          {!isOnline ? (
                            <div className="p-6 text-center text-gray-500">
                              <WifiOff className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              <p>System is offline. Cannot fetch cameras.</p>
                            </div>
                          ) : filteredSystemCameras.length === 0 ? (
                            <div className="p-6 text-center text-gray-500">
                              <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              <p>
                                {systemData.cameras.length === 0
                                  ? "No cameras in this system"
                                  : "No cameras match your search"}
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {filteredSystemCameras.map((camera) => (
                                <div
                                  key={`${systemData.systemId}-${camera.id}`}
                                  className="border rounded-lg p-3 hover:shadow-md transition-shadow bg-white flex flex-col h-full min-h-[200px]"
                                >
                                  {/* Header */}
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <Camera className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                      <span className="font-medium text-gray-900 text-sm truncate" title={camera.name}>
                                        {camera.name}
                                      </span>
                                    </div>
                                    {camera.status?.toLowerCase() === "online" ? (
                                      <Wifi className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    ) : (
                                      <WifiOff className="w-4 h-4 text-red-600 flex-shrink-0" />
                                    )}
                                  </div>

                                  {/* Camera Info */}
                                  <div className="space-y-0.5 text-xs text-gray-600">
                                    {camera.model && <div className="truncate">Model: {camera.model}</div>}
                                    {camera.vendor && <div className="truncate">Vendor: {camera.vendor}</div>}
                                    {camera.mac && <div className="truncate">MAC: {camera.mac}</div>}
                                    {camera.physicalId && <div className="truncate">ID: {camera.physicalId}</div>}
                                    {camera.typeId && <div className="truncate text-gray-500">Type: {camera.typeId}</div>}
                                    {camera.url && <div className="truncate text-gray-500" title={camera.url}>URL: {camera.url}</div>}
                                    {!camera.model && !camera.vendor && !camera.mac && !camera.physicalId && !camera.typeId && !camera.url && (
                                      <div className="text-gray-400 italic">No technical info available</div>
                                    )}
                                  </div>

                                  {/* Status Badge */}
                                  <div className="flex items-center justify-between mt-auto pt-2 border-t">
                                    <div className="group relative">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                                          camera.status || "",
                                        )}`}
                                      >
                                        {camera.status || "Unknown"}
                                      </span>
                                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                                        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 max-w-xs shadow-lg">
                                          <div className="font-semibold mb-1">{camera.status || "Unknown"}</div>
                                          <div className="text-gray-300">
                                            {getStatusDescription(camera.status || "")}
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-4 w-2 h-2 bg-gray-900 transform rotate-45 -mt-1"></div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Grid View */}
        {!loading && viewMode === "grid" && filteredCameras.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 p-3 md:p-6">
            {filteredCameras.map((camera) => (
              <div key={camera.id} className="border rounded-lg p-3 md:p-4 hover:shadow-md transition-shadow bg-white">
                <div className="flex items-start justify-between mb-2 md:mb-3">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <Camera className="w-4 h-4 md:w-5 md:h-5 text-gray-600 flex-shrink-0" />
                    <span className="font-medium text-gray-900 text-sm md:text-base truncate">{camera.name}</span>
                  </div>
                  {getStatusIcon(camera.status)}
                </div>

                <div className="space-y-1 md:space-y-2 text-xs md:text-sm text-gray-600">
                  <div className="truncate">Model: {camera.model || "Unknown"}</div>
                  {camera.vendor && <div className="truncate hidden sm:block">Vendor: {camera.vendor}</div>}
                </div>

                <div className="flex items-center justify-between mt-3 md:mt-4 pt-2 md:pt-3 border-t">
                  <span
                    className={`px-2 py-0.5 md:py-1 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                      camera.status,
                    )}`}
                    title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                  >
                    {camera.status}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleEditCamera(camera)}
                      className="p-1.5 md:p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit camera"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCamera(camera)}
                      className="p-1.5 md:p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete camera"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List View */}
        {!loading && viewMode === "list" && filteredCameras.length > 0 && (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Camera
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type/Model
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCameras.map((camera) => (
                    <tr key={camera.id} className="hover:bg-gray-50">
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Camera className="w-5 h-5 text-gray-600 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{camera.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{camera.vendor || "-"}</div>
                        <div className="text-sm text-gray-500">{camera.model || "-"}</div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(camera.status)}
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                              camera.status,
                            )}`}
                            title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                          >
                            {camera.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditCamera(camera)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Edit camera"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCamera(camera)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete camera"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for List Mode */}
            <div className="md:hidden space-y-3 p-3">
              {filteredCameras.map((camera) => (
                <div key={camera.id} className="bg-white border rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <Camera className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">{camera.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {camera.location || camera.ip || "Lokasi belum diatur"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(camera.status)}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                          camera.status,
                        )}`}
                        title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                      >
                        {camera.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <div className="text-xs text-gray-500">
                      <span>{camera.vendor || "-"}</span>
                      {camera.model && <span> / {camera.model}</span>}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditCamera(camera)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCamera(camera)}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {requiresAuth && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-xl border max-w-sm w-full text-center">
            <Shield className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Admin Login Required</h3>
            <p className="text-sm text-gray-600 mb-6">
              To manage cameras and inventory, you need to log in with system administrator credentials.
            </p>
            <Button
              onClick={() => setShowLoginDialog(true)}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login Admin
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}