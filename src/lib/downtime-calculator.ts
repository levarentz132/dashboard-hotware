/**
 * Canonical downtime calculation engine.
 *
 * Pure function — no React state, no API calls, no side effects.
 * Extracted from ReportingManagement.tsx to provide a single source of truth
 * for downtime/availability calculation used by Dashboard, PDF, and Word exports.
 */

import { getOfflineExactTime, formatExactTimestamp, trackOfflineCamera } from "@/lib/camera-offline-tracker";
import type { OfflineCameraItem, OfflineCameraIncident } from "@/components/reporting/export-utils";

// ============================================
// HELPERS (moved from ReportingManagement.tsx)
// ============================================

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

function normalizeEpochMs(value: string | number | null | undefined): number | null {
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
}

// ============================================
// EVENT CLASSIFICATION
// ============================================

function isDisconnectEvent(e: any): boolean {
  const type = String(e.eventData?.type || e.type || e.eventType || "").toLowerCase();
  const caption = String(e.actionData?.caption || e.caption || "").toLowerCase();
  const desc = String(e.actionData?.description || e.description || "").toLowerCase();

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
}

function isRecoveryEvent(e: any): boolean {
  const type = String(e.eventData?.type || e.type || e.eventType || "").toLowerCase();
  const caption = String(e.actionData?.caption || e.caption || "").toLowerCase();
  const desc = String(e.actionData?.description || e.description || "").toLowerCase();

  const isDisc =
    type.includes("disconnect") ||
    type.includes("offline") ||
    caption.includes("disconnect") ||
    caption.includes("offline") ||
    desc.includes("lost connection") ||
    desc.includes("is now offline") ||
    desc.includes("has lost connection");

  if (isDisc) return false;

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
}

function getEventTimestampMs(e: any): number | null {
  return (
    normalizeEpochMs(e.timestampMs) ??
    normalizeEpochMs(e.actionData?.timestamp || e.eventData?.timestamp) ??
    normalizeEpochMs(e.timestamp)
  );
}

// ============================================
// PER-CAMERA INCIDENT SESSION PAIRING
// ============================================

type OutageSession = {
  discTimeMs: number;
  discEvent: any;
  recTimeMs: number | null;
  recEvent: any | null;
};

function pairIncidentSessions(
  rawDisconnectEvents: any[],
  rawRecoveryEvents: any[],
): OutageSession[] {
  type CombinedEvent = {
    kind: "disconnect" | "recovery";
    timeMs: number;
    event: any;
  };

  const allTimeline: CombinedEvent[] = [];

  rawDisconnectEvents.forEach((ev: any) => {
    const t = getEventTimestampMs(ev);
    if (t) allTimeline.push({ kind: "disconnect", timeMs: t, event: ev });
  });

  rawRecoveryEvents.forEach((ev: any) => {
    const t = getEventTimestampMs(ev);
    if (t) allTimeline.push({ kind: "recovery", timeMs: t, event: ev });
  });

  allTimeline.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.kind === "disconnect" && b.kind === "recovery") return -1;
    if (a.kind === "recovery" && b.kind === "disconnect") return 1;
    return 0;
  });

  const sessions: OutageSession[] = [];
  let currentSession: OutageSession | null = null;

  allTimeline.forEach((item) => {
    if (item.kind === "disconnect") {
      if (!currentSession) {
        currentSession = {
          discTimeMs: item.timeMs,
          discEvent: item.event,
          recTimeMs: null,
          recEvent: null,
        };
      }
    } else if (item.kind === "recovery") {
      if (currentSession) {
        if (item.timeMs >= currentSession.discTimeMs) {
          currentSession.recTimeMs = item.timeMs;
          currentSession.recEvent = item.event;
          sessions.push(currentSession);
          currentSession = null;
        }
      }
    }
  });

  if (currentSession) {
    sessions.push(currentSession);
  }

  return sessions;
}

// ============================================
// INPUT / OUTPUT TYPES
// ============================================

export interface DowntimeInput {
  cameras: any[];
  events: any[];
  allEvents?: any[];
  dateFrom: string;
  dateTo: string;
  selectedServerLabel: string;
  nowMs?: number;
}

export interface DowntimeAggregate {
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

export interface DowntimeResult {
  cameras: OfflineCameraItem[];
  aggregate: DowntimeAggregate;
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

export function calculateDowntimeResult(input: DowntimeInput): DowntimeResult {
  const {
    cameras,
    events: eventList,
    allEvents = input.events,
    dateFrom,
    dateTo,
    selectedServerLabel,
    nowMs = Date.now(),
  } = input;

  // Compute period boundaries (clamped to now, minimum 1 hour)
  const dateFromMs = dateFrom
    ? new Date(`${dateFrom}T00:00:00`).getTime()
    : 0;
  const dateToMs = dateTo
    ? new Date(`${dateTo}T23:59:59.999`).getTime()
    : Infinity;

  const effectiveToTime = Math.min(dateToMs === Infinity ? nowMs : dateToMs, nowMs);
  const effectiveFromTime = Math.min(dateFromMs || effectiveToTime, effectiveToTime);
  const periodDurationMs = Math.max(1000 * 60 * 60, effectiveToTime - effectiveFromTime);

  let totalPeriodDowntimeMs = 0;
  let resolvedIncidents = 0;
  let activeIncidents = 0;

  // ============================================
  // PER-CAMERA DOWNTIME CALCULATION
  // ============================================
  const offlineCamerasSummary: OfflineCameraItem[] = cameras.length === 0
    ? []
    : (() => {
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

          const filterCamEvents = (sourceList: any[]) =>
            sourceList.filter((e: any) => {
              if (cleanCamId) {
                const devIds = (e.actionData?.deviceIds || []).map((id: string) =>
                  String(id).replace(/[{}]/g, "").toLowerCase(),
                );
                if (devIds.includes(cleanCamId)) return true;
                const resId = String(
                  e.resourceId || e.cameraId || e.eventData?.resourceId || e.source || "",
                )
                  .replace(/[{}]/g, "")
                  .toLowerCase();
                if (resId.includes(cleanCamId)) return true;
              }
              if (camNameLower) {
                const txt = String(
                  e.actionData?.caption ||
                    e.actionData?.description ||
                    e.actionData?.sourceName ||
                    e.caption ||
                    e.description ||
                    e.sourceName ||
                    "",
                ).toLowerCase();
                if (txt.includes(camNameLower)) return true;
              }
              return false;
            });

          // Always pair lifetime sessions from complete historical events
          const allCamEvents = filterCamEvents(allEvents);
          const rawDisconnectEvents = allCamEvents
            .filter((e: any) => isDisconnectEvent(e))
            .sort((a: any, b: any) => (getEventTimestampMs(a) ?? 0) - (getEventTimestampMs(b) ?? 0));
          const rawRecoveryEvents = allCamEvents
            .filter((e: any) => isRecoveryEvent(e))
            .sort((a: any, b: any) => (getEventTimestampMs(a) ?? 0) - (getEventTimestampMs(b) ?? 0));

          const lifetimeSessions = pairIncidentSessions(rawDisconnectEvents, rawRecoveryEvents);

          // Find sessions that overlap with the selected reporting period
          const overlappingSessions = lifetimeSessions.filter((sess) => {
            return (
              sess.discTimeMs <= effectiveToTime &&
              (sess.recTimeMs === null || sess.recTimeMs >= effectiveFromTime)
            );
          });

          const incidents: OfflineCameraIncident[] = [];
          let camPeriodDowntimeMs = 0;

          if (overlappingSessions.length > 0) {
            overlappingSessions.forEach((sess, idx) => {
              const offlineTime = formatExactTimestamp(sess.discTimeMs);
              let onlineTime = "";
              let duration = "";
              let incStatus: "RECOVERED" | "STILL OFFLINE" = "RECOVERED";
              let onlineTimestampMs: number | null = null;

              // Calculate period overlap
              const overlapStart = Math.max(sess.discTimeMs, effectiveFromTime);
              const overlapEnd = sess.recTimeMs !== null ? Math.min(sess.recTimeMs, effectiveToTime) : effectiveToTime;
              const incidentDowntimeInPeriod = Math.max(0, overlapEnd - overlapStart);
              camPeriodDowntimeMs += incidentDowntimeInPeriod;

              if (sess.recTimeMs) {
                onlineTimestampMs = sess.recTimeMs;
                onlineTime = `BACK ONLINE: ${formatExactTimestamp(sess.recTimeMs)}`;
                const totalOutageMs = Math.max(0, sess.recTimeMs - sess.discTimeMs);
                duration = formatDuration(totalOutageMs);
                incStatus = "RECOVERED";
                resolvedIncidents++;
              } else {
                const isLatest = idx === overlappingSessions.length - 1;
                if (isLatest && !isOnline) {
                  onlineTime = "OFFLINE UNTIL NOW";
                  const totalOutageMs = Math.max(0, nowMs - sess.discTimeMs);
                  duration = `${formatDuration(totalOutageMs)} (Until now)`;
                  incStatus = "STILL OFFLINE";
                  activeIncidents++;
                } else {
                  onlineTime = "YES — BACK ONLINE (CURRENT)";
                  duration = "TEMPORARY (RECOVERED)";
                  incStatus = "RECOVERED";
                  resolvedIncidents++;
                }
              }

              const eventReason = String(
                sess.discEvent?.actionData?.caption ||
                  sess.discEvent?.caption ||
                  sess.discEvent?.actionData?.description ||
                  sess.discEvent?.description ||
                  sess.discEvent?.eventData?.type ||
                  sess.discEvent?.eventType ||
                  "Camera Disconnected",
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
            // Camera is currently offline but has no explicit event logged
            const resolved = getOfflineExactTime(cam, allEvents);
            const offlineMs = resolved.timestampMs || effectiveFromTime;
            const overlapStart = Math.max(offlineMs, effectiveFromTime);
            const incidentDowntimeInPeriod = Math.max(0, effectiveToTime - overlapStart);
            camPeriodDowntimeMs += incidentDowntimeInPeriod;
            activeIncidents++;

            const totalOutageMs = offlineMs ? Math.max(0, nowMs - offlineMs) : 0;
            incidents.push({
              incidentNumber: 1,
              offlineTime: resolved.exactTime,
              offlineTimestampMs: offlineMs,
              onlineTime: "OFFLINE UNTIL NOW",
              onlineTimestampMs: null,
              duration: totalOutageMs > 0
                ? `${formatDuration(totalOutageMs)} (Until now)`
                : "Offline until now",
              status: "STILL OFFLINE",
              reason: "Current Offline State",
            });
          }

          totalPeriodDowntimeMs += camPeriodDowntimeMs;

          const incidentCount = incidents.length;

          let firstOffline = "ONLINE — NO OFFLINE EVENTS RECORDED";
          let lastOffline = "ONLINE — NO OFFLINE EVENTS RECORDED";
          let offlineDuration = "0s (100% Uptime)";
          let availabilityRate = "100% ONLINE";

          if (incidentCount > 0) {
            const firstInc = incidents[0];
            const latestInc = incidents[incidents.length - 1];
            firstOffline = firstInc.offlineTime;
            lastOffline = latestInc.onlineTime;

            const hasUnrecovered = incidents.some((inc) => inc.status === "STILL OFFLINE");

            if (hasUnrecovered || !isOnline) {
              availabilityRate = "OFFLINE UNTIL NOW";
              const totalOutageMs = firstInc.offlineTimestampMs ? Math.max(0, nowMs - firstInc.offlineTimestampMs) : 0;
              offlineDuration = totalOutageMs > 0 ? `${formatDuration(totalOutageMs)} (Until now)` : latestInc.duration;
            } else {
              const camUptimePct = Math.max(
                0,
                Math.min(
                  100,
                  ((periodDurationMs - camPeriodDowntimeMs) / periodDurationMs) * 100,
                ),
              ).toFixed(1);
              availabilityRate = `${camUptimePct}% ONLINE`;
              offlineDuration = formatDuration(camPeriodDowntimeMs);
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
      })();

  // ============================================
  // AGGREGATE METRICS CALCULATION
  // ============================================

  // Compute alarm event metrics from the period event list
  let criticalAlarms = 0;
  let warningAlarms = 0;
  let infoAlarms = 0;
  let disconnectAlarms = 0;
  let reconnectAlarms = 0;
  let serverAlarms = 0;
  let storageAlarms = 0;
  let networkAlarms = 0;

  eventList.forEach((a: any) => {
    const rawLevel = String(
      a.actionData?.level ?? a.level ?? a.severity ?? "info",
    ).toLowerCase();
    let severity = rawLevel;
    const eventType = String(
      a.eventData?.type || a.type || a.eventType || "",
    ).toLowerCase();

    if (eventType === "cameradisconnectevent" || eventType === "devicedisconnected") {
      const timestampMs = getEventTimestampMs(a);
      if (timestampMs) {
        const ageHours = (nowMs - timestampMs) / (1000 * 60 * 60);
        severity = ageHours > 24 ? "critical" : "info";
      } else {
        severity = "warning";
      }
    } else if (
      [
        "error",
        "critical",
        "fatal",
        "serverfailure",
        "serverfailureevent",
      ].includes(eventType.toLowerCase()) ||
      ["error", "critical", "fatal"].includes(rawLevel)
    ) {
      severity = "critical";
    } else if (
      [
        "warning",
        "warn",
        "storagefailureevent",
        "serverconflictevent",
        "networkissueevent",
      ].includes(eventType.toLowerCase()) ||
      ["warning", "warn"].includes(rawLevel)
    ) {
      severity = "warning";
    }

    const sev = severity.toUpperCase();
    if (sev === "CRITICAL") criticalAlarms++;
    else if (sev === "WARNING") warningAlarms++;
    else infoAlarms++;

    const label = String(a.eventLabel || "").toLowerCase();
    const cap = String(a.caption || "").toLowerCase();
    const desc = String(a.description || "").toLowerCase();

    if (
      eventType.includes("disconnect") ||
      cap.includes("disconnect") ||
      desc.includes("lost connection") ||
      desc.includes("is now offline") ||
      desc.includes("disconnected")
    ) {
      disconnectAlarms++;
    } else if (
      eventType.includes("reconnect") ||
      eventType.includes("cameraconnected") ||
      eventType.includes("deviceconnected") ||
      cap.includes("back online") ||
      cap.includes("camera online") ||
      cap.includes("reconnect") ||
      desc.includes("reconnected") ||
      desc.includes("back online") ||
      desc.includes("connection restored")
    ) {
      reconnectAlarms++;
    }

    if (
      eventType.includes("server") ||
      label.includes("server") ||
      desc.includes("server failure")
    ) {
      serverAlarms++;
    }
    if (
      eventType.includes("storage") ||
      label.includes("storage") ||
      desc.includes("storage") ||
      desc.includes("disk")
    ) {
      storageAlarms++;
    }
    if (
      eventType.includes("network") ||
      label.includes("network") ||
      desc.includes("network")
    ) {
      networkAlarms++;
    }
  });

  const totalCameras = cameras.length;
  const avgDowntimeMs =
    totalCameras > 0 ? totalPeriodDowntimeMs / totalCameras : totalPeriodDowntimeMs;
  const computedUptime =
    periodDurationMs > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((periodDurationMs - avgDowntimeMs) / periodDurationMs) * 100,
          ),
        )
      : 100;
  const periodCameraUptimeRate = Number(computedUptime.toFixed(1));

  const totalAlarms = eventList.length;
  const totalOfflineIncidentsCount = resolvedIncidents + activeIncidents;

  const criticalPct =
    totalAlarms > 0 ? `${Math.round((criticalAlarms / totalAlarms) * 100)}%` : "0%";
  const warningPct =
    totalAlarms > 0 ? `${Math.round((warningAlarms / totalAlarms) * 100)}%` : "0%";
  const infoPct =
    totalAlarms > 0 ? `${Math.round((infoAlarms / totalAlarms) * 100)}%` : "0%";

  const auditVerdict = `During the period (${dateFrom} to ${dateTo}), ${totalAlarms} total alarm event(s) were recorded for ${selectedServerLabel}. ${criticalAlarms} critical event(s) (${criticalPct}) and ${warningAlarms} warning(s) (${warningPct}) were logged. A total of ${totalOfflineIncidentsCount} camera disconnection incident(s) occurred: ${resolvedIncidents} successfully restored upon reconnection, and ${activeIncidents} active outage(s). Overall camera uptime index calculated from alarm logs is ${periodCameraUptimeRate}% with ${formatDuration(totalPeriodDowntimeMs)} total recorded downtime.`;

  return {
    cameras: offlineCamerasSummary,
    aggregate: {
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
      totalDowntimeMs: totalPeriodDowntimeMs,
      totalDowntimeFormatted: formatDuration(totalPeriodDowntimeMs),
      periodCameraUptimeRate,
      auditVerdict,
    },
  };
}
