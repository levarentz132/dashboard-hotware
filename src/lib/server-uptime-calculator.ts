/**
 * Server Uptime Calculator
 * Pure module to calculate historical server uptime and downtime metrics from VMS events.
 */

export type DataCompletenessState =
  | "COMPLETE" // Explicitly means NO_LIMIT_TRUNCATION_DETECTED (returnedEventCount < requestedLimit)
  | "POTENTIALLY_TRUNCATED" // (returnedEventCount >= requestedLimit)
  | "DATA_NOT_AVAILABLE"; // Event fetch failed or required range cannot be retrieved

export interface ServerOutageSession {
  serverId: string;
  serverName: string;
  startTimeMs: number; // Clamped to fromMs
  endTimeMs: number; // Clamped to min(toMs, nowMs)
  durationMs: number;
  isActive: boolean; // Ongoing at period end
}

export interface ServerUptimeResult {
  serverId: string;
  serverName: string;
  currentStatus: "online" | "offline"; // Live server status from /servers
  firstOfflineMs: number | null;
  lastRecoveryMs: number | null;
  totalDowntimeMs: number;
  totalDowntimeFormatted: string;
  incidentCount: number;
  activeOutage: boolean;
  uptimeRate: number | null; // null if DATA_NOT_AVAILABLE
  dataCompleteness: DataCompletenessState;
  outageSessions: ServerOutageSession[];
}

export interface SystemServerUptimeSummary {
  serverResults: ServerUptimeResult[];
  overallServerUptimeRate: number | null;
  totalServerCount: number;
  onlineServerCount: number;
  totalServerIncidents: number;
  totalServerDowntimeMs: number;
  totalServerDowntimeFormatted: string;
  dataCompleteness: DataCompletenessState;
}

export interface CalculateServerUptimeInput {
  servers: any[];
  events: any[];
  fromMs: number;
  toMs: number;
  nowMs?: number;
  requestedLimit?: number;
  returnedEventCount?: number;
  isFetchFailed?: boolean;
}

function formatDuration(diffMs: number): string {
  if (!diffMs || diffMs <= 0 || isNaN(diffMs)) return "0m";
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 1) return "< 1s";
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

const SERVER_FAILURE_TYPES = new Set([
  "serverfailureevent",
  "serverfailure",
  "serverdisconnectevent",
  "serverdisconnected",
]);

const SERVER_STARTED_TYPES = new Set([
  "serverstartevent",
  "serverstarted",
  "serverconnectevent",
  "serverconnected",
]);

function cleanId(id: any): string {
  if (!id) return "";
  return String(id).replace(/[{}]/g, "").trim().toLowerCase();
}

function getEventType(ev: any): string {
  const type =
    ev.eventData?.type ||
    ev.actionData?.type ||
    ev.eventType ||
    ev.type ||
    "";
  return String(type).toLowerCase();
}

function getServerId(ev: any): string {
  return cleanId(
    ev.eventData?.serverId ||
      ev.actionData?.serverId ||
      ev.serverId ||
      ev.eventParams?.serverId ||
      ev.eventParams?.sourceServerId ||
      ""
  );
}

function getServerName(ev: any): string {
  return cleanId(
    ev.eventData?.serverName ||
      ev.actionData?.serverName ||
      ev.serverName ||
      ev.eventParams?.serverName ||
      ""
  );
}


/**
 * Main Pure Function: calculateServerUptimeFromEvents
 */
export function calculateServerUptimeFromEvents(
  input: CalculateServerUptimeInput
): SystemServerUptimeSummary {
  const {
    servers = [],
    events = [],
    fromMs,
    toMs,
    nowMs = Date.now(),
    requestedLimit = 2000,
    returnedEventCount,
    isFetchFailed = false,
  } = input;

  const effectiveNowMs = Math.min(nowMs, toMs);

  // Determine Data Completeness State
  let dataCompleteness: DataCompletenessState = "COMPLETE"; // Means NO_LIMIT_TRUNCATION_DETECTED
  if (isFetchFailed) {
    dataCompleteness = "DATA_NOT_AVAILABLE";
  } else if (
    returnedEventCount !== undefined &&
    requestedLimit !== undefined &&
    returnedEventCount >= requestedLimit
  ) {
    dataCompleteness = "POTENTIALLY_TRUNCATED";
  }

  if (servers.length === 0 || isFetchFailed) {
    return {
      serverResults: [],
      overallServerUptimeRate: isFetchFailed ? null : 100,
      totalServerCount: servers.length,
      onlineServerCount: 0,
      totalServerIncidents: 0,
      totalServerDowntimeMs: 0,
      totalServerDowntimeFormatted: "0m",
      dataCompleteness,
    };
  }

  const periodDurationMs = Math.max(1, toMs - fromMs);
  const serverResults: ServerUptimeResult[] = [];

  let totalServerIncidents = 0;
  let totalServerDowntimeMs = 0;
  let onlineServerCount = 0;

  for (const srv of servers) {
    const srvCleanId = cleanId(srv.id || srv.serverId || srv.name);
    const srvName = srv.name || srv.serverName || srvCleanId || "Unknown Server";

    // Determine current live status from /servers object
    const rawStatus = String(srv.status || srv.state || "").toLowerCase();
    const currentStatus: "online" | "offline" =
      rawStatus === "offline" || rawStatus === "disconnected" ? "offline" : "online";

    if (currentStatus === "online") {
      onlineServerCount++;
    }

    // Filter events matching this server
    const serverEvents = events.filter((ev) => {
      const evSrvId = getServerId(ev);
      const evSrvName = getServerName(ev);
      if (evSrvId && srvCleanId && evSrvId === srvCleanId) return true;
      if (evSrvName && srvCleanId && evSrvName === srvCleanId) return true;
      // If serverId is missing on event, match if only 1 server exists
      if (!evSrvId && !evSrvName && servers.length === 1) return true;
      return false;
    });

    // Sort events chronologically ASCENDING for state machine traversal
    const sortedEvents = [...serverEvents].sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

    // Pre-state inspection: check events before fromMs
    const preEvents = sortedEvents.filter((e) => (e.timestampMs || 0) < fromMs);
    const inAndPostEvents = sortedEvents.filter((e) => (e.timestampMs || 0) >= fromMs);

    let state: "online" | "offline" = "online";
    let lastFailureTimeMs: number | null = null;

    for (const ev of preEvents) {
      const type = getEventType(ev);
      if (SERVER_FAILURE_TYPES.has(type)) {
        if (state === "online") {
          state = "offline";
          lastFailureTimeMs = ev.timestampMs;
        }
      } else if (SERVER_STARTED_TYPES.has(type)) {
        if (state === "offline") {
          state = "online";
          lastFailureTimeMs = null;
        }
      }
    }

    const outageSessions: ServerOutageSession[] = [];
    let currentOutageStartMs: number | null = state === "offline" ? lastFailureTimeMs : null;

    let firstOfflineMs: number | null = null;
    let lastRecoveryMs: number | null = null;

    for (const ev of inAndPostEvents) {
      const evTimeMs = ev.timestampMs || 0;
      const type = getEventType(ev);

      if (SERVER_FAILURE_TYPES.has(type)) {
        if (currentOutageStartMs === null) {
          // Rule E: Only start new outage if currently online
          currentOutageStartMs = evTimeMs;
        }
        // If already offline, ignore duplicate failure
      } else if (SERVER_STARTED_TYPES.has(type)) {
        if (currentOutageStartMs !== null) {
          // Rule F & G: Close outage session
          const rawStart = currentOutageStartMs;
          const rawEnd = evTimeMs;
          currentOutageStartMs = null;

          // Rule H & I: Clamp session to [fromMs, toMs]
          if (rawEnd > fromMs && rawStart < toMs) {
            const clampedStart = Math.max(fromMs, rawStart);
            const clampedEnd = Math.min(toMs, rawEnd);
            const duration = clampedEnd - clampedStart;

            if (duration > 0) {
              outageSessions.push({
                serverId: srvCleanId,
                serverName: srvName,
                startTimeMs: clampedStart,
                endTimeMs: clampedEnd,
                durationMs: duration,
                isActive: false,
              });

              if (firstOfflineMs === null || clampedStart < firstOfflineMs) {
                firstOfflineMs = clampedStart;
              }
              if (lastRecoveryMs === null || clampedEnd > lastRecoveryMs) {
                lastRecoveryMs = clampedEnd;
              }
            }
          }
        }
        // If currently online, ignore duplicate recovery
      }
    }

    // Rule C: Active outage ongoing at period end
    let activeOutage = false;
    if (currentOutageStartMs !== null) {
      activeOutage = true;
      const rawStart = currentOutageStartMs;
      const rawEnd = effectiveNowMs;

      if (rawEnd > fromMs && rawStart < toMs) {
        const clampedStart = Math.max(fromMs, rawStart);
        const clampedEnd = Math.min(toMs, rawEnd);
        const duration = clampedEnd - clampedStart;

        if (duration > 0) {
          outageSessions.push({
            serverId: srvCleanId,
            serverName: srvName,
            startTimeMs: clampedStart,
            endTimeMs: clampedEnd,
            durationMs: duration,
            isActive: true,
          });

          if (firstOfflineMs === null || clampedStart < firstOfflineMs) {
            firstOfflineMs = clampedStart;
          }
        }
      }
    }

    const srvTotalDowntimeMs = outageSessions.reduce((acc, sess) => acc + sess.durationMs, 0);
    const incidentCount = outageSessions.length;

    // Uptime Rate Calculation
    let uptimeRate: number | null = null;
    if (dataCompleteness !== "DATA_NOT_AVAILABLE") {
      const rawRate = ((periodDurationMs - srvTotalDowntimeMs) / periodDurationMs) * 100;
      uptimeRate = Math.max(0, Math.min(100, Math.round(rawRate * 10) / 10));
    }

    totalServerIncidents += incidentCount;
    totalServerDowntimeMs += srvTotalDowntimeMs;

    serverResults.push({
      serverId: srvCleanId,
      serverName: srvName,
      currentStatus,
      firstOfflineMs,
      lastRecoveryMs,
      totalDowntimeMs: srvTotalDowntimeMs,
      totalDowntimeFormatted: formatDuration(srvTotalDowntimeMs),
      incidentCount,
      activeOutage,
      uptimeRate,
      dataCompleteness,
      outageSessions,
    });
  }

  // Calculate Overall Server Uptime Rate
  let overallServerUptimeRate: number | null = null;
  if (dataCompleteness !== "DATA_NOT_AVAILABLE" && serverResults.length > 0) {
    const totalPossibleMs = periodDurationMs * serverResults.length;
    const rawOverall = ((totalPossibleMs - totalServerDowntimeMs) / totalPossibleMs) * 100;
    overallServerUptimeRate = Math.max(0, Math.min(100, Math.round(rawOverall * 10) / 10));
  }

  return {
    serverResults,
    overallServerUptimeRate,
    totalServerCount: servers.length,
    onlineServerCount,
    totalServerIncidents,
    totalServerDowntimeMs,
    totalServerDowntimeFormatted: formatDuration(totalServerDowntimeMs),
    dataCompleteness,
  };
}
