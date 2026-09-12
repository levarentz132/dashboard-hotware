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
  AlertTriangle,
  Cloud,
  Server,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Video,
  FileSpreadsheet,
  FileText,
  Clock,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { useServers } from "@/hooks/useNxAPI-server";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { fetchCloudSystems as getCachedCloudSystems } from "@/hooks/use-async-data";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Badge } from "../ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { hasCameraViewPermission } from "@/lib/auth";
import { useInventorySync } from "@/hooks/use-inventory-sync";
import Cookies from "js-cookie";
import { getElectronHeaders } from "@/lib/config";
import { getOfflineExactTime } from "@/lib/camera-offline-tracker";

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
  systemId?: string;
  systemName?: string;
  lastSeen?: string | number;
  offlineTime?: string | number;
  [key: string]: any;
}

export default function CameraInventory() {
  const { user: localUser } = useAuth();

  const [viewMode, setViewMode] = useState<"grid" | "list" | "cloud">("cloud");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");

  const systemId = selectedSystemId;

  // Cloud systems state
  const [, setCloudSystems] = useState<CloudSystem[]>([]);
  // Systems expansion state (stores collapsed system IDs)
  const [collapsedSystems, setCollapsedSystems] = useState<Set<string>>(new Set());

  // Status Description Tooltip Helper
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
        return "The Device status is unknown.";
      case "incompatible":
        return "The Server is incompatible.";
      case "mismatchedcertificate":
        return "Server's DB certificate doesn't match the SSL handshake certificate.";
      default:
        return "Status unknown";
    }
  };

  // Modern Status Badge Styling Helper
  const getStatusBadgeStyle = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "online":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "recording":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
      case "offline":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "unauthorized":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "notdefined":
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
      case "incompatible":
      case "mismatchedcertificate":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    }
  };

  // Fetching Logic (UNTOUCHED API LOGIC)
  const fetchLocalCameras = useCallback(async (options?: { skipCache?: boolean }) => {
    const localUserStr = Cookies.get("local_nx_user");
    const localServerId = Cookies.get("nx_server_id");
    if (!localUserStr) return null;

    try {
      const localUser = JSON.parse(localUserStr);
      const sid = Cookies.get("nx_system_id") || localServerId || localUser.serverId || "local";

      let actualServerName = "";
      try {
        const headers: Record<string, string> = { "x-runtime-guid": localUser.token };
        if (options?.skipCache) {
          headers["x-skip-nx-cache"] = "1";
        }
        const infoResp = await fetch("/api/nx/rest/v3/servers/this", { headers });
        if (infoResp.ok) {
          const info = await infoResp.json();
          actualServerName = info.name || info.systemName || "";
        }
      } catch (e) {}

      const displayName = actualServerName ? `Local Server (${actualServerName})` : "Local Server";

      const headers: Record<string, string> = {
        Accept: "application/json",
        "x-runtime-guid": localUser.token,
      };
      if (options?.skipCache) {
        headers["x-skip-nx-cache"] = "1";
      }

      const response = await fetch("/api/nx/rest/v3/devices", {
        method: "GET",
        headers,
      });

      if (response.status >= 400) return null;
      const devices = await response.json();
      const cams = (Array.isArray(devices) ? devices : []).map((d: any) => ({
        ...d,
        systemId: sid,
        systemName: displayName,
      }));

      return {
        systemId: sid,
        systemName: displayName,
        items: cams,
        stateOfHealth: "online",
      };
    } catch (e) {
      console.error("Local fetch failed:", e);
      return null;
    }
  }, []);

  const fetchCloudCamerasForSystem = useCallback(
    async (system: CloudSystem, options?: { skipCache?: boolean }) => {
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...getElectronHeaders(),
        };
        if (options?.skipCache) {
          headers["x-skip-nx-cache"] = "1";
        }
        const response = await fetch(
          `/api/cloud/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
          {
            method: "GET",
            credentials: "include",
            headers,
          }
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
    },
    []
  );

  const syncOptions = useMemo(() => ({}), []);

  const {
    dataBySystem,
    loading: loadingSync,
    loadingCloud: loadingCloudSync,
    refetch: refetchSync,
  } = useInventorySync<CameraDevice>(fetchLocalCameras, fetchCloudCamerasForSystem, syncOptions);

  const isLocalSystemId = systemId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(systemId);
  const { loading: loadingCameras, error: camerasError, refetch: refetchSingle } = useCameras(isLocalSystemId ? systemId : undefined);
  const { error: serversError } = useServers(isLocalSystemId ? systemId : undefined);
  const { testConnection } = useSystemInfo(isLocalSystemId ? (systemId || "") : "");

  const loading = loadingSync;
  const loadingCloud = loadingCloudSync;
  const error = isLocalSystemId ? (camerasError || serversError) : null;
  const isLoadingContent = loading;

  const camerasBySystem = useMemo(() => {
    return (dataBySystem || []).map((sys) => ({
      systemId: sys.systemId,
      systemName: sys.systemName,
      cameras: sys.items || [],
      stateOfHealth: sys.stateOfHealth,
    }));
  }, [dataBySystem]);

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

  const toggleSystemExpansion = (sid: string) => {
    setCollapsedSystems((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(sid)) newSet.delete(sid);
      else newSet.add(sid);
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    const statusLower = status?.toLowerCase();
    if (statusLower === "online" || statusLower === "recording") {
      return <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    return <WifiOff className="w-4 h-4 text-rose-500 shrink-0" />;
  };

  const displayCameras = useMemo(() => {
    const raw = (camerasBySystem || []).flatMap((sys: any) =>
      (sys.cameras || []).map((c: any) => ({ ...c, systemId: sys.systemId }))
    );
    const seen = new Set<string>();
    return raw.filter((c: any) => {
      const cleanId = String(c?.id || "").replace(/[{}]/g, "").toLowerCase();
      if (!cleanId) return true;
      if (seen.has(cleanId)) return false;
      seen.add(cleanId);
      return true;
    });
  }, [camerasBySystem]);

  const uniqueVendors = Array.from(new Set(displayCameras.map((c) => c.vendor).filter(Boolean))).sort() as string[];

  const filteredCameras = displayCameras.filter((camera) => {
    const matchesSearch =
      !searchTerm ||
      camera.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (camera.location || camera.ip || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.model?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!hasCameraViewPermission(localUser, camera.id)) {
      return false;
    }

    const matchesStatus = filterStatus === "all" || camera.status?.toLowerCase() === filterStatus.toLowerCase();
    const matchesVendor = filterVendor === "all" || camera.vendor?.toLowerCase() === filterVendor.toLowerCase();

    return matchesSearch && matchesStatus && matchesVendor;
  });

  const statsSourceCameras = displayCameras;

  const totalCameras = statsSourceCameras.length;
  const onlineCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "online").length;
  const offlineCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "offline").length;
  const recordingCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "recording").length;
  const unauthorizedCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "unauthorized").length;
  const notDefinedCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "notdefined").length;
  const incompatibleCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "incompatible").length;
  const mismatchedCertCameras = statsSourceCameras.filter(
    (c) => c.status?.toLowerCase() === "mismatchedcertificate"
  ).length;

  const isDashboardEmpty =
    viewMode === "cloud"
      ? camerasBySystem.length === 0 && !loadingSync
      : displayCameras.length === 0 && !loading;

  const getVisibleCameras = () => {
    if (viewMode === "cloud") {
      return (camerasBySystem || []).flatMap((sys) => {
        return (sys.cameras || []).filter((cam) => {
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
      });
    } else {
      return filteredCameras;
    }
  };

  const exportToExcel = async () => {
    try {
      const { utils, writeFile } = await import("xlsx");

      const rows = getVisibleCameras().map((camera) => ({
        "System Name": camera.systemName || "Local System",
        "Camera Name": camera.name || "Unnamed Camera",
        "Camera ID": camera.id || "",
        "IP Address": camera.ip || camera.url || "",
        "MAC Address": camera.mac || "",
        Vendor: camera.vendor || "-",
        Model: camera.model || "-",
        Status: camera.status || "Unknown",
      }));

      const worksheet = utils.json_to_sheet(rows);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, "Cameras");

      const maxLens = Object.keys(rows[0] || {}).reduce((acc: any, key) => {
        acc[key] = key.length;
        return acc;
      }, {});
      rows.forEach((row: any) => {
        Object.keys(row).forEach((key) => {
          const val = String(row[key] || "");
          if (val.length > maxLens[key]) {
            maxLens[key] = val.length;
          }
        });
      });
      worksheet["!cols"] = Object.keys(maxLens).map((key) => ({
        wch: maxLens[key] + 3,
      }));

      writeFile(workbook, `camera_inventory_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) {
      console.error("Export to Excel failed:", e);
    }
  };

  const exportToPdf = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      doc.setFontSize(18);
      doc.setTextColor(33, 41, 54);
      doc.text("Camera Inventory Report", 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 21);

      const tableHeaders = [
        ["System Name", "Camera Name", "Camera ID", "IP / Stream URL", "MAC Address", "Vendor", "Model", "Status"],
      ];

      const tableData = getVisibleCameras().map((camera) => [
        camera.systemName || "Local System",
        camera.name || "Unnamed Camera",
        camera.id || "",
        camera.ip || camera.url || "",
        camera.mac || "",
        camera.vendor || "-",
        camera.model || "-",
        camera.status || "Unknown",
      ]);

      autoTable(doc, {
        startY: 25,
        head: tableHeaders,
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 40 },
          2: { cellWidth: 50 },
          3: { cellWidth: 55 },
          4: { cellWidth: 30 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
          7: { cellWidth: 18 },
        },
      });

      doc.save(`camera_inventory_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (e) {
      console.error("Export to PDF failed:", e);
    }
  };

  return (
    <div className="space-y-6 select-none pb-8">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20 shadow-sm">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              Camera Inventory
              {error && !isDashboardEmpty && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <AlertCircle className="w-3.5 h-3.5" /> Sync Warning
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Inspect, manage, and export camera inventory across local and cloud VMS systems
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isDashboardEmpty && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-inner">
              <button
                onClick={() => setViewMode("cloud")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "cloud"
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                title="Systems View"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Systems</span>
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                title="Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "list"
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>
          )}

          <button
            onClick={() => {
              if (viewMode === "cloud") {
                refetchSync({ skipCache: true });
              } else {
                refetchSingle();
              }
              testConnection();
            }}
            disabled={loading || loadingCloud}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingCloud ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={exportToExcel}
            disabled={getVisibleCameras().length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
            title="Export to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          <button
            onClick={exportToPdf}
            disabled={getVisibleCameras().length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
            title="Export to PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {!isDashboardEmpty && (
        <>
          {/* KPI Stats Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Total */}
            <div className="bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="text-slate-500 dark:text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                Total
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">{totalCameras}</div>
            </div>

            {/* Online */}
            <div className="bg-emerald-500/5 dark:bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-[11px] font-medium uppercase tracking-wider">
                <span>Online</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{onlineCameras}</div>
            </div>

            {/* Offline */}
            <div className="bg-rose-500/5 dark:bg-rose-500/10 p-3 rounded-2xl border border-rose-500/20 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-[11px] font-medium uppercase tracking-wider">
                <span>Offline</span>
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              </div>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{offlineCameras}</div>
            </div>

            {/* Recording */}
            <div className="bg-cyan-500/5 dark:bg-cyan-500/10 p-3 rounded-2xl border border-cyan-500/20 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-cyan-600 dark:text-cyan-400 text-[11px] font-medium uppercase tracking-wider">
                <span>Recording</span>
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
              </div>
              <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{recordingCameras}</div>
            </div>

            {/* Unauthorized */}
            <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20 shadow-sm flex flex-col justify-between">
              <div className="text-amber-600 dark:text-amber-400 text-[11px] font-medium uppercase tracking-wider">
                Unauthorized
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{unauthorizedCameras}</div>
            </div>

            {/* NotDefined */}
            <div className="bg-slate-500/5 dark:bg-slate-500/10 p-3 rounded-2xl border border-slate-500/20 shadow-sm flex flex-col justify-between">
              <div className="text-slate-600 dark:text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                Undefined
              </div>
              <div className="text-xl font-bold text-slate-600 dark:text-slate-400 mt-1">{notDefinedCameras}</div>
            </div>

            {/* Incompatible */}
            <div className="bg-orange-500/5 dark:bg-orange-500/10 p-3 rounded-2xl border border-orange-500/20 shadow-sm flex flex-col justify-between">
              <div className="text-orange-600 dark:text-orange-400 text-[11px] font-medium uppercase tracking-wider">
                Incompatible
              </div>
              <div className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">{incompatibleCameras}</div>
            </div>

            {/* Mismatched Certificate */}
            <div className="bg-purple-500/5 dark:bg-purple-500/10 p-3 rounded-2xl border border-purple-500/20 shadow-sm flex flex-col justify-between">
              <div
                className="text-purple-600 dark:text-purple-400 text-[11px] font-medium uppercase tracking-wider truncate"
                title="Mismatched Certificate"
              >
                Mismatched Cert
              </div>
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {mismatchedCertCameras}
              </div>
            </div>
          </div>

          {/* Search & Filters Controls Bar */}
          <div className="bg-white dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by camera name, vendor, model, IP, or location..."
                  className="w-full pl-10 pr-10 py-2 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-xs bg-slate-50/50 dark:bg-slate-800/40 text-slate-900 dark:text-white placeholder:text-slate-400 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filter Popover */}
              <div className="flex gap-2">
                <Popover open={showFilters} onOpenChange={setShowFilters}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`gap-2 flex-1 sm:flex-none justify-between h-9 px-3.5 rounded-xl border-slate-200 dark:border-slate-700 text-xs font-semibold transition-all ${
                        filterStatus !== "all" || filterVendor !== "all"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 shrink-0" />
                        <span>Filters</span>
                        {(filterStatus !== "all" || filterVendor !== "all") && (
                          <Badge className="h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px] bg-blue-600 text-white border-0 rounded-full">
                            {[filterStatus !== "all", filterVendor !== "all"].filter(Boolean).length}
                          </Badge>
                        )}
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-4 rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <h4 className="font-bold text-slate-900 dark:text-white text-xs">Filter Cameras</h4>
                        {(filterStatus !== "all" || filterVendor !== "all") && (
                          <button
                            onClick={() => {
                              setFilterStatus("all");
                              setFilterVendor("all");
                            }}
                            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* Status Filter */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Status
                        </label>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                          <option value="all">All Statuses</option>
                          <option value="online">Online</option>
                          <option value="offline">Offline</option>
                          <option value="recording">Recording</option>
                          <option value="unauthorized">Unauthorized</option>
                        </select>
                      </div>

                      {/* Vendor Filter */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Vendor
                        </label>
                        <select
                          value={filterVendor}
                          onChange={(e) => setFilterVendor(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Main Camera Inventory Display Area */}
          <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            {isLoadingContent ? (
              <div className="flex items-center justify-center p-12 space-x-3 text-slate-500 dark:text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium">Fetching camera inventory across systems...</span>
              </div>
            ) : viewMode !== "cloud" && displayCameras.length === 0 ? (
              <div className="flex items-center justify-center p-12 text-center">
                <div className="space-y-3">
                  <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-slate-400">
                    <Camera className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">No cameras detected</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                    Your VMS system is connected but no active camera devices were found.
                  </p>
                  <Button onClick={() => refetchSingle()} variant="outline" className="rounded-xl text-xs font-semibold">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh Camera List
                  </Button>
                </div>
              </div>
            ) : filteredCameras.length === 0 && viewMode !== "cloud" ? (
              <div className="flex items-center justify-center p-12 text-center text-slate-500">
                <div className="space-y-3">
                  <Search className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-xs font-medium">No cameras match your search or filter criteria.</p>
                </div>
              </div>
            ) : null}

            {/* View Mode 1: Cloud Systems Accordion View */}
            {viewMode === "cloud" && !isLoadingContent && (
              <div className="p-4 space-y-4">
                {camerasBySystem.length === 0 ? (
                  <div className="flex items-center justify-center p-12 text-slate-500 text-xs font-medium">
                    <Camera className="w-5 h-5 mr-2 text-slate-400" />
                    <span>No camera systems available</span>
                  </div>
                ) : (
                  camerasBySystem.map((systemData) => {
                    const isExpanded = !collapsedSystems.has(systemData.systemId);
                    const isOnline = systemData.stateOfHealth === "online";

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

                    const onlineCount = filteredSystemCameras.filter(
                      (c) => c.status?.toLowerCase() === "online" || c.status?.toLowerCase() === "recording"
                    ).length;
                    const offlineCount = filteredSystemCameras.filter(
                      (c) => c.status?.toLowerCase() === "offline"
                    ).length;

                    return (
                      <div
                        key={systemData.systemId}
                        className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all"
                      >
                        {/* System Header */}
                        <button
                          onClick={() => toggleSystemExpansion(systemData.systemId)}
                          className="w-full px-4 py-3.5 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </div>
                            <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <div className="text-left">
                              <div className="font-semibold text-slate-900 dark:text-white text-xs md:text-sm">
                                {systemData.systemName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {filteredSystemCameras.length} cameras
                                {searchTerm || filterStatus !== "all" || filterVendor !== "all"
                                  ? ` (filtered from ${systemData.cameras.length})`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="hidden sm:flex items-center gap-2.5 text-[11px]">
                              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                <Wifi className="w-3 h-3" /> {onlineCount} online
                              </span>
                              <span className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                                <WifiOff className="w-3 h-3" /> {offlineCount} offline
                              </span>
                            </div>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                isOnline
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                              }`}
                            >
                              {isOnline ? "Online" : "Offline"}
                            </span>
                          </div>
                        </button>

                        {/* System Cameras Grid */}
                        {isExpanded && (
                          <div className="p-4 bg-slate-50/40 dark:bg-slate-900/40 border-t border-slate-200/80 dark:border-slate-800">
                            {!isOnline || systemData.cameras.length === 0 ? (
                              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 flex items-center gap-3 text-xs font-medium my-1">
                                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                                <div>
                                  <div className="font-semibold text-rose-700 dark:text-rose-300">Server Unreachable / Connection Failed</div>
                                  <div className="text-[11px] opacity-90">
                                    {(systemData as any).error || "This Nx Witness server is currently offline or unreachable via Nx Cloud Relay (HTTP 502 / Offline)."}
                                  </div>
                                </div>
                              </div>
                            ) : filteredSystemCameras.length === 0 ? (
                              <div className="p-6 text-center text-slate-500">
                                <Camera className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                                <p className="text-xs font-medium">
                                  {systemData.cameras.length === 0
                                    ? "No cameras in this system"
                                    : "No cameras match your search filters"}
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                                {filteredSystemCameras.map((camera) => (
                                  <div
                                    key={`${systemData.systemId}-${camera.id}`}
                                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 hover:shadow-md hover:border-blue-500/40 transition-all flex flex-col justify-between h-full min-h-[170px]"
                                  >
                                    <div>
                                      {/* Header */}
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                                          <Video className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                          <span
                                            className="font-semibold text-slate-900 dark:text-white text-xs truncate"
                                            title={camera.name}
                                          >
                                            {camera.name}
                                          </span>
                                        </div>
                                        {getStatusIcon(camera.status)}
                                      </div>

                                      {/* Tech Details Badges */}
                                      <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                        <div className="flex justify-between">
                                          <span>Vendor:</span>
                                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-1">
                                            {camera.vendor || "-"}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Model:</span>
                                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-1">
                                            {camera.model || "-"}
                                          </span>
                                        </div>
                                        {camera.ip && (
                                          <div className="flex justify-between">
                                            <span>IP / Host:</span>
                                            <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 truncate ml-1">
                                              {camera.ip}
                                            </span>
                                          </div>
                                        )}
                                        {camera.mac && (
                                          <div className="flex justify-between">
                                            <span>MAC:</span>
                                            <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400 truncate ml-1">
                                              {camera.mac}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Bottom Status Pill */}
                                    <div className="flex flex-col gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                                      <div className="flex items-center justify-between">
                                        <div className="group relative">
                                          <span
                                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${getStatusBadgeStyle(
                                              camera.status || ""
                                            )}`}
                                          >
                                            {camera.status || "Unknown"}
                                          </span>
                                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20">
                                            <div className="bg-slate-900 text-white text-[11px] rounded-xl py-2 px-3 max-w-xs shadow-xl border border-slate-800">
                                              <div className="font-bold mb-0.5">{camera.status || "Unknown"}</div>
                                              <div className="text-slate-300">
                                                {getStatusDescription(camera.status || "")}
                                              </div>
                                              {camera.status?.toLowerCase() === "offline" && (
                                                <div className="text-rose-400 font-mono text-[10px] mt-1 pt-1 border-t border-slate-800">
                                                  Offline: {getOfflineExactTime(camera).exactTime}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {camera.status?.toLowerCase() === "offline" && (
                                        <div className="flex items-center gap-1 text-[10px] font-mono text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                          <Clock className="w-3 h-3 shrink-0" />
                                          <span className="truncate">Offline: {getOfflineExactTime(camera).exactTime}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* View Mode 2: Grid View */}
            {!loading && viewMode === "grid" && filteredCameras.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                {filteredCameras.map((camera, index) => (
                  <div
                    key={`grid-${camera.systemId || "sys"}-${camera.id || "cam"}-${index}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 hover:shadow-md hover:border-blue-500/40 transition-all flex flex-col justify-between h-full"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <Video className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                            {camera.name}
                          </span>
                        </div>
                        {getStatusIcon(camera.status)}
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>System:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-1">
                            {camera.systemName || "Local"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Vendor:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-1">
                            {camera.vendor || "-"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Model:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-1">
                            {camera.model || "-"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${getStatusBadgeStyle(
                            camera.status
                          )}`}
                          title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                        >
                          {camera.status}
                        </span>
                      </div>
                      {camera.status?.toLowerCase() === "offline" && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span className="truncate">Offline: {getOfflineExactTime(camera).exactTime}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* View Mode 3: List View (Table) */}
            {!loading && viewMode === "list" && filteredCameras.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-left">
                    <tr>
                      <th className="px-4 py-3">Camera</th>
                      <th className="px-4 py-3">System</th>
                      <th className="px-4 py-3">Vendor / Model</th>
                      <th className="px-4 py-3">IP / Address</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredCameras.map((camera, index) => (
                      <tr key={`list-${camera.systemId || "sys"}-${camera.id || "cam"}-${index}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-2.5">
                            <Video className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="font-bold text-slate-900 dark:text-white">{camera.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {camera.systemName || "Local System"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {camera.vendor || "-"}
                          </span>
                          {camera.model && <span className="text-slate-500"> / {camera.model}</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-blue-600 dark:text-blue-400">
                          {camera.ip || camera.url || "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(camera.status)}
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${getStatusBadgeStyle(
                                  camera.status
                                )}`}
                                title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                              >
                                {camera.status}
                              </span>
                            </div>
                            {camera.status?.toLowerCase() === "offline" && (
                              <div className="flex items-center gap-1 text-[10px] font-mono text-rose-600 dark:text-rose-400">
                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                <span>Since: {getOfflineExactTime(camera).exactTime}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
