/**
 * Utility for tracking and formatting exact camera offline timestamps across the application.
 */

/**
 * Normalizes epoch timestamps in seconds, milliseconds, or microseconds to milliseconds.
 */
export function normalizeEpochMs(timestampValue: string | number | Date | null | undefined): number | null {
  if (timestampValue === undefined || timestampValue === null || timestampValue === "") return null;
  if (timestampValue instanceof Date) return isNaN(timestampValue.getTime()) ? null : timestampValue.getTime();

  let num = typeof timestampValue === "number" ? timestampValue : Number(timestampValue);
  if (!isNaN(num) && num > 0) {
    // Nx microsecond timestamps (> 1e14)
    if (num > 100000000000000) {
      num = Math.floor(num / 1000);
    }
    // Unix second timestamps (< 1e11)
    if (num < 100000000000) {
      num = num * 1000;
    }
    return num;
  }

  // Parse ISO string
  if (typeof timestampValue === "string") {
    const parsed = Date.parse(timestampValue);
    if (!isNaN(parsed)) return parsed;
  }

  return null;
}

/**
 * Formats timestamp to exact string: "DD MMM YYYY, HH:mm:ss WIB"
 */
export function formatExactTimestamp(timestampValue: string | number | Date | null | undefined): string {
  if (timestampValue === undefined || timestampValue === null || timestampValue === "") return "N/A";
  const ms = normalizeEpochMs(timestampValue);
  if (ms === null) {
    return typeof timestampValue === "string" ? timestampValue : "N/A";
  }

  const date = new Date(ms);
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
    return `${formatted} WIB`;
  } catch {
    return date.toLocaleString("en-GB", { hour12: false });
  }
}

/**
 * Persistent tracker in browser storage to record when an offline camera was first observed offline.
 */
export function trackOfflineCamera(cameraId: string, isOffline: boolean): number | null {
  if (typeof window === "undefined" || !cameraId) return null;
  const cleanId = String(cameraId).replace(/[{}]/g, "").toLowerCase();
  const storageKey = `nx_offline_ts_${cleanId}`;

  try {
    if (isOffline) {
      const existing = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
      if (existing) {
        const parsed = parseInt(existing, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      const now = Date.now();
      localStorage.setItem(storageKey, String(now));
      sessionStorage.setItem(storageKey, String(now));
      return now;
    } else {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Resolves the exact offline time for a given camera using device attributes,
 * event logs, or client-side offline observer tracking.
 */
export function getOfflineExactTime(
  camera: any,
  events?: any[]
): { exactTime: string; timestampMs: number | null } {
  if (!camera) return { exactTime: "N/A", timestampMs: null };

  const camId = (camera.id || camera.guid || "").toLowerCase().replace(/[{}]/g, "");
  const camName = (camera.name || "").toLowerCase();

  // 1. Check direct device properties
  let offlineMs =
    normalizeEpochMs(camera.lastSeen) ??
    normalizeEpochMs(camera.offlineTime) ??
    normalizeEpochMs(camera.disconnectTime) ??
    normalizeEpochMs(camera.lastSeenMs) ??
    normalizeEpochMs(camera.parameters?.lastSeen) ??
    normalizeEpochMs(camera.updatedAt);

  // 2. Search related disconnect / offline events
  if (!offlineMs && Array.isArray(events) && events.length > 0) {
    const matchingEvents = events.filter((ev: any) => {
      const evCamId = (ev.cameraId || ev.resourceId || ev.sourceServerId || ev.id || "").toLowerCase().replace(/[{}]/g, "");
      const evName = (ev.sourceName || ev.source || "").toLowerCase();
      const type = (ev.eventType || ev.type || "").toLowerCase();
      const caption = (ev.caption || "").toLowerCase();
      const desc = (ev.description || "").toLowerCase();

      const isDisc =
        type.includes("disconnect") ||
        type.includes("offline") ||
        caption.includes("disconnect") ||
        caption.includes("offline") ||
        desc.includes("disconnected") ||
        desc.includes("is now offline") ||
        type === "cameradisconnectevent" ||
        type === "devicedisconnected";

      const matches = (camId && evCamId === camId) || (camName && evName === camName);
      return isDisc && matches;
    });

    if (matchingEvents.length > 0) {
      // Pick the latest event
      const latest = matchingEvents[matchingEvents.length - 1];
      offlineMs =
        normalizeEpochMs(latest.timestampMs) ??
        normalizeEpochMs(latest.actionData?.timestamp || latest.eventData?.timestamp) ??
        normalizeEpochMs(latest.timestamp);
    }
  }

  // 3. Fall back to client-side tracked observer timestamp
  if (!offlineMs && camId) {
    offlineMs = trackOfflineCamera(camId, true);
  }

  if (offlineMs) {
    return {
      exactTime: formatExactTimestamp(offlineMs),
      timestampMs: offlineMs,
    };
  }

  // 4. If all else fails, use current timestamp and record it
  const now = Date.now();
  if (camId) {
    trackOfflineCamera(camId, true);
  }
  return {
    exactTime: formatExactTimestamp(now),
    timestampMs: now,
  };
}
