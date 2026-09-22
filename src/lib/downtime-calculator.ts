/**
 * Canonical downtime calculation engine.
 *
 * Pure function — no React state, no API calls, no side effects.
 * Extracted from ReportingManagement.tsx to provide a single source of truth
 * for downtime/availability calculation used by Dashboard, PDF, and Word exports.
 */

import { getOfflineExactTime, formatExactTimestamp } from "@/lib/camera-offline-tracker";
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
    dateFrom,
    dateTo,
    selectedServerLabel,
    nowMs = Date.now(),
  } = input;

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

          const camEvents = eventList.filter((e: any) => {
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

          const rawDisconnectEvents = camEvents
            .filter((e: any) => isDisconnectEvent(e))
            .sort((a: any, b: any) => {
              const timeA = getEventTimestampMs(a) ?? 0;
              const timeB = getEventTimestampMs(b) ?? 0;
              return timeA - timeB;
            });

          const rawRecoveryEvents = camEvents
            .filter((e: any) => isRecoveryEvent(e))
            .sort((a: any, b: any) => {
              const timeA = getEventTimestampMs(a) ?? 0;
              const timeB = getEventTimestampMs(b) ?? 0;
              return timeA - timeB;
            });

          const sessions = pairIncidentSessions(rawDisconnectEvents, rawRecoveryEvents);

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
                  const diffMs = Math.max(0, nowMs - sess.discTimeMs);
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
            const resolved = getOfflineExactTime(cam);
            const durationMs = resolved.timestampMs
              ? Math.max(0, nowMs - resolved.timestampMs)
              : 0;
            incidents.push({
              incidentNumber: 1,
              offlineTime: resolved.exactTime,
              offlineTimestampMs: resolved.timestampMs,
              onlineTime: "OFFLINE UNTIL NOW",
              onlineTimestampMs: null,
              duration: durationMs > 0
                ? `${formatDuration(durationMs)} (Until now)`
                : "Offline until now",
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
            const latestInc = incidents[incidents.length - 1];
            firstOffline = latestInc.offlineTime;
            lastOffline = latestInc.onlineTime;

            let totalDowntimeMs = 0;
            let hasUnrecovered = false;
            incidents.forEach((inc) => {
              if (inc.offlineTimestampMs && inc.onlineTimestampMs) {
                totalDowntimeMs += Math.max(0, inc.onlineTimestampMs - inc.offlineTimestampMs);
              } else if (inc.offlineTimestampMs && inc.status === "STILL OFFLINE") {
                totalDowntimeMs += Math.max(0, nowMs - inc.offlineTimestampMs);
                hasUnrecovered = true;
              }
            });

            if (hasUnrecovered || !isOnline) {
              availabilityRate = "OFFLINE UNTIL NOW";
              offlineDuration = `${formatDuration(totalDowntimeMs)} (Until now)`;
            } else {
              availabilityRate = "ONLINE (RECOVERED)";
              offlineDuration =
                totalDowntimeMs > 0 ? formatDuration(totalDowntimeMs) : latestInc.duration;
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

  // Compute alarm event metrics from the event list
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
          totalDowntimeMs += Math.max(0, nowMs - inc.offlineTimestampMs);
        }
      }
    });
  });

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

  const totalCameras = cameras.length;
  const avgDowntimeMs =
    totalCameras > 0 ? totalDowntimeMs / totalCameras : totalDowntimeMs;
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

  const auditVerdict = `During the period (${dateFrom} to ${dateTo}), ${totalAlarms} total alarm event(s) were recorded for ${selectedServerLabel}. ${criticalAlarms} critical event(s) (${criticalPct}) and ${warningAlarms} warning(s) (${warningPct}) were logged. A total of ${totalOfflineIncidentsCount} camera disconnection incident(s) occurred: ${resolvedIncidents} successfully restored upon reconnection, and ${activeIncidents} active outage(s). Overall camera uptime index calculated from alarm logs is ${periodCameraUptimeRate}% with ${formatDuration(totalDowntimeMs)} total recorded downtime.`;

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
      totalDowntimeMs,
      totalDowntimeFormatted: formatDuration(totalDowntimeMs),
      periodCameraUptimeRate,
      auditVerdict,
    },
  };
}
