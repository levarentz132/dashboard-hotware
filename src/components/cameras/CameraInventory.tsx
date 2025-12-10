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
  MapPin,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useCameras, useDeviceType } from "@/hooks/useNxAPI-camera";
import { useServers } from "@/hooks/useNxAPI-server";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { nxAPI } from "@/lib/nxapi";
import { Button } from "../ui/button";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
}

interface CloudCamera {
  id: string;
  name: string;
  physicalId?: string;
  url?: string;
  typeId?: string;
  mac?: string;
  serverId?: string;
  vendor?: string;
  model?: string;
  logicalId?: string;
  status?: string;
  systemId: string;
  systemName: string;
}

interface CamerasBySystem {
  systemId: string;
  systemName: string;
  stateOfHealth: string;
  accessRole: string;
  cameras: CloudCamera[];
  expanded: boolean;
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

export default function CameraInventory() {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "cloud">("cloud");
  const [searchTerm, setSearchTerm] = useState("");

  // API hooks
  const { cameras, loading, error, refetch } = useCameras();
  const { connected, testConnection } = useSystemInfo();
  const { servers } = useServers();
  const { deviceType } = useDeviceType();

  // Cloud cameras state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [camerasBySystem, setCamerasBySystem] = useState<CamerasBySystem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) return [];

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
      return systems;
    } catch (err) {
      console.error("Error fetching cloud systems:", err);
      return [];
    }
  }, []);

  // Fetch cameras from a specific cloud system
  const fetchCloudCameras = useCallback(async (system: CloudSystem): Promise<CloudCamera[]> => {
    if (system.stateOfHealth !== "online") return [];

    try {
      // Use local API proxy to avoid CORS and handle auth
      const response = await fetch(
        `/api/cloud/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.requiresAuth) {
          console.log(`[CloudCameras] Auth required for ${system.name} - skipping (you're not the owner)`);
        }
        return [];
      }

      const devices = await response.json();
      const cameraDevices = Array.isArray(devices) ? devices : [];

      return cameraDevices.map((device: Record<string, unknown>) => ({
        ...device,
        id: device.id as string,
        name: device.name as string,
        systemId: system.id,
        systemName: system.name,
      }));
    } catch (err) {
      console.error(`Error fetching cameras from ${system.name}:`, err);
      return [];
    }
  }, []);

  // Fetch all cloud cameras
  const fetchAllCloudCameras = useCallback(async () => {
    setLoadingCloud(true);
    const systems = await fetchCloudSystems();

    // Only fetch from systems where user has owner access (to avoid auth dialogs)
    // Other systems will show "Requires authentication" message
    const camerasData: CamerasBySystem[] = await Promise.all(
      systems.map(async (system) => {
        // Try to fetch cameras - proxy will handle auth errors gracefully
        const cameras = await fetchCloudCameras(system);
        return {
          systemId: system.id,
          systemName: system.name,
          stateOfHealth: system.stateOfHealth,
          accessRole: system.accessRole,
          cameras,
          expanded: true,
        };
      })
    );

    setCamerasBySystem(camerasData);
    // Expand all systems by default
    setExpandedSystems(new Set(systems.map((s) => s.id)));
    setLoadingCloud(false);
  }, [fetchCloudSystems, fetchCloudCameras]);

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

  // Initial cloud fetch
  useEffect(() => {
    fetchAllCloudCameras();
  }, [fetchAllCloudCameras]);

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

  const displayCameras = cameras as CameraDevice[];

  const getStatusIcon = (status: string) => {
    return status?.toLowerCase() === "online" ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-600" />
    );
  };

  const getStatusColor = (status: string) => {
    return status?.toLowerCase() === "online"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-red-100 text-red-800 border-red-200";
  };

  const filteredCameras = displayCameras.filter(
    (camera) =>
      camera.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (camera.location || camera.ip || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const totalCameras = displayCameras.length;
  const onlineCameras = displayCameras.filter((c) => c.status?.toLowerCase() === "online").length;
  const offlineCameras = totalCameras - onlineCameras;
  const recordingCameras = displayCameras.filter(
    (c) => c.status?.toLowerCase() === "recording" || c.status?.toLowerCase() === "online"
  ).length;

  // Handle Edit Camera
  const handleEditCamera = (camera: CameraDevice) => {
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
      if (!createForm.name || !createForm.url || !createForm.serverId) {
        alert("Please fill in required fields: Name, URL, and Server");
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

      console.log("[CameraInventory] Creating camera with payload:", payload);

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

      if (!editForm.name || !editForm.url || !editForm.serverId) {
        alert("Please fill in required fields: Name, URL, and Server");
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

      console.log("[CameraInventory] Updating camera with payload:", payload);

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
      `Are you sure you want to delete camera "${camera.name}"?\n\nThis action cannot be undone.`
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

  // Render Create Modal
  const renderCreateModal = () => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 md:p-4">
        <div className="bg-white rounded-lg p-4 md:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">Create New Camera</h2>

          <div className="space-y-3 md:space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Camera Name *</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Camera 1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
              <input
                type="text"
                value={createForm.url}
                onChange={(e) => setCreateForm({ ...createForm, url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="rtsp://192.168.1.100:554/stream"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Server *</label>
              <select
                value={createForm.serverId}
                onChange={(e) => setCreateForm({ ...createForm, serverId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select Server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name || server.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Device Type</label>
              <select
                value={createForm.typeId}
                onChange={(e) => setCreateForm({ ...createForm, typeId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select Device Type</option>
                {deviceType.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} - {type.manufacturer}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Physical ID</label>
                <input
                  type="text"
                  value={createForm.physicalId}
                  onChange={(e) => setCreateForm({ ...createForm, physicalId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
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

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4 md:mt-6">
            <Button
              onClick={() => setShowCreateModal(false)}
              disabled={isSubmitting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCamera} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "Creating..." : "Create Camera"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Render Edit Modal
  const renderEditModal = () => {
    if (!selectedCamera) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 md:p-4">
        <div className="bg-white rounded-lg p-4 md:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">Edit Camera</h2>

          <div className="space-y-3 md:space-y-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Camera Name *</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
              <input
                type="text"
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Server *</label>
              <select
                value={editForm.serverId}
                onChange={(e) => setEditForm({ ...editForm, serverId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select Server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name || server.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Device Type</label>
              <select
                value={editForm.typeId}
                onChange={(e) => setEditForm({ ...editForm, typeId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select Device Type</option>
                {deviceType.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} - {type.manufacturer}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Physical ID</label>
                <input
                  type="text"
                  value={editForm.physicalId}
                  onChange={(e) => setEditForm({ ...editForm, physicalId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
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

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4 md:mt-6">
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
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "Updating..." : "Update Camera"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Show empty state when no cameras found and not loading
  if (!loading && displayCameras.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6">
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
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 text-white rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span className="sm:inline">Add Camera</span>
            </Button>

            <Button
              onClick={() => {
                refetch();
                testConnection();
              }}
              className="flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50"
              variant="outline"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Modals */}
        {showCreateModal && renderCreateModal()}

        {/* Empty State */}
        <div className="bg-white rounded-lg border p-8 md:p-12 text-center">
          <Camera className="h-12 w-12 md:h-16 md:w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-base md:text-lg font-medium text-gray-900 mb-2">No Cameras Found</h3>
          <p className="text-sm md:text-base text-gray-500 mb-6">
            {error
              ? "Unable to connect to Nx Witness server. Please check your server configuration."
              : "No cameras configured. Click 'Add Camera' to add one."}
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-xs sm:text-sm mb-6">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Modals */}
      {showCreateModal && renderCreateModal()}
      {showEditModal && renderEditModal()}

      {/* Header */}
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
              refetch();
              testConnection();
              fetchAllCloudCameras();
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
              title="Cloud Systems View"
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

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search cameras..."
            className="pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center justify-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-3 md:p-4 rounded-lg border">
          <div className="text-xl md:text-2xl font-bold text-gray-900">{totalCameras}</div>
          <div className="text-xs md:text-sm text-gray-600">Total Cameras</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg border">
          <div className="text-xl md:text-2xl font-bold text-green-600">{onlineCameras}</div>
          <div className="text-xs md:text-sm text-gray-600">Online</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg border">
          <div className="text-xl md:text-2xl font-bold text-red-600">{offlineCameras}</div>
          <div className="text-xs md:text-sm text-gray-600">Offline</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg border">
          <div className="text-xl md:text-2xl font-bold text-blue-600">{recordingCameras}</div>
          <div className="text-xs md:text-sm text-gray-600">Recording</div>
        </div>
      </div>

      {/* Camera Grid/List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span className="text-gray-600">Loading cameras...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center p-8 text-red-600">
            <AlertCircle className="w-6 h-6 mr-2" />
            <span>Error loading cameras: {error}</span>
          </div>
        )}

        {!loading && !error && filteredCameras.length === 0 && viewMode !== "cloud" && (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <Camera className="w-6 h-6 mr-2" />
            <span>No cameras found</span>
          </div>
        )}

        {/* Cloud View - Cameras grouped by System */}
        {viewMode === "cloud" && (
          <div className="p-3 md:p-6">
            {loadingCloud ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">Loading cloud systems...</span>
              </div>
            ) : camerasBySystem.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <Cloud className="w-6 h-6 mr-2" />
                <span>No cloud systems found</span>
              </div>
            ) : (
              <div className="space-y-4">
                {camerasBySystem.map((system) => {
                  const isExpanded = expandedSystems.has(system.systemId);
                  const isOnline = system.stateOfHealth === "online";
                  const filteredSystemCameras = system.cameras.filter(
                    (cam) =>
                      cam.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.id?.toLowerCase().includes(searchTerm.toLowerCase())
                  );

                  return (
                    <div
                      key={system.systemId}
                      className={`border rounded-lg overflow-hidden ${
                        isOnline ? "border-green-200" : "border-gray-200"
                      }`}
                    >
                      {/* System Header */}
                      <div
                        className={`flex items-center justify-between p-4 cursor-pointer ${
                          isOnline ? "bg-green-50 hover:bg-green-100" : "bg-gray-50 hover:bg-gray-100"
                        }`}
                        onClick={() => toggleSystemExpansion(system.systemId)}
                      >
                        <div className="flex items-center space-x-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                          <Server className={`w-5 h-5 ${isOnline ? "text-green-600" : "text-gray-400"}`} />
                          <div>
                            <h3 className="font-semibold text-gray-900">{system.systemName}</h3>
                            <p className="text-xs text-gray-500">
                              {system.cameras.length} camera{system.cameras.length !== 1 ? "s" : ""} •{" "}
                              <span className={isOnline ? "text-green-600" : "text-red-500"}>
                                {isOnline ? "Online" : "Offline"}
                              </span>
                              {system.accessRole === "owner" ? (
                                <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                                  Owner
                                </span>
                              ) : (
                                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                  {system.accessRole}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">{filteredSystemCameras.length} shown</span>
                        </div>
                      </div>

                      {/* Cameras List */}
                      {isExpanded && (
                        <div className="border-t">
                          {!isOnline ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              System is offline. Cannot fetch cameras.
                            </div>
                          ) : system.cameras.length === 0 && system.accessRole !== "owner" ? (
                            <div className="p-4 text-center text-yellow-600 text-sm bg-yellow-50">
                              <AlertCircle className="w-4 h-4 inline mr-2" />
                              You don&apos;t have owner access to this system. Login to NX Cloud with the owner account
                              to view cameras.
                            </div>
                          ) : filteredSystemCameras.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              {system.cameras.length === 0
                                ? "No cameras in this system"
                                : "No cameras match your search"}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                              {filteredSystemCameras.map((camera) => (
                                <div
                                  key={`${system.systemId}-${camera.id}`}
                                  className="border rounded-lg p-3 hover:shadow-md transition-shadow bg-white"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <Camera className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                      <span className="font-medium text-gray-900 text-sm truncate">{camera.name}</span>
                                    </div>
                                    {camera.status?.toLowerCase() === "online" ? (
                                      <Wifi className="w-4 h-4 text-green-600" />
                                    ) : (
                                      <WifiOff className="w-4 h-4 text-red-600" />
                                    )}
                                  </div>

                                  <div className="space-y-1 text-xs text-gray-600">
                                    {camera.model && <div className="truncate">Model: {camera.model}</div>}
                                    {camera.vendor && <div className="truncate">Vendor: {camera.vendor}</div>}
                                    {camera.mac && <div className="truncate">MAC: {camera.mac}</div>}
                                    <div className="truncate text-gray-400">Location: Jakarta Barat (Data dummy)</div>
                                  </div>

                                  <div className="flex items-center justify-between mt-3 pt-2 border-t">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                        camera.status?.toLowerCase() === "online"
                                          ? "bg-green-100 text-green-800 border-green-200"
                                          : "bg-red-100 text-red-800 border-red-200"
                                      }`}
                                    >
                                      {camera.status || "Unknown"}
                                    </span>
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
                  <div className="flex items-center space-x-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{camera.location || camera.ip || "Unknown"}</span>
                  </div>
                  <div className="truncate">Model: {camera.model || "Unknown"}</div>
                  <div className="truncate">IP: {camera.ip}</div>
                  {camera.vendor && <div className="truncate hidden sm:block">Vendor: {camera.vendor}</div>}
                </div>

                <div className="flex items-center justify-between mt-3 md:mt-4 pt-2 md:pt-3 border-t">
                  <span
                    className={`px-2 py-0.5 md:py-1 rounded-full text-xs font-medium border ${getStatusColor(
                      camera.status
                    )}`}
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
                            <div className="text-xs text-gray-500 font-mono truncate max-w-[150px]">{camera.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {camera.location || camera.ip || "-"}
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{camera.vendor || "-"}</div>
                        <div className="text-sm text-gray-500">{camera.model || "-"}</div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(camera.status)}
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                              camera.status
                            )}`}
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
                        <div className="text-xs text-gray-500 truncate">{camera.location || camera.ip || "-"}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(camera.status)}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                          camera.status
                        )}`}
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
    </div>
  );
}
