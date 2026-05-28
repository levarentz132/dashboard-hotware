import logger from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/config";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logRecordingEvent, formatAuditDate } from "@/lib/recording-logger";
import { buildCloudUrl } from "@/lib/cloud-api";
import { startFFmpegWorker } from "@/lib/ffmpeg-worker";
import { calculateNextOccurrence } from "@/lib/schedule-utils";
import {
  readScheduledRecordings,
  writeScheduledRecordings,
} from "@/lib/scheduled-recordings-store";


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
  systemId?: string
): Promise<any> {
  try {
    const isLocalToken = authToken.startsWith("vms-");

    // Construct a dummy request object to pass the IP/Port to buildCloudUrl
    const dummyRequest = {
      cookies: { get: () => null },
      headers: {
        get: (name: string) => {
          if (name === "x-nx-location-ip") return nxIp;
          if (name === "x-nx-location-port") return nxPort;
          return null;
        }
      }
    } as any;

    const params = new URLSearchParams();
    const url = buildCloudUrl(systemId || "", endpoint, params, dummyRequest);
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
}

// Initialize execution lock set
if (typeof global !== "undefined" && !global._nxExecutingTasks) {
  global._nxExecutingTasks = new Set<string>();
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
          const sinceEnd = endTime > 0 ? now - endTime : 0;
          // 30-minute grace after the recording window ends for FFmpeg auto-save to complete
          if (sinceEnd > 30 * 60 * 1000 && !doesVideoFileExist(rec)) {
            console.log(`[Watchdog] Stale non-recurring processing task ${rec.id} removed during cleanup (auto-save timed out).`);
            deletedTaskIds.add(rec.id);
            changed = true;
            return;
          }
          cleanedSchedules.push(rec);
          return;
        }

        if (rec.status === "recording" || rec.status === "capturing" || rec.status === "in progress") {
          if (startTime > 0 && (now - startTime > 3600000)) {
            if (isNonRecurring) {
              console.log(`[Watchdog] Stale non-recurring task ${rec.id} (${rec.status}) removed during cleanup.`);
              deletedTaskIds.add(rec.id);
              changed = true;
              return;
            } else {
              rec.status = "failed";
              changed = true;
            }
          }
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
        const startMs = rec.startMs || new Date(rec.date).setHours(sh, sm, ss, 0);
        const endMs = rec.endMs || new Date(rec.date).setHours(eh, em, es, 999);

        // Deduplication: if the video file already exists, complete or delete the schedule immediately
        if (rec.type === "video" && doesVideoFileExist(rec)) {
          console.log(`[Watchdog] AUTO-SAVE deduplication: Valid file already exists for ${rec.cameraName}, skipping trigger.`);
          const isRecurring = rec.recurrence && rec.recurrence !== "none";
          if (isRecurring) {
            const nextDate = calculateNextOccurrence(rec, sh, sm, ss || 0);
            rec.status = "pending";
            rec.record = false;
            rec.date = nextDate.toISOString();
            rec.startMs = nextDate.getTime();
            rec.endMs = nextDate.getTime() + (endMs - startMs);
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
          if ((rec.status === "pending" || rec.status === "in progress") && isWithinWindow) {
            rec.status = "capturing";
            changed = true;
            global._nxExecutingTasks?.add(rec.id);
            tasksToExecute.push({ type: "screenshot", rec, startMs, endMs, sh, sm, ss });
          }
        }
        // Video logic
        else if (now >= startMs && now < endMs) {
          // FIX: Also handle status "recording" when rec.record is not yet set.
          // This covers the case where the client sets status to "recording" for
          // immediate tasks, but the VMS has not been patched yet.
          if ((rec.status === "pending" || rec.status === "failed" || rec.status === "in progress" || (rec.status === "recording" && !rec.record))) {
            const isRecurring = rec.recurrence && rec.recurrence !== "none";
            const isLate = now > (startMs + 60000); // More than 1 min late

            if (isRecurring && isLate) {
              console.log(`[Watchdog] Recurring task ${rec.cameraName} started in the past. Skipping to next occurrence.`);
              tasksToExecute.push({ type: "expire", rec, startMs, endMs, sh, sm, ss });
            } else {
              rec.status = "recording";
              rec.record = true;
              changed = true;
              global._nxExecutingTasks?.add(rec.id);
              tasksToExecute.push({ type: "video_start", rec, startMs, endMs, sh, sm, ss, eh, em, es });
            }
          }
        }
        else if (now >= endMs && (rec.status === "recording" || rec.status === "failed" || rec.status === "in progress" || rec.status === "completing")) {
          rec.status = "completing";
          changed = true;
          tasksToExecute.push({ type: "video_stop", rec, startMs, endMs, sh, sm, ss, eh, em, es });
        }
        else if (now >= endMs && rec.status === "processing" && rec.type === "video") {
          const isNonRecurring = !rec.recurrence || rec.recurrence === "none" || rec.recurrence === "once";
          if (doesVideoFileExist(rec)) {
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
              rec.startMs = nextDate.getTime();
              rec.endMs = nextDate.getTime() + (endMs - startMs);
              changed = true;
              console.log(`[Watchdog] Recurring task ${rec.cameraName} auto-save completed. Rolled forward to ${nextDate.toISOString()}`);
            }
          } else {
            const isEnqueued = queue.some((job: any) => job.payload?.taskId === rec.id && (job.status === "pending" || job.status === "processing"));
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

      // ── Phase 2: Execute Tasks in Parallel ─────────────────────────────────
      await Promise.all(tasksToExecute.map(async (task) => {
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
                notificationUserKey: rec.scheduledBy || "admin"
              })
            });

            if (!res.ok) {
              rec.status = "failed";
            } else {
              if (rec.recurrence && rec.recurrence !== "none") {
                const nextDate = calculateNextOccurrence(rec, sh, sm, ss);
                rec.status = "pending";
                rec.date = nextDate.toISOString();
                rec.startMs = nextDate.getTime();
                rec.endMs = nextDate.getTime() + (endMs - startMs);
              } else {
                deletedTaskIds.add(rec.id);
                const idx = uniqueSchedules.findIndex((s: any) => s.id === rec.id);
                if (idx !== -1) uniqueSchedules.splice(idx, 1);
                console.log(`[Watchdog] Screenshot task ${rec.id} completed and REMOVED (non-recurring)`);
              }
            }
          } catch (e) {
            rec.status = "failed";
          }
        }

        if (task.type === "video_start") {
          try {
            const cleanId = rec.cameraId.replace(/[{}]/g, "");
            const auth = rec.auth;
            if (!auth || !ip) {
              console.warn(`[Watchdog] video_start SKIPPED for ${rec.cameraName}: auth=${!!auth}, ip=${ip}`);
              return;
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
            rec.status = "failed";
          }
        }

        if (task.type === "video_stop") {
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
              rec.startMs = nextDate.getTime();
              rec.endMs = nextDate.getTime() + (endMs - startMs);
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
            rec.startMs = nextDate.getTime();
            rec.endMs = nextDate.getTime() + (endMs - startMs);
          } else {
            rec.status = "completed";
          }
        }
      }));

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
  }, 2000);
};

// Helper functions for the refactored watchdog
function doesVideoFileExist(rec: any): boolean {
  try {
    const cleanId = rec.cameraId.replace(/[{}]/g, "");
    const idHash = cleanId.slice(-4).toLowerCase();
    const startMs = rec.startMs || (rec.date ? new Date(rec.date).getTime() : Date.now());
    const recDate = new Date(startMs);
    const YYYY = recDate.getFullYear().toString();
    const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
    const DD = recDate.getDate().toString().padStart(2, "0");
    const HH = recDate.getHours().toString().padStart(2, "0");
    const mmP = recDate.getMinutes().toString().padStart(2, "0");
    const dateFolder = `${YYYY}-${MM}-${DD}`;
    const safeCameraName = (rec.cameraName || rec.cameraId?.substring(0, 8) || "Camera")
      .replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();

    let autoSaveBaseDir = path.join(process.cwd(), "data", "recorded_videos");
    try {
      const settingsFile = path.join(process.cwd(), "data", "settings.json");
      if (fsSync.existsSync(settingsFile)) {
        const settings = JSON.parse(fsSync.readFileSync(settingsFile, "utf-8"));
        if (settings.videoStoragePath) {
          autoSaveBaseDir = settings.videoStoragePath;
        } else if (settings.storagePath) {
          autoSaveBaseDir = settings.storagePath;
        }
      }
    } catch (e) { }

    const finalFileName = `${safeCameraName}_${HH}${mmP}00_${idHash}.mp4`;
    const savePath = path.join(autoSaveBaseDir, dateFolder, finalFileName);

    return fsSync.existsSync(savePath) && fsSync.statSync(savePath).size > 0;
  } catch (e) {
    return false;
  }
}

// Removed local calculateNextOccurrence and imported from shared utilities instead

async function triggerAutoSave(rec: any, cleanId: string, auth: string, nxIp: string, nxPort: string) {
  const currentPort = detectCurrentPort(global._nxAppPort || "3030");
  const url = `http://127.0.0.1:${currentPort}/api/cloud/recordings/download?systemId=${rec.systemId}&deviceId=${cleanId}&startTime=${rec.startMs}&endTime=${rec.endMs}&cameraName=${encodeURIComponent(rec.cameraName)}&autoSave=true&taskId=${rec.id}&token=${auth}&notificationUserKey=${encodeURIComponent(rec.scheduledBy || "admin")}`;
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
      return;
    }
    const data = await res.json();
    if (data?.success) {
      console.log(`[Watchdog] Auto-save successful for ${rec.cameraName}: ${data.path || data.file}`);
    } else if (data?.skipped) {
      console.log(`[Watchdog] Auto-save skipped for ${rec.cameraName}: ${data.reason || 'already exists'}`);
    } else {
      console.warn(`[Watchdog] Auto-save unexpected response for ${rec.cameraName}:`, data);
    }
  } catch (err: any) {

    console.error(`[Watchdog] Auto-save request error for ${rec.cameraName}:`, err.message);
  }



}

// Ensure watchdog and FFmpeg worker start when this module is used
startFFmpegWorker();
startWatchdog();

// ── Multi-Tenant Security Helpers ──────────────────────────────────────────

/**
 * Fetch the current user's resource access rights, role, and username from the VMS.
 */
async function getUserResourceRights(request: NextRequest, nxIp?: string, nxPort?: string): Promise<{ rights: Record<string, string> | null, isAdmin: boolean, username: string }> {
  try {
    let userCookie = request.cookies.get("local_nx_user")?.value;
    if (!userCookie) userCookie = request.cookies.get("nx_cloud_session")?.value;
    if (!userCookie) return { rights: null, isAdmin: false, username: "System" };

    let token = userCookie;
    let username = "";
    let isDashboardAdmin = false;
    try {
      const scrubbedCookie = userCookie.startsWith("{") ? JSON.parse(userCookie) : { token: "present" };
      if (scrubbedCookie.token) scrubbedCookie.token = "SCRUBBED";
      if (scrubbedCookie.accessToken) scrubbedCookie.accessToken = "SCRUBBED";
      // console.log(`[getUserResourceRights] userCookie:`, scrubbedCookie);

      if (userCookie.startsWith("{")) {
        const parsed = JSON.parse(userCookie);
        token = parsed.token || parsed.accessToken || token;
        username = parsed.username || parsed.name || "";
        const role = parsed.role?.name || parsed.role || "";
        isDashboardAdmin = role.toLowerCase() === "admin";
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
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fsSync.existsSync(settingsFile)) {
          const settings = JSON.parse(fsSync.readFileSync(settingsFile, "utf-8"));
          if (settings.nxServerHost && settings.nxServerHost !== "localhost") {
            finalIp = settings.nxServerHost;
            if (settings.nxServerPort) finalPort = settings.nxServerPort;
          }
        }
      } catch (e) { }
    }

    // ── Resolve Username from VMS if missing ────────────────────────────────
    if (!username && token) {
      try {
        const sessionData = await vmsRequest("GET", "/rest/v3/login/sessions/-", null, token, finalIp, finalPort);
        if (sessionData && sessionData.username) {
          username = sessionData.username;
          // console.log(`[getUserResourceRights] Resolved username from VMS session: ${username}`);
        }
      } catch (e: any) {
        // console.warn(`[getUserResourceRights] Failed to resolve username from VMS session: ${e.message}`);
      }
    }

    if (!token || !username) {
      // console.log(`[getUserResourceRights] No token or username found. Using fallback: ${username || "System"}`);
      return { rights: null, isAdmin: isDashboardAdmin, username: username || "System" };
    }

    // ── STEP 1: Determine accessible cameras from VMS ──────────────────────
    const accessibleRights: Record<string, string> = {};
    try {
      const devices = await vmsRequest("GET", "/rest/v3/devices", null, token, finalIp, finalPort);
      if (Array.isArray(devices)) {
        const normalizeId = (id: string) => id.replace(/[{}]/g, "");
        devices.forEach((d: any) => {
          if (d.id) accessibleRights[normalizeId(d.id)] = "view";
        });
        // console.log(`[getUserResourceRights] User ${username} can access ${devices.length} cameras.`);
      }
    } catch (e: any) {
      // console.warn(`[getUserResourceRights] Failed to fetch accessible devices: ${e.message}`);
    }

    // ── STEP 2: Fetch direct VMS permissions and groups for admin status ────
    let vmsIsAdmin = false;
    try {
      // Parallel fetch for permissions and groups
      const [permsData, groupsData, userData] = await Promise.all([
        vmsRequest("GET", "/rest/v3/users/-/permissions", null, token, finalIp, finalPort).catch(() => ({})),
        vmsRequest("GET", "/api/nx/userGroups", null, token, finalIp, finalPort).catch(() => []),
        vmsRequest("GET", `/api/nx/users?name=${encodeURIComponent(username)}`, null, token, finalIp, finalPort).catch(() => ({}))
      ]);

      const permissions = (permsData?.permissions || "").toLowerCase();
      const user = Array.isArray(userData) ? userData[0] : (userData.reply ? userData.reply[0] : userData);
      const groups = Array.isArray(groupsData) ? groupsData : (groupsData.reply || []);

      // Determine admin status based on group names (administrator, power user, etc.)
      const adminGroupNames = (groups || []).map((g: any) => (g.name || "").toLowerCase());
      vmsIsAdmin = adminGroupNames.some((name: string) =>
        name.includes("administrator") ||
        name.includes("poweruser")
      );

      // Fallback only if no groups assigned (NX older versions might not use groups strictly)
      if (!vmsIsAdmin && permissions === "administrator") {
        vmsIsAdmin = true;
      }

      return {
        rights: vmsIsAdmin ? null : accessibleRights,
        isAdmin: vmsIsAdmin, // Only trust VMS-derived admin status here, or remove entirely if possible
        username
      };
    } catch (e: any) {
      // console.warn(`[getUserResourceRights] Failed to fetch VMS permissions: ${e.message}`);
    }

    // console.log(`[getUserResourceRights] No direct VMS permissions found for ${username}. isDashboardAdmin=${isDashboardAdmin}. Using device-list rights.`);
    return { rights: accessibleRights, isAdmin: false, username };
  } catch (err) {
    return { rights: null, isAdmin: false, username: "System" };
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
    const { rights, isAdmin: userIsAdmin, username } = await getUserResourceRights(request, data.nxLocationIp, data.nxLocationPort);

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
        }
      });
      if (fileNeedsUpdate) {
        await writeScheduledRecordings(data);
      }
    }

    // console.log(`[GET /scheduled] Found ${data.schedules?.length || 0} raw schedules on disk.`);

    // Admin bypass: admins always see all schedules
    if (userIsAdmin) {
      // console.log(`[GET /scheduled] Admin user ${username}: Showing all ${data.schedules?.length || 0} schedules.`);
    } else if (rights) {
      // Non-admin with rights: filter by accessible cameras
      const normalizeId = (id: string) => id.replace(/[{}]/g, "");
      const originalCount = (data.schedules || []).length;
      data.schedules = (data.schedules || []).filter((s: any) => {
        const nid = normalizeId(s.cameraId);
        const r = (rights[nid] || rights[s.cameraId] || "").toLowerCase();

        // Allow if user has explicit VMS rights OR if they are the one who created this schedule
        const hasRights = r !== "" && r !== "none";
        const isOwner = s.scheduledBy && username && s.scheduledBy.toLowerCase() === username.toLowerCase();

        return hasRights || isOwner;
      });
      // console.log(`[GET /scheduled] Restricted user ${username}: Filtered schedules from ${originalCount} down to ${data.schedules.length}`);
    } else {
      // Could not verify rights and user is not admin -> show nothing
      // console.log(`[GET /scheduled] Restricted user ${username} (No rights found): Showing 0 schedules.`);
      data.schedules = [];
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
    const { rights, isAdmin: userIsAdmin, username } = await getUserResourceRights(request, body.nxLocationIp || existingData.nxLocationIp, body.nxLocationPort || existingData.nxLocationPort);

    logRecordingEvent(`logged in as: ${username}(admin:${userIsAdmin})`);

    let token = request.cookies.get("local_nx_user")?.value;
    if (!token) token = request.cookies.get("nx_cloud_session")?.value;

    if (token && token.startsWith("{")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.token || parsed.accessToken || token;
      } catch (e) { }
    }

    // 3. Smart Merge: Keep existing schedules for cameras the user CAN'T see
    // Admin users do a full replace; non-admins merge to preserve other users' schedules
    if (rights && !userIsAdmin) {
      const normalizeId = (id: string) => id.replace(/[{}]/g, "");

      // Filter out only the schedules for cameras the user HAS access to from the EXISTING list
      // (as those are the ones they are providing updates for)
      const otherUsersSchedules = (existingData.schedules || []).filter((s: any) => {
        const nid = normalizeId(s.cameraId);
        const r = rights[nid] || rights[s.cameraId] || "";

        const hasRights = r !== "" && r !== "none";
        const isOwner = s.scheduledBy && username && s.scheduledBy.toLowerCase() === username.toLowerCase();

        // Keep schedules that the user CANNOT manage.
        // They CAN manage it if they have VMS rights OR if they are the owner.
        return !hasRights && !isOwner;
      });

      // Combine other users' schedules with the new ones provided by the current user
      body.schedules = [...otherUsersSchedules, ...(body.schedules || [])];

      // 4. Deduplicate to prevent redundant tasks for the same camera/time/type
      const seen = new Set();
      body.schedules = (body.schedules || []).filter((s: any) => {
        const dateStr = new Date(s.date).toDateString();
        const key = `${normalizeId(s.cameraId)}-${dateStr}-${s.startTime}-${s.type}`;
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
        // Preserve existing scheduledBy if it's already set to a real user
        body.schedules = body.schedules.map((s: any) => {
          let finalUsername = s.scheduledBy;

          if (!finalUsername || finalUsername === "Verifying..." || finalUsername === "System") {
            finalUsername = username || "System";
          }

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
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fsSync.existsSync(settingsFile)) {
          const settings = JSON.parse(fsSync.readFileSync(settingsFile, "utf-8"));
          if (settings.nxServerHost) nxIp = settings.nxServerHost;
          if (settings.nxServerPort) nxPort = settings.nxServerPort;
        }
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
