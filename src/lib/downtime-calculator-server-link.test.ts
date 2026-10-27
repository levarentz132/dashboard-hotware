// @ts-nocheck
import { describe, it, expect } from "vitest";
import { calculateDowntimeResult } from "./downtime-calculator";
import { findServerForCamera, isServerDown } from "./server-camera-matcher";

describe("Server-to-Camera Downtime Linkage", () => {
  const baseDateFrom = "2026-03-01";
  const baseDateTo = "2026-03-02";
  const fromMs = new Date("2026-03-01T00:00:00").getTime();
  const toMs = new Date("2026-03-02T23:59:59.999").getTime();
  const nowMs = toMs;

  it("1. Camera inherits downtime from server outage even when camera has no disconnect events", () => {
    const srvId = "server-uuid-1";
    const camId = "cam-uuid-1";

    const cameras = [
      {
        id: camId,
        name: "LOBBY CAM",
        status: "online",
        serverId: srvId,
      },
    ];

    const servers = [
      {
        id: srvId,
        name: "PRIMARY SRV",
        status: "online",
      },
    ];

    // Server outage from 10:00 to 11:00 on March 1 (1 hour)
    const outageStart = fromMs + 10 * 3600 * 1000;
    const outageEnd = fromMs + 11 * 3600 * 1000;

    const serverUptimeSummary = {
      serverResults: [
        {
          serverId: srvId,
          serverName: "PRIMARY SRV",
          currentStatus: "online",
          firstOfflineMs: outageStart,
          lastRecoveryMs: outageEnd,
          totalDowntimeMs: 3600 * 1000,
          totalDowntimeFormatted: "1h",
          incidentCount: 1,
          activeOutage: false,
          uptimeRate: 97.9,
          dataCompleteness: "COMPLETE",
          outageSessions: [
            {
              serverId: srvId,
              serverName: "PRIMARY SRV",
              startTimeMs: outageStart,
              endTimeMs: outageEnd,
              durationMs: 3600 * 1000,
              isActive: false,
            },
          ],
        },
      ],
      overallServerUptimeRate: 97.9,
      totalServerCount: 1,
      onlineServerCount: 1,
      totalServerIncidents: 1,
      totalServerDowntimeMs: 3600 * 1000,
      totalServerDowntimeFormatted: "1h",
      dataCompleteness: "COMPLETE",
    };

    const result = calculateDowntimeResult({
      cameras,
      events: [],
      allEvents: [],
      dateFrom: baseDateFrom,
      dateTo: baseDateTo,
      selectedServerLabel: "PRIMARY SRV",
      nowMs,
      servers,
      serverUptimeSummary,
    });

    expect(result.cameras.length).toBe(1);
    const cam = result.cameras[0];
    expect(cam.incidentCount).toBe(1);
    expect(cam.incidents[0].status).toBe("RECOVERED");
    expect(cam.incidents[0].reason).toContain("Server Outage");
    expect(cam.incidents[0].reason).toContain("PRIMARY SRV");
    expect(cam.offlineDuration).toBe("1h 0m");
    expect(result.aggregate.totalDowntimeMs).toBe(3600 * 1000);
    expect(result.aggregate.periodCameraUptimeRate).toBeLessThan(100);
  });

  it("2. Overlapping camera disconnect and server outage are merged without double-counting", () => {
    const srvId = "server-uuid-1";
    const camId = "cam-uuid-1";

    const cameras = [
      {
        id: camId,
        name: "PARKING CAM",
        status: "online",
        serverId: srvId,
      },
    ];

    const servers = [
      {
        id: srvId,
        name: "PRIMARY SRV",
        status: "online",
      },
    ];

    // Camera disconnected from 10:00 to 10:30 (30 min)
    const camDiscTime = fromMs + 10 * 3600 * 1000;
    const camRecTime = fromMs + 10.5 * 3600 * 1000;

    const events = [
      {
        eventType: "CameraDisconnectEvent",
        timestampMs: camDiscTime,
        cameraId: camId,
        caption: "Camera Lost Connection",
      },
      {
        eventType: "CameraConnectedEvent",
        timestampMs: camRecTime,
        cameraId: camId,
        caption: "Camera Online",
      },
    ];

    // Server outage from 10:15 to 11:00 (45 min)
    const srvOutageStart = fromMs + 10.25 * 3600 * 1000;
    const srvOutageEnd = fromMs + 11 * 3600 * 1000;

    const serverUptimeSummary = {
      serverResults: [
        {
          serverId: srvId,
          serverName: "PRIMARY SRV",
          currentStatus: "online",
          firstOfflineMs: srvOutageStart,
          lastRecoveryMs: srvOutageEnd,
          totalDowntimeMs: 45 * 60 * 1000,
          totalDowntimeFormatted: "45m",
          incidentCount: 1,
          activeOutage: false,
          uptimeRate: 98.4,
          dataCompleteness: "COMPLETE",
          outageSessions: [
            {
              serverId: srvId,
              serverName: "PRIMARY SRV",
              startTimeMs: srvOutageStart,
              endTimeMs: srvOutageEnd,
              durationMs: 45 * 60 * 1000,
              isActive: false,
            },
          ],
        },
      ],
      overallServerUptimeRate: 98.4,
      totalServerCount: 1,
      onlineServerCount: 1,
      totalServerIncidents: 1,
      totalServerDowntimeMs: 45 * 60 * 1000,
      totalServerDowntimeFormatted: "45m",
      dataCompleteness: "COMPLETE",
    };

    const result = calculateDowntimeResult({
      cameras,
      events,
      allEvents: events,
      dateFrom: baseDateFrom,
      dateTo: baseDateTo,
      selectedServerLabel: "PRIMARY SRV",
      nowMs,
      servers,
      serverUptimeSummary,
    });

    const cam = result.cameras[0];
    // Overlapping [10:00 - 10:30] and [10:15 - 11:00] must merge into ONE incident [10:00 - 11:00] (1 hour = 60m)
    expect(cam.incidentCount).toBe(1);
    expect(cam.incidents[0].offlineTimestampMs).toBe(camDiscTime);
    expect(cam.incidents[0].onlineTimestampMs).toBe(srvOutageEnd);
    expect(cam.offlineDuration).toBe("1h 0m");
    expect(result.aggregate.totalDowntimeMs).toBe(60 * 60 * 1000);
    // Reasons combined
    expect(cam.incidents[0].reason).toContain("Camera");
    expect(cam.incidents[0].reason).toContain("Server Outage");
  });

  it("3. If server is down / offline, camera status is marked OFFLINE and availability is OFFLINE UNTIL NOW", () => {
    const srvId = "server-uuid-down";
    const camId = "cam-uuid-down";

    const cameras = [
      {
        id: camId,
        name: "GATE CAM",
        status: "online", // Stale cache in camera record
        serverId: srvId,
      },
    ];

    const servers = [
      {
        id: srvId,
        name: "DOWN SERVER",
        status: "OFFLINE",
        isOfflinePlaceholder: true,
      },
    ];

    const result = calculateDowntimeResult({
      cameras,
      events: [],
      allEvents: [],
      dateFrom: baseDateFrom,
      dateTo: baseDateTo,
      selectedServerLabel: "DOWN SERVER",
      nowMs,
      servers,
    });

    const cam = result.cameras[0];
    expect(cam.status).toBe("OFFLINE");
    expect(cam.availabilityRate).toBe("OFFLINE UNTIL NOW");
    expect(cam.incidents.length).toBeGreaterThan(0);
    expect(cam.incidents[0].status).toBe("STILL OFFLINE");
    expect(cam.incidents[0].reason).toContain("Server Outage");
  });

  it("4. Multi-server isolation: server A outage only affects camera on server A, not camera on server B", () => {
    const srvA = "server-A";
    const srvB = "server-B";

    const cameras = [
      { id: "cam-A", name: "CAM ON SERVER A", status: "online", serverId: srvA },
      { id: "cam-B", name: "CAM ON SERVER B", status: "online", serverId: srvB },
    ];

    const servers = [
      { id: srvA, name: "SERVER A", status: "online" },
      { id: srvB, name: "SERVER B", status: "online" },
    ];

    const outageStart = fromMs + 5 * 3600 * 1000;
    const outageEnd = fromMs + 6 * 3600 * 1000;

    const serverUptimeSummary = {
      serverResults: [
        {
          serverId: srvA,
          serverName: "SERVER A",
          currentStatus: "online",
          firstOfflineMs: outageStart,
          lastRecoveryMs: outageEnd,
          totalDowntimeMs: 3600 * 1000,
          totalDowntimeFormatted: "1h",
          incidentCount: 1,
          activeOutage: false,
          uptimeRate: 97.9,
          dataCompleteness: "COMPLETE",
          outageSessions: [
            {
              serverId: srvA,
              serverName: "SERVER A",
              startTimeMs: outageStart,
              endTimeMs: outageEnd,
              durationMs: 3600 * 1000,
              isActive: false,
            },
          ],
        },
        {
          serverId: srvB,
          serverName: "SERVER B",
          currentStatus: "online",
          firstOfflineMs: null,
          lastRecoveryMs: null,
          totalDowntimeMs: 0,
          totalDowntimeFormatted: "0m",
          incidentCount: 0,
          activeOutage: false,
          uptimeRate: 100,
          dataCompleteness: "COMPLETE",
          outageSessions: [],
        },
      ],
      overallServerUptimeRate: 98.9,
      totalServerCount: 2,
      onlineServerCount: 2,
      totalServerIncidents: 1,
      totalServerDowntimeMs: 3600 * 1000,
      totalServerDowntimeFormatted: "1h",
      dataCompleteness: "COMPLETE",
    };

    const result = calculateDowntimeResult({
      cameras,
      events: [],
      allEvents: [],
      dateFrom: baseDateFrom,
      dateTo: baseDateTo,
      selectedServerLabel: "ALL SERVERS",
      nowMs,
      servers,
      serverUptimeSummary,
    });

    const camA = result.cameras.find((c) => c.cameraId === "cam-A");
    const camB = result.cameras.find((c) => c.cameraId === "cam-B");

    expect(camA.incidentCount).toBe(1);
    expect(camA.offlineDuration).toBe("1h 0m");

    expect(camB.incidentCount).toBe(0);
    expect(camB.availabilityRate).toBe("100% ONLINE");
  });

  it("5. Cameras without explicit serverId match by _systemId and inherit server downtime", () => {
    const sysId = "cloud-sys-uuid-9";
    const srvId = "srv-internal-uuid-9";
    const outageStart = fromMs + 2 * 3600 * 1000;
    const outageEnd = fromMs + 5 * 3600 * 1000; // 3 hours

    const cameras = [
      {
        id: "cam-cloud-1",
        name: "ENTRANCE CAMERA",
        status: "online",
        _systemId: sysId,
        _systemName: "HQ SITE",
      },
    ];

    const servers = [
      {
        id: srvId,
        name: "HQ VMS SERVER",
        status: "online",
        _systemId: sysId,
        _systemName: "HQ SITE",
      },
    ];

    const serverUptimeSummary = {
      serverResults: [
        {
          serverId: srvId,
          serverName: "HQ VMS SERVER",
          currentStatus: "online",
          firstOfflineMs: outageStart,
          lastRecoveryMs: outageEnd,
          totalDowntimeMs: 3 * 3600 * 1000,
          totalDowntimeFormatted: "3h",
          incidentCount: 1,
          activeOutage: false,
          uptimeRate: 93.8,
          dataCompleteness: "COMPLETE",
          outageSessions: [
            {
              serverId: srvId,
              serverName: "HQ VMS SERVER",
              startTimeMs: outageStart,
              endTimeMs: outageEnd,
              durationMs: 3 * 3600 * 1000,
              isActive: false,
            },
          ],
        },
      ],
      overallServerUptimeRate: 93.8,
      totalServerCount: 1,
      onlineServerCount: 1,
      totalServerIncidents: 1,
      totalServerDowntimeMs: 3 * 3600 * 1000,
      totalServerDowntimeFormatted: "3h",
      dataCompleteness: "COMPLETE",
    };

    const result = calculateDowntimeResult({
      cameras,
      events: [],
      allEvents: [],
      dateFrom: baseDateFrom,
      dateTo: baseDateTo,
      selectedServerLabel: "HQ SITE",
      nowMs,
      servers,
      serverUptimeSummary,
    });

    expect(result.cameras.length).toBe(1);
    const cam = result.cameras[0];
    expect(cam.incidentCount).toBe(1);
    expect(cam.incidents[0].reason).toContain("Server Outage");
    expect(cam.offlineDuration).toBe("3h 0m");
    expect(result.aggregate.periodCameraUptimeRate).toBeLessThan(100);
    expect(result.aggregate.totalDowntimeMs).toBe(3 * 3600 * 1000);
  });
});

