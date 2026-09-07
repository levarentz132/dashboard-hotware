import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ORIX_LOGO_SVG, ORIX_LOGO_BASE64_PNG } from "@/assets/orix-logo";

export interface CameraReportItem {
  id: string;
  name: string;
  serverName: string;
  status: "ONLINE" | "OFFLINE";
  ipAddress: string;
  vendorModel: string;
  resolutionFps: string;
  uptimeRate: string;
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
}

export interface S3LogItem {
  time: string;
  uploadSpeed: string;
  incomingSpeed: string;
  cacheFill: string;
  queueDepth: string;
  status: string;
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
  totalAlarms: number;
  criticalAlarms: number;
  warningAlarms: number;
  totalOfflineIncidents: number;
  
  // Dynamic Title
  offlineSummaryTitle: string;

  // Tables
  cameras: CameraReportItem[];
  offlineCameras: OfflineCameraItem[];
  servers: ServerHealthItem[];
  serverDisks: ServerStorageDiskItem[];
  alarms: AlarmReportItem[];
  s3Logs: S3LogItem[];
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
              <div class="card-lbl">CURRENT CAMERA ONLINE RATE</div>
              <div class="card-sub">${data.onlineCameras} / ${data.totalCameras} CAMERAS ONLINE</div>
            </td>
            <td>
              <div class="card-val" style="color: #16a34a;">${data.serverOnlineRate}%</div>
              <div class="card-lbl">SERVER HEALTH INDEX</div>
              <div class="card-sub">${data.onlineServers} / ${data.totalServers} SERVERS ONLINE</div>
            </td>
            <td>
              <div class="card-val" style="color: #d97706;">${data.totalAlarms}</div>
              <div class="card-lbl">TOTAL ALARM EVENTS</div>
              <div class="card-sub">${data.criticalAlarms} CRITICAL, ${data.warningAlarms} WARNING</div>
            </td>
            <td>
              <div class="card-val" style="color: #dc2626;">${data.totalOfflineIncidents}</div>
              <div class="card-lbl">OFFLINE INCIDENTS</div>
              <div class="card-sub">${data.offlineCamerasCount} CAMERAS CURRENTLY OFFLINE</div>
            </td>
          </tr>
        </table>

        <!-- SECTION 1: SERVER STORAGE DISK BREAKDOWN -->
        <h3>SERVER STORAGE &amp; HARD DRIVE BREAKDOWN</h3>
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
        <h3>${data.offlineSummaryTitle || "OFFLINE CAMERA SUMMARY"}</h3>
        <p style="font-size: 11px; color: #64748b; margin-bottom: 8px;">HISTORICAL DISCONNECT INCIDENTS &amp; AVAILABILITY AUDIT FOR THE SELECTED PERIOD</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SERVER</th>
              <th>CAMERA NAME</th>
              <th>CAMERA ID</th>
              <th>STATUS</th>
              <th>FIRST OFFLINE</th>
              <th>LAST OFFLINE</th>
              <th>OFFLINE DURATION</th>
              <th>INCIDENTS</th>
              <th>AVAILABILITY RATE</th>
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
                <td>${item.firstOffline}</td>
                <td>${item.lastOffline}</td>
                <td>${item.offlineDuration}</td>
                <td style="text-align: center; font-weight: bold;">${item.incidentCount}</td>
                <td style="font-weight: bold; color: ${item.availabilityRate === '100%' ? '#16a34a' : '#dc2626'};">${item.availabilityRate}</td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="10" style="text-align: center; color: #64748b;">NO OFFLINE INCIDENTS RECORDED IN THIS PERIOD</td></tr>`
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

        <!-- SECTION 4: CAMERA INVENTORY REPORT -->
        <h3>DETAILED CAMERA INVENTORY REPORT (${data.cameras.length} UNITS)</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>CAMERA NAME</th>
              <th>SERVER</th>
              <th>STATUS</th>
              <th>ENDPOINT / IP</th>
              <th>VENDOR / MODEL</th>
              <th>RESOLUTION / FPS</th>
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
                <td><span class="${cam.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}">${cam.status}</span></td>
                <td><code>${cam.ipAddress}</code></td>
                <td>${cam.vendorModel}</td>
                <td>${cam.resolutionFps}</td>
                <td><strong>${cam.uptimeRate}</strong></td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="8" style="text-align: center; color: #64748b;">NO CAMERA DATA AVAILABLE</td></tr>`
            }
          </tbody>
        </table>

        <!-- SECTION 5: ALARM EVENTS -->
        <h3>ALARM EVENTS &amp; SECURITY INCIDENTS (${data.alarms.length} EVENTS)</h3>
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
            ${
              data.alarms.length > 0
                ? data.alarms
                    .map(
                      (a, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${a.source}</strong></td>
                <td><span class="${a.severity.toLowerCase().includes('error') || a.severity.toLowerCase().includes('crit') ? 'badge-offline' : 'badge-warning'}">${a.severity}</span></td>
                <td>${a.timestamp}</td>
                <td>${a.description}</td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="5" style="text-align: center; color: #64748b;">NO ALARM EVENTS LOGGED IN THIS PERIOD</td></tr>`
            }
          </tbody>
        </table>

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
 */
export function exportToPdf(data: FullReportData) {
  const fileName = `ORIX_INDONESIA_FINANCE_REPORT_${data.dateTo}.pdf`;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let startY = 15;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(10, 10, pageWidth - 20, 26, "F");

  // ORIX Brand Logo Accent (Top Left)
  try {
    doc.addImage(ORIX_LOGO_BASE64_PNG, "PNG", 14, 12, 20, 22);
  } catch {
    doc.setFillColor(0, 43, 102); // ORIX Navy
    doc.roundedRect(14, 13, 22, 20, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("ORIX", 17, 25);
  }

  // Corporate Header Titles
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(data.companyName, 40, 19);

  doc.setFontSize(10);
  doc.setTextColor(96, 165, 250); // blue-400
  doc.text(`${data.dashboardTitle} — EXECUTIVE REPORTING`, 40, 25);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`PERIOD: ${data.periodLabel} | SERVER: ${data.selectedServerLabel} | GENERATED: ${data.generatedAt}`, 40, 31);

  startY = 42;

  // Key Summary Metrics Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, startY, pageWidth - 20, 18, 2, 2, "FD");

  const cardWidth = (pageWidth - 20) / 4;

  // Card 1: Camera Status
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text(`${data.cameraOnlineRate}%`, 15, startY + 8);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("CURRENT CAMERA ONLINE RATE", 15, startY + 13);

  // Card 2: Server Health
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 163, 74);
  doc.text(`${data.serverOnlineRate}%`, 15 + cardWidth, startY + 8);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("SERVER HEALTH INDEX", 15 + cardWidth, startY + 13);

  // Card 3: Total Alarms
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(217, 119, 6);
  doc.text(`${data.totalAlarms}`, 15 + cardWidth * 2, startY + 8);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL ALARM EVENTS", 15 + cardWidth * 2, startY + 13);

  // Card 4: Offline Incidents
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38);
  doc.text(`${data.totalOfflineIncidents}`, 15 + cardWidth * 3, startY + 8);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("OFFLINE INCIDENTS", 15 + cardWidth * 3, startY + 13);

  startY += 24;

  // Section 1: SERVER STORAGE DISK BREAKDOWN
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 43, 102);
  doc.text("SERVER STORAGE & HARD DRIVE BREAKDOWN", 10, startY);
  startY += 3;

  if (data.serverDisks && data.serverDisks.length > 0) {
    autoTable(doc, {
      startY,
      head: [["#", "SERVER NAME", "DISK DRIVE", "STATUS", "TOTAL", "USED", "FREE", "USAGE %"]],
      body: data.serverDisks.map((d, index) => [
        index + 1,
        d.serverName,
        d.diskName,
        d.status,
        d.total,
        d.used,
        d.free,
        d.usagePct,
      ]),
      theme: "striped",
      headStyles: { fillColor: [0, 43, 102], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7 },
      margin: { left: 10, right: 10 },
    });
    startY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text("STORAGE DATA NOT AVAILABLE FROM SOURCE", 10, startY + 5);
    startY += 12;
  }

  // Section 2: DYNAMIC OFFLINE CAMERA SUMMARY
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = 15;
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 43, 102);
  doc.text(data.offlineSummaryTitle || "OFFLINE CAMERA SUMMARY", 10, startY);
  startY += 3;

  autoTable(doc, {
    startY,
    head: [
      ["#", "SERVER", "CAMERA NAME", "CAMERA ID", "STATUS", "FIRST OFFLINE", "LAST OFFLINE", "DURATION", "INCIDENTS", "AVAILABILITY"],
    ],
    body: data.offlineCameras.map((item, index) => [
      index + 1,
      item.serverName,
      item.cameraName,
      item.cameraId,
      item.status,
      item.firstOffline,
      item.lastOffline,
      item.offlineDuration,
      item.incidentCount,
      item.availabilityRate,
    ]),
    theme: "striped",
    headStyles: { fillColor: [0, 43, 102], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7 },
    margin: { left: 10, right: 10 },
  });

  startY = (doc as any).lastAutoTable.finalY + 10;

  // Section 3: SERVER HEALTH REPORT
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = 15;
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 43, 102);
  doc.text(`SYSTEM HEALTH & SERVER REPORT (${data.servers.length} SERVERS)`, 10, startY);
  startY += 3;

  autoTable(doc, {
    startY,
    head: [
      ["#", "SERVER NAME", "STATUS", "NX VERSION", "OPERATING SYSTEM", "CPU USAGE", "RAM USAGE", "DISKS", "STORAGE"],
    ],
    body: data.servers.map((srv, index) => [
      index + 1,
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
    headStyles: { fillColor: [0, 43, 102], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7 },
    margin: { left: 10, right: 10 },
  });

  startY = (doc as any).lastAutoTable.finalY + 10;

  // Section 4: CAMERA INVENTORY
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = 15;
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 43, 102);
  doc.text(`CAMERA INVENTORY REPORT (${data.cameras.length} UNITS)`, 10, startY);
  startY += 3;

  autoTable(doc, {
    startY,
    head: [
      ["#", "CAMERA NAME", "SERVER", "STATUS", "ENDPOINT / IP", "VENDOR / MODEL", "RESOLUTION / FPS", "HISTORICAL AVAILABILITY"],
    ],
    body: data.cameras.map((cam, index) => [
      index + 1,
      cam.name,
      cam.serverName,
      cam.status,
      cam.ipAddress,
      cam.vendorModel,
      cam.resolutionFps,
      cam.uptimeRate,
    ]),
    theme: "striped",
    headStyles: { fillColor: [0, 43, 102], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7 },
    margin: { left: 10, right: 10 },
  });

  startY = (doc as any).lastAutoTable.finalY + 10;

  // Section 5: ALARM EVENTS
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = 15;
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 43, 102);
  doc.text(`ALARM EVENTS & SECURITY INCIDENTS (${data.alarms.length} EVENTS)`, 10, startY);
  startY += 3;

  autoTable(doc, {
    startY,
    head: [["#", "SOURCE / NAME", "SEVERITY", "TIMESTAMP", "DESCRIPTION"]],
    body: data.alarms.map((a, index) => [
      index + 1,
      a.source,
      a.severity,
      a.timestamp,
      a.description,
    ]),
    theme: "striped",
    headStyles: { fillColor: [0, 43, 102], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7 },
    margin: { left: 10, right: 10 },
  });

  startY = (doc as any).lastAutoTable.finalY + 10;

  // Section 6: S3 LOGS
  if (startY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    startY = 15;
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 43, 102);
  doc.text("S3 CLOUD BRIDGE STORAGE SYNC LOGS", 10, startY);
  startY += 3;

  const s3Body =
    data.s3Logs.length > 0
      ? data.s3Logs.map((s3) => [
          s3.time,
          s3.uploadSpeed,
          s3.incomingSpeed,
          s3.cacheFill,
          s3.queueDepth,
          s3.status,
        ])
      : [["S3 DATA NOT AVAILABLE — NO ACTIVE S3 DATA SOURCE CONFIGURED", "", "", "", "", ""]];

  autoTable(doc, {
    startY,
    head: [["LOG TIME", "UPLOAD RATE", "INCOMING SPEED", "CACHE FILL %", "QUEUE DEPTH", "STATUS"]],
    body: s3Body,
    theme: "striped",
    headStyles: { fillColor: [0, 43, 102], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7 },
    margin: { left: 10, right: 10 },
  });

  // Footer on all pages
  const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `CONFIDENTIAL • ${data.companyName} (${data.dashboardTitle}) • PAGE ${i} OF ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: "center" }
    );
  }

  doc.save(fileName);
}
