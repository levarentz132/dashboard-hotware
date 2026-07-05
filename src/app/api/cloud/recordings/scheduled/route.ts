import logger from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/config";
import fs from "fs/promises";
import path from "path";
import { logRecordingEvent, formatAuditDate } from "@/lib/recording-logger";
import { logScheduledRecordingError } from "@/lib/log-scheduled-error";
import { buildCloudUrl } from "@/lib/cloud-api";
import { startFFmpegWorker } from "@/lib/ffmpeg-worker";
import { calculateNextOccurrence } from "@/lib/schedule-utils";
import {
  readScheduledRecordings,
  writeScheduledRecordings,
} from "@/lib/scheduled-recordings-store";
import {
  doesScreenshotFileExist,
  doesVideoFileExist,
} from "@/lib/schedule-output-files";
import { readAppSettings } from "@/lib/server-settings";


// ── VMS Direct API helpers ────────────────────────────────────────────────────
// The nxAPI singleton proxies through Next.js routes that require browser cookies.
// The watchdog runs server-side with no cookies, so we call the VMS REST API
// directly using the auth token and NX location saved in the data file.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // VMS uses self-signed certs

async function vmsRequest(
  method: string,
  endpoint: string,
  body: any,
  authToken: string,
  nxIp: string,
  nxPort: string,
  systemId?: string,
  request?: NextRequest,
): Promise<any> {
  try {
    const isLocalToken = authToken.startsWith("vms-");

    const routingRequest = request ?? ({
      cookies: { get: () => null },
      headers: {
        get: (name: string) => {
          if (name === "x-nx-location-ip") return nxIp;
          if (name === "x-nx-location-port") return nxPort;
          return null;
        }
      }
    } as any);

    const params = new URLSearchParams();
    const url = buildCloudUrl(systemId || "", endpoint, params, routingRequest);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-runtime-guid": authToken,
    };

    // Only send the Bearer header if it's likely a cloud token.
    // Local VMS-xxx tokens don't always work as Bearer auth in some REST API versions.
    if (!isLocalToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      // logger.debug(`[Watchdog] VMS ${method} ${url} failed with status ${res.status}: ${text}`);
      throw new Error(`VMS ${res.status}: ${text}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  } catch (err: any) {
    // logger.debug(`[Watchdog] Network error for VMS ${method} ${url}:`, err.message);
    throw err;
  }
}

const MAX_AUTOSAVE_AGE_MS = 60 * 60 * 1000; // 1 hour grace period for auto-download

// Background Watchdog (In-memory for the server session)
declare global {
  var _nxWatchdogInterval: NodeJS.Timeout | undefined;
  var _nxWatchdogActive: boolean | undefined;
  var _nxAppPort: string | undefined;
  var _nxExecutingTasks: Set<string> | undefined;
  var _vmsTimeOffsetMs: number | undefined;
  var _vmsTimeOffsetLastChecked: number | undefined;
}

// Initialize execution lock set
if (typeof global !== "undefined" && !global._nxExecutingTasks) {
  global._nxExecutingTasks = new Set<string>();
}

/**
 * Retrieves and caches the VMS timezone offset (relative to Next.js server local time)
 */
async function getVmsTimeOffsetMs(systemId: string, auth: string, ip: string, port: string): Promise<number> {
  const curTime = Date.now();
  if (global._vmsTimeOffsetMs !== undefined && global._vmsTimeOffsetLastChecked !== undefined && (curTime - global._vmsTimeOffsetLastChecked < 300000)) {
    return global._vmsTimeOffsetMs;
  }

  try {
    const isLocalToken = auth.startsWith("vms-");
    const dummyRequest = {
      cookies: { get: () => null },
      headers: {
        get: (name: string) => {
          if (name === "x-nx-location-ip") return ip;
          if (name === "x-nx-location-port") return port;
          return null;
        }
      }
    } as any;

    const url = buildCloudUrl(systemId, "/api/time", undefined, dummyRequest);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-runtime-guid": auth,
    };
    if (!isLocalToken) {
      headers["Authorization"] = `Bearer ${auth}`;
    }

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.offset === "number") {
        const clientOffsetMs = -new Date().getTimezoneOffset() * 60 * 1000;
        global._vmsTimeOffsetMs = data.offset - clientOffsetMs;
        global._vmsTimeOffsetLastChecked = curTime;
        return global._vmsTimeOffsetMs;
      }
    }
  } catch (e) {
    // ignore
  }
  return 0;
}

/**
 * Try to detect the current application port from environment or process arguments.
 * Useful in dev where ports can change (e.g. 3010, 3011).
 */
function detectCurrentPort(fallback: string): string {
  let port = process.env.PORT || fallback || "3030";

  const pIndex = process.argv.indexOf("-p");
  if (pIndex !== -1 && process.argv[pIndex + 1]) {
    port = process.argv[pIndex + 1];
  } else if (global._nxAppPort) {
    port = global._nxAppPort;
  }

  // console.log(`[Watchdog] Port detection: argv=${process.argv.slice(2).join(' ')}, detected=${global._nxAppPort || 'none'} -> using ${port}`);
  return port;
}


const startWatchdog = () => {
  if (global._nxWatchdogActive) return;

  if (global._nxWatchdogInterval) {
    clearInterval(global._nxWatchdogInterval);
  }

  // logger.debug("[Watchdog] Initializing background monitor (V3)...");
  global._nxWatchdogInterval = setInterval(async () => {
    if (global._nxWatchdogActive) return;
    global._nxWatchdogActive = true;

    try {
      let parsed;
      try {
        parsed = await readScheduledRecordings();
      } catch (e: any) {
        global._nxWatchdogActive = false;
        return;
      }

      let queue: any[] = [];
      try {
        const { loadQueue } = await import("@/lib/ffmpeg-queue");
        queue = await loadQueue();
      } catch (e) {}

      if (!parsed.schedules?.length && !parsed.nxLocationIp) {
        global._nxWatchdogActive = false;
        return;
      }

      const {
        schedules = [],
        originalSchedules = {},
        nxLocationIp = API_CONFIG.serverHost || "localhost",
        nxLocationPort = API_CONFIG.serverPort || "7001",
        appPort = process.env.NODE_ENV === "production" ? "3030" : "3010"
      } = parsed;

      // Use the persisted appPort if the global is not set yet
      if (!global._nxAppPort) {
        global._nxAppPort = appPort;
      }

      // ── Resolve VMS IP: Prioritize configured IP over defaults ────────────
      let ip = nxLocationIp && nxLocationIp !== "null" && nxLocationIp !== "localhost" ? nxLocationIp : (API_CONFIG.serverHost || "localhost");
      let port = nxLocationPort && nxLocationPort !== "null" && nxLocationPort !== "7001" ? nxLocationPort : (API_CONFIG.serverPort || "7001");

      // If the specific schedule doesn't have an IP, or it's localhost, use the global config
      if (ip === "localhost" || !ip) {
        const configHost = API_CONFIG.serverHost;
        const configPort = API_CONFIG.serverPort;
        if (configHost && configHost !== "localhost") {
          ip = configHost;
        }
        if (configPort) {
          port = configPort;
        }
      }
      let changed = false;
      const deletedTaskIds = new Set<string>();
      const now = Date.now();

      // Retrieve timeOffsetMs if schedules exist to align Next.js timezone with VMS timezone
      let timeOffsetMs = 0;
      if (schedules.length > 0 && schedules[0].auth && ip) {
        timeOffsetMs = await getVmsTimeOffsetMs(schedules[0].systemId || "", schedules[0].auth, ip, port);
      }

      // ── DEDUPLICATION: Remove identical tasks before processing ──────────
      const uniqueSchedules: any[] = [];
      const seenKeys = new Set();
      for (const s of (schedules || [])) {
        const cleanCamId = s.cameraId.replace(/[{}]/g, "").toLowerCase();
        const key = `${cleanCamId}-${s.startTime}-${s.type}-${new Date(s.date).toDateString()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueSchedules.push(s);
        } else {
          changed = true; // Mark as changed to save the cleaned-up list
        }
      }

      // ── CLEANUP: Reset stale tasks ─────────────────────────────────────────
      // If a task has been 'recording' or 'capturing' for more than 1 hour, reset or remove it.
      // Processing tasks use time-since-end (not time-since-start) so long recordings can finish auto-save.
      const cleanedSchedules: any[] = [];
      uniqueSchedules.forEach((rec: any) => {
        const isNonRecurring = !rec.recurrence || rec.recurrence === "none" || rec.recurrence === "once";
        const startTime = rec.startMs || (rec.date ? new Date(rec.date).getTime() : 0);
        const endTime = rec.endMs || startTime;

        if (isNonRecurring && rec.status === "processing") {
          if (doesVideoFileExist(rec, timeOffsetMs)) {
            console.log(`[Watchdog] Non-recurring processing task ${rec.id} completed. Removing.`);
            deletedTaskIds.add(rec.id);
            changed = true;
            return;
          }
          const sinceEnd = endTime > 0 ? now - endTime : 0;
          // 30-minute grace after the recording window ends for FFmpeg auto-save to complete
          if (sinceEnd > 30 * 60 * 1000) {
            console.log(`[Watchdog] Stale non-recurring processing task ${rec.id} removed during cleanup (auto-save timed out).`);
            deletedTaskIds.add(rec.id);
            changed = true;
            return;
          }
          cleanedSchedules.push(rec);
          return;
        }

        if (
          rec.status === "recording" ||
          rec.status === "capturing" ||
          rec.status === "in progress" ||
          rec.status === "processing"
        ) {
          const outputExists =
            rec.type === "screenshot"
              ? doesScreenshotFileExist(rec, timeOffsetMs)
              : rec.type === "video" && doesVideoFileExist(rec, timeOffsetMs);
          if (outputExists) {
            console.log(
              `[Watchdog] ${rec.type} task ${rec.cameraName} has output on disk while ${rec.status}; clearing.`,
            );
            if (isNonRecurring) {
              deletedTaskIds.add(rec.id);
              changed = true;
              return;
            }
            const [csh, csm, css] = rec.startTime.split(":").map(Number);
            const nextDate = calculateNextOccurrence(rec, csh, csm, css || 0);
            const duration = (rec.endMs || endTime) - (rec.startMs || startTime);
            rec.status = "pending";
            rec.record = false;
            rec.date = nextDate.toISOString();
            rec.startMs = nextDate.getTime() - timeOffsetMs;
            rec.endMs = rec.startMs + Math.max(duration, 0);
            changed = true;
            cleanedSchedules.push(rec);
            return;
          }

          const screenshotStaleMs = 5 * 60 * 1000;
          const videoEndGraceMs = 2 * 60 * 1000;
          const processingGraceMs = 35 * 60 * 1000;
          let isStale = false;

          if (rec.type === "screenshot") {
            isStale = startTime > 0 && now - startTime > screenshotStaleMs;
          } else if (rec.status === "processing") {
            isStale = endTime > 0 && now - endTime > processingGraceMs;
          } else if (rec.status === "in progress" || (rec.status === "recording" && !rec.record)) {
            isStale = endTime > 0 && now - endTime > videoEndGraceMs;
          } else if (rec.status === "recording" && rec.record) {
            isStale = endTime > 0 && now - endTime > videoEndGraceMs;
            if (isStale) {
              rec.status = "processing";
              changed = true;
              cleanedSchedules.push(rec);
              return;
            }
          } else {
            isStale = startTime > 0 && now - startTime > 3600000;
          }

          if (isStale) {
            if (isNonRecurring) {
              console.log(`[Watchdog] Stale non-recurring task ${rec.id} (${rec.status}) removed during cleanup.`);
              deletedTaskIds.add(rec.id);
              changed = true;
              return;
            }
            rec.status = "failed";
            changed = true;
          }
        }
        if (
          rec.status === "failed" &&
          (rec.type === "screenshot"
            ? doesScreenshotFileExist(rec, timeOffsetMs)
            : rec.type === "video" && doesVideoFileExist(rec, timeOffsetMs))
        ) {
          console.log(
            `[Watchdog] ${rec.type} task ${rec.cameraName} marked failed but output exists; recovering.`,
          );
          if (isNonRecurring) {
            deletedTaskIds.add(rec.id);
            changed = true;
            return;
          }
          const [fsh, fsm, fss] = rec.startTime.split(":").map(Number);
          const nextDate = calculateNextOccurrence(rec, fsh, fsm, fss || 0);
          const duration = (rec.endMs || endTime) - (rec.startMs || startTime);
          rec.status = "pending";
          rec.record = false;
          rec.date = nextDate.toISOString();
          rec.startMs = nextDate.getTime() - timeOffsetMs;
          rec.endMs = rec.startMs + Math.max(duration, 0);
          changed = true;
        }
        cleanedSchedules.push(rec);
      });
      uniqueSchedules.length = 0;
      uniqueSchedules.push(...cleanedSchedules);
      const saveState = async (scheds: any[]) => {
        let storeData = await readScheduledRecordings();
        const diskSchedules = storeData.schedules || [];

        const finalSchedules = diskSchedules
          .filter((diskRec: any) => !deletedTaskIds.has(diskRec.id))
          .map((diskRec: any) => {
            const ourRec = scheds.find((s) => s.id === diskRec.id);
            if (ourRec) {
              return {
                ...diskRec,
                status: ourRec.status,
                date: ourRec.date,
                startMs: ourRec.startMs,
                endMs: ourRec.endMs,
                record: ourRec.record,
              };
            }
            return diskRec;
          });

        delete storeData.globalAuthFallback;
        delete storeData.globalUserKeyFallback;
        delete storeData.globalAuth;
        delete storeData.notificationUserKey;

        await writeScheduledRecordings({
          ...storeData,
          schedules: finalSchedules,
          nxLocationIp,
          nxLocationPort,
          appPort: detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010"),
        });
      };

      // ── Phase 1: Identify and Mark Tasks to Process ────────────────────────
      const tasksToExecute: any[] = [];
      for (let i = 0; i < uniqueSchedules.length; i++) {
        const rec = uniqueSchedules[i];
        const startParts = rec.startTime.split(":").map(Number);
        const endParts = (rec.endTime || rec.startTime).split(":").map(Number);
        const sh = startParts[0], sm = startParts[1], ss = startParts[2] || 0;
        const eh = endParts[0], em = endParts[1], es = endParts[2] !== undefined ? endParts[2] : 59;
        
        let startMs = rec.startMs;
        let endMs = rec.endMs;
        if (!startMs || !endMs) {
          let startDate = new Date(rec.date);
          startDate.setHours(sh, sm, ss, 0);
          if (timeOffsetMs !== 0 && rec.type === "video") {
            startDate = new Date(startDate.getTime() - timeOffsetMs);
          }
          startMs = startDate.getTime();

          let endDate = new Date(rec.date);
          endDate.setHours(eh, em, es, 999);
          if (timeOffsetMs !== 0 && rec.type === "video") {
            endDate = new Date(endDate.getTime() - timeOffsetMs);
          }
          endMs = endDate.getTime();
        }

        // Check if the task is processing, and if its queue job has failed definitively
        if (rec.status === "processing" && rec.type === "video") {
          const job = queue.find((j: any) => j.payload?.taskId === rec.id);
          if (job && (job.status === "failed" || job.attempts >= job.maxAttempts)) {
            console.log(`[Watchdog] Queue job for task ${rec.cameraName} (${rec.id}) failed. Marking schedule as failed/rolling forward.`);
            const isRecurring = rec.recurrence && rec.recurrence !== "none";
            if (isRecurring) {
              const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
              rec.status = "pending";
              rec.record = false;
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime() - timeOffsetMs;
              rec.endMs = rec.startMs + (endMs - startMs);
              changed = true;
            } else {
              rec.status = "failed";
              rec.record = false;
              changed = true;
            }
            continue;
          }
        }

        const occurrenceReached = now >= startMs;

        // Screenshot already saved for this time slot — complete without re-capturing
        if (
          rec.type === "screenshot" &&
          occurrenceReached &&
          doesScreenshotFileExist(rec, timeOffsetMs)
        ) {
          console.log(
            `[Watchdog] Screenshot file already exists for ${rec.cameraName}, skipping capture.`,
          );
          const isRecurring = rec.recurrence && rec.recurrence !== "none";
          if (isRecurring) {
            const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
            rec.status = "pending";
            rec.record = false;
            rec.date = nextDate.toISOString();
            rec.startMs = nextDate.getTime() - timeOffsetMs;
            rec.endMs = rec.startMs + (endMs - startMs);
            changed = true;
          } else {
            deletedTaskIds.add(rec.id);
            uniqueSchedules.splice(i, 1);
            i--;
            changed = true;
          }
          continue;
        }

        // Deduplication: if the video file for this slot already exists, complete or delete
        if (
          rec.type === "video" &&
          occurrenceReached &&
          doesVideoFileExist(rec, timeOffsetMs)
        ) {
          console.log(`[Watchdog] AUTO-SAVE deduplication: Valid file already exists for ${rec.cameraName}, skipping trigger.`);
          const isRecurring = rec.recurrence && rec.recurrence !== "none";
          if (isRecurring) {
            const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
            rec.status = "pending";
            rec.record = false;
            rec.date = nextDate.toISOString();
            rec.startMs = nextDate.getTime() - timeOffsetMs;
            rec.endMs = rec.startMs + (endMs - startMs);
            changed = true;
          } else {
            deletedTaskIds.add(rec.id);
            uniqueSchedules.splice(i, 1);
            i--; // Adjust index for spliced item
            changed = true;
          }
          continue;
        }

        // ── Status Sanity Check ─────────────────────────────────────────────
        // If the task is in the future but has an active/completed status AND it's recurring, reset it.
        // Also resets one-time future tasks that are incorrectly marked active.
        if (now < startMs && rec.status !== "pending" && rec.status !== "failed") {
          console.log(`[Watchdog] Future task ${rec.cameraName} (${rec.date}) had status ${rec.status}. Resetting to pending.`);
          rec.status = "pending";
          rec.record = false;
          changed = true;
        }

        if (rec.status === "completed") continue;

        // Skip if already being processed by an active watchdog task
        if (global._nxExecutingTasks?.has(rec.id)) continue;

        // Screenshot logic
        if (rec.type === "screenshot") {
          const catchUpWindowMs = 2 * 60 * 1000;
          const isWithinWindow = now >= startMs && now < startMs + catchUpWindowMs;
          const stuckActive =
            rec.status === "in progress" ||
            rec.status === "capturing" ||
            rec.status === "failed";

          if (stuckActive && doesScreenshotFileExist(rec, timeOffsetMs)) {
            const isRecurring = rec.recurrence && rec.recurrence !== "none";
            if (isRecurring) {
              const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
              rec.status = "pending";
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime() - timeOffsetMs;
              rec.endMs = rec.startMs + (endMs - startMs);
              changed = true;
            } else {
              deletedTaskIds.add(rec.id);
              uniqueSchedules.splice(i, 1);
              i--;
              changed = true;
            }
            continue;
          }

          if ((rec.status === "pending" || rec.status === "in progress") && isWithinWindow) {
            if (global._nxExecutingTasks?.has(rec.id)) {
              continue;
            }
            rec.status = "capturing";
            changed = true;
            global._nxExecutingTasks?.add(rec.id);
            tasksToExecute.push({ type: "screenshot", rec, startMs, endMs, sh, sm, ss });
          } else if (
            now >= startMs + catchUpWindowMs &&
            (rec.status === "in progress" || rec.status === "capturing" || rec.status === "pending" || rec.status === "failed")
          ) {
            if (doesScreenshotFileExist(rec, timeOffsetMs)) {
              const isRecurring = rec.recurrence && rec.recurrence !== "none";
              if (isRecurring) {
                const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
                rec.status = "pending";
                rec.date = nextDate.toISOString();
                rec.startMs = nextDate.getTime() - timeOffsetMs;
                rec.endMs = rec.startMs + (endMs - startMs);
                changed = true;
              } else {
                deletedTaskIds.add(rec.id);
                uniqueSchedules.splice(i, 1);
                i--;
                changed = true;
              }
            } else {
              console.log(
                `[Watchdog] Screenshot task ${rec.cameraName} expired (status=${rec.status}). Cleaning up.`,
              );
              tasksToExecute.push({ type: "expire", rec, startMs, endMs, sh, sm, ss });
            }
          }
        }
        // Video logic
        else if (rec.type === "video" && now >= startMs && now < endMs) {
          if ((rec.status === "pending" || rec.status === "in progress" || (rec.status === "recording" && !rec.record))) {
            if (global._nxExecutingTasks?.has(rec.id)) {
              continue;
            }
            rec.status = "recording";
            rec.record = true;
            changed = true;
            global._nxExecutingTasks?.add(rec.id);
            tasksToExecute.push({ type: "video_start", rec, startMs, endMs, sh, sm, ss, eh, em, es });
          }
        }
        else if (
          rec.type === "video" &&
          now >= endMs &&
          rec.status === "pending" &&
          rec.recurrence &&
          rec.recurrence !== "none"
        ) {
          console.log(
            `[Watchdog] Recurring task ${rec.cameraName} window passed without starting. Skipping to next occurrence.`,
          );
          tasksToExecute.push({ type: "expire", rec, startMs, endMs, sh, sm, ss });
        }
        else if (
          rec.type === "video" &&
          now >= endMs &&
          (rec.status === "recording" || rec.status === "completing") &&
          rec.record
        ) {
          rec.status = "completing";
          changed = true;
          tasksToExecute.push({ type: "video_stop", rec, startMs, endMs, sh, sm, ss, eh, em, es });
        }
        else if (
          rec.type === "video" &&
          now >= endMs &&
          (rec.status === "failed" ||
            rec.status === "in progress" ||
            (rec.status === "recording" && !rec.record))
        ) {
          const isRecurring = rec.recurrence && rec.recurrence !== "none";
          if (doesVideoFileExist(rec, timeOffsetMs)) {
            if (isRecurring) {
              const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
              rec.status = "pending";
              rec.record = false;
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime() - timeOffsetMs;
              rec.endMs = rec.startMs + (endMs - startMs);
              changed = true;
            } else {
              deletedTaskIds.add(rec.id);
              uniqueSchedules.splice(i, 1);
              i--;
              changed = true;
            }
          } else {
            // Video file does not exist, and task failed or ended
            if (isRecurring) {
              const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
              rec.status = "pending";
              rec.record = false;
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime() - timeOffsetMs;
              rec.endMs = rec.startMs + (endMs - startMs);
              changed = true;
              console.log(`[Watchdog] Recurring task ${rec.cameraName} failed/ended without video file. Rolled forward to ${nextDate.toISOString()}`);
            } else if (rec.status !== "failed") {
              console.log(
                `[Watchdog] Video task ${rec.cameraName} ended without VMS recording (status=${rec.status}).`,
              );
              rec.status = "failed";
              rec.record = false;
              await logScheduledRecordingError({
                cameraId: rec.cameraId,
                cameraName: rec.cameraName,
                systemId: rec.systemId,
                message: `Video recording failed for camera ${rec.cameraName}: never started on VMS`,
              });
              changed = true;
            }
          }
        }
        else if (
          rec.type === "video" &&
          doesVideoFileExist(rec, timeOffsetMs) &&
          (rec.status === "failed" ||
            rec.status === "processing" ||
            rec.status === "recording" ||
            rec.status === "in progress" ||
            rec.status === "completing")
        ) {
          const isNonRecurring = !rec.recurrence || rec.recurrence === "none" || rec.recurrence === "once";
          if (isNonRecurring) {
            deletedTaskIds.add(rec.id);
            uniqueSchedules.splice(i, 1);
            i--;
            changed = true;
          } else {
            const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
            rec.status = "pending";
            rec.record = false;
            rec.date = nextDate.toISOString();
            rec.startMs = nextDate.getTime() - timeOffsetMs;
            rec.endMs = rec.startMs + (endMs - startMs);
            changed = true;
            console.log(
              `[Watchdog] Video output found for ${rec.cameraName} while ${rec.status}; rolled forward.`,
            );
          }
          continue;
        }
        else if (now >= endMs && rec.status === "processing" && rec.type === "video") {
          const isNonRecurring = !rec.recurrence || rec.recurrence === "none" || rec.recurrence === "once";
          if (doesVideoFileExist(rec, timeOffsetMs)) {
            if (isNonRecurring) {
              deletedTaskIds.add(rec.id);
              uniqueSchedules.splice(i, 1);
              i--;
              changed = true;
            } else {
              // Roll forward recurring task that has completed auto-save
              const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
              rec.status = "pending";
              rec.record = false;
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime() - timeOffsetMs;
              rec.endMs = rec.startMs + (endMs - startMs);
              changed = true;
              console.log(`[Watchdog] Recurring task ${rec.cameraName} auto-save completed. Rolled forward to ${nextDate.toISOString()}`);
            }
          } else {
            const isEnqueued = queue.some((job: any) => job.payload?.taskId === rec.id);
            if (isEnqueued) {
              // Already enqueued, do not trigger again to prevent queue flooding
            } else {
              const cleanId = rec.cameraId.replace(/[{}]/g, "");
              const auth = rec.auth;
              if (auth && ip) {
                console.log(`[Watchdog] Auto-save pending for ${rec.cameraName} (processing), triggering download queue`);
                triggerAutoSave(rec, cleanId, auth, nxLocationIp, nxLocationPort);
              } else {
                console.warn(`[Watchdog] Cannot auto-save ${rec.cameraName}: missing auth or IP`);
              }
            }
          }
        }
        else if (now >= endMs && rec.status === "pending") {
          // Missed task
          tasksToExecute.push({ type: "expire", rec, startMs, endMs, sh, sm, ss });
        }
      }

      // Save the "in-progress" status to disk BEFORE starting any async work
      if (changed) {
        await saveState(uniqueSchedules);
      }

      // ── Phase 2: Execute Tasks sequentially (Queue) ────────────────────────
      for (const task of tasksToExecute) {
        const { rec, startMs, endMs, sh, sm, ss } = task;

        if (task.type === "screenshot") {
          try {
            const port = detectCurrentPort(appPort || "3030");
            const internalUrl = `http://127.0.0.1:${port}/api/cloud/recordings/screenshot`;
            const headers: any = { "Content-Type": "application/json" };
            if (nxLocationIp && nxLocationIp !== "localhost") headers["x-nx-location-ip"] = nxLocationIp;
            if (nxLocationPort && nxLocationPort !== "7001") headers["x-nx-location-port"] = nxLocationPort;
            if (rec.auth) {
              headers["x-watchdog-auth"] = rec.auth;
              headers["Authorization"] = `Bearer ${rec.auth}`;
            }

            const res = await fetch(internalUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                systemId: rec.systemId,
                deviceId: rec.cameraId,
                cameraName: rec.cameraName,
                timestampMs: startMs,
                scheduledStartTime: rec.startTime,
                timeOffsetMs: timeOffsetMs,
                notificationUserKey: rec.scheduledBy || "admin"
              })
            });

            if (!res.ok) {
              if (doesScreenshotFileExist(rec, timeOffsetMs)) {
                console.log(
                  `[Watchdog] Screenshot API error for ${rec.cameraName} but file exists; treating as success.`,
                );
                if (rec.recurrence && rec.recurrence !== "none") {
                  const nextDate = calculateNextOccurrence(rec, sh, sm, ss);
                  rec.status = "pending";
                  rec.date = nextDate.toISOString();
                  rec.startMs = nextDate.getTime() - timeOffsetMs;
                  rec.endMs = rec.startMs + (endMs - startMs);
                } else {
                  deletedTaskIds.add(rec.id);
                  const idx = uniqueSchedules.findIndex((s: any) => s.id === rec.id);
                  if (idx !== -1) uniqueSchedules.splice(idx, 1);
                }
              } else {
                rec.status = "failed";
                await logScheduledRecordingError({
                  cameraId: rec.cameraId,
                  cameraName: rec.cameraName,
                  systemId: rec.systemId,
                  message: `Screenshot failed for camera ${rec.cameraName}`,
                });
              }
            } else {
              if (rec.recurrence && rec.recurrence !== "none") {
                const nextDate = calculateNextOccurrence(rec, sh, sm, ss);
                rec.status = "pending";
                rec.date = nextDate.toISOString();
                rec.startMs = nextDate.getTime() - timeOffsetMs;
                rec.endMs = rec.startMs + (endMs - startMs);
              } else {
                deletedTaskIds.add(rec.id);
                const idx = uniqueSchedules.findIndex((s: any) => s.id === rec.id);
                if (idx !== -1) uniqueSchedules.splice(idx, 1);
                console.log(`[Watchdog] Screenshot task ${rec.id} completed and REMOVED (non-recurring)`);
              }
            }
          } catch (e) {
            if (doesScreenshotFileExist(rec, timeOffsetMs)) {
              console.log(
                `[Watchdog] Screenshot request error for ${rec.cameraName} but file exists; treating as success.`,
              );
              if (rec.recurrence && rec.recurrence !== "none") {
                const nextDate = calculateNextOccurrence(rec, sh, sm, ss);
                rec.status = "pending";
                rec.date = nextDate.toISOString();
                rec.startMs = nextDate.getTime() - timeOffsetMs;
                rec.endMs = rec.startMs + (endMs - startMs);
              } else {
                deletedTaskIds.add(rec.id);
                const idx = uniqueSchedules.findIndex((s: any) => s.id === rec.id);
                if (idx !== -1) uniqueSchedules.splice(idx, 1);
              }
            } else {
              rec.status = "failed";
              await logScheduledRecordingError({
                cameraId: rec.cameraId,
                cameraName: rec.cameraName,
                systemId: rec.systemId,
                message: `Screenshot failed for camera ${rec.cameraName}`,
              });
            }
          }
        }

        if (task.type === "video_start") {
          try {
            const cleanId = rec.cameraId.replace(/[{}]/g, "");
            const auth = rec.auth;
            if (!auth || !ip) {
              console.warn(`[Watchdog] video_start SKIPPED for ${rec.cameraName}: auth=${!!auth}, ip=${ip}`);
              continue;
            }

            // Patch VMS
            const dDate = new Date(rec.date);
            let dayOfWeek = dDate.getDay();
            if (dayOfWeek === 0) dayOfWeek = 7;
            let startSec = sh * 3600 + sm * 60;
            let endSec = task.eh * 3600 + task.em * 60 + 59;
            if (dayOfWeek === 7) { startSec -= 3600; endSec -= 3600; }

            console.log(`[Watchdog] Starting recording for ${rec.cameraName} (${cleanId}): dayOfWeek=${dayOfWeek}, startSec=${startSec}, endSec=${endSec}`);

            // Store original schedule
            try {
              const { getDeviceFromCache } = await import("@/lib/nx-devices-store");
              const cachedCam =
                (rec.systemId && (await getDeviceFromCache(rec.systemId, cleanId))) || null;
              const cam =
                cachedCam ??
                (await vmsRequest(
                  "GET",
                  `/rest/v3/devices/${cleanId}`,
                  null,
                  auth,
                  ip,
                  port,
                  rec.systemId,
                ));
              originalSchedules[rec.id] = cam?.schedule || { isEnabled: false };
              console.log(
                `[Watchdog] Stored original schedule for ${rec.cameraName}${cachedCam ? " (redis)" : ""}`,
              );
            } catch (e) {
              originalSchedules[rec.id] = { isEnabled: false };
              console.warn(`[Watchdog] Could not fetch original schedule for ${rec.cameraName}, using default`);
            }

            await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, {
              schedule: { isEnabled: true, tasks: [{ startTime: startSec, endTime: endSec, dayOfWeek, recordingType: "always", streamQuality: "highest", fps: 0, bitrateKbps: 0, metadataTypes: "none" }] }
            }, auth, ip, port, rec.systemId);

            console.log(`[Watchdog] Recording started on VMS for ${rec.cameraName}`);
            logRecordingEvent(`recording started for camera ${rec.cameraName} at ${rec.startTime}`);
            rec.status = "recording";
            rec.record = true;
            global._nxExecutingTasks?.add(rec.id);
          } catch (e: any) {
            console.error(`[Watchdog] video_start FAILED for ${rec.cameraName}:`, e.message);
            await logScheduledRecordingError({
              cameraId: rec.cameraId,
              cameraName: rec.cameraName,
              systemId: rec.systemId,
              message: `Recording start failed for camera ${rec.cameraName}: ${e.message}`,
            });
            rec.status = "failed";
          }
        }

        if (task.type === "video_stop") {
          if (!rec.record) {
            console.warn(
              `[Watchdog] video_stop skipped for ${rec.cameraName}: recording never started on VMS`,
            );
            rec.status = "failed";
            rec.record = false;
            await logScheduledRecordingError({
              cameraId: rec.cameraId,
              cameraName: rec.cameraName,
              systemId: rec.systemId,
              message: `Video recording failed for camera ${rec.cameraName}: auto-save skipped (never recorded)`,
            });
            continue;
          }

          try {
            const cleanId = rec.cameraId.replace(/[{}]/g, "");
            const auth = rec.auth;
            console.log(`[Watchdog] Stopping recording for ${rec.cameraName} (${cleanId})`);
            // Use provided auth/IP or fallback to defaults
            if (auth && ip) {
              await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, { schedule: { isEnabled: false } }, auth, ip, port, rec.systemId);
              console.log(`[Watchdog] Recording stopped on VMS for ${rec.cameraName}`);

              // Restore original
              const original = originalSchedules[rec.id];
              if (original) {
                await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, { schedule: { ...original, isEnabled: false } }, auth, ip, port, rec.systemId);
                console.log(`[Watchdog] Original schedule restored for ${rec.cameraName}`);
              } else {
                await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, { schedule: { isEnabled: false, tasks: [] } }, auth, ip, port, rec.systemId);
                console.log(`[Watchdog] Empty schedule restored (tasks cleared) for ${rec.cameraName}`);
              }
              delete originalSchedules[rec.id];

              // Trigger auto-save background (don't await)
              triggerAutoSave(rec, cleanId, auth, nxLocationIp, nxLocationPort);
              logRecordingEvent(`finished recording, reverting back schedule for camera ${rec.cameraName}`);
            } else {
              console.warn(`[Watchdog] Cannot stop recording for ${rec.cameraName}: missing auth or IP`);
            }

            // Transition status to "processing" (FFmpeg)
            if (rec.recurrence && rec.recurrence !== "none") {
              const nextDate = calculateNextOccurrence(rec, task.sh, task.sm, task.ss || 0);
              rec.status = "pending";
              rec.record = false;
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime() - timeOffsetMs;
              rec.endMs = rec.startMs + (endMs - startMs);
            } else {
              rec.status = "processing";
            }
          } catch (e: any) {
            console.error(`[Watchdog] video_stop FAILED for ${rec.cameraName}:`, e.message);
            rec.status = "recording";
          }
        }

        if (task.type === "expire") {
          if (rec.recurrence && rec.recurrence !== "none") {
            const nextDate = calculateNextOccurrence(rec, sh, sm, ss);
            rec.status = "pending";
            rec.date = nextDate.toISOString();
            rec.startMs = nextDate.getTime() - timeOffsetMs;
            rec.endMs = rec.startMs + (endMs - startMs);
          } else {
            rec.status = "completed";
          }
        }
      }

      // Final save to disk with updated statuses
      await saveState(uniqueSchedules);

      // Remove from executing set after iteration finishes
      tasksToExecute.forEach(task => {
        if (task.rec?.id) global._nxExecutingTasks?.delete(task.rec.id);
      });

    } catch (err) {
      // console.error("[Watchdog] Error in loop:", err);
    } finally {
      global._nxWatchdogActive = false;
    }
  }, 1000);
};

// Removed local calculateNextOccurrence and imported from shared utilities instead

async function triggerAutoSave(rec: any, cleanId: string, auth: string, nxIp: string, nxPort: string) {
  const currentPort = detectCurrentPort(global._nxAppPort || "3030");
  const timeOffsetMs = global._vmsTimeOffsetMs || 0;
  const url = `http://127.0.0.1:${currentPort}/api/cloud/recordings/download?systemId=${rec.systemId}&deviceId=${cleanId}&startTime=${rec.startMs}&endTime=${rec.endMs}&cameraName=${encodeURIComponent(rec.cameraName)}&autoSave=true&taskId=${rec.id}&token=${auth}&notificationUserKey=${encodeURIComponent(rec.scheduledBy || "admin")}&timeOffsetMs=${timeOffsetMs}`;
  const headers: any = {};
  if (auth) headers["x-watchdog-auth"] = auth;
  if (nxIp && nxIp !== "localhost") headers["x-nx-location-ip"] = nxIp;
  if (nxPort && nxPort !== "7001") headers["x-nx-location-port"] = nxPort;

  console.log(`[Watchdog] Triggering auto-save (${rec.recurrence || 'once'}) for ${rec.cameraName}: ${new Date(rec.startMs).toLocaleString()} -> ${new Date(rec.endMs).toLocaleTimeString()}`);
  console.log(`[Watchdog] Auto-save URL: ${url}`);

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Watchdog] Auto-save failed for ${rec.cameraName}: HTTP ${res.status} - ${errText}`);
      await logScheduledRecordingError({
        cameraId: rec.cameraId,
        cameraName: rec.cameraName,
        systemId: rec.systemId,
        message: `Failed auto-saving video for ${rec.cameraName}: HTTP ${res.status}`,
      });
      return;
    }
    const data = await res.json();
    if (data?.success && data?.enqueued) {
      console.log(`[Watchdog] Auto-save enqueued for ${rec.cameraName}: ${data.file || ""}`);
    } else if (data?.success) {
      console.log(`[Watchdog] Auto-save successful for ${rec.cameraName}: ${data.path || data.file}`);
    } else if (data?.skipped) {
      console.log(`[Watchdog] Auto-save skipped for ${rec.cameraName}: ${data.reason || 'already exists'}`);
    } else {
      console.warn(`[Watchdog] Auto-save unexpected response for ${rec.cameraName}:`, data);
    }
  } catch (err: any) {
    console.error(`[Watchdog] Auto-save request error for ${rec.cameraName}:`, err.message);
    await logScheduledRecordingError({
      cameraId: rec.cameraId,
      cameraName: rec.cameraName,
      systemId: rec.systemId,
      message: `Failed auto-saving video for ${rec.cameraName}: ${err.message}`,
    });
  }



}

// Ensure watchdog and FFmpeg worker start when this module is used
startFFmpegWorker();
startWatchdog();

// ── Multi-Tenant Security Helpers ──────────────────────────────────────────

function normalizeCameraId(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
}

function mergeResourceRights(
  target: Record<string, string>,
  source: Record<string, string> | undefined | null,
) {
  if (!source || typeof source !== "object") return;
  Object.entries(source).forEach(([key, value]) => {
    if (value && value !== "none") {
      target[normalizeCameraId(key)] = value;
    }
  });
}

function lookupCameraRights(rights: Record<string, string>, cameraId: string): string {
  const nid = normalizeCameraId(cameraId);
  if (rights[nid]) return rights[nid];
  for (const [key, value] of Object.entries(rights)) {
    if (normalizeCameraId(key) === nid) return value;
  }
  return "";
}

function hasCameraAccess(rights: Record<string, string>, cameraId: string): boolean {
  const r = lookupCameraRights(rights, cameraId).toLowerCase();
  if (!r || r === "none") return false;
  return r.includes("view");
}

function isUnassignedScheduleOwner(owner: string | undefined): boolean {
  const o = owner?.trim();
  return !o || o === "System" || o === "Verifying...";
}

function isScheduleOwner(schedule: { scheduledBy?: string }, username: string): boolean {
  if (!username || username === "System") return false;
  const owner = schedule.scheduledBy?.trim();
  if (isUnassignedScheduleOwner(owner)) return false;
  return owner!.toLowerCase() === username.toLowerCase();
}

/** Incoming saves from the UI may still carry placeholder owners before VMS identity resolves. */
function isIncomingScheduleForUser(
  schedule: { scheduledBy?: string },
  username: string,
): boolean {
  if (!username || username === "System") return false;
  const owner = schedule.scheduledBy?.trim();
  if (isUnassignedScheduleOwner(owner)) return true;
  return owner!.toLowerCase() === username.toLowerCase();
}

function normalizeScheduleOwner(
  schedule: { scheduledBy?: string },
  username: string,
): string {
  const owner = schedule.scheduledBy?.trim();
  if (isUnassignedScheduleOwner(owner)) {
    return username || "System";
  }
  return owner!;
}

function hasResolvableCameraRights(
  rights: Record<string, string> | null,
): rights is Record<string, string> {
  return rights != null && Object.keys(rights).length > 0;
}

function canUserViewSchedule(
  schedule: { cameraId: string },
  userIsAdmin: boolean,
  allowedCameraIds: Set<string> | undefined,
  rights: Record<string, string> | null,
): boolean {
  if (userIsAdmin) return true;

  const cameraId = normalizeCameraId(schedule.cameraId);
  if (allowedCameraIds && allowedCameraIds.size > 0) {
    return allowedCameraIds.has(cameraId);
  }

  if (hasResolvableCameraRights(rights)) {
    return hasCameraAccess(rights, schedule.cameraId);
  }

  // Rights could not be resolved server-side; include row for client-side camera filter
  return true;
}

function isVmsPowerUser(permissions: string, groups: any[], userGroupIds: Set<string>): boolean {
  const perms = permissions.toLowerCase();
  if (perms.includes("administrator") || perms.includes("poweruser")) {
    return true;
  }

  return (groups || []).some((g: any) => {
    const groupId = normalizeCameraId(String(g.id || ""));
    const name = (g.name || "").toLowerCase();
    if (!userGroupIds.has(groupId)) return false;
    return name.includes("administrator") || name.includes("poweruser");
  });
}

/**
 * Fetch the current user's resource access rights, role, and username from the VMS.
 */
async function getUserResourceRights(
  request: NextRequest,
  nxIp?: string,
  nxPort?: string,
): Promise<{
  rights: Record<string, string> | null;
  isAdmin: boolean;
  username: string;
  allowedCameraIds?: Set<string>;
}> {
  try {
    let userCookie = request.cookies.get("local_nx_user")?.value;
    if (!userCookie) userCookie = request.cookies.get("nx_cloud_session")?.value;
    if (!userCookie) {
      return { rights: null, isAdmin: false, username: "System", allowedCameraIds: new Set() };
    }

    let token = userCookie;
    let username = "";
    try {
      if (userCookie.startsWith("{")) {
        const parsed = JSON.parse(userCookie);
        token = parsed.token || parsed.accessToken || token;
        username = parsed.username || parsed.name || "";
      }
    } catch (e) { }

    // Resolve Host: Prioritize cookies -> global config -> provided IP -> localhost
    let finalIp = request.cookies.get("nx_location_ip")?.value ||
      API_CONFIG.serverHost ||
      (nxIp && nxIp !== "localhost" && nxIp !== "null" ? nxIp : "localhost");

    // Resolve Port: Prioritize cookies -> global config -> provided Port -> 7001
    let finalPort = request.cookies.get("nx_location_port")?.value ||
      API_CONFIG.serverPort ||
      (nxPort && nxPort !== "7001" && nxPort !== "null" ? nxPort : "7001");

    if (finalIp === "localhost" || !finalIp) {
      try {
        const settings = readAppSettings();
        if (settings.nxServerHost && settings.nxServerHost !== "localhost") {
          finalIp = String(settings.nxServerHost);
          if (settings.nxServerPort) finalPort = String(settings.nxServerPort);
        }
      } catch (e) { }
    }

    if (!token) {
      return {
        rights: null,
        isAdmin: false,
        username: username || "System",
        allowedCameraIds: new Set(),
      };
    }

    // Resolve username from VMS session when the cookie only stores the token
    if (!username) {
      try {
        const sessionData = await vmsRequest("GET", "/rest/v3/login/sessions/-", null, token, finalIp, finalPort, undefined, request);
        if (sessionData?.username) {
          username = sessionData.username;
        }
      } catch (e: any) {
        // ignore
      }
    }

    const accessibleRights: Record<string, string> = {};
    let vmsIsAdmin = false;

    try {
      const usersEndpoint = username
        ? `/rest/v3/users?name=${encodeURIComponent(username)}`
        : "/rest/v3/users";

      const [permsData, groupsData, devices, usersData] = await Promise.all([
        vmsRequest("GET", "/rest/v3/users/-/permissions", null, token, finalIp, finalPort, undefined, request).catch(() => ({})),
        vmsRequest("GET", "/rest/v3/userGroups", null, token, finalIp, finalPort, undefined, request).catch(() => []),
        vmsRequest("GET", "/rest/v3/devices", null, token, finalIp, finalPort, undefined, request).catch(() => []),
        vmsRequest("GET", usersEndpoint, null, token, finalIp, finalPort, undefined, request).catch(() => []),
      ]);

      // Explicit per-camera grants from User Management
      mergeResourceRights(accessibleRights, permsData?.resourceAccessRights);

      // Devices returned by VMS are already filtered to what this user can access
      if (Array.isArray(devices)) {
        devices.forEach((d: any) => {
          if (d.id) {
            const nid = normalizeCameraId(d.id);
            if (!accessibleRights[nid]) {
              accessibleRights[nid] = "view";
            }
          }
        });
      }

      const permissions = (permsData?.permissions || "").toLowerCase();
      const groups = Array.isArray(groupsData) ? groupsData : (groupsData?.reply || []);
      const users = Array.isArray(usersData) ? usersData : (usersData?.reply || []);
      const currentUser = users[0];
      const userGroupIds = new Set<string>(
        (currentUser?.groupIds || []).map((id: string) => normalizeCameraId(String(id))),
      );

      vmsIsAdmin = isVmsPowerUser(permissions, groups, userGroupIds);

      const allowedCameraIds = new Set<string>();
      Object.entries(accessibleRights).forEach(([id, right]) => {
        const r = (right || "").toLowerCase();
        if (r && r !== "none" && r.includes("view")) {
          allowedCameraIds.add(normalizeCameraId(id));
        }
      });

      return {
        rights: vmsIsAdmin ? null : accessibleRights,
        isAdmin: vmsIsAdmin,
        username: username || currentUser?.name || "System",
        allowedCameraIds: vmsIsAdmin ? undefined : allowedCameraIds,
      };
    } catch (e: any) {
      // console.warn(`[getUserResourceRights] Failed to fetch VMS permissions: ${e.message}`);
    }

    const allowedCameraIds = new Set<string>();
    Object.entries(accessibleRights).forEach(([id, right]) => {
      const r = (right || "").toLowerCase();
      if (r && r !== "none" && r.includes("view")) {
        allowedCameraIds.add(normalizeCameraId(id));
      }
    });

    return {
      rights: accessibleRights,
      isAdmin: false,
      username: username || "System",
      allowedCameraIds,
    };
  } catch (err) {
    return { rights: null, isAdmin: false, username: "System", allowedCameraIds: new Set() };
  }
}

export async function GET(request: NextRequest) {
  // Capture the port from the request to help the watchdog make internal calls
  const urlPort = request.nextUrl.port;
  const hostHeader = request.headers.get("host");
  const hostPort = hostHeader?.split(":")[1];
  const detectedPort = urlPort || hostPort;

  if (detectedPort && detectedPort !== global._nxAppPort) {
    global._nxAppPort = detectedPort;
    (async () => {
      try {
        const data = await readScheduledRecordings();
        data.appPort = detectedPort;
        await writeScheduledRecordings(data);
      } catch (e) { }
    })();
  }

  startWatchdog();
  try {
    const data = await readScheduledRecordings();

    // ── Multi-Tenant Filtering ──────────────────────────────────────────────
    const { rights, isAdmin: userIsAdmin, username, allowedCameraIds } =
      await getUserResourceRights(request, data.nxLocationIp, data.nxLocationPort);

    // ── Update Auth Token for Current User ──
    let token = request.cookies.get("local_nx_user")?.value;
    if (!token) token = request.cookies.get("nx_cloud_session")?.value;
    if (token && token.startsWith("{")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.token || parsed.accessToken || token;
      } catch (e) { }
    }

    if (token && username && username !== "System") {
      let fileNeedsUpdate = false;
      const rawSchedules = data.schedules || [];
      rawSchedules.forEach((s: any) => {
        if (s.scheduledBy && s.scheduledBy.toLowerCase() === username.toLowerCase()) {
          if (s.auth !== token) {
            s.auth = token;
            fileNeedsUpdate = true;
          }
        } else if (s.auth === token && !isScheduleOwner(s, username)) {
          s.scheduledBy = username;
          fileNeedsUpdate = true;
        }
      });
      if (fileNeedsUpdate) {
        await writeScheduledRecordings(data);
      }
    }

    // console.log(`[GET /scheduled] Found ${data.schedules?.length || 0} raw schedules on disk.`);

    // Visibility: any user sees schedules on cameras they can view (any creator).
    // Edit/delete is enforced in the UI and on POST merge (owner or VMS admin/power user only).
    if (!userIsAdmin) {
      data.schedules = (data.schedules || []).filter((s: any) =>
        canUserViewSchedule(s, userIsAdmin, allowedCameraIds, rights),
      );
    }

    // ── Security Scrubbing ──────────────────────────────────────────────────
    // Remove all tokens and sensitive keys before sending to the client
    if (Array.isArray(data.schedules)) {
      data.schedules = data.schedules.map((s: any) => {
        const { auth, userKey, ...rest } = s;
        return rest;
      });
    }
    delete data.globalAuth;
    delete data.notificationUserKey;
    delete data.globalAuthFallback;
    delete data.globalUserKeyFallback;

    return NextResponse.json({
      ...data,
      isAdmin: userIsAdmin,
      vmsUsername: username,
      resourceAccessRights: rights
    });
  } catch (e) {
    return NextResponse.json({ schedules: [], originalSchedules: {} });
  }
}

export async function POST(request: NextRequest) {
  // Capture the port from the request to help the watchdog make internal calls
  const urlPort = request.nextUrl.port;
  const hostHeader = request.headers.get("host");
  const hostPort = hostHeader?.split(":")[1];
  const detectedPort = urlPort || hostPort;

  if (detectedPort && detectedPort !== global._nxAppPort) {
    global._nxAppPort = detectedPort;
  }

  startWatchdog();
  try {
    const body = await request.json();

    // ── Multi-Tenant Merge Strategy ─────────────────────────────────────────
    const existingData = await readScheduledRecordings();

    // 2. Identify current user and their rights
    const { rights, isAdmin: userIsAdmin, username, allowedCameraIds } =
      await getUserResourceRights(
        request,
        body.nxLocationIp || existingData.nxLocationIp,
        body.nxLocationPort || existingData.nxLocationPort,
      );

    logRecordingEvent(`logged in as: ${username}(admin:${userIsAdmin})`);

    let token = request.cookies.get("local_nx_user")?.value;
    if (!token) token = request.cookies.get("nx_cloud_session")?.value;

    if (token && token.startsWith("{")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.token || parsed.accessToken || token;
      } catch (e) { }
    }

    // Normalize placeholder owners before merge so saves are attributed to the VMS user.
    if (Array.isArray(body.schedules) && username && username !== "System") {
      body.schedules = body.schedules.map((s: any) => ({
        ...s,
        scheduledBy: normalizeScheduleOwner(s, username),
      }));
    }

    // 3. Smart Merge: non-admins may only add/update/delete their own schedules.
    // Admin users do a full replace; others merge to preserve other users' schedules.
    if (!userIsAdmin) {
      const existingById = new Map(
        (existingData.schedules || []).map((s: any) => [s.id, s]),
      );

      // Always preserve schedules created by other users.
      const otherUsersSchedules = (existingData.schedules || []).filter(
        (s: any) => !isScheduleOwner(s, username)
      );

      // Accept incoming schedules for the current user (including UI placeholders).
      const ownIncomingSchedules = (body.schedules || []).filter((s: any) => {
        const existing = existingById.get(s.id);
        const ownedViaAuth =
          !!token && !!existing?.auth && existing.auth === token;

        if (!isIncomingScheduleForUser(s, username) && !ownedViaAuth) {
          return false;
        }

        if (ownedViaAuth) {
          s.scheduledBy = username;
        }

        return canUserViewSchedule(s, userIsAdmin, allowedCameraIds, rights);
      });

      body.schedules = [...otherUsersSchedules, ...ownIncomingSchedules];

      // 4. Deduplicate to prevent redundant tasks for the same camera/time/type
      const seen = new Set();
      body.schedules = (body.schedules || []).filter((s: any) => {
        const dateStr = new Date(s.date).toDateString();
        const key = `${normalizeCameraId(s.cameraId)}-${dateStr}-${s.startTime}-${s.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });


      // Merge originalSchedules similarly
      body.originalSchedules = {
        ...(existingData.originalSchedules || {}),
        ...(body.originalSchedules || {})
      };
    }

    // ── Update Auth & Metadata ──────────────────────────────────────────────
    const userKey = body.notificationUserKey || request.cookies.get("local_nx_user")?.value || request.cookies.get("nx_cloud_session")?.value;

    if (token) {
      if (Array.isArray(body.schedules)) {
        // Assign VMS-verified username and specific auth token to EACH schedule
        body.schedules = body.schedules.map((s: any) => {
          const finalUsername = normalizeScheduleOwner(s, username);

          const existingSchedule = (existingData.schedules || []).find((old: any) => old.id === s.id);
          const isOwner = finalUsername && finalUsername.toLowerCase() === username.toLowerCase();

          // Auto-refresh the token if this user is the owner, otherwise preserve existing
          const finalAuth = isOwner ? token : (existingSchedule?.auth || token);
          const finalUserKey = isOwner ? userKey : (existingSchedule?.userKey || userKey);

          return {
            ...s,
            scheduledBy: finalUsername,
            auth: finalAuth,
            userKey: finalUserKey
          };
        });
      }
    }

    let nxIp = body.nxLocationIp || request.cookies.get("nx_location_ip")?.value;
    let nxPort = body.nxLocationPort || request.cookies.get("nx_location_port")?.value;

    if (!nxIp || nxIp === "localhost") {
      try {
        const settings = readAppSettings();
        if (settings.nxServerHost) nxIp = String(settings.nxServerHost);
        if (settings.nxServerPort) nxPort = String(settings.nxServerPort);
      } catch (e) { }
    }

    nxIp = (nxIp && nxIp !== "localhost" && nxIp !== "null") ? nxIp : undefined;
    nxPort = (nxPort && nxPort !== "7001" && nxPort !== "null") ? nxPort : undefined;

    body.nxLocationIp = nxIp;
    body.nxLocationPort = nxPort;

    // Remove redundant fields from each schedule
    if (body.schedules) {
      body.schedules = body.schedules.map((s: any) => {
        delete s.userKey;
        delete s.systemName;
        return s;
      });
    }

    await writeScheduledRecordings(body);

    // Log the creation event only once per batch
    if (body.schedules && body.schedules.length > 0) {
      const firstCam = body.schedules[0].cameraName || "Unknown Camera";
      logRecordingEvent(`schedule for camera ${firstCam} created`);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
