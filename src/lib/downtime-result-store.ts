/**
 * Downtime result persistence layer.
 *
 * Source of truth: data/downtime-results/{key}.json on disk.
 * Redis: speed layer only — invalidated when file mtime changes.
 *
 * Stores the output of calculateDowntimeResult() — NOT raw events.
 */

import fs from "fs";
import path from "path";
import { readJsonWithCache, writeJsonWithCache } from "./json-store-cache";
import { redisKeys } from "./redis/keys";

// ============================================
// STORAGE DIRECTORY
// ============================================

const DOWNTIME_RESULTS_DIR = path.join(process.cwd(), "data", "downtime-results");

function ensureDir(): void {
  if (!fs.existsSync(DOWNTIME_RESULTS_DIR)) {
    fs.mkdirSync(DOWNTIME_RESULTS_DIR, { recursive: true });
  }
}

// ============================================
// DOCUMENT SCHEMA
// ============================================

export type PeriodType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

export interface StoredDowntimeMetrics {
  periodCameraUptimeRate: number;
  metricDescription: string;
  totalDowntimeMs: number;
  totalDowntimeFormatted: string;
  totalOfflineIncidents: number;
  resolvedIncidents: number;
  activeIncidents: number;
}

export interface StoredDowntimeCamera {
  serverName: string;
  cameraName: string;
  cameraId: string;
  status: string;
  firstOffline: string;
  lastOffline: string;
  offlineDuration: string;
  incidentCount: number;
  availabilityRate: string;
  incidents?: Array<{
    incidentNumber: number;
    offlineTime: string;
    offlineTimestampMs?: number | null;
    onlineTime: string;
    onlineTimestampMs?: number | null;
    duration: string;
    status: string;
    reason?: string;
  }>;
}

import type {
  ServerHealthItem,
  ServerUptimeItem,
  ServerStorageStatsItem,
  ServerStorageDiskItem,
  AlarmReportItem,
  CameraReportItem,
} from "@/components/reporting/export-utils";

export interface StoredServerBlock {
  health?: ServerHealthItem[];
  uptimeResults?: ServerUptimeItem[];
  storageStats?: ServerStorageStatsItem[];
  disks?: ServerStorageDiskItem[];
}

export interface StoredAlarmsBlock {
  canonicalCount?: number;
  rawAlarms?: AlarmReportItem[];
  presentationItems?: any[];
}

export interface StoredDowntimeResult {
  version: number;
  periodType: PeriodType;
  dateFrom: string;
  dateTo: string;
  label: string;
  selectedServerLabel: string;
  calculatedAt: string;
  metrics: StoredDowntimeMetrics;
  cameras: StoredDowntimeCamera[];

  // Version 2 Optional Extended Blocks
  cameraInventory?: CameraReportItem[];
  server?: StoredServerBlock;
  alarms?: StoredAlarmsBlock;
}

// ============================================
// VALIDATOR
// ============================================

export function isValidDowntimeResult(data: unknown): data is StoredDowntimeResult {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== "number") return false;
  if (typeof d.periodType !== "string") return false;
  if (typeof d.dateFrom !== "string") return false;
  if (typeof d.dateTo !== "string") return false;
  if (typeof d.calculatedAt !== "string") return false;
  if (typeof d.selectedServerLabel !== "string") return false;
  if (typeof d.metrics !== "object" || d.metrics === null) return false;
  if (!Array.isArray(d.cameras)) return false;

  const m = d.metrics as Record<string, unknown>;

  // Uptime rate: 0..100, finite
  const rate = m.periodCameraUptimeRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100) return false;

  // Downtime ms: non-negative, finite
  const totalDowntimeMs = m.totalDowntimeMs;
  if (typeof totalDowntimeMs !== "number" || !Number.isFinite(totalDowntimeMs) || totalDowntimeMs < 0) return false;

  // Incident counts: non-negative integers
  const totalInc = m.totalOfflineIncidents;
  const resolvedInc = m.resolvedIncidents;
  const activeInc = m.activeIncidents;

  if (typeof totalInc !== "number" || !Number.isInteger(totalInc) || totalInc < 0) return false;

  // If resolvedIncidents and activeIncidents are provided, validate consistency
  if (typeof resolvedInc === "number" || typeof activeInc === "number") {
    const res = typeof resolvedInc === "number" ? resolvedInc : 0;
    const act = typeof activeInc === "number" ? activeInc : 0;
    if (!Number.isInteger(res) || res < 0) return false;
    if (!Number.isInteger(act) || act < 0) return false;
    if (totalInc !== res + act) return false;
  }

  // Camera & Incident-level Semantic Validation
  let calculatedSumDowntimeMs = 0;
  let hasIncidentTimestamps = false;

  for (const camObj of d.cameras) {
    if (typeof camObj !== "object" || camObj === null) return false;
    const cam = camObj as Record<string, unknown>;

    if (typeof cam.incidentCount === "number") {
      if (!Number.isInteger(cam.incidentCount) || cam.incidentCount < 0) return false;
    }

    if (Array.isArray(cam.incidents)) {
      if (typeof cam.incidentCount === "number" && cam.incidentCount !== cam.incidents.length) {
        return false;
      }

      for (const incObj of cam.incidents) {
        if (typeof incObj !== "object" || incObj === null) return false;
        const inc = incObj as Record<string, unknown>;

        const offMs = inc.offlineTimestampMs;
        if (offMs !== undefined && offMs !== null) {
          if (typeof offMs !== "number" || !Number.isFinite(offMs) || offMs <= 0) return false;
        }

        const onMs = inc.onlineTimestampMs;
        const status = String(inc.status || "").toUpperCase();

        if (status === "STILL OFFLINE") {
          if (onMs !== null && onMs !== undefined) return false;
        } else if (status === "RECOVERED") {
          if (typeof onMs !== "number" || !Number.isFinite(onMs)) return false;
          if (typeof offMs === "number" && Number.isFinite(offMs) && onMs < offMs) return false;
        }

        if (typeof inc.durationMs === "number") {
          if (!Number.isFinite(inc.durationMs) || inc.durationMs < 0) return false;
        }

        if (typeof offMs === "number" && typeof onMs === "number" && Number.isFinite(offMs) && Number.isFinite(onMs)) {
          hasIncidentTimestamps = true;
          calculatedSumDowntimeMs += Math.max(0, onMs - offMs);
        } else if (typeof inc.durationMs === "number" && Number.isFinite(inc.durationMs) && status === "RECOVERED") {
          hasIncidentTimestamps = true;
          calculatedSumDowntimeMs += inc.durationMs;
        }
      }
    }
  }

  // Aggregate duration reconciliation if incident timestamps exist and all incidents recovered
  if (hasIncidentTimestamps && totalDowntimeMs > 0 && calculatedSumDowntimeMs > 0) {
    const diff = Math.abs(totalDowntimeMs - calculatedSumDowntimeMs);
    if (diff > 5000 && typeof resolvedInc === "number" && totalInc === resolvedInc) {
      return false;
    }
  }

  // Version 2 Optional Extended Block Validations
  if (d.cameraInventory !== undefined) {
    if (!Array.isArray(d.cameraInventory)) return false;
  }

  if (d.server !== undefined) {
    if (typeof d.server !== "object" || d.server === null) return false;
    const srv = d.server as Record<string, unknown>;
    if (srv.health !== undefined && !Array.isArray(srv.health)) return false;
    if (srv.uptimeResults !== undefined && !Array.isArray(srv.uptimeResults)) return false;
    if (srv.storageStats !== undefined && !Array.isArray(srv.storageStats)) return false;
    if (srv.disks !== undefined && !Array.isArray(srv.disks)) return false;
  }

  if (d.alarms !== undefined) {
    if (typeof d.alarms !== "object" || d.alarms === null) return false;
    const alm = d.alarms as Record<string, unknown>;
    if (alm.canonicalCount !== undefined) {
      if (
        typeof alm.canonicalCount !== "number" ||
        !Number.isInteger(alm.canonicalCount) ||
        alm.canonicalCount < 0
      ) {
        return false;
      }
    }
    if (alm.rawAlarms !== undefined && !Array.isArray(alm.rawAlarms)) return false;
    if (alm.presentationItems !== undefined && !Array.isArray(alm.presentationItems)) return false;

    if (
      typeof alm.canonicalCount === "number" &&
      Array.isArray(alm.rawAlarms) &&
      alm.rawAlarms.length !== alm.canonicalCount
    ) {
      return false;
    }
  }

  return true;
}

// ============================================
// KEY / FILENAME STRATEGY
// ============================================

/**
 * Sanitize a string for safe use in filenames.
 * Only allows alphanumeric, dash, underscore. Everything else becomes underscore.
 * Collapses multiple underscores. Trims leading/trailing underscores.
 */
function sanitizeFilePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 64);
}

/**
 * Build a deterministic, safe storage key from period parameters.
 * Key format: {periodType}_{serverScope}_{dateFrom}_{dateTo}
 * Example: daily_all_2026-09-10_2026-09-10
 */
export function buildStorageKey(
  periodType: string,
  dateFrom: string,
  dateTo: string,
  selectedServerLabel: string,
): string {
  const parts = [
    sanitizeFilePart(periodType || "custom"),
    sanitizeFilePart(selectedServerLabel || "all"),
    sanitizeFilePart(dateFrom || "none"),
    sanitizeFilePart(dateTo || "none"),
  ];
  return parts.join("_");
}

/**
 * Resolve storage key to a safe absolute file path within DOWNTIME_RESULTS_DIR.
 * Returns null if the resolved path escapes the allowed directory (path traversal).
 */
function resolveFilePath(storageKey: string): string | null {
  const filename = `${storageKey}.json`;
  const resolved = path.resolve(DOWNTIME_RESULTS_DIR, filename);

  // Path traversal guard: resolved must start with the allowed directory
  const normalizedDir = path.resolve(DOWNTIME_RESULTS_DIR);
  if (!resolved.startsWith(normalizedDir + path.sep) && resolved !== normalizedDir) {
    console.warn(`[downtime-result-store] Path traversal rejected: ${storageKey}`);
    return null;
  }

  // Check for directory traversal segments in the key itself
  const segments = storageKey.split(/[/\\]/);
  if (segments.some((s) => s === ".." || s === ".")) {
    console.warn(`[downtime-result-store] Path traversal rejected (dot segment): ${storageKey}`);
    return null;
  }

  return resolved;
}

function redisKeyFor(storageKey: string): string {
  return `${redisKeys.deviceMonitorLatest().split(":")[0]}:downtime_result:${storageKey}`;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Save a downtime calculation result.
 */
export async function saveDowntimeResult(
  result: StoredDowntimeResult,
): Promise<void> {
  const storageKey = buildStorageKey(
    result.periodType,
    result.dateFrom,
    result.dateTo,
    result.selectedServerLabel,
  );

  const filePath = resolveFilePath(storageKey);
  if (!filePath) {
    throw new Error(`Invalid storage key: ${storageKey}`);
  }

  ensureDir();
  await writeJsonWithCache(filePath, redisKeyFor(storageKey), result);
}

/**
 * Retrieve a stored downtime result by period parameters.
 * Returns null if not found.
 */
export async function getDowntimeResult(
  periodType: string,
  dateFrom: string,
  dateTo: string,
  selectedServerLabel: string,
): Promise<StoredDowntimeResult | null> {
  const storageKey = buildStorageKey(periodType, dateFrom, dateTo, selectedServerLabel);
  const filePath = resolveFilePath(storageKey);
  if (!filePath) return null;

  ensureDir();
  return readJsonWithCache<StoredDowntimeResult>({
    filePath,
    redisKey: redisKeyFor(storageKey),
    validate: isValidDowntimeResult,
  });
}

/**
 * Check whether a downtime result exists for the given parameters.
 */
export async function hasDowntimeResult(
  periodType: string,
  dateFrom: string,
  dateTo: string,
  selectedServerLabel: string,
): Promise<boolean> {
  const result = await getDowntimeResult(periodType, dateFrom, dateTo, selectedServerLabel);
  return result !== null;
}

/**
 * List all stored downtime result keys (filenames without .json).
 * Useful for debugging/admin.
 */
export async function listDowntimeResultKeys(): Promise<string[]> {
  ensureDir();
  try {
    return fs
      .readdirSync(DOWNTIME_RESULTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}
