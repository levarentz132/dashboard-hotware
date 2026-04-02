import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import nxAPI from "@/lib/nxapi";

const DATA_FILE = path.join(process.cwd(), "data", "scheduled_recordings.json");

// Background Watchdog (In-memory for the server session)
let isWatchdogLoopActive = false;

const startWatchdog = () => {
  console.log("[Recording Watchdog] Initialized background monitor.");
  
  setInterval(async () => {
    if (isWatchdogLoopActive) return;
    isWatchdogLoopActive = true;

    try {
      const dataStr = await fs.readFile(DATA_FILE, "utf-8").catch(() => JSON.stringify({ schedules: [], originalSchedules: {} }));
      const parsed = JSON.parse(dataStr);
      let { schedules = [], originalSchedules = {} } = parsed;
      let changed = false;
      const now = Date.now();

      const updatedSchedules = await Promise.all(schedules.map(async (rec: any) => {
        // Only ignore terminal statuses
        if (rec.status === "completed" || rec.status === "failed") return rec;

        // Calculate start/end times in MS
        const [sh, sm] = rec.startTime.split(":").map(Number);
        const [eh, em] = (rec.endTime || rec.startTime).split(":").map(Number);
        const date = new Date(rec.date);
        const startMs = date.setHours(sh, sm, 0, 0);
        // For snapshots, we use a 1-second video burst recording.
        const endMs = rec.type === "screenshot" ? startMs + 1000 : date.setHours(eh, em, 59, 999);

        // CASE 1: Transition Pending -> Screenshot/Recording
        if (rec.status === "pending" && now >= startMs && now < endMs) {
          // Both screenshots and videos now use the VMS recording method
          console.log(`[Watchdog] Starting ${rec.type} recording for ${rec.cameraName}`);
          try {
            const dayOfWeek = new Date(rec.date).getDay();
            const startSec = sh * 3600 + sm * 60;
            const endSec = rec.type === "screenshot" ? startSec + 1 : eh * 3600 + em * 60 + 59;

            if (rec.systemId) nxAPI.setSystemId(rec.systemId);
            await nxAPI.updateDevice(rec.cameraId, {
              schedule: { isEnabled: true, tasks: [{ startTime: startSec, endTime: endSec, dayOfWeek, recordingType: "always" }] }
            });

            // Capture the original schedule for revert later
            try {
              const cam = await nxAPI.getCameraById(rec.cameraId);
              if (cam?.schedule) {
                originalSchedules[rec.id] = cam.schedule;
              }
            } catch (e) { }

            rec.status = "recording";
            changed = true;
          } catch (e) {
            console.error(`[Watchdog] Failed to start:`, e);
            rec.status = "failed";
            changed = true;
          }
          return rec;
        }

        // CASE 2: Transition Recording -> Completed (Video Only)
        else if (rec.status === "recording" && now >= endMs) {
          console.log(`[Watchdog] Completing ${rec.type} for ${rec.cameraName}`);
          try {
            if (rec.type === "screenshot") {
              // Trigger a PNG capture at the start timestamp of this segment
              try {
                const port = process.env.PORT || "3139";
                await fetch(`http://localhost:${port}/api/cloud/recordings/screenshot`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    systemId: rec.systemId,
                    deviceId: rec.cameraId,
                    cameraName: rec.cameraName,
                    timestampMs: startMs,
                  }),
                });
              } catch (e) {
                console.error(`[Watchdog] Snapshot save failed:`, e);
              }
            }

            if (rec.systemId) nxAPI.setSystemId(rec.systemId);
            const original = originalSchedules[rec.id];
            if (original) await nxAPI.updateDevice(rec.cameraId, { schedule: original });
            else await nxAPI.updateDevice(rec.cameraId, { schedule: { isEnabled: false, tasks: [] } });
            
            if (rec.recurrence && rec.recurrence !== "none") {
              const nextDate = new Date(rec.date);
              if (rec.recurrence === "weekday") nextDate.setDate(nextDate.getDate() + 7);
              else if (rec.recurrence === "monthday") {
                const targetDay = rec.recurrenceDay;
                if (targetDay) {
                  let year = nextDate.getFullYear();
                  let monthIdx = nextDate.getMonth() + 1;
                  let next = new Date(year, monthIdx, targetDay);
                  while (next.getDate() !== targetDay) { monthIdx++; next = new Date(year, monthIdx, targetDay); }
                  next.setHours(sh, sm, 0, 0);
                  nextDate.setTime(next.getTime());
                } else nextDate.setMonth(nextDate.getMonth() + 1);
              }
              rec.status = "pending";
              rec.date = nextDate.toISOString();
            } else {
              rec.status = "completed";
            }
            changed = true;
          } catch (e) {
            console.error(`[Watchdog] Task complete failed:`, e);
            rec.status = "failed";
            changed = true;
          }
        }

        // CASE 3: Cleanup stale "in progress" or "recording" from the past
        else if ((rec.status === "in progress" || rec.status === "recording") && now > endMs + 3600000) {
          // If a task is more than an hour past its end but still marked active, mark it failed.
          console.log(`[Watchdog] Cleaning up stale task ${rec.id}`);
          rec.status = "failed";
          changed = true;
        }

        return rec;
      }));

      if (changed) {
        await fs.writeFile(DATA_FILE, JSON.stringify({ schedules: updatedSchedules, originalSchedules }, null, 2));
      }
    } catch (e) {
      console.error("[Watchdog] Error in loop:", e);
    } finally {
      isWatchdogLoopActive = false;
    }
  }, 10000); // Check every 10 seconds
};


// Ensure watchdog starts when this module is used
startWatchdog();

export async function GET() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (e) {
    return NextResponse.json({ schedules: [], originalSchedules: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
