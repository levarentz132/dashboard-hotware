"use client";

import { Database, HardDrive, TrendingUp, AlertCircle, Server, Trash2, Settings, Download, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { nxAPI } from "@/lib/nxapi";

interface StorageDevice {
  id: string;
  serverId: string;
  name: string;
  path: string;
  type: "local" | "network" | "cloud";
  spaceLimitB: number;
  totalSpace: string;
  usedSpace: string;
  freeSpace: string;
  usagePercentage: number;
  isUsedForWriting: boolean;
  isBackup: boolean;
  status: "healthy" | "warning" | "critical";
  rawStatus: string;
  parameters?: Record<string, any>;
}

// Helper function to format bytes to human-readable format
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

export default function StorageManagement() {
  const [loading, setLoading] = useState(true);
  const [storageDevices, setStorageDevices] = useState<StorageDevice[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStorage, setSelectedStorage] = useState<StorageDevice | null>(null);
  const [servers, setServers] = useState<any[]>([]);
  const [createForm, setCreateForm] = useState({
    serverId: "",
    name: "",
    path: "",
    type: "local",
    spaceLimitB: 0,
    isUsedForWriting: true,
    isBackup: false,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    path: "",
    type: "local",
    spaceLimitB: 0,
    isUsedForWriting: true,
    isBackup: false,
    status: "Offline",
  });
  const [totalStorage, setTotalStorage] = useState({
    total: "0 Bytes",
    used: "0 Bytes",
    free: "0 Bytes",
    usagePercentage: 0,
  });

  useEffect(() => {
    const fetchStorageData = async () => {
      try {
        setLoading(true);

        // Fetch servers for the create form
        const serverList = await nxAPI.getServers();
        if (serverList && Array.isArray(serverList)) {
          setServers(serverList);
          if (serverList.length > 0 && !createForm.serverId) {
            setCreateForm((prev) => ({ ...prev, serverId: serverList[0].id }));
          }
        }

        // Try to fetch comprehensive storage data from API
        const storageData = await nxAPI.getAllStorageData();
        console.log("[StorageManagement] Raw storage data:", storageData);

        if (storageData && storageData.servers && storageData.servers.length > 0) {
          // Process real storage data from Nx Witness API
          const devices: StorageDevice[] = [];
          let totalCapacityBytes = 0;
          let usedSpaceBytes = 0;

          storageData.servers.forEach((server: any) => {
            console.log("[StorageManagement] Processing server:", server.serverId, "storages:", server.storages);

            if (Array.isArray(server.storages)) {
              server.storages.forEach((storage: any) => {
                console.log("[StorageManagement] Storage item:", storage);

                const spaceLimitBytes = storage.spaceLimitB || 0;
                const isOnline = storage.status === "Online";
                const isBackup = storage.isBackup || false;
                const isUsedForWriting = storage.isUsedForWriting || false;

                // Add to total capacity
                totalCapacityBytes += spaceLimitBytes;

                // Extract storage status from parameters if available
                const statusFlags = storage.parameters?.persistentStorageStatusFlags || "";
                const hasDBReady = statusFlags.includes("dbReady");
                const isSystemStorage = statusFlags.includes("system");

                devices.push({
                  id: storage.id,
                  serverId: storage.serverId || server.serverId,
                  name: `${storage.name}${isSystemStorage ? " (System)" : ""}${isBackup ? " (Backup)" : ""}`,
                  path: storage.path || "Unknown path",
                  type: storage.type === "local" ? "local" : storage.type === "network" ? "network" : "cloud",
                  spaceLimitB: spaceLimitBytes,
                  totalSpace: formatBytes(spaceLimitBytes),
                  usedSpace: isUsedForWriting ? "In Use" : "Not Used",
                  freeSpace: formatBytes(spaceLimitBytes),
                  usagePercentage: 0,
                  isUsedForWriting: isUsedForWriting,
                  isBackup: isBackup,
                  status: isOnline && hasDBReady ? "healthy" : isOnline ? "warning" : "critical",
                  rawStatus: storage.status,
                  parameters: storage.parameters || {},
                });
              });
            }
          });

          console.log("[StorageManagement] Processed devices:", devices);
          console.log("[StorageManagement] Total capacity bytes:", totalCapacityBytes);

          if (devices.length > 0) {
            setStorageDevices(devices);
            setTotalStorage({
              total: formatBytes(totalCapacityBytes),
              used: "N/A",
              free: formatBytes(totalCapacityBytes),
              usagePercentage: 0,
            });
          }
        } else {
          console.log("[StorageManagement] No storage data available");
        }
      } catch (error) {
        console.error("Failed to fetch storage data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStorageData();
  }, []);

  const handleEditStorage = (device: StorageDevice) => {
    setSelectedStorage(device);
    setEditForm({
      name: device.name,
      path: device.path,
      type: device.type,
      spaceLimitB: device.spaceLimitB,
      isUsedForWriting: device.isUsedForWriting,
      isBackup: device.isBackup,
      status: device.rawStatus,
    });
    setShowEditModal(true);
  };

  const handleUpdateStorage = async () => {
    try {
      if (!selectedStorage) return;

      const result = await nxAPI.updateStorage(selectedStorage.serverId, selectedStorage.id, {
        name: editForm.name,
        path: editForm.path,
        type: editForm.type,
        spaceLimitB: editForm.spaceLimitB,
        isUsedForWriting: editForm.isUsedForWriting,
        isBackup: editForm.isBackup,
        status: editForm.status,
      });

      if (result) {
        alert("Storage updated successfully!");
        setShowEditModal(false);
        setSelectedStorage(null);
        // Refresh storage list
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to update storage:", error);
      alert("Failed to update storage. Please check the console for details.");
    }
  };

  const handleDeleteStorage = async (device: StorageDevice) => {
    const confirmDelete = confirm(
      `Are you sure you want to delete storage "${device.name}"?\n\nPath: ${device.path}\nThis action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      await nxAPI.deleteStorage(device.serverId, device.id);
      alert("Storage deleted successfully!");
      // Refresh storage list
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete storage:", error);
      alert("Failed to delete storage. Please check the console for details.");
    }
  };

  const handleCreateStorage = async () => {
    try {
      if (!createForm.serverId || !createForm.name || !createForm.path) {
        alert("Please fill in all required fields");
        return;
      }

      const result = await nxAPI.createStorage(createForm.serverId, {
        name: createForm.name,
        path: createForm.path,
        type: createForm.type,
        spaceLimitB: createForm.spaceLimitB,
        isUsedForWriting: createForm.isUsedForWriting,
        isBackup: createForm.isBackup,
      });

      if (result) {
        alert("Storage created successfully!");
        setShowCreateModal(false);
        // Reset form
        setCreateForm({
          serverId: servers.length > 0 ? servers[0].id : "",
          name: "",
          path: "",
          type: "local",
          spaceLimitB: 0,
          isUsedForWriting: true,
          isBackup: false,
        });
        // Refresh storage list
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to create storage:", error);
      alert("Failed to create storage. Please check the console for details.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-100 text-green-800 border-green-200";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "local":
        return <HardDrive className="w-5 h-5" />;
      case "network":
        return <Server className="w-5 h-5" />;
      case "cloud":
        return <Database className="w-5 h-5" />;
      default:
        return <HardDrive className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Storage Management</h1>
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-500">Loading storage information...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Storage Management</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center space-x-2 text-sm md:text-base"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Storage</span>
            <span className="sm:hidden">Add</span>
          </button>
          <button className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2 text-sm md:text-base">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Configure</span>
          </button>
        </div>
      </div>

      {/* Create Storage Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 md:p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">Create New Storage</h2>

            <div className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Server</label>
                <select
                  value={createForm.serverId}
                  onChange={(e) => setCreateForm({ ...createForm, serverId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name || server.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Storage 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Path *</label>
                <input
                  type="text"
                  value={createForm.path}
                  onChange={(e) => setCreateForm({ ...createForm, path: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="D:\HD Witness Media"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="local">Local</option>
                  <option value="network">Network</option>
                  <option value="cloud">Cloud</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Space Limit (Bytes)</label>
                <input
                  type="number"
                  value={createForm.spaceLimitB}
                  onChange={(e) => setCreateForm({ ...createForm, spaceLimitB: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0 (unlimited)"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={createForm.isUsedForWriting}
                    onChange={(e) => setCreateForm({ ...createForm, isUsedForWriting: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Use for writing</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={createForm.isBackup}
                    onChange={(e) => setCreateForm({ ...createForm, isBackup: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Backup storage</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4 md:mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateStorage}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Create Storage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Storage Modal */}
      {showEditModal && selectedStorage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 md:p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">Edit Storage</h2>

            <div className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Storage ID</label>
                <input
                  type="text"
                  value={selectedStorage.id}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Path *</label>
                <input
                  type="text"
                  value={editForm.path}
                  onChange={(e) => setEditForm({ ...editForm, path: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="local">Local</option>
                  <option value="network">Network</option>
                  <option value="cloud">Cloud</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Space Limit (Bytes)</label>
                <input
                  type="number"
                  value={editForm.spaceLimitB}
                  onChange={(e) => setEditForm({ ...editForm, spaceLimitB: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Online">Online</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editForm.isUsedForWriting}
                    onChange={(e) => setEditForm({ ...editForm, isUsedForWriting: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Use for writing</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editForm.isBackup}
                    onChange={(e) => setEditForm({ ...editForm, isBackup: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Backup storage</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4 md:mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedStorage(null);
                }}
                className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStorage}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Update Storage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overall Storage Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <div className="bg-white rounded-lg p-3 md:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-sm text-gray-600">Total Capacity</span>
            <Database className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
          </div>
          <div className="text-lg md:text-2xl font-bold text-gray-900">{totalStorage.total}</div>
          <div className="text-xs text-gray-500 mt-1 hidden sm:block">Across all devices</div>
        </div>

        <div className="bg-white rounded-lg p-3 md:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-sm text-gray-600">Used Space</span>
            <HardDrive className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
          </div>
          <div className="text-lg md:text-2xl font-bold text-gray-900">{totalStorage.used}</div>
          <div className="text-xs text-gray-500 mt-1 hidden sm:block">{totalStorage.usagePercentage}% utilized</div>
        </div>

        <div className="bg-white rounded-lg p-3 md:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-sm text-gray-600">Free Space</span>
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
          </div>
          <div className="text-lg md:text-2xl font-bold text-gray-900">{totalStorage.free}</div>
          <div className="text-xs text-gray-500 mt-1 hidden sm:block">Available for recordings</div>
        </div>

        <div className="bg-white rounded-lg p-3 md:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-sm text-gray-600">Storage Devices</span>
            <Server className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
          </div>
          <div className="text-lg md:text-2xl font-bold text-gray-900">{storageDevices.length}</div>
          <div className="text-xs text-gray-500 mt-1 hidden sm:block">Active devices</div>
        </div>
      </div>

      {/* Overall Usage Visualization */}
      <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-100">
        <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4">Overall Storage Usage</h2>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="relative w-32 h-32 md:w-40 md:h-40 flex-shrink-0">
            <svg className="w-32 h-32 md:w-40 md:h-40 transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-gray-200"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={`${totalStorage.usagePercentage * 2.827}, 283`}
                className={getUsageColor(totalStorage.usagePercentage)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <div className="text-2xl md:text-3xl font-bold text-gray-900">{totalStorage.usagePercentage}%</div>
              <div className="text-xs md:text-sm text-gray-600">Used</div>
            </div>
          </div>

          <div className="flex-1 w-full space-y-3 md:space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Total Capacity</span>
                <span className="font-medium text-gray-900">{totalStorage.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: "100%" }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Used Space</span>
                <span className="font-medium text-gray-900">{totalStorage.used}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    totalStorage.usagePercentage >= 90
                      ? "bg-red-500"
                      : totalStorage.usagePercentage >= 75
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${totalStorage.usagePercentage}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Free Space</span>
                <span className="font-medium text-gray-900">{totalStorage.free}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${100 - totalStorage.usagePercentage}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Devices List */}
      <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-base md:text-lg font-semibold text-gray-900">Storage Devices</h2>
          <button className="px-2 md:px-3 py-1.5 text-xs md:text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1">
            <Download className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Export Report</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>

        <div className="space-y-4">
          {storageDevices.length > 0 ? (
            storageDevices.map((device) => (
              <div
                key={device.id}
                className="border border-gray-200 rounded-lg p-3 md:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3 md:mb-4">
                  <div className="flex items-start space-x-3 md:space-x-4 min-w-0 flex-1">
                    <div
                      className={`p-2 md:p-3 rounded-lg flex-shrink-0 ${
                        device.status === "healthy"
                          ? "bg-green-50"
                          : device.status === "warning"
                          ? "bg-yellow-50"
                          : "bg-red-50"
                      }`}
                    >
                      {getTypeIcon(device.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm md:text-base truncate">{device.name}</h3>
                      <p className="text-xs md:text-sm text-gray-600 mt-1 truncate">{device.path}</p>
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <span
                          className={`px-2 py-0.5 md:py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            device.status
                          )}`}
                        >
                          {device.status}
                        </span>
                        <span className="text-xs text-gray-500">{device.type}</span>
                      </div>
                      {/* <div className="mt-2">
                        <p className="text-xs text-gray-500">Storage ID: <span className="font-mono text-gray-700">{device.id}</span></p>
                      </div> */}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleEditStorage(device)}
                      className="p-1.5 md:p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit storage"
                    >
                      <Settings className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteStorage(device)}
                      className="p-1.5 md:p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete storage"
                    >
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3">
                  <div>
                    <span className="text-xs text-gray-600">Total</span>
                    <div className="text-xs md:text-sm font-medium text-gray-900">{device.totalSpace}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-600">Used</span>
                    <div className="text-xs md:text-sm font-medium text-gray-900">{device.usedSpace}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-600">Free</span>
                    <div className="text-xs md:text-sm font-medium text-gray-900">{device.freeSpace}</div>
                  </div>
                </div>

                {/* Additional Storage Details */}
                <div className="bg-gray-50 rounded-lg p-2 md:p-3 mb-3">
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">Storage Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 md:gap-y-2 text-xs">
                    {/* <div>
                      <span className="text-gray-600">Server ID:</span>
                      <p className="font-mono text-gray-900 break-all">{device.serverId}</p>
                    </div> */}
                    <div>
                      <span className="text-gray-600">Space Limit:</span>
                      <p className="text-gray-900">{device.spaceLimitB.toLocaleString()} bytes</p>
                    </div>
                    <div>
                      <span className="text-gray-600">API Status:</span>
                      <p className="text-gray-900">{device.rawStatus}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Used for Writing:</span>
                      <p className="text-gray-900">{device.isUsedForWriting ? "✓ Yes" : "✗ No"}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Backup Storage:</span>
                      <p className="text-gray-900">{device.isBackup ? "✓ Yes" : "✗ No"}</p>
                    </div>
                    {/* {device.parameters && Object.keys(device.parameters).length > 0 && (
                      <div className="col-span-2">
                        <span className="text-gray-600">Parameters:</span>
                        <pre className="text-gray-900 mt-1 bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                          {JSON.stringify(device.parameters, null, 2)}
                        </pre>
                      </div>
                    )} */}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Usage</span>
                    <span>{device.usagePercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getUsageColor(device.usagePercentage)}`}
                      style={{ width: `${device.usagePercentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No storage devices found</p>
              <p className="text-sm text-gray-500 mt-1">Check your Nx Witness server connection</p>
            </div>
          )}
        </div>
      </div>

      {/* Storage Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-100">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-3 md:mb-4">Retention Settings</h2>
          <div className="space-y-3 md:space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Default Retention Period</span>
              <span className="text-xs md:text-sm font-medium text-gray-900">30 days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Archive Retention</span>
              <span className="text-xs md:text-sm font-medium text-gray-900">90 days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Motion-based Recording</span>
              <span className="text-xs md:text-sm font-medium text-green-600">Enabled</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Auto-cleanup</span>
              <span className="text-xs md:text-sm font-medium text-green-600">Active</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-100">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-3 md:mb-4">Compression & Quality</h2>
          <div className="space-y-3 md:space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Compression Ratio</span>
              <span className="text-xs md:text-sm font-medium text-gray-900">4:1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Recording Quality</span>
              <span className="text-xs md:text-sm font-medium text-gray-900">High</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Stream Quality</span>
              <span className="text-xs md:text-sm font-medium text-gray-900">1080p</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-gray-600">Dual Stream</span>
              <span className="text-xs md:text-sm font-medium text-green-600">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
