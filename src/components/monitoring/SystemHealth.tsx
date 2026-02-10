"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { isAdmin } from "@/lib/auth";
import dynamic from "next/dynamic";
import {
  Activity,
  Server,
  Database,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Cloud,
  Globe,
  MapPin,
  ExternalLink,
  Map as MapIcon,
} from "lucide-react";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { useCloudSystems, fetchFromCloudRelay, type CloudSystem } from "@/hooks/use-async-data";
import { getElectronHeaders } from "@/lib/config";
import { getOnlineOfflineBadgeClass, getRoleBadgeClass } from "@/lib/status-utils";
import ServerLocationForm from "@/components/servers/ServerLocationForm";
import { performAdminLogin } from "@/lib/auth-utils";
import { CloudLoginDialog } from "@/components/cloud/CloudLoginDialog";
import { Button } from "../ui/button";
import { Shield, LogIn, Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { ServerMarkerData } from "./ServerMap";

// Dynamic import untuk ServerMap (client-side only karena pakai Leaflet)
const ServerMap = dynamic(() => import("./ServerMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg border shadow-sm">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Server Locations Map</h3>
        </div>
      </div>
      <div className="h-[400px] flex items-center justify-center bg-gray-50">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    </div>
  ),
});

interface SystemInfoData {
  name?: string;
  version?: string;
  cloudSystemId?: string;
  [key: string]: unknown;
}

interface ServerLocationData {
  server_name: string;
  latitude: number | null;
  longitude: number | null;
}

export default function SystemHealth() {
  const { user: localUser } = useAuth();
  const isUserAdmin = isAdmin(localUser);
  const canEditHealth = isUserAdmin || localUser?.privileges?.find(p => p.module === "system_health" || p.module === "health")?.can_edit === true;

  const { systemInfo, connected, loading } = useSystemInfo();
  const { cameras } = useCameras();
  const { data: cloudSystems, refetch: refetchCloudSystems } = useCloudSystems();
  const [systemDetails, setSystemDetails] = useState<Map<string, SystemInfoData | null>>(new Map());
  const [serverLocations, setServerLocations] = useState<Map<string, ServerLocationData>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<Set<string>>(new Set());
  const [autoLoginAttempted, setAutoLoginAttempted] = useState<Set<string>>(new Set());
  const fetchSystemDetails = useCallback(async (cloudId: string): Promise<SystemInfoData | null> => {
    try {
      const response = await fetch(`/api/nx/system/info?systemId=${encodeURIComponent(cloudId)}`, {
        method: "GET",
        headers: {
          ...getElectronHeaders()
        }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (err) {
      console.error(`Error fetching system details for ${cloudId}:`, err);
      return null;
    }
  }, []);

  // Fetch details for all online systems
  const fetchAllSystemDetails = useCallback(async () => {
    setLoadingDetails(true);
    const newDetails = new Map<string, SystemInfoData | null>();

    const onlineSystems = cloudSystems.filter((s) => s.stateOfHealth === "online");

    await Promise.all(
      onlineSystems.map(async (system) => {
        const details = await fetchSystemDetails(system.id);
        newDetails.set(system.id, details);
      }),
    );

    setSystemDetails(newDetails);
    setLoadingDetails(false);
  }, [cloudSystems, fetchSystemDetails]);

  // Admin login function
  const attemptAdminLogin = useCallback(
    async (targetSystemId: string, systemName: string): Promise<boolean> => {
      if (autoLoginAttempted.has(targetSystemId)) return false;

      console.log(`[SystemHealth] Attempting Admin login to ${systemName}...`);
      const success = await performAdminLogin(targetSystemId);

      if (success) {
        setIsLoggedIn((prev) => new Set(prev).add(targetSystemId));
        setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
        return true;
      } else {
        setAutoLoginAttempted((prev) => new Set(prev).add(targetSystemId));
        return false;
      }
    },
    [autoLoginAttempted],
  );

  // Fetch server locations from database
  const fetchServerLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/server-location");
      if (response.ok) {
        const data = await response.json();
        const locationsMap = new Map<string, ServerLocationData>();
        data.locations?.forEach((loc: ServerLocationData) => {
          locationsMap.set(loc.server_name, loc);
        });
        setServerLocations(locationsMap);
      }
    } catch (err) {
      console.error("Error fetching server locations:", err);
    }
  }, []);

  // Initial fetch for server locations
  useEffect(() => {
    fetchServerLocations();
  }, [fetchServerLocations]);

  // Fetch details when cloud systems are loaded
  useEffect(() => {
    if (cloudSystems.length > 0) {
      fetchAllSystemDetails();
    }
  }, [cloudSystems, fetchAllSystemDetails]);

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchCloudSystems();
    await fetchAllSystemDetails();
    await fetchServerLocations();
    setRefreshing(false);
  };

  // Open Google Maps with coordinates
  const openInMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  const getStatusBadge = (stateOfHealth: string) => {
    const isOnline = stateOfHealth === "online";
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getOnlineOfflineBadgeClass(isOnline)}`}>
        {isOnline ? "Online" : "Offline"}
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(role)}`}>{role}</span>;
  };

  const onlineCameras = cameras?.filter((c) => c.status?.toLowerCase() === "online").length || 0;
  const totalCameras = cameras?.length || 0;
  const onlineSystemsCount = cloudSystems.filter((s) => s.stateOfHealth === "online").length;
  const totalSystemsCount = cloudSystems.length;

  // Prepare server data for map
  const serverMapData: ServerMarkerData[] = useMemo(() => {
    return cloudSystems.map((system) => {
      const location = serverLocations.get(system.name);
      const details = systemDetails.get(system.id);
      return {
        id: system.id,
        name: system.name,
        isOnline: system.stateOfHealth === "online",
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        version: details?.version || system.version,
        ownerFullName: system.ownerFullName,
        accessRole: system.accessRole,
      };
    });
  }, [cloudSystems, serverLocations, systemDetails]);



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">System Health</h1>

        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm h-10 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Cloud Systems Error - Now positioned below title */}
      {cloudSystems.length === 0 && !refreshing && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 select-none">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mr-3" />
            <div>
              <h3 className="font-medium text-yellow-800">No Cloud Systems Found</h3>
              <p className="text-sm text-yellow-700">Unable to fetch cloud systems. Check your connection.</p>
            </div>
          </div>
        </div>
      )}

      {/* Overall Status Cards */}
      {cloudSystems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center space-x-3">
              <Cloud className="w-8 h-8 text-blue-600" />
              <div>
                <div className="text-lg font-bold text-gray-900">{totalSystemsCount}</div>
                <div className="text-sm text-gray-600">Cloud Systems</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <div className="text-lg font-bold text-green-600">{onlineSystemsCount}</div>
                <div className="text-sm text-gray-600">Systems Online</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center space-x-3">
              <XCircle className="w-8 h-8 text-red-600" />
              <div>
                <div className="text-lg font-bold text-red-600">{totalSystemsCount - onlineSystemsCount}</div>
                <div className="text-sm text-gray-600">Systems Offline</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center space-x-3">
              <Activity className="w-8 h-8 text-purple-600" />
              <div>
                <div className="text-lg font-bold text-gray-900">
                  {onlineCameras}/{totalCameras}
                </div>
                <div className="text-sm text-gray-600">Cameras Online</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server Locations Map */}
      <ServerMap
        servers={serverMapData}
        className={cloudSystems.length > 0 ? "" : "hidden"}
        onServerClick={(server) => setEditingLocation(server.name)}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      {/* Cloud Systems Grid */}
      {cloudSystems.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            All Cloud Systems
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {cloudSystems.map((system) => {
              const details = systemDetails.get(system.id);
              const isOnline = system.stateOfHealth === "online";
              const location = serverLocations.get(system.name);
              const hasLocation = location?.latitude && location?.longitude;

              return (
                <div
                  key={system.id}
                  className={`bg-white rounded-lg border-l-4 shadow-sm p-5 ${isOnline ? "border-l-green-500" : "border-l-red-400"
                    }`}
                >
                  {/* System Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${isOnline ? "bg-green-100" : "bg-red-100"}`}>
                        <Server className={`w-5 h-5 ${isOnline ? "text-green-600" : "text-red-500"}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{system.name}</h3>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]" title={system.id}>
                          ID: {system.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getStatusBadge(system.stateOfHealth)}
                      {getRoleBadge(system.accessRole)}
                    </div>
                  </div>

                  {/* System Details */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Version</div>
                      <div className="font-medium text-gray-900">{details?.version || system.version || "N/A"}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Owner</div>
                      <div className="font-medium text-gray-900 truncate" title={system.ownerFullName}>
                        {system.ownerFullName || "N/A"}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                      <div className="text-xs text-gray-500 mb-1">Owner Email</div>
                      <div className="font-medium text-gray-900 truncate" title={system.ownerAccountEmail}>
                        {system.ownerAccountEmail || "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Server Location */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-600">Lokasi Server</span>
                      </div>
                      {canEditHealth && (
                        <button
                          onClick={() => setEditingLocation(system.name)}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                        >
                          {hasLocation ? "Edit" : "Set Lokasi"}
                        </button>
                      )}
                    </div>
                    {hasLocation ? (
                      <button
                        onClick={() => openInMaps(location.latitude!, location.longitude!)}
                        className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors group"
                      >
                        <span className="font-medium">
                          {location.latitude}, {location.longitude}
                        </span>
                        <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                      </button>
                    ) : (
                      <p className="mt-2 text-sm text-gray-400 italic">Belum ada lokasi</p>
                    )}
                  </div>

                  {/* Connection Status */}
                  {isOnline && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Cloud Relay</span>
                        <div className="flex items-center space-x-2">
                          {loadingDetails ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                          ) : details ? (
                            <>
                              <span className="text-green-600">Connected</span>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </>
                          ) : (
                            <>
                              <span className="text-yellow-600">No Data</span>
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Current System Info */}
      {connected && systemInfo && (
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Active System Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">System Name</div>
              <div className="font-semibold text-gray-900">{systemInfo.name || "Unknown"}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Version</div>
              <div className="font-semibold text-gray-900">{systemInfo.version || "Unknown"}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Connection</div>
              <div className="font-semibold text-green-600 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Connected
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Cameras</div>
              <div className="font-semibold text-gray-900">
                {onlineCameras} / {totalCameras} Online
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server Location Form Modal */}
      {editingLocation && (
        <ServerLocationForm
          serverName={editingLocation}
          onClose={() => setEditingLocation(null)}
          onSave={fetchServerLocations}
        />
      )}
      {/* Cloud Login Dialog */}
      <CloudLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        systemId={systemInfo?.cloudId || systemInfo?.localId || ""}
        systemName={systemInfo?.name || ""}
        onLoginSuccess={() => {
          const sysId = systemInfo?.cloudId || systemInfo?.localId;
          if (sysId) {
            setIsLoggedIn((prev) => new Set(prev).add(sysId));
          }
          setRequiresAuth(false);
          handleRefresh();
        }}
      />
    </div>
  );
}
