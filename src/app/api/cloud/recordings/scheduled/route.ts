import logger from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/config";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logRecordingEvent, formatAuditDate } from "@/lib/recording-logger";


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
  nxPort: string
): Promise<any> {
  const url = `https://${nxIp}:${nxPort}${endpoint}`;
  try {
    const isLocalToken = authToken.startsWith("vms-");
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
      logger.debug(`[Watchdog] VMS ${method} ${url} failed with status ${res.status}: ${text}`);
      throw new Error(`VMS ${res.status}: ${text}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  } catch (err: any) {
    logger.debug(`[Watchdog] Network error for VMS ${method} ${url}:`, err.message);
    throw err;
  }
}

const DATA_FILE = path.join(process.cwd(), "data", "scheduled_recordings.json");
const MAX_AUTOSAVE_AGE_MS = 60 * 60 * 1000; // 1 hour grace period for auto-download

// Background Watchdog (In-memory for the server session)
declare global {
  var _nxWatchdogInterval: NodeJS.Timeout | undefined;
  var _nxWatchdogActive: boolean | undefined;
  var _nxAppPort: string | undefined;
}
 
/**
 * Try to detect the current application port from environment or process arguments.
 * Useful in dev where ports can change (e.g. 3010, 3011).
 */
function detectCurrentPort(fallback: string): string {
  if (global._nxAppPort) return global._nxAppPort;
  if (process.env.PORT) return process.env.PORT;
  
  // Check process arguments (e.g. next dev -p 3010)
  const pIndex = process.argv.indexOf("-p");
  if (pIndex !== -1 && process.argv[pIndex + 1]) {
    return process.argv[pIndex + 1];
  }
  
  return fallback;
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
      if (!fsSync.existsSync(DATA_FILE)) {
        global._nxWatchdogActive = false;
        return;
      }
      const dataStr = await fs.readFile(DATA_FILE, "utf-8").catch(() =>
        JSON.stringify({ schedules: [], originalSchedules: {}, globalAuth: null })
      );
      const parsed = JSON.parse(dataStr);
      const { 
        schedules = [], 
        originalSchedules = {}, 
        globalAuth = null, 
        nxLocationIp = "localhost", 
        nxLocationPort = "7001",
        notificationUserKey = null,
        appPort = process.env.NODE_ENV === "production" ? "3030" : "3010" // Production: 3030, Dev: 3010
      } = parsed;
      
      // Use the persisted appPort if the global is not set yet
      if (!global._nxAppPort) {
        global._nxAppPort = appPort;
      }
      
      // ── Resolve VMS IP: Prioritize configured IP over defaults ────────────
      let ip = nxLocationIp && nxLocationIp !== "null" ? nxLocationIp : "localhost";
      let port = nxLocationPort && nxLocationPort !== "null" ? nxLocationPort : "7001";

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

      const now = Date.now();
      
      // ── DEDUPLICATION: Remove identical tasks before processing ──────────
      const uniqueSchedules: any[] = [];
      const seenKeys = new Set();
      for (const s of (schedules || [])) {
        const key = `${s.cameraId}-${s.startTime}-${s.type}-${new Date(s.date).toDateString()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueSchedules.push(s);
        } else {
          changed = true; // Mark as changed to save the cleaned-up list
        }
      }

      const updatedSchedules = await Promise.all(
        uniqueSchedules.map(async (rec: any) => {
          // Skip permanently finished tasks
          if (rec.status === "completed") return rec;

          // Calculate start/end times in MS
          const startParts = rec.startTime.split(":").map(Number);
          const endParts = (rec.endTime || rec.startTime).split(":").map(Number);
          
          const sh = startParts[0];
          const sm = startParts[1];
          const ss = startParts[2] || 0; // Default to 0 seconds for start
          
          const eh = endParts[0];
          const em = endParts[1];
          const es = endParts[2] !== undefined ? endParts[2] : 59; // Default to 59s for end

          // Determine absolute start/end times
          const startMs = rec.startMs || new Date(rec.date).setHours(sh, sm, ss, 0);
          const endMs = rec.endMs || new Date(rec.date).setHours(eh, em, es, 999);

          // ── SCREENSHOT FAST PATH ─────────────────────────────────────────────
          if (rec.type === "screenshot") {
            const catchUpWindowMs = 2 * 60 * 1000; // 2 minutes
            const isWithinWindow = now >= startMs && now < startMs + catchUpWindowMs;

            if ((rec.status === "pending" || rec.status === "failed" || rec.status === "in progress") && isWithinWindow) {
              // ── IMMEDIATELY mark as "capturing" to prevent re-entry on next tick ──
              rec.status = "capturing" as any;
              changed = true;

              const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
              // logger.debug(`[Watchdog] 📸 Firing snapshot for ${rec.cameraName} (Scheduled: ${rec.startTime}, Now: ${time})`);
              try {
                const port = detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010");
                const internalUrl = `http://127.0.0.1:${port}/api/cloud/recordings/screenshot`;

                const screenshotHeaders: Record<string, string> = {
                  "Content-Type": "application/json",
                };
                if (globalAuth) screenshotHeaders["x-watchdog-auth"] = globalAuth;
                if (nxLocationIp && nxLocationIp !== "localhost" && nxLocationIp !== "null") {
                  screenshotHeaders["x-nx-location-ip"] = nxLocationIp;
                }
                if (nxLocationPort && nxLocationPort !== "7001" && nxLocationPort !== "null") {
                  screenshotHeaders["x-nx-location-port"] = nxLocationPort;
                }

                // logger.debug(`[Watchdog] Internal POST to ${internalUrl} for ${rec.cameraName} (VMS: ${nxLocationIp || "Cloud Relay"})`);
                const screenshotRes = await fetch(internalUrl, {
                  method: "POST",
                  headers: screenshotHeaders,
                  body: JSON.stringify({
                    systemId: rec.systemId,
                    deviceId: rec.cameraId,
                    cameraName: rec.cameraName,
                    scheduledStartTime: rec.startTime, // Pass the original human-set time
                    // removed timestampMs to force Live frame capture (most reliable)
                  }),
                });

                if (!screenshotRes.ok) {
                  const errText = await screenshotRes.text();
                  logger.error(`[Watchdog] 📸 Snapshot API failed (${screenshotRes.status}): ${errText}`);
                  rec.status = "failed";
                  rec.record = false;
                } else {
                  const result = await screenshotRes.json();
                  console.log(`[Watchdog] ✅ Snapshot saved for ${rec.cameraName}: ${result.fileName}`);
                  logRecordingEvent(`Snapshot captured successfully: ${rec.cameraName}`, rec.scheduledBy);
                  rec.record = false;

                  if (rec.recurrence && rec.recurrence !== "none") {
                    const nextDate = new Date(rec.date);
                    if (rec.recurrence === "weekday") {
                      nextDate.setDate(nextDate.getDate() + 7);
                    } else if (rec.recurrence === "monthday") {
                      const targetDay = rec.recurrenceDay;
                      if (targetDay) {
                        let year = nextDate.getFullYear();
                        let monthIdx = nextDate.getMonth() + 1;
                        let next = new Date(year, monthIdx, targetDay);
                        while (next.getDate() !== targetDay) { monthIdx++; next = new Date(year, monthIdx, targetDay); }
                        nextDate.setTime(next.getTime());
                      } else {
                        nextDate.setMonth(nextDate.getMonth() + 1);
                      }
                    }
                    
                    // Reset to original intended time for the next occurrence
                    nextDate.setHours(sh, sm, ss, 0);
                    
                    rec.status = "pending";
                    rec.date = nextDate.toISOString();
                    rec.startMs = nextDate.getTime();
                    rec.endMs = nextDate.getTime() + (endMs - startMs);
                  } else {
                    rec.status = "completed";
                    
                    // Trigger persistent notification for WATCHDOG completion (screenshots)
                    if (notificationUserKey) {
                      const port = detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010");
                      const notifHeaders: Record<string, string> = { "Content-Type": "application/json" };
                      if (globalAuth) notifHeaders["x-watchdog-auth"] = globalAuth;
                      
                      await fetch(`http://127.0.0.1:${port}/api/notifications`, {
                        method: "POST",
                        headers: notifHeaders,
                        body: JSON.stringify({
                          username: notificationUserKey,
                          type: "success",
                          title: "Snapshot Done",
                          message: `Scheduled snapshot for ${rec.cameraName} is finished.`,
                          systemId: rec.systemId,
                          deviceId: rec.cameraId,
                          startTimeMs: startMs,
                          durationMs: 0
                        })
                      }).catch(e => console.error("[Watchdog] Notification failed:", e.message));
                    }
                  }
                }
                changed = true;
              } catch (e: any) {
                logger.error(`[Watchdog] 🛑 Snapshot exception for ${rec.cameraName}:`, e.message);
                logRecordingEvent(`Scheduled snapshot FAILED for ${rec.cameraName}: ${e.message}`, rec.scheduledBy);
                rec.status = "failed";
                rec.record = false;
                changed = true;
              }
            }
            return rec;
          }

          // ── VIDEO RECORDING: CASE 1 — Start or Retry ──────────────────────
          if (
            (rec.status === "pending" || rec.status === "failed" || rec.status === "in progress" || rec.status === "recording") &&
            now >= startMs &&
            now < endMs
          ) {
            if (rec.status === "recording" && originalSchedules[rec.id]) {
              return rec;
            }

            console.log(`[Watchdog] Starting/Retrying video recording for ${rec.cameraName} (VMS: ${ip}:${port})`);
            if (!globalAuth || !ip || ip === "localhost") {
              logger.warn(`[Watchdog] Cannot patch camera ${rec.cameraName}: VMS IP is not configured or auth is missing. (Current IP: ${ip})`);
              return rec;
            }
            try {
              const cleanId = rec.cameraId.replace(/[{}]/g, "");
              const dDate = new Date(rec.date);
              let dayOfWeek = dDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
              if (dayOfWeek === 0) dayOfWeek = 7; // Convert to 1-7 (Mon-Sun)
              
              // Calculate seconds from start of day for 'in progress' tasks
              const dNow = new Date();
              const nowSecondsOfDay = dNow.getHours() * 3600 + dNow.getMinutes() * 60 + dNow.getSeconds();
              
              let startSec = sh * 3600 + sm * 60;
              let endSec = eh * 3600 + em * 60 + 59;

              // Apply Sunday offset (-3600s) to match CameraInventory logic
              if (dayOfWeek === 7) {
                startSec -= 3600;
                endSec -= 3600;
              }

              if (rec.status === "in progress") {
                // If in-progress, start NOW and limit to at most 1 minute, 
                // but no further than the scheduled end (inclusive of the target minute's end)
                startSec = nowSecondsOfDay;
                endSec = Math.min(endSec, startSec + 60);
                
                // Update absolute endMs so CASE 2 triggers correctly at the end of this minute/window
                rec.endMs = dNow.getTime() + (endSec - startSec) * 1000;
              }

              try {
                const cam = await vmsRequest("GET", `/rest/v3/devices/${cleanId}`, null, globalAuth, ip, port);
                if (cam?.schedule) {
                  originalSchedules[rec.id] = cam.schedule;
                } else {
                  originalSchedules[rec.id] = { isEnabled: false };
                }
              } catch (e) {
                logger.debug(`[Watchdog] Could not fetch original schedule for ${rec.cameraName}:`, e);
                // Set a placeholder to prevent re-fetching/patching every 2 seconds on failure
                originalSchedules[rec.id] = originalSchedules[rec.id] || { isEnabled: false };
              }

              await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, {
                schedule: {
                  isEnabled: true,
                  tasks: [
                    {
                      startTime: startSec,
                      endTime: endSec,
                      dayOfWeek: dayOfWeek,
                      recordingType: "always",
                      streamQuality: "lowest",
                      fps: 0,
                      bitrateKbps: 0,
                      metadataTypes: "none"
                    }
                  ]
                },
              }, globalAuth, ip, port);

              // logger.debug(`[Watchdog] VMS schedule set for ${rec.cameraName} (${startSec}s → ${endSec}s, day ${dayOfWeek})`);
              logRecordingEvent(`Scheduled recording task executed for ${rec.cameraName}`, rec.scheduledBy);
              rec.status = "recording";
              rec.record = true; 
              changed = true;
            } catch (e) {
              logger.debug(`[Watchdog] Failed to start video recording:`, e);
              rec.status = "failed";
              rec.record = false;
              changed = true;
            }
            return rec;
          }

          // ── VIDEO RECORDING: CASE 2 — Stop & Complete ──────────────────────
          else if (now >= endMs && (rec.status === "recording" || rec.status === "failed" || rec.status === "in progress")) {
            logger.debug(`[Watchdog] Completing video recording for ${rec.cameraName}`);
            
            // ── IMMEDIATELY mark as "completing" to prevent re-entry on next tick ──
            // The watchdog runs every 2s. Without this guard, the async VMS PATCH
            // below would still be running when the next tick fires, causing
            // duplicate log entries and duplicate auto-save triggers.
            rec.status = "completing" as any;
            changed = true;

            if (!globalAuth) {
              console.warn(`[Watchdog] No auth/location saved — cannot revert VMS schedule for ${rec.cameraName}.`);
              rec.status = "completed"; // Still mark complete so UI updates
              logRecordingEvent(`Recording finished successfully: ${rec.cameraName}`, rec.scheduledBy);
              return rec;
            }
            try {
              const cleanId = rec.cameraId.replace(/[{}]/g, "");

              // ── Step 1: DISABLE recording immediately ──────────────────────
              // Always disable first to guarantee the camera stops NOW,
              // regardless of what the original schedule says.
              await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, {
                schedule: { isEnabled: false }
              }, globalAuth, ip, port);
              // logger.debug(`[Watchdog] Recording stopped for ${rec.cameraName}`);

              // ── Step 3: Trigger Auto-Download (Server-side) ────────────────
              // We trigger the internal download API to pull the clip and save it to disk.
              // We wait 5s to let the VMS index the new clip before trying to fetch it.
              const isTooOld = (now - endMs) > MAX_AUTOSAVE_AGE_MS;
              
              if (!isTooOld) {
                // Trigger auto-save immediately in the background
                (async () => {
                  try {
                    const port = detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010");
                    const autoSaveUrl = `http://127.0.0.1:${port}/api/cloud/recordings/download?systemId=${rec.systemId}&deviceId=${cleanId}&startTime=${rec.startMs}&endTime=${rec.endMs}&cameraName=${encodeURIComponent(rec.cameraName)}&autoSave=true`;
                    
                    // logger.debug(`[Watchdog] Triggering auto-save for ${rec.cameraName} via ${autoSaveUrl}`);
                    
                    const downloadHeaders: Record<string, string> = {};
                    if (globalAuth) downloadHeaders["x-watchdog-auth"] = globalAuth;
                    if (nxLocationIp && nxLocationIp !== "localhost" && nxLocationIp !== "null") {
                      downloadHeaders["x-nx-location-ip"] = nxLocationIp;
                    }
                    if (nxLocationPort && nxLocationPort !== "7001" && nxLocationPort !== "null") {
                      downloadHeaders["x-nx-location-port"] = nxLocationPort;
                    }

                    const downloadRes = await fetch(autoSaveUrl, {
                      headers: downloadHeaders
                    });
                    const downloadResult = await downloadRes.json();
                    if (downloadResult.success) {
                      console.log(`[Watchdog] ✅ Auto-save complete for ${rec.cameraName}: ${downloadResult.file}`);
                      
                      // Trigger persistent notification for WATCHDOG completion (videos)
                        if (notificationUserKey) {
                          const port = detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010");
                          const notifHeaders: Record<string, string> = { "Content-Type": "application/json" };
                          if (globalAuth) notifHeaders["x-watchdog-auth"] = globalAuth;

                          await fetch(`http://127.0.0.1:${port}/api/notifications`, {
                            method: "POST",
                            headers: notifHeaders,
                            body: JSON.stringify({
                              username: notificationUserKey,
                              type: "success",
                              title: "Auto-Save Done",
                              message: `Scheduled recording for ${rec.cameraName} is saved to disk.`,
                              systemId: rec.systemId,
                              deviceId: cleanId,
                              startTimeMs: rec.startMs,
                              durationMs: rec.endMs - rec.startMs
                            })
                          }).catch(e => console.error("[Watchdog] Notification failed:", e.message));
                        }
                    } else {
                      console.warn(`[Watchdog] ⚠️ Auto-save failed for ${rec.cameraName}:`, downloadResult.error || JSON.stringify(downloadResult));
                    }
                  } catch (saveErr: any) {
                    console.error(`[Watchdog] 🛑 Auto-save trigger exception for ${rec.cameraName}:`, saveErr.message);
                  }
                })();
              } else {
                // logger.debug(`[Watchdog] ⏩ Skipping auto-save for ${rec.cameraName} (Recording is too old: ${Math.round((now - endMs) / 60000)}m ago)`);
              }

              // ── Step 2: Restore original schedule (with isEnabled: false) ───────────
              // Only restore if the original had tasks (don't re-enable a blank schedule)
              const original = originalSchedules[rec.id];
              if (original) {
                // Force isEnabled: false at the end of our scheduled task
                const updatedSchedule = { ...original, isEnabled: false };
                await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, { schedule: updatedSchedule }, globalAuth, ip, port);
                // console.log(`[Watchdog] Restored original schedule (Disabled) for ${rec.cameraName}`);
              } else {
                // If no original schedule was saved, ensure tasks are cleared
                await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, { 
                  schedule: { isEnabled: false, tasks: [] } 
                }, globalAuth, ip, port);
                // console.log(`[Watchdog] Cleared temporary tasks for ${rec.cameraName}`);
              }

              delete originalSchedules[rec.id];

                if (rec.recurrence && rec.recurrence !== "none") {
                  const nextDate = new Date(rec.date);
                  if (rec.recurrence === "weekday") {
                    nextDate.setDate(nextDate.getDate() + 7);
                  } else if (rec.recurrence === "monthday") {
                    const targetDay = rec.recurrenceDay;
                    if (targetDay) {
                      let year = nextDate.getFullYear();
                      let monthIdx = nextDate.getMonth() + 1;
                      let next = new Date(year, monthIdx, targetDay);
                      while (next.getDate() !== targetDay) { monthIdx++; next = new Date(year, monthIdx, targetDay); }
                      nextDate.setTime(next.getTime());
                    } else {
                      nextDate.setMonth(nextDate.getMonth() + 1);
                    }
                  }

                  // Reset to original intended time for the next occurrence
                  nextDate.setHours(sh, sm, ss, 0);

                  rec.status = "pending";
                  rec.record = false;
                  rec.date = nextDate.toISOString();
                  rec.startMs = nextDate.getTime();
                  rec.endMs = nextDate.getTime() + (endMs - startMs);
                } else {
                rec.status = "completed";
                rec.record = false;
              }
              // Log exactly once after final status is set
              logRecordingEvent(`Recording finished successfully: ${rec.cameraName}`, rec.scheduledBy);
              changed = true;
            } catch (e: any) {
              const retryCount = (rec.stopRetryCount || 0) + 1;
              const lastRetry = rec.lastStopRetryMs || 0;
              const waitMs = 30000; // 30 seconds backoff
              
              if (now - lastRetry > waitMs) {
                if (retryCount <= 5) {
                  console.error(`[Watchdog] Stop failed (Retry ${retryCount}/5 in 30s):`, e.message);
                  logRecordingEvent(`Stop recording RETRY (${retryCount}/5) for ${rec.cameraName}: ${e.message}`, rec.scheduledBy);
                  rec.stopRetryCount = retryCount;
                  rec.lastStopRetryMs = now;
                } else {
                  console.error(`[Watchdog] Stop FAILED after 5 retries for ${rec.cameraName}:`, e.message);
                  logRecordingEvent(`Stop recording PERMANENTLY FAILED after 5 retries for ${rec.cameraName}`, rec.scheduledBy);
                  rec.status = "failed";
                  rec.stopRetryCount = 0;
                }
              }
              // Keep as "recording" so we stay in this loop until max retries
              if (rec.status !== "failed") rec.status = "recording";
              changed = true;
            }
          }


          // ── CASE 3: Missed/Expired Tasks ──────────────────────────────────
          else if (now >= endMs && rec.status === "pending") {
            // logger.debug(`[Watchdog] Marking missed task as completed/expired: ${rec.cameraName} (End was ${new Date(endMs).toLocaleString()})`);
            
            if (rec.recurrence && rec.recurrence !== "none") {
              const nextDate = new Date(rec.date);
              if (rec.recurrence === "weekday") {
                nextDate.setDate(nextDate.getDate() + 7);
              } else if (rec.recurrence === "monthday") {
                const targetDay = rec.recurrenceDay;
                if (targetDay) {
                  let year = nextDate.getFullYear();
                  let monthIdx = nextDate.getMonth() + 1;
                  let next = new Date(year, monthIdx, targetDay);
                  while (next.getDate() !== targetDay) { monthIdx++; next = new Date(year, monthIdx, targetDay); }
                  nextDate.setTime(next.getTime());
                } else {
                  nextDate.setMonth(nextDate.getMonth() + 1);
                }
              }
              nextDate.setHours(sh, sm, ss, 0);
              rec.status = "pending";
              rec.date = nextDate.toISOString();
              rec.startMs = nextDate.getTime();
              rec.endMs = nextDate.getTime() + (endMs - startMs);
            } else {
              rec.status = "completed";
            }
            changed = true;
          }

          return rec;
        })
      );

      if (changed) {
        await fs.writeFile(
          DATA_FILE,
          JSON.stringify({ 
            schedules: updatedSchedules, 
            originalSchedules, 
            globalAuth, 
            nxLocationIp, 
            nxLocationPort,
            notificationUserKey,
            appPort: detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010")
          }, null, 2)
        );
      }

    } catch (err) {
      console.error("[Watchdog] Error in loop:", err);
    } finally {
      global._nxWatchdogActive = false;
    }
  }, 2000); // Check every 2 seconds
};

// Ensure watchdog starts when this module is used
startWatchdog();

export async function GET(request: NextRequest) {
  // Capture the port from the request to help the watchdog make internal calls
  const urlPort = request.nextUrl.port;
  const hostHeader = request.headers.get("host");
  const hostPort = hostHeader?.split(":")[1];
  const detectedPort = urlPort || hostPort;
  
  if (detectedPort && detectedPort !== global._nxAppPort) {
    // logger.debug(`[Watchdog] Captured and persisting app port: ${detectedPort}`);
    global._nxAppPort = detectedPort;
    
    // Immediately persist the port to the data file
    (async () => {
      try {
        const dataStr = await fs.readFile(DATA_FILE, "utf-8").catch(() => "{}");
        const data = JSON.parse(dataStr);
        data.appPort = detectedPort;
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      } catch (e) {}
    })();
  }
  
  startWatchdog();
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return NextResponse.json(JSON.parse(data));
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
    // logger.debug(`[Watchdog] Captured app port: ${detectedPort}`);
    global._nxAppPort = detectedPort;
  }

  startWatchdog();
  try {
    const body = await request.json();

    // ── Persist auth token ────────────────────────────────────────────────────
    // The watchdog runs server-side with no browser cookies, so we capture the
    // user's session token here (at schedule-save time) and store it in the data
    // file so the watchdog can forward it when calling the screenshot API.
    let token = request.cookies.get("local_nx_user")?.value;
    if (!token) token = request.cookies.get("nx_cloud_session")?.value;

    if (token) {
      let username = "System";
      try {
        if (token.startsWith("{")) {
          const parsed = JSON.parse(token);
          token = parsed.token || parsed.accessToken || token;
          username = parsed.username || parsed.full_name || username;
        }
      } catch (e) {}
      body.globalAuth = token;
      
      // Assign 'scheduledBy' to each new or updated schedule item
      if (Array.isArray(body.schedules)) {
        body.schedules = body.schedules.map((s: any) => ({
          ...s,
          scheduledBy: s.scheduledBy || username
        }));
      }
    }

    // ── Persist NX location ───────────────────────────────────────────────────
    // Read from body (sent by frontend), fallback to cookies, or finally settings.json
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
      } catch (e) {}
    }

    nxIp = (nxIp && nxIp !== "localhost" && nxIp !== "null") ? nxIp : undefined;
    nxPort = (nxPort && nxPort !== "7001" && nxPort !== "null") ? nxPort : undefined;
    
    body.nxLocationIp = nxIp;
    body.nxLocationPort = nxPort;

    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify({
      ...body,
      notificationUserKey: body.notificationUserKey || request.cookies.get("local_nx_user")?.value || request.cookies.get("nx_cloud_session")?.value
    }, null, 2), "utf-8");

    // Log save success
    if (Array.isArray(body.schedules)) {
      // logger.debug(`[Watchdog] Persisted ${body.schedules.length} schedules to disk (VMS: ${nxIp || "Cloud Relay"})`);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
