"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  FileText,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  Camera,
  Video,
  Database,
  Activity,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  Cloud,
  Server,
  HardDrive,
  Shield,
  Zap,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  FileSpreadsheet,
  Cpu,
  MemoryStick
} from "lucide-react";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { useServers } from "@/hooks/useNxAPI-server";
import { useCloudSystemsWithOnline } from "@/hooks/use-cloud-systems-with-online";
import { useAlarmsQuery, useEventsQuery } from "@/hooks/use-nx-queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ============================================
// TYPES & INTERFACES
// ============================================
type ReportPeriod = "weekly" | "monthly" | "yearly" | "custom";
type ReportCategory = "all" | "cameras" | "recordings" | "health" | "alarms";

// ============================================
// HELPER: Build CSV string from section data
// ============================================
function buildCsvSection(title: string, headers: string[], rows: (string | number | undefined | null)[][]): string {
  const safeVal = (v: string | number | undefined | null) => {
    const s = String(v ?? "-").replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines: string[] = [
    `"=== ${title} ==="`,
    headers.map(safeVal).join(","),
    ...rows.map((r) => r.map(safeVal).join(",")),
    "",
  ];
  return lines.join("\n");
}

// ============================================
// HELPER: Build full-featured PDF HTML
// ============================================
function buildPdfHtml(opts: {
  systemLabel: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  cameras: any[];
  servers: any[];
  alarms: any[];
  events: any[];
  cloudSystems: any[];
  category: ReportCategory;
  onlineCameras: number;
  totalCameras: number;
  onlineServers: number;
  totalServers: number;
  criticalAlarms: number;
  warningAlarms: number;
  totalAlarms: number;
  cameraOnlineRate: number;
  serverOnlineRate: number;
}): string {
  const now = new Date().toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const periodLabel =
    opts.period === "weekly"
      ? "Mingguan"
      : opts.period === "monthly"
      ? "Bulanan"
      : opts.period === "yearly"
      ? "Tahunan"
      : "Custom";

  const showAll = opts.category === "all";
  const showCameras = showAll || opts.category === "cameras";
  const showHealth = showAll || opts.category === "health";
  const showAlarms = showAll || opts.category === "alarms";
  const showRecordings = showAll || opts.category === "recordings";

  const cameraRows = opts.cameras
    .map((cam: any, i: number) => {
      const isOnline = ["online", "Online", "recording", "Recording"].includes(String(cam.status));
      return `<tr>
        <td>${i + 1}</td>
        <td>${cam.name || `Kamera ${i + 1}`}</td>
        <td><span class="${isOnline ? "badge-online" : "badge-offline"}">${isOnline ? "Online" : "Offline"}</span></td>
        <td>${cam.ipAddr || cam.ip || cam.url || "-"}</td>
        <td>${[cam.vendor, cam.model].filter(Boolean).join(" / ") || cam.type || "NX Camera"}</td>
        <td>${cam.resolution || "-"}</td>
      </tr>`;
    })
    .join("");

  const serverRows = opts.servers
    .map((srv: any, i: number) => {
      const isOnline = ["online", "Online"].includes(String(srv.status ?? srv.stateOfHealth ?? ""));
      const cpuUsage = srv.cpuUsagePercent ?? srv.cpuUsage ?? srv.cpu ?? "-";
      const ramTotal = srv.ramUsageMb || srv.totalRamMb || "-";
      const storageTotal = srv.hddList?.length ?? srv.storages?.length ?? "-";
      return `<tr>
        <td>${i + 1}</td>
        <td>${srv.name || `Server ${i + 1}`}</td>
        <td><span class="${isOnline ? "badge-online" : "badge-offline"}">${isOnline ? "Online" : "Offline"}</span></td>
        <td>${srv.version || srv.softwareVersion || "-"}</td>
        <td>${cpuUsage !== "-" ? `${cpuUsage}%` : "-"}</td>
        <td>${ramTotal !== "-" ? `${ramTotal} MB` : "-"}</td>
        <td>${storageTotal !== "-" ? `${storageTotal} disk(s)` : "-"}</td>
      </tr>`;
    })
    .join("");

  const alarmSource = opts.alarms.length > 0 ? opts.alarms : opts.events;
  const alarmRows = alarmSource
    .slice(0, 200)
    .map((a: any, i: number) => {
      const sev = String(a.level ?? a.severity ?? a.type ?? "-");
      const sevClass = ["error", "critical", "fatal"].includes(sev.toLowerCase())
        ? "badge-offline"
        : ["warning", "warn"].includes(sev.toLowerCase())
        ? "badge-warning"
        : "badge-info";
      const ts = a.timestampMs || a.eventTimestampUsec
        ? new Date(
            a.timestampMs ?? Math.floor(a.eventTimestampUsec / 1000)
          ).toLocaleString("id-ID")
        : a.createdAt || a.timestamp || "-";
      return `<tr>
        <td>${i + 1}</td>
        <td>${a.name || a.caption || a.source || "-"}</td>
        <td><span class="${sevClass}">${sev}</span></td>
        <td>${ts}</td>
        <td>${a.description || a.resourceName || "-"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Laporan NX Cloud — ${opts.systemLabel}</title>
  <style>
    @page { size: A4; margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; }
    .report-header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 20px 24px; margin-bottom: 20px; border-radius: 6px; display: flex; justify-content: space-between; align-items: flex-start; }
    .report-header h1 { font-size: 20px; font-weight: 700; }
    .report-header p { font-size: 11px; opacity: 0.85; margin-top: 3px; }
    .report-header .meta { text-align: right; font-size: 10px; opacity: 0.8; }
    .report-header .meta strong { display: block; font-size: 12px; opacity: 1; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 13px; font-weight: 700; color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 4px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .metric-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center; background: #f8fafc; }
    .metric-card .value { font-size: 22px; font-weight: 800; color: #1e293b; }
    .metric-card .label { font-size: 10px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-card.blue .value { color: #2563eb; }
    .metric-card.green .value { color: #16a34a; }
    .metric-card.amber .value { color: #d97706; }
    .metric-card.red .value { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #1e40af; color: white; padding: 7px 8px; text-align: left; font-weight: 600; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; color: #374151; }
    tr:nth-child(even) td { background: #f8fafc; }
    .badge-online { background: #dcfce7; color: #16a34a; padding: 2px 6px; border-radius: 10px; font-weight: 600; font-size: 9px; }
    .badge-offline { background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 10px; font-weight: 600; font-size: 9px; }
    .badge-warning { background: #fef3c7; color: #d97706; padding: 2px 6px; border-radius: 10px; font-weight: 600; font-size: 9px; }
    .badge-info { background: #dbeafe; color: #2563eb; padding: 2px 6px; border-radius: 10px; font-weight: 600; font-size: 9px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 9px; color: #94a3b8; }
    .summary-bar { display: flex; gap: 8px; margin-bottom: 20px; }
    .summary-item { flex: 1; background: #f1f5f9; border-radius: 6px; padding: 10px 12px; border-left: 3px solid #3b82f6; }
    .summary-item.green { border-left-color: #16a34a; }
    .summary-item.amber { border-left-color: #d97706; }
    .summary-item .s-val { font-size: 18px; font-weight: 800; }
    .summary-item .s-label { font-size: 9px; color: #64748b; text-transform: uppercase; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="report-header">
    <div>
      <h1>📊 Laporan Sistem NX Cloud</h1>
      <p>Sistem: ${opts.systemLabel} &nbsp;|&nbsp; Periode: ${periodLabel} (${opts.dateFrom} – ${opts.dateTo})</p>
      <p style="margin-top:6px; font-size:10px; opacity:0.7;">Laporan ini dibuat otomatis dari data real-time NX Cloud VMS</p>
    </div>
    <div class="meta">
      <strong>Dibuat:</strong>
      ${now}
    </div>
  </div>

  <!-- METRICS SUMMARY -->
  <div class="metrics-grid">
    <div class="metric-card blue">
      <div class="value">${opts.cameraOnlineRate}%</div>
      <div class="label">Camera Uptime</div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">${opts.onlineCameras} / ${opts.totalCameras} Aktif</div>
    </div>
    <div class="metric-card green">
      <div class="value">${opts.serverOnlineRate}%</div>
      <div class="label">Server Health</div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">${opts.onlineServers} / ${opts.totalServers} Server Online</div>
    </div>
    <div class="metric-card amber">
      <div class="value">${opts.totalAlarms}</div>
      <div class="label">Total Alarm Events</div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">${opts.criticalAlarms} Critical, ${opts.warningAlarms} Warning</div>
    </div>
    <div class="metric-card red">
      <div class="value">${opts.totalCameras - opts.onlineCameras}</div>
      <div class="label">Kamera Offline</div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">Perlu pengecekan</div>
    </div>
  </div>

  ${showCameras && opts.cameras.length > 0 ? `
  <!-- CAMERA TABLE -->
  <div class="section">
    <div class="section-title">📹 Laporan Kamera (${opts.cameras.length} unit)</div>
    <table>
      <thead><tr>
        <th>#</th><th>Nama Kamera</th><th>Status</th><th>IP Address</th><th>Vendor / Model</th><th>Resolusi</th>
      </tr></thead>
      <tbody>${cameraRows}</tbody>
    </table>
  </div>
  ` : ""}

  ${showHealth && opts.servers.length > 0 ? `
  <!-- SERVER / HEALTH TABLE -->
  <div class="section">
    <div class="section-title">🖥️ Laporan Server & System Health (${opts.servers.length} server)</div>
    <table>
      <thead><tr>
        <th>#</th><th>Nama Server</th><th>Status</th><th>Versi Software</th><th>CPU</th><th>RAM</th><th>Storage Disk</th>
      </tr></thead>
      <tbody>${serverRows}</tbody>
    </table>
  </div>
  ` : ""}

  ${showAlarms && alarmSource.length > 0 ? `
  <!-- ALARMS TABLE -->
  <div class="section">
    <div class="section-title">🚨 Laporan Alarm & Events (${alarmSource.length} kejadian)</div>
    <table>
      <thead><tr>
        <th>#</th><th>Nama / Sumber</th><th>Severity</th><th>Waktu</th><th>Deskripsi</th>
      </tr></thead>
      <tbody>${alarmRows}</tbody>
    </table>
    ${alarmSource.length > 200 ? `<p style="font-size:9px;color:#94a3b8;margin-top:6px;">* Menampilkan 200 dari ${alarmSource.length} kejadian</p>` : ""}
  </div>
  ` : ""}

  ${showRecordings && opts.servers.length > 0 ? `
  <!-- RECORDINGS / STORAGE TABLE -->
  <div class="section">
    <div class="section-title">💾 Laporan Rekaman & Storage per Server</div>
    <table>
      <thead><tr>
        <th>#</th><th>Nama Server</th><th>Status</th><th>Jumlah Disk / Storage</th><th>Total Storage</th>
      </tr></thead>
      <tbody>
        ${opts.servers.map((srv: any, i: number) => {
          const isOnline = ["online", "Online"].includes(String(srv.status ?? srv.stateOfHealth ?? ""));
          const diskCount = srv.hddList?.length ?? srv.storages?.length ?? "-";
          const totalStorageMb = (srv.hddList || srv.storages || []).reduce(
            (sum: number, d: any) => sum + (d.totalSpaceMb || d.totalSpace || 0), 0
          );
          const totalStorageLabel = totalStorageMb > 0 ? `${(totalStorageMb / 1024).toFixed(1)} GB` : "-";
          return `<tr>
            <td>${i + 1}</td>
            <td>${srv.name || `Server ${i + 1}`}</td>
            <td><span class="${isOnline ? "badge-online" : "badge-offline"}">${isOnline ? "Online" : "Offline"}</span></td>
            <td>${diskCount}</td>
            <td>${totalStorageLabel}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>
  ` : ""}

  <!-- FOOTER -->
  <div class="footer">
    <p>Dokumen ini dibuat otomatis oleh Hotware Cloud Dashboard &nbsp;|&nbsp; ${now}</p>
    <p>Data bersumber dari NX Cloud VMS secara real-time &nbsp;|&nbsp; Sistem: ${opts.systemLabel}</p>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
}

export default function ReportingManagement() {
  // State variables
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [category, setCategory] = useState<ReportCategory>("all");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);

  // Fetch live system data (using existing API hooks)
  const activeSystemId = selectedSystemId !== "all" ? selectedSystemId : undefined;
  const { cloudSystems, loadingCloud: loadingCloudSystems, refetchCloudSystems } = useCloudSystemsWithOnline();
  const { cameras, loading: loadingCameras, refetch: refetchCameras } = useCameras(activeSystemId);
  const { servers, loading: loadingServers, refetch: refetchServers } = useServers(activeSystemId);
  const { alarms, loading: loadingAlarms, refetch: refetchAlarms } = useAlarmsQuery();
  const { events, loading: loadingEvents, refetch: refetchEvents } = useEventsQuery(200);

  // Preset Date range handler
  const handlePeriodChange = (newPeriod: ReportPeriod) => {
    setPeriod(newPeriod);
    const today = new Date();
    let from = new Date();

    if (newPeriod === "weekly") {
      from.setDate(today.getDate() - 7);
    } else if (newPeriod === "monthly") {
      from.setDate(today.getDate() - 30);
    } else if (newPeriod === "yearly") {
      from.setFullYear(today.getFullYear() - 1);
    }

    if (newPeriod !== "custom") {
      setDateFrom(from.toISOString().split("T")[0]);
      setDateTo(today.toISOString().split("T")[0]);
    }
  };

  // Real Metrics Calculation
  const totalCameras = cameras?.length || 0;
  const onlineCameras = cameras?.filter((c: any) =>
    ["online", "Online", "recording", "Recording"].includes(String(c.status))
  ).length || 0;
  const cameraOnlineRate = totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 100) : 0;

  const totalServers = servers?.length || 0;
  const onlineServers = servers?.filter((s: any) =>
    ["online", "Online"].includes(String(s.status ?? s.stateOfHealth ?? ""))
  ).length || 0;
  const serverOnlineRate = totalServers > 0 ? Math.round((onlineServers / totalServers) * 100) : 0;

  const alarmList = Array.isArray(alarms) ? alarms : [];
  const eventList = Array.isArray(events) ? events : [];
  const totalAlarms = alarmList.length || eventList.length;
  const criticalAlarms = alarmList.filter((a: any) =>
    ["error", "critical", "fatal"].includes(String(a.level ?? a.severity ?? "").toLowerCase())
  ).length;
  const warningAlarms = alarmList.filter((a: any) =>
    ["warning", "warn"].includes(String(a.level ?? a.severity ?? "").toLowerCase())
  ).length;

  // Server storage aggregation (real data)
  const serverStorageStats = useMemo(() => {
    if (!servers || servers.length === 0) return [];
    return servers.map((srv: any) => {
      const diskList: any[] = srv.hddList || srv.storages || [];
      const totalMb = diskList.reduce((sum: number, d: any) => sum + (d.totalSpaceMb || d.totalSpace || 0), 0);
      const usedMb = diskList.reduce((sum: number, d: any) => sum + (d.reservedSpaceMb || d.usedSpace || 0), 0);
      const freeMb = totalMb - usedMb;
      const usedPct = totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0;
      return {
        name: srv.name || "Server",
        isOnline: ["online", "Online"].includes(String(srv.status ?? srv.stateOfHealth ?? "")),
        totalGb: (totalMb / 1024).toFixed(1),
        usedGb: (usedMb / 1024).toFixed(1),
        freeGb: (freeMb / 1024).toFixed(1),
        usedPct,
        diskCount: diskList.length,
        cpu: srv.cpuUsagePercent ?? srv.cpuUsage ?? null,
        ramUsedMb: srv.ramUsageMb ?? null,
        ramTotalMb: srv.totalRamMb ?? null,
        version: srv.version || srv.softwareVersion || "-",
        osName: srv.osName || "-",
      };
    });
  }, [servers]);

  // Aggregate breakdown trends based on real live data
  const trendData = useMemo(() => {
    const liveCam = onlineCameras;
    const liveAlarms = totalAlarms;
    const liveHealth = serverOnlineRate;

    if (period === "weekly") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return {
          label: d.toLocaleDateString("id-ID", { weekday: "short" }),
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
    } else if (period === "custom") {
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      if (diffDays <= 14) {
        return Array.from({ length: diffDays }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          return {
            label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
            cameras: liveCam,
            alarms: Math.round(liveAlarms / diffDays),
            healthScore: liveHealth || 100,
          };
        });
      } else {
        const steps = Math.min(6, diffDays);
        const stepSize = Math.floor(diffDays / steps);
        return Array.from({ length: steps }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i * stepSize);
          return {
            label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
            cameras: liveCam,
            alarms: Math.round(liveAlarms / steps),
            healthScore: liveHealth || 100,
          };
        });
      }
    } else {
      return ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4"].map((w) => ({
        label: w,
        cameras: liveCam,
        alarms: Math.round(liveAlarms / 4),
        healthScore: liveHealth || 100,
      }));
    }
  }, [period, dateFrom, dateTo, onlineCameras, totalAlarms, serverOnlineRate]);

  // ============================================
  // SYSTEM LABEL HELPER
  // ============================================
  const systemLabel = useMemo(() => {
    if (selectedSystemId === "all") return "Semua Cloud System";
    const sys = cloudSystems.find((s) => s.id === selectedSystemId);
    return sys?.name || selectedSystemId;
  }, [selectedSystemId, cloudSystems]);

  // ============================================
  // EXPORT CSV — Real-time NX Cloud Data
  // ============================================
  const exportCSV = useCallback(() => {
    setIsExporting(true);
    try {
      const metaHeader = [
        `"Laporan NX Cloud VMS — Hotware Dashboard"`,
        `"Dibuat: ${new Date().toLocaleString("id-ID")}"`,
        `"Sistem: ${systemLabel}"`,
        `"Periode: ${period} (${dateFrom} s/d ${dateTo})"`,
        "",
      ].join("\n");

      const sections: string[] = [metaHeader];

      // SECTION: Cameras
      if (category === "all" || category === "cameras") {
        const cams = Array.isArray(cameras) ? cameras : [];
        const camRows = cams.map((cam: any) => {
          const isOnline = ["online", "Online", "recording", "Recording"].includes(String(cam.status));
          return [
            cam.name || "-",
            isOnline ? "Online" : "Offline",
            cam.ipAddr || cam.ip || cam.url || "-",
            cam.vendor || "-",
            cam.model || cam.type || "NX Camera",
            cam.resolution || "-",
            cam.fps ? `${cam.fps} fps` : "-",
            cam.id || "-",
          ];
        });
        sections.push(
          buildCsvSection(
            "DATA KAMERA REAL-TIME",
            ["Nama Kamera", "Status", "IP Address", "Vendor", "Model", "Resolusi", "FPS", "Camera ID"],
            camRows
          )
        );
      }

      // SECTION: Servers / Health
      if (category === "all" || category === "health") {
        const srvs = Array.isArray(servers) ? servers : [];
        const srvRows = srvs.map((srv: any) => {
          const isOnline = ["online", "Online"].includes(String(srv.status ?? srv.stateOfHealth ?? ""));
          const diskList: any[] = srv.hddList || srv.storages || [];
          const totalMb = diskList.reduce((sum: number, d: any) => sum + (d.totalSpaceMb || 0), 0);
          return [
            srv.name || "-",
            isOnline ? "Online" : "Offline",
            srv.version || srv.softwareVersion || "-",
            srv.osName || "-",
            srv.cpuUsagePercent != null ? `${srv.cpuUsagePercent}%` : "-",
            srv.ramUsageMb != null ? `${srv.ramUsageMb} MB` : "-",
            srv.totalRamMb != null ? `${srv.totalRamMb} MB` : "-",
            diskList.length > 0 ? diskList.length : "-",
            totalMb > 0 ? `${(totalMb / 1024).toFixed(1)} GB` : "-",
            srv.id || "-",
          ];
        });
        sections.push(
          buildCsvSection(
            "DATA SERVER & SYSTEM HEALTH REAL-TIME",
            [
              "Nama Server", "Status", "Versi NX", "OS", "CPU Usage",
              "RAM Digunakan", "RAM Total", "Jumlah Disk", "Total Storage", "Server ID"
            ],
            srvRows
          )
        );
      }

      // SECTION: Alarms / Events
      if (category === "all" || category === "alarms") {
        const alarmSource = alarmList.length > 0 ? alarmList : eventList;
        const alarmRows = alarmSource.map((a: any) => {
          const ts = a.timestampMs
            ? new Date(a.timestampMs).toLocaleString("id-ID")
            : a.eventTimestampUsec
            ? new Date(Math.floor(a.eventTimestampUsec / 1000)).toLocaleString("id-ID")
            : a.createdAt || a.timestamp || "-";
          return [
            a.name || a.caption || a.source || "-",
            a.level ?? a.severity ?? a.type ?? "-",
            ts,
            a.description || a.resourceName || "-",
            a.id || "-",
          ];
        });
        sections.push(
          buildCsvSection(
            `DATA ALARM & EVENTS REAL-TIME (${alarmSource.length} kejadian)`,
            ["Nama / Sumber", "Severity / Level", "Waktu Kejadian", "Deskripsi", "Event ID"],
            alarmRows
          )
        );
      }

      // SECTION: Cloud Systems
      if (category === "all") {
        const sysRows = cloudSystems.map((sys) => [
          sys.name || "-",
          sys.isOnline ? "Online" : "Offline",
          sys.stateOfHealth || "-",
          sys.id || "-",
        ]);
        sections.push(
          buildCsvSection(
            "DAFTAR CLOUD SYSTEMS",
            ["Nama System", "Status Online", "State of Health", "System ID"],
            sysRows
          )
        );
      }

      const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(sections.join("\n"));
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute(
        "download",
        `NXCloud_Report_${category}_${selectedSystemId}_${dateFrom}_to_${dateTo}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("[ReportingManagement] CSV export error:", err);
    } finally {
      setIsExporting(false);
    }
  }, [
    cameras, servers, alarms, events, cloudSystems,
    category, period, dateFrom, dateTo, systemLabel, selectedSystemId,
    alarmList, eventList,
  ]);

  // ============================================
  // EXPORT PDF — Real-time NX Cloud, Popup Window
  // ============================================
  const handlePrint = useCallback(() => {
    setIsPdfLoading(true);
    try {
      const html = buildPdfHtml({
        systemLabel,
        period,
        dateFrom,
        dateTo,
        cameras: Array.isArray(cameras) ? cameras : [],
        servers: Array.isArray(servers) ? servers : [],
        alarms: alarmList,
        events: eventList,
        cloudSystems,
        category,
        onlineCameras,
        totalCameras,
        onlineServers,
        totalServers,
        criticalAlarms,
        warningAlarms,
        totalAlarms,
        cameraOnlineRate,
        serverOnlineRate,
      });

      const printWindow = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
      if (!printWindow) {
        console.warn("[ReportingManagement] Popup blocked. Please allow popups for this site.");
        // Fallback: create blob URL
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `NXCloud_Report_${dateFrom}_to_${dateTo}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      console.error("[ReportingManagement] PDF print error:", err);
    } finally {
      setTimeout(() => setIsPdfLoading(false), 1500);
    }
  }, [
    systemLabel, period, dateFrom, dateTo,
    cameras, servers, alarmList, eventList, cloudSystems, category,
    onlineCameras, totalCameras, onlineServers, totalServers,
    criticalAlarms, warningAlarms, totalAlarms, cameraOnlineRate, serverOnlineRate,
  ]);

  // Auto-refresh interval state (Default 5s Realtime polling)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5000);

  // Refresh all data
  const handleRefresh = useCallback(() => {
    refetchCloudSystems();
    refetchCameras();
    refetchServers();
    refetchAlarms();
    refetchEvents();
  }, [refetchCloudSystems, refetchCameras, refetchServers, refetchAlarms, refetchEvents]);

  // Realtime polling effect
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      handleRefresh();
    }, autoRefreshInterval);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, handleRefresh]);

  const isLoading = loadingCloudSystems || loadingCameras || loadingServers || loadingAlarms;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-6 select-none pb-12 print:p-0 print:space-y-4">
      {/* ============================================ */}
      {/* HEADER BAR & QUICK ACTIONS                   */}
      {/* ============================================ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800 print:hidden">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20 shadow-sm">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Reports & Analytics
              </h1>
              <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[11px] font-semibold flex items-center gap-1.5">
                {autoRefreshInterval > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
                <span>Executive Reporting</span>
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Data real-time dari akun NX Cloud — Kamera, Server, Alarms &amp; System Health
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Realtime Interval Selector */}
          <Select
            value={String(autoRefreshInterval)}
            onValueChange={(val) => setAutoRefreshInterval(Number(val))}
          >
            <SelectTrigger className="h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500">
              <div className="flex items-center gap-2">
                {autoRefreshInterval > 0 ? (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : (
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <SelectValue placeholder="Auto Refresh" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
              <SelectItem value="0" className="text-xs">
                Auto-Refresh: Matikan (Manual)
              </SelectItem>
              <SelectItem value="5000" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ⚡ Realtime (Setiap 5 dtk)
              </SelectItem>
              <SelectItem value="10000" className="text-xs">
                ⏱️ Setiap 10 dtk
              </SelectItem>
              <SelectItem value="30000" className="text-xs">
                ⏱️ Setiap 30 dtk
              </SelectItem>
              <SelectItem value="60000" className="text-xs">
                ⏱️ Setiap 1 mnt
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-9 px-3 gap-2 bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
          >
            <RefreshCw className={cn("w-4 h-4 text-blue-400", isLoading && "animate-spin")} />
            <span className="text-xs font-semibold">Refresh Data</span>
          </Button>

          {/* Export CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={isExporting || isLoading}
            className="h-9 px-3 gap-2 bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 hover:border-emerald-500 transition-all rounded-xl"
          >
            {isExporting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            )}
            <span className="text-xs font-semibold">
              {isExporting ? "Mengambil Data..." : "Export CSV"}
            </span>
          </Button>

          {/* Export PDF / Print Button */}
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={isPdfLoading || isLoading}
            className="h-9 px-4 gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-md shadow-blue-500/20 rounded-xl"
          >
            {isPdfLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span className="text-xs">
              {isPdfLoading ? "Menyiapkan PDF..." : "Print / Export PDF"}
            </span>
          </Button>
        </div>
      </div>

      {/* ============================================ */}
      {/* FILTER CONTROL BAR                           */}
      {/* ============================================ */}
      <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm print:hidden">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">

            {/* Period Filter Switcher Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" /> Rentang:
              </span>
              {(["weekly", "monthly", "yearly", "custom"] as ReportPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    period === p
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                  )}
                >
                  {p === "weekly" ? "Mingguan" : p === "monthly" ? "Bulanan" : p === "yearly" ? "Tahunan" : "Custom"}
                </button>
              ))}
            </div>

            {/* System Filter Selector */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedSystemId} onValueChange={setSelectedSystemId}>
                <SelectTrigger className="w-full sm:w-[220px] h-9 text-xs rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <Cloud className="h-3.5 w-3.5 mr-2 text-blue-500 shrink-0" />
                  <SelectValue placeholder="Semua Cloud System..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                  <SelectItem value="all" className="text-xs font-medium">Semua Cloud System</SelectItem>
                  {cloudSystems.map((sys) => (
                    <SelectItem key={sys.id} value={sys.id} className="text-xs">
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

          {/* Date Pickers & Category Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {/* Category Switcher */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">Kategori Export:</span>
              {([
                { key: "all", label: "Semua Data", icon: null },
                { key: "cameras", label: `Kamera (${totalCameras})`, icon: <Camera className="w-3 h-3 text-blue-400" /> },
                { key: "recordings", label: "Rekaman & Storage", icon: <Video className="w-3 h-3 text-indigo-400" /> },
                { key: "health", label: "System Health", icon: <Activity className="w-3 h-3 text-emerald-400" /> },
                { key: "alarms", label: `Alarms (${totalAlarms})`, icon: <AlertTriangle className="w-3 h-3 text-amber-400" /> },
              ] as { key: ReportCategory; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5",
                    category === key
                      ? key === "all"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent shadow-sm"
                        : key === "cameras"
                        ? "bg-blue-600 text-white border-transparent shadow-sm"
                        : key === "recordings"
                        ? "bg-indigo-600 text-white border-transparent shadow-sm"
                        : key === "health"
                        ? "bg-emerald-600 text-white border-transparent shadow-sm"
                        : "bg-amber-600 text-white border-transparent shadow-sm"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            {/* Date Inputs */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all",
                period === "custom"
                  ? "bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700"
              )}>
                <span className="text-[11px] text-slate-400 font-medium">Dari:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPeriod("custom");
                  }}
                  className="bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                />
              </div>
              <span className="text-slate-400 text-xs">-</span>
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all",
                period === "custom"
                  ? "bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700"
              )}>
                <span className="text-[11px] text-slate-400 font-medium">Sampai:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPeriod("custom");
                  }}
                  className="bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Data Source Info Banner */}
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded-xl text-[11px] text-blue-600 dark:text-blue-400">
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>Data Real-Time NX Cloud:</strong> CSV &amp; PDF akan mengandung data langsung dari akun NX Cloud yang login —{" "}
              <strong>{totalCameras} kamera</strong>, <strong>{totalServers} server</strong>, <strong>{totalAlarms} alarm events</strong>
              {selectedSystemId !== "all" && <span> — Sistem: <strong>{systemLabel}</strong></span>}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* STAT METRIC SUMMARY CARDS                    */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Camera Online Rate */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-500" /> Camera Uptime Rate
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{cameraOnlineRate}%</span>
                {cameraOnlineRate >= 90 ? (
                  <span className="text-xs font-medium text-emerald-500 flex items-center">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Optimal
                  </span>
                ) : (
                  <span className="text-xs font-medium text-rose-500 flex items-center">
                    <ArrowDownRight className="w-3.5 h-3.5" /> Perlu Cek
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{onlineCameras} dari {totalCameras} Kamera Aktif</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
              <Camera className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Storage from real servers */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-500" /> Storage Servers
              </span>
              <div className="flex items-baseline gap-2">
                {serverStorageStats.length > 0 ? (
                  <>
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {serverStorageStats.length}
                    </span>
                    <span className="text-xs font-medium text-indigo-400">
                      Server Terdaftar
                    </span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-slate-400">—</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {serverStorageStats.filter(s => s.diskCount > 0).length} server dengan data storage
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-500">
              <Database className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: System Health Uptime */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-500" /> Server Health Index
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{serverOnlineRate}%</span>
                <span className="text-xs font-medium text-emerald-500 flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {onlineServers}/{totalServers} Online
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{onlineServers} Server Online dari {totalServers} total</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
              <Server className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Total Security Incidents */}
        <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Alarm Events
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalAlarms}</span>
                <span className="text-xs font-medium text-rose-400 flex items-center">
                  <AlertCircle className="w-3.5 h-3.5 mr-0.5" /> {criticalAlarms} Critical
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{warningAlarms} Warning, {totalAlarms - criticalAlarms - warningAlarms} Info</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================ */}
      {/* REPORT SECTIONS TABS                         */}
      {/* ============================================ */}
      <Tabs defaultValue="overview" className="w-full space-y-4">
        <TabsList className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-1 rounded-2xl print:hidden">
          <TabsTrigger value="overview" className="rounded-xl text-xs font-semibold gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <BarChart3 className="w-3.5 h-3.5" /> Ringkasan Trend
          </TabsTrigger>
          <TabsTrigger value="cameras" className="rounded-xl text-xs font-semibold gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Camera className="w-3.5 h-3.5" /> Laporan Kamera
          </TabsTrigger>
          <TabsTrigger value="recordings" className="rounded-xl text-xs font-semibold gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Video className="w-3.5 h-3.5" /> Rekaman &amp; Storage
          </TabsTrigger>
          <TabsTrigger value="alarms" className="rounded-xl text-xs font-semibold gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <AlertTriangle className="w-3.5 h-3.5" /> Laporan Alarm Events
          </TabsTrigger>
          <TabsTrigger value="health" className="rounded-xl text-xs font-semibold gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Activity className="w-3.5 h-3.5" /> Laporan System Health
          </TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* TAB 1: EXECUTIVE SUMMARY OVERVIEW            */}
        {/* ============================================ */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Visual Trend Chart */}
            <Card className="lg:col-span-2 bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      Grafik Trend Performa ({period === "weekly" ? "Mingguan" : period === "yearly" ? "Tahunan" : "Bulanan"})
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      Berdasarkan data real-time kamera aktif vs kejadian alarm dari NX Cloud
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-mono border-slate-300 dark:border-slate-700">
                    {dateFrom} - {dateTo}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-6">
                  {trendData.map((item, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>{item.label}</span>
                        <div className="flex items-center gap-4 text-[11px] font-mono">
                          <span className="text-blue-500">{item.cameras} Kamera Aktif</span>
                          <span className="text-amber-500">{item.alarms} Alarm Events</span>
                          <span className="text-emerald-500">{item.healthScore}% Server Health</span>
                        </div>
                      </div>
                      <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${Math.min(100, (item.cameras / Math.max(totalCameras, 1)) * 100)}%` }}
                          className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full rounded-l-full"
                        />
                        <div
                          style={{ width: `${Math.min(30, (item.alarms / Math.max(totalAlarms, 1)) * 30)}%` }}
                          className="bg-amber-500 h-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-500 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" /> Kamera Online Rate
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" /> Alarm Trigger Frequency
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Health & Status Highlights */}
            <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Ringkasan Integritas Sistem
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Status real-time dari NX Cloud
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 space-y-4">
                <div className={cn(
                  "p-3 rounded-xl border space-y-1",
                  cameraOnlineRate >= 90
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : cameraOnlineRate >= 70
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-rose-500/10 border-rose-500/20"
                )}>
                  <div className={cn(
                    "flex items-center justify-between text-xs font-bold",
                    cameraOnlineRate >= 90 ? "text-emerald-600 dark:text-emerald-400"
                      : cameraOnlineRate >= 70 ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}>
                    <span>Camera Uptime Rate</span>
                    <span>{cameraOnlineRate}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {onlineCameras} kamera aktif dari {totalCameras} total unit.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Kamera Terputus:</span>
                    <span className={cn("font-semibold", (totalCameras - onlineCameras) > 0 ? "text-rose-500" : "text-emerald-500")}>
                      {totalCameras - onlineCameras} Unit
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Server Online:</span>
                    <span className="font-semibold text-emerald-500">{onlineServers} / {totalServers}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Critical Alarms:</span>
                    <span className={cn("font-semibold", criticalAlarms > 0 ? "text-rose-500" : "text-emerald-500")}>
                      {criticalAlarms} Kejadian
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Warning Alarms:</span>
                    <span className={cn("font-semibold", warningAlarms > 0 ? "text-amber-500" : "text-emerald-500")}>
                      {warningAlarms} Alerts
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Cloud Systems Terdaftar:</span>
                    <span className="font-semibold text-blue-400">{cloudSystems.length} System</span>
                  </div>
                </div>

                <Separator className="dark:bg-slate-800" />

                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Semua data disinkronkan real-time dari akun NX Cloud yang sedang login.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 2: CAMERA INVENTORY REPORT               */}
        {/* ============================================ */}
        <TabsContent value="cameras" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-500" /> Detailed Camera Status &amp; Vendor Distribution
                </span>
                <Badge variant="outline" className="text-xs font-normal">
                  Total: {totalCameras} | Online: {onlineCameras} | Offline: {totalCameras - onlineCameras}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCameras ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Memuat data kamera dari NX Cloud...</span>
                </div>
              ) : !cameras || cameras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                  <Camera className="w-8 h-8 text-slate-500" />
                  <span>Tidak ada data kamera ditemukan dari NX Cloud.</span>
                  <span className="text-xs text-slate-400">Pastikan sistem NX Cloud sudah terhubung.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Nama Kamera</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3">Vendor / Model</th>
                        <th className="p-3">Resolusi / FPS</th>
                        <th className="p-3 text-right">Uptime</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {cameras.map((cam: any, index: number) => {
                        const isCamOnline = ["online", "Online", "recording", "Recording"].includes(String(cam.status));
                        return (
                          <tr key={cam.id || index} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 text-slate-400 font-mono">{index + 1}</td>
                            <td className="p-3 font-semibold text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span>{cam.name || `Kamera ${index + 1}`}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge className={cn("text-[10px] capitalize font-bold", isCamOnline ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20")}>
                                {isCamOnline ? "🟢 Online" : "🔴 Offline"}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-slate-500">{cam.ipAddr || cam.ip || cam.url || "-"}</td>
                            <td className="p-3">{[cam.vendor, cam.model].filter(Boolean).join(" / ") || cam.type || "NX Camera"}</td>
                            <td className="p-3 font-mono">{cam.resolution ? `${cam.resolution}${cam.fps ? ` @ ${cam.fps}fps` : ""}` : "-"}</td>
                            <td className="p-3 text-right font-bold">
                              <span className={isCamOnline ? "text-emerald-500" : "text-rose-500"}>
                                {isCamOnline ? "100%" : "0%"}
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
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 3: RECORDINGS & STORAGE REPORT           */}
        {/* (DATA REAL dari servers NX Cloud)            */}
        {/* ============================================ */}
        <TabsContent value="recordings" className="space-y-4">
          {loadingServers ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
              <span>Memuat data storage dari NX Cloud...</span>
            </div>
          ) : serverStorageStats.length === 0 ? (
            <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                <Database className="w-10 h-10 text-slate-500" />
                <p className="font-medium">Tidak ada data storage ditemukan</p>
                <p className="text-xs">Pilih Cloud System tertentu atau pastikan server NX Cloud terhubung.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Storage Summary Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-indigo-500" /> Laporan Konsumsi Storage per Server
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Data real-time dari {serverStorageStats.length} server NX Cloud
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-4">
                    {serverStorageStats.map((srv, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", srv.isOnline ? "bg-emerald-500" : "bg-slate-400")} />
                            <span>{srv.name}</span>
                            {srv.diskCount > 0 && (
                              <Badge variant="outline" className="text-[9px] font-normal">
                                {srv.diskCount} disk
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono">
                            {srv.usedGb !== "0.0" ? `${srv.usedGb} GB / ${srv.totalGb} GB` : "—"}
                            {srv.usedPct > 0 && <span className="text-slate-400 ml-1">({srv.usedPct}%)</span>}
                          </span>
                        </div>
                        <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          {srv.usedPct > 0 ? (
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                srv.usedPct > 85 ? "bg-rose-500" : srv.usedPct > 65 ? "bg-amber-500" : "bg-indigo-500"
                              )}
                              style={{ width: `${srv.usedPct}%` }}
                            />
                          ) : (
                            <div className="h-full bg-slate-200 dark:bg-slate-700 rounded-full w-full opacity-50" />
                          )}
                        </div>
                        {srv.usedPct === 0 && (
                          <p className="text-[10px] text-slate-400">Data storage tidak tersedia dari API untuk server ini</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-blue-500" /> Detail Server &amp; Versi Software
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Informasi versi NX VMS dan OS dari setiap server
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-3">
                    {serverStorageStats.map((srv, i) => (
                      <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-slate-500" />
                            {srv.name}
                          </span>
                          <Badge className={cn("text-[10px]", srv.isOnline ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20")}>
                            {srv.isOnline ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>Versi NX: <strong className="text-slate-700 dark:text-slate-300">{srv.version}</strong></span>
                          <span>OS: <strong className="text-slate-700 dark:text-slate-300">{srv.osName}</strong></span>
                          <span>Disks: <strong className="text-slate-700 dark:text-slate-300">{srv.diskCount || "-"}</strong></span>
                          <span>Free: <strong className="text-slate-700 dark:text-slate-300">{srv.freeGb !== "0.0" ? `${srv.freeGb} GB` : "-"}</strong></span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 4: ALARMS & INCIDENTS REPORT             */}
        {/* ============================================ */}
        <TabsContent value="alarms" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Ringkasan Kejadian Alarm ({period})
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Data real-time dari NX Cloud — {totalAlarms} total kejadian
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1">
                  <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Critical Faults</span>
                  <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{criticalAlarms} Incidents</div>
                  <p className="text-[11px] text-slate-500">Level: error / critical / fatal</p>
                </div>
                <div className="p-4 bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 rounded-xl space-y-1">
                  <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Warnings</span>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{warningAlarms} Alerts</div>
                  <p className="text-[11px] text-slate-500">Level: warning / warn</p>
                </div>
                <div className="p-4 bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 rounded-xl space-y-1">
                  <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider">System Logs / Info</span>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalAlarms - criticalAlarms - warningAlarms} Events</div>
                  <p className="text-[11px] text-slate-500">Aktivitas sistem, login, rekaman</p>
                </div>
              </div>

              {/* Alarm list table */}
              {alarmList.length > 0 && (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Nama / Sumber</th>
                        <th className="p-3">Severity</th>
                        <th className="p-3">Waktu</th>
                        <th className="p-3">Deskripsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {alarmList.slice(0, 50).map((a: any, i: number) => {
                        const sev = String(a.level ?? a.severity ?? a.type ?? "-");
                        const isCrit = ["error", "critical", "fatal"].includes(sev.toLowerCase());
                        const isWarn = ["warning", "warn"].includes(sev.toLowerCase());
                        const ts = a.timestampMs
                          ? new Date(a.timestampMs).toLocaleString("id-ID")
                          : a.eventTimestampUsec
                          ? new Date(Math.floor(a.eventTimestampUsec / 1000)).toLocaleString("id-ID")
                          : a.createdAt || "-";
                        return (
                          <tr key={a.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 text-slate-400 font-mono">{i + 1}</td>
                            <td className="p-3 font-medium">{a.name || a.caption || a.source || "-"}</td>
                            <td className="p-3">
                              <Badge className={cn("text-[10px] font-bold",
                                isCrit ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                  : isWarn ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                              )}>
                                {sev}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-[10px] text-slate-500">{ts}</td>
                            <td className="p-3 text-slate-500 dark:text-slate-400">{a.description || a.resourceName || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {alarmList.length > 50 && (
                    <p className="text-[11px] text-slate-400 text-center mt-3">
                      Menampilkan 50 dari {alarmList.length} alarm. Export CSV untuk data lengkap.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 5: SYSTEM HEALTH REPORT                  */}
        {/* (DATA REAL dari servers NX Cloud)            */}
        {/* ============================================ */}
        <TabsContent value="health" className="space-y-4">
          {loadingServers ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
              <span>Memuat data health dari NX Cloud...</span>
            </div>
          ) : serverStorageStats.length === 0 ? (
            <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                <Server className="w-10 h-10 text-slate-500" />
                <p className="font-medium">Tidak ada data server health ditemukan</p>
                <p className="text-xs">Pilih Cloud System tertentu atau pastikan server NX Cloud terhubung.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-500" /> Health Metric Host Server Nx VMS
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Data real-time dari {serverStorageStats.length} server NX Cloud yang terhubung
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {serverStorageStats.map((srv, i) => (
                      <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-emerald-500" />
                            {srv.name}
                          </span>
                          <Badge className={cn("text-[10px]", srv.isOnline ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20")}>
                            {srv.isOnline ? "Online" : "Offline"}
                          </Badge>
                        </div>

                        {/* CPU */}
                        {srv.cpu !== null ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                <Cpu className="w-3 h-3 text-emerald-500" /> CPU Utilization
                              </span>
                              <span className={cn(
                                Number(srv.cpu) > 80 ? "text-rose-500" : Number(srv.cpu) > 60 ? "text-amber-500" : "text-emerald-500"
                              )}>
                                {srv.cpu}%
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all",
                                  Number(srv.cpu) > 80 ? "bg-rose-500" : Number(srv.cpu) > 60 ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, Number(srv.cpu))}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <Cpu className="w-3 h-3" /> CPU data tidak tersedia dari API server ini
                          </div>
                        )}

                        {/* RAM */}
                        {srv.ramUsedMb !== null && srv.ramTotalMb !== null ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                <MemoryStick className="w-3 h-3 text-blue-500" /> RAM Memory
                              </span>
                              <span className="text-blue-400">
                                {(srv.ramUsedMb / 1024).toFixed(1)} GB / {(srv.ramTotalMb / 1024).toFixed(1)} GB
                                {" "}({Math.round((srv.ramUsedMb / srv.ramTotalMb) * 100)}%)
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-500 h-full rounded-full transition-all"
                                style={{ width: `${Math.round((srv.ramUsedMb / srv.ramTotalMb) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <MemoryStick className="w-3 h-3" /> RAM data tidak tersedia dari API server ini
                          </div>
                        )}

                        {/* Storage total */}
                        {srv.usedPct > 0 ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                <HardDrive className="w-3 h-3 text-indigo-500" /> Storage
                              </span>
                              <span className="text-indigo-400">
                                {srv.usedGb} GB / {srv.totalGb} GB ({srv.usedPct}%)
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all",
                                  srv.usedPct > 85 ? "bg-rose-500" : srv.usedPct > 65 ? "bg-amber-500" : "bg-indigo-500"
                                )}
                                style={{ width: `${srv.usedPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <HardDrive className="w-3 h-3" /> Storage data tidak tersedia dari API server ini
                          </div>
                        )}

                        {/* Version & OS */}
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-700 flex gap-4">
                          <span>NX: {srv.version}</span>
                          <span>OS: {srv.osName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
