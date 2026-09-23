import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ORIX_LOGO_SVG, ORIX_LOGO_BASE64_PNG } from "@/assets/orix-logo";
import { buildAnalystRelevantEventLog } from "@/lib/s3-event-presentation";

export interface CameraReportItem {
  id: string;
  name: string;
  serverName: string;
  status: "ONLINE" | "OFFLINE";
  ipAddress: string;
  vendorModel: string;
  resolutionFps: string;
  uptimeRate: string;
  exactOfflineTime?: string;
  cameraId?: string;
}

export interface OfflineCameraIncident {
  incidentNumber: number;
  offlineTime: string;
  offlineTimestampMs?: number | null;
  onlineTime: string;
  onlineTimestampMs?: number | null;
  duration: string;
  status: "RECOVERED" | "STILL OFFLINE";
  reason?: string;
}

export interface OfflineCameraItem {
  serverName: string;
  cameraName: string;
  cameraId: string;
  status: "ONLINE" | "OFFLINE";
  firstOffline: string;
  lastOffline: string;
  offlineDuration: string;
  incidentCount: number;
  availabilityRate: string;
  incidents?: OfflineCameraIncident[];
}

export interface ServerHealthItem {
  serverName: string;
  status: "ONLINE" | "OFFLINE";
  version: string;
  osName: string;
  cpuUsage: string;
  ramUsage: string;
  diskCount: string;
  storageUsage: string;
}

export interface ServerStorageDiskItem {
  serverName: string;
  diskName: string;
  status: string;
  total: string;
  used: string;
  free: string;
  usagePct: string;
}

export interface AlarmReportItem {
  id: string;
  source: string;
  severity: string;
  timestamp: string;
  description: string;
  eventType?: string;
  eventLabel?: string;
  systemName?: string;
  sourceName?: string;
  timestampMs?: number;
}

export interface S3LogItem {
  time: string;
  uploadSpeed: string;
  incomingSpeed: string;
  cacheFill: string;
  queueDepth: string;
  status: string;
}

export interface TrendDataPoint {
  label: string;
  cameras: number | null;
  alarms: number;
  healthScore: number | null;
}

export interface AlarmEventMetrics {
  totalAlarms: number;
  criticalAlarms: number;
  criticalPct: string;
  warningAlarms: number;
  warningPct: string;
  infoAlarms: number;
  infoPct: string;
  disconnectAlarms: number;
  reconnectAlarms: number;
  serverAlarms: number;
  storageAlarms: number;
  networkAlarms: number;
  resolvedIncidents: number;
  activeIncidents: number;
  totalOfflineIncidents: number;
  totalDowntimeMs: number;
  totalDowntimeFormatted: string;
  periodCameraUptimeRate: number;
  auditVerdict: string;
}

export interface ServerStorageStatsItem {
  name: string;
  isOnline: boolean;
  totalGb: string;
  usedGb: string;
  freeGb: string;
  usedPct: number;
  diskCount: string;
  cpuText: string;
  ramText: string;
  version: string;
  osName: string;
}

export interface ServerOutageSessionItem {
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  isActive: boolean;
}

export interface ServerUptimeItem {
  serverId: string;
  serverName: string;
  currentStatus: "ONLINE" | "OFFLINE";
  firstOffline: string;
  lastRecovery: string;
  totalDowntime: string;
  incidentCount: number;
  uptimeRate: number | null;
  periodUptime: string;
  dataCompleteness: "COMPLETE" | "POTENTIALLY_TRUNCATED" | "DATA_NOT_AVAILABLE";
  isOfflinePlaceholder?: boolean;
  outageSessions?: ServerOutageSessionItem[];
}

export interface FullReportData {
  companyName: string;
  dashboardTitle: string;
  generatedAt: string;
  periodType: string;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  selectedServerLabel: string;

  // Executive Summary & Metrics
  totalCameras: number;
  onlineCameras: number;
  offlineCamerasCount: number;
  cameraOnlineRate: number;
  totalServers: number;
  onlineServers: number;
  offlineServers: number;
  serverOnlineRate: number;
  overallServerPeriodUptime?: number | null;
  totalAlarms: number;
  criticalAlarms: number;
  warningAlarms: number;
  totalOfflineIncidents: number;

  // Dynamic Title
  offlineSummaryTitle: string;

  // Extended Metrics (from canonical calculation)
  alarmEventMetrics?: AlarmEventMetrics;

  // Trend Data
  trendData?: TrendDataPoint[];

  // Tables
  cameras: CameraReportItem[];
  offlineCameras: OfflineCameraItem[];
  servers: ServerHealthItem[];
  serverDisks: ServerStorageDiskItem[];
  alarms: AlarmReportItem[];
  s3Logs: S3LogItem[];

  // Storage consumption & server uptime overview
  serverStorageStats?: ServerStorageStatsItem[];
  serverUptimeResults?: ServerUptimeItem[];
}

export interface EventSummaryAnalysis {
  total: number;
  criticalCount: number;
  criticalPct: string;
  warningCount: number;
  warningPct: string;
  infoCount: number;
  infoPct: string;
  topCategory: string;
  severityRows: Array<{
    level: string;
    count: number;
    pct: string;
    impact: string;
  }>;
  categoryRows: Array<{
    category: string;
    severity: string;
    count: number;
    pct: string;
    sources: string;
  }>;
  sourceRows: Array<{
    source: string;
    critical: number;
    warnings: number;
    total: number;
    pct: string;
  }>;
}

export function analyzeEvents(alarms: AlarmReportItem[]): EventSummaryAnalysis {
  const total = alarms.length;
  if (total === 0) {
    return {
      total: 0,
      criticalCount: 0,
      criticalPct: "0%",
      warningCount: 0,
      warningPct: "0%",
      infoCount: 0,
      infoPct: "0%",
      topCategory: "NO EVENTS LOGGED",
      severityRows: [],
      categoryRows: [],
      sourceRows: [],
    };
  }

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  const categoryMap = new Map<string, { count: number; severities: string[]; sources: Set<string> }>();
  const sourceMap = new Map<string, { total: number; critical: number; warning: number }>();

  alarms.forEach((a) => {
    const sev = (a.severity || "INFO").toUpperCase();
    if (sev === "CRITICAL" || sev.includes("CRIT") || sev.includes("ERROR") || sev.includes("FATAL")) {
      criticalCount++;
    } else if (sev === "WARNING" || sev.includes("WARN")) {
      warningCount++;
    } else {
      infoCount++;
    }

    // Categorize
    const desc = (a.description || "").toLowerCase();
    const source = (a.source || "UNKNOWN").trim();
    const type = (a.eventType || "").toLowerCase();
    const label = (a.eventLabel || "").toLowerCase();

    let cat = "GENERAL SYSTEM & OPERATIONAL";
    if (
      type.includes("disconnect") ||
      type.includes("offline") ||
      label.includes("disconnect") ||
      desc.includes("disconnect") ||
      desc.includes("offline") ||
      desc.includes("lost connection")
    ) {
      cat = "CAMERA DISCONNECTION / OFFLINE";
    } else if (
      type.includes("storage") ||
      label.includes("storage") ||
      desc.includes("storage") ||
      desc.includes("disk") ||
      desc.includes("hard drive")
    ) {
      cat = "STORAGE & HARD DRIVE FAILURE";
    } else if (
      type.includes("server") ||
      label.includes("server") ||
      desc.includes("server")
    ) {
      cat = "SERVER FAILURE & SYSTEM CONFLICT";
    } else if (
      type.includes("network") ||
      type.includes("ipconflict") ||
      label.includes("network") ||
      desc.includes("network") ||
      desc.includes("ip conflict")
    ) {
      cat = "NETWORK & CONNECTIVITY ISSUES";
    } else if (
      type.includes("motion") ||
      type.includes("input") ||
      label.includes("motion") ||
      desc.includes("motion")
    ) {
      cat = "MOTION DETECTION & VIDEO ANALYTICS";
    }

    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { count: 0, severities: [], sources: new Set() });
    }
    const catEntry = categoryMap.get(cat)!;
    catEntry.count++;
    catEntry.severities.push(sev);
    if (source) catEntry.sources.add(source);

    // Source stats
    if (!sourceMap.has(source)) {
      sourceMap.set(source, { total: 0, critical: 0, warning: 0 });
    }
    const srcEntry = sourceMap.get(source)!;
    srcEntry.total++;
    if (sev === "CRITICAL" || sev.includes("CRIT") || sev.includes("ERROR")) {
      srcEntry.critical++;
    } else if (sev === "WARNING" || sev.includes("WARN")) {
      srcEntry.warning++;
    }
  });

  const criticalPct = `${Math.round((criticalCount / total) * 100)}%`;
  const warningPct = `${Math.round((warningCount / total) * 100)}%`;
  const infoPct = `${Math.round((infoCount / total) * 100)}%`;

  const severityRows = [
    {
      level: "CRITICAL",
      count: criticalCount,
      pct: criticalPct,
      impact: "Immediate Action Required — Hardware offline, server unreachable or storage failure",
    },
    {
      level: "WARNING",
      count: warningCount,
      pct: warningPct,
      impact: "Operational Warning — Performance alerts, high storage usage or network warnings",
    },
    {
      level: "INFO",
      count: infoCount,
      pct: infoPct,
      impact: "Operational Audit — Standard system events, analytics alerts, and routine logs",
    },
  ];

  const categoryRows = Array.from(categoryMap.entries())
    .map(([cat, data]) => {
      const isCrit = data.severities.includes("CRITICAL");
      const isWarn = data.severities.includes("WARNING");
      const dominantSeverity = isCrit ? "CRITICAL" : isWarn ? "WARNING" : "INFO";
      const srcList = Array.from(data.sources);
      const sourcesText =
        srcList.length <= 2
          ? srcList.join(", ")
          : `${srcList.slice(0, 2).join(", ")} (+${srcList.length - 2} more)`;
      return {
        category: cat,
        severity: dominantSeverity,
        count: data.count,
        pct: `${Math.round((data.count / total) * 100)}%`,
        sources: sourcesText || "N/A",
      };
    })
    .sort((a, b) => b.count - a.count);

  const topCategory = categoryRows.length > 0 ? categoryRows[0].category : "NO EVENTS";

  const sourceRows = Array.from(sourceMap.entries())
    .map(([source, stats]) => ({
      source,
      critical: stats.critical,
      warnings: stats.warning,
      total: stats.total,
      pct: `${Math.round((stats.total / total) * 100)}%`,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return {
    total,
    criticalCount,
    criticalPct,
    warningCount,
    warningPct,
    infoCount,
    infoPct,
    topCategory,
    severityRows,
    categoryRows,
    sourceRows,
  };
}

/**
 * Generate & Download Word (.docx / Word HTML) Document
 * Full Reporting Export matching 100% of UI reporting screen.
 */
export function exportToWord(data: FullReportData) {
  const fileName = `ORIX_INDONESIA_FINANCE_REPORT_${data.dateTo}.doc`;

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${data.companyName} - ${data.dashboardTitle} - EXECUTIVE REPORTING</title>
      <style>
        @page Section1 {
          size: 841.9pt 595.3pt; /* A4 Landscape */
          mso-page-orientation: landscape;
          margin: 0.8in 0.6in 0.8in 0.6in;
        }
        div.Section1 { page: Section1; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; line-height: 1.4; }
        h1 { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 2px; text-transform: uppercase; }
        h2 { font-size: 14px; font-weight: bold; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; }
        h3 { font-size: 13px; font-weight: bold; color: #002B66; margin-top: 20px; margin-bottom: 8px; text-transform: uppercase; border-bottom: 2px solid #002B66; padding-bottom: 4px; }
        .header-box { background-color: #0f172a; color: #ffffff; padding: 18px 20px; border-radius: 6px; margin-bottom: 20px; }
        .meta-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
        .meta-table td { padding: 6px 10px; font-size: 12px; border: 1px solid #cbd5e1; background-color: #f8fafc; }
        .meta-table td.label { font-weight: bold; color: #475569; width: 18%; text-transform: uppercase; }
        .meta-table td.value { color: #0f172a; font-weight: 600; width: 32%; }

        .grid-cards { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .grid-cards td { width: 25%; padding: 12px; border: 1px solid #cbd5e1; background-color: #f8fafc; text-align: center; vertical-align: top; }
        .card-val { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
        .card-lbl { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; }
        .card-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }

        table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        table.data-table th { background-color: #002B66; color: #ffffff; font-weight: bold; text-align: left; padding: 8px; text-transform: uppercase; border: 1px solid #001f4d; }
        table.data-table td { padding: 7px 8px; border: 1px solid #cbd5e1; color: #334155; }
        table.data-table tr:nth-child(even) td { background-color: #f8fafc; }

        .badge-online { background-color: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        .badge-offline { background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        .badge-warning { background-color: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 10px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="Section1">
        <!-- HEADER BRANDING WITH ORIX LOGO -->
        <table style="width: 100%; background-color: #0f172a; padding: 16px 20px; border-radius: 6px; margin-bottom: 20px;">
          <tr>
            <td style="vertical-align: middle; width: 60%;">
              <div style="display: flex; align-items: center; gap: 16px;">
                <img src="${ORIX_LOGO_BASE64_PNG}" alt="ORIX LOGO" style="width: 75px; height: 90px; vertical-align: middle;" />
                <div>
                  <h1 style="color: #ffffff; font-size: 18px; font-weight: bold; margin: 0;">${data.companyName}</h1>
                  <h2 style="color: #60a5fa; font-size: 13px; font-weight: bold; margin: 2px 0 0 0;">${data.dashboardTitle} — EXECUTIVE REPORTING</h2>
                </div>
              </div>
            </td>
            <td style="vertical-align: middle; text-align: right; color: #94a3b8; font-size: 11px; line-height: 1.5;">
              <strong style="color: #ffffff;">CONFIDENTIAL CORPORATE REPORT</strong><br/>
              PERIOD: ${data.periodLabel}<br/>
              SERVER: ${data.selectedServerLabel}<br/>
              GENERATED: ${data.generatedAt}
            </td>
          </tr>
        </table>

        <!-- REPORT METADATA -->
        <table class="meta-table">
          <tr>
            <td class="label">COMPANY NAME:</td>
            <td class="value">${data.companyName}</td>
            <td class="label">GENERATED ON:</td>
            <td class="value">${data.generatedAt}</td>
          </tr>
          <tr>
            <td class="label">REPORT PERIOD:</td>
            <td class="value">${data.periodLabel}</td>
            <td class="label">SELECTED SERVER:</td>
            <td class="value">${data.selectedServerLabel}</td>
          </tr>
        </table>

        <!-- EXECUTIVE SUMMARY STAT CARDS -->
        <h3>EXECUTIVE SUMMARY OVERVIEW</h3>
        <table class="grid-cards">
          <tr>
            <td>
              <div class="card-val" style="color: #2563eb;">${data.cameraOnlineRate}%</div>
              <div class="card-lbl">${data.periodType === "current" ? "INSTANT CAMERA ONLINE RATE" : "CAMERA UPTIME RATE"}</div>
              <div class="card-sub">${data.periodType === "current" ? `${data.onlineCameras} / ${data.totalCameras} CAMERAS ONLINE NOW` : "AVERAGE PER-CAMERA UPTIME INDEX"}</div>
            </td>
            <td>
              <div class="card-val" style="color: #16a34a;">${data.serverOnlineRate}%</div>
              <div class="card-lbl">LIVE SERVER ONLINE RATE</div>
              <div class="card-sub">${data.onlineServers} / ${data.totalServers} SERVERS ONLINE</div>
            </td>
            <td>
              <div class="card-val" style="color: #d97706;">${data.totalAlarms}</div>
              <div class="card-lbl">TOTAL ALARM EVENTS</div>
              <div class="card-sub">${data.criticalAlarms} CRITICAL, ${data.warningAlarms} WARNING</div>
            </td>
            <td>
              <div class="card-val" style="color: #dc2626;">${data.periodType === "current" ? data.offlineCamerasCount : data.totalOfflineIncidents}</div>
              <div class="card-lbl">${data.periodType === "current" ? "CURRENT DISCONNECTED CAMERAS" : "OFFLINE INCIDENTS"}</div>
              <div class="card-sub">${data.offlineCamerasCount} CAMERAS CURRENTLY OFFLINE</div>
            </td>
          </tr>
        </table>

        <!-- SECTION 1: RECORDING SERVER STORAGE DISK BREAKDOWN -->
        <h3>RECORDING SERVER STORAGE &amp; HARD DRIVE BREAKDOWN</h3>
        <p style="font-size: 11px; color: #64748b; margin-bottom: 8px;">DETAILED STORAGE DISK METRICS PER SERVER (ONLINE / TOTAL / USED / FREE / USAGE %)</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SERVER NAME</th>
              <th>DISK DRIVE</th>
              <th>STATUS</th>
              <th>TOTAL CAPACITY</th>
              <th>USED CAPACITY</th>
              <th>FREE SPACE</th>
              <th>USAGE %</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.serverDisks && data.serverDisks.length > 0
                ? data.serverDisks
                    .map(
                      (d, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${d.serverName}</strong></td>
                <td><code>${d.diskName}</code></td>
                <td><span class="${d.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${d.status}</span></td>
                <td>${d.total}</td>
                <td>${d.used}</td>
                <td>${d.free}</td>
                <td><strong>${d.usagePct}</strong></td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="8" style="text-align: center; color: #dc2626; font-weight: bold;">STORAGE DATA NOT AVAILABLE FROM SOURCE</td></tr>`
            }
          </tbody>
        </table>

        <!-- SECTION 2: DYNAMIC OFFLINE CAMERA SUMMARY -->
        <h3>${data.periodType === "current" ? "CURRENT OFFLINE CAMERA SUMMARY" : (data.offlineSummaryTitle || "OFFLINE CAMERA SUMMARY")}</h3>
        <p style="font-size: 11px; color: #64748b; margin-bottom: 8px;">${data.periodType === "current" ? "CURRENT CAMERA CONNECTIVITY STATUS ACROSS ALL MONITORED SYSTEMS" : "HISTORICAL DISCONNECT INCIDENTS &amp; AVAILABILITY AUDIT FOR THE SELECTED PERIOD"}</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SERVER</th>
              <th>CAMERA NAME</th>
              <th>CAMERA ID</th>
              <th>STATUS</th>
              <th>WHEN OFFLINE</th>
              ${data.periodType !== "current" ? `
              <th>HAS IT BEEN ONLINE</th>
              <th>OFFLINE DURATION</th>
              <th>INCIDENTS</th>
              <th>AVAILABILITY RATE</th>` : ``}
            </tr>
          </thead>
          <tbody>
            ${
              data.offlineCameras.length > 0
                ? data.offlineCameras
                    .map(
                      (item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.serverName}</td>
                <td><strong>${item.cameraName}</strong></td>
                <td><code>${item.cameraId}</code></td>
                <td><span class="${item.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${item.status}</span></td>
                <td>
                  ${item.firstOffline}
                </td>
                ${data.periodType !== "current" ? `
                <td>${
                  item.lastOffline === "OFFLINE UNTIL NOW"
                    ? `<span class="badge-offline" style="font-weight: 800; background-color: #fee2e2; color: #b91c1c; padding: 3px 6px;">OFFLINE UNTIL NOW</span>`
                    : item.lastOffline
                }</td>
                <td>${item.offlineDuration}</td>
                <td style="text-align: center; font-weight: bold;">${item.incidentCount}</td>
                <td style="font-weight: bold; color: ${item.availabilityRate === '100% ONLINE' || item.availabilityRate === 'ONLINE' || item.availabilityRate === 'ONLINE (RECOVERED)' ? '#16a34a' : '#dc2626'};">${item.availabilityRate}</td>
                ` : ``}
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="${data.periodType === 'current' ? 6 : 10}" style="text-align: center; color: #64748b;">${data.periodType === 'current' ? 'NO CAMERAS CURRENTLY OFFLINE' : 'NO OFFLINE INCIDENTS RECORDED IN THIS PERIOD'}</td></tr>`
            }
          </tbody>
        </table>

        <!-- SECTION 3: SYSTEM HEALTH & SERVERS REPORT -->
        <h3>SYSTEM HEALTH &amp; SERVER PERFORMANCE (${data.servers.length} SERVERS)</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SERVER NAME</th>
              <th>STATUS</th>
              <th>SOFTWARE VERSION</th>
              <th>OPERATING SYSTEM</th>
              <th>CPU USAGE</th>
              <th>RAM MEMORY</th>
              <th>DISKS</th>
              <th>STORAGE CONSUMED</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.servers.length > 0
                ? data.servers
                    .map(
                      (srv, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${srv.serverName}</strong></td>
                <td><span class="${srv.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${srv.status}</span></td>
                <td>${srv.version}</td>
                <td>${srv.osName}</td>
                <td>${srv.cpuUsage}</td>
                <td>${srv.ramUsage}</td>
                <td>${srv.diskCount}</td>
                <td>${srv.storageUsage}</td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="9" style="text-align: center; color: #64748b;">NO SERVER HEALTH DATA AVAILABLE</td></tr>`
            }
          </tbody>
        </table>

        <!-- SECTION 3B: SERVER OUTAGE & DOWNTIME AUDIT -->
        <h3>${data.periodType === "current" ? "LIVE SERVER STATUS OVERVIEW" : "SERVER OUTAGE & DOWNTIME AUDIT"}</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SERVER NAME</th>
              <th>CURRENT STATUS</th>
              ${data.periodType !== "current" ? `
              <th>FIRST OFFLINE</th>
              <th>LAST RECOVERY / STATUS</th>
              <th>TOTAL DOWNTIME</th>
              <th>INCIDENTS</th>
              <th>PERIOD UPTIME</th>` : `
              <th>SOFTWARE VERSION</th>
              <th>OPERATING SYSTEM</th>
              <th>CPU USAGE</th>
              <th>RAM MEMORY</th>`}
            </tr>
          </thead>
          <tbody>
            ${
              data.periodType === "current"
                ? data.servers.map((srv, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${srv.serverName}</strong></td>
                <td><span class="${srv.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${srv.status}</span></td>
                <td>${srv.version || 'N/A'}</td>
                <td>${srv.osName || 'N/A'}</td>
                <td>${srv.cpuUsage || 'N/A'}</td>
                <td>${srv.ramUsage || 'N/A'}</td>
              </tr>
            `).join("")
                : (data.serverUptimeResults && data.serverUptimeResults.length > 0
                    ? data.serverUptimeResults.map((item, idx) => {
                        const isOffline = item.isOfflinePlaceholder || item.periodUptime?.includes("HISTORICAL UPTIME NOT AVAILABLE") || (item.periodUptime === "N/A" && item.currentStatus === "OFFLINE");
                        return `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${item.serverName}</strong></td>
                <td><span class="${item.currentStatus === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${item.currentStatus}</span></td>
                <td>${isOffline ? 'N/A' : (item.firstOffline || 'NO OFFLINE INCIDENTS')}</td>
                <td>${isOffline ? 'OFFLINE UNTIL NOW' : (item.lastRecovery || (item.currentStatus === 'ONLINE' ? 'ONLINE' : 'OFFLINE UNTIL NOW'))}</td>
                <td>${isOffline ? 'N/A' : (item.totalDowntime || '0m')}</td>
                <td>${isOffline ? 'N/A' : (item.incidentCount !== null && item.incidentCount !== undefined ? item.incidentCount : 'N/A')}</td>
                <td>${isOffline ? (item.periodUptime || 'N/A — SERVER CURRENTLY OFFLINE / HISTORICAL UPTIME NOT AVAILABLE') : item.periodUptime}</td>
              </tr>
            `;
                      }).join("")
                    : `<tr><td colspan="8" style="text-align: center; color: #64748b;">NO SERVER OUTAGE DATA AVAILABLE</td></tr>`)
            }
          </tbody>
        </table>

        <!-- SECTION 4: CAMERA INVENTORY REPORT -->
        <h3>DETAILED CAMERA INVENTORY REPORT (${data.cameras.length} UNITS)</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>CAMERA NAME</th>
              <th>SERVER</th>
              <th>STATUS</th>
              <th>OFFLINE EXACT TIME</th>
              <th>ENDPOINT / IP</th>
              <th>VENDOR / MODEL</th>
              <th>HISTORICAL AVAILABILITY</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.cameras.length > 0
                ? data.cameras
                    .map(
                      (cam, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${cam.name}</strong></td>
                <td>${cam.serverName}</td>
                <td>
                  <span class="${cam.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${cam.status}</span>
                </td>
                <td>
                  ${cam.status === 'OFFLINE' ? `<strong style="font-family:Consolas,monospace; color:#e11d48;">${cam.exactOfflineTime || 'N/A'}</strong>` : '—'}
                </td>
                <td><code>${cam.ipAddress}</code></td>
                <td>${cam.vendorModel}</td>
                <td><strong>${cam.status === 'OFFLINE' && cam.exactOfflineTime ? `OFFLINE (Since: ${cam.exactOfflineTime})` : cam.uptimeRate}</strong></td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="8" style="text-align: center; color: #64748b;">NO CAMERA DATA AVAILABLE</td></tr>`
            }
          </tbody>
        </table>

        <!-- SECTION 5: ALARM EVENTS & EXECUTIVE SUMMARY -->
        <h3>SECURITY &amp; ALARM EVENT EXECUTIVE SUMMARY (${data.alarms.length} TOTAL EVENTS)</h3>
        ${(() => {
          const analysis = analyzeEvents(data.alarms);
          if (analysis.total === 0) {
            return `<div style="padding:12px; background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; color:#166534; font-weight:bold; margin-bottom:15px;">
              NO SECURITY ALARMS OR UNEXPECTED HARDWARE DISCONNECTIONS LOGGED IN THIS REPORTING PERIOD.
            </div>`;
          }
          return `
            <!-- KPI Summary Cards -->
            <table class="meta-table" style="margin-bottom:12px;">
              <tr>
                <td style="text-align:center; padding:10px; border:1px solid #cbd5e1; background-color:#fef2f2;">
                  <div style="font-size:16px; font-weight:bold; color:#dc2626;">${analysis.criticalCount} (${analysis.criticalPct})</div>
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Critical Severity</div>
                </td>
                <td style="text-align:center; padding:10px; border:1px solid #cbd5e1; background-color:#fffbeb;">
                  <div style="font-size:16px; font-weight:bold; color:#d97706;">${analysis.warningCount} (${analysis.warningPct})</div>
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Warning Alerts</div>
                </td>
                <td style="text-align:center; padding:10px; border:1px solid #cbd5e1; background-color:#eff6ff;">
                  <div style="font-size:16px; font-weight:bold; color:#2563eb;">${analysis.infoCount} (${analysis.infoPct})</div>
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Info / Normal Logs</div>
                </td>
                <td style="text-align:center; padding:10px; border:1px solid #cbd5e1; background-color:#f8fafc;">
                  <div style="font-size:14px; font-weight:bold; color:#0f172a;">${analysis.topCategory}</div>
                  <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Primary Incident Type</div>
                </td>
              </tr>
            </table>

            <!-- Table 1: Severity Breakdown -->
            <div style="font-size:11px; font-weight:bold; color:#002B66; margin-top:10px; margin-bottom:4px; text-transform:uppercase;">
              5.1 INCIDENT SUMMARY BY SEVERITY LEVEL
            </div>
            <table class="data-table" style="margin-bottom:15px;">
              <thead>
                <tr>
                  <th>SEVERITY LEVEL</th>
                  <th>TOTAL EVENTS</th>
                  <th>% OF TOTAL</th>
                  <th>OPERATIONAL STATUS &amp; IMPACT</th>
                </tr>
              </thead>
              <tbody>
                ${analysis.severityRows.map((r) => `
                  <tr>
                    <td><strong style="color:${r.level === 'CRITICAL' ? '#dc2626' : r.level === 'WARNING' ? '#d97706' : '#2563eb'};">${r.level}</strong></td>
                    <td><strong>${r.count}</strong></td>
                    <td>${r.pct}</td>
                    <td>${r.impact}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>

            <!-- Table 2: Category Breakdown -->
            <div style="font-size:11px; font-weight:bold; color:#002B66; margin-top:10px; margin-bottom:4px; text-transform:uppercase;">
              5.2 INCIDENT SUMMARY BY EVENT CATEGORY
            </div>
            <table class="data-table" style="margin-bottom:15px;">
              <thead>
                <tr>
                  <th>INCIDENT CATEGORY</th>
                  <th>PRIMARY SEVERITY</th>
                  <th>OCCURRENCES</th>
                  <th>% SHARE</th>
                  <th>AFFECTED DEVICES / HARDWARE</th>
                </tr>
              </thead>
              <tbody>
                ${analysis.categoryRows.map((cat) => `
                  <tr>
                    <td><strong>${cat.category}</strong></td>
                    <td><span class="${cat.severity === 'CRITICAL' ? 'badge-offline' : cat.severity === 'WARNING' ? 'badge-warning' : 'badge-online'}">${cat.severity}</span></td>
                    <td><strong>${cat.count}</strong></td>
                    <td>${cat.pct}</td>
                    <td>${cat.sources}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>

            <!-- Table 3: Top Affected Hardware -->
            ${analysis.sourceRows.length > 0 ? `
              <div style="font-size:11px; font-weight:bold; color:#002B66; margin-top:10px; margin-bottom:4px; text-transform:uppercase;">
                5.3 TOP AFFECTED HARDWARE &amp; EVENT SOURCES
              </div>
              <table class="data-table" style="margin-bottom:15px;">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>SOURCE / HARDWARE NAME</th>
                    <th>CRITICAL</th>
                    <th>WARNINGS</th>
                    <th>TOTAL INCIDENTS</th>
                    <th>% SHARE</th>
                  </tr>
                </thead>
                <tbody>
                  ${analysis.sourceRows.map((src, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td><strong>${src.source}</strong></td>
                      <td style="color:#dc2626; font-weight:bold;">${src.critical}</td>
                      <td style="color:#d97706; font-weight:bold;">${src.warnings}</td>
                      <td><strong>${src.total}</strong></td>
                      <td>${src.pct}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            ` : ""}

            <!-- Table 4: Chronological Event Log -->
            <div style="font-size:11px; font-weight:bold; color:#002B66; margin-top:10px; margin-bottom:4px; text-transform:uppercase;">
              5.4 DETAILED SECURITY EVENT &amp; ALARM LOG (${data.alarms.length} EVENTS)
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>EVENT SOURCE / NAME</th>
                  <th>SEVERITY</th>
                  <th>TIMESTAMP</th>
                  <th>DESCRIPTION</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  const analystPresentation = buildAnalystRelevantEventLog(data.alarms);
                  return analystPresentation.presentationItems.map((a: any, idx: number) => {
                    const sevStr = String(a.severity || "INFO").toLowerCase();
                    const badgeClass = sevStr.includes('error') || sevStr.includes('crit')
                      ? 'badge-offline'
                      : sevStr.includes('warn')
                      ? 'badge-warning'
                      : 'badge-online';

                    if (a.isSummary) {
                      const timeRange = a.firstFormattedTime && a.lastFormattedTime
                        ? `${a.firstFormattedTime} → ${a.lastFormattedTime}`
                        : "TELEMETRY WINDOW";
                      const srcName = a.sourceName || "S3 CLOUD BRIDGE";
                      const descStr = `[SUMMARY OF ${a.count} REPEATED TELEMETRY LOGS] ${a.representativeCaption} - ${a.representativeDescription}`;
                      return `
                        <tr>
                          <td>${idx + 1}</td>
                          <td><strong>${srcName}</strong></td>
                          <td><span class="${badgeClass}">${a.severity}</span></td>
                          <td style="font-family:Consolas,monospace;">${timeRange}</td>
                          <td>${descStr}</td>
                        </tr>
                      `;
                    }

                    return `
                      <tr>
                        <td>${idx + 1}</td>
                        <td><strong>${a.source}</strong></td>
                        <td><span class="${badgeClass}">${a.severity}</span></td>
                        <td style="font-family:Consolas,monospace;">${a.timestamp}</td>
                        <td>${a.description}</td>
                      </tr>
                    `;
                  }).join("");
                })()}
              </tbody>
            </table>
          `;
        })()}

        <!-- SECTION 6: S3 CLOUD BRIDGE LOGS -->
        <h3>S3 CLOUD BRIDGE STORAGE SYNC AUDIT LOGS</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>LOG TIME</th>
              <th>UPLOAD RATE</th>
              <th>INCOMING SPEED</th>
              <th>CACHE FILL %</th>
              <th>QUEUE DEPTH</th>
              <th>CLOUD STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.s3Logs.length > 0
                ? data.s3Logs
                    .map(
                      (s3) => `
              <tr>
                <td>${s3.time}</td>
                <td><strong>${s3.uploadSpeed}</strong></td>
                <td>${s3.incomingSpeed}</td>
                <td>${s3.cacheFill}</td>
                <td>${s3.queueDepth}</td>
                <td><span class="badge-online">${s3.status}</span></td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="6" style="text-align: center; color: #64748b;">S3 DATA NOT AVAILABLE — NO ACTIVE S3 DATA SOURCE CONFIGURED</td></tr>`
            }
          </tbody>
        </table>

        <!-- FOOTER -->
        <div class="footer">
          CONFIDENTIAL &bull; ${data.companyName} (${data.dashboardTitle}) &bull; GENERATED AUTOMATICALLY ON ${data.generatedAt}
        </div>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(["\ufeff" + htmlContent], {
    type: "application/msword",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generate & Download PDF Document using jsPDF & autotable
 * Full Reporting Export matching 100% of UI reporting screen.
 *
 * PDF hierarchy mirrors the Dashboard:
 *   Summary → Camera/Downtime → Health → Storage → Alarm → Events → S3
 *
 * All values come from FullReportData (the same source as the Dashboard).
 * No new calculations are performed here.
 */
export function exportToPdf(data: FullReportData) {
  const fileName = `ORIX_INDONESIA_FINANCE_REPORT_${data.dateTo}.pdf`;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = { left: 14, right: 14, top: 14, bottom: 14 };
  const contentWidth = pw - margin.left - margin.right;

  const ORIX_NAVY: [number, number, number] = [0, 43, 102];
  const SLATE_900: [number, number, number] = [15, 23, 42];
  const SLATE_700: [number, number, number] = [51, 65, 85];
  const SLATE_500: [number, number, number] = [100, 116, 139];
  const SLATE_400: [number, number, number] = [148, 163, 184];
  const SLATE_200: [number, number, number] = [226, 232, 240];
  const WHITE: [number, number, number] = [255, 255, 255];
  const BLUE_600: [number, number, number] = [37, 99, 235];
  const GREEN_600: [number, number, number] = [22, 163, 74];
  const AMBER_600: [number, number, number] = [217, 119, 6];
  const RED_600: [number, number, number] = [220, 38, 38];
  const LIGHT_GREEN: [number, number, number] = [240, 253, 244];

  let y = margin.top;

  // ─── HELPERS ───────────────────────────────────────────────
  function checkPage(needed: number) {
    if (y + needed > ph - margin.bottom) {
      doc.addPage();
      y = margin.top;
      drawHeader();
      y = 24;
    }
  }

  function drawHeader() {
    doc.setFillColor(...SLATE_900);
    doc.rect(0, 0, pw, 18, "F");
    try {
      doc.addImage(ORIX_LOGO_BASE64_PNG, "PNG", margin.left, 3, 12, 12);
    } catch {
      // logo fallback — not critical
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text(data.companyName, margin.left + 16, 8);
    doc.setFontSize(7);
    doc.setTextColor(96, 165, 250);
    doc.text(`${data.dashboardTitle} — EXECUTIVE REPORTING`, margin.left + 16, 13);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_400);
    doc.text(
      `PERIOD: ${data.periodLabel}  |  SERVER: ${data.selectedServerLabel}  |  GENERATED: ${data.generatedAt}`,
      margin.left + 16,
      16.5
    );
  }

  function drawFooter(pageNum: number, total: number) {
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_400);
    doc.text(
      `CONFIDENTIAL  •  ${data.companyName}  •  PAGE ${pageNum} OF ${total}`,
      pw / 2,
      ph - 4,
      { align: "center" }
    );
  }

  function sectionTitle(text: string) {
    checkPage(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ORIX_NAVY);
    doc.text(text, margin.left, y);
    y += 1;
    doc.setDrawColor(...ORIX_NAVY);
    doc.setLineWidth(0.5);
    doc.line(margin.left, y, margin.left + contentWidth, y);
    y += 5;
  }

  function subLabel(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.text(text, margin.left, y);
    y += 4;
  }

  function formatDurationPdf(diffMs: number): string {
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

  function formatDateJakarta(ms: number): string {
    if (!ms || isNaN(ms)) return "-";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(ms));
  }

  function formatTimeJakarta(ms: number): string {
    if (!ms || isNaN(ms)) return "-";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  }

  // ─── PAGE 1: TITLE + EXECUTIVE SUMMARY ─────────────────────
  drawHeader();
  y = 24;

  // Period / server / generated metadata block
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...SLATE_200);
  doc.roundedRect(margin.left, y, contentWidth, 18, 1.5, 1.5, "FD");
  const metaX = margin.left + 4;
  const metaY = y + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_700);
  doc.text("PERIOD:", metaX, metaY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE_900);
  doc.text(data.periodLabel, metaX + 20, metaY);
  doc.setFont("helvetica", "bold");
  doc.text("SERVER:", metaX + 80, metaY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE_900);
  doc.text(data.selectedServerLabel, metaX + 98, metaY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...SLATE_700);
  doc.text("GENERATED:", metaX, metaY + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE_900);
  doc.text(data.generatedAt, metaX + 24, metaY + 6);
  y += 24;

  // ─── SUMMARY METRIC CARDS ─────────────────────────────────
  sectionTitle("EXECUTIVE SUMMARY");
  y += 1;

  const cardGap = 4;
  const cardCount = 4;
  const cardW = (contentWidth - cardGap * (cardCount - 1)) / cardCount;
  const cardH = 20;
  const cardColors: [number, number, number][] = [BLUE_600, GREEN_600, AMBER_600, RED_600];
  const cardLabels = [
    data.periodType === "current" ? "INSTANT CAMERA ONLINE RATE" : "CAMERA UPTIME RATE",
    "LIVE SERVER ONLINE RATE",
    "TOTAL ALARM EVENTS",
    data.periodType === "current" ? "CURRENT DISCONNECTED CAMERAS" : "OFFLINE INCIDENTS",
  ];
  const cardValues = [
    `${data.cameraOnlineRate}%`,
    `${data.serverOnlineRate}%`,
    `${data.totalAlarms}`,
    data.periodType === "current" ? `${data.offlineCamerasCount}` : `${data.totalOfflineIncidents}`,
  ];
  const cardSubs = [
    data.periodType === "current" ? `${data.onlineCameras} / ${data.totalCameras} CAMERAS ONLINE NOW` : "AVERAGE PER-CAMERA UPTIME INDEX",
    `${data.onlineServers} / ${data.totalServers} SERVERS ONLINE`,
    `${data.criticalAlarms} CRITICAL  •  ${data.warningAlarms} WARNING`,
    `${data.offlineCamerasCount} CAMERAS CURRENTLY OFFLINE`,
  ];

  for (let i = 0; i < cardCount; i++) {
    const cx = margin.left + i * (cardW + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...SLATE_200);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFillColor(...cardColors[i]);
    doc.roundedRect(cx, y, 2, cardH, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...cardColors[i]);
    doc.text(cardValues[i], cx + 6, y + 8);
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_500);
    doc.text(cardLabels[i], cx + 6, y + 13);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_400);
    doc.text(cardSubs[i], cx + 6, y + 17);
  }
  y += cardH + 6;

  // Executive Alarm & Availability Summary Box (if alarmEventMetrics available)
  if (data.alarmEventMetrics) {
    const m = data.alarmEventMetrics;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...SLATE_200);
    doc.roundedRect(margin.left, y, contentWidth, 22, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...ORIX_NAVY);
    doc.text(
      data.periodType === "current" ? "LIVE ALARM & SYSTEM EVENT SUMMARY" : "ALARM EVENTS & AVAILABILITY EXECUTIVE SUMMARY",
      margin.left + 4,
      y + 5
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_700);
    doc.text(
      data.periodType === "current"
        ? `CURRENT EVENT LOG: Raw Alarm Events: ${data.totalAlarms}  •  Critical: ${data.criticalAlarms}  •  Warnings: ${data.warningAlarms}  •  Cameras Online: ${data.onlineCameras}/${data.totalCameras}`
        : `RAW CAMERA SOURCE EVENTS: ${m.disconnectAlarms}  •  Reconnects: ${m.reconnectAlarms}  •  Resolved Sessions: ${m.resolvedIncidents}  •  Active Issues: ${m.activeIncidents}  •  Total Outage: ${m.totalDowntimeFormatted}`,
      margin.left + 4,
      y + 11
    );

    const verdictText = data.periodType === "current"
      ? "LIVE SNAPSHOT AUDIT: System monitoring active. Current snapshot operational status recorded."
      : m.auditVerdict;

    if (verdictText) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SLATE_900);
      doc.text(`AUDIT VERDICT: `, margin.left + 4, y + 16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SLATE_700);
      const verdictLines = doc.splitTextToSize(verdictText, contentWidth - 32);
      doc.text(verdictLines, margin.left + 28, y + 16);
    }
    y += 26;
  }

  // Downtime Summary Table (Historical Only)
  if (data.periodType !== "current") {
    sectionTitle("DOWNTIME SUMMARY");
    subLabel("Sum of downtime across camera incidents; not elapsed fleet outage time.");

    const dtRows = [
      ["TOTAL OFFLINE INCIDENTS", String(data.totalOfflineIncidents)],
      [
        "AGGREGATED CAMERA DOWNTIME",
        data.alarmEventMetrics?.totalDowntimeFormatted || (data.totalOfflineIncidents > 0 ? "SEE OFFLINE DETAIL BELOW" : "0s (NO INCIDENTS)"),
      ],
      ["EFFECTIVE CAMERA UPTIME INDEX", `${data.cameraOnlineRate}%`],
    ];

    autoTable(doc, {
      startY: y,
      head: [],
      body: dtRows,
      theme: "plain",
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
        textColor: [...SLATE_700],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 70, textColor: [...SLATE_900] },
        1: { cellWidth: contentWidth - 70 },
      },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ─── 1. PERFORMANCE TREND ──────────────────────────────────
  checkPage(40);
  if (data.periodType === "current") {
    sectionTitle("1. PERFORMANCE TREND ANALYSIS (CURRENT)");
    subLabel("Trend analysis is available for historical reporting periods only: DAILY / WEEKLY / MONTHLY / CUSTOM.");
    y += 8;
  } else if (data.trendData && data.trendData.length > 0) {
    sectionTitle(`1. PERFORMANCE TREND ANALYSIS (${data.periodType.toUpperCase()})`);
    subLabel(`Online camera ratio vs alarm frequency dataset for ${data.selectedServerLabel}`);

    autoTable(doc, {
      startY: y,
      head: [["#", "TIME / INTERVAL", "ONLINE CAMERAS", "ALARM INCIDENTS", "HEALTH SCORE"]],
      body: data.trendData.map((item, idx) => [
        idx + 1,
        item.label,
        item.cameras !== null && item.cameras !== undefined ? `${item.cameras} / ${data.totalCameras} ONLINE` : "N/A",
        `${item.alarms} ALARMS LOGGED`,
        item.healthScore !== null && item.healthScore !== undefined ? `${item.healthScore}% HEALTH` : "N/A",
      ]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    sectionTitle(`1. PERFORMANCE TREND ANALYSIS (${data.periodType.toUpperCase()})`);
    subLabel(`Online camera ratio vs alarm frequency dataset for ${data.selectedServerLabel}`);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...SLATE_200);
    doc.roundedRect(margin.left, y, contentWidth, 14, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_700);
    doc.text("STATUS: N/A — PERFORMANCE TREND DATASET NOT AVAILABLE FOR THIS PERIOD.", margin.left + 4, y + 8);
    y += 18;
  }

  // ─── 2. CAMERA REPORT / INVENTORY ───────────────────────────
  checkPage(45);
  sectionTitle(`2. DETAILED CAMERA INVENTORY REPORT (${data.cameras.length} UNITS)`);
  subLabel("Complete centralized camera inventory matching current monitoring status.");

  if (data.cameras.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["#", "CAMERA NAME", "SERVER", "STATUS", "OFFLINE EXACT TIME", "IP ADDRESS", "VENDOR / MODEL", "UPTIME RATE"]],
      body: data.cameras.map((cam, idx) => [
        idx + 1,
        cam.name,
        cam.serverName,
        cam.status,
        cam.status === "OFFLINE" ? cam.exactOfflineTime || "N/A" : "—",
        cam.ipAddress,
        cam.vendorModel,
        cam.status === "OFFLINE" && cam.exactOfflineTime ? `OFFLINE (Since: ${cam.exactOfflineTime})` : cam.uptimeRate,
      ]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 3) {
          const val = String(hookData.cell.raw);
          if (val === "ONLINE") {
            hookData.cell.styles.textColor = [...GREEN_600];
            hookData.cell.styles.fontStyle = "bold";
          } else {
            hookData.cell.styles.textColor = [...RED_600];
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    subLabel("No camera inventory data available.");
    y += 8;
  }

  // ─── 3. OFFLINE CAMERA SUMMARY ──────────────────────────────
  checkPage(45);
  if (data.periodType === "current") {
    sectionTitle("3. CURRENT OFFLINE CAMERA SUMMARY");
    subLabel("Current camera connectivity status across all monitored systems.");

    if (data.offlineCameras.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "CAMERA NAME", "CAMERA ID", "SERVER", "STATUS", "WHEN OFFLINE (EXACT TIME)"]],
        body: data.offlineCameras.map((item, idx) => [
          idx + 1,
          item.cameraName,
          item.cameraId || "N/A",
          item.serverName,
          item.status,
          item.firstOffline || "N/A",
        ]),
        theme: "striped",
        showHead: "everyPage",
        headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
        bodyStyles: { fontSize: 7.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin.left, right: margin.right },
        tableWidth: contentWidth,
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 4) {
            const val = String(hookData.cell.raw);
            if (val === "ONLINE") {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    } else {
      doc.setFillColor(...LIGHT_GREEN);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(margin.left, y, contentWidth, 12, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(22, 101, 52);
      doc.text("NO CAMERAS CURRENTLY OFFLINE.", margin.left + 4, y + 7);
      y += 18;
    }
  } else {
    sectionTitle(`3. ${data.offlineSummaryTitle || "OFFLINE CAMERA SUMMARY"}`);
    subLabel("Historical disconnect incidents and availability audit for the selected period.");

    if (data.offlineCameras.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "CAMERA NAME", "CAMERA ID", "SERVER", "STATUS", "WHEN OFFLINE (EXACT TIME)", "LAST RECOVERY / STATUS", "DURATION", "INCIDENTS", "AVAILABILITY RATE"]],
        body: data.offlineCameras.map((item, idx) => {
          let whenOffline = item.firstOffline;
          if (item.incidents && item.incidents.length > 1) {
            whenOffline += ` (${item.incidents.length} inc)`;
          }
          return [
            idx + 1,
            item.cameraName,
            item.cameraId || "N/A",
            item.serverName,
            item.status,
            whenOffline,
            item.lastOffline === "OFFLINE UNTIL NOW" ? "OFFLINE UNTIL NOW" : item.lastOffline,
            item.offlineDuration,
            String(item.incidentCount),
            item.availabilityRate,
          ];
        }),
        theme: "striped",
        showHead: "everyPage",
        headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
        bodyStyles: { fontSize: 7.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin.left, right: margin.right },
        tableWidth: contentWidth,
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 4) {
            const val = String(hookData.cell.raw);
            if (val === "ONLINE") {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
          if (hookData.section === "body" && hookData.column.index === 9) {
            const val = String(hookData.cell.raw);
            if (val.includes("100%") || val.includes("ONLINE")) {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    } else {
      doc.setFillColor(...LIGHT_GREEN);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(margin.left, y, contentWidth, 12, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(22, 101, 52);
      doc.text("NO OFFLINE CAMERA INCIDENTS RECORDED IN THIS PERIOD.", margin.left + 4, y + 7);
      y += 18;
    }
  }

  // ─── 3b. CAMERA INCIDENT DETAIL (INDIVIDUAL INCIDENTS PER CAMERA — Historical Only) ───
  const camerasWithIncidents = (data.offlineCameras || []).filter(
    (cam) => cam.incidents && cam.incidents.length > 0
  );

  if (data.periodType !== "current" && camerasWithIncidents.length > 0) {
    checkPage(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ORIX_NAVY);
    doc.text("CAMERA INCIDENT DETAIL", margin.left, y);
    y += 5;

    const m = data.alarmEventMetrics;
    const totalCamsWithInc = camerasWithIncidents.length;
    const totalInc = camerasWithIncidents.reduce(
      (sum, c) => sum + (c.incidents?.length ?? 0),
      0
    );
    const resolvedInc =
      m?.resolvedIncidents !== undefined
        ? m.resolvedIncidents
        : camerasWithIncidents.reduce(
            (sum, c) =>
              sum + (c.incidents?.filter((i) => i.status === "RECOVERED").length ?? 0),
            0
          );
    const activeInc =
      m?.activeIncidents !== undefined
        ? m.activeIncidents
        : camerasWithIncidents.reduce(
            (sum, c) =>
              sum +
              (c.incidents?.filter((i) => i.status === "STILL OFFLINE").length ?? 0),
            0
          );
    const totalDt = m?.totalDowntimeFormatted ?? "—";

    subLabel(
      `${totalCamsWithInc} camera(s) with incidents  •  ${totalInc} total incident(s)  •  ${resolvedInc} resolved  •  ${activeInc} active  •  Total downtime: ${totalDt}`
    );

    camerasWithIncidents.forEach((cam) => {
      // Sort incidents OLDEST -> NEWEST (offlineTimestampMs ASC) on a shallow copy
      const sortedIncidents = [...(cam.incidents || [])].sort(
        (a, b) => (a.offlineTimestampMs ?? 0) - (b.offlineTimestampMs ?? 0)
      );

      checkPage(25);

      // Camera sub-header block
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(...SLATE_200);
      doc.roundedRect(margin.left, y, contentWidth, 7, 1, 1, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...SLATE_900);
      doc.text(`CAMERA: ${(cam.cameraName || "").toUpperCase()}`, margin.left + 3, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_500);
      doc.text(
        `SERVER: ${cam.serverName}  |  STATUS: ${cam.status}  |  INCIDENTS: ${cam.incidentCount}`,
        margin.left + contentWidth - 3,
        y + 5,
        { align: "right" }
      );
      y += 9;

      const incidentRows = sortedIncidents.map((inc) => {
        const isStillOffline =
          inc.status === "STILL OFFLINE" || inc.onlineTime.includes("OFFLINE UNTIL NOW");
        const recoveryTimeDisplay = isStillOffline
          ? "NOT RECOVERED"
          : inc.onlineTime.replace(/^BACK ONLINE:\s*/, "");
        const statusDisplay = isStillOffline ? "ACTIVE" : "RECOVERED";

        return [
          inc.incidentNumber,
          inc.offlineTime,
          recoveryTimeDisplay,
          inc.duration,
          statusDisplay,
          inc.reason || "—",
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["#", "OFFLINE", "RECOVERY", "DURATION", "STATUS", "REASON"]],
        body: incidentRows,
        theme: "striped",
        showHead: "everyPage",
        headStyles: {
          fillColor: [...SLATE_700],
          fontSize: 7.5,
          fontStyle: "bold",
          textColor: [...WHITE],
        },
        bodyStyles: { fontSize: 7.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin.left, right: margin.right },
        tableWidth: contentWidth,
        columnStyles: {
          5: { cellWidth: "auto", overflow: "linebreak" },
        },
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 4) {
            const val = String(hookData.cell.raw);
            if (val === "RECOVERED") {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else if (val === "ACTIVE") {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
          if (hookData.section === "body" && hookData.column.index === 2) {
            const val = String(hookData.cell.raw);
            if (val.includes("NOT RECOVERED")) {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 6;
    });

    y += 4;
  }

  // ─── 4. RECORDING SERVER & STORAGE ─────────────────────────
  checkPage(45);
  sectionTitle("4. RECORDING SERVER & STORAGE REPORT");
  subLabel("Recording server storage consumption overview and disk-level hard drive breakdown.");

  if (data.serverStorageStats && data.serverStorageStats.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...ORIX_NAVY);
    doc.text("4.1 RECORDING SERVER STORAGE CONSUMPTION OVERVIEW", margin.left, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [["#", "SERVER NAME", "STATUS", "USED / TOTAL CAPACITY", "FREE SPACE", "USAGE %", "DISKS"]],
      body: data.serverStorageStats.map((srv, idx) => [
        idx + 1,
        srv.name,
        srv.isOnline ? "ONLINE" : "OFFLINE",
        srv.usedGb !== "STORAGE DATA NOT AVAILABLE FROM SOURCE" ? `${srv.usedGb} GB / ${srv.totalGb} GB` : "STORAGE DATA NOT AVAILABLE FROM SOURCE",
        srv.freeGb !== "STORAGE DATA NOT AVAILABLE FROM SOURCE" ? `${srv.freeGb} GB` : "N/A",
        `${srv.usedPct}%`,
        srv.diskCount,
      ]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  checkPage(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...ORIX_NAVY);
  doc.text("4.2 RECORDING SERVER STORAGE & HARD DRIVE BREAKDOWN", margin.left, y);
  y += 3;

  if (data.serverDisks && data.serverDisks.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["#", "SERVER", "DISK DRIVE", "STATUS", "TOTAL CAPACITY", "USED CAPACITY", "FREE SPACE", "USAGE %"]],
      body: data.serverDisks.map((d, idx) => [
        idx + 1,
        d.serverName,
        d.diskName,
        d.status,
        d.total,
        d.used,
        d.free,
        d.usagePct,
      ]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    subLabel("No storage data available from source.");
    y += 8;
  }

  // ─── 5. SYSTEM HEALTH REPORT ─────────────────────────────────
  checkPage(45);
  sectionTitle(`5. SYSTEM HEALTH REPORT (${data.servers.length} SERVERS)`);
  subLabel("Server hardware host metrics and operating environment status.");

  if (data.servers.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["#", "SERVER NAME", "STATUS", "SOFTWARE VERSION", "OPERATING SYSTEM", "CPU USAGE", "RAM MEMORY", "DISKS", "STORAGE CONSUMED"]],
      body: data.servers.map((srv, idx) => [
        idx + 1,
        srv.serverName,
        srv.status,
        srv.version,
        srv.osName,
        srv.cpuUsage,
        srv.ramUsage,
        srv.diskCount,
        srv.storageUsage,
      ]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 2) {
          const val = String(hookData.cell.raw);
          if (val === "ONLINE") {
            hookData.cell.styles.textColor = [...GREEN_600];
            hookData.cell.styles.fontStyle = "bold";
          } else {
            hookData.cell.styles.textColor = [...RED_600];
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    subLabel("No server health data available.");
    y += 8;
  }

  // ─── 6. SERVER OUTAGE & DOWNTIME AUDIT / LIVE SERVER OVERVIEW ───
  checkPage(45);
  if (data.periodType === "current") {
    sectionTitle("6. LIVE SERVER STATUS OVERVIEW");
    subLabel("Host server live status and resource metrics.");

    const liveServerRows = data.servers.map((srv, idx) => [
      idx + 1,
      srv.serverName,
      srv.status,
      srv.version || "N/A",
      srv.osName || "N/A",
      srv.storageUsage || "N/A",
      srv.cpuUsage || "N/A",
      srv.ramUsage || "N/A",
    ]);

    if (liveServerRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "SERVER NAME", "CURRENT STATUS", "SOFTWARE VERSION", "OPERATING SYSTEM", "STORAGE CONSUMED", "CPU USAGE", "RAM MEMORY"]],
        body: liveServerRows,
        theme: "striped",
        showHead: "everyPage",
        headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
        bodyStyles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin.left, right: margin.right },
        tableWidth: contentWidth,
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 2) {
            const val = String(hookData.cell.raw);
            if (val === "ONLINE") {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    } else {
      subLabel("No live server data available.");
      y += 8;
    }
  } else {
    sectionTitle("6. SERVER OUTAGE & DOWNTIME AUDIT");
    subLabel("Host server live status and historical period uptime audit derived from VMS server failure and recovery events.");

    const serverOutageRows = data.serverUptimeResults && data.serverUptimeResults.length > 0
      ? data.serverUptimeResults!.map((item, idx) => {
          if (item.dataCompleteness === "DATA_NOT_AVAILABLE") {
            return [
              idx + 1,
              item.serverName,
              item.currentStatus,
              "DATA NOT AVAILABLE / INCOMPLETE SOURCE DATA",
              "DATA NOT AVAILABLE / INCOMPLETE SOURCE DATA",
              "DATA NOT AVAILABLE / INCOMPLETE SOURCE DATA",
              "0",
              "N/A",
            ];
          }
          if (
            item.isOfflinePlaceholder ||
            item.periodUptime?.includes("HISTORICAL UPTIME NOT AVAILABLE") ||
            (item.periodUptime === "N/A" && item.currentStatus === "OFFLINE")
          ) {
            return [
              idx + 1,
              item.serverName,
              "OFFLINE",
              "N/A",
              "OFFLINE UNTIL NOW",
              "N/A",
              "N/A",
              item.periodUptime || "N/A — SERVER CURRENTLY OFFLINE / HISTORICAL UPTIME NOT AVAILABLE",
            ];
          }
          return [
            idx + 1,
            item.serverName,
            item.currentStatus,
            item.firstOffline || "NO OFFLINE INCIDENTS",
            item.lastRecovery || (item.currentStatus === "ONLINE" ? "ONLINE" : "OFFLINE UNTIL NOW"),
            item.totalDowntime || "0m",
            String(item.incidentCount),
            item.periodUptime,
          ];
        })
      : (data.servers.length > 0 ? data.servers : (data.serverStorageStats || [])).map((srv: any, idx: number) => [
          idx + 1,
          srv.serverName || srv.name || `SERVER ${idx + 1}`,
          srv.status || (srv.isOnline ? "ONLINE" : "OFFLINE"),
          "DATA NOT AVAILABLE FROM SOURCE",
          "DATA NOT AVAILABLE FROM SOURCE",
          "DATA NOT AVAILABLE FROM SOURCE",
          "0",
          "N/A",
        ]);

    if (serverOutageRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["#", "SERVER NAME", "CURRENT STATUS", "FIRST OFFLINE", "LAST RECOVERY / STATUS", "TOTAL DOWNTIME", "INCIDENTS", "PERIOD UPTIME"]],
        body: serverOutageRows,
        theme: "striped",
        showHead: "everyPage",
        headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
        bodyStyles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin.left, right: margin.right },
        tableWidth: contentWidth,
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 2) {
            const val = String(hookData.cell.raw);
            if (val === "ONLINE") {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else {
              hookData.cell.styles.textColor = [...RED_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
          if (hookData.section === "body" && hookData.column.index === 7) {
            const val = String(hookData.cell.raw);
            if (val.includes("100%") || val.includes("99")) {
              hookData.cell.styles.textColor = [...GREEN_600];
              hookData.cell.styles.fontStyle = "bold";
            } else if (val.includes("N/A") || val.includes("DATA NOT AVAILABLE")) {
              hookData.cell.styles.textColor = [...SLATE_500];
            } else {
              hookData.cell.styles.textColor = [...AMBER_600];
              hookData.cell.styles.fontStyle = "bold";
            }
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    } else {
      subLabel("No server outage data available.");
      y += 8;
    }
  }

  // ─── SERVER INCIDENT DETAIL (INDIVIDUAL INCIDENTS PER SERVER — Historical Only) ───
  if (data.periodType !== "current" && data.serverUptimeResults && data.serverUptimeResults.length > 0) {
    const serversWithSessions = data.serverUptimeResults!.filter(
      (s) => s.outageSessions && s.outageSessions.length > 0
    );

    if (serversWithSessions.length > 0) {
      checkPage(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...ORIX_NAVY);
      doc.text("SERVER INCIDENT DETAIL", margin.left, y);
      y += 5;

      const isTruncated = data.serverUptimeResults!.some(
        (s) => s.dataCompleteness === "POTENTIALLY_TRUNCATED"
      );

      if (isTruncated) {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(248, 113, 113);
        doc.roundedRect(margin.left, y, contentWidth, 8, 1, 1, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...RED_600);
        doc.text(
          "DATA COMPLETENESS WARNING: Event retrieval reached the configured limit. Historical incident data may be incomplete.",
          margin.left + 3,
          y + 5.5
        );
        y += 11;
      }

      serversWithSessions.forEach((server) => {
        // Sort sessions OLDEST -> NEWEST (startTimeMs ASC) on a shallow copy
        const sortedSessions = [...server.outageSessions!].sort(
          (a, b) => a.startTimeMs - b.startTimeMs
        );

        checkPage(25);

        // Server sub-header block
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(...SLATE_200);
        doc.roundedRect(margin.left, y, contentWidth, 7, 1, 1, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...SLATE_900);
        doc.text(`SERVER: ${server.serverName.toUpperCase()}`, margin.left + 3, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...SLATE_500);
        doc.text(
          `STATUS: ${server.currentStatus}  |  TOTAL DOWNTIME: ${server.totalDowntime}  |  INCIDENTS: ${sortedSessions.length}`,
          margin.left + contentWidth - 3,
          y + 5,
          { align: "right" }
        );
        y += 9;

        const incidentRows = sortedSessions.map((sess, idx) => {
          const dateStr = formatDateJakarta(sess.startTimeMs);
          const offlineTimeStr = formatTimeJakarta(sess.startTimeMs);
          const recoveryTimeStr = sess.isActive
            ? "ACTIVE / NOT RECOVERED"
            : formatTimeJakarta(sess.endTimeMs);
          const durationStr = formatDurationPdf(sess.durationMs);
          const statusStr = sess.isActive ? "ACTIVE" : "RECOVERED";

          return [
            idx + 1,
            dateStr,
            offlineTimeStr,
            recoveryTimeStr,
            durationStr,
            statusStr,
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [["#", "DATE", "OFFLINE TIME", "RECOVERY TIME", "DURATION", "STATUS"]],
          body: incidentRows,
          theme: "striped",
          showHead: "everyPage",
          headStyles: {
            fillColor: [...SLATE_700],
            fontSize: 7.5,
            fontStyle: "bold",
            textColor: [...WHITE],
          },
          bodyStyles: { fontSize: 7.5, cellPadding: 2 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: margin.left, right: margin.right },
          tableWidth: contentWidth,
          didParseCell: (hookData) => {
            if (hookData.section === "body" && hookData.column.index === 5) {
              const val = String(hookData.cell.raw);
              if (val === "RECOVERED") {
                hookData.cell.styles.textColor = [...GREEN_600];
                hookData.cell.styles.fontStyle = "bold";
              } else if (val === "ACTIVE") {
                hookData.cell.styles.textColor = [...RED_600];
                hookData.cell.styles.fontStyle = "bold";
              }
            }
            if (hookData.section === "body" && hookData.column.index === 3) {
              const val = String(hookData.cell.raw);
              if (val.includes("ACTIVE")) {
                hookData.cell.styles.textColor = [...RED_600];
                hookData.cell.styles.fontStyle = "bold";
              }
            }
          },
        });

        y = (doc as any).lastAutoTable.finalY + 6;
      });

      y += 4;
    }
  }

  // ─── 7. ALARM EVENTS REPORT ─────────────────────────────────
  checkPage(50);
  sectionTitle(`7. ALARM EVENTS REPORT (${data.alarms.length} TOTAL EVENTS)`);
  subLabel("Executive summary of security incidents, hardware alerts, and event severity distribution.");

  const analysis = analyzeEvents(data.alarms);

  if (analysis.total === 0) {
    doc.setFillColor(...LIGHT_GREEN);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin.left, y, contentWidth, 12, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(22, 101, 52);
    doc.text("NO SECURITY ALARMS OR UNEXPECTED HARDWARE DISCONNECTIONS LOGGED IN THIS PERIOD.", margin.left + 4, y + 7);
    y += 18;
  } else {
    const kpiH = 16;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...SLATE_200);
    doc.roundedRect(margin.left, y, contentWidth, kpiH, 1.5, 1.5, "FD");

    const kpiW = contentWidth / 4;
    const kpiY = y;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...RED_600);
    doc.text(`${analysis.criticalCount} (${analysis.criticalPct})`, margin.left + 4, kpiY + 7);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_500);
    doc.text("CRITICAL SEVERITY", margin.left + 4, kpiY + 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...AMBER_600);
    doc.text(`${analysis.warningCount} (${analysis.warningPct})`, margin.left + kpiW + 4, kpiY + 7);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_500);
    doc.text("WARNING ALERTS", margin.left + kpiW + 4, kpiY + 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLUE_600);
    doc.text(`${analysis.infoCount} (${analysis.infoPct})`, margin.left + kpiW * 2 + 4, kpiY + 7);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_500);
    doc.text("INFO LOGS", margin.left + kpiW * 2 + 4, kpiY + 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_900);
    const topCat = analysis.topCategory.length > 30 ? `${analysis.topCategory.slice(0, 30)}...` : analysis.topCategory;
    doc.text(topCat, margin.left + kpiW * 3 + 4, kpiY + 7);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_500);
    doc.text("PRIMARY INCIDENT CATEGORY", margin.left + kpiW * 3 + 4, kpiY + 12);

    y += kpiH + 5;

    // Severity breakdown
    checkPage(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...ORIX_NAVY);
    doc.text("7.1 INCIDENTS BY SEVERITY LEVEL", margin.left, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [["SEVERITY LEVEL", "TOTAL EVENTS", "% OF TOTAL", "OPERATIONAL IMPACT"]],
      body: analysis.severityRows.map((r) => [r.level, String(r.count), r.pct, r.impact]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 0) {
          const val = String(hookData.cell.raw);
          if (val === "CRITICAL") { hookData.cell.styles.textColor = [...RED_600]; hookData.cell.styles.fontStyle = "bold"; }
          else if (val === "WARNING") { hookData.cell.styles.textColor = [...AMBER_600]; hookData.cell.styles.fontStyle = "bold"; }
          else { hookData.cell.styles.textColor = [...BLUE_600]; hookData.cell.styles.fontStyle = "bold"; }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;

    // Category breakdown
    checkPage(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...ORIX_NAVY);
    doc.text("7.2 INCIDENTS BY EVENT CATEGORY", margin.left, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [["INCIDENT CATEGORY", "PRIMARY SEVERITY", "OCCURRENCES", "% SHARE", "AFFECTED DEVICES"]],
      body: analysis.categoryRows.map((c) => [c.category, c.severity, String(c.count), c.pct, c.sources]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
    });
    y = (doc as any).lastAutoTable.finalY + 5;

    // Top affected sources
    if (analysis.sourceRows.length > 0) {
      checkPage(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...ORIX_NAVY);
      doc.text("7.3 TOP AFFECTED HARDWARE & SOURCES", margin.left, y);
      y += 3;

      autoTable(doc, {
        startY: y,
        head: [["#", "SOURCE / HARDWARE NAME", "CRITICAL", "WARNINGS", "TOTAL INCIDENTS", "% SHARE"]],
        body: analysis.sourceRows.map((s, i) => [i + 1, s.source, String(s.critical), String(s.warnings), String(s.total), s.pct]),
        theme: "striped",
        showHead: "everyPage",
        headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
        bodyStyles: { fontSize: 7.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin.left, right: margin.right },
        tableWidth: contentWidth,
      });
      y = (doc as any).lastAutoTable.finalY + 5;
    }
  }

  // ─── 8. DETAILED EVENT & ALARM LOG ───────────────────────────
  checkPage(40);
  if (data.alarms.length > 0) {
    const analystPresentation = buildAnalystRelevantEventLog(data.alarms);

    sectionTitle(
      `8. DETAILED SECURITY EVENT & ALARM LOG (${analystPresentation.canonicalCount} SOURCE EVENTS • ${analystPresentation.presentationItems.length} ANALYST PRESENTATION ITEMS)`
    );
    subLabel("Chronological audit log of events received from monitored VMS endpoints.");


    const alarmRows = analystPresentation.presentationItems.map((a: any, idx: number) => {
      if (a.isSummary) {
        return [
          idx + 1,
          a.sourceName || "S3 CLOUD BRIDGE",
          a.systemName || data.selectedServerLabel,
          a.severity,
          a.firstFormattedTime && a.lastFormattedTime ? `${a.firstFormattedTime} → ${a.lastFormattedTime}` : "TELEMETRY WINDOW",
          `[SUMMARY OF ${a.count} REPEATED TELEMETRY LOGS] ${a.representativeCaption} - ${a.representativeDescription}`,
        ];
      }
      return [
        idx + 1,
        a.source,
        a.systemName || data.selectedServerLabel,
        a.severity,
        a.timestamp,
        a.description,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["#", "EVENT SOURCE / DEVICE", "SYSTEM / LOCATION", "SEVERITY", "TIMESTAMP", "DESCRIPTION"]],
      body: alarmRows,
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
      columnStyles: {
        5: { cellWidth: "auto", overflow: "linebreak" },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 3) {
          const val = String(hookData.cell.raw).toLowerCase();
          if (val.includes("crit") || val.includes("error")) {
            hookData.cell.styles.textColor = [...RED_600];
            hookData.cell.styles.fontStyle = "bold";
          } else if (val.includes("warn")) {
            hookData.cell.styles.textColor = [...AMBER_600];
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    subLabel("No events logged in this period.");
    y += 8;
  }

  // ─── 9. S3 CLOUD BRIDGE PERFORMANCE ────────────────────────
  checkPage(30);
  sectionTitle("9. S3 CLOUD BRIDGE PERFORMANCE");

  if (data.s3Logs && data.s3Logs.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["LOG TIME", "UPLOAD SPEED", "INCOMING SPEED", "CACHE FILL %", "QUEUE DEPTH", "CLOUD STATUS"]],
      body: data.s3Logs.map((s) => [s.time, s.uploadSpeed, s.incomingSpeed, s.cacheFill, s.queueDepth, s.status]),
      theme: "striped",
      showHead: "everyPage",
      headStyles: { fillColor: [...ORIX_NAVY], fontSize: 8, fontStyle: "bold", textColor: [...WHITE] },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin.left, right: margin.right },
      tableWidth: contentWidth,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...SLATE_200);
    doc.roundedRect(margin.left, y, contentWidth, 16, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_700);
    doc.text("STATUS: N/A — S3 DATA NOT AVAILABLE — NO ACTIVE S3 DATA SOURCE CONFIGURED", margin.left + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(
      "No live S3 API endpoint is configured in this deployment. To enable S3 Cloud Bridge reporting, connect an active S3 data source.",
      margin.left + 4,
      y + 12
    );
    y += 22;
  }

  // ─── FOOTERS ON ALL PAGES ─────────────────────────────────
  const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  doc.save(fileName);
}
