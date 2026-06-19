const CAMERA_ALARM_DEBUG_KEY = "camera-alarm-debug-log";
const CAMERA_ALARM_DEBUG_LIMIT = 100;

export interface CameraAlarmDebugEntry {
  timestamp?: string;
  event: "status-change" | "request-start" | "request-success" | "request-failure" | "request-error";
  reason: string;
  cameraName?: string;
  cameraId?: string;
  systemId?: string;
  systemName?: string;
  previousStatus?: string;
  currentStatus?: string;
  status?: string;
  responseStatus?: number;
  details?: unknown;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function pushCameraAlarmDebug(entry: CameraAlarmDebugEntry) {
  const payload: CameraAlarmDebugEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Always log to console for easy debugging.
  console.warn("[CameraAlarmDebug]", payload);

  // Keep a small in-browser history for quick inspection.
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CAMERA_ALARM_DEBUG_KEY);
      const existing = safeJsonParse<CameraAlarmDebugEntry[]>(raw) || [];
      const next = [...existing, payload].slice(-CAMERA_ALARM_DEBUG_LIMIT);
      window.localStorage.setItem(CAMERA_ALARM_DEBUG_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage issues; console logging is still available.
    }
  }

  return payload;
}

export function getCameraAlarmDebugEntries(): CameraAlarmDebugEntry[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const raw = window.localStorage.getItem(CAMERA_ALARM_DEBUG_KEY);
  return safeJsonParse<CameraAlarmDebugEntry[]>(raw) || [];
}

export function clearCameraAlarmDebug() {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(CAMERA_ALARM_DEBUG_KEY);
  }
}
