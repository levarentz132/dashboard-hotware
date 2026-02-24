"use client";

import {
  Search,
  Grid,
  List,
  Camera,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  Cloud,
  Server,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { useServers } from "@/hooks/useNxAPI-server";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { fetchCloudSystems as getCachedCloudSystems } from "@/hooks/use-async-data";
import nxAPI from "@/lib/nxapi";
import { getElectronHeaders } from "@/lib/config";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";
import { useInventorySync, SyncData } from "@/hooks/use-inventory-sync";

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
  const { user: localUser } = useAuth();
  const isUserAdmin = isAdmin(localUser);

  const [viewMode, setViewMode] = useState<"grid" | "list" | "cloud">("cloud");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");

  const systemId = selectedSystemId;

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  // Systems expansion state
  const [collapsedSystems, setCollapsedSystems] = useState<Set<string>>(new Set());

  // Status Badge Logic
  const getStatusDescription = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "offline": return "The Device is inaccessible.";
      case "unauthorized": return "The Device does not have correct credentials in the database.";
      case "recording": return "The Camera is online and recording the video stream.";
      case "online": return "The Device is online and accessible.";
      case "notdefined": return "The Device status is unknown.";
      case "incompatible": return "The Server is incompatible.";
      case "mismatchedcertificate": return "Server's DB certificate doesn't match the SSL handshake certificate.";
      default: return "Status unknown";
    }
  };

  const getStatusBadgeStyle = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "online":
      case "recording": return "bg-green-100 text-green-800 border-green-200";
      case "offline": return "bg-red-100 text-red-800 border-red-200";
      case "unauthorized": return "bg-orange-100 text-orange-800 border-orange-200";
      case "notdefined": return "bg-gray-100 text-gray-800 border-gray-200";
      case "incompatible":
      case "mismatchedcertificate": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  // Fetching Logic
  const fetchLocalCameras = useCallback(async () => {
    const localUserStr = localStorage.getItem("local_nx_user");
    const localServerId = localStorage.getItem("nx_server_id");
    if (!localUserStr) return null;

    try {
      const localUser = JSON.parse(localUserStr);
      const sid = localStorage.getItem("nx_system_id") || localServerId || localUser.serverId || "local";

      // Try to get actual system name
      let actualSystemName = "";
      try {
        const infoResp = await fetch("/nx/rest/v4/system/info", {
          headers: { "x-runtime-guid": localUser.token }
        });
        if (infoResp.ok) {
          const info = await infoResp.json();
          actualSystemName = info.name || info.systemName || "";
        }
      } catch (e) { }

      const displayName = actualSystemName ? `Local Server (${actualSystemName})` : "Local Server";

      const response = await fetch("/nx/rest/v4/devices", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "x-runtime-guid": localUser.token
        }
      });

      if (response.status >= 400) return null;
      const devices = await response.json();
      const cams = (Array.isArray(devices) ? devices : []).map((d: any) => ({
        ...d,
        systemId: sid,
        systemName: displayName
      }));

      return {
        systemId: sid,
        systemName: displayName,
        items: cams,
        stateOfHealth: "online"
      };
    } catch (e) {
      console.error("Local fetch failed:", e);
      return null;
    }
  }, []);

  const fetchCloudCamerasForSystem = useCallback(async (system: CloudSystem) => {
    try {
      const response = await fetch(
        `/api/nx/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...getElectronHeaders(),
          },
        },
      );

      if (response.status >= 400) return [];
      const devices = await response.json();
      return (Array.isArray(devices) ? devices : []).map((device: any) => ({
        ...device,
        systemId: system.id,
        systemName: system.name,
      }));
    } catch (err) {
      console.error(`Error fetching cameras from ${system.name}:`, err);
      return [];
    }
  }, []);

  // Memoize sync options
  const syncOptions = useMemo(() => ({
    // onUpdate removed to consolidate expansion logic in useEffect below
  }), []);

  // Use the new sync hook
  const {
    dataBySystem,
    loading: loadingSync,
    loadingCloud: loadingCloudSync,
    refetch: refetchSync
  } = useInventorySync<CameraDevice>(
    fetchLocalCameras,
    fetchCloudCamerasForSystem,
    syncOptions
  );

  // Consolidate expansion logic into computed state during render

  // Detail View Hooks
  const { cameras, loading: loadingCameras, error: camerasError, refetch: refetchSingle } = useCameras(systemId);
  const { servers, loading: loadingServers, error: serversError } = useServers(systemId);
  const { testConnection, connected } = useSystemInfo(systemId || "");

  const loading = loadingSync;
  const loadingCloud = loadingCloudSync;
  const error = camerasError || serversError;
  const isLoadingContent = loading;

  const camerasBySystem = useMemo(() => {
    return dataBySystem.map(sys => ({
      systemId: sys.systemId,
      systemName: sys.systemName,
      cameras: sys.items,
      stateOfHealth: sys.stateOfHealth
    }));
  }, [dataBySystem]);

  // Handle system selection and cloud systems list
  useEffect(() => {
    const updateCloudSystems = async () => {
      try {
        const systems = await getCachedCloudSystems();
        setCloudSystems(systems);

        if (!selectedSystemId && systems.length > 0) {
          const target = systems.find((s) => s.stateOfHealth === "online") || systems[0];
          setSelectedSystemId(target.id);
        }
      } catch (err) {
        console.error("Error fetching cloud systems list:", err);
      }
    };
    updateCloudSystems();
  }, [selectedSystemId]);

  // Toggle system expansion (we now track what is CLOSED)
  const toggleSystemExpansion = (sid: string) => {
    setCollapsedSystems((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(sid)) newSet.delete(sid);
      else newSet.add(sid);
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    return status?.toLowerCase() === "online" ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-600" />
    );
  };


  const displayCameras = useMemo(() => {
    return camerasBySystem.flatMap((sys) => sys.cameras);
  }, [camerasBySystem]);

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



  const isDashboardEmpty = (viewMode === "cloud")
    ? (camerasBySystem.length === 0 && !loadingSync)
    : (displayCameras.length === 0 && !loading);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Modals */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Camera Inventory</h1>
          {error && !isDashboardEmpty && <AlertCircle className="w-4 h-4 text-red-500 ml-2" />}
        </div>
        <div className="flex items-center gap-2">
          {!isDashboardEmpty && (
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
          )}


          <button
            onClick={() => {
              if (viewMode === "cloud") {
                refetchSync();
              } else {
                refetchSingle();
              }
              testConnection();
            }}
            disabled={loading || loadingCloud}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm h-10 transition-colors shadow-sm"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading || loadingCloud ? "animate-spin" : ""}`}
            />
            <span className="font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Cloud Systems Error - Now positioned below title */}

      {!isDashboardEmpty && (
        <>


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

          {/* Search and Filters */}
          <Card className="mb-4">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div className="relative flex-1 select-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search cameras, location, vendor..."
                    className="w-full pl-10 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm select-text bg-white h-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 select-none"
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
                        className={`gap-2 flex-1 sm:flex-none select-none w-[110px] justify-between h-10 px-3 ${filterStatus !== "all" || filterVendor !== "all" ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : ""
                          }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Filter className="h-4 w-4 shrink-0" />
                          <span>Filter</span>
                          {(filterStatus !== "all" || filterVendor !== "all") && (
                            <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs shrink-0 bg-blue-600 text-white border-0">
                              {[filterStatus !== "all", filterVendor !== "all"].filter(Boolean).length}
                            </Badge>
                          )}
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72" align="end">
                      <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
                          <h4 className="font-semibold text-gray-900">Filters</h4>
                          {(filterStatus !== "all" || filterVendor !== "all") && (
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
              </div>
            </CardContent>
          </Card>

          {/* Camera Grid/List */}
          <div className="bg-white rounded-lg shadow-sm border">
            {isLoadingContent ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">Loading cameras...</span>
              </div>
            ) : viewMode !== "cloud" && displayCameras.length === 0 ? (
              <div className="flex items-center justify-center p-12 text-center">
                <div className="space-y-4">
                  <Camera className="w-12 h-12 text-gray-300 mx-auto" />
                  <h3 className="text-lg font-medium text-gray-900">No camera detected</h3>
                  <p className="text-sm text-gray-500 max-w-xs mx-auto">
                    Your system is connected but no cameras are currently detected.
                  </p>
                  <Button onClick={() => refetchSingle()} variant="outline">
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
                    <Button onClick={() => refetchSingle()} variant="outline">
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
                    <Camera className="w-6 h-6 mr-2" />
                    <span>No cameras found</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {camerasBySystem.map((systemData) => {
                      const hasCameras = systemData.cameras.length > 0;
                      const isExpanded = hasCameras && !collapsedSystems.has(systemData.systemId);
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

                        return matchesSearch && matchesStatus && matchesVendor;
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
                                  {searchTerm || filterStatus !== "all" || filterVendor !== "all"
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
                                        <div className="truncate">Model: {camera.model || "-"}</div>
                                        <div className="truncate">Vendor: {camera.vendor || "-"}</div>
                                        {camera.mac && <div className="truncate">MAC: {camera.mac}</div>}
                                        {camera.physicalId && <div className="truncate">ID: {camera.physicalId}</div>}
                                        {camera.typeId && (
                                          <div className="truncate text-gray-500">Type: {camera.typeId}</div>
                                        )}
                                        {camera.url && (
                                          <div className="truncate text-gray-500" title={camera.url}>
                                            URL: {camera.url}
                                          </div>
                                        )}
                                        {!camera.model &&
                                          !camera.vendor &&
                                          !camera.mac &&
                                          !camera.physicalId &&
                                          !camera.typeId &&
                                          !camera.url && (
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
                      <div className="truncate">Model: {camera.model || "-"}</div>
                      <div className="truncate">Vendor: {camera.vendor || "-"}</div>
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
                          Type/Model
                        </th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
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
                      <div className="flex items-center mt-2 pt-2 border-t">
                        <div className="text-xs text-gray-500">
                          <span>{camera.vendor || "-"}</span>
                          {camera.model && <span> / {camera.model}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
