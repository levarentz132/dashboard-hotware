/**
 * Pure presentation helper for classifying and grouping events for analyst-friendly reporting.
 *
 * CRITICAL ARCHITECTURAL REQUIREMENT:
 * This helper operates ONLY on already-calculated canonical reporting events (targetAlarmEvents).
 * It creates an analyst-friendly presentation view without altering canonical event datasets,
 * total counts, severity breakdowns, or uptime/downtime calculations.
 *
 * PHASE 2 & PRESENTATION CLEANUP V2 ADDITIONS:
 * - Chronological ordering: individual items and summary groups sorted together
 *   (descending by timestamp — newest first, matching dashboard sort order).
 * - Grouped summary items (e.g. Server Started, S3 Heartbeat, Disk Space Telemetry, Camera Outage Bursts)
 *   use representativeTimestampMs (= latest source timestamp) for accurate chronological placement.
 * - Duplicate server failure events and redundant companion noise are collapsed deterministically.
 * - Repetitive disk-space INFO telemetry is grouped into concise presentation summaries per storage target/identity.
 * - Camera offline/disconnect events occurring in high-frequency bursts (>= 2 events in 15m window)
 *   are grouped into readable CAMERA OUTAGE BURST presentation items while preserving individual camera downtime calculations.
 */

export type S3EventClassification = "ACTIONABLE" | "REPETITIVE_NOISE" | "INFORMATIONAL" | "UNCERTAIN";

export interface S3PresentationGroup {
  isSummary: true;
  patternKey: string;
  eventType: string;
  severity: string;
  count: number;
  firstTimestampMs: number;
  lastTimestampMs: number;
  representativeTimestampMs: number;
  firstFormattedTime: string;
  lastFormattedTime: string;
  representativeCaption: string;
  representativeDescription: string;
  sourceName?: string;
  systemName?: string;
}

export interface AnalystRelevantPresentationResult {
  presentationItems: Array<any | S3PresentationGroup>;
  canonicalCount: number;
  canonicalCriticalCount: number;
  canonicalWarningCount: number;
  canonicalInfoCount: number;
}

/**
 * Internal: format a millisecond timestamp to readable string.
 * Used when an event does not carry a pre-formatted time string.
 */
function formatTsMs(tsMs: number | undefined | null): string {
  if (!tsMs || !Number.isFinite(tsMs)) return "";
  try {
    return new Date(tsMs).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatDurationMs(diffMs: number): string {
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

/**
 * Checks if a text is noise ("No additional description available").
 */
function isNoAdditionalDescriptionNoise(text: string | undefined | null): boolean {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  return (
    clean === "no additional description available" ||
    clean === "no additional description" ||
    clean === "no description available" ||
    clean === "no description"
  );
}

/**
 * Checks if a text is a context-only line like "[RizalMaulanaYusuf: Server ZALSSS27]".
 */
function isContextOnlyLine(text: string | undefined | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return /^\[.*:\s*Server\s+.*\]$/i.test(trimmed) || /^\[.*\]$/i.test(trimmed);
}

/**
 * Extracts server or identity context from a context string.
 */
function extractContextInfo(text: string | undefined | null): string {
  if (!text) return "";
  const match = text.match(/\[(?:.*:\s*)?(Server\s+[^\]]+)\]/i) || text.match(/\[([^\]]+)\]/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}

/**
 * Checks if an event is related to S3 Cloud Bridge
 */
export function isS3Event(event: any): boolean {
  if (!event) return false;
  const eventType = String(event.eventType || event.eventData?.type || "").toLowerCase();
  const caption = String(event.caption || event.actionData?.caption || "").toLowerCase();
  const desc = String(event.description || event.actionData?.description || "").toLowerCase();
  const source = String(event.sourceName || event.eventData?.sourceName || "").toLowerCase();

  return (
    eventType.includes("s3") ||
    eventType.includes("cloudbridge") ||
    eventType.includes("cloudsync") ||
    caption.includes("s3") ||
    caption.includes("cloud bridge") ||
    desc.includes("s3") ||
    desc.includes("cloud bridge") ||
    source.includes("s3") ||
    source.includes("cloud bridge")
  );
}

/**
 * Checks if an event is disk space INFO telemetry (not CRITICAL storage failure).
 */
export function isDiskSpaceTelemetry(ev: any): boolean {
  if (!ev) return false;
  const sev = String(ev.severity || "").toUpperCase();
  if (sev === "CRITICAL" || sev === "FATAL" || sev === "ERROR") return false;

  const eventType = String(ev.eventType || ev.eventData?.type || ev.type || "").toLowerCase();
  const caption = String(ev.caption || ev.actionData?.caption || ev.eventLabel || "").toLowerCase();
  const desc = String(ev.description || ev.actionData?.description || ev.message || "").toLowerCase();
  const source = String(ev.source || ev.sourceName || "").toLowerCase();

  return (
    eventType.includes("disk") ||
    eventType.includes("storage") ||
    caption.includes("disk") ||
    caption.includes("storage") ||
    caption.includes("running out") ||
    desc.includes("disk") ||
    desc.includes("storage") ||
    desc.includes("running out") ||
    desc.includes("free remains") ||
    desc.includes("space on") ||
    source.includes("disk") ||
    source.includes("storage")
  );
}

/**
 * Helper to extract camera name from event description, caption, or metadata.
 */
export function extractCameraName(ev: any): string | null {
  if (!ev) return null;
  const desc = String(ev.description || ev.actionData?.description || ev.message || "");
  const caption = String(ev.caption || ev.actionData?.caption || ev.eventLabel || ev.label || "");
  const text = `${caption} ${desc}`;

  // Match: Camera 'XYZ' or Camera "XYZ"
  const match1 = text.match(/Camera\s+['"]([^'"]+)['"]/i);
  if (match1 && match1[1]) return match1[1].trim();

  // Match: Camera XYZ (word without quotes)
  const match2 = text.match(/Camera\s+([^\s,;]+)/i);
  if (
    match2 &&
    match2[1] &&
    !["disconnected", "is", "has", "went", "offline", "reconnected", "back", "been"].includes(match2[1].toLowerCase())
  ) {
    return match2[1].trim();
  }

  if (ev.cameraId) return String(ev.cameraId);
  return null;
}

/**
 * Safely extracts millisecond timestamp from event object.
 * Uses timestampMs if numeric; parses timestamp string safely if not; returns undefined if parsing fails.
 */
export function getEventTimestampMs(ev: any): number | undefined {
  if (!ev) return undefined;

  if (typeof ev.timestampMs === "number" && Number.isFinite(ev.timestampMs) && ev.timestampMs > 0) {
    return ev.timestampMs;
  }
  if (typeof ev.timestamp === "number" && Number.isFinite(ev.timestamp) && ev.timestamp > 0) {
    return ev.timestamp;
  }
  if (typeof ev.timeMs === "number" && Number.isFinite(ev.timeMs) && ev.timeMs > 0) {
    return ev.timeMs;
  }

  const str = String(ev.timestamp || ev.formattedTime || ev.time || "").trim();
  if (str && str !== "DATA NOT AVAILABLE FROM SOURCE") {
    if (/^\d{10,13}$/.test(str)) {
      const num = Number(str);
      if (Number.isFinite(num) && num > 0) return str.length === 10 ? num * 1000 : num;
    }
    const parsed = Date.parse(str);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * Checks if an event is a camera disconnect / offline event.
 */
export function isCameraDisconnectEvent(ev: any): boolean {
  if (!ev) return false;
  const eventType = String(ev.eventType || ev.eventData?.type || ev.type || "").toLowerCase();
  const caption = String(ev.caption || ev.actionData?.caption || ev.eventLabel || ev.label || "").toLowerCase();
  const desc = String(ev.description || ev.actionData?.description || ev.message || "").toLowerCase();

  return (
    eventType.includes("cameradisconnect") ||
    eventType.includes("devicedisconnect") ||
    eventType.includes("cameraoffline") ||
    caption.includes("camera disconnected") ||
    caption.includes("went offline") ||
    caption.includes("lost connection") ||
    caption.includes("has lost connection") ||
    desc.includes("went offline") ||
    desc.includes("camera disconnected") ||
    desc.includes("lost connection") ||
    desc.includes("has lost connection to the server")
  );
}

/**
 * Checks if an event is a camera reconnect / back online event.
 */
export function isCameraReconnectEvent(ev: any): boolean {
  if (!ev) return false;
  const eventType = String(ev.eventType || ev.eventData?.type || ev.type || "").toLowerCase();
  const caption = String(ev.caption || ev.actionData?.caption || ev.eventLabel || ev.label || "").toLowerCase();
  const desc = String(ev.description || ev.actionData?.description || ev.message || "").toLowerCase();

  return (
    eventType.includes("camerareconnect") ||
    eventType.includes("cameraconnect") ||
    eventType.includes("camerabackonline") ||
    eventType.includes("devicereconnect") ||
    caption.includes("is back online") ||
    caption.includes("has been reconnected") ||
    caption.includes("reconnected and is back online") ||
    caption.includes("back online") ||
    caption.includes("reconnected") ||
    desc.includes("is back online") ||
    desc.includes("has been reconnected") ||
    desc.includes("reconnected and is back online") ||
    desc.includes("back online") ||
    desc.includes("reconnected")
  );
}

/**
 * Checks if an event is part of camera connection / outage lifecycle (disconnect or reconnect).
 */
export function isCameraConnectionEvent(ev: any): boolean {
  return isCameraDisconnectEvent(ev) || isCameraReconnectEvent(ev);
}

/**
 * Retains backward compatibility for isCameraOfflineEvent.
 */
export function isCameraOfflineEvent(ev: any): boolean {
  return isCameraConnectionEvent(ev);
}

/**
 * Classifies an event based on analyst relevance rules.
 */
export function classifyS3Event(event: any): S3EventClassification {
  // ── DISK SPACE INFO TELEMETRY ──────────────────────────────────────────────
  if (isDiskSpaceTelemetry(event)) {
    return "REPETITIVE_NOISE";
  }

  // ── NON-S3 EVENTS ────────────────────────────────────────────────────────────
  if (!isS3Event(event)) {
    const eventType = String(
      event.eventType || event.eventData?.type || ""
    ).toLowerCase();

    // Genuine server operational incidents — MUST remain individually visible
    const isServerIncident =
      eventType.includes("serverfailure") ||
      eventType.includes("serverconflict") ||
      eventType.includes("serverstop") ||
      eventType.includes("serveroff") ||
      eventType.includes("networkissue") ||
      eventType.includes("networkfailure");

    if (isServerIncident) return "ACTIONABLE";

    // Camera / device disconnection incidents — routed to camera burst processor
    if (isCameraOfflineEvent(event)) return "ACTIONABLE";

    // Context-only server boot records — safe to group
    const isContextOnlyServerRecord =
      eventType === "serverstarted" ||
      eventType === "serverstart" ||
      eventType.startsWith("serverstart");

    if (isContextOnlyServerRecord) return "REPETITIVE_NOISE";

    // All other non-S3 events remain individually visible
    return "ACTIONABLE";
  }

  // ── S3 / CLOUD BRIDGE EVENTS ─────────────────────────────────────────────────
  const eventType = String(event.eventType || event.eventData?.type || "").toLowerCase();
  const caption = String(event.caption || event.actionData?.caption || "").toLowerCase();
  const desc = String(event.description || event.actionData?.description || "").toLowerCase();

  // 1. ACTIONABLE S3 FAILURES — Must remain individually visible
  const isActionable =
    eventType.includes("storagefailure") ||
    eventType.includes("storagefull") ||
    eventType.includes("s3authfailure") ||
    eventType.includes("s3accessdenied") ||
    eventType.includes("s3uploadfailed") ||
    caption.includes("storage failure") ||
    caption.includes("access denied") ||
    caption.includes("authentication failed") ||
    caption.includes("upload failed") ||
    desc.includes("storage failure") ||
    desc.includes("access denied") ||
    desc.includes("upload failed");

  if (isActionable) return "ACTIONABLE";

  // 2. REPETITIVE TELEMETRY / NOISE — Safe to summarize
  const isRepetitiveNoise =
    eventType.includes("s3syncheartbeat") ||
    eventType.includes("cloudsyncevent") ||
    eventType.includes("s3apierrorrate") ||
    caption.includes("api error rate") ||
    caption.includes("sync heartbeat") ||
    caption.includes("telemetry") ||
    desc.includes("api error rate") ||
    desc.includes("telemetry");

  if (isRepetitiveNoise) return "REPETITIVE_NOISE";

  // 3. INFORMATIONAL
  const isInformational =
    eventType.includes("backupfinished") ||
    eventType.includes("s3bucketconnected") ||
    caption.includes("backup finished") ||
    caption.includes("bucket connected");

  if (isInformational) return "INFORMATIONAL";

  // 4. UNCERTAIN — Must remain individually visible
  return "UNCERTAIN";
}

/**
 * Collapses exact duplicate events and companion noise occurring at the exact same timestamp.
 */
function collapseDuplicateAndCompanionEvents(items: any[]): any[] {
  if (items.length <= 1) return items;

  const bucketMap = new Map<string, any[]>();
  const bucketOrder: string[] = [];

  for (const item of items) {
    const tsKey = typeof item.timestampMs === "number" && item.timestampMs > 0
      ? String(item.timestampMs)
      : String(item.formattedTime || item.timestamp || "").trim();

    const sysKey = String(item.systemName || item.systemId || item.system || "").trim().toUpperCase();
    const srvKey = String(item.serverId || item.sourceName || item.source || item.serverName || "").trim().toUpperCase();
    const sevKey = String(item.severity || "INFO").trim().toUpperCase();
    const typeKey = String(item.eventType || item.eventData?.type || item.caption || "").trim().toLowerCase();

    const key = `${tsKey}|${sysKey}|${srvKey}|${sevKey}|${typeKey}`;

    if (!bucketMap.has(key)) {
      bucketMap.set(key, []);
      bucketOrder.push(key);
    }
    bucketMap.get(key)!.push(item);
  }

  const result: any[] = [];

  for (const key of bucketOrder) {
    const group = bucketMap.get(key)!;
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const primaryEvents: any[] = [];
    const contextEvents: any[] = [];
    const noiseEvents: any[] = [];

    for (const ev of group) {
      const cap = String(ev.caption || ev.eventLabel || "").trim();
      const desc = String(ev.description || "").trim();

      if (isNoAdditionalDescriptionNoise(cap) && isNoAdditionalDescriptionNoise(desc)) {
        noiseEvents.push(ev);
      } else if (isContextOnlyLine(desc) || (isContextOnlyLine(cap) && !desc)) {
        contextEvents.push(ev);
      } else {
        primaryEvents.push(ev);
      }
    }

    if (primaryEvents.length > 0) {
      let rep = primaryEvents.reduce((best, curr) => {
        const bestLen = String(best.caption || "").length + String(best.description || "").length;
        const currLen = String(curr.caption || "").length + String(curr.description || "").length;
        return currLen > bestLen ? curr : best;
      }, primaryEvents[0]);

      const merged = { ...rep };

      const allContextStrings: string[] = [];
      for (const cEv of [...primaryEvents, ...contextEvents]) {
        const cDesc = String(cEv.description || "");
        const cCap = String(cEv.caption || "");
        if (isContextOnlyLine(cDesc)) {
          allContextStrings.push(extractContextInfo(cDesc));
        }
        if (isContextOnlyLine(cCap)) {
          allContextStrings.push(extractContextInfo(cCap));
        }
      }

      if (allContextStrings.length > 0) {
        const currentCapDesc = `${merged.caption || ""} ${merged.description || ""}`;
        for (const ctxInfo of allContextStrings) {
          if (ctxInfo && !currentCapDesc.includes(ctxInfo)) {
            if (merged.caption && !merged.caption.includes("—") && !merged.caption.includes("[")) {
              merged.caption = `${merged.caption} — ${ctxInfo}`;
            } else if (!merged.description || isNoAdditionalDescriptionNoise(merged.description)) {
              merged.description = ctxInfo;
            }
          }
        }
      }

      if (isNoAdditionalDescriptionNoise(merged.description)) {
        merged.description = "";
      }

      result.push(merged);
    } else if (contextEvents.length > 0) {
      result.push(contextEvents[0]);
    } else {
      result.push(noiseEvents[0]);
    }
  }

  return result;
}

/**
 * Groups repeated server conflict events occurring within a 15-minute sliding window.
 */
function groupServerConflictEvents(items: any[], windowMs: number = 15 * 60 * 1000): {
  individualItems: any[];
  conflictSummaries: S3PresentationGroup[];
} {
  const isConflictEvent = (ev: any): boolean => {
    const eventType = String(ev.eventType || ev.eventData?.type || "").toLowerCase();
    const caption = String(ev.caption || ev.eventLabel || "").toLowerCase();
    const desc = String(ev.description || "").toLowerCase();

    return (
      eventType.includes("serverconflict") ||
      caption.includes("conflicting address") ||
      caption.includes("server conflict") ||
      desc.includes("conflicting address") ||
      desc.includes("server conflict")
    );
  };

  const conflicts: any[] = [];
  const nonConflicts: any[] = [];

  for (const item of items) {
    if (isConflictEvent(item)) {
      conflicts.push(item);
    } else {
      nonConflicts.push(item);
    }
  }

  if (conflicts.length === 0) {
    return { individualItems: items, conflictSummaries: [] };
  }

  const identityMap = new Map<string, any[]>();

  for (const ev of conflicts) {
    const typeKey = String(ev.eventType || "serverConflictEvent").trim().toLowerCase();
    const sevKey = String(ev.severity || "CRITICAL").trim().toUpperCase();
    const sysKey = String(ev.systemName || ev.systemId || ev.system || "CENTRALIZED").trim().toUpperCase();
    const srvKey = String(ev.sourceName || ev.serverId || ev.source || ev.serverName || "SERVER").trim().toUpperCase();
    const capStr = String(ev.caption || ev.eventLabel || "").trim().toLowerCase();
    const descStr = String(ev.description || "").trim().toLowerCase();
    const descKey = `${capStr}:${descStr}`;

    const identityKey = `${typeKey}|${sevKey}|${sysKey}|${srvKey}|${descKey}`;
    if (!identityMap.has(identityKey)) {
      identityMap.set(identityKey, []);
    }
    identityMap.get(identityKey)!.push(ev);
  }

  const remainingIndividual: any[] = [...nonConflicts];
  const conflictSummaries: S3PresentationGroup[] = [];

  identityMap.forEach((partitionEvents) => {
    const sorted = [...partitionEvents].sort((a, b) => {
      const tsA = typeof a.timestampMs === "number" ? a.timestampMs : 0;
      const tsB = typeof b.timestampMs === "number" ? b.timestampMs : 0;
      return tsA - tsB;
    });

    let currentWindow: any[] = [];

    for (const ev of sorted) {
      const tsMs = typeof ev.timestampMs === "number" ? ev.timestampMs : 0;

      if (currentWindow.length === 0) {
        currentWindow.push(ev);
      } else {
        const lastEv = currentWindow[currentWindow.length - 1];
        const lastTsMs = typeof lastEv.timestampMs === "number" ? lastEv.timestampMs : 0;

        if (tsMs > 0 && lastTsMs > 0 && tsMs - lastTsMs <= windowMs) {
          currentWindow.push(ev);
        } else {
          processWindow(currentWindow);
          currentWindow = [ev];
        }
      }
    }

    if (currentWindow.length > 0) {
      processWindow(currentWindow);
    }
  });

  function processWindow(windowEvents: any[]) {
    if (windowEvents.length === 1) {
      remainingIndividual.push(windowEvents[0]);
      return;
    }

    const firstEv = windowEvents[0];
    const lastEv = windowEvents[windowEvents.length - 1];

    const firstTs = typeof firstEv.timestampMs === "number" ? firstEv.timestampMs : 0;
    const lastTs = typeof lastEv.timestampMs === "number" ? lastEv.timestampMs : 0;

    const firstFormatted = firstEv.formattedTime || firstEv.timestamp || formatTsMs(firstTs);
    const lastFormatted = lastEv.formattedTime || lastEv.timestamp || formatTsMs(lastTs);

    const typeKey = String(firstEv.eventType || "serverConflictEvent");
    const sevKey = String(firstEv.severity || "CRITICAL").toUpperCase();
    const sysKey = String(firstEv.systemName || firstEv.system || "CENTRALIZED");
    const srvKey = String(firstEv.sourceName || firstEv.source || "SERVER");
    const count = windowEvents.length;

    const patternKey = `serverConflict-${typeKey}-${sevKey}-${sysKey}-${srvKey}-${firstTs}`;
    const repCaption = `[SUMMARY OF ${count} REPEATED SERVER CONFLICT EVENTS]`;
    const origCaption = firstEv.caption || "Server Conflict";
    const origDesc = firstEv.description || "Conflicting Address";
    const repDesc = `${origCaption} - ${origDesc} (${count} occurrences: ${firstFormatted} → ${lastFormatted})`;

    const group: S3PresentationGroup = {
      isSummary: true,
      patternKey,
      eventType: typeKey,
      severity: sevKey,
      count,
      firstTimestampMs: firstTs,
      lastTimestampMs: lastTs,
      representativeTimestampMs: lastTs || firstTs,
      firstFormattedTime: firstFormatted,
      lastFormattedTime: lastFormatted,
      representativeCaption: repCaption,
      representativeDescription: repDesc,
      sourceName: srvKey,
      systemName: sysKey,
    };

    conflictSummaries.push(group);
  }

  return { individualItems: remainingIndividual, conflictSummaries };
}

/**
 * Groups camera disconnect/reconnect events occurring in bursts (>= 2 events within a 15-minute sliding window).
 * If a camera event occurs as an isolated incident (only 1 event in window), it remains an individual actionable item.
 */
function groupCameraOutageBursts(items: any[], windowMs: number = 15 * 60 * 1000): {
  individualItems: any[];
  cameraBurstSummaries: S3PresentationGroup[];
} {
  const cameraEvents: any[] = [];
  const nonCameraEvents: any[] = [];

  for (const item of items) {
    if (isCameraConnectionEvent(item)) {
      cameraEvents.push(item);
    } else {
      nonCameraEvents.push(item);
    }
  }

  if (cameraEvents.length === 0) {
    return { individualItems: items, cameraBurstSummaries: [] };
  }

  // Partition by system & server identity
  const identityMap = new Map<string, any[]>();

  for (const ev of cameraEvents) {
    const sysKey = String(ev.systemName || ev.systemId || ev.system || "CENTRALIZED").trim().toUpperCase();
    const extractedCam = extractCameraName(ev);
    const srvKey = String(
      ev.serverId ||
      ev.serverName ||
      (ev.sourceName && (!extractedCam || !ev.sourceName.includes(extractedCam)) ? ev.sourceName : "") ||
      "LOCAL SERVER"
    ).trim().toUpperCase();

    const partitionKey = `${sysKey}|${srvKey}`;

    if (!identityMap.has(partitionKey)) {
      identityMap.set(partitionKey, []);
    }
    identityMap.get(partitionKey)!.push(ev);
  }

  const remainingIndividual: any[] = [...nonCameraEvents];
  const cameraBurstSummaries: S3PresentationGroup[] = [];

  identityMap.forEach((partitionEvents) => {
    // Sort ASCENDING by timestamp for window grouping
    const sorted = [...partitionEvents].sort((a, b) => {
      const tsA = getEventTimestampMs(a) ?? 0;
      const tsB = getEventTimestampMs(b) ?? 0;
      return tsA - tsB;
    });

    let currentWindow: any[] = [];

    for (const ev of sorted) {
      const tsMs = getEventTimestampMs(ev) ?? 0;

      if (currentWindow.length === 0) {
        currentWindow.push(ev);
      } else {
        const lastEv = currentWindow[currentWindow.length - 1];
        const lastTsMs = getEventTimestampMs(lastEv) ?? 0;

        if (tsMs > 0 && lastTsMs > 0 && tsMs - lastTsMs <= windowMs) {
          currentWindow.push(ev);
        } else {
          processCameraWindow(currentWindow);
          currentWindow = [ev];
        }
      }
    }

    if (currentWindow.length > 0) {
      processCameraWindow(currentWindow);
    }
  });

  function processCameraWindow(windowEvents: any[]) {
    // If only 1 camera event in window, retain as individual incident
    if (windowEvents.length === 1) {
      remainingIndividual.push(windowEvents[0]);
      return;
    }

    const firstEv = windowEvents[0];
    const lastEv = windowEvents[windowEvents.length - 1];

    const firstTs = getEventTimestampMs(firstEv) ?? 0;
    const lastTs = getEventTimestampMs(lastEv) ?? 0;

    const firstFormatted = firstEv.formattedTime || firstEv.timestamp || formatTsMs(firstTs);
    const lastFormatted = lastEv.formattedTime || lastEv.timestamp || formatTsMs(lastTs);

    const sysKey = String(firstEv.systemName || firstEv.system || "CENTRALIZED");
    const extractedCamFirst = extractCameraName(firstEv);
    const srvKey = String(
      firstEv.serverId ||
      firstEv.serverName ||
      (firstEv.sourceName && (!extractedCamFirst || !firstEv.sourceName.includes(extractedCamFirst)) ? firstEv.sourceName : "") ||
      "LOCAL SERVER"
    );
    const count = windowEvents.length;

    // Collect unique camera names
    const cameraNamesSet = new Set<string>();
    windowEvents.forEach((ev) => {
      const camName = extractCameraName(ev);
      if (camName) {
        cameraNamesSet.add(camName);
      } else if (ev.sourceName && ev.sourceName !== srvKey) {
        cameraNamesSet.add(ev.sourceName);
      }
    });

    const uniqueCount = cameraNamesSet.size > 0 ? cameraNamesSet.size : count;
    const camSampleArr = Array.from(cameraNamesSet).slice(0, 3);
    const camSampleStr = camSampleArr.length > 0 ? camSampleArr.join(", ") : `${uniqueCount} cameras`;
    const extraCamStr = cameraNamesSet.size > 3 ? ` (+${cameraNamesSet.size - 3} more)` : "";

    // Check recovery status across events in burst
    const hasReconnect = windowEvents.some((ev) => isCameraReconnectEvent(ev) || String(ev.status || "").toUpperCase() === "RECOVERED");
    const reconnectEv = [...windowEvents].reverse().find((ev) => isCameraReconnectEvent(ev) || String(ev.status || "").toUpperCase() === "RECOVERED");

    let recoveryText = "NOT OBSERVED";
    let durationStr = "ACTIVE / N/A";

    if (hasReconnect) {
      const recTs = getEventTimestampMs(reconnectEv) ?? lastTs;
      const recTimeStr = reconnectEv?.formattedTime || reconnectEv?.timestamp || formatTsMs(recTs);
      recoveryText = recTimeStr || lastFormatted;

      const durationMs = recTs > firstTs ? recTs - firstTs : (lastTs > firstTs ? lastTs - firstTs : 0);
      durationStr = durationMs > 0 ? formatDurationMs(durationMs) : "< 1s";
    }

    const patternKey = `cameraBurst-${sysKey}-${srvKey}-${firstTs}`;
    const repCaption = `CAMERA OUTAGE BURST (${uniqueCount} CAMERA${uniqueCount > 1 ? "S" : ""} AFFECTED)`;

    const repDesc = `System: ${sysKey} (${srvKey}) • Cameras affected: ${uniqueCount} cameras affected (${camSampleStr}${extraCamStr}) • Started: ${firstFormatted} • ${hasReconnect ? `Recovered: ${recoveryText} (RECOVERED)` : `Recovery: NOT OBSERVED`} • Duration: ${durationStr} • Source events: ${count}`;

    const group: S3PresentationGroup = {
      isSummary: true,
      patternKey,
      eventType: "cameraOfflineBurst",
      severity: count >= 10 ? "CRITICAL" : "WARNING",
      count,
      firstTimestampMs: firstTs,
      lastTimestampMs: lastTs,
      representativeTimestampMs: lastTs || firstTs,
      firstFormattedTime: firstFormatted,
      lastFormattedTime: lastFormatted,
      representativeCaption: repCaption,
      representativeDescription: repDesc,
      sourceName: srvKey,
      systemName: sysKey,
    };

    cameraBurstSummaries.push(group);
  }

  return { individualItems: remainingIndividual, cameraBurstSummaries };
}

/**
 * Transforms canonical events into analyst-relevant presentation view.
 *
 * Guarantees:
 * - Canonical counts and severity breakdown are calculated BEFORE any presentation
 *   transformation and are NEVER derived from the filtered/grouped output.
 * - Repetitive noise events (S3 telemetry, server boot lifecycle, disk space INFO telemetry)
 *   are grouped into summary items keyed by identity.
 * - Camera outage bursts (>= 2 camera offline events within 15-minute window) are grouped into readable burst summaries.
 * - Server conflict events within 15-minute windows are grouped into server conflict summaries.
 * - Actionable, informational, and uncertain events are collapsed for exact duplicates/noise companions
 *   and remain individually visible for distinct incidents.
 * - Presentation items (individual + summary) are sorted DESCENDING by timestamp (newest first),
 *   matching dashboard sort order. Summary groups use representativeTimestampMs (= latest source timestamp).
 */
export function buildAnalystRelevantEventLog(events: any[]): AnalystRelevantPresentationResult {
  // ── STEP 1: Canonical counts — calculated FIRST, never modified after ────────
  const canonicalCount = events.length;
  let canonicalCriticalCount = 0;
  let canonicalWarningCount = 0;
  let canonicalInfoCount = 0;

  events.forEach((ev) => {
    const sev = String(ev.severity || "").toUpperCase();
    if (sev === "CRITICAL") canonicalCriticalCount++;
    else if (sev === "WARNING") canonicalWarningCount++;
    else canonicalInfoCount++;
  });

  // ── STEP 2: Classify and route each event ────────────────────────────────────
  const individualItems: any[] = [];
  const telemetrySummaryMap = new Map<string, S3PresentationGroup>();

  events.forEach((ev) => {
    const classification = classifyS3Event(ev);

    if (classification === "REPETITIVE_NOISE") {
      const typeKey = String(ev.eventType || "s3Telemetry");
      const sevKey = String(ev.severity || "INFO").toUpperCase();
      const sysKey = String(ev.systemName || ev.system || "CENTRALIZED").toUpperCase();
      const srcKey = String(ev.sourceName || ev.source || "SYSTEM").toUpperCase();
      const tsMs: number = getEventTimestampMs(ev) ?? 0;

      // Handle disk space INFO telemetry grouping
      if (isDiskSpaceTelemetry(ev)) {
        const desc = String(ev.description || ev.caption || "");
        const targetMatch = desc.match(/on\s+([^(]+)/i) || desc.match(/\(([^)]+)\)/i);
        const targetName = targetMatch ? targetMatch[1].trim() : "Storage";
        const patternKey = `diskSpace-${sevKey}-${sysKey}-${srcKey}-${targetName.toUpperCase()}`;

        const existing = telemetrySummaryMap.get(patternKey);
        if (existing) {
          existing.count++;
          if (tsMs > 0 && (existing.firstTimestampMs === 0 || tsMs < existing.firstTimestampMs)) {
            existing.firstTimestampMs = tsMs;
            existing.firstFormattedTime = ev.formattedTime || formatTsMs(tsMs);
          }
          if (tsMs > existing.lastTimestampMs) {
            existing.lastTimestampMs = tsMs;
            existing.lastFormattedTime = ev.formattedTime || formatTsMs(tsMs);
            existing.representativeTimestampMs = tsMs;

            const freeMatch = desc.match(/Less than [\d\.]+\s+GB free/i);
            if (freeMatch) {
              existing.representativeDescription = `${targetName} (${sysKey}) — Repeated low disk-space telemetry detected. Latest reported free space: ${freeMatch[0]}`;
            }
          }
          existing.representativeCaption = `DISK SPACE TELEMETRY — ${existing.count} EVENTS`;
        } else {
          const formattedTs = ev.formattedTime || formatTsMs(tsMs);
          const freeMatch = desc.match(/Less than [\d\.]+\s+GB free/i);
          const latestFreeStr = freeMatch ? freeMatch[0] : "low space detected";

          const group: S3PresentationGroup = {
            isSummary: true,
            patternKey,
            eventType: "diskSpaceTelemetry",
            severity: "INFO",
            count: 1,
            firstTimestampMs: tsMs,
            lastTimestampMs: tsMs,
            representativeTimestampMs: tsMs,
            firstFormattedTime: formattedTs,
            lastFormattedTime: formattedTs,
            representativeCaption: `DISK SPACE TELEMETRY — 1 EVENT`,
            representativeDescription: `${targetName} (${sysKey}) — Repeated low disk-space telemetry detected. Latest reported free space: ${latestFreeStr}`,
            sourceName: ev.sourceName || targetName,
            systemName: ev.systemName,
          };
          telemetrySummaryMap.set(patternKey, group);
        }
      } else {
        // Handle standard telemetry (S3 heartbeat, server started)
        const patternKey = `${typeKey}-${sevKey}-${sysKey}-${srcKey}`;
        const existing = telemetrySummaryMap.get(patternKey);

        if (existing) {
          existing.count++;
          if (tsMs > 0 && (existing.firstTimestampMs === 0 || tsMs < existing.firstTimestampMs)) {
            existing.firstTimestampMs = tsMs;
            existing.firstFormattedTime = ev.formattedTime || formatTsMs(tsMs);
          }
          if (tsMs > existing.lastTimestampMs) {
            existing.lastTimestampMs = tsMs;
            existing.lastFormattedTime = ev.formattedTime || formatTsMs(tsMs);
            existing.representativeTimestampMs = tsMs;
          }
        } else {
          const formattedTs = ev.formattedTime || formatTsMs(tsMs);
          const isServerStarted = typeKey.toLowerCase().includes("serverstart");
          const defaultCaption = isServerStarted ? "Server Started" : "S3 Telemetry Heartbeat";
          const defaultDesc = isServerStarted
            ? "Repeated server start / boot lifecycle events"
            : "Repeated background telemetry polling events";

          const group: S3PresentationGroup = {
            isSummary: true,
            patternKey,
            eventType: ev.eventType || "s3Telemetry",
            severity: ev.severity || "INFO",
            count: 1,
            firstTimestampMs: tsMs,
            lastTimestampMs: tsMs,
            representativeTimestampMs: tsMs,
            firstFormattedTime: formattedTs,
            lastFormattedTime: formattedTs,
            representativeCaption: ev.caption || ev.eventLabel || defaultCaption,
            representativeDescription: ev.description || defaultDesc,
            sourceName: ev.sourceName,
            systemName: ev.systemName,
          };
          telemetrySummaryMap.set(patternKey, group);
        }
      }
    } else {
      individualItems.push(ev);
    }
  });

  // ── STEP 3: Collapse exact duplicates and noise companion items ─────────────
  const collapsedIndividualItems = collapseDuplicateAndCompanionEvents(individualItems);

  // ── STEP 3.5: Apply Safe Server Conflict Grouping ───────────────────────────
  const { individualItems: postConflictItems, conflictSummaries } =
    groupServerConflictEvents(collapsedIndividualItems);

  // ── STEP 3.6: Apply Camera Outage Burst Grouping ────────────────────────────
  const { individualItems: finalIndividualItems, cameraBurstSummaries } =
    groupCameraOutageBursts(postConflictItems);

  // ── STEP 4: Combine individual items and summary groups, sort chronologically ─
  const combined: Array<any | S3PresentationGroup> = [
    ...finalIndividualItems,
    ...Array.from(telemetrySummaryMap.values()),
    ...conflictSummaries,
    ...cameraBurstSummaries,
  ];

  combined.sort((a, b) => {
    const tsA = (a as S3PresentationGroup).isSummary
      ? ((a as S3PresentationGroup).representativeTimestampMs || (a as S3PresentationGroup).lastTimestampMs || (a as S3PresentationGroup).firstTimestampMs || 0)
      : (getEventTimestampMs(a) ?? 0);
    const tsB = (b as S3PresentationGroup).isSummary
      ? ((b as S3PresentationGroup).representativeTimestampMs || (b as S3PresentationGroup).lastTimestampMs || (b as S3PresentationGroup).firstTimestampMs || 0)
      : (getEventTimestampMs(b) ?? 0);
    return tsB - tsA;
  });

  return {
    presentationItems: combined,
    canonicalCount,
    canonicalCriticalCount,
    canonicalWarningCount,
    canonicalInfoCount,
  };
}
