import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceIdRaw = searchParams.get("deviceId") || "";
    const deviceId = deviceIdRaw.replace(/[{}]/g, "");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!systemId || !deviceId) {
      return NextResponse.json(
        { error: "systemId and deviceId are required" },
        { status: 400 }
      );
    }

    // Build query params for recorded time periods
    const params = new URLSearchParams();
    params.set("cameraId", deviceIdRaw);
    if (startTime) params.set("startTime", startTime);
    if (endTime) params.set("endTime", endTime);
    params.set("detail", "2"); // Get detailed periods

    const cloudUrl = buildCloudUrl(systemId, "/ec2/recordedTimePeriods", params, request, systemName || undefined);
    const headers = buildCloudHeaders(request, systemId);

    let response = await fetch(cloudUrl, {
      method: "GET",
      headers,
    });

    if (response.status === 401 || response.status === 403) {
      const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
      if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: basicAuthHeader,
        };
        delete retryHeaders["x-runtime-guid"];

        console.warn("[recordings] Retrying recordedTimePeriods with Basic auth");
        response = await fetch(cloudUrl, {
          method: "GET",
          headers: retryHeaders,
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[recordings] Error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch recordings: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Log raw response for debugging
    console.log("[recordings] Raw response sample:", JSON.stringify(data).substring(0, 500));
    
    // NX API returns { reply: [{ guid: "serverId", periods: [{startTimeMs, durationMs}] }] }
    // We need to flatten all periods from all servers
    let allPeriods: any[] = [];
    
    const replyItems = Array.isArray(data) ? data : (data?.reply || []);
    
    for (const item of replyItems) {
      // Each item may have a 'periods' array (per-server response) or be a period itself
      const periods = item.periods || (item.startTimeMs ? [item] : []);
      
      for (const p of periods) {
        // Parse timestamps - they come as strings from NX API
        let startTimeMs = parseInt(p.startTimeMs || p.startTime || '0', 10);
        let durationMs = parseInt(p.durationMs || p.duration || '0', 10);
        
        // If in microseconds (> year 2100 in ms), convert to ms
        if (startTimeMs > 4102444800000) {
          startTimeMs = Math.floor(startTimeMs / 1000);
        }
        if (durationMs > 86400000000) { // 1 day in usec
          durationMs = Math.floor(durationMs / 1000);
        }
        
        allPeriods.push({
          ...p,
          startTimeMs,
          durationMs,
          serverId: item.guid || p.guid,
        });
      }
    }
    
    // 2. Fetch local screenshots from data folder (date-based folder structure)
    try {
      let screenshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
      try {
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fs.existsSync(settingsFile)) {
          const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
          if (settings.storagePath) screenshotsBaseDir = settings.storagePath;
        }
      } catch (e) { }

      if (fs.existsSync(screenshotsBaseDir)) {
        const startLimit = startTime ? parseInt(startTime, 10) : 0;
        const endLimit = endTime ? parseInt(endTime, 10) : Infinity;

        // 2a. Fetch some device info if we have a deviceId to help filter legacy screenshots
        let searchCameraName = "";
        try {
          const deviceUrl = buildCloudUrl(systemId, `/rest/v3/devices/${deviceId}`, new URLSearchParams(), request, systemName || undefined);
          const devRes = await fetch(deviceUrl, { headers });
          if (devRes.ok) {
            const devData = await devRes.json();
            searchCameraName = (devData.name || "").replace(/[<>:"/\\|?*]/g, "_").trim();
          }
        } catch (e) { }

        // Scan date-based folders (Include both legacy YYYYMMDD and new YYYY-MM-DD format)
        const dateFolders = fs.readdirSync(screenshotsBaseDir).filter(f => {
          const fullPath = path.join(screenshotsBaseDir, f);
          return fs.statSync(fullPath).isDirectory() && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(f);
        });

        for (const dateFolder of dateFolders) {
          const folderPath = path.join(screenshotsBaseDir, dateFolder);
          const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".png"));

          for (const file of files) {
            // Check for new ID-based naming first: {deviceId}__{cameraName}_{YYYYMMDD}_{HHMMSS}.png
            // Else handle legacy naming: {cameraName}_{YYYY-MM-DD}_{HHMMSS}.png
            const idSplit = file.split("__");
            if (idSplit.length > 1) {
              // This is a new format file. Does it belong to this camera?
              const fileDeviceId = idSplit[0].toLowerCase();
              if (fileDeviceId !== deviceId.toLowerCase()) continue;
            } else if (searchCameraName) {
              // Legacy format. Does it start with our camera name + underscore?
              const safeSearchName = searchCameraName.replace(/[<>:"/\\|?*]/g, "_").trim();
              if (!file.startsWith(safeSearchName + "_")) continue;
            }

            // Parse timestamp from filename
            const match = file.match(/_(\d{8}|\d{4}-\d{2}-\d{2})_(\d{6})(?:_\d+)?\.png$/);
            if (!match) continue;

            const [, , dateStr, timeStr] = match;
            // Reconstruct timestamp from the filename
            let y, m, d;
            if (dateStr.includes("-")) {
              [y, m, d] = dateStr.split("-").map(Number);
            } else {
              y = parseInt(dateStr.substring(0, 4), 10);
              m = parseInt(dateStr.substring(4, 6), 10);
              d = parseInt(dateStr.substring(6, 8), 10);
            }
            const hour = parseInt(timeStr.substring(0, 2), 10);
            const minute = parseInt(timeStr.substring(2, 4), 10);
            const second = parseInt(timeStr.substring(4, 6), 10);
            const timestamp = new Date(y, m - 1, d, hour, minute, second).getTime();

            if (timestamp >= startLimit && timestamp <= endLimit) {
              // Check if we already have a record for this exact millisecond
              const exists = allPeriods.some(p => p.startTimeMs === timestamp && p.durationMs === 0);
              if (!exists) {
                allPeriods.push({
                  startTimeMs: timestamp,
                  durationMs: 0,
                  isScreenshot: true,
                  isLocal: true,
                  serverId: "local-storage",
                  fileName: file,
                  dateFolder: dateFolder,
                });
              }
            }
          }
        }

        // Also scan legacy camera-ID based folders for backwards compatibility
        const cameraFolders = fs.readdirSync(screenshotsBaseDir).filter(f => {
          const fullPath = path.join(screenshotsBaseDir, f);
          return fs.statSync(fullPath).isDirectory() && !/^\d{8}$/.test(f);
        });

        for (const camFolder of cameraFolders) {
          // Only include if this folder matches the requested device
          if (deviceId && camFolder !== deviceId) continue;
          const folderPath = path.join(screenshotsBaseDir, camFolder);
          const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".png"));

          for (const file of files) {
            const timestamp = parseInt(file.replace(".png", ""), 10);
            if (isNaN(timestamp)) continue;

            if (timestamp >= startLimit && timestamp <= endLimit) {
              const exists = allPeriods.some(p => p.startTimeMs === timestamp && p.durationMs === 0);
              if (!exists) {
                allPeriods.push({
                  startTimeMs: timestamp,
                  durationMs: 0,
                  isScreenshot: true,
                  isLocal: true,
                  serverId: "local-storage",
                });
              }
            }
          }
        }

        // Sort by start time descending (newest first)
        allPeriods.sort((a, b) => b.startTimeMs - a.startTimeMs);
      }
    } catch (err) {
      console.warn("[recordings] Failed to scan local screenshots:", err);
    }
    
    return NextResponse.json(allPeriods);
  } catch (error) {
    console.error("[recordings] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
