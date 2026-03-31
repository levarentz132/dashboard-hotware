import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import nxAPI from "@/lib/nxapi";

const DATA_FILE = path.join(process.cwd(), "data", "scheduled_recordings.json");

// Background Watchdog (In-memory for the server session)
let isWatchdogRunning = false;
const startWatchdog = () => {
  if (isWatchdogRunning) return;
  isWatchdogRunning = true;
  console.log("[Recording Watchdog] Initialized background monitor.");
  
  setInterval(async () => {
    try {
      const dataStr = await fs.readFile(DATA_FILE, "utf-8").catch(() => "[]");
      const { schedules = [], originalSchedules = {} } = JSON.parse(dataStr);
      let changed = false;
      const now = Date.now();

      const newSchedules: any[] = [];
      const updatedSchedules = await Promise.all(schedules.map(async (rec: any) => {
        // Calculate start/end times in MS
        const [sh, sm] = rec.startTime.split(":").map(Number);
        const [eh, em] = rec.endTime.split(":").map(Number);
        const date = new Date(rec.date);
        const startMs = date.setHours(sh, sm, 0, 0);
        const endMs = rec.type === "screenshot" ? startMs + 15000 : date.setHours(eh, em, 59, 999);

        // CASE 1: Transition Pending -> Recording / In Progress
        if (rec.status === "pending" && now >= startMs && now < endMs) {
          console.log(`[Watchdog] Starting task for ${rec.cameraName} (${rec.type})`);
          try {
            const dayOfWeek = new Date(rec.date).getDay();
            const startSec = sh * 3600 + sm * 60;
            const endSec = eh * 3600 + em * 60 + 59;

            if (rec.systemId) nxAPI.setSystemId(rec.systemId);
            await nxAPI.updateDevice(rec.cameraId, {
              schedule: {
                isEnabled: true,
                tasks: [{ startTime: startSec, endTime: endSec, dayOfWeek, recordingType: "always", metadataTypes: "none", streamQuality: "high", fps: 15 }]
              }
            });
            // Update: Use 'in progress' for screenshots, 'recording' for video
            rec.status = rec.type === "screenshot" ? "in progress" : "recording";
            changed = true;
          } catch (e) {
            console.error(`[Watchdog] Failed to start:`, e);
            rec.status = "failed";
            changed = true;
          }
        }

        // CASE 2: Transition Recording / In Progress -> Completed
        if ((rec.status === "recording" || rec.status === "in progress") && now >= endMs) {
          console.log(`[Watchdog] Completing task for ${rec.cameraName}`);
          try {
            if (rec.systemId) nxAPI.setSystemId(rec.systemId);
            const original = originalSchedules[rec.id];
            if (original) await nxAPI.updateDevice(rec.cameraId, { schedule: original });
            else await nxAPI.updateDevice(rec.cameraId, { schedule: { isEnabled: false, tasks: [] } });
            
            // Handle RECURRENCE: Roll over instead of marking completed + adding news
            if (rec.recurrence && rec.recurrence !== "none") {
              console.log(`[Watchdog] Rolling over recurring task for ${rec.cameraName}`);
              const nextDate = new Date(rec.date);
              if (rec.recurrence === "weekday") {
                nextDate.setDate(nextDate.getDate() + 7);
              } else if (rec.recurrence === "monthday") {
                const targetDay = rec.recurrenceDay;
                if (targetDay) {
                  let year = nextDate.getFullYear();
                  let monthIdx = nextDate.getMonth() + 1;
                  let next = new Date(year, monthIdx, targetDay);
                  while (next.getDate() !== targetDay) {
                    monthIdx++;
                    next = new Date(year, monthIdx, targetDay);
                  }
                  next.setHours(nextDate.getHours(), nextDate.getMinutes(), 0, 0);
                  nextDate.setTime(next.getTime());
                } else {
                  nextDate.setMonth(nextDate.getMonth() + 1);
                }
              }
              rec.status = "pending";
              rec.date = nextDate.toISOString();
              changed = true;
            } else {
              rec.status = "completed";
              changed = true;
            }
          } catch (e) {
            console.error(`[Watchdog] Failed to complete:`, e);
            rec.status = "failed";
            changed = true;
          }
        }

        return rec;
      }));

      if (changed || newSchedules.length > 0) {
        await fs.writeFile(DATA_FILE, JSON.stringify({ schedules: [...updatedSchedules, ...newSchedules], originalSchedules }, null, 2));
      }
    } catch (e) {
      // Periodic check failed, will retry next interval
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
