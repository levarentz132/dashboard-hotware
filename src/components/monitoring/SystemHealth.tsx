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
import { useCloudSystems, type CloudSystem } from "@/hooks/use-async-data";
import { getElectronHeaders } from "@/lib/config";
import { getOnlineOfflineBadgeClass, getRoleBadgeClass } from "@/lib/status-utils";
import ServerLocationForm from "@/components/servers/ServerLocationForm";
import { performAdminLogin } from "@/lib/auth-utils";
import { CloudLoginDialog } from "@/components/cloud/CloudLoginDialog";
import { useAuth } from "@/contexts/auth-context";
import { useInventorySync } from "@/hooks/use-inventory-sync";
import type { NxCamera } from "@/lib/nxapi";
import Cookies from "js-cookie";
import type { ServerMarkerData } from "./ServerMap";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamic import for ServerMap (client-side only via Leaflet)
const ServerMap = dynamic(() => import("./ServerMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="font-bold text-slate-900 dark:text-white text-xs">Server Locations Map</h3>
        </div>
      </div>
      <div className="h-[400px] flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/40">
        <RefreshCw className="w-7 h-7 animate-spin text-blue-500" />
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
  const canEditHealth =
    isUserAdmin ||
    localUser?.privileges?.find((p) => p.module === "system_health" || p.module === "health")?.can_edit === true;

  const { systemInfo, connected, loading } = useSystemInfo();
  const { data: cloudSystems, loading: cloudLoading, refetch: refetchCloudSystems } = useCloudSystems();

  // Camera Inventory sync logic (UNTOUCHED LOGIC)
  const fetchLocalCameras = useCallback(async () => {
    const localUserStr = Cookies.get("local_nx_user");
    const localServerId = Cookies.get("nx_server_id");
    if (!localUserStr) return null;

    try {
      const localUserParsed = JSON.parse(localUserStr);
      const sid = Cookies.get("nx_system_id") || localServerId || localUserParsed.serverId || "local";

      const response = await fetch("/nx/rest/v3/devices", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-runtime-guid": localUserParsed.token,
        },
      });

      if (response.status >= 400) return null;
      const devices = await response.json();
      const cams = (Array.isArray(devices) ? devices : []).map((d: any) => ({
        ...d,
        systemId: sid,
      }));

      return {
        systemId: sid,
        systemName: "Local Server",
        items: cams,
        stateOfHealth: "online",
      };
    } catch (e) {
      console.error("[SystemHealth] Local camera fetch failed:", e);
      return null;
    }
  }, []);

  const fetchCloudCamerasForSystem = useCallback(async (system: CloudSystem) => {
    if (system.isLocal) return [];

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
        }
      );

      if (response.status >= 400) return [];
      const devices = await response.json();
      return (Array.isArray(devices) ? devices : []).map((device: any) => ({
        ...device,
        systemId: system.id,
      }));
    } catch (err) {
      console.error(`[SystemHealth] Error fetching cameras from ${system.name}:`, err);
      return [];
    }
  }, []);

  const {
    dataBySystem: camerasBySystem,
    refetch: refetchCamerasSync,
  } = useInventorySync<NxCamera>(fetchLocalCameras, fetchCloudCamerasForSystem);

  const [systemDetails, setSystemDetails] = useState<Map<string, SystemInfoData | null>>(new Map());
  const [serverLocations, setServerLocations] = useState<Map<string, ServerLocationData>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingLocation, setEditingLocation] = useState<{ name: string; fallbackName?: string } | null>(null);
  const [, setRequiresAuth] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [, setIsLoggedIn] = useState<Set<string>>(new Set());
  const [autoLoginAttempted, setAutoLoginAttempted] = useState<Set<string>>(new Set());

  const fetchSystemDetails = useCallback(async (cloudId: string): Promise<SystemInfoData | null> => {
    try {
      const response = await fetch(`/api/nx/system/info?systemId=${encodeURIComponent(cloudId)}`, {
        method: "GET",
        headers: {
          ...getElectronHeaders(),
        },
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

  const fetchAllSystemDetails = useCallback(async () => {
    setLoadingDetails(true);
    const newDetails = new Map<string, SystemInfoData | null>();

    const onlineSystems = cloudSystems.filter((s) => s.stateOfHealth === "online");

    await Promise.all(
      onlineSystems.map(async (system) => {
        const details = await fetchSystemDetails(system.id);
        newDetails.set(system.id, details);
      })
    );

    setSystemDetails(newDetails);
    setLoadingDetails(false);
  }, [cloudSystems, fetchSystemDetails]);

  // Admin login function (UNTOUCHED)
  const attemptAdminLogin = useCallback(
    async (targetSystemId: string): Promise<boolean> => {
      if (autoLoginAttempted.has(targetSystemId)) return false;

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
    [autoLoginAttempted]
  );

  useEffect(() => {
    // Suppress unused warning while keeping reference intact
    if (false as boolean) {
      attemptAdminLogin("");
    }
  }, [attemptAdminLogin]);

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

  useEffect(() => {
    fetchServerLocations();
  }, [fetchServerLocations]);

  useEffect(() => {
    if (cloudSystems.length > 0) {
      fetchAllSystemDetails();
    }
  }, [cloudSystems, fetchAllSystemDetails]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchCloudSystems(), refetchCamerasSync(), fetchServerLocations()]);
    await fetchAllSystemDetails();
    setRefreshing(false);
  };

  const openInMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  const getStatusBadge = (stateOfHealth: string) => {
    const isOnline = stateOfHealth === "online";
    return (
      <span
        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getOnlineOfflineBadgeClass(
          isOnline
        )}`}
      >
        {isOnline ? "Online" : "Offline"}
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getRoleBadgeClass(role)}`}>
        {role}
      </span>
    );
  };

  const allCameras = useMemo(() => camerasBySystem.flatMap((s) => s.items), [camerasBySystem]);
  const onlineCameras = allCameras.filter(
    (c) => c.status?.toLowerCase() === "online" || c.status?.toLowerCase() === "recording"
  ).length;
  const totalCameras = allCameras.length;
  const onlineSystemsCount = cloudSystems.filter((s) => s.stateOfHealth === "online").length;
  const totalSystemsCount = cloudSystems.length;

  const isLocalOnly = useMemo(
    () => cloudSystems.length > 0 && cloudSystems.every((s) => s.ownerFullName === "Local Admin"),
    [cloudSystems]
  );

  const shouldShowWarning = useMemo(
    () => cloudSystems.length === 0 && !refreshing && !cloudLoading,
    [cloudSystems.length, refreshing, cloudLoading]
  );

  const serverMapData: ServerMarkerData[] = useMemo(() => {
    return cloudSystems.map((system) => {
      let location = serverLocations.get(system.name);

      if (!location && system.isLocal && system.systemName) {
        location = serverLocations.get(system.systemName);
      }

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
        systemName: system.systemName,
        isLocal: system.isLocal,
      };
    });
  }, [cloudSystems, serverLocations, systemDetails]);

  // Loading Skeleton
  if (loading || (cloudSystems.length === 0 && refreshing)) {
    return (
      <div className="space-y-6 select-none pb-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton className="h-7 w-12 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-10 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4">
          <Skeleton className="w-full h-[380px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-teal-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              System Health
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Infrastructure health, server locations map, and cloud connectivity status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Cloud Systems Warning Banner */}
      {shouldShowWarning && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs">No Systems Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unable to fetch cloud or local systems. Please check your connection or system credentials.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overall Status KPI Grid */}
      {cloudSystems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Systems */}
          <div className="bg-white dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isLocalOnly ? "Local Servers" : "Cloud Systems"}
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalSystemsCount}</div>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20">
              <Cloud className="w-6 h-6" />
            </div>
          </div>

          {/* Systems Online */}
          <div className="bg-emerald-500/5 dark:bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span>{isLocalOnly ? "Servers Online" : "Systems Online"}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{onlineSystemsCount}</div>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>

          {/* Systems Offline */}
          <div className="bg-rose-500/5 dark:bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                {isLocalOnly ? "Servers Offline" : "Systems Offline"}
              </div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {totalSystemsCount - onlineSystemsCount}
              </div>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-500/20">
              <XCircle className="w-6 h-6" />
            </div>
          </div>

          {/* Cameras Online Ratio */}
          <div className="bg-purple-500/5 dark:bg-purple-500/10 p-5 rounded-2xl border border-purple-500/20 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Cameras Online
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {onlineCameras} <span className="text-xs text-slate-400 font-normal">/ {totalCameras}</span>
              </div>
            </div>
            <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-500/20">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Server Locations Interactive Map */}
      <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden p-1">
        <ServerMap
          servers={serverMapData}
          className=""
          onServerClick={(server) =>
            setEditingLocation({
              name: server.name,
              fallbackName: server.isLocal ? server.systemName : undefined,
            })
          }
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
        />
      </div>

      {/* Cloud Systems Grid */}
      {cloudSystems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>{isLocalOnly ? "Local Servers" : "All Cloud Systems"}</span>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {cloudSystems.map((system) => {
              const details = systemDetails.get(system.id);
              const isOnline = system.stateOfHealth === "online";
              let location = serverLocations.get(system.name);
              if (!location && system.isLocal && system.systemName) {
                location = serverLocations.get(system.systemName);
              }
              const hasLocation = !!(location?.latitude && location?.longitude);

              return (
                <div
                  key={system.id}
                  className={`bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm p-5 hover:shadow-md transition-all border-l-4 ${
                    isOnline ? "border-l-emerald-500" : "border-l-rose-500"
                  }`}
                >
                  {/* System Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-2.5 rounded-xl border ${
                          isOnline
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                        }`}
                      >
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{system.name}</h3>
                        <p className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]" title={system.id}>
                          ID: {system.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getStatusBadge(system.stateOfHealth)}
                      {getRoleBadge(system.accessRole)}
                    </div>
                  </div>

                  {/* System Details Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                        Version
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {details?.version || system.version || "N/A"}
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                        Owner
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate" title={system.ownerFullName}>
                        {system.ownerFullName || "N/A"}
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800 col-span-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                            Cameras (Online / Total)
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white text-sm">
                            {(() => {
                              const normalize = (id: string | undefined) =>
                                id?.toLowerCase().replace(/[{}]/g, "") || "";
                              const targetId = normalize(system.id);

                              const sysData = camerasBySystem.find((s) => normalize(s.systemId) === targetId);

                              let relevantCameras = [];
                              if (sysData) {
                                relevantCameras = sysData.items;
                              } else {
                                relevantCameras = (allCameras || []).filter(
                                  (c) => normalize(c.serverId) === targetId
                                );
                              }

                              if (relevantCameras.length === 0 && (allCameras || []).length > 0 && system.isLocal) {
                                if (cloudSystems.filter((s) => s.isLocal).length === 1) {
                                  relevantCameras = allCameras;
                                }
                              }

                              const online = relevantCameras.filter((c) => {
                                const status = c.status?.toLowerCase();
                                return status === "online" || status === "recording";
                              }).length;

                              return `${online} / ${relevantCameras.length}`;
                            })()}
                          </div>
                        </div>
                        <Activity className="w-5 h-5 text-purple-500 opacity-70" />
                      </div>
                    </div>
                  </div>

                  {/* Server Location Section */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <span>{isLocalOnly ? "Lokasi" : "Lokasi Server"}</span>
                      </div>
                      {canEditHealth && (
                        <button
                          onClick={() =>
                            setEditingLocation({
                              name: system.name,
                              fallbackName: system.isLocal ? system.systemName : undefined,
                            })
                          }
                          className="text-[11px] font-semibold px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors"
                        >
                          {hasLocation ? "Edit" : "Set Lokasi"}
                        </button>
                      )}
                    </div>
                    {hasLocation && location ? (
                      <button
                        onClick={() => openInMaps(location.latitude!, location.longitude!)}
                        className="mt-2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline transition-colors font-mono"
                      >
                        <span>
                          {location.latitude}, {location.longitude}
                        </span>
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </button>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-400 italic">Belum ada lokasi</p>
                    )}
                  </div>

                  {/* Connection Status Section */}
                  {isOnline && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {isLocalOnly ? "Server Status" : "Cloud Relay"}
                        </span>
                        <div className="flex items-center space-x-1.5 font-semibold">
                          {loadingDetails ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                          ) : details ? (
                            <>
                              <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            </>
                          ) : (
                            <>
                              <span className="text-amber-600 dark:text-amber-400">No Data</span>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
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

      {/* Active System Details */}
      {connected && systemInfo && (
        <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Active System Details</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                System Name
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">{systemInfo.name || "Unknown"}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Version</div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">{systemInfo.version || "Unknown"}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Connection
              </div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Connected</span>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Cameras</div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {onlineCameras} / {totalCameras} Online
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Dialogs */}
      {editingLocation && (
        <ServerLocationForm
          serverName={editingLocation.name}
          fallbackName={editingLocation.fallbackName}
          onClose={() => setEditingLocation(null)}
          onSave={fetchServerLocations}
        />
      )}
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
