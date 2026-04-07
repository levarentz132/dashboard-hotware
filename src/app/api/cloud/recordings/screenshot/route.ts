import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import { API_CONFIG } from "@/lib/config";
import fs from "fs";
import path from "path";

/**
 * POST /api/cloud/recordings/screenshot
 * 
 * Captures a PNG screenshot (Live or Archived) and saves it to:
 *   data/recorded_screenshots/{YYYY-MM-DD}/{deviceId}__{cameraName}_{YYYYMMDD}_{HHMMSS}.png
 *
 * Body: { systemId, deviceId, cameraName, timestampMs? }
 * Returns: { success: true, filePath, fileName, dateFolder }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, cameraName } = body;
    
    // systemId comes from POST body; fall back to query params / headers
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
      return NextResponse.json(
        { error: "systemId and deviceId are required" },
        { status: 400 }
      );
    }

    const cleanDeviceId = String(deviceId).replace(/[{}]/g, "");
    const safeCameraName = (cameraName || "Camera")
      .replace(/[<>:"/\\|?*]/g, "_")   // Remove filesystem-illegal chars
      .replace(/\s+/g, " ")             // Normalize whitespace
      .trim();

    console.log(`[screenshot] Capturing PNG for ${safeCameraName} (${cleanDeviceId}) on system ${systemId}`);

    // ---- 1. (Optional) Wake up camera with a brief recording trigger ----
    // We briefly patch the schedule to "Always" for today to ensure a live stream is pushed.
    let originalSchedule = null;
    try {
      const vmsUrl = buildCloudUrl(systemId, `/rest/v3/devices/${cleanDeviceId}`, undefined, request);
      const vmsHeaders = buildCloudHeaders(request, systemId);
      
      console.log(`[screenshot] Waking up camera via brief recording trigger on ${vmsUrl}`);
      
      // Get current schedule to restore it later
      let camRes = await fetch(vmsUrl, { headers: vmsHeaders });
      
      // Retry with Basic auth if needed
      if (camRes.status === 401 || camRes.status === 403) {
        const basic = getBasicAuthHeaderFromRequest(request);
        if (basic) {
          camRes = await fetch(vmsUrl, { headers: { ...vmsHeaders, Authorization: basic } });
        }
      }

      if (camRes.ok) {
        const camData = await camRes.json();
        originalSchedule = camData.schedule;
        
        const now = new Date();
        const startSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const endSec = startSec + 5; // 5s pulse covering the current moment for reliable Live capture
        const dayOfWeek = now.getDay();
        
        console.log(`[screenshot] Enabling recording for 5s pulse...`);
        let startPulseRes = await fetch(vmsUrl, {
          method: "PATCH",
          headers: { ...vmsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule: {
              isEnabled: true,
              tasks: [{ startTime: startSec, endTime: endSec, dayOfWeek, recordingType: "always" }]
            }
          })
        });

        if (startPulseRes.status === 401 || startPulseRes.status === 403) {
           const basic = getBasicAuthHeaderFromRequest(request);
           if (basic) {
             startPulseRes = await fetch(vmsUrl, {
               method: "PATCH",
               headers: { ...vmsHeaders, "Content-Type": "application/json", Authorization: basic },
               body: JSON.stringify({
                 schedule: {
                   isEnabled: true,
                   tasks: [{ startTime: startSec, endTime: endSec, dayOfWeek, recordingType: "always" }]
                 }
               })
             });
           }
        }
        
        // Wait 3s to ensure the camera is active and the VMS has started the recording task
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log(`[screenshot] Disabling recording after 1s pulse...`);
        let stopPulseRes = await fetch(vmsUrl, {
          method: "PATCH",
          headers: { ...vmsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule: { isEnabled: false }
          })
        });

        if (stopPulseRes.status === 401 || stopPulseRes.status === 403) {
           const basic = getBasicAuthHeaderFromRequest(request);
           if (basic) {
             stopPulseRes = await fetch(vmsUrl, {
               method: "PATCH",
               headers: { ...vmsHeaders, "Content-Type": "application/json", Authorization: basic },
               body: JSON.stringify({
                 schedule: { isEnabled: false }
               })
             });
           }
        }
      }
    } catch (e) {
      console.warn("[screenshot] Wake-up pulse failed (continuing with best-effort capture):", e);
    }

    // ---- 2. Fetch the live frame from VMS as PNG ----
    const params = new URLSearchParams();
    params.set("format", "png");
    params.set("stream", "0"); // Force High Quality (Primary)
    const endpoint = `/rest/v3/devices/${cleanDeviceId}/image`;
    
    // Always use Live frame for capture to ensure 100% success rate, 
    // but the pulse ensures the thumbnail index at HH:MM:00 is updated.
    params.set("_", String(Date.now()));
    params.set("roundMethod", "precise");
    if (body.scheduledStartTime) {
      console.log(`[screenshot] Capturing fresh frame following ${body.scheduledStartTime}:00 pulse.`);
    }

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

      // Retry with Basic auth if needed
      if (imageResponse.status === 401 || imageResponse.status === 403) {
        const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
        if (basicAuthHeader) {
          const retryHeaders: Record<string, string> = {
            ...headers,
            Authorization: basicAuthHeader,
          };
          delete retryHeaders["x-runtime-guid"];
          console.warn("[screenshot] Retrying with Basic auth");
          imageResponse = await fetch(downloadUrl, {
            headers: retryHeaders,
            signal: controller.signal,
          });
        }
      }
    } finally {
      clearTimeout(timeout);
      
      // Restore original schedule immediately after capture attempt (Success or Failure)
      if (originalSchedule) {
        try {
          const nxIp = request.headers.get("x-nx-location-ip") || request.cookies.get("nx_location_ip")?.value;
          const nxPort = request.headers.get("x-nx-location-port") || request.cookies.get("nx_location_port")?.value || "7001";
          const vmsUrl = `https://${nxIp}:${nxPort}/rest/v3/devices/${cleanDeviceId}`;
          const vmsHeaders = buildCloudHeaders(request, systemId);
          
          console.log(`[screenshot] Restoring original schedule (with isEnabled: false) for ${cleanDeviceId}`);
          await fetch(vmsUrl, {
            method: "PATCH",
            headers: { ...vmsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ 
              schedule: { ...originalSchedule, isEnabled: false } 
            })
          });
        } catch (e) {
          console.warn("[screenshot] Schedule restoration failed:", e);
        }
      }
    }

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error(`[screenshot] Image fetch failed: ${imageResponse.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to capture screenshot: ${imageResponse.status}` },
        { status: imageResponse.status }
      );
    }

    // ---- 2. Get the image buffer ----
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length < 100) {
      console.error(`[screenshot] Image too small (${buffer.length} bytes), likely invalid`);
      return NextResponse.json(
        { error: "Captured image is too small / invalid" },
        { status: 502 }
      );
    }

    // ---- 3. Build file path using device clock (server-side time) ----
    const now = new Date();
    // If timestampMs provided, use it for the filename date/time
    const targetDate = body.timestampMs ? new Date(Number(body.timestampMs)) : now;
    
    const YYYY = targetDate.getFullYear().toString();
    const MM = (targetDate.getMonth() + 1).toString().padStart(2, "0");
    const DD = targetDate.getDate().toString().padStart(2, "0");
    const HH = targetDate.getHours().toString().padStart(2, "0");
    const mm = targetDate.getMinutes().toString().padStart(2, "0");
    const SS = targetDate.getSeconds().toString().padStart(2, "0");

    // Overwrite with scheduled time if provided (to match exact user-set time in UI)
    let displayHH = HH;
    let displaymm = mm;
    let displaySS = SS;
    if (body.scheduledStartTime) {
      const parts = body.scheduledStartTime.split(":");
      if (parts.length >= 2) {
        displayHH = parts[0].padStart(2, "0");
        displaymm = parts[1].padStart(2, "0");
        displaySS = "00"; // Snapshots usually start at the exact minute mark
      }
    }

    const dateFolder = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
    const fileDateStr = `${YYYY}${MM}${DD}`; // Compact format
    const baseFileName = `${cleanDeviceId}__${safeCameraName}_${fileDateStr}_${displayHH}${displaymm}${displaySS}`;

    // ---- Get Custom Storage Path ----
    let screenshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
    try {
      const settingsFile = path.join(process.cwd(), "data", "settings.json");
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
        if (settings.storagePath) screenshotsBaseDir = settings.storagePath;
      }
    } catch (e) { }

    const screenshotsDir = path.join(screenshotsBaseDir, dateFolder);
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // ---- 4. Collision detection: append _N if file already exists ----
    let finalFileName = `${baseFileName}.png`;
    let filePath = path.join(screenshotsDir, finalFileName);
    let counter = 1;
    while (fs.existsSync(filePath)) {
      finalFileName = `${baseFileName}_${counter}.png`;
      filePath = path.join(screenshotsDir, finalFileName);
      counter++;
    }

    // ---- 5. Write the PNG file ----
    fs.writeFileSync(filePath, buffer);
    console.log(`[screenshot] Saved: ${filePath} (${buffer.length} bytes)`);

    return NextResponse.json({
      success: true,
      filePath: filePath,
      fileName: finalFileName,
      dateFolder: dateFolder,
      sizeBytes: buffer.length,
      timestamp: targetDate.toISOString(),
    });
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      console.error("[screenshot] Capture timed out");
      return NextResponse.json(
        { error: "Screenshot capture timed out" },
        { status: 504 }
      );
    }
    console.error("[screenshot] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error during screenshot capture" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cloud/recordings/screenshot
 * 
 * Lists all saved screenshots, organized by date folder.
 * Optional query: ?date=YYYY-MM-DD to filter by specific date
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFilter = searchParams.get("date");

    const baseDir = path.join(process.cwd(), "data", "recorded_screenshots");
    if (!fs.existsSync(baseDir)) {
      return NextResponse.json({ screenshots: [] });
    }

    const screenshots: any[] = [];
    const dateFolders = fs.readdirSync(baseDir).filter(f => {
      const fullPath = path.join(baseDir, f);
      // Include both legacy YYYYMMDD and new YYYY-MM-DD formats
      return fs.statSync(fullPath).isDirectory() && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(f);
    });

    for (const folder of dateFolders) {
      if (dateFilter && folder !== dateFilter) continue;

      const folderPath = path.join(baseDir, folder);
      const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".png"));

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stat = fs.statSync(filePath);

        // Parse camera name and timestamp from filename: CameraName_YYYY-MM-DD_HHMMSS.png or CameraName_YYYYMMDD_HHMMSS.png
        const match = file.match(/^(.+?)_(\d{8}|\d{4}-\d{2}-\d{2})_(\d{6})(?:_\d+)?\.png$/);
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
    }

    // Sort by date + time descending
    screenshots.sort((a, b) => {
      const aKey = `${a.dateStr}${a.timeStr}`;
      const bKey = `${b.dateStr}${b.timeStr}`;
      return bKey.localeCompare(aKey);
    });

    return NextResponse.json({ screenshots });
  } catch (error) {
    console.error("[screenshot] List error:", error);
    return NextResponse.json({ error: "Failed to list screenshots" }, { status: 500 });
  }
}
