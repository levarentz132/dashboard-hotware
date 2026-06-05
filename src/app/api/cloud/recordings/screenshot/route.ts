import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import { API_CONFIG } from "@/lib/config";
import fs from "fs";
import path from "path";
import { readAppSettings } from "@/lib/server-settings";
import { logRecordingEvent } from "@/lib/recording-logger";
import { logScheduledRecordingError } from "@/lib/log-scheduled-error";


/**
 * POST /api/cloud/recordings/screenshot
 * 
 * Captures a PNG screenshot (Live) and saves it to:
 *   data/recorded_screenshots/{YYYY-MM-DD}/{CameraName}_{YYYY-MM-DD}_{HHMMSS}_{idHash}.png
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
    const { deviceId, cameraName } = body;
    
    let systemIdRaw = body.systemId;
    if ((systemIdRaw === "127.0.0.1" || systemIdRaw === "localhost") && API_CONFIG.serverHost) {
      systemIdRaw = API_CONFIG.serverHost;
    }
    
    let systemId = systemIdRaw?.replace(/[{}]/g, "") || null;
    let systemName: string | null = null;
    if (!systemId) {
      const validated = validateSystemId(request);
      systemId = validated.systemId;
      systemName = validated.systemName;
    }

    if (!systemId || !deviceId) {
      return NextResponse.json({ error: "systemId and deviceId are required" }, { status: 400 });
    }

    const cleanDeviceId = String(deviceId).replace(/[{}]/g, "");
    const safeCameraName = (cameraName || "Camera")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .trim();

    const now = new Date();
    
    // Fetch VMS timezone offset to adjust local timestamps to VMS server time
    let timeOffsetMs = typeof body.timeOffsetMs === "number" ? body.timeOffsetMs : 0;
    if (timeOffsetMs === 0) {
      try {
        const timeUrl = buildCloudUrl(systemId, "/api/time", undefined, request);
        const timeHeaders = buildCloudHeaders(request, systemId);
        let timeRes = await fetch(timeUrl, { headers: timeHeaders });
        if (timeRes.status === 401 || timeRes.status === 403) {
          const basic = getBasicAuthHeaderFromRequest(request);
          if (basic) timeRes = await fetch(timeUrl, { headers: { ...timeHeaders, Authorization: basic } });
        }
        if (timeRes.ok) {
          const timeData = await timeRes.json();
          if (typeof timeData.offset === "number") {
            const clientOffsetMs = -new Date().getTimezoneOffset() * 60 * 1000;
            timeOffsetMs = timeData.offset - clientOffsetMs;
          }
        }
      } catch (e) {
        // fallback to 0
      }
    }

    let targetDate = body.timestampMs ? new Date(Number(body.timestampMs)) : now;
    if (timeOffsetMs !== 0) {
      targetDate = new Date(targetDate.getTime() + timeOffsetMs);
    }
    
    const YYYY = targetDate.getFullYear().toString();
    const MM = (targetDate.getMonth() + 1).toString().padStart(2, "0");
    const DD = targetDate.getDate().toString().padStart(2, "0");
    const HH = targetDate.getHours().toString().padStart(2, "0");
    const mm = targetDate.getMinutes().toString().padStart(2, "0");

    let displayHH = HH, displaymm = mm;

    // Naming files and folders based on VMS local time
    const dateFolder = `${YYYY}-${MM}-${DD}`;
    const idHash = cleanDeviceId.slice(-4).toLowerCase();
    const timestampStr = `${displayHH}${displaymm}00`;

    let screenshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
    try {
      const settings = readAppSettings();
      if (settings.storagePath) screenshotsBaseDir = String(settings.storagePath);
    } catch (e) { }

    const screenshotsDir = path.join(screenshotsBaseDir, dateFolder);
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

    const finalFileName = `${safeCameraName}_${timestampStr}_${idHash}.png`;
    const filePath = path.join(screenshotsDir, finalFileName);

    if (fs.existsSync(filePath)) {
      return NextResponse.json({
        success: true,
        filePath,
        fileName: finalFileName,
        dateFolder,
        cameraName: safeCameraName,
        sizeBytes: fs.statSync(filePath).size,
        timestamp: targetDate.toISOString(),
        skipped: true
      });
    }

    // console.log(`[screenshot] Capturing PNG for ${safeCameraName} (${cleanDeviceId}) on system ${systemId}`);

    // Pulse recording to ensure live stream is ready
    let originalSchedule = null;
    try {
      const vmsUrl = buildCloudUrl(systemId, `/rest/v3/devices/${cleanDeviceId}`, undefined, request);
      const vmsHeaders = buildCloudHeaders(request, systemId);
      let camRes = await fetch(vmsUrl, { headers: vmsHeaders });
      
      if (camRes.status === 401 || camRes.status === 403) {
        const basic = getBasicAuthHeaderFromRequest(request);
        if (basic) camRes = await fetch(vmsUrl, { headers: { ...vmsHeaders, Authorization: basic } });
      }

      if (camRes.ok) {
        const camData = await camRes.json();
        originalSchedule = camData.schedule;
        const sNow = new Date();
        const adjustedNow = timeOffsetMs !== 0 ? new Date(sNow.getTime() + timeOffsetMs) : sNow;
        const startSec = adjustedNow.getHours() * 3600 + adjustedNow.getMinutes() * 60 + adjustedNow.getSeconds();
        const endSec = startSec + 2;
        const dayOfWeek = adjustedNow.getDay();
        
        await fetch(vmsUrl, {
          method: "PATCH",
          headers: { ...vmsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule: {
              isEnabled: true,
              tasks: [{ startTime: startSec, endTime: endSec, dayOfWeek, recordingType: "always" }]
            }
          })
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fetch(vmsUrl, {
          method: "PATCH",
          headers: { ...vmsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ schedule: { isEnabled: false } })
        });
      }
    } catch (e) { }

    const params = new URLSearchParams();
    params.set("format", "png");
    params.set("stream", "0");
    params.set("_", String(Date.now()));
    params.set("roundMethod", "precise");

    const endpoint = `/rest/v3/devices/${cleanDeviceId}/image`;
    const downloadUrl = buildCloudUrl(systemId, endpoint, params, request, systemName || undefined);
    const headers: Record<string, string> = buildCloudHeaders(request, systemId);
    headers["Accept"] = "image/png, image/jpeg, image/*;q=0.9, */*;q=0.8";
    delete headers["Content-Type"];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let imageResponse;
    try {
      imageResponse = await fetch(downloadUrl, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });

      if (imageResponse.status === 401 || imageResponse.status === 403) {
        const basic = getBasicAuthHeaderFromRequest(request);
        if (basic) {
          imageResponse = await fetch(downloadUrl, {
            headers: { ...headers, Authorization: basic },
            signal: controller.signal,
          });
        }
      }
    } finally {
      clearTimeout(timeout);
      if (originalSchedule) {
        try {
          const vmsUrl = buildCloudUrl(systemId, `/rest/v3/devices/${cleanDeviceId}`, undefined, request);
          const vmsHeaders = buildCloudHeaders(request, systemId);
          await fetch(vmsUrl, {
            method: "PATCH",
            headers: { ...vmsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ schedule: { ...originalSchedule, isEnabled: false } })
          });
        } catch (e) { }
      }
    }

    if (!imageResponse.ok) {
      await logScheduledRecordingError({
        cameraId: cleanDeviceId,
        cameraName: safeCameraName,
        systemId: systemId || "",
        message: `Screenshot failed for camera ${safeCameraName}: HTTP ${imageResponse.status}`,
      });
      return NextResponse.json({ error: `Failed to capture screenshot: ${imageResponse.status}` }, { status: imageResponse.status });
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length < 100) {
      await logScheduledRecordingError({
        cameraId: cleanDeviceId,
        cameraName: safeCameraName,
        systemId: systemId || "",
        message: `Screenshot failed for camera ${safeCameraName}: invalid image`,
      });
      return NextResponse.json({ error: "Captured image is too small / invalid" }, { status: 502 });
    }

    fs.writeFileSync(filePath, buffer);
    // console.log(`[screenshot] Saved: ${filePath} (${buffer.length} bytes)`);

    // ── Send Notification ───────────────────────────────────────────────────
    const notificationUserKey = body.notificationUserKey || getNotificationUserKey(request);
    if (notificationUserKey) {
      const port = detectCurrentPort(process.env.NODE_ENV === "production" ? "3030" : "3010");
      fetch(`http://127.0.0.1:${port}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: notificationUserKey,
          type: "success",
          title: "Snapshot Captured",
          message: `Snapshot for ${safeCameraName} is complete and stored in local archive.`,
          systemId: systemId,
          deviceId: cleanDeviceId,
          startTimeMs: targetDate.getTime(),
          durationMs: 0
        })
      }).catch(err => {}); // console.error("[screenshot] Notification failed:", err));
    }

    return NextResponse.json({
      success: true,
      filePath,
      fileName: finalFileName,
      dateFolder,
      cameraName: safeCameraName,
      sizeBytes: buffer.length,
      timestamp: targetDate.toISOString(),
    });
  } catch (error: any) {
    // console.error("[screenshot] Internal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function getNotificationUserKey(request: NextRequest): string | null {
  const cloudSession = request.cookies.get("nx_cloud_session")?.value;
  if (cloudSession) {
    try {
      const parsed = JSON.parse(cloudSession);
      if (parsed.email) return parsed.email;
      if (parsed.username) return parsed.username;
    } catch (e) {}
  }
  return request.cookies.get("local_nx_user")?.value || null;
}

function detectCurrentPort(fallback: string) {
  if (process.env.PORT) return process.env.PORT;
  return fallback;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFilter = searchParams.get("date");
    let baseDir = path.join(process.cwd(), "data", "recorded_screenshots");

    if (!fs.existsSync(baseDir)) return NextResponse.json({ screenshots: [] });

    const screenshots: any[] = [];
    const dateFolders = fs.readdirSync(baseDir).filter(f => {
      const fullPath = path.join(baseDir, f);
      return fs.statSync(fullPath).isDirectory() && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(f);
    });

    for (const folder of dateFolders) {
      if (dateFilter && folder !== dateFilter) continue;
      const folderPath = path.join(baseDir, folder);
      
      const rootFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".png"));
      for (const file of rootFiles) {
        const filePath = path.join(folderPath, file);
        if (fs.statSync(filePath).isDirectory()) continue;

        const stat = fs.statSync(filePath);
        // Supports: CameraName_YYYY-MM-DD_HHMMSS_ID.png
        const match = file.match(/^(.+)_(\d{4}-\d{2}-\d{2}|\d{8})_(\d{6})(?:_[a-z0-9]+)?\.png$/);
        const cameraName = match ? match[1] : file;
        const dateStr = match ? match[2] : folder;
        const timeStr = match ? match[3] : "000000";

        screenshots.push({
          fileName: file,
          dateFolder: folder,
          cameraName,
          dateStr,
          timeStr,
          sizeBytes: stat.size,
          createdAt: stat.birthtime.toISOString(),
          url: `/api/cloud/recordings/screenshot/serve?date=${folder}&file=${encodeURIComponent(file)}`,
        });
      }

      const cameraFolders = fs.readdirSync(folderPath).filter(f => fs.statSync(path.join(folderPath, f)).isDirectory());
      for (const cameraName of cameraFolders) {
        const cameraPath = path.join(folderPath, cameraName);
        const files = fs.readdirSync(cameraPath).filter(f => f.endsWith(".png"));
        for (const file of files) {
          const filePath = path.join(cameraPath, file);
          const stat = fs.statSync(filePath);
          const timeMatch = file.match(/^(\d{6})(?:_\d+)?\.png$/);
          const timeStr = timeMatch ? timeMatch[1] : "000000";

          screenshots.push({
            fileName: file,
            dateFolder: folder,
            cameraName,
            dateStr: folder,
            timeStr,
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
            url: `/api/cloud/recordings/screenshot/serve?date=${folder}&camera=${encodeURIComponent(cameraName)}&file=${encodeURIComponent(file)}`,
          });
        }
      }
    }

    screenshots.sort((a, b) => `${b.dateStr}${b.timeStr}`.localeCompare(`${a.dateStr}${a.timeStr}`));
    return NextResponse.json({ screenshots });
  } catch (error) {
    return NextResponse.json({ error: "Failed to list screenshots" }, { status: 500 });
  }
}
