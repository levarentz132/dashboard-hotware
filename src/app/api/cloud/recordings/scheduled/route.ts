import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";


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
      console.error(`[Watchdog] VMS ${method} ${url} failed with status ${res.status}: ${text}`);
      throw new Error(`VMS ${res.status}: ${text}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  } catch (err: any) {
    console.error(`[Watchdog] Network error for VMS ${method} ${url}:`, err.message);
    throw err;
  }
}

const DATA_FILE = path.join(process.cwd(), "data", "scheduled_recordings.json");

// Background Watchdog (In-memory for the server session)
declare global {
  var _nxWatchdogInterval: NodeJS.Timeout | undefined;
  var _nxWatchdogActive: boolean | undefined;
}

const startWatchdog = () => {
  if (global._nxWatchdogActive) return;
  
  if (global._nxWatchdogInterval) {
    clearInterval(global._nxWatchdogInterval);
  }

  console.log("[Watchdog] Initializing background monitor (V3)...");
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
        notificationUserKey = null
      } = parsed;
      
      // Safety: Ensure we don't have literal "null" or empty strings
      const ip = nxLocationIp && nxLocationIp !== "null" ? nxLocationIp : "localhost";
      const port = nxLocationPort && nxLocationPort !== "null" ? nxLocationPort : "7001";
      let changed = false;

      const now = Date.now();


      const updatedSchedules = await Promise.all(
        schedules.map(async (rec: any) => {
          // Skip permanently finished tasks
          if (rec.status === "completed") return rec;

          // Calculate start/end times in MS
          const [sh, sm] = rec.startTime.split(":").map(Number);
          const [eh, em] = (rec.endTime || rec.startTime).split(":").map(Number);
          // Determine absolute start/end times
          // Primary: use absolute timestamps passed from frontend (no timezone issues)
          // Fallback: calculate using server's local time (only for legacy entries)
          const startMs = rec.startMs || new Date(rec.date).setHours(sh, sm, 0, 0);
          const endMs = rec.endMs || new Date(rec.date).setHours(eh, em, 59, 999);

          // ── SCREENSHOT FAST PATH ─────────────────────────────────────────────
          if (rec.type === "screenshot") {
            const catchUpWindowMs = 2 * 60 * 1000; // 2 minutes
            const isWithinWindow = now >= startMs && now < startMs + catchUpWindowMs;

            if ((rec.status === "pending" || rec.status === "failed" || rec.status === "in progress") && isWithinWindow) {
              console.log(`[Watchdog] 📸 Firing snapshot for ${rec.cameraName} (Scheduled: ${rec.startTime}, Now: ${new Date().toLocaleTimeString()})`);
              try {
                const port = process.env.PORT || "3146";
                const internalUrl = `http://127.0.0.1:${port}/api/cloud/recordings/screenshot`;

                const screenshotHeaders: Record<string, string> = {
                  "Content-Type": "application/json",
                };
                if (globalAuth) screenshotHeaders["x-watchdog-auth"] = globalAuth;
                if (nxLocationIp) screenshotHeaders["x-nx-location-ip"] = nxLocationIp;
                if (nxLocationPort) screenshotHeaders["x-nx-location-port"] = nxLocationPort;

                console.log(`[Watchdog] Internal POST to ${internalUrl} for ${rec.cameraName}`);
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
                  console.error(`[Watchdog] ❌ Snapshot API failed (${screenshotRes.status}): ${errText}`);
                  rec.status = "failed";
                  rec.record = false;
                } else {
                  const result = await screenshotRes.json();
                  console.log(`[Watchdog] ✅ Snapshot saved for ${rec.cameraName}: ${result.fileName}`);
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
                        next.setHours(sh, sm, 0, 0);
                        nextDate.setTime(next.getTime());
                      } else {
                        nextDate.setMonth(nextDate.getMonth() + 1);
                      }
                    }
                    rec.status = "pending";
                    rec.date = nextDate.toISOString();
                    rec.startMs = nextDate.getTime();
                    rec.endMs = nextDate.getTime() + (endMs - startMs);
                  } else {
                    rec.status = "completed";
                    
                    // Trigger persistent notification for WATCHDOG completion (screenshots)
                    if (notificationUserKey) {
                      const port = process.env.PORT || "3146";
                      await fetch(`http://127.0.0.1:${port}/api/notifications`, {
                        method: "POST",
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
              } catch (e) {
                console.error(`[Watchdog] 🛑 Snapshot exception for ${rec.cameraName}:`, e);
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

            console.log(`[Watchdog] Starting/Retrying video recording for ${rec.cameraName}`);
            if (!globalAuth) {
              console.warn(`[Watchdog] No auth/location saved — cannot update VMS for ${rec.cameraName}.`);
              return rec;
            }
            try {
              const cleanId = rec.cameraId.replace(/[{}]/g, "");
              const dayOfWeek = new Date(rec.date).getDay();
              
              // Calculate seconds from start of day for 'in progress' tasks
              const dNow = new Date();
              const nowSecondsOfDay = dNow.getHours() * 3600 + dNow.getMinutes() * 60 + dNow.getSeconds();
              
              let startSec = sh * 3600 + sm * 60;
              let endSec = eh * 3600 + em * 60 + 59;

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
                if (cam?.schedule) originalSchedules[rec.id] = cam.schedule;
              } catch (e) {
                console.warn(`[Watchdog] Could not fetch original schedule for ${rec.cameraName}:`, e);
              }

              await vmsRequest("PATCH", `/rest/v4/devices/${cleanId}`, {
                schedule: {
                  isEnabled: true,
                },
              }, globalAuth, ip, port);

              console.log(`[Watchdog] VMS schedule set for ${rec.cameraName} (${startSec}s → ${endSec}s, day ${dayOfWeek})`);
              rec.status = "recording";
              rec.record = true; 
              changed = true;
            } catch (e) {
              console.error(`[Watchdog] Failed to start video recording:`, e);
              rec.status = "failed";
              rec.record = false;
              changed = true;
            }
            return rec;
          }

          // ── VIDEO RECORDING: CASE 2 — Stop & Complete ──────────────────────
          else if (now >= endMs && (rec.status === "recording" || rec.status === "failed" || rec.status === "in progress")) {
            console.log(`[Watchdog] Completing video recording for ${rec.cameraName}`);
            if (!globalAuth) {
              console.warn(`[Watchdog] No auth/location saved — cannot revert VMS schedule for ${rec.cameraName}.`);
              rec.status = "completed"; // Still mark complete so UI updates
              changed = true;
              return rec;
            }
            try {
              const cleanId = rec.cameraId.replace(/[{}]/g, "");

              // ── Step 1: DISABLE recording immediately ──────────────────────
              // Always disable first to guarantee the camera stops NOW,
              // regardless of what the original schedule says.
              await vmsRequest("PATCH", `/rest/v4/devices/${cleanId}`, {
                schedule: { isEnabled: false }
              }, globalAuth, ip, port);
              console.log(`[Watchdog] Recording stopped for ${rec.cameraName}`);

              // ── Step 2: Restore original schedule (with isEnabled: false) ───────────
              // Only restore if the original had tasks (don't re-enable a blank schedule)
              const original = originalSchedules[rec.id];
              if (original) {
                // Force isEnabled: false at the end of our scheduled task
                const updatedSchedule = { ...original, isEnabled: false };
                await vmsRequest("PATCH", `/rest/v3/devices/${cleanId}`, { schedule: updatedSchedule }, globalAuth, ip, port);
                console.log(`[Watchdog] Restored original schedule (Disabled) for ${rec.cameraName}`);
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
                    next.setHours(sh, sm, 0, 0);
                    nextDate.setTime(next.getTime());
                  } else {
                    nextDate.setMonth(nextDate.getMonth() + 1);
                  }
                }
                rec.status = "pending";
                rec.record = false;
                rec.date = nextDate.toISOString();
              } else {
                rec.status = "completed";
                rec.record = false;
              }
              changed = true;
            } catch (e) {
              // Keep as "recording" so the next watchdog tick retries the stop.
              // Do NOT set to "failed" — that would leave the camera recording indefinitely.
              console.error(`[Watchdog] Stop failed (will retry in 10s):`, e);
              rec.status = "recording";
              changed = true;
            }
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
            notificationUserKey 
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

export async function GET() {
  startWatchdog();
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (e) {
    return NextResponse.json({ schedules: [], originalSchedules: {} });
  }
}

export async function POST(request: NextRequest) {
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
      try {
        if (token.startsWith("{")) {
          const parsed = JSON.parse(token);
          token = parsed.token || parsed.accessToken || token;
        }
      } catch (e) {}
      body.globalAuth = token;
    }

    // ── Persist NX location ───────────────────────────────────────────────────
    // Read from body (sent by frontend), fallback to cookies, or finally default to localhost:7001
    const nxIp = body.nxLocationIp || request.cookies.get("nx_location_ip")?.value || "localhost";
    const nxPort = body.nxLocationPort || request.cookies.get("nx_location_port")?.value || "7001";
    body.nxLocationIp = nxIp;
    body.nxLocationPort = nxPort;

    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify({
      ...body,
      notificationUserKey: body.notificationUserKey || request.cookies.get("local_nx_user")?.value || request.cookies.get("nx_cloud_session")?.value
    }, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
