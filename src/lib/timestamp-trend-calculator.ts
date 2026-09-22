/**
 * Pure Timestamp Performance Trend Calculator
 *
 * Calculates chronological trend data buckets based on actual event timestamps.
 * Standard timezone: Asia/Jakarta (UTC+7).
 */

import type { TrendDataPoint } from "@/components/reporting/export-utils";

export type { TrendDataPoint };

export interface CalculateTimestampTrendInput {
  events: any[];
  fromMs: number;
  toMs: number;
  period?: string;
  totalCameras?: number;
  overallServerUptimeRate?: number | null;
  dataCompleteness?: "COMPLETE" | "POTENTIALLY_TRUNCATED" | "DATA_NOT_AVAILABLE";
}

export interface CalculateTimestampTrendResult {
  trendData: TrendDataPoint[];
  totalTrendAlarms: number;
  unbucketedEventsCount: number;
  dataCompleteness?: "COMPLETE" | "POTENTIALLY_TRUNCATED" | "DATA_NOT_AVAILABLE";
}

export function normalizeEpochMs(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const raw = typeof value === "string" ? Number(value) : value;
  if (Number.isFinite(raw)) {
    const abs = Math.abs(raw);
    if (abs >= 1e15) return raw / 1000; // Microseconds -> Milliseconds
    if (abs >= 1e12) return raw;        // Milliseconds
    if (abs >= 1e9) return raw * 1000;   // Seconds -> Milliseconds
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

export function extractEventTimestampMs(ev: any): number | null {
  if (!ev) return null;
  return (
    normalizeEpochMs(ev.timestampMs) ??
    normalizeEpochMs(ev.timestamp) ??
    normalizeEpochMs(ev.actionData?.timestamp || ev.eventData?.timestamp)
  );
}

const JAKARTA_OFFSET_MS = 7 * 3600 * 1000; // UTC+7

function getJakartaDayStartMs(utcMs: number): number {
  const localMs = utcMs + JAKARTA_OFFSET_MS;
  const d = new Date(localMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();
  return Date.UTC(year, month, date) - JAKARTA_OFFSET_MS;
}

function formatJakartaWeekday(utcMs: number): string {
  const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const localMs = utcMs + JAKARTA_OFFSET_MS;
  const d = new Date(localMs);
  return weekdays[d.getUTCDay()];
}

export function calculateTimestampTrend(
  input: CalculateTimestampTrendInput
): CalculateTimestampTrendResult {
  const {
    events = [],
    fromMs,
    toMs,
    period = "monthly",
    totalCameras = 0,
    overallServerUptimeRate = null,
    dataCompleteness = "COMPLETE",
  } = input;

  if (!fromMs || !toMs || fromMs > toMs) {
    return {
      trendData: [],
      totalTrendAlarms: 0,
      unbucketedEventsCount: events.length,
      dataCompleteness,
    };
  }

  const healthScore: number | null = null;
  const cameras: number | null = null;

  interface InternalBucket {
    label: string;
    startTimeMs: number;
    endTimeMs: number; // exclusive end boundary, except last bucket
    alarms: number;
  }

  const buckets: InternalBucket[] = [];

  const p = (period || "").toLowerCase();

  if (p === "daily") {
    // 8 x 3-hour buckets
    const dayStart = getJakartaDayStartMs(fromMs);
    const THREE_HOURS_MS = 3 * 3600 * 1000;
    for (let i = 0; i < 8; i++) {
      const bStart = dayStart + i * THREE_HOURS_MS;
      const bEnd = bStart + THREE_HOURS_MS;
      buckets.push({
        label: `${i * 3}:00`,
        startTimeMs: bStart,
        endTimeMs: bEnd,
        alarms: 0,
      });
    }
  } else if (p === "weekly") {
    // 7 x 1-day buckets covering [fromMs, toMs]
    const dayStart = getJakartaDayStartMs(fromMs);
    const ONE_DAY_MS = 86400 * 1000;
    for (let i = 0; i < 7; i++) {
      const bStart = dayStart + i * ONE_DAY_MS;
      const bEnd = bStart + ONE_DAY_MS;
      if (bStart > toMs) break;
      buckets.push({
        label: formatJakartaWeekday(bStart),
        startTimeMs: bStart,
        endTimeMs: Math.min(bEnd, toMs + 1),
        alarms: 0,
      });
    }
  } else if (p === "yearly") {
    // Calendar quarters Q1..Q4 for year of fromMs
    const localFromMs = fromMs + JAKARTA_OFFSET_MS;
    const year = new Date(localFromMs).getUTCFullYear();
    const qBounds = [
      { name: "Q1", startMonth: 0, endMonth: 2, endDay: 31 },
      { name: "Q2", startMonth: 3, endMonth: 5, endDay: 30 },
      { name: "Q3", startMonth: 6, endMonth: 8, endDay: 30 },
      { name: "Q4", startMonth: 9, endMonth: 11, endDay: 31 },
    ];

    qBounds.forEach((q) => {
      const qStart = Date.UTC(year, q.startMonth, 1) - JAKARTA_OFFSET_MS;
      const qEnd = Date.UTC(year, q.endMonth, q.endDay, 23, 59, 59, 999) - JAKARTA_OFFSET_MS + 1;
      // Only include quarters that intersect [fromMs, toMs]
      if (qEnd > fromMs && qStart <= toMs) {
        buckets.push({
          label: q.name,
          startTimeMs: qStart,
          endTimeMs: qEnd,
          alarms: 0,
        });
      }
    });
  } else {
    // Monthly / Custom multi-day reporting: 7-day buckets starting from fromMs
    const SEVEN_DAYS_MS = 7 * 86400 * 1000;
    let currStart = fromMs;
    let weekIndex = 1;

    while (currStart <= toMs) {
      const nextStart = currStart + SEVEN_DAYS_MS;
      const bEnd = Math.min(nextStart, toMs + 1);
      buckets.push({
        label: `WEEK ${weekIndex}`,
        startTimeMs: currStart,
        endTimeMs: bEnd,
        alarms: 0,
      });
      currStart = nextStart;
      weekIndex++;
    }
  }

  if (buckets.length === 0) {
    return {
      trendData: [],
      totalTrendAlarms: 0,
      unbucketedEventsCount: events.length,
      dataCompleteness,
    };
  }

  let totalTrendAlarms = 0;
  let unbucketedEventsCount = 0;

  events.forEach((ev) => {
    const ts = extractEventTimestampMs(ev);
    if (ts === null || ts < fromMs || ts > toMs) {
      unbucketedEventsCount++;
      return;
    }

    let allocated = false;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const isLastBucket = i === buckets.length - 1;
      if (ts >= b.startTimeMs && (isLastBucket ? ts <= toMs : ts < b.endTimeMs)) {
        b.alarms++;
        totalTrendAlarms++;
        allocated = true;
        break;
      }
    }

    if (!allocated) {
      unbucketedEventsCount++;
    }
  });

  const trendData: TrendDataPoint[] = buckets.map((b) => ({
    label: b.label,
    alarms: b.alarms,
    healthScore,
    cameras,
  }));

  return {
    trendData,
    totalTrendAlarms,
    unbucketedEventsCount,
    dataCompleteness,
  };
}
