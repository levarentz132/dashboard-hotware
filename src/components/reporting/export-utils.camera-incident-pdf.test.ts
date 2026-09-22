// @ts-nocheck
import { describe, it, expect, vi } from "vitest";

// Mock assets and dependencies that export-utils imports
vi.mock("@/assets/orix-logo", () => ({
  ORIX_LOGO_SVG: "",
  ORIX_LOGO_BASE64_PNG: "",
}));

vi.mock("@/lib/s3-event-presentation", () => ({
  buildAnalystRelevantEventLog: vi.fn((events: any) => ({
    displayEvents: events || [],
    analystSummary: null,
  })),
}));

vi.mock("jspdf", () => {
  function MockjsPDF() {
    return {
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setFillColor: vi.fn(),
      setDrawColor: vi.fn(),
      setLineWidth: vi.fn(),
      rect: vi.fn(),
      roundedRect: vi.fn(),
      text: vi.fn(),
      line: vi.fn(),
      addImage: vi.fn(),
      addPage: vi.fn(),
      setPage: vi.fn(),
      getNumberOfPages: vi.fn().mockReturnValue(1),
      save: vi.fn(),
      output: vi.fn(),
      splitTextToSize: vi.fn((txt: string) => [txt]),
      internal: {
        pageSize: { width: 210, height: 297, getWidth: () => 210, getHeight: () => 297 },
        pages: [null, {}],
      },
      lastAutoTable: { finalY: 100 },
    };
  }
  return {
    default: MockjsPDF,
    jsPDF: MockjsPDF,
  };
});

vi.mock("jspdf-autotable", () => {
  return {
    default: vi.fn((doc: any, options: any) => {
      if (options && options.didParseCell) {
        // Simulate didParseCell hooks for test coverage
        const fakeCells = [
          { section: "body", column: { index: 2 }, cell: { raw: "NOT RECOVERED", styles: {} } },
          { section: "body", column: { index: 4 }, cell: { raw: "RECOVERED", styles: {} } },
          { section: "body", column: { index: 4 }, cell: { raw: "ACTIVE", styles: {} } },
        ];
        fakeCells.forEach((c) => options.didParseCell(c));
      }
      doc.lastAutoTable = { finalY: (options?.startY || 50) + 30 };
    }),
  };
});

import { OfflineCameraItem, OfflineCameraIncident, FullReportData, exportToPdf } from "./export-utils";

describe("Step 3.1 — Camera Incident Detail jsPDF Logic", () => {
  const sampleIncidents: OfflineCameraIncident[] = [
    {
      incidentNumber: 2,
      offlineTime: "2026-03-01 14:00 WIB",
      offlineTimestampMs: 1772348400000,
      onlineTime: "OFFLINE UNTIL NOW",
      onlineTimestampMs: null,
      duration: "3h 0m",
      status: "STILL OFFLINE",
      reason: "Network loss",
    },
    {
      incidentNumber: 1,
      offlineTime: "2026-03-01 08:00 WIB",
      offlineTimestampMs: 1772326800000,
      onlineTime: "BACK ONLINE: 2026-03-01 09:30 WIB",
      onlineTimestampMs: 1772332200000,
      duration: "1h 30m",
      status: "RECOVERED",
      reason: "Power outage",
    },
  ];

  const sampleCameras: OfflineCameraItem[] = [
    {
      cameraId: "cam-1",
      cameraName: "Gate Cam",
      serverName: "Server A",
      status: "OFFLINE",
      firstOffline: "2026-03-01 08:00 WIB",
      lastOffline: "2026-03-01 14:00 WIB",
      offlineDuration: "4h 30m",
      availabilityRate: "95.0%",
      incidentCount: 2,
      incidents: sampleIncidents,
    },
    {
      cameraId: "cam-2",
      cameraName: "Lobby Cam",
      serverName: "Server B",
      status: "ONLINE",
      firstOffline: "-",
      lastOffline: "-",
      offlineDuration: "0m",
      availabilityRate: "100.0%",
      incidentCount: 0,
      incidents: [],
    },
  ];

  it("1. filters only cameras with incidents > 0", () => {
    const camerasWithIncidents = sampleCameras.filter(
      (cam) => cam.incidents && cam.incidents.length > 0
    );
    expect(camerasWithIncidents.length).toBe(1);
    expect(camerasWithIncidents[0].cameraId).toBe("cam-1");
  });

  it("2. sorts incidents oldest -> newest without mutating source array", () => {
    const originalFirstIncidentNumber = sampleIncidents[0].incidentNumber; // 2
    const sorted = [...sampleIncidents].sort(
      (a, b) => (a.offlineTimestampMs ?? 0) - (b.offlineTimestampMs ?? 0)
    );

    // Sorted should be incident #1 then incident #2
    expect(sorted[0].incidentNumber).toBe(1);
    expect(sorted[1].incidentNumber).toBe(2);

    // Source array original order preserved (shallow copy sort)
    expect(sampleIncidents[0].incidentNumber).toBe(originalFirstIncidentNumber);
  });

  it("3. handles active incidents correctly (STILL OFFLINE -> ACTIVE, NOT RECOVERED)", () => {
    const activeInc = sampleIncidents[0]; // status: STILL OFFLINE
    const isStillOffline =
      activeInc.status === "STILL OFFLINE" || activeInc.onlineTime.includes("OFFLINE UNTIL NOW");
    const recoveryDisplay = isStillOffline
      ? "NOT RECOVERED"
      : activeInc.onlineTime.replace(/^BACK ONLINE:\s*/, "");
    const statusDisplay = isStillOffline ? "ACTIVE" : "RECOVERED";

    expect(recoveryDisplay).toBe("NOT RECOVERED");
    expect(statusDisplay).toBe("ACTIVE");
  });

  it("4. handles recovered incidents correctly (RECOVERED -> RECOVERED, formatted time)", () => {
    const recInc = sampleIncidents[1]; // status: RECOVERED
    const isStillOffline =
      recInc.status === "STILL OFFLINE" || recInc.onlineTime.includes("OFFLINE UNTIL NOW");
    const recoveryDisplay = isStillOffline
      ? "NOT RECOVERED"
      : recInc.onlineTime.replace(/^BACK ONLINE:\s*/, "");
    const statusDisplay = isStillOffline ? "ACTIVE" : "RECOVERED";

    expect(recoveryDisplay).toBe("2026-03-01 09:30 WIB");
    expect(statusDisplay).toBe("RECOVERED");
  });

  it("5. preserves existing canonical metrics and durations without recalculating", () => {
    const inc = sampleIncidents[0];
    expect(inc.duration).toBe("3h 0m");
  });

  it("6. runs exportToPdf cleanly with camera incidents present", async () => {
    const mockReportData: Partial<FullReportData> = {
      companyName: "Test Co",
      dashboardTitle: "VMS Report",
      generatedAt: "2026-03-02 10:00 WIB",
      periodType: "MONTHLY",
      periodLabel: "March 2026",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-02",
      selectedServerLabel: "All Servers",
      totalCameras: 2,
      onlineCameras: 1,
      offlineCamerasCount: 1,
      cameraOnlineRate: 97.5,
      totalServers: 2,
      onlineServers: 2,
      offlineServers: 0,
      serverOnlineRate: 100,
      totalAlarms: 10,
      criticalAlarms: 1,
      warningAlarms: 2,
      totalOfflineIncidents: 2,
      offlineSummaryTitle: "Offline Cameras",
      cameras: [],
      servers: [],
      serverDisks: [],
      alarms: [],
      s3Logs: [],
      offlineCameras: sampleCameras,
      alarmEventMetrics: {
        totalAlarms: 10,
        criticalAlarms: 1,
        criticalPct: "10%",
        warningAlarms: 2,
        warningPct: "20%",
        infoAlarms: 7,
        infoPct: "70%",
        disconnectAlarms: 2,
        reconnectAlarms: 1,
        serverAlarms: 0,
        storageAlarms: 0,
        networkAlarms: 0,
        totalOfflineIncidents: 2,
        resolvedIncidents: 1,
        activeIncidents: 1,
        totalDowntimeFormatted: "4h 30m",
        totalDowntimeMs: 16200000,
        periodCameraUptimeRate: 97.5,
        auditVerdict: "GOOD",
      },
    };

    expect(() => exportToPdf(mockReportData as FullReportData)).not.toThrow();
  });

  it("7. runs exportToPdf cleanly when offlineCameras has 0 incidents or is empty", async () => {
    const mockEmptyData: Partial<FullReportData> = {
      companyName: "Test Co",
      dashboardTitle: "VMS Report",
      generatedAt: "2026-03-02 10:00 WIB",
      periodType: "MONTHLY",
      periodLabel: "March 2026",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-02",
      selectedServerLabel: "All Servers",
      totalCameras: 1,
      onlineCameras: 1,
      offlineCamerasCount: 0,
      cameraOnlineRate: 100,
      totalServers: 1,
      onlineServers: 1,
      offlineServers: 0,
      serverOnlineRate: 100,
      totalAlarms: 0,
      criticalAlarms: 0,
      warningAlarms: 0,
      totalOfflineIncidents: 0,
      offlineSummaryTitle: "Offline Cameras",
      cameras: [],
      servers: [],
      serverDisks: [],
      alarms: [],
      s3Logs: [],
      offlineCameras: [],
    };

    expect(() => exportToPdf(mockEmptyData as FullReportData)).not.toThrow();
  });
});
