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
export function trackOfflineCamera(
  cameraId: string,
  isOffline: boolean,
  explicitTimestampMs?: number | null,
): number | null {
  if (typeof window === "undefined" || !cameraId) return null;
  const cleanId = String(cameraId).replace(/[{}]/g, "").toLowerCase();
  const storageKey = `nx_offline_ts_${cleanId}`;

  try {
    if (isOffline) {
      if (explicitTimestampMs && explicitTimestampMs > 0) {
        localStorage.setItem(storageKey, String(explicitTimestampMs));
        sessionStorage.setItem(storageKey, String(explicitTimestampMs));
        return explicitTimestampMs;
      }
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
      if (!ev) return false;
      const evCamId = (ev.cameraId || ev.resourceId || ev.eventData?.resourceId || ev.sourceServerId || ev.id || "").toLowerCase().replace(/[{}]/g, "");
      const devIds = Array.isArray(ev.actionData?.deviceIds)
        ? ev.actionData.deviceIds.map((id: string) => String(id).replace(/[{}]/g, "").toLowerCase())
        : [];
      const evName = (ev.sourceName || ev.actionData?.sourceName || ev.source || "").toLowerCase();
      const type = String(ev.eventData?.type || ev.eventType || ev.type || "").toLowerCase();
      const caption = String(ev.actionData?.caption || ev.caption || "").toLowerCase();
      const desc = String(ev.actionData?.description || ev.description || "").toLowerCase();

      // Check if it is a recovery event
      if (
        caption.includes("online") ||
        desc.includes("back online") ||
        desc.includes("reconnected") ||
        type.includes("reconnect")
      ) {
        return false;
      }

      const isDisc =
        type.includes("disconnect") ||
        type.includes("offline") ||
        caption.includes("disconnect") ||
        caption.includes("offline") ||
        desc.includes("disconnected") ||
        desc.includes("lost connection") ||
        desc.includes("is now offline") ||
        type === "cameradisconnectevent" ||
        type === "devicedisconnected";

      if (!isDisc) return false;

      const matches =
        (camId && (evCamId === camId || devIds.includes(camId) || evCamId.includes(camId))) ||
        (camName && (evName === camName || evName.includes(camName) || caption.includes(camName) || desc.includes(camName)));

      return matches;
    });

    if (matchingEvents.length > 0) {
      // Sort chronologically ascending to find the initial disconnect timestamp
      const sorted = matchingEvents.sort((a: any, b: any) => {
        const timeA = normalizeEpochMs(a.timestampMs) ?? normalizeEpochMs(a.actionData?.timestamp || a.eventData?.timestamp) ?? normalizeEpochMs(a.timestamp) ?? 0;
        const timeB = normalizeEpochMs(b.timestampMs) ?? normalizeEpochMs(b.actionData?.timestamp || b.eventData?.timestamp) ?? normalizeEpochMs(b.timestamp) ?? 0;
        return timeA - timeB;
      });
      const initial = sorted[0];
      offlineMs =
        normalizeEpochMs(initial.timestampMs) ??
        normalizeEpochMs(initial.actionData?.timestamp || initial.eventData?.timestamp) ??
        normalizeEpochMs(initial.timestamp);
    }
  }

  // 3. Fall back to client-side tracked observer timestamp
  if (offlineMs && camId) {
    trackOfflineCamera(camId, true, offlineMs);
  } else if (!offlineMs && camId) {
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
    trackOfflineCamera(camId, true, now);
  }
  return {
    exactTime: formatExactTimestamp(now),
    timestampMs: now,
  };
}
