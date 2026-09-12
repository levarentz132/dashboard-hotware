"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  FileText,
  Calendar,
  RefreshCw,
  Camera,
  Video,
  Database,
  Activity,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  Shield,
  Server,
  HardDrive,
  Cloud,
  FileCode,
  FileSpreadsheet,
  Cpu,
  MemoryStick,
  CheckCircle2,
  Clock,
  Info,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Search,
  WifiOff,
  Wifi,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import Cookies from "js-cookie";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import { useCloudSystemsWithOnline } from "@/hooks/use-cloud-systems-with-online";
import { useAlarmsQuery, useEventsQuery } from "@/hooks/use-nx-queries";
import nxAPI, { type NxCamera } from "@/lib/nxapi";
import { fetchFromCloudRelay } from "@/hooks/use-async-data";
import { getElectronHeaders } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { normalizeNxEvents } from "@/lib/nx-normalization";
import {
  exportToWord,
  exportToPdf,
  type FullReportData,
  type CameraReportItem,
  type OfflineCameraItem,
  type OfflineCameraIncident,
  type ServerHealthItem,
  type ServerStorageDiskItem,
  type AlarmReportItem,
  type S3LogItem,
} from "./export-utils";
import { getOfflineExactTime, formatExactTimestamp } from "@/lib/camera-offline-tracker";
import { ORIX_LOGO_BASE64_PNG } from "@/assets/orix-logo";

// ============================================
// CONSTANTS & BRANDING
// ============================================
const COMPANY_NAME = "PT ORIX FINANCE INDONESIA";
const DASHBOARD_TITLE = "ORIX INDONESIA FINANCE";

type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly" | "custom";
type ReportCategory = "all" | "cameras" | "recordings" | "health" | "alarms" | "s3bridge";

function formatBytesToReadable(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(diffMs: number): string {
  if (!diffMs || diffMs <= 0 || isNaN(diffMs)) return "< 1s";
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 1) return "< 1s";
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  if (days === 0 && hours === 0 && seconds > 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

const normalizeEpochMs = (value: string | number | null | undefined): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const raw = typeof value === "string" ? Number(value) : value;
  if (Number.isFinite(raw)) {
    const abs = Math.abs(raw);
    if (abs >= 1e15) return raw / 1000;
    if (abs >= 1e12) return raw;
    if (abs >= 1e9) return raw * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      const year = new Date(parsed).getFullYear();
      if (year >= 1970 && year <= 2100) return parsed;
    }
  }
  return null;
};

const formatTimestamp = (timestampValue: string | number | null | undefined): string => {
  if (timestampValue === undefined || timestampValue === null || timestampValue === "") return "N/A";
  const ms = normalizeEpochMs(timestampValue);
  if (ms === null) return String(timestampValue);
  const date = new Date(ms);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const getEventTypeLabel = (eventType: string, caption?: string): string => {
  if (eventType === "userDefinedEvent" && caption) return caption;
  const labels: Record<string, string> = {
    undefinedEvent: "Undefined Event",
    cameraMotionEvent: "Motion Detected",
    cameraInputEvent: "Camera Input",
    cameraDisconnectEvent: "Camera Disconnected",
    deviceDisconnected: "Camera Disconnected",
    storageFailureEvent: "Storage Failure",
    networkIssueEvent: "Network Issue",
    cameraIpConflictEvent: "IP Conflict",
    serverFailureEvent: "Server Failure",
    serverConflictEvent: "Server Conflict",
    serverStartEvent: "Server Started",
    serverStarted: "Server Started",
    licenseIssueEvent: "License Issue",
    backupFinishedEvent: "Backup Complete",
    softwareTriggerEvent: "Software Trigger",
    analyticsSdkEvent: "Analytics Event",
    pluginDiagnosticEvent: "Plugin Diagnostic",
    poeOverBudgetEvent: "PoE Over Budget",
    fanErrorEvent: "Fan Error",
    analyticsSdkObjectDetected: "Object Detected",
    serverCertificateError: "Certificate Error",
    ldapSyncIssueEvent: "LDAP Sync Issue",
    saasIssueEvent: "Cloud Issue",
    systemHealthEvent: "System Health",
    maxSystemHealthEvent: "Critical Health",
    anyCameraEvent: "Camera Event",
    anyServerEvent: "Server Event",
    anyEvent: "System Event",
    userDefinedEvent: "Custom Event",
  };
  return labels[eventType] || eventType;
};

export default function ReportingManagement() {
  // State variables
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [category, setCategory] = useState<ReportCategory>("all");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("all");
  const [s3TimeRange, setS3TimeRange] = useState<"1h" | "24h" | "7d">("1h");
  const [globalCameras, setGlobalCameras] = useState<any[]>([]);
  
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return formatDateLocal(firstDay);
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const today = new Date();
    return formatDateLocal(today);
  });
  
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [offlineSummaryFilter, setOfflineSummaryFilter] = useState<"incidents" | "all">("incidents");
  const [showExecutiveAlarmSummary, setShowExecutiveAlarmSummary] = useState<boolean>(true);

  // State for expanding camera incident details in Offline Camera Summary
  const [expandedCameras, setExpandedCameras] = useState<Record<string, boolean>>({});
  const [selectedCameraForModal, setSelectedCameraForModal] = useState<OfflineCameraItem | null>(null);

  const toggleCameraExpand = (camId: string) => {
    setExpandedCameras((prev) => ({
      ...prev,
      [camId]: !prev[camId],
    }));
  };

  // Raw fetched arrays for aggregated system resources
  const [cameras, setCameras] = useState<NxCamera[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [storages, setStorages] = useState<any[]>([]);
  const [alarmEvents, setAlarmEvents] = useState<any[]>([]);
  const [alarmSearch, setAlarmSearch] = useState<string>("");
  const [alarmSeverityFilter, setAlarmSeverityFilter] = useState<string>("all");
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [systemOffline, setSystemOffline] = useState<boolean>(false);

  // Check if local NX user session is present
  const hasLocalServer = useMemo(() => {
    return typeof window !== "undefined" && (!!Cookies.get("local_nx_user") || !!Cookies.get("nx_server_id"));
  }, []);

  // Live Cloud Systems list & events queries
  const { cloudSystems, loadingCloud, refetchCloudSystems } = useCloudSystemsWithOnline();
  const { alarms, loading: loadingAlarms, refetch: refetchAlarms } = useAlarmsQuery();
  const { events, loading: loadingEvents, refetch: refetchEvents } = useEventsQuery(300);

  // Global cameras lookup fallback from device monitor
  useEffect(() => {
    const fetchGlobalCameras = async () => {
      try {
        const response = await fetch("/api/device-monitor");
        if (response.ok) {
          const snapshot = await response.json();
          const allDevices = (snapshot.systems || []).flatMap((s: any) => s.devices || []);
          setGlobalCameras(allDevices);
        }
      } catch (e) {
        console.error("[ReportingManagement] Failed to fetch global cameras lookup:", e);
      }
    };
    fetchGlobalCameras();
  }, []);

  // ============================================
  // MULTI-SYSTEM DATA AGGREGATION (SERVER FILTER ALL)
  // ============================================
  const fetchAggregatedData = useCallback(async () => {
    setLoadingData(true);
    setFetchError(null);
    setSystemOffline(false);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...getElectronHeaders(),
      };

      const localUserStr = Cookies.get("local_nx_user");
      let localSid = "local";
      if (localUserStr) {
        try {
          const parsed = JSON.parse(localUserStr);
          localSid = Cookies.get("nx_server_id") || parsed.serverId || "local";
        } catch (_) {}
      }

      if (selectedSystemId === "all") {
        // 1. Fetch from all online cloud systems (or all cloud systems)
        const activeSystems = cloudSystems.filter((s) => s.isOnline);
        const targetSystems = activeSystems.length > 0 ? activeSystems : cloudSystems;

        const devicePromises = targetSystems.map((sys) =>
          fetchFromCloudRelay<NxCamera[]>(sys.id, "/devices")
            .then((res) => (res || []).map((c) => ({ ...c, _systemName: sys.name, _systemId: sys.id })))
            .catch(() => [])
        );
        const serverPromises = targetSystems.map((sys) =>
          fetchFromCloudRelay<any[]>(sys.id, "/servers")
            .then((res) => (res || []).map((srv) => ({ ...srv, _systemName: sys.name, _systemId: sys.id })))
            .catch(() => [])
        );
        const storagePromises = targetSystems.map((sys) =>
          fetch(`/api/cloud/storages?systemId=${encodeURIComponent(sys.id)}`)
            .then((res) => (res.ok ? res.json() : []))
            .then((list) =>
              (Array.isArray(list) ? list : []).map((st: any) => ({
                ...st,
                _systemName: sys.name,
                _systemId: sys.id,
              }))
            )
            .catch(() => [])
        );
        const eventPromises = targetSystems.map((sys) =>
          fetch(`/api/cloud/events?systemId=${encodeURIComponent(sys.id)}`, { headers })
            .then((res) => (res.ok ? res.json() : []))
            .then((list) => {
              const normalized = normalizeNxEvents(Array.isArray(list) ? list : []);
              return normalized.map((ev: any) => ({
                ...ev,
                _systemName: sys.name,
                _systemId: sys.id,
              }));
            })
            .catch(() => [])
        );

        // 2. Also fetch local system if local session is available (Local-first strategy matching AlarmConsole)
        const localDevicePromise = localUserStr
          ? fetchFromCloudRelay<NxCamera[]>(localSid, "/devices")
              .catch(() => nxAPI.getCameras().catch(() => []))
              .then((cams) => (cams || []).map((c: any) => ({ ...c, _systemName: "Local Server", _systemId: localSid })))
              .catch(() => [])
          : Promise.resolve([]);

        const localServerPromise = localUserStr
          ? fetchFromCloudRelay<any[]>(localSid, "/servers")
              .catch(() => nxAPI.getServers().catch(() => []))
              .then((srvs) => (srvs || []).map((s: any) => ({ ...s, _systemName: "Local Server", _systemId: localSid })))
              .catch(() => [])
          : Promise.resolve([]);

        const localStoragePromise = localUserStr
          ? fetch(`/api/cloud/storages?systemId=${encodeURIComponent(localSid)}`)
              .then((res) => (res.ok ? res.json() : []))
              .catch(() => nxAPI.getStorages().catch(() => []))
              .then((strs) => (strs || []).map((st: any) => ({ ...st, _systemName: "Local Server", _systemId: localSid })))
              .catch(() => [])
          : Promise.resolve([]);

        const localEventPromise = localUserStr
          ? fetch(`/api/cloud/events?systemId=${encodeURIComponent(localSid)}`, { headers })
              .then((res) => (res.ok ? res.json() : []))
              .catch(() => [])
              .then((evts) => {
                const normalized = normalizeNxEvents(Array.isArray(evts) ? evts : []);
                return normalized.map((ev: any) => ({
                  ...ev,
                  _systemName: "Local Server",
                  _systemId: localSid,
                }));
              })
              .catch(() => [])
          : Promise.resolve([]);

        const [
          deviceResults,
          serverResults,
          storageResults,
          eventResults,
          localDevices,
          localServers,
          localStorages,
          localEvents,
        ] = await Promise.all([
          Promise.allSettled(devicePromises),
          Promise.allSettled(serverPromises),
          Promise.allSettled(storagePromises),
          Promise.allSettled(eventPromises),
          localDevicePromise,
          localServerPromise,
          localStoragePromise,
          localEventPromise,
        ]);

        const seenCamIds = new Set<string>();
        const allCams: NxCamera[] = [];
        const addCamIfUnique = (cam: any) => {
          if (!cam) return;
          const cleanId = String(cam.id || "").replace(/[{}]/g, "").toLowerCase();
          if (cleanId) {
            if (seenCamIds.has(cleanId)) return;
            seenCamIds.add(cleanId);
          }
          allCams.push(cam);
        };

        (Array.isArray(localDevices) ? localDevices : []).forEach(addCamIfUnique);
        deviceResults.forEach((res) => {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            res.value.forEach(addCamIfUnique);
          }
        });

        const seenSrvIds = new Set<string>();
        const allSrvs: any[] = [];
        const addSrvIfUnique = (srv: any) => {
          if (!srv) return;
          const cleanId = String(srv.id || srv.serverId || srv.name || "").replace(/[{}]/g, "").toLowerCase();
          if (cleanId) {
            if (seenSrvIds.has(cleanId)) return;
            seenSrvIds.add(cleanId);
          }
          allSrvs.push(srv);
        };

        (Array.isArray(localServers) ? localServers : []).forEach(addSrvIfUnique);
        serverResults.forEach((res) => {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            res.value.forEach(addSrvIfUnique);
          }
        });

        const allStrs: any[] = [...(Array.isArray(localStorages) ? localStorages : [])];
        storageResults.forEach((res) => {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            allStrs.push(...res.value);
          }
        });

        const allEvts: any[] = [...(Array.isArray(localEvents) ? localEvents : [])];
        eventResults.forEach((res) => {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            allEvts.push(...res.value);
          }
        });

        setCameras(allCams);
        setServers(allSrvs);
        setStorages(allStrs);
        setAlarmEvents(allEvts);
      } else if (selectedSystemId === "local" || selectedSystemId === localSid) {
        // Fetch Local System directly
        const [localCams, localSrvs, localStrs, localEvents] = await Promise.all([
          fetchFromCloudRelay<NxCamera[]>(localSid, "/devices").catch(() => nxAPI.getCameras().catch(() => [])),
          fetchFromCloudRelay<any[]>(localSid, "/servers").catch(() => nxAPI.getServers().catch(() => [])),
          fetch(`/api/cloud/storages?systemId=${encodeURIComponent(localSid)}`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => nxAPI.getStorages().catch(() => [])),
          fetch(`/api/cloud/events?systemId=${encodeURIComponent(localSid)}`, { headers })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
        ]);

        setCameras((localCams || []).map((c: any) => ({ ...c, _systemName: "Local Server" })));
        setServers((localSrvs || []).map((s: any) => ({ ...s, _systemName: "Local Server" })));
        setStorages((Array.isArray(localStrs) ? localStrs : []).map((st: any) => ({ ...st, _systemName: "Local Server" })));
        const normalized = normalizeNxEvents(Array.isArray(localEvents) ? localEvents : []);
        setAlarmEvents(
          normalized.map((ev: any) => ({
            ...ev,
            _systemName: "Local Server",
            _systemId: localSid,
          }))
        );
      } else {
        // Fetch specific single cloud system safely
        const targetSys = cloudSystems.find((s) => s.id === selectedSystemId);
        const sysName = targetSys?.name || selectedSystemId;

        const [camsRes, srvsRes, strsRes, evtsRes] = await Promise.allSettled([
          fetchFromCloudRelay<NxCamera[]>(selectedSystemId, "/devices"),
          fetchFromCloudRelay<any[]>(selectedSystemId, "/servers"),
          fetch(`/api/cloud/storages?systemId=${encodeURIComponent(selectedSystemId)}`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/cloud/events?systemId=${encodeURIComponent(selectedSystemId)}`, { headers }).then(async (r) => {
            if (!r.ok) {
              if (r.status === 503 || r.status === 502 || r.status === 504) {
                setSystemOffline(true);
              }
              return [];
            }
            return r.json();
          }),
        ]);

        const sysCams = camsRes.status === "fulfilled" && Array.isArray(camsRes.value) ? camsRes.value : [];
        const sysSrvs = srvsRes.status === "fulfilled" && Array.isArray(srvsRes.value) ? srvsRes.value : [];
        const sysStrs = strsRes.status === "fulfilled" && Array.isArray(strsRes.value) ? strsRes.value : [];
        const sysEvents = evtsRes.status === "fulfilled" && Array.isArray(evtsRes.value) ? evtsRes.value : [];

        if (sysCams.length === 0 && sysSrvs.length === 0 && sysEvents.length === 0) {
          setSystemOffline(true);
        }

        setCameras(sysCams.map((c: any) => ({ ...c, _systemName: sysName })));
        setServers(sysSrvs.map((s: any) => ({ ...s, _systemName: sysName })));
        setStorages(sysStrs.map((st: any) => ({ ...st, _systemName: sysName })));
        const normalized = normalizeNxEvents(sysEvents);
        setAlarmEvents(
          normalized.map((ev: any) => ({
            ...ev,
            _systemName: sysName,
            _systemId: selectedSystemId,
          }))
        );
      }
    } catch (err) {
      console.error("[ReportingManagement] Error aggregating reporting data:", err);
      setFetchError("Failed to fetch system data from server endpoints.");
    } finally {
      setLoadingData(false);
    }
  }, [selectedSystemId, cloudSystems]);

  // Initial & Dependency Trigger for Data Aggregation
  useEffect(() => {
    fetchAggregatedData();
  }, [fetchAggregatedData]);

  // Manual Refresh Handler
  const handleRefresh = useCallback(() => {
    refetchCloudSystems();
    refetchAlarms();
    refetchEvents();
    fetchAggregatedData();
  }, [refetchCloudSystems, refetchAlarms, refetchEvents, fetchAggregatedData]);

  // Date Period Change Handler (ACCURATE PERIOD FIX — NO FUTURE DATES)
  const handlePeriodChange = (newPeriod: ReportPeriod) => {
    setPeriod(newPeriod);
    const today = new Date();
    const todayStr = formatDateLocal(today);
    const year = today.getFullYear();
    const month = today.getMonth();

    if (newPeriod === "daily") {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (newPeriod === "weekly") {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      setDateFrom(formatDateLocal(from));
      setDateTo(todayStr);
    } else if (newPeriod === "monthly") {
      const firstDay = new Date(year, month, 1);
      setDateFrom(formatDateLocal(firstDay));
      setDateTo(todayStr);
    } else if (newPeriod === "yearly") {
      const firstDayYear = new Date(year, 0, 1);
      setDateFrom(formatDateLocal(firstDayYear));
      setDateTo(todayStr);
    }
  };

  // ============================================
  // REAL METRICS CALCULATIONS
  // ============================================
  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter((c: any) =>
    ["online", "Online", "recording", "Recording"].includes(String(c.status))
  ).length;
  const offlineCamerasCount = totalCameras - onlineCameras;
  const instantCameraOnlineRate = totalCameras > 0 ? Number(((onlineCameras / totalCameras) * 100).toFixed(1)) : 0;

  const totalServers = servers.length;
  const onlineServers = servers.filter((s: any) =>
    ["online", "Online"].includes(String(s.status ?? s.stateOfHealth ?? ""))
  ).length;
  const serverOnlineRate = totalServers > 0 ? Math.round((onlineServers / totalServers) * 100) : 0;

  // Camera Name Map for resolving device IDs
  const cameraMap = useMemo(() => {
    const map = new Map<string, string>();
    globalCameras.forEach((c: any) => {
      if (c.id) {
        const cleanId = String(c.id).replace(/[{}]/g, "").toLowerCase();
        map.set(cleanId, c.name);
        map.set(String(c.id), c.name);
      }
    });
    cameras.forEach((c: any) => {
      if (c.id) {
        const cleanId = String(c.id).replace(/[{}]/g, "").toLowerCase();
        map.set(cleanId, c.name);
        map.set(String(c.id), c.name);
      }
    });
    return map;
  }, [cameras, globalCameras]);

  // Server Name Map for resolving server IDs
  const serverMap = useMemo(() => {
    const map = new Map<string, string>();
    servers.forEach((s: any) => {
      if (s.id) {
        const cleanId = String(s.id).replace(/[{}]/g, "").toLowerCase();
        map.set(cleanId, s.name);
        map.set(String(s.id), s.name);
      }
    });
    return map;
  }, [servers]);

  // Selected Server Name Label
  const selectedServerLabel = useMemo(() => {
    if (selectedSystemId === "all") return "ALL SERVERS (CENTRALIZED)";
    if (selectedSystemId === "local") return "LOCAL SERVER";
    const sys = cloudSystems.find((s) => s.id === selectedSystemId);
    return (sys?.name || selectedSystemId).toUpperCase();
  }, [selectedSystemId, cloudSystems]);

  // Combine fetched alarm events from Alarm Console endpoint or fallback to queries
  const rawAlarmList = useMemo(() => {
    if (alarmEvents.length > 0) return normalizeNxEvents(alarmEvents);
    if (Array.isArray(events) && events.length > 0) return normalizeNxEvents(events);
    if (Array.isArray(alarms) && alarms.length > 0) return normalizeNxEvents(alarms);
    return [];
  }, [alarmEvents, events, alarms]);

  const eventList = rawAlarmList;

  const parsedAlarmList = useMemo(() => {
    return rawAlarmList.map((ev: any, idx: number) => {
      const eventType = ev.eventData?.type || ev.type || ev.eventType || "systemEvent";
      const eventLabel = getEventTypeLabel(eventType, ev.actionData?.caption);
      let caption = ev.actionData?.caption || ev.caption || ev.name || "";
      let description = ev.actionData?.description || ev.description || "";
      let sourceName = ev.actionData?.sourceName || ev.sourceName || ev.source || "";
      const systemName = ev._systemName || ev.systemName || (selectedSystemId === "all" ? "Centralized" : selectedServerLabel);

      // Check deviceIds for camera name if sourceName is empty
      const deviceIds = ev.actionData?.deviceIds || (ev.cameraId ? [ev.cameraId] : []);
      if (!sourceName && deviceIds.length > 0) {
        const devId = String(deviceIds[0]).replace(/[{}]/g, "").toLowerCase();
        sourceName = cameraMap.get(devId) || cameraMap.get(deviceIds[0]) || "";
      }

      // Check serverId for server name if sourceName is empty
      const serverId = ev.eventData?.serverId || ev.actionData?.serverId || ev.serverId;
      if (!sourceName && serverId) {
        const cleanSrvId = String(serverId).replace(/[{}]/g, "").toLowerCase();
        sourceName = serverMap.get(cleanSrvId) || serverMap.get(serverId) || "";
      }

      // Camera disconnect friendly text
      if (
        eventType === "cameraDisconnectEvent" ||
        eventType === "deviceDisconnected" ||
        (caption && caption.toLowerCase().includes("disconnected"))
      ) {
        const devName = sourceName || "Camera";
        if (!caption || caption === "deviceDisconnected" || caption === "cameraDisconnectEvent") {
          caption = `${devName} Disconnected`;
        }
        if (!description || description === "deviceDisconnected" || description === "cameraDisconnectEvent") {
          description = `Camera '${devName}' has lost connection to the server.`;
        }
      }

      if (!sourceName) {
        sourceName = caption || eventLabel || "System Event";
      }

      // Calculate timestamp in ms
      let timestampMs: number | null = normalizeEpochMs(ev.timestampMs) ??
        normalizeEpochMs(ev.actionData?.timestamp || ev.eventData?.timestamp) ??
        normalizeEpochMs(ev.timestamp);

      // Determine severity matching Alarm Console
      const rawLevel = String(ev.actionData?.level ?? ev.level ?? ev.severity ?? "info").toLowerCase();
      let severity = rawLevel;
      if (eventType === "cameraDisconnectEvent" || eventType === "deviceDisconnected") {
        if (timestampMs) {
          const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
          severity = ageHours > 24 ? "critical" : "info";
        } else {
          severity = "warning";
        }
      } else if (
        ["error", "critical", "fatal", "serverfailure", "serverfailureevent"].includes(eventType.toLowerCase()) ||
        ["error", "critical", "fatal"].includes(rawLevel)
      ) {
        severity = "critical";
      } else if (
        ["warning", "warn", "storagefailureevent", "serverconflictevent", "networkissueevent"].includes(eventType.toLowerCase()) ||
        ["warning", "warn"].includes(rawLevel)
      ) {
        severity = "warning";
      }

      return {
        id: ev.id ? `${ev.id}-${idx}` : `${eventType}-${timestampMs || "0"}-${idx}`,
        eventType,
        eventLabel,
        sourceName: sourceName.toUpperCase(),
        systemName: String(systemName).toUpperCase(),
        caption,
        description: description || caption || "No additional description available",
        severity: severity.toUpperCase(),
        timestampMs,
        formattedTime: formatTimestamp(timestampMs),
      };
    });
  }, [rawAlarmList, cameraMap, serverMap, selectedSystemId, selectedServerLabel]);

  // Period / Date Range filter
  const fromTime = useMemo(() => (dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0), [dateFrom]);
  const toTime = useMemo(() => (dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity), [dateTo]);

  const targetAlarmEvents = useMemo(() => {
    const periodFiltered = parsedAlarmList.filter((a) => {
      if (!a.timestampMs || isNaN(a.timestampMs)) return true;
      return a.timestampMs >= fromTime && a.timestampMs <= toTime;
    });
    return periodFiltered.length > 0 ? periodFiltered : parsedAlarmList;
  }, [parsedAlarmList, fromTime, toTime]);

  // Filter for Tab 6 search & severity dropdown
  const displayedTabAlarms = useMemo(() => {
    return targetAlarmEvents.filter((a) => {
      if (alarmSeverityFilter !== "all" && a.severity !== alarmSeverityFilter) {
        return false;
      }
      if (alarmSearch.trim()) {
        const q = alarmSearch.toLowerCase();
        return (
          a.sourceName.toLowerCase().includes(q) ||
          a.systemName.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.caption.toLowerCase().includes(q) ||
          a.eventType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [targetAlarmEvents, alarmSeverityFilter, alarmSearch]);

  const totalAlarms = targetAlarmEvents.length;

  const criticalAlarms = useMemo(() => {
    return targetAlarmEvents.filter((a) => a.severity === "CRITICAL").length;
  }, [targetAlarmEvents]);

  const warningAlarms = useMemo(() => {
    return targetAlarmEvents.filter((a) => a.severity === "WARNING").length;
  }, [targetAlarmEvents]);

  const infoAlarms = useMemo(() => {
    return targetAlarmEvents.filter((a) => a.severity === "INFO").length;
  }, [targetAlarmEvents]);

  // Dynamic Offline Camera Summary Title
  const offlineSummaryTitle = useMemo(() => {
    switch (period) {
      case "daily":
        return "DAILY OFFLINE CAMERA SUMMARY";
      case "weekly":
        return "WEEKLY OFFLINE CAMERA SUMMARY";
      case "monthly":
        return "MONTHLY OFFLINE CAMERA SUMMARY";
      case "yearly":
        return "YEARLY OFFLINE CAMERA SUMMARY";
      default:
        return "OFFLINE CAMERA SUMMARY";
    }
  }, [period]);

  // Dynamic Period Description Label
  const periodLabel = useMemo(() => {
    if (period === "daily") {
      return `DAILY • ${dateTo} (00:00 - 23:59)`;
    } else if (period === "weekly") {
      return `WEEKLY • ${dateFrom} TO ${dateTo} (7 DAYS)`;
    } else if (period === "monthly") {
      return `MONTHLY • ${dateFrom} TO ${dateTo}`;
    } else if (period === "yearly") {
      return `YEARLY • ${dateFrom} TO ${dateTo}`;
    }
    return `CUSTOM • ${dateFrom} TO ${dateTo}`;
  }, [period, dateFrom, dateTo]);

  // ============================================
  // SERVER STORAGE DISK BREAKDOWN (REQUIREMENT 1)
  // ============================================
  const formattedServerDisks = useMemo<ServerStorageDiskItem[]>(() => {
    if (!storages || storages.length === 0) return [];

    return storages.map((st: any, idx: number) => {
      const serverName = (st._systemName || st.serverName || "SERVER").toUpperCase();
      const diskName = (st.name || st.path || st.url || `DISK ${idx + 1}`).toUpperCase();
      const status = (st.statusInfo?.status || st.status || "ONLINE").toUpperCase();

      const totalBytes = Number(st.statusInfo?.totalSpace || st.spaceLimitB || st.totalSpace || 0);
      const freeBytes = Number(st.statusInfo?.freeSpace || st.freeSpace || 0);
      const usedBytes = totalBytes > freeBytes ? totalBytes - freeBytes : Number(st.statusInfo?.usedSpace || 0);
      const usagePct = totalBytes > 0 ? `${Math.round((usedBytes / totalBytes) * 100)}%` : "N/A";

      return {
        serverName,
        diskName,
        status: ["online", "ONLINE", "ok", "OK"].includes(status) ? "ONLINE" : "OFFLINE",
        total: totalBytes > 0 ? formatBytesToReadable(totalBytes) : "DATA NOT AVAILABLE FROM SOURCE",
        used: usedBytes > 0 ? formatBytesToReadable(usedBytes) : "DATA NOT AVAILABLE FROM SOURCE",
        free: freeBytes > 0 ? formatBytesToReadable(freeBytes) : "DATA NOT AVAILABLE FROM SOURCE",
        usagePct,
      };
    });
  }, [storages]);

  // ============================================
  // OFFLINE CAMERA SUMMARY CALCULATOR (WHEN OFFLINE & HAS BEEN ONLINE AUDIT)
  // ============================================
  const offlineCamerasSummary = useMemo<OfflineCameraItem[]>(() => {
    if (!cameras || cameras.length === 0) return [];

    const seenIds = new Set<string>();
    const uniqueCameras = cameras.filter((cam: any) => {
      const cleanId = String(cam.id || "").replace(/[{}]/g, "").toLowerCase();
      if (!cleanId) return true;
      if (seenIds.has(cleanId)) return false;
      seenIds.add(cleanId);
      return true;
    });

    return uniqueCameras.map((cam: any) => {
      const isOnline = ["online", "Online", "recording", "Recording"].includes(String(cam.status));
      const cleanCamId = String(cam.id || "").replace(/[{}]/g, "").toLowerCase();
      const camNameLower = String(cam.name || "").toLowerCase();

      // Find events matching this camera
      const camEvents = eventList.filter((e: any) => {
        if (cleanCamId) {
          const devIds = (e.actionData?.deviceIds || []).map((id: string) => String(id).replace(/[{}]/g, "").toLowerCase());
          if (devIds.includes(cleanCamId)) return true;
          const resId = String(e.resourceId || e.cameraId || e.eventData?.resourceId || e.source || "").replace(/[{}]/g, "").toLowerCase();
          if (resId.includes(cleanCamId)) return true;
        }
        if (camNameLower) {
          const txt = String(e.actionData?.caption || e.actionData?.description || e.actionData?.sourceName || e.caption || e.description || e.sourceName || "").toLowerCase();
          if (txt.includes(camNameLower)) return true;
        }
        return false;
      });

      // 1. Filter Disconnect Events sorted earliest to latest
      const rawDisconnectEvents = camEvents.filter((e: any) => {
        const type = String(e.eventData?.type || e.type || e.eventType || "").toLowerCase();
        const caption = String(e.actionData?.caption || e.caption || "").toLowerCase();
        const desc = String(e.actionData?.description || e.description || "").toLowerCase();

        // Must NOT be an online/reconnect event
        if (
          caption.includes("online") ||
          desc.includes("back online") ||
          desc.includes("reconnected") ||
          type.includes("reconnect")
        ) {
          return false;
        }

        return (
          type.includes("disconnect") ||
          type.includes("offline") ||
          caption.includes("disconnect") ||
          caption.includes("offline") ||
          desc.includes("lost connection") ||
          desc.includes("is now offline") ||
          desc.includes("has lost connection") ||
          desc.includes("disconnected")
        );
      }).sort((a: any, b: any) => {
        const timeA = normalizeEpochMs(a.timestampMs) ?? normalizeEpochMs(a.actionData?.timestamp || a.eventData?.timestamp) ?? normalizeEpochMs(a.timestamp) ?? 0;
        const timeB = normalizeEpochMs(b.timestampMs) ?? normalizeEpochMs(b.actionData?.timestamp || b.eventData?.timestamp) ?? normalizeEpochMs(b.timestamp) ?? 0;
        return timeA - timeB;
      });

      // 2. Filter Recovery / Reconnect Events from alarm/event stream
      const rawRecoveryEvents = camEvents.filter((e: any) => {
        const type = String(e.eventData?.type || e.type || e.eventType || "").toLowerCase();
        const caption = String(e.actionData?.caption || e.caption || "").toLowerCase();
        const desc = String(e.actionData?.description || e.description || "").toLowerCase();

        // Critical: MUST NOT be a disconnect event (note: "disconnected" contains substring "connected")
        const isDisconnect =
          type.includes("disconnect") ||
          type.includes("offline") ||
          caption.includes("disconnect") ||
          caption.includes("offline") ||
          desc.includes("lost connection") ||
          desc.includes("is now offline") ||
          desc.includes("has lost connection");

        if (isDisconnect) {
          return false;
        }

        return (
          type.includes("online") ||
          type.includes("reconnect") ||
          type === "cameraconnectedevent" ||
          type === "deviceconnected" ||
          caption.includes("camera online") ||
          caption.includes("back online") ||
          caption.includes("reconnect") ||
          desc.includes("reconnected") ||
          desc.includes("back online") ||
          desc.includes("is now back online") ||
          desc.includes("connection restored")
        );
      }).sort((a: any, b: any) => {
        const timeA = normalizeEpochMs(a.timestampMs) ?? normalizeEpochMs(a.actionData?.timestamp || a.eventData?.timestamp) ?? normalizeEpochMs(a.timestamp) ?? 0;
        const timeB = normalizeEpochMs(b.timestampMs) ?? normalizeEpochMs(b.actionData?.timestamp || b.eventData?.timestamp) ?? normalizeEpochMs(b.timestamp) ?? 0;
        return timeA - timeB;
      });

      // 3. Build chronological outage sessions by pairing each disconnect with its subsequent recovery from the alarms
      type OutageSession = {
        discTimeMs: number;
        discEvent: any;
        recTimeMs: number | null;
        recEvent: any | null;
      };

      const sessions: OutageSession[] = [];
      let currentSession: OutageSession | null = null;

      type CombinedEvent = {
        kind: "disconnect" | "recovery";
        timeMs: number;
        event: any;
      };

      const allTimeline: CombinedEvent[] = [];
      rawDisconnectEvents.forEach((ev: any) => {
        const t = normalizeEpochMs(ev.timestampMs) ??
          normalizeEpochMs(ev.actionData?.timestamp || ev.eventData?.timestamp) ??
          normalizeEpochMs(ev.timestamp);
        if (t) allTimeline.push({ kind: "disconnect", timeMs: t, event: ev });
      });

      rawRecoveryEvents.forEach((ev: any) => {
        const t = normalizeEpochMs(ev.timestampMs) ??
          normalizeEpochMs(ev.actionData?.timestamp || ev.eventData?.timestamp) ??
          normalizeEpochMs(ev.timestamp);
        if (t) allTimeline.push({ kind: "recovery", timeMs: t, event: ev });
      });

      // Sort chronologically. If identical time, disconnect is processed before recovery.
      allTimeline.sort((a, b) => {
        if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
        if (a.kind === "disconnect" && b.kind === "recovery") return -1;
        if (a.kind === "recovery" && b.kind === "disconnect") return 1;
        return 0;
      });

      allTimeline.forEach((item) => {
        if (item.kind === "disconnect") {
          if (!currentSession) {
            // New outage session starts
            currentSession = {
              discTimeMs: item.timeMs,
              discEvent: item.event,
              recTimeMs: null,
              recEvent: null,
            };
          } else {
            // Already in an active outage session.
            // Clustered disconnects or retries belong to the same physical outage.
          }
        } else if (item.kind === "recovery") {
          if (currentSession) {
            // Recovery event ends the current outage session
            if (item.timeMs >= currentSession.discTimeMs) {
              currentSession.recTimeMs = item.timeMs;
              currentSession.recEvent = item.event;
              sessions.push(currentSession);
              currentSession = null;
            }
          }
        }
      });

      // If an outage session was opened and never recovered:
      if (currentSession) {
        sessions.push(currentSession);
      }

      // 4. Transform outage sessions into user-facing incidents
      const incidents: OfflineCameraIncident[] = [];
      if (sessions.length > 0) {
        sessions.forEach((sess, idx) => {
          const offlineTime = formatExactTimestamp(sess.discTimeMs);
          let onlineTime = "";
          let duration = "";
          let incStatus: "RECOVERED" | "STILL OFFLINE" = "RECOVERED";
          let onlineTimestampMs: number | null = null;

          if (sess.recTimeMs) {
            onlineTimestampMs = sess.recTimeMs;
            onlineTime = `BACK ONLINE: ${formatExactTimestamp(sess.recTimeMs)}`;
            const diffMs = Math.max(0, sess.recTimeMs - sess.discTimeMs);
            duration = formatDuration(diffMs);
            incStatus = "RECOVERED";
          } else {
            const isLatest = idx === sessions.length - 1;
            if (isLatest && !isOnline) {
              onlineTime = "OFFLINE UNTIL NOW";
              const diffMs = Math.max(0, Date.now() - sess.discTimeMs);
              duration = `${formatDuration(diffMs)} (Until now)`;
              incStatus = "STILL OFFLINE";
            } else {
              onlineTime = "YES — BACK ONLINE (CURRENT)";
              duration = "TEMPORARY (RECOVERED)";
              incStatus = "RECOVERED";
            }
          }

          const eventReason = String(
            sess.discEvent.actionData?.caption ||
            sess.discEvent.caption ||
            sess.discEvent.actionData?.description ||
            sess.discEvent.description ||
            sess.discEvent.eventData?.type ||
            sess.discEvent.eventType ||
            "Camera Disconnected"
          );

          incidents.push({
            incidentNumber: idx + 1,
            offlineTime,
            offlineTimestampMs: sess.discTimeMs,
            onlineTime,
            onlineTimestampMs,
            duration,
            status: incStatus,
            reason: eventReason,
          });
        });
      } else if (!isOnline) {
        // Fallback for camera that is currently offline with no disconnect events in current window
        const resolved = getOfflineExactTime(cam);
        const durationMs = resolved.timestampMs ? Math.max(0, Date.now() - resolved.timestampMs) : 0;
        incidents.push({
          incidentNumber: 1,
          offlineTime: resolved.exactTime,
          offlineTimestampMs: resolved.timestampMs,
          onlineTime: "OFFLINE UNTIL NOW",
          onlineTimestampMs: null,
          duration: durationMs > 0 ? `${formatDuration(durationMs)} (Until now)` : "Offline until now",
          status: "STILL OFFLINE",
          reason: "Current Offline State",
        });
      }

      const incidentCount = incidents.length;

      let firstOffline = "ONLINE — NO OFFLINE EVENTS RECORDED";
      let lastOffline = "ONLINE — NO OFFLINE EVENTS RECORDED";
      let offlineDuration = "0s (100% Uptime)";
      let availabilityRate = "100% ONLINE";

      if (incidentCount > 0) {
        // Latest incident represents the most recent state
        const latestInc = incidents[incidents.length - 1];
        firstOffline = latestInc.offlineTime;
        lastOffline = latestInc.onlineTime;

        let totalDowntimeMs = 0;
        let hasUnrecovered = false;
        incidents.forEach((inc) => {
          if (inc.offlineTimestampMs && inc.onlineTimestampMs) {
            totalDowntimeMs += Math.max(0, inc.onlineTimestampMs - inc.offlineTimestampMs);
          } else if (inc.offlineTimestampMs && inc.status === "STILL OFFLINE") {
            totalDowntimeMs += Math.max(0, Date.now() - inc.offlineTimestampMs);
            hasUnrecovered = true;
          }
        });

        if (hasUnrecovered || !isOnline) {
          availabilityRate = "OFFLINE UNTIL NOW";
          offlineDuration = `${formatDuration(totalDowntimeMs)} (Until now)`;
        } else {
          availabilityRate = "ONLINE (RECOVERED)";
          offlineDuration = totalDowntimeMs > 0 ? formatDuration(totalDowntimeMs) : latestInc.duration;
        }
      }

      const serverName = (cam._systemName || cam.serverName || "SERVER 01").toUpperCase();

      return {
        serverName,
        cameraName: cam.name || `CAMERA_${cam.id?.slice(0, 6) || "UNK"}`,
        cameraId: cam.id || "DATA NOT AVAILABLE FROM SOURCE",
        status: isOnline ? "ONLINE" : "OFFLINE",
        firstOffline,
        lastOffline,
        offlineDuration,
        incidentCount,
        availabilityRate,
        incidents,
      };
    });
  }, [cameras, eventList, dateFrom]);

  // Filtered Offline Cameras for display
  const displayedOfflineCameras = useMemo(() => {
    if (offlineSummaryFilter === "all") return offlineCamerasSummary;
    return offlineCamerasSummary.filter(
      (c) => c.status === "OFFLINE" || c.incidentCount > 0
    );
  }, [offlineCamerasSummary, offlineSummaryFilter]);

  // Aggregate Total Offline Incidents Count
  const totalOfflineIncidents = useMemo(() => {
    return offlineCamerasSummary.reduce((acc, curr) => acc + curr.incidentCount, 0);
  }, [offlineCamerasSummary]);

  // ============================================
  // COMPREHENSIVE ALARM EVENT SUMMARY & PERIOD UPTIME RATE
  // ============================================
  const alarmEventMetrics = useMemo(() => {
    const totalAlarms = targetAlarmEvents.length;
    let criticalAlarms = 0;
    let warningAlarms = 0;
    let infoAlarms = 0;

    let disconnectAlarms = 0;
    let reconnectAlarms = 0;
    let serverAlarms = 0;
    let storageAlarms = 0;
    let networkAlarms = 0;

    targetAlarmEvents.forEach((a: any) => {
      const sev = (a.severity || "INFO").toUpperCase();
      if (sev === "CRITICAL") criticalAlarms++;
      else if (sev === "WARNING") warningAlarms++;
      else infoAlarms++;

      const type = String(a.eventType || "").toLowerCase();
      const label = String(a.eventLabel || "").toLowerCase();
      const cap = String(a.caption || "").toLowerCase();
      const desc = String(a.description || "").toLowerCase();

      if (
        type.includes("disconnect") ||
        cap.includes("disconnect") ||
        desc.includes("lost connection") ||
        desc.includes("is now offline") ||
        desc.includes("disconnected")
      ) {
        disconnectAlarms++;
      } else if (
        type.includes("reconnect") ||
        type.includes("cameraconnected") ||
        type.includes("deviceconnected") ||
        cap.includes("back online") ||
        cap.includes("camera online") ||
        cap.includes("reconnect") ||
        desc.includes("reconnected") ||
        desc.includes("back online") ||
        desc.includes("connection restored")
      ) {
        reconnectAlarms++;
      }

      if (type.includes("server") || label.includes("server") || desc.includes("server failure")) {
        serverAlarms++;
      }
      if (type.includes("storage") || label.includes("storage") || desc.includes("storage") || desc.includes("disk")) {
        storageAlarms++;
      }
      if (type.includes("network") || label.includes("network") || desc.includes("network")) {
        networkAlarms++;
      }
    });

    let resolvedIncidents = 0;
    let activeIncidents = 0;
    let totalDowntimeMs = 0;

    offlineCamerasSummary.forEach((cam) => {
      (cam.incidents || []).forEach((inc) => {
        if (inc.status === "RECOVERED") {
          resolvedIncidents++;
          if (inc.offlineTimestampMs && inc.onlineTimestampMs) {
            totalDowntimeMs += Math.max(0, inc.onlineTimestampMs - inc.offlineTimestampMs);
          }
        } else {
          activeIncidents++;
          if (inc.offlineTimestampMs) {
            totalDowntimeMs += Math.max(0, Date.now() - inc.offlineTimestampMs);
          }
        }
      });
    });

    const effectiveToTime = Math.min(toTime === Infinity ? Date.now() : toTime, Date.now());
    const effectiveFromTime = Math.min(fromTime || effectiveToTime, effectiveToTime);
    const periodDurationMs = Math.max(1000 * 60 * 60, effectiveToTime - effectiveFromTime);

    const avgDowntimeMs = totalCameras > 0 ? totalDowntimeMs / totalCameras : totalDowntimeMs;
    const computedUptime = periodDurationMs > 0
      ? Math.max(0, Math.min(100, ((periodDurationMs - avgDowntimeMs) / periodDurationMs) * 100))
      : 100;
    const periodCameraUptimeRate = Number(computedUptime.toFixed(1));

    const criticalPct = totalAlarms > 0 ? `${Math.round((criticalAlarms / totalAlarms) * 100)}%` : "0%";
    const warningPct = totalAlarms > 0 ? `${Math.round((warningAlarms / totalAlarms) * 100)}%` : "0%";
    const infoPct = totalAlarms > 0 ? `${Math.round((infoAlarms / totalAlarms) * 100)}%` : "0%";

    const totalOfflineIncidentsCount = resolvedIncidents + activeIncidents;

    const auditVerdict = `During the ${period.toUpperCase()} period (${dateFrom} to ${dateTo}), ${totalAlarms} total alarm event(s) were recorded for ${selectedServerLabel}. ${criticalAlarms} critical event(s) (${criticalPct}) and ${warningAlarms} warning(s) (${warningPct}) were logged. A total of ${totalOfflineIncidentsCount} camera disconnection incident(s) occurred: ${resolvedIncidents} successfully restored upon reconnection, and ${activeIncidents} active outage(s). Overall camera uptime index calculated from alarm logs is ${periodCameraUptimeRate}% with ${formatDuration(totalDowntimeMs)} total recorded downtime.`;

    return {
      totalAlarms,
      criticalAlarms,
      criticalPct,
      warningAlarms,
      warningPct,
      infoAlarms,
      infoPct,
      disconnectAlarms,
      reconnectAlarms,
      serverAlarms,
      storageAlarms,
      networkAlarms,
      resolvedIncidents,
      activeIncidents,
      totalOfflineIncidents: totalOfflineIncidentsCount,
      totalDowntimeMs,
      totalDowntimeFormatted: formatDuration(totalDowntimeMs),
      periodCameraUptimeRate,
      auditVerdict,
    };
  }, [targetAlarmEvents, offlineCamerasSummary, totalCameras, fromTime, toTime, period, dateFrom, dateTo, selectedServerLabel]);

  // Period Camera Uptime Rate (calculated from historical alarm events)
  const cameraOnlineRate = alarmEventMetrics.periodCameraUptimeRate;

  // Storage Stats per Server
  const serverStorageStats = useMemo(() => {
    if (!servers || servers.length === 0) return [];
    return servers.map((srv: any) => {
      const diskList: any[] = srv.hddList || srv.storages || [];
      const totalMb = diskList.reduce((sum: number, d: any) => sum + (d.totalSpaceMb || d.totalSpace || 0), 0);
      const usedMb = diskList.reduce((sum: number, d: any) => sum + (d.reservedSpaceMb || d.usedSpace || 0), 0);
      const freeMb = totalMb - usedMb;
      const usedPct = totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0;

      const rawCpu = srv.cpuUsagePercent ?? srv.cpuUsage ?? srv.cpu;
      const cpuText = typeof rawCpu === "number" && rawCpu >= 0 ? `${Math.round(rawCpu)}%` : "N/A — DATA NOT AVAILABLE FROM CONFIGURED SOURCE";

      const rawRamUsed = srv.ramUsageMb ?? srv.ramUsedMb;
      const rawRamTotal = srv.totalRamMb ?? srv.ramTotalMb;
      const ramText =
        typeof rawRamUsed === "number" && typeof rawRamTotal === "number" && rawRamTotal > 0
          ? `${(rawRamUsed / 1024).toFixed(1)} GB / ${(rawRamTotal / 1024).toFixed(1)} GB`
          : "N/A — DATA NOT AVAILABLE FROM CONFIGURED SOURCE";

      return {
        name: (srv._systemName || srv.name || "SERVER").toUpperCase(),
        isOnline: ["online", "Online"].includes(String(srv.status ?? srv.stateOfHealth ?? "")),
        totalGb: totalMb > 0 ? (totalMb / 1024).toFixed(1) : "STORAGE DATA NOT AVAILABLE FROM SOURCE",
        usedGb: usedMb > 0 ? (usedMb / 1024).toFixed(1) : "STORAGE DATA NOT AVAILABLE FROM SOURCE",
        freeGb: freeMb > 0 ? (freeMb / 1024).toFixed(1) : "STORAGE DATA NOT AVAILABLE FROM SOURCE",
        usedPct,
        diskCount: diskList.length > 0 ? String(diskList.length) : "1 DISK",
        cpuText,
        ramText,
        version: srv.version || srv.softwareVersion || "DATA NOT AVAILABLE FROM SOURCE",
        osName: srv.osName || srv.osInfo?.name || "DATA NOT AVAILABLE FROM SOURCE",
      };
    });
  }, [servers]);

  // Trend Chart Data
  const trendData = useMemo(() => {
    const liveCam = onlineCameras;
    const liveAlarms = totalAlarms;
    const liveHealth = serverOnlineRate;

    if (period === "daily") {
      return Array.from({ length: 8 }, (_, i) => ({
        label: `${i * 3}:00`,
        cameras: liveCam,
        alarms: Math.round(liveAlarms / 8),
        healthScore: liveHealth || 100,
      }));
    } else if (period === "weekly") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return {
          label: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
          cameras: liveCam,
          alarms: Math.round(liveAlarms / 7),
          healthScore: liveHealth || 100,
        };
      });
    } else if (period === "yearly") {
      return ["Q1", "Q2", "Q3", "Q4"].map((q) => ({
        label: q,
        cameras: liveCam,
        alarms: Math.round(liveAlarms / 4),
        healthScore: liveHealth || 100,
      }));
    } else {
      return ["WEEK 1", "WEEK 2", "WEEK 3", "WEEK 4"].map((w) => ({
        label: w,
        cameras: liveCam,
        alarms: Math.round(liveAlarms / 4),
        healthScore: liveHealth || 100,
      }));
    }
  }, [period, onlineCameras, totalAlarms, serverOnlineRate]);

  // S3 Cloud Bridge — No live S3 API endpoint exists in this deployment.
  const s3PerformanceData: S3LogItem[] = useMemo(() => {
    return [];
  }, []);

  // ============================================
  // EXPORT HANDLERS (WORD & PDF)
  // ============================================
  const prepareFullReportData = useCallback((): FullReportData => {
    const d = new Date();
    const dateStr = d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    const now = `${dateStr} AT ${timeStr}`.toUpperCase();

    const formattedCameras: CameraReportItem[] = cameras.map((cam: any) => {
      const isCamOnline = ["online", "Online", "recording", "Recording"].includes(String(cam.status));
      const offlineInfo = !isCamOnline ? getOfflineExactTime(cam, eventList) : null;
      return {
        id: cam.id || "DATA NOT AVAILABLE FROM SOURCE",
        name: cam.name || "UNNAMED CAMERA",
        serverName: (cam._systemName || cam.serverName || "SERVER 01").toUpperCase(),
        status: isCamOnline ? "ONLINE" : "OFFLINE",
        ipAddress: cam.ipAddr || cam.ip || cam.url || "DATA NOT AVAILABLE FROM SOURCE",
        vendorModel: [cam.vendor, cam.model].filter(Boolean).join(" / ") || cam.type || "NX CAMERA",
        resolutionFps: cam.resolution ? `${cam.resolution}${cam.fps ? ` @ ${cam.fps}FPS` : ""}` : "DATA NOT AVAILABLE FROM SOURCE",
        uptimeRate: isCamOnline ? "ONLINE (LIVE)" : `OFFLINE (Since: ${offlineInfo?.exactTime || "RECENT"})`,
        exactOfflineTime: offlineInfo?.exactTime || "",
      };
    });

    const formattedServers: ServerHealthItem[] = serverStorageStats.map((srv) => ({
      serverName: srv.name,
      status: srv.isOnline ? "ONLINE" : "OFFLINE",
      version: srv.version,
      osName: srv.osName,
      cpuUsage: srv.cpuText,
      ramUsage: srv.ramText,
      diskCount: srv.diskCount,
      storageUsage: srv.totalGb !== "STORAGE DATA NOT AVAILABLE FROM SOURCE" ? `${srv.usedGb} GB / ${srv.totalGb} GB (${srv.usedPct}%)` : "STORAGE DATA NOT AVAILABLE FROM SOURCE",
    }));

    const formattedAlarms: AlarmReportItem[] = targetAlarmEvents.map((a: any) => ({
      id: String(a.id || "EVENT"),
      source: a.systemName ? `${a.sourceName} (${a.systemName})` : a.sourceName,
      severity: a.severity || "INFO",
      timestamp: a.formattedTime || "DATA NOT AVAILABLE FROM SOURCE",
      description: a.description || "NO DESCRIPTION AVAILABLE",
      eventType: a.eventType,
      eventLabel: a.eventLabel,
      systemName: a.systemName,
    }));

    return {
      companyName: COMPANY_NAME,
      dashboardTitle: DASHBOARD_TITLE,
      generatedAt: now,
      periodType: period,
      periodLabel,
      dateFrom,
      dateTo,
      selectedServerLabel,
      totalCameras,
      onlineCameras,
      offlineCamerasCount,
      cameraOnlineRate,
      totalServers,
      onlineServers,
      offlineServers: totalServers - onlineServers,
      serverOnlineRate,
      totalAlarms,
      criticalAlarms,
      warningAlarms,
      totalOfflineIncidents,
      offlineSummaryTitle,
      cameras: formattedCameras,
      offlineCameras: offlineSummaryFilter === "all"
        ? offlineCamerasSummary
        : offlineCamerasSummary.filter((c) => c.status === "OFFLINE" || c.incidentCount > 0),
      servers: formattedServers,
      serverDisks: formattedServerDisks,
      alarms: formattedAlarms,
      s3Logs: s3PerformanceData,
    };
  }, [
    cameras,
    serverStorageStats,
    formattedServerDisks,
    targetAlarmEvents,
    offlineCamerasSummary,
    s3PerformanceData,
    period,
    periodLabel,
    dateFrom,
    dateTo,
    selectedServerLabel,
    totalCameras,
    onlineCameras,
    offlineCamerasCount,
    cameraOnlineRate,
    totalServers,
    onlineServers,
    serverOnlineRate,
    totalAlarms,
    criticalAlarms,
    warningAlarms,
    totalOfflineIncidents,
    offlineSummaryTitle,
  ]);

  const handleExportWord = () => {
    setIsExportingWord(true);
    try {
      const data = prepareFullReportData();
      exportToWord(data);
    } catch (err) {
      console.error("[ReportingManagement] Word export error:", err);
    } finally {
      setTimeout(() => setIsExportingWord(false), 1000);
    }
  };

  const handleExportPdf = () => {
    setIsExportingPdf(true);
    try {
      const data = prepareFullReportData();
      exportToPdf(data);
    } catch (err) {
      console.error("[ReportingManagement] PDF export error:", err);
    } finally {
      setTimeout(() => setIsExportingPdf(false), 1000);
    }
  };

  const isLoading = loadingData || loadingCloud || loadingAlarms || loadingEvents;

  // ============================================
  // RENDER UI (STANDARD 12PX PROFESSIONAL ENGLISH)
  // ============================================
  return (
    <div className="space-y-5 select-none pb-12 print:p-0 print:space-y-4 text-[12px] font-sans">
      {/* ============================================ */}
      {/* HEADER BRANDING & MAIN CONTROL BAR           */}
      {/* ============================================ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center">
            <img src={ORIX_LOGO_BASE64_PNG} alt={COMPANY_NAME} className="h-10 w-auto object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight uppercase">
                {DASHBOARD_TITLE}
              </h1>
              <Badge className="bg-blue-600/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span>EXECUTIVE REPORTING</span>
              </Badge>
            </div>
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wide">
              {COMPANY_NAME} &bull; CENTRALIZED SYSTEM AUDIT &amp; ANALYTICS DASHBOARD
            </p>
          </div>
        </div>

        {/* Action Controls & Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-9 px-3 gap-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 rounded-xl"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-blue-500", isLoading && "animate-spin")} />
            <span className="text-[12px] font-bold uppercase">REFRESH REPORT DATA</span>
          </Button>

          {/* Export to Word Button */}
          <Button
            size="sm"
            onClick={handleExportWord}
            disabled={isExportingWord || isLoading}
            className="h-9 px-3.5 gap-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-bold rounded-xl shadow-sm uppercase tracking-wider"
          >
            {isExportingWord ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCode className="w-3.5 h-3.5" />
            )}
            <span>{isExportingWord ? "GENERATING WORD..." : "EXPORT TO WORD"}</span>
          </Button>

          {/* Export to PDF Button */}
          <Button
            size="sm"
            onClick={handleExportPdf}
            disabled={isExportingPdf || isLoading}
            className="h-9 px-3.5 gap-2 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-sm uppercase tracking-wider"
          >
            {isExportingPdf ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>{isExportingPdf ? "GENERATING PDF..." : "EXPORT TO PDF"}</span>
          </Button>
        </div>
      </div>

      {/* ============================================ */}
      {/* FILTER CONTROL PANEL                          */}
      {/* ============================================ */}
      <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm print:hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Period Switcher Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300 px-2.5 flex items-center gap-1.5 uppercase">
                <Calendar className="w-3.5 h-3.5 text-blue-500" /> REPORTING PERIOD:
              </span>
              {(["daily", "weekly", "monthly", "yearly", "custom"] as ReportPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={cn(
                    "px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all uppercase tracking-wider",
                    period === p
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Centralized Server Filter Dropdown */}
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300 uppercase">SERVER:</span>
              <Select value={selectedSystemId} onValueChange={setSelectedSystemId}>
                <SelectTrigger className="w-full sm:w-[240px] h-9 text-[12px] font-bold rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 uppercase">
                  <Server className="h-3.5 w-3.5 mr-2 text-blue-500 shrink-0" />
                  <SelectValue placeholder="SELECT SERVER..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                  <SelectItem value="all" className="text-[12px] font-bold uppercase text-blue-600 dark:text-blue-400">
                    ALL (CENTRALIZED REPORTING)
                  </SelectItem>
                  {hasLocalServer && (
                    <SelectItem value="local" className="text-[12px] font-semibold uppercase">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>LOCAL SERVER</span>
                      </div>
                    </SelectItem>
                  )}
                  {cloudSystems.map((sys) => (
                    <SelectItem key={sys.id} value={sys.id} className="text-[12px] font-semibold uppercase">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", sys.isOnline ? "bg-emerald-500" : "bg-slate-400")} />
                        <span>{sys.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[12px]">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
              <Info className="w-4 h-4 shrink-0" />
              <span className="uppercase">
                ACTIVE FILTER: <strong>{selectedServerLabel}</strong> &bull; PERIOD: <strong>{period.toUpperCase()} ({dateFrom} TO {dateTo})</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600 dark:text-slate-400 uppercase">DATE FILTER:</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 font-bold uppercase">FROM:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPeriod("custom");
                  }}
                  className="bg-transparent font-mono text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-[12px]"
                />
              </div>
              <span className="text-slate-400 font-bold">-</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 font-bold uppercase">TO:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPeriod("custom");
                  }}
                  className="bg-transparent font-mono text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-[12px]"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error / Warning Alert Box */}
      {fetchError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{fetchError} - SHOWING AVAILABLE CACHED RECORDS.</span>
          </div>
          <Button size="sm" variant="ghost" onClick={handleRefresh} className="h-7 text-[11px] font-bold uppercase">RETRY</Button>
        </div>
      )}

      {/* ============================================ */}
      {/* SUMMARY STAT CARDS (STANDARD 12PX UPPERCASE)  */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Camera Uptime Rate */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-500" /> CAMERA UPTIME RATE
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{cameraOnlineRate}%</span>
                <Badge className={cn(
                  "text-[10px] font-bold uppercase",
                  cameraOnlineRate >= 98
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    : cameraOnlineRate >= 90
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                )}>
                  {cameraOnlineRate >= 98 ? "OPTIMAL" : cameraOnlineRate >= 90 ? "ACCEPTABLE" : "ATTENTION"}
                </Badge>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase">
                {alarmEventMetrics.totalDowntimeFormatted} DOWNTIME &bull; {alarmEventMetrics.totalOfflineIncidents} INCIDENTS ({onlineCameras}/{totalCameras} ONLINE NOW)
              </p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-600">
              <Camera className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Storage Servers */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-500" /> STORAGE SERVERS
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{totalServers}</span>
                <span className="text-[11px] font-bold text-indigo-500 uppercase">SERVERS REGISTERED</span>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase">
                {onlineServers} SERVERS ACTIVE &amp; ONLINE
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-600">
              <Database className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Server Health Index */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-500" /> SERVER HEALTH INDEX
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{serverOnlineRate}%</span>
                <span className="text-[11px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {onlineServers}/{totalServers} ONLINE
                </span>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase">
                {alarmEventMetrics.serverAlarms > 0
                  ? `${alarmEventMetrics.serverAlarms} SERVER ALERTS LOGGED`
                  : "HOST HARDWARE HEALTH OPERATIONAL"}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600">
              <Server className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Alarm Events & Incidents */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-600" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> ALARM EVENTS
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{alarmEventMetrics.totalAlarms}</span>
                {alarmEventMetrics.criticalAlarms > 0 ? (
                  <Badge className="text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 uppercase">
                    {alarmEventMetrics.criticalAlarms} CRITICAL
                  </Badge>
                ) : alarmEventMetrics.warningAlarms > 0 ? (
                  <Badge className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                    {alarmEventMetrics.warningAlarms} WARNINGS
                  </Badge>
                ) : (
                  <Badge className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">
                    SYSTEM NORMAL
                  </Badge>
                )}
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase">
                {alarmEventMetrics.criticalAlarms} CRIT &bull; {alarmEventMetrics.warningAlarms} WARN &bull; {alarmEventMetrics.infoAlarms} INFO
              </p>
              <p className="text-[10px] font-medium text-slate-400 uppercase">
                {alarmEventMetrics.totalOfflineIncidents} DROPS ({alarmEventMetrics.resolvedIncidents} RESOLVED &bull; {alarmEventMetrics.activeIncidents} ACTIVE)
              </p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================ */}
      {/* ALARM EVENTS EXECUTIVE SUMMARY BANNER        */}
      {/* ============================================ */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  ALARM EVENTS &amp; AVAILABILITY EXECUTIVE SUMMARY
                </h3>
                <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] font-bold uppercase">
                  {period.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Derived directly from {alarmEventMetrics.totalAlarms} alarm events recorded for {selectedServerLabel} ({dateFrom} to {dateTo})
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-bold border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              TOTAL: {alarmEventMetrics.totalAlarms}
            </Badge>
            <Badge className="text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
              {alarmEventMetrics.criticalAlarms} CRITICAL ({alarmEventMetrics.criticalPct})
            </Badge>
            <Badge className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              {alarmEventMetrics.warningAlarms} WARNINGS ({alarmEventMetrics.warningPct})
            </Badge>
            <Badge className="text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
              {alarmEventMetrics.infoAlarms} INFO ({alarmEventMetrics.infoPct})
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExecutiveAlarmSummary((prev) => !prev)}
              className="h-7 px-2 text-[11px] font-bold uppercase text-slate-500 hover:text-slate-900 dark:hover:text-white gap-1"
            >
              <span>{showExecutiveAlarmSummary ? "COLLAPSE" : "EXPAND"}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showExecutiveAlarmSummary ? "rotate-180" : "rotate-0")} />
            </Button>
          </div>
        </div>

        {showExecutiveAlarmSummary && (
          <>
            {/* 4 Mini Insight Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  CAMERA CONNECTIVITY
                </span>
                <div className="font-bold text-slate-900 dark:text-white">
                  {alarmEventMetrics.disconnectAlarms} Drops &bull; {alarmEventMetrics.reconnectAlarms} Reconnects
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {alarmEventMetrics.resolvedIncidents} Resolved Sessions
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  OUTAGE &amp; RESOLUTION
                </span>
                <div className={cn("font-bold", alarmEventMetrics.activeIncidents === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                  {alarmEventMetrics.activeIncidents === 0 ? "100% RESOLVED" : `${alarmEventMetrics.activeIncidents} ACTIVE ISSUE(S)`}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {alarmEventMetrics.totalDowntimeFormatted} Total Outage Time
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  EFFECTIVE UPTIME RATE
                </span>
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  {cameraOnlineRate}% Period Uptime
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Derived from historical alarm events
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  SYSTEM &amp; STORAGE HEALTH
                </span>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">
                  {alarmEventMetrics.serverAlarms === 0 && alarmEventMetrics.storageAlarms === 0
                    ? "100% HARDWARE STABLE"
                    : `${alarmEventMetrics.serverAlarms + alarmEventMetrics.storageAlarms} System Alerts`}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Host hardware operational
                </span>
              </div>
            </div>

            {/* Audit Statement */}
            <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/50 leading-relaxed">
              <strong className="text-slate-900 dark:text-white uppercase font-bold">AUDIT VERDICT: </strong>
              {alarmEventMetrics.auditVerdict}
            </div>
          </>
        )}
      </div>

      {/* ============================================ */}
      {/* REPORT SECTIONS TABS                         */}
      {/* ============================================ */}
      <Tabs defaultValue="overview" className="w-full space-y-4">
        <TabsList className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-1 rounded-xl print:hidden flex-wrap text-[12px] font-bold">
          <TabsTrigger value="overview" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <BarChart3 className="w-3.5 h-3.5" /> PERFORMANCE TREND
          </TabsTrigger>
          <TabsTrigger value="s3bridge" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
            <Cloud className="w-3.5 h-3.5 text-cyan-400" /> S3 CLOUD BRIDGE
          </TabsTrigger>
          <TabsTrigger value="cameras" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Camera className="w-3.5 h-3.5" /> CAMERA REPORT
          </TabsTrigger>
          <TabsTrigger value="offline" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-rose-600 data-[state=active]:text-white">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> {offlineSummaryTitle}
          </TabsTrigger>
          <TabsTrigger value="recordings" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Video className="w-3.5 h-3.5" /> RECORDING &amp; STORAGE
          </TabsTrigger>
          <TabsTrigger value="alarms" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <AlertTriangle className="w-3.5 h-3.5" /> ALARM EVENTS REPORT
          </TabsTrigger>
          <TabsTrigger value="health" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Activity className="w-3.5 h-3.5" /> SYSTEM HEALTH REPORT
          </TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* TAB 1: EXECUTIVE PERFORMANCE OVERVIEW        */}
        {/* ============================================ */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Visual Trend Breakdown */}
            <Card className="lg:col-span-2 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      PERFORMANCE TREND ANALYSIS ({period.toUpperCase()})
                    </CardTitle>
                    <CardDescription className="text-[11px] font-semibold text-slate-500 uppercase">
                      ONLINE CAMERA RATIO VS ALARM FREQUENCY FOR {selectedServerLabel}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-mono border-slate-300 dark:border-slate-700">
                    {dateFrom} TO {dateTo}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-5">
                  {trendData.map((item, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px] font-bold text-slate-700 dark:text-slate-300">
                        <span>{item.label}</span>
                        <div className="flex items-center gap-4 text-[11px] font-mono">
                          <span className="text-blue-500 font-bold">{item.cameras} ONLINE CAMERAS</span>
                          <span className="text-amber-500 font-bold">{item.alarms} ALARMS</span>
                          <span className="text-emerald-500 font-bold">{item.healthScore}% HEALTH</span>
                        </div>
                      </div>
                      <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${Math.min(100, (item.cameras / Math.max(totalCameras, 1)) * 100)}%` }}
                          className="bg-gradient-to-r from-blue-600 to-cyan-500 h-full"
                        />
                        <div
                          style={{ width: `${Math.min(30, (item.alarms / Math.max(totalAlarms, 1)) * 30)}%` }}
                          className="bg-amber-500 h-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-[12px] font-bold text-slate-500 uppercase mt-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" /> ONLINE CAMERA RATIO
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" /> ALARM INCIDENTS
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Integrity Summary */}
            <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  SYSTEM INTEGRITY SUMMARY
                </CardTitle>
                <CardDescription className="text-[11px] font-semibold text-slate-500 uppercase">
                  REAL-TIME OPERATIONAL AUDIT
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 space-y-3 text-[12px]">
                <div className={cn(
                  "p-3 rounded-xl border space-y-1",
                  cameraOnlineRate >= 90
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-rose-500/10 border-rose-500/20"
                )}>
                  <div className="flex items-center justify-between font-bold uppercase">
                    <span>CAMERA UPTIME RATE</span>
                    <span>{cameraOnlineRate}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 uppercase">
                    {onlineCameras}/{totalCameras} ACTIVE UNITS NOW &bull; {alarmEventMetrics.totalDowntimeFormatted} DOWNTIME IN PERIOD
                  </p>
                </div>

                <div className="space-y-2.5 pt-1 uppercase">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-500">DISCONNECTED CAMERAS:</span>
                    <span className={cn("font-bold", offlineCamerasCount > 0 ? "text-rose-500" : "text-emerald-500")}>
                      {offlineCamerasCount} UNITS
                    </span>
                  </div>

                  {offlineCamerasCount > 0 && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1.5 mt-2">
                      <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>DISCONNECTED CAMERAS (EXACT TIME DOWN):</span>
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {cameras
                          .filter((c: any) => !["online", "Online", "recording", "Recording"].includes(String(c.status)))
                          .map((cam: any, i: number) => {
                            const exactTime = getOfflineExactTime(cam, eventList).exactTime;
                            return (
                              <div key={i} className="flex items-center justify-between text-[11px] font-mono bg-white/60 dark:bg-slate-800/80 px-2 py-1 rounded border border-rose-500/10">
                                <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                                  {cam.name || `Camera ${i + 1}`}
                                </span>
                                <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px]">{exactTime}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-500">SERVERS ONLINE:</span>
                    <span className="font-bold text-emerald-500">{onlineServers} / {totalServers}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-500">CRITICAL ALARMS:</span>
                    <span className={cn("font-bold", criticalAlarms > 0 ? "text-rose-500" : "text-emerald-500")}>
                      {criticalAlarms} INCIDENTS
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-500">WARNING ALERTS:</span>
                    <span className={cn("font-bold", warningAlarms > 0 ? "text-amber-500" : "text-emerald-500")}>
                      {warningAlarms} ALERTS
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-500">OFFLINE INCIDENTS RECORDED:</span>
                    <span className="font-bold text-rose-500">{totalOfflineIncidents} INCIDENTS</span>
                  </div>
                </div>

                <Separator className="dark:bg-slate-800" />

                <div className="text-[11px] text-slate-400 flex items-center gap-2 font-semibold uppercase">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>SYNCHRONIZED CENTRALIZED DATA FOR {COMPANY_NAME}.</span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Alarm Incidents Summary in Overview */}
            <Card className="lg:col-span-3 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    RECENT ALARM INCIDENTS &amp; SECURITY EVENTS ({period.toUpperCase()})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px] font-mono border-slate-300 dark:border-slate-700">
                      TOTAL: {totalAlarms}
                    </Badge>
                    <Badge className="text-[11px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                      {criticalAlarms} CRITICAL
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-[11px] font-semibold text-slate-500 uppercase">
                  LATEST RECORDED SYSTEM ALARMS ACROSS ALL MONITORED HARDWARE
                </CardDescription>
              </CardHeader>
              <CardContent>
                {targetAlarmEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2 font-bold uppercase text-xs">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    <span>NO ALARM INCIDENTS LOGGED IN THIS PERIOD</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">EVENT</th>
                          <th className="p-2.5">SOURCE / DEVICE</th>
                          <th className="p-2.5">SYSTEM</th>
                          <th className="p-2.5">SEVERITY</th>
                          <th className="p-2.5">TIME</th>
                          <th className="p-2.5">DESCRIPTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                        {targetAlarmEvents.slice(0, 5).map((a: any, i: number) => {
                          const isCrit = a.severity === "CRITICAL";
                          const isWarn = a.severity === "WARNING";
                          return (
                            <tr key={a.id ? `ov-${a.id}` : `ov-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="p-2.5 text-slate-400 font-mono">{i + 1}</td>
                              <td className="p-2.5 font-bold uppercase text-slate-900 dark:text-white">
                                {a.eventLabel || a.eventType}
                              </td>
                              <td className="p-2.5 font-bold uppercase text-blue-600 dark:text-blue-400">
                                {a.sourceName}
                              </td>
                              <td className="p-2.5 text-[11px] text-slate-500 uppercase">
                                {a.systemName}
                              </td>
                              <td className="p-2.5">
                                <Badge
                                  className={cn(
                                    "text-[10px] font-bold uppercase",
                                    isCrit
                                      ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                      : isWarn
                                      ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                      : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                  )}
                                >
                                  {a.severity}
                                </Badge>
                              </td>
                              <td className="p-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {a.formattedTime}
                              </td>
                              <td className="p-2.5 text-slate-600 dark:text-slate-300 max-w-md truncate">
                                {a.description}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 2: S3 CLOUD BRIDGE ANALYTICS             */}
        {/* ============================================ */}
        <TabsContent value="s3bridge" className="space-y-4">
          <div className="bg-slate-950 text-white rounded-2xl p-4 border border-slate-800 shadow-xl space-y-4 text-[12px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-white uppercase flex items-center gap-2">
                    S3 CLOUD BRIDGE STORAGE DASHBOARD &bull; {selectedServerLabel}
                  </h2>
                  <p className="text-[11px] text-slate-400 uppercase">
                    S3 CLOUD BRIDGE STATUS — NO ACTIVE S3 DATA SOURCE CONFIGURED
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
                  {(["1h", "24h", "7d"] as ("1h" | "24h" | "7d")[]).map((tr) => (
                    <button
                      key={tr}
                      onClick={() => setS3TimeRange(tr)}
                      className={cn(
                        "px-3 py-1 text-[11px] font-bold rounded-lg transition-all uppercase",
                        s3TimeRange === tr
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      {tr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* S3 Status Note — No live API */}
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
              <Cloud className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-bold text-slate-300 uppercase">S3 DATA NOT AVAILABLE — NO ACTIVE S3 DATA SOURCE CONFIGURED</p>
              <p className="text-[11px] text-slate-500 uppercase max-w-md">
                NO LIVE S3 API ENDPOINT IS CONFIGURED IN THIS DEPLOYMENT.
                S3 DATA NOT AVAILABLE FROM CONFIGURED SOURCE.
              </p>
            </div>
          </div>

          {/* S3 Log Table — No Live API */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                <span>S3 CLOUD BRIDGE — INTEGRATION STATUS</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <Cloud className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">
                  S3 DATA NOT AVAILABLE — NO ACTIVE S3 DATA SOURCE CONFIGURED
                </p>
                <p className="text-[11px] text-slate-400 uppercase max-w-lg leading-relaxed">
                  NO LIVE S3 API ENDPOINT IS CONFIGURED IN THIS DEPLOYMENT.
                  TO ENABLE S3 CLOUD BRIDGE REPORTING, AN ACTIVE S3 DATA SOURCE
                  MUST BE CONNECTED TO THIS DASHBOARD.
                </p>
                <div className="mt-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                  ⚠ S3 DATA NOT AVAILABLE — NO ACTIVE S3 DATA SOURCE CONFIGURED
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 3: DETAILED CAMERA REPORT                */}
        {/* ============================================ */}
        <TabsContent value="cameras" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-500" /> DETAILED CAMERA INVENTORY REPORT
                </span>
                <Badge variant="outline" className="text-[11px] font-bold uppercase">
                  TOTAL: {totalCameras} | ONLINE: {onlineCameras} | OFFLINE: {offlineCamerasCount}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>FETCHING CAMERA INVENTORY FROM {selectedServerLabel}...</span>
                </div>
              ) : cameras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <Camera className="w-8 h-8 text-slate-500" />
                  <span>DATA NOT AVAILABLE</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">CAMERA NAME</th>
                        <th className="p-3">SERVER</th>
                        <th className="p-3">STATUS</th>
                        <th className="p-3">OFFLINE EXACT TIME</th>
                        <th className="p-3">IP ADDRESS</th>
                        <th className="p-3">VENDOR / MODEL</th>
                        <th className="p-3">RESOLUTION / FPS</th>
                        <th className="p-3 text-right">UPTIME RATE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {cameras.map((cam: any, index: number) => {
                        const isCamOnline = ["online", "Online", "recording", "Recording"].includes(String(cam.status));
                        const offlineInfo = !isCamOnline ? getOfflineExactTime(cam, eventList) : null;
                        const serverName = (cam._systemName || cam.serverName || "SERVER 01").toUpperCase();
                        return (
                          <tr key={cam.id ? `cam-${cam.id}-${index}` : `cam-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 text-slate-400 font-mono">{index + 1}</td>
                            <td className="p-3 font-bold text-slate-900 dark:text-white uppercase">
                              {cam.name || `CAMERA_${index + 1}`}
                            </td>
                            <td className="p-3 font-bold text-slate-600 dark:text-slate-400 uppercase">
                              {serverName}
                            </td>
                            <td className="p-3">
                              <Badge className={cn("text-[10px] font-bold uppercase", isCamOnline ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20")}>
                                {isCamOnline ? "ONLINE" : "OFFLINE"}
                              </Badge>
                            </td>
                            <td className="p-3">
                              {isCamOnline ? (
                                <span className="text-slate-400 font-mono text-[11px]">—</span>
                              ) : (
                                <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                  <Clock className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                                  <span>{offlineInfo?.exactTime}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-500">{cam.ipAddr || cam.ip || cam.url || "DATA NOT AVAILABLE"}</td>
                            <td className="p-3 uppercase">{[cam.vendor, cam.model].filter(Boolean).join(" / ") || cam.type || "NX CAMERA"}</td>
                            <td className="p-3 font-mono">{cam.resolution ? `${cam.resolution}${cam.fps ? ` @ ${cam.fps}FPS` : ""}` : "DATA NOT AVAILABLE"}</td>
                            <td className="p-3 text-right font-bold">
                              {isCamOnline ? (
                                <span className="text-emerald-500">100% ONLINE</span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="text-rose-500">OFFLINE</span>
                                  <span className="text-[10px] font-mono font-normal text-rose-500">
                                    Since: {offlineInfo?.exactTime}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 4: OFFLINE CAMERA SUMMARY               */}
        {/* ============================================ */}
        <TabsContent value="offline" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500" /> {offlineSummaryTitle}
                  </CardTitle>
                  <CardDescription className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
                    AUDIT OF CAMERAS EXPERIENCING OFFLINE DISCONNECT EVENTS &amp; DOWNTIME DURATION
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setOfflineSummaryFilter("incidents")}
                      className={cn(
                        "px-2.5 py-1 rounded-md transition-all uppercase",
                        offlineSummaryFilter === "incidents"
                          ? "bg-rose-600 text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      Offline / Incidents ({offlineCamerasSummary.filter((c) => c.status === "OFFLINE" || c.incidentCount > 0).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfflineSummaryFilter("all")}
                      className={cn(
                        "px-2.5 py-1 rounded-md transition-all uppercase",
                        offlineSummaryFilter === "all"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      All Cameras ({offlineCamerasSummary.length})
                    </button>
                  </div>
                  <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[11px] font-bold uppercase">
                    {period.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                  <span>CALCULATING HISTORICAL CAMERA OFFLINE INCIDENTS...</span>
                </div>
              ) : displayedOfflineCameras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span>NO OFFLINE CAMERA INCIDENTS RECORDED IN THIS PERIOD</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">SERVER</th>
                        <th className="p-3">CAMERA NAME</th>
                        <th className="p-3">CAMERA ID</th>
                        <th className="p-3">CURRENT STATUS</th>
                        <th className="p-3">WHEN OFFLINE (EXACT TIME)</th>
                        <th className="p-3">HAS IT BEEN ONLINE</th>
                        <th className="p-3">OFFLINE DURATION</th>
                        <th className="p-3 text-center">OFFLINE INCIDENTS</th>
                        <th className="p-3 text-right">AVAILABILITY RATE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {displayedOfflineCameras.map((item, idx) => {
                        const isExpanded = !!expandedCameras[item.cameraId];
                        const hasIncidents = item.incidents && item.incidents.length > 0;
                        const hasMultiple = item.incidents && item.incidents.length > 1;

                        return (
                          <React.Fragment key={`offline-cam-${item.cameraId || "unk"}-${idx}`}>
                            <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="p-3 text-slate-400 font-mono">
                                <div className="flex items-center gap-1">
                                  {hasIncidents ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleCameraExpand(item.cameraId)}
                                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                      title={isExpanded ? "Collapse incident details" : "Expand incident details"}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-rose-500" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  ) : (
                                    <span className="w-3.5 h-3.5 inline-block" />
                                  )}
                                  <span>{idx + 1}</span>
                                </div>
                              </td>
                              <td className="p-3 font-bold text-slate-700 dark:text-slate-300 uppercase">{item.serverName}</td>
                              <td className="p-3 font-bold text-slate-900 dark:text-white uppercase">
                                <div className="flex items-center gap-2">
                                  <span>{item.cameraName}</span>
                                  {hasMultiple && (
                                    <button
                                      type="button"
                                      onClick={() => toggleCameraExpand(item.cameraId)}
                                      className="text-[10px] text-rose-500 hover:underline font-normal normal-case shrink-0"
                                    >
                                      ({item.incidentCount} incidents)
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-500">{item.cameraId}</td>
                              <td className="p-3">
                                <Badge className={cn("text-[10px] font-bold uppercase", item.status === "ONLINE" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                                  {item.status}
                                </Badge>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                    <Clock className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                                    <span>{item.firstOffline}</span>
                                  </div>
                                  {hasMultiple && (
                                    <span className="text-[10px] text-slate-400 font-sans font-medium pl-5">
                                      Latest of {item.incidentCount} incidents
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                {item.lastOffline === "OFFLINE UNTIL NOW" ? (
                                  <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase px-2 py-0.5">
                                    OFFLINE UNTIL NOW
                                  </Badge>
                                ) : item.status === "ONLINE" ? (
                                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                    {item.lastOffline}
                                  </span>
                                ) : (
                                  <span className="font-mono text-slate-500">{item.lastOffline}</span>
                                )}
                              </td>
                              <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{item.offlineDuration}</td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedCameraForModal(item)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-md text-xs font-black transition-all hover:scale-105 inline-flex items-center gap-1 cursor-pointer",
                                    item.incidentCount > 1
                                      ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-sm"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                                  )}
                                  title="Click to view full incident history"
                                >
                                  <span>{item.incidentCount}</span>
                                  {hasMultiple && (
                                    <span className="text-[9px] uppercase font-bold opacity-80">(View Both)</span>
                                  )}
                                </button>
                              </td>
                              <td className="p-3 text-right font-black">
                                <span className={item.availabilityRate === "100% ONLINE" || item.availabilityRate === "ONLINE" || item.availabilityRate === "ONLINE (RECOVERED)" ? "text-emerald-500" : "text-rose-500"}>
                                  {item.availabilityRate}
                                </span>
                              </td>
                            </tr>

                            {/* Inline Incident History Accordion */}
                            {isExpanded && item.incidents && item.incidents.length > 0 && (
                              <tr className="bg-slate-50/75 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                                <td colSpan={10} className="p-3 pl-8">
                                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 shadow-inner space-y-2">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px]">
                                      <span className="font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                        Historical Incident Breakdown for {item.cameraName} ({item.incidents.length} recorded {item.incidents.length === 1 ? 'incident' : 'incidents'})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedCameraForModal(item)}
                                        className="text-[10px] text-rose-500 hover:underline font-bold inline-flex items-center gap-1"
                                      >
                                        <span>Open in Dialog</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[11px]">
                                        <thead className="bg-slate-100/70 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                                          <tr>
                                            <th className="p-2">Incident #</th>
                                            <th className="p-2">When Offline (Exact Time)</th>
                                            <th className="p-2">When Back Online</th>
                                            <th className="p-2">Downtime Duration</th>
                                            <th className="p-2">Status</th>
                                            <th className="p-2">Trigger Event</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                          {item.incidents.map((inc) => (
                                            <tr key={inc.incidentNumber} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                              <td className="p-2 font-bold text-slate-600 dark:text-slate-400">Incident #{inc.incidentNumber}</td>
                                              <td className="p-2 font-mono font-bold text-rose-600 dark:text-rose-400">
                                                <div className="flex items-center gap-1.5">
                                                  <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                                                  <span>{inc.offlineTime}</span>
                                                </div>
                                              </td>
                                              <td className="p-2 font-mono">
                                                {inc.onlineTime.includes("BACK ONLINE") ? (
                                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{inc.onlineTime}</span>
                                                ) : (
                                                  <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase">
                                                    {inc.onlineTime}
                                                  </Badge>
                                                )}
                                              </td>
                                              <td className="p-2 font-mono font-bold text-amber-600 dark:text-amber-400">{inc.duration}</td>
                                              <td className="p-2">
                                                <Badge className={cn("text-[9px] font-bold uppercase", inc.status === "RECOVERED" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                                                  {inc.status}
                                                </Badge>
                                              </td>
                                              <td className="p-2 text-slate-500 text-[10px] font-mono">{inc.reason}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 5: RECORDING & STORAGE REPORT            */}
        {/* ============================================ */}
        <TabsContent value="recordings" className="space-y-4">
          {/* Detailed Disk Drives Breakdown Table */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-indigo-500" /> SERVER STORAGE &amp; HARD DRIVE BREAKDOWN
                </span>
                <Badge variant="outline" className="text-[11px] font-bold uppercase">
                  TOTAL DISKS: {formattedServerDisks.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {formattedServerDisks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-rose-500 font-bold uppercase gap-2">
                  <Database className="w-6 h-6" />
                  <span>STORAGE DATA NOT AVAILABLE FROM SOURCE</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">SERVER</th>
                        <th className="p-2.5">DISK DRIVE</th>
                        <th className="p-2.5">STATUS</th>
                        <th className="p-2.5">TOTAL CAPACITY</th>
                        <th className="p-2.5">USED CAPACITY</th>
                        <th className="p-2.5">FREE SPACE</th>
                        <th className="p-2.5 text-right">USAGE %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {formattedServerDisks.map((d, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-bold uppercase">{d.serverName}</td>
                          <td className="p-2.5 font-mono text-indigo-600 dark:text-indigo-400 font-bold">{d.diskName}</td>
                          <td className="p-2.5">
                            <Badge className={cn("text-[10px] font-bold uppercase", d.status === "ONLINE" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                              {d.status}
                            </Badge>
                          </td>
                          <td className="p-2.5 font-mono">{d.total}</td>
                          <td className="p-2.5 font-mono text-indigo-500 font-bold">{d.used}</td>
                          <td className="p-2.5 font-mono text-emerald-500 font-bold">{d.free}</td>
                          <td className="p-2.5 text-right font-black text-slate-900 dark:text-white">{d.usagePct}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Server Storage Consumption Card */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" /> SERVER STORAGE CONSUMPTION OVERVIEW
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {loadingData ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>LOADING STORAGE METRICS...</span>
                </div>
              ) : serverStorageStats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <Database className="w-8 h-8 text-slate-500" />
                  <span>STORAGE DATA NOT AVAILABLE FROM SOURCE</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {serverStorageStats.map((srv, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-[12px]">
                      <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 uppercase">
                        <span>{srv.name}</span>
                        <span className="font-mono">{srv.usedGb !== "STORAGE DATA NOT AVAILABLE FROM SOURCE" ? `${srv.usedGb} GB / ${srv.totalGb} GB` : "STORAGE DATA NOT AVAILABLE FROM SOURCE"}</span>
                      </div>
                      <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", srv.usedPct > 85 ? "bg-rose-500" : "bg-indigo-500")}
                          style={{ width: `${Math.min(100, srv.usedPct)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 font-semibold uppercase">
                        <span>FREE: {srv.freeGb !== "STORAGE DATA NOT AVAILABLE FROM SOURCE" ? `${srv.freeGb} GB` : "N/A"}</span>
                        <span>DISKS: {srv.diskCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 6: ALARM EVENTS REPORT                    */}
        {/* ============================================ */}
        <TabsContent value="alarms" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> ALARM EVENTS &amp; SECURITY INCIDENTS ({period.toUpperCase()})
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[11px] font-bold border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    TOTAL: {totalAlarms}
                  </Badge>
                  <Badge className="text-[11px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    {criticalAlarms} CRITICAL
                  </Badge>
                  <Badge className="text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    {warningAlarms} WARNINGS
                  </Badge>
                  <Badge className="text-[11px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    {infoAlarms} INFO
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Filter by device, system location, description..."
                    value={alarmSearch}
                    onChange={(e) => setAlarmSearch(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <Select value={alarmSeverityFilter} onValueChange={setAlarmSeverityFilter}>
                  <SelectTrigger className="h-8 w-40 text-xs rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold">
                    <SelectValue placeholder="All Severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="CRITICAL">Critical Only</SelectItem>
                    <SelectItem value="WARNING">Warning Only</SelectItem>
                    <SelectItem value="INFO">Info Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Executive Alarm Events Analytics Strip */}
              <div className="pt-3 space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">TOTAL LOGS</span>
                      <Badge variant="outline" className="text-[9px] font-bold">ALL EVENTS</Badge>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {alarmEventMetrics.totalAlarms}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {alarmEventMetrics.criticalPct} Crit &bull; {alarmEventMetrics.warningPct} Warn &bull; {alarmEventMetrics.infoPct} Info
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">CAMERA CONNECTIVITY</span>
                      <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] font-bold">DROPS</Badge>
                    </div>
                    <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
                      {alarmEventMetrics.disconnectAlarms} <span className="text-xs font-normal text-slate-400">/ {alarmEventMetrics.reconnectAlarms} reconnects</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {alarmEventMetrics.resolvedIncidents} Resolved Sessions
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">INCIDENT RESOLUTION</span>
                      <Badge className={cn("text-[9px] font-bold", alarmEventMetrics.activeIncidents === 0 ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20")}>
                        {alarmEventMetrics.activeIncidents === 0 ? "RECOVERED" : "ATTENTION"}
                      </Badge>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {alarmEventMetrics.activeIncidents === 0 ? "100% RESOLVED" : `${alarmEventMetrics.activeIncidents} ACTIVE`}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {alarmEventMetrics.totalDowntimeFormatted} Outage Duration
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">EFFECTIVE UPTIME</span>
                      <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-bold">ALARM DERIVED</Badge>
                    </div>
                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                      {cameraOnlineRate}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Period availability rate
                    </div>
                  </div>
                </div>

                {/* Event Category Distribution Indicators */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">EVENT CATEGORIES:</span>
                  <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    📷 Camera Disconnects: {alarmEventMetrics.disconnectAlarms}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    🔄 Camera Reconnects: {alarmEventMetrics.reconnectAlarms}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    🖥️ Server &amp; Host: {alarmEventMetrics.serverAlarms}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    💾 Storage Alerts: {alarmEventMetrics.storageAlarms}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    🌐 Network / Relay: {alarmEventMetrics.networkAlarms}
                  </Badge>
                </div>

                {/* Dynamic Audit Verdict */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50 text-[11px] text-slate-600 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white font-bold uppercase">ALARM AUDIT SUMMARY: </strong>
                  {alarmEventMetrics.auditVerdict}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {systemOffline && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-2 text-[12px]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    SYSTEM &ldquo;{selectedServerLabel}&rdquo; IS CURRENTLY OFFLINE / UNREACHABLE VIA CLOUD RELAY (HTTP 503).
                  </span>
                </div>
              )}
              {displayedTabAlarms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2 font-bold uppercase">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span>NO ALARM EVENTS LOGGED IN THIS PERIOD</span>
                  <p className="text-[11px] text-slate-400 normal-case font-normal">
                    {rawAlarmList.length === 0
                      ? "No events received from VMS event logs."
                      : "Try adjusting your date period or search query."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">EVENT TYPE</th>
                        <th className="p-3">EVENT SOURCE / DEVICE</th>
                        <th className="p-3">SYSTEM / LOCATION</th>
                        <th className="p-3">SEVERITY</th>
                        <th className="p-3">TIMESTAMP</th>
                        <th className="p-3">DESCRIPTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {displayedTabAlarms.slice(0, 100).map((a: any, i: number) => {
                        const isCrit = a.severity === "CRITICAL";
                        const isWarn = a.severity === "WARNING";
                        return (
                          <tr key={`tab-${a.id || "alarm"}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-3 text-slate-400 font-mono">{i + 1}</td>
                            <td className="p-3 font-bold uppercase text-slate-900 dark:text-white">
                              {a.eventLabel || a.eventType}
                            </td>
                            <td className="p-3 font-bold uppercase text-blue-600 dark:text-blue-400">
                              {a.sourceName}
                            </td>
                            <td className="p-3 font-semibold text-[11px] text-slate-500 uppercase">
                              {a.systemName}
                            </td>
                            <td className="p-3">
                              <Badge
                                className={cn(
                                  "text-[10px] font-bold uppercase",
                                  isCrit
                                    ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                    : isWarn
                                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                    : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                )}
                              >
                                {a.severity}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {a.formattedTime}
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-300 max-w-md">
                              {a.description}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {displayedTabAlarms.length > 100 && (
                    <p className="text-[11px] text-slate-400 p-2 text-center">
                      Showing first 100 of {displayedTabAlarms.length} events
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 7: SYSTEM HEALTH REPORT                  */}
        {/* ============================================ */}
        <TabsContent value="health" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-500" /> SYSTEM HEALTH &amp; HARDWARE HOST METRICS
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                  <span>FETCHING SERVER HARDWARE HEALTH...</span>
                </div>
              ) : serverStorageStats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <Server className="w-8 h-8 text-slate-500" />
                  <span>DATA NOT AVAILABLE</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {serverStorageStats.map((srv, i) => (
                    <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 text-[12px]">
                      <div className="flex items-center justify-between font-bold uppercase">
                        <span className="flex items-center gap-2">
                          <Server className="w-3.5 h-3.5 text-emerald-500" />
                          {srv.name}
                        </span>
                        <Badge className={cn("text-[10px] font-bold uppercase", srv.isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                          {srv.isOnline ? "ONLINE" : "OFFLINE"}
                        </Badge>
                      </div>

                      {/* CPU Utilization */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-bold uppercase">
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <Cpu className="w-3 h-3 text-emerald-500" /> CPU UTILIZATION
                          </span>
                          <span className="text-emerald-500">{srv.cpuText}</span>
                        </div>
                      </div>

                      {/* RAM Memory */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-bold uppercase">
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <MemoryStick className="w-3 h-3 text-blue-500" /> RAM MEMORY
                          </span>
                          <span className="text-blue-500">{srv.ramText}</span>
                        </div>
                      </div>

                      {/* Version & OS */}
                      <div className="text-[11px] font-semibold text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between uppercase">
                        <span>SOFTWARE: {srv.version}</span>
                        <span>OS: {srv.osName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========================================================= */}
      {/* MODAL DIALOG: DETAILED INCIDENT BREAKDOWN FOR CAMERA     */}
      {/* ========================================================= */}
      <Dialog open={!!selectedCameraForModal} onOpenChange={(open) => !open && setSelectedCameraForModal(null)}>
        <DialogContent className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-2xl p-6">
          <DialogHeader className="pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white uppercase tracking-wider">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                  Historical Offline Incidents Audit
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Camera: <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">{selectedCameraForModal?.cameraName}</span> • Server: <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase">{selectedCameraForModal?.serverName}</span>
                </DialogDescription>
              </div>
              <Badge className={cn("text-[11px] font-bold uppercase", selectedCameraForModal?.status === "ONLINE" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30" : "bg-rose-500/10 text-rose-500 border border-rose-500/30")}>
                {selectedCameraForModal?.status}
              </Badge>
            </div>
          </DialogHeader>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 my-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Incidents</span>
              <span className="text-xl font-black text-rose-600 dark:text-rose-400">{selectedCameraForModal?.incidentCount || 0}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Combined Downtime</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-400">{selectedCameraForModal?.offlineDuration || "0s"}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Availability</span>
              <span className={cn("text-sm font-black block mt-1", selectedCameraForModal?.availabilityRate?.includes("ONLINE") ? "text-emerald-500" : "text-rose-500")}>
                {selectedCameraForModal?.availabilityRate || "N/A"}
              </span>
            </div>
          </div>

          {/* Incidents Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-2.5">#</th>
                  <th className="p-2.5">WHEN OFFLINE (EXACT TIME)</th>
                  <th className="p-2.5">WHEN BACK ONLINE</th>
                  <th className="p-2.5">DURATION</th>
                  <th className="p-2.5">STATUS</th>
                  <th className="p-2.5">TRIGGER / EVENT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedCameraForModal?.incidents && selectedCameraForModal.incidents.length > 0 ? (
                  selectedCameraForModal.incidents.map((inc) => (
                    <tr key={inc.incidentNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-slate-400">Incident #{inc.incidentNumber}</td>
                      <td className="p-2.5 font-mono font-bold text-rose-600 dark:text-rose-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{inc.offlineTime}</span>
                        </div>
                      </td>
                      <td className="p-2.5 font-mono">
                        {inc.onlineTime.includes("BACK ONLINE") ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{inc.onlineTime}</span>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase">
                            {inc.onlineTime}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-amber-600 dark:text-amber-400">{inc.duration}</td>
                      <td className="p-2.5">
                        <Badge className={cn("text-[9px] font-bold uppercase", inc.status === "RECOVERED" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                          {inc.status}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-slate-500 font-mono text-[10px] truncate max-w-[180px]" title={inc.reason}>
                        {inc.reason}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400">No individual incidents recorded</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
