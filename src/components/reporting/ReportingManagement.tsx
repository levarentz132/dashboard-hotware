"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { computeCanonicalEventMetrics } from "@/lib/canonical-event-metrics";
import { buildAnalystRelevantEventLog } from "@/lib/s3-event-presentation";
import { calculateTimestampTrend } from "@/lib/timestamp-trend-calculator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  type ServerHealthItem,
  type ServerStorageDiskItem,
  type ServerUptimeItem,
  type AlarmReportItem,
  type S3LogItem,
} from "./export-utils";
import { getOfflineExactTime } from "@/lib/camera-offline-tracker";
import { calculateDowntimeResult } from "@/lib/downtime-calculator";
import { calculateServerUptimeFromEvents, type SystemServerUptimeSummary } from "@/lib/server-uptime-calculator";
import { ORIX_LOGO_BASE64_PNG } from "@/assets/orix-logo";

function cleanId(id?: string | null): string {
  return String(id || "").replace(/[{}]/g, "").toLowerCase();
}

const EMPTY_ARRAY: any[] = [];

// ============================================
// CONSTANTS & BRANDING
// ============================================
const COMPANY_NAME = "PT ORIX FINANCE INDONESIA";
const DASHBOARD_TITLE = "ORIX INDONESIA FINANCE";

type ReportPeriod = "current" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
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
  }).format(date);
};

const formatExactTimestamp = formatTimestamp;

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
  const [hasLocalServer, setHasLocalServer] = useState(false);
  useEffect(() => {
    setHasLocalServer(
      !!Cookies.get("local_nx_user") ||
      !!Cookies.get("nx_server_id")
    );
  }, []);

  // Live Cloud Systems list & events queries
  const { cloudSystems, loadingCloud, refetchCloudSystems } = useCloudSystemsWithOnline();
  const { alarms, loading: loadingAlarms, refetch: refetchAlarms } = useAlarmsQuery();
  const { events, loading: loadingEvents, refetch: refetchEvents } = useEventsQuery(300);

  const cloudSystemsRef = useRef(cloudSystems);
  cloudSystemsRef.current = cloudSystems;

  const uniqueSelectSystems = useMemo(() => {
    const seen = new Set<string>();
    return (cloudSystems || []).filter((sys) => {
      if (!sys || !sys.id || seen.has(sys.id) || sys.id === "all" || sys.id === "local") {
        return false;
      }
      seen.add(sys.id);
      return true;
    });
  }, [cloudSystems]);

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

      const selectedFromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Date.now() - 30 * 86400 * 1000;
      // Look back at least 60 days for events so true disconnect timestamps for currently offline cameras are always discovered
      const eventsLookbackMs = Math.min(selectedFromMs, Date.now() - 60 * 86400 * 1000);
      const currentCloudSystems = cloudSystemsRef.current || [];

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
        const activeSystems = currentCloudSystems.filter((s) => s.isOnline);
        const targetSystems = activeSystems.length > 0 ? activeSystems : currentCloudSystems;

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
          fetch(`/api/cloud/events?systemId=${encodeURIComponent(sys.id)}&from=${eventsLookbackMs}&limit=2000`, { headers })
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
          ? fetch(`/api/cloud/events?systemId=${encodeURIComponent(localSid)}&from=${eventsLookbackMs}&limit=2000`, { headers })
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

        // Step Implementation 1: Synthesize offline server placeholders for offline cloud systems without calling /servers
        cloudSystems.forEach((sys) => {
          if (!sys.isOnline) {
            addSrvIfUnique({
              id: sys.id,
              name: sys.name,
              status: "OFFLINE",
              stateOfHealth: "offline",
              isOnline: false,
              _systemName: sys.name,
              _systemId: sys.id,
              isOfflinePlaceholder: true,
            });
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
          fetch(`/api/cloud/events?systemId=${encodeURIComponent(localSid)}&from=${eventsLookbackMs}&limit=2000`, { headers })
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
        const targetSys = currentCloudSystems.find((s) => s.id === selectedSystemId);
        const sysName = targetSys?.name || selectedSystemId;

        const [camsRes, srvsRes, strsRes, evtsRes] = await Promise.allSettled([
          fetchFromCloudRelay<NxCamera[]>(selectedSystemId, "/devices"),
          fetchFromCloudRelay<any[]>(selectedSystemId, "/servers"),
          fetch(`/api/cloud/storages?systemId=${encodeURIComponent(selectedSystemId)}`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/cloud/events?systemId=${encodeURIComponent(selectedSystemId)}&from=${eventsLookbackMs}&limit=2000`, { headers }).then(async (r) => {
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
        const effectiveSysSrvs = sysSrvs.length > 0
          ? sysSrvs.map((s: any) => ({ ...s, _systemName: sysName }))
          : targetSys
            ? [{
                id: targetSys.id,
                name: targetSys.name,
                status: "OFFLINE",
                stateOfHealth: "offline",
                isOnline: false,
                _systemName: sysName,
                _systemId: selectedSystemId,
                isOfflinePlaceholder: true,
              }]
            : [];
        setServers(effectiveSysSrvs);
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
  }, [selectedSystemId, dateFrom]);

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
    if (alarmEvents.length > 0) return alarmEvents;
    if (Array.isArray(events) && events.length > 0) return events;
    if (Array.isArray(alarms) && alarms.length > 0) return alarms;
    return EMPTY_ARRAY;
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
      } else {
        severity = "info";
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
      const timestampMs = a.timestampMs;

      if (
        timestampMs === null ||
        timestampMs === undefined ||
        !Number.isFinite(timestampMs)
      ) {
        return false;
      }

      return timestampMs >= fromTime && timestampMs <= toTime;
    });

    return [...periodFiltered].sort(
      (a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0)
    );
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

  const analystPresentationLog = useMemo(() => {
    return buildAnalystRelevantEventLog(displayedTabAlarms);
  }, [displayedTabAlarms]);

  // Dynamic Offline Camera Summary Title
  const offlineSummaryTitle = useMemo(() => {
    switch (period) {
      case "current":
        return "CURRENT OFFLINE CAMERA SUMMARY";
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
    if (period === "current") {
      return `CURRENT SNAPSHOT • ${formatDateLocal(new Date())}`;
    } else if (period === "daily") {
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
  // CANONICAL DOWNTIME CALCULATION (single source of truth)
  // ============================================
  type CalculationSource = "LOADING" | "LIVE_CALCULATION" | "CACHE_HIT" | "CACHE_MISS";

  const defaultAggregate = {
    totalAlarms: 0, criticalAlarms: 0, criticalPct: "0%", warningAlarms: 0, warningPct: "0%",
    infoAlarms: 0, infoPct: "0%", disconnectAlarms: 0, reconnectAlarms: 0, serverAlarms: 0,
    storageAlarms: 0, networkAlarms: 0, resolvedIncidents: 0, activeIncidents: 0,
    totalOfflineIncidents: 0, totalDowntimeMs: 0, totalDowntimeFormatted: "0s",
    periodCameraUptimeRate: 100, auditVerdict: "",
  };

  const periodTypeMap: Record<ReportPeriod, string> = useMemo(() => ({
    current: "CURRENT", daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY", custom: "CUSTOM",
  }), []);

  const currentScopeKey = `${periodTypeMap[period]}_${selectedServerLabel}_${dateFrom}_${dateTo}`;

  const isHistorical = useMemo(() => {
    if (!dateTo) return false;
    const toTimeMs = new Date(`${dateTo}T23:59:59.999`).getTime();
    return toTimeMs < Date.now();
  }, [dateTo]);

  // Direct synchronous memoized calculation — zero setState loop risk
  const liveCalculationResult = useMemo(() => {
    if (period === "current" || !dateFrom || !dateTo) return null;
    return calculateDowntimeResult({
      cameras,
      events: targetAlarmEvents,
      allEvents: parsedAlarmList,
      dateFrom,
      dateTo,
      selectedServerLabel,
    });
  }, [period, cameras, targetAlarmEvents, parsedAlarmList, dateFrom, dateTo, selectedServerLabel]);

  // Cached historical result state (only populated when historical cache hits)
  const [cachedHistoricalResult, setCachedHistoricalResult] = useState<{
    key: string;
    data: { cameras: OfflineCameraItem[]; aggregate: typeof defaultAggregate };
  } | null>(null);

  const resolvedResult = useMemo(() => {
    if (period === "current") {
      return { cameras: [] as OfflineCameraItem[], aggregate: defaultAggregate };
    }
    if (isHistorical && cachedHistoricalResult && cachedHistoricalResult.key === currentScopeKey) {
      return cachedHistoricalResult.data;
    }
    if (liveCalculationResult) {
      return liveCalculationResult;
    }
    return { cameras: [] as OfflineCameraItem[], aggregate: defaultAggregate };
  }, [period, isHistorical, cachedHistoricalResult, currentScopeKey, liveCalculationResult]);

  const calculationSource: CalculationSource = useMemo(() => {
    if (period === "current") return "LIVE_CALCULATION";
    if (isHistorical && cachedHistoricalResult && cachedHistoricalResult.key === currentScopeKey) {
      return "CACHE_HIT";
    }
    return "LIVE_CALCULATION";
  }, [period, isHistorical, cachedHistoricalResult, currentScopeKey]);

  // ============================================
  // CACHE FETCH & BACKGROUND PERSISTENCE
  // ============================================
  const lastSavedKeyRef = useRef<string>("");
  const lastCacheRequestRef = useRef<string>("");

  useEffect(() => {
    if (period === "current" || !dateFrom || !dateTo) return;

    // 1. If Historical, fetch cache once per unique scope key
    if (isHistorical) {
      if (lastCacheRequestRef.current === currentScopeKey) return;
      lastCacheRequestRef.current = currentScopeKey;

      let cancelled = false;
      fetch(
        `/api/downtime-results?${new URLSearchParams({
          periodType: periodTypeMap[period] || "MONTHLY",
          dateFrom,
          dateTo,
          selectedServerLabel,
        })}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (cancelled || !json?.success || !json?.data) return;
          const d = json.data;
          if (
            d.periodType === periodTypeMap[period] &&
            d.dateFrom === dateFrom &&
            d.dateTo === dateTo &&
            d.selectedServerLabel === selectedServerLabel &&
            Array.isArray(d.cameras) &&
            d.metrics
          ) {
            setCachedHistoricalResult({
              key: currentScopeKey,
              data: { cameras: d.cameras, aggregate: d.metrics },
            });
          }
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }

    // 2. If Live Calculation is ready, asynchronously persist it once per scope key
    if (liveCalculationResult && lastSavedKeyRef.current !== currentScopeKey) {
      lastSavedKeyRef.current = currentScopeKey;

      const body = {
        version: 2,
        periodType: periodTypeMap[period] || "MONTHLY",
        dateFrom,
        dateTo,
        label: periodLabel,
        selectedServerLabel,
        calculatedAt: new Date().toISOString(),
        metrics: {
          periodCameraUptimeRate: liveCalculationResult.aggregate.periodCameraUptimeRate,
          metricDescription: "AVERAGE PER-CAMERA UPTIME INDEX",
          totalDowntimeMs: liveCalculationResult.aggregate.totalDowntimeMs,
          totalDowntimeFormatted: liveCalculationResult.aggregate.totalDowntimeFormatted,
          totalOfflineIncidents: liveCalculationResult.aggregate.totalOfflineIncidents,
          resolvedIncidents: liveCalculationResult.aggregate.resolvedIncidents,
          activeIncidents: liveCalculationResult.aggregate.activeIncidents,
        },
        cameras: liveCalculationResult.cameras,
        cameraInventory: [],
        server: {
          health: [],
          uptimeResults: [],
          storageStats: [],
          disks: [],
        },
        alarms: {
          canonicalCount: targetAlarmEvents.length,
          rawAlarms: [],
          presentationItems: [],
        },
      };

      fetch("/api/downtime-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch((err) => {
        console.warn("[Reporting] Downtime result persistence failed:", err);
      });
    }
  }, [
    isHistorical,
    period,
    dateFrom,
    dateTo,
    selectedServerLabel,
    currentScopeKey,
    liveCalculationResult,
    periodTypeMap,
    periodLabel,
    targetAlarmEvents.length,
  ]);

  const offlineCamerasSummary = resolvedResult.cameras;

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

  // Canonical Reporting Events & Metrics (Single Source of Truth)
  const canonicalReportingEvents = targetAlarmEvents;

  const canonicalMetrics = useMemo(() => {
    return computeCanonicalEventMetrics({
      events: canonicalReportingEvents,
      dateFrom,
      dateTo,
      selectedServerLabel,
      totalOfflineIncidents,
      resolvedIncidents: resolvedResult.aggregate.resolvedIncidents,
      activeIncidents: resolvedResult.aggregate.activeIncidents,
      periodCameraUptimeRate: resolvedResult.aggregate.periodCameraUptimeRate,
      totalDowntimeFormatted: resolvedResult.aggregate.totalDowntimeFormatted,
    });
  }, [
    canonicalReportingEvents,
    dateFrom,
    dateTo,
    selectedServerLabel,
    totalOfflineIncidents,
    resolvedResult.aggregate,
  ]);

  const totalAlarms = canonicalMetrics.totalEvents;
  const criticalAlarms = canonicalMetrics.criticalEvents;
  const warningAlarms = canonicalMetrics.warningEvents;
  const infoAlarms = canonicalMetrics.infoEvents;

  // ============================================
  // ALARM EVENT METRICS (derived from canonical calculation)
  // ============================================
  const alarmEventMetrics = useMemo(() => {
    return {
      ...resolvedResult.aggregate,
      totalAlarms: canonicalMetrics.totalEvents,
      criticalAlarms: canonicalMetrics.criticalEvents,
      criticalPct: canonicalMetrics.criticalPct,
      warningAlarms: canonicalMetrics.warningEvents,
      warningPct: canonicalMetrics.warningPct,
      infoAlarms: canonicalMetrics.infoEvents,
      infoPct: canonicalMetrics.infoPct,
      auditVerdict: canonicalMetrics.auditVerdict,
    };
  }, [resolvedResult.aggregate, canonicalMetrics]);

  // Period Camera Uptime Rate (calculated from historical alarm events) or Instant Camera Online Rate for CURRENT
  const cameraOnlineRate = period === "current" ? instantCameraOnlineRate : alarmEventMetrics.periodCameraUptimeRate;

  // Storage Stats per Server
  const serverStorageStats = useMemo(() => {
    if (!servers || servers.length === 0) return [];
    return servers.map((srv: any) => {
      if (srv.isOfflinePlaceholder) {
        return {
          name: (srv._systemName || srv.name || "SERVER").toUpperCase(),
          isOnline: false,
          status: "OFFLINE",
          totalGb: "N/A",
          usedGb: "N/A",
          freeGb: "N/A",
          usedPct: 0,
          diskCount: "N/A",
          cpuText: "N/A",
          ramText: "N/A",
          version: "N/A",
          osName: "N/A",
          isOfflinePlaceholder: true,
        };
      }

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
        isOfflinePlaceholder: false,
      };
    });
  }, [servers]);

  // S3 Cloud Bridge — No live S3 API endpoint exists in this deployment.
  const s3PerformanceData: S3LogItem[] = useMemo(() => {
    return [];
  }, []);

  // Server Historical Period Uptime Summary (Calculated from serverFailure/serverStarted events)
  const serverUptimeSummary = useMemo<SystemServerUptimeSummary>(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Date.now() - 30 * 86400 * 1000;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Date.now();

    // STEP 2.7: Evaluate completeness PER SYSTEM (max single-system count) to eliminate false positive warnings
    // when total merged events across multiple systems exceeds 2000 while no single system reached 2000.
    const perSystemCounts = new Map<string, number>();
    alarmEvents.forEach((ev: any) => {
      const sysId = ev._systemId || "default";
      perSystemCounts.set(sysId, (perSystemCounts.get(sysId) || 0) + 1);
    });
    const maxSingleSystemCount = perSystemCounts.size > 0
      ? Math.max(...Array.from(perSystemCounts.values()))
      : alarmEvents.length;

    return calculateServerUptimeFromEvents({
      servers,
      events: alarmEvents,
      fromMs,
      toMs,
      nowMs: Date.now(),
      requestedLimit: 2000,
      returnedEventCount: maxSingleSystemCount,
      isFetchFailed: systemOffline,
    });
  }, [servers, alarmEvents, dateFrom, dateTo, systemOffline]);

  // Trend Chart Data (Pure Timestamp-Based Bucketing)
  const trendResult = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Date.now() - 30 * 86400 * 1000;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Date.now();

    return calculateTimestampTrend({
      events: targetAlarmEvents,
      fromMs,
      toMs,
      period,
      totalCameras,
      overallServerUptimeRate: serverUptimeSummary.overallServerUptimeRate,
      dataCompleteness: serverUptimeSummary.dataCompleteness,
    });
  }, [
    targetAlarmEvents,
    dateFrom,
    dateTo,
    period,
    totalCameras,
    serverUptimeSummary.overallServerUptimeRate,
    serverUptimeSummary.dataCompleteness,
  ]);

  const trendData = trendResult.trendData;

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
      const offlineInfo = !isCamOnline ? getOfflineExactTime(cam, parsedAlarmList) : null;
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
      version: srv.isOfflinePlaceholder ? "N/A" : srv.version,
      osName: srv.isOfflinePlaceholder ? "N/A" : srv.osName,
      cpuUsage: srv.isOfflinePlaceholder ? "N/A" : srv.cpuText,
      ramUsage: srv.isOfflinePlaceholder ? "N/A" : srv.ramText,
      diskCount: srv.isOfflinePlaceholder ? "N/A" : srv.diskCount,
      storageUsage: srv.isOfflinePlaceholder ? "N/A" : srv.totalGb !== "STORAGE DATA NOT AVAILABLE FROM SOURCE" ? `${srv.usedGb} GB / ${srv.totalGb} GB (${srv.usedPct}%)` : "STORAGE DATA NOT AVAILABLE FROM SOURCE",
    }));

    const formattedServerUptime: ServerUptimeItem[] = serverUptimeSummary.serverResults.map((res) => {
      const matchSrv = servers.find(
        (s: any) =>
          cleanId(s.id || s.serverId || s.name) === cleanId(res.serverId) ||
          s.name === res.serverName ||
          (s._systemId && s._systemId === res.serverId)
      );
      const isOfflinePlaceholder = Boolean(
        (res as any).isOfflinePlaceholder ||
        matchSrv?.isOfflinePlaceholder ||
        (res.currentStatus === "offline" && matchSrv?.isOfflinePlaceholder)
      );

      if (isOfflinePlaceholder) {
        return {
          serverId: res.serverId,
          serverName: res.serverName,
          currentStatus: "OFFLINE",
          firstOffline: "N/A",
          lastRecovery: "OFFLINE UNTIL NOW",
          totalDowntime: "N/A",
          incidentCount: "N/A" as any,
          uptimeRate: null,
          periodUptime: "N/A — SERVER CURRENTLY OFFLINE / HISTORICAL UPTIME NOT AVAILABLE",
          dataCompleteness: res.dataCompleteness,
          isOfflinePlaceholder: true,
          outageSessions: [],
        };
      }

      return {
        serverId: res.serverId,
        serverName: res.serverName,
        currentStatus: res.currentStatus === "online" ? "ONLINE" : "OFFLINE",
        firstOffline: res.firstOfflineMs ? formatTimestamp(res.firstOfflineMs) : "NO OFFLINE INCIDENTS",
        lastRecovery: res.activeOutage
          ? "OFFLINE UNTIL NOW"
          : res.lastRecoveryMs
          ? formatTimestamp(res.lastRecoveryMs)
          : res.currentStatus === "online"
          ? "ONLINE"
          : "OFFLINE UNTIL NOW",
        totalDowntime: res.totalDowntimeFormatted,
        incidentCount: res.incidentCount,
        uptimeRate: res.uptimeRate,
        periodUptime: res.uptimeRate !== null ? `${res.uptimeRate}%` : "N/A",
        dataCompleteness: res.dataCompleteness,
        isOfflinePlaceholder: false,
        outageSessions: res.outageSessions
          ? res.outageSessions.map((s) => ({
              startTimeMs: s.startTimeMs,
              endTimeMs: s.endTimeMs,
              durationMs: s.durationMs,
              isActive: s.isActive,
            }))
          : [],
      };
    });

    const formattedAlarms: AlarmReportItem[] = targetAlarmEvents.map((a: any) => ({
      id: String(a.id || "EVENT"),
      source: a.systemName ? `${a.sourceName} (${a.systemName})` : a.sourceName,
      severity: a.severity || "INFO",
      timestamp: a.formattedTime || "DATA NOT AVAILABLE FROM SOURCE",
      description: a.description || "NO DESCRIPTION AVAILABLE",
      eventType: a.eventType,
      eventLabel: a.eventLabel,
      systemName: a.systemName,
      sourceName: a.sourceName,
      timestampMs: typeof a.timestampMs === "number" ? a.timestampMs : undefined,
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
      overallServerPeriodUptime: serverUptimeSummary.overallServerUptimeRate,
      totalAlarms,
      criticalAlarms,
      warningAlarms,
      totalOfflineIncidents,
      offlineSummaryTitle,
      alarmEventMetrics,
      trendData,
      serverStorageStats,
      serverUptimeResults: formattedServerUptime,
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
    serverUptimeSummary,
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
              {(["current", "daily", "weekly", "monthly", "custom"] as ReportPeriod[]).map((p) => (
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
              <div className="relative flex items-center">
                <Server className="absolute left-3 h-3.5 w-3.5 text-blue-500 pointer-events-none shrink-0" />
                <select
                  value={selectedSystemId}
                  onChange={(e) => setSelectedSystemId(e.target.value)}
                  className="w-full sm:w-[260px] h-9 pl-9 pr-8 text-[12px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 uppercase outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="all">ALL (CENTRALIZED REPORTING)</option>
                  {hasLocalServer && <option value="local">LOCAL SERVER</option>}
                  {uniqueSelectSystems.map((sys) => (
                    <option key={sys.id} value={sys.id}>
                      {sys.name || sys.id} {sys.isOnline ? "(ONLINE)" : "(OFFLINE)"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 h-3.5 w-3.5 text-slate-400 pointer-events-none shrink-0" />
              </div>
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
                <Camera className="w-3.5 h-3.5 text-blue-500" /> {period === "current" ? "INSTANT CAMERA ONLINE RATE" : "CAMERA UPTIME RATE"}
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
                {period === "current"
                  ? `${onlineCameras}/${totalCameras} CAMERAS ONLINE NOW`
                  : `${alarmEventMetrics.totalDowntimeFormatted} DOWNTIME • ${alarmEventMetrics.totalOfflineIncidents} INCIDENTS (${onlineCameras}/${totalCameras} ONLINE NOW)`}
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
                <Database className="w-3.5 h-3.5 text-indigo-500" /> RECORDING SERVERS
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

        {/* Card 3: Server Health Index (Historical Period Uptime) */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-500" /> {period === "current" ? "INSTANT SERVER ONLINE RATE" : "SERVER HEALTH INDEX"}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {period === "current"
                    ? (totalServers > 0 ? `${((onlineServers / totalServers) * 100).toFixed(1)}%` : "100%")
                    : (serverUptimeSummary.overallServerUptimeRate !== null
                      ? `${serverUptimeSummary.overallServerUptimeRate}%`
                      : "N/A")}
                </span>
                <span className="text-[11px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {onlineServers}/{totalServers} ONLINE NOW
                </span>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase">
                {period === "current"
                  ? `${onlineServers}/${totalServers} SERVERS ONLINE NOW`
                  : `PERIOD UPTIME • ${serverUptimeSummary.totalServerIncidents} INCIDENTS (${serverUptimeSummary.totalServerDowntimeFormatted} DOWNTIME)`}
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
                {period === "current"
                  ? `${onlineCameras}/${totalCameras} CAMERAS ONLINE • ${onlineServers}/${totalServers} SERVERS ONLINE`
                  : `${alarmEventMetrics.totalOfflineIncidents} DROPS (${alarmEventMetrics.resolvedIncidents} RESOLVED • ${alarmEventMetrics.activeIncidents} ACTIVE)`}
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
                  {period === "current" ? "LIVE ALARM & SYSTEM EVENT SUMMARY" : "ALARM EVENTS & AVAILABILITY EXECUTIVE SUMMARY"}
                </h3>
                <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] font-bold uppercase">
                  {period.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {period === "current"
                  ? `As of ${formatDateLocal(new Date())} • Real-time event log for ${selectedServerLabel}`
                  : `Derived directly from ${alarmEventMetrics.totalAlarms} alarm events recorded for ${selectedServerLabel} (${dateFrom} to ${dateTo})`}
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
                <div className={cn("font-bold", period === "current" ? (offlineCamerasCount === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400") : (alarmEventMetrics.activeIncidents === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"))}>
                  {period === "current"
                    ? (offlineCamerasCount === 0 ? "ALL CAMERAS ONLINE" : `${offlineCamerasCount} CAMERAS OFFLINE NOW`)
                    : (alarmEventMetrics.activeIncidents === 0 ? "100% RESOLVED" : `${alarmEventMetrics.activeIncidents} ACTIVE ISSUE(S)`)}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {period === "current"
                    ? `${onlineServers} / ${totalServers} Servers Active`
                    : `${alarmEventMetrics.totalDowntimeFormatted} Total Outage Time`}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  {period === "current" ? "INSTANT CAMERA ONLINE RATE" : "EFFECTIVE UPTIME RATE"}
                </span>
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  {period === "current" ? `${cameraOnlineRate}% Instant Online` : `${cameraOnlineRate}% Period Uptime`}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {period === "current" ? `${onlineCameras} / ${totalCameras} Cameras Online Now` : "Derived from historical alarm events"}
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
              {period === "current"
                ? "LIVE SNAPSHOT AUDIT: System monitoring active. Current snapshot operational status recorded."
                : alarmEventMetrics.auditVerdict}
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
          <TabsTrigger value="server-downtime" className="rounded-lg text-[12px] font-bold uppercase gap-1.5 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
            <Server className="w-3.5 h-3.5 text-amber-400" /> SERVER DOWNTIME REPORT
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
            {period === "current" ? (
              <Card className="lg:col-span-2 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center space-y-3">
                <div className="p-3 bg-blue-500/10 rounded-2xl w-fit mx-auto text-blue-500">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  CURRENT SNAPSHOT
                </h3>
                <p className="text-[12px] font-semibold text-slate-500 max-w-md mx-auto uppercase">
                  Trend analysis requires a historical reporting period. Available for DAILY, WEEKLY, MONTHLY, and CUSTOM modes.
                </p>
              </Card>
            ) : (
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
                            <span className="text-blue-500 font-bold">
                              {item.cameras !== null && item.cameras !== undefined ? `${item.cameras} ONLINE CAMERAS` : "CAMERAS: N/A"}
                            </span>
                            <span className="text-amber-500 font-bold">{item.alarms} ALARMS</span>
                            <span className="text-emerald-500 font-bold">
                              {item.healthScore !== null && item.healthScore !== undefined ? `${item.healthScore}% HEALTH` : "HEALTH: N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          {item.cameras !== null && item.cameras !== undefined && (
                            <div
                              style={{ width: `${Math.min(100, (item.cameras / Math.max(totalCameras, 1)) * 100)}%` }}
                              className="bg-gradient-to-r from-blue-600 to-cyan-500 h-full"
                            />
                          )}
                          <div
                            style={{ width: `${Math.min(100, (item.alarms / Math.max(totalAlarms, 1)) * 100)}%` }}
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
            )}

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
                    <span>{period === "current" ? "INSTANT CAMERA ONLINE RATE" : "CAMERA UPTIME RATE"}</span>
                    <span>{cameraOnlineRate}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 uppercase">
                    {period === "current"
                      ? `${onlineCameras}/${totalCameras} ACTIVE UNITS ONLINE NOW`
                      : `${onlineCameras}/${totalCameras} ACTIVE UNITS NOW • ${alarmEventMetrics.totalDowntimeFormatted} DOWNTIME IN PERIOD`}
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
                        {period !== "current" && <th className="p-3">HAS IT BEEN ONLINE</th>}
                        {period !== "current" && <th className="p-3">OFFLINE DURATION</th>}
                        {period !== "current" && <th className="p-3 text-center">OFFLINE INCIDENTS</th>}
                        {period !== "current" && <th className="p-3 text-right">AVAILABILITY RATE</th>}
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
                              {period !== "current" && (
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
                              )}
                              {period !== "current" && <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{item.offlineDuration}</td>}
                              {period !== "current" && (
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
                              )}
                              {period !== "current" && (
                                <td className="p-3 text-right font-black">
                                  <span className={item.availabilityRate === "100% ONLINE" || item.availabilityRate === "ONLINE" || item.availabilityRate === "ONLINE (RECOVERED)" ? "text-emerald-500" : "text-rose-500"}>
                                    {item.availabilityRate}
                                  </span>
                                </td>
                              )}
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
        {/* TAB 4.5: SERVER DOWNTIME & OUTAGE REPORT     */}
        {/* ============================================ */}
        <TabsContent value="server-downtime" className="space-y-4">
          {/* Executive Server Uptime KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600" />
              <CardContent className="p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">SERVER HEALTH INDEX</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {serverUptimeSummary.overallServerUptimeRate !== null ? `${serverUptimeSummary.overallServerUptimeRate}%` : "N/A"}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-500 uppercase">
                    {period === "current" ? "LIVE" : "PERIOD UPTIME"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">
                  {serverUptimeSummary.onlineServerCount}/{serverUptimeSummary.totalServerCount} SERVERS ONLINE NOW
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-600" />
              <CardContent className="p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">TOTAL SERVER DOWNTIME</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {serverUptimeSummary.totalServerDowntimeFormatted}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">
                  RECORDED IN SELECTED PERIOD
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-600" />
              <CardContent className="p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">SERVER OUTAGE INCIDENTS</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                    {serverUptimeSummary.totalServerIncidents}
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 uppercase">
                    TOTAL INCIDENTS
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">
                  SYSTEM FAILURE &amp; DISCONNECT LOGS
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600" />
              <CardContent className="p-4">
                <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">MONITORED SERVERS</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {serverUptimeSummary.totalServerCount}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-500 uppercase">
                    ACTIVE NODES
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">
                  VMS CORE INSTANCES
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Table 1: Server Availability Summary */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <Server className="w-4 h-4 text-amber-500" /> SERVER DOWNTIME &amp; AVAILABILITY AUDIT
                  </CardTitle>
                  <CardDescription className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
                    PER-SERVER HISTORICAL AVAILABILITY, TOTAL DOWNTIME, AND INCIDENT FREQUENCY
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[11px] font-bold uppercase self-start sm:self-auto">
                  SERVERS: {serverUptimeSummary.totalServerCount} | INCIDENTS: {serverUptimeSummary.totalServerIncidents}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {serverUptimeSummary.serverResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <Server className="w-8 h-8 text-slate-400" />
                  <span>NO SERVER DATA AVAILABLE FOR SELECTED PERIOD</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">SERVER NAME</th>
                        <th className="p-3">CURRENT STATUS</th>
                        <th className="p-3">FIRST OFFLINE RECORDED</th>
                        <th className="p-3">LAST RECOVERY RECORDED</th>
                        <th className="p-3">TOTAL DOWNTIME</th>
                        <th className="p-3">INCIDENTS</th>
                        <th className="p-3 text-right">PERIOD UPTIME</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {serverUptimeSummary.serverResults.map((srvResult, idx) => {
                        const isSrvOnline = srvResult.currentStatus === "online";
                        const firstOfflineStr = srvResult.firstOfflineMs
                          ? formatExactTimestamp(srvResult.firstOfflineMs)
                          : "NO OFFLINE INCIDENTS";
                        const lastRecoveryStr = srvResult.activeOutage
                          ? "OFFLINE UNTIL NOW"
                          : srvResult.lastRecoveryMs
                          ? formatExactTimestamp(srvResult.lastRecoveryMs)
                          : isSrvOnline
                          ? "ONLINE"
                          : "OFFLINE UNTIL NOW";

                        return (
                          <tr key={srvResult.serverId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                              <Server className="w-3.5 h-3.5 text-slate-400" />
                              <span>{srvResult.serverName}</span>
                            </td>
                            <td className="p-3">
                              <Badge className={cn("text-[10px] font-bold uppercase", isSrvOnline ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20")}>
                                {isSrvOnline ? "ONLINE NOW" : "OFFLINE NOW"}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              {srvResult.firstOfflineMs ? (
                                <div className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                                  <Clock className="w-3 h-3 shrink-0 text-rose-500" />
                                  <span>{firstOfflineStr}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400">{firstOfflineStr}</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              {lastRecoveryStr === "OFFLINE UNTIL NOW" ? (
                                <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase">
                                  OFFLINE UNTIL NOW
                                </Badge>
                              ) : (
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{lastRecoveryStr}</span>
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                              {srvResult.totalDowntimeFormatted}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-[10px] font-bold">
                                {srvResult.incidentCount}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-black">
                              <span className={cn(srvResult.uptimeRate !== null && srvResult.uptimeRate >= 99 ? "text-emerald-500" : srvResult.uptimeRate !== null && srvResult.uptimeRate >= 95 ? "text-amber-500" : "text-rose-500")}>
                                {srvResult.uptimeRate !== null ? `${srvResult.uptimeRate}%` : "N/A"}
                              </span>
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

          {/* Table 2: Chronological Server Outage Incidents Log */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" /> DETAILED SERVER OUTAGE INCIDENTS LOG
                </span>
                <span className="text-[11px] text-slate-400 font-semibold uppercase">
                  EXACT DISCONNECT &amp; RECONNECTION TIMELINES
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {serverUptimeSummary.serverResults.every((s) => s.outageSessions.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span>NO SERVER OUTAGE INCIDENTS RECORDED IN THIS PERIOD (100% UPTIME)</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">SERVER NAME</th>
                        <th className="p-3">OFFLINE START (EXACT)</th>
                        <th className="p-3">BACK ONLINE / RECOVERY</th>
                        <th className="p-3">DURATION</th>
                        <th className="p-3">STATUS</th>
                        <th className="p-3">TRIGGER REASON</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {serverUptimeSummary.serverResults.flatMap((s) => s.outageSessions).map((sess, idx) => {
                        const offlineStr = formatExactTimestamp(sess.startTimeMs);
                        const recoveryStr = sess.isActive
                          ? "OFFLINE UNTIL NOW"
                          : formatExactTimestamp(sess.endTimeMs);
                        const durationStr = formatDuration(sess.durationMs);

                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 text-slate-400 font-mono">#{idx + 1}</td>
                            <td className="p-3 font-bold uppercase text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Server className="w-3.5 h-3.5 text-slate-400" />
                              <span>{sess.serverName}</span>
                            </td>
                            <td className="p-3 font-mono font-bold text-rose-600 dark:text-rose-400">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                                <span>{offlineStr}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono">
                              {sess.isActive ? (
                                <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase">
                                  ACTIVE / NOT RECOVERED
                                </Badge>
                              ) : (
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{recoveryStr}</span>
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                              {durationStr}
                            </td>
                            <td className="p-3">
                              <Badge className={cn("text-[10px] font-bold uppercase", sess.isActive ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20")}>
                                {sess.isActive ? "ACTIVE OUTAGE" : "RECOVERED"}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-slate-500 text-[11px]">
                              Server Disconnected / Process Failure
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
        {/* TAB 5: RECORDING & STORAGE REPORT            */}
        {/* ============================================ */}
        <TabsContent value="recordings" className="space-y-4">
          {/* Detailed Disk Drives Breakdown Table */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-indigo-500" /> RECORDING SERVER STORAGE &amp; HARD DRIVE BREAKDOWN
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
                <div className="relative flex items-center">
                  <select
                    value={alarmSeverityFilter}
                    onChange={(e) => setAlarmSeverityFilter(e.target.value)}
                    className="h-8 pl-3 pr-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer uppercase"
                  >
                    <option value="all">ALL SEVERITIES</option>
                    <option value="CRITICAL">CRITICAL ONLY</option>
                    <option value="WARNING">WARNING ONLY</option>
                    <option value="INFO">INFO ONLY</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 h-3 w-3 text-slate-400 pointer-events-none shrink-0" />
                </div>
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
                      {analystPresentationLog.presentationItems.slice(0, 100).map((a: any, i: number) => {
                        if (a.isSummary) {
                          const isCrit = a.severity === "CRITICAL";
                          const isWarn = a.severity === "WARNING";
                          return (
                            <tr key={`tab-summary-${a.patternKey}-${i}`} className="bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40">
                              <td className="p-3 text-amber-600 font-mono font-bold">#{i + 1}</td>
                              <td className="p-3 font-bold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                                SUMMARY ({a.count} LOGS)
                              </td>
                              <td className="p-3 font-bold uppercase text-slate-700 dark:text-slate-300">
                                {a.sourceName || "S3 CLOUD BRIDGE"}
                              </td>
                              <td className="p-3 font-semibold text-[11px] text-slate-500 uppercase">
                                {a.systemName || selectedServerLabel}
                              </td>
                              <td className="p-3">
                                <Badge className={cn("text-[10px] font-bold uppercase", isCrit ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" : isWarn ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-blue-500/10 text-blue-500 border border-blue-500/20")}>
                                  {a.severity}
                                </Badge>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {a.firstFormattedTime && a.lastFormattedTime ? `${a.firstFormattedTime} → ${a.lastFormattedTime}` : "TELEMETRY WINDOW"}
                              </td>
                              <td className="p-3 text-slate-700 dark:text-slate-200 max-w-md font-medium">
                                <span className="font-bold text-amber-600">[REPEATED TELEMETRY x{a.count}]</span> {a.representativeCaption} — {a.representativeDescription}
                              </td>
                            </tr>
                          );
                        }

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

          {/* ============================================ */}
          {/* SERVER INCIDENT DETAIL                       */}
          {/* Consumes: serverUptimeSummary.serverResults  */}
          {/*           .outageSessions[]                  */}
          {/* NO NEW CALCULATION — display layer only      */}
          {/* ============================================ */}
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <Shield className="w-4 h-4 text-rose-500" /> SERVER INCIDENT DETAIL
                  </CardTitle>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Historical server outage incidents for the selected reporting period. Source: canonical server uptime calculator.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase">
                    {serverUptimeSummary.totalServerIncidents} TOTAL INCIDENTS
                  </Badge>
                  <Badge className="text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20 uppercase">
                    {serverUptimeSummary.totalServerDowntimeFormatted} TOTAL DOWNTIME
                  </Badge>
                  {serverUptimeSummary.dataCompleteness === "POTENTIALLY_TRUNCATED" && (
                    <Badge className="text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase">
                      ⚠ EVENT DATA POTENTIALLY TRUNCATED
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                  <span>LOADING SERVER INCIDENT DATA...</span>
                </div>
              ) : serverUptimeSummary.serverResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2 font-bold uppercase">
                  <Server className="w-8 h-8 text-slate-400" />
                  <span>NO SERVER DATA AVAILABLE FOR SELECTED PERIOD</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {serverUptimeSummary.serverResults.map((srvResult) => {
                    const matchSrv = servers.find(
                      (s: any) =>
                        cleanId(s.id || s.serverId || s.name) === cleanId(srvResult.serverId) ||
                        s.name === srvResult.serverName ||
                        (s._systemId && s._systemId === srvResult.serverId)
                    );
                    const isOfflinePlaceholder = Boolean(
                      (srvResult as any).isOfflinePlaceholder ||
                      matchSrv?.isOfflinePlaceholder ||
                      (srvResult.currentStatus === "offline" && matchSrv?.isOfflinePlaceholder)
                    );

                    // Sort outage sessions chronologically ascending — non-mutating copy
                    const sortedSessions = [...srvResult.outageSessions].sort(
                      (a, b) => a.startTimeMs - b.startTimeMs
                    );

                    return (
                      <div key={srvResult.serverId || srvResult.serverName} className="space-y-2">
                        {/* Per-server header */}
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-1.5 rounded-lg",
                              srvResult.currentStatus === "online"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-rose-500/10 text-rose-600"
                            )}>
                              <Server className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="text-[12px] font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                {srvResult.serverName || srvResult.serverId || "UNKNOWN SERVER"}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className={cn(
                                  "text-[9px] font-bold uppercase",
                                  srvResult.currentStatus === "online"
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                )}>
                                  {srvResult.currentStatus === "online" ? "ONLINE NOW" : "OFFLINE NOW"}
                                </Badge>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                  {isOfflinePlaceholder ? (
                                    "N/A INCIDENTS • N/A DOWNTIME • N/A — SERVER CURRENTLY OFFLINE / HISTORICAL UPTIME NOT AVAILABLE"
                                  ) : (
                                    `${srvResult.incidentCount} incident${srvResult.incidentCount !== 1 ? "s" : ""} • ${srvResult.totalDowntimeFormatted} downtime • ${srvResult.uptimeRate !== null ? `${srvResult.uptimeRate}% period uptime` : "N/A"}`
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Incident table for this server */}
                        {isOfflinePlaceholder ? (
                          <div className="py-4 text-center text-[11px] font-bold text-slate-400 uppercase">
                            SERVER CURRENTLY OFFLINE / HISTORICAL UPTIME NOT AVAILABLE
                          </div>
                        ) : sortedSessions.length === 0 ? (
                          <div className="py-4 text-center text-[11px] font-bold text-slate-400 uppercase">
                            NO OUTAGE INCIDENTS RECORDED FOR THIS SERVER IN THE SELECTED PERIOD
                          </div>
                        ) : (
                          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                  <th className="p-2.5">#</th>
                                  <th className="p-2.5">DATE</th>
                                  <th className="p-2.5">OFFLINE TIME</th>
                                  <th className="p-2.5">RECOVERY TIME</th>
                                  <th className="p-2.5">DURATION</th>
                                  <th className="p-2.5">STATUS</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {sortedSessions.map((sess, idx) => {
                                  // Format offline start timestamp
                                  const offlineDate = new Intl.DateTimeFormat("en-GB", {
                                    timeZone: "Asia/Jakarta",
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  }).format(new Date(sess.startTimeMs));
                                  const offlineTime = new Intl.DateTimeFormat("en-GB", {
                                    timeZone: "Asia/Jakarta",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                    hour12: false,
                                  }).format(new Date(sess.startTimeMs));

                                  // Format recovery timestamp
                                  const recoveryTime = sess.isActive
                                    ? null
                                    : new Intl.DateTimeFormat("en-GB", {
                                        timeZone: "Asia/Jakarta",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                        hour12: false,
                                      }).format(new Date(sess.endTimeMs));

                                  // Duration from canonical durationMs — no recalculation
                                  const durationDisplay = formatDuration(sess.durationMs);

                                  return (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                      <td className="p-2.5 font-bold text-slate-400">
                                        #{idx + 1}
                                      </td>
                                      <td className="p-2.5 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                        {offlineDate}
                                      </td>
                                      <td className="p-2.5 font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                                          <span>{offlineTime}</span>
                                        </div>
                                      </td>
                                      <td className="p-2.5 font-mono whitespace-nowrap">
                                        {sess.isActive ? (
                                          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase">
                                            ACTIVE / NOT RECOVERED
                                          </Badge>
                                        ) : (
                                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                            {recoveryTime}
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-2.5 font-mono font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                        {durationDisplay}
                                      </td>
                                      <td className="p-2.5">
                                        <Badge className={cn(
                                          "text-[9px] font-bold uppercase",
                                          sess.isActive
                                            ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                            : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                        )}>
                                          {sess.isActive ? "ACTIVE" : "RECOVERED"}
                                        </Badge>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
