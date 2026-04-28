import logger from "@/lib/logger";
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

    let responseData: any = { reply: [] };
    try {
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

          logger.warn("[recordings] Retrying recordedTimePeriods with Basic auth");
          response = await fetch(cloudUrl, {
            method: "GET",
            headers: retryHeaders,
          });
        }
      }

      if (response.ok) {
        responseData = await response.json();
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        // logger.warn(`[recordings] Nx API returned ${response.status} (likely recording disabled on NVR). Proceeding with local scan.`, errorText);
      }
    } catch (err: any) {
      // logger.warn("[recordings] Nx API fetch failed. Proceeding with local scan only.", err.message);
    }
    
    // Use responseData instead of data
    const data = responseData;
    
    // logger.debug("[recordings] Raw response sample:", JSON.stringify(data).substring(0, 500));
    
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
    
    // 2. Fetch local files from data folders (date-based folder structure)
    try {
      const defaultDir = path.join(process.cwd(), "data", "recorded_screenshots");
      const baseDirs = new Set<string>([defaultDir]);

      try {
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fs.existsSync(settingsFile)) {
          const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
          if (settings.storagePath) baseDirs.add(settings.storagePath);
          if (settings.videoStoragePath) baseDirs.add(settings.videoStoragePath);
        }
      } catch (e) { }

      for (const screenshotsBaseDir of baseDirs) {

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
          
          // --- 1. Scan Flat Files (directly in dateFolder) ---
           // This handles both new format (CameraName_HHmmss) and legacy formats
           const folderFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".png") || f.endsWith(".mp4"));
 
           for (const file of folderFiles) {
             const filePath = path.join(folderPath, file);
             if (fs.statSync(filePath).isDirectory()) continue;
 
             let isMatch = false;
             let timeStr = "";
             let foundCameraName = "";
 
             // Pattern A: New simplified format {CameraName}_{HHmmss}.png
             const simpleMatch = file.match(/^(.+)_(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
             if (simpleMatch) {
                foundCameraName = simpleMatch[1];
                timeStr = simpleMatch[2];
                // Check if this camera name matches our target
                const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim();
                if (foundCameraName.toLowerCase() === safeTarget.toLowerCase() || 
                    foundCameraName.toLowerCase() === deviceId.toLowerCase()) {
                  isMatch = true;
                }
             }
 
             // Pattern B: Legacy ID format {deviceId}__{cameraName}_{YYYYMMDD}_{HHMMSS}.png
             if (!isMatch) {
               const idSplit = file.split("__");
               if (idSplit.length > 1) {
                 if (idSplit[0].toLowerCase() === deviceId.toLowerCase()) {
                   isMatch = true;
                   const timeParts = file.match(/_(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
                   if (timeParts) timeStr = timeParts[1];
                 }
               }
             }
 
             // Pattern C: Legacy Name format {cameraName}_{YYYY-MM-DD}_{HHMMSS}.png
             if (!isMatch && searchCameraName) {
                const safeSearchName = searchCameraName.replace(/[<>:"/\\|?*]/g, "_").trim();
                if (file.startsWith(safeSearchName + "_")) {
                   isMatch = true;
                   const timeParts = file.match(/_(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
                   if (timeParts) timeStr = timeParts[1];
                }
             }
 
             if (!isMatch || !timeStr) continue;
 
             const [y, m, d] = dateFolder.includes("-") ? dateFolder.split("-").map(Number) : [parseInt(dateFolder.substring(0,4)), parseInt(dateFolder.substring(4,6)), parseInt(dateFolder.substring(6,8))];
             const hour = parseInt(timeStr.substring(0, 2), 10);
             const minute = parseInt(timeStr.substring(2, 4), 10);
             const second = parseInt(timeStr.substring(4, 6), 10);
             // For scheduled PNG snapshots, round down seconds to :00 so the display time
             // matches the user-set schedule time (e.g. 10:07:03 -> 10:07:00)
             const isScheduledPng = file.endsWith(".png");
             const displaySecond = isScheduledPng ? 0 : second;
             const timestamp = new Date(y, m - 1, d, hour, minute, displaySecond).getTime();
 
             if (timestamp >= startLimit && timestamp <= endLimit) {
              const isVideo = file.endsWith(".mp4");
              const stats = fs.statSync(filePath);
              // Simple heuristic: if file is very small (< 150KB), it's probably a 1s snapshot fallback
              const isShortVideo = isVideo && stats.size < 150000; 

              allPeriods.push({
                startTimeMs: timestamp,
                durationMs: isVideo ? (isShortVideo ? 1000 : 60000) : 0,
                isScreenshot: file.endsWith(".png") || isShortVideo,
                isVideo: isVideo && !isShortVideo,
                isLocal: true,
                serverId: "local-storage",
                fileName: file,
                 dateFolder: dateFolder,
                 cameraName: foundCameraName || searchCameraName || "Unknown",
                 cameraFolderName: null, // No subfolder for flat files
                 url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(file)}`,
               });
             }
           }
 
           // --- 2. Scan Nested Structure (For backward compatibility with existing folders) ---
           const subFolders = fs.readdirSync(folderPath).filter(f => fs.statSync(path.join(folderPath, f)).isDirectory());
           
           for (const cameraFolderName of subFolders) {
             const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim();
             const isNameMatch = safeTarget && cameraFolderName === safeTarget;
             const isIdMatch = cameraFolderName.toLowerCase() === deviceId.toLowerCase();
             
             if (!isNameMatch && !isIdMatch) continue;
 
             const cameraPath = path.join(folderPath, cameraFolderName);
             const files = fs.readdirSync(cameraPath).filter(f => f.endsWith(".png") || f.endsWith(".mp4"));
 
             for (const file of files) {
               const timeMatch = file.match(/^(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
               if (!timeMatch) continue;
 
               const timeStr = timeMatch[1];
               const [y, m, d] = dateFolder.includes("-") ? dateFolder.split("-").map(Number) : [parseInt(dateFolder.substring(0,4)), parseInt(dateFolder.substring(4,6)), parseInt(dateFolder.substring(6,8))];
               
               const hour = parseInt(timeStr.substring(0, 2), 10);
               const minute = parseInt(timeStr.substring(2, 4), 10);
               const second = parseInt(timeStr.substring(4, 6), 10);
               // For scheduled PNG snapshots, round down seconds to :00
               const isScheduledPng = file.endsWith(".png");
               const displaySecond = isScheduledPng ? 0 : second;
               const timestamp = new Date(y, m - 1, d, hour, minute, displaySecond).getTime();
 
               if (timestamp >= startLimit && timestamp <= endLimit) {
                 allPeriods.push({
                   startTimeMs: timestamp,
                   durationMs: file.endsWith(".mp4") ? 60000 : 0,
                   isScreenshot: file.endsWith(".png"),
                   isVideo: file.endsWith(".mp4"),
                   isLocal: true,
                   serverId: "local-storage",
                   fileName: file,
                   dateFolder: dateFolder,
                   cameraName: cameraFolderName,
                   url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&camera=${encodeURIComponent(cameraFolderName)}&file=${encodeURIComponent(file)}`,
                 });
               }
             }
           }
         }
      }
    } // End of baseDirs loop

    // 3. Final Deduplication and Post-Processing
    // We group entries by a 5-second window to resolve duplicates between VMS pulses, 
    // new ID-based snapshots, and legacy name-based snapshots.
    const finalPeriods: any[] = [];
    const sortedCandidateList = [...allPeriods].sort((a, b) => {
       // 1. Prioritize VMS (non-local) records first to ensure they are the 'p' in comparison
       // EXCEPTION: For screenshots, prioritize LOCAL records so we can serve them even if VMS 404s
       if (a.isLocal !== b.isLocal) {
          if (a.isScreenshot || b.isScreenshot) return a.isLocal ? -1 : 1;
          return a.isLocal ? 1 : -1;
       }
       
       if (a.isLocal && b.isLocal) {
          const aHasId = (a.fileName || "").includes("__") ? 0 : 1;
          const bHasId = (b.fileName || "").includes("__") ? 0 : 1;
          if (aHasId !== bHasId) return aHasId - bHasId;
       }
       
       // 2. Prioritize rounded times (e.g., :00 seconds) to favor scheduled times over real-time offsets
       const aRounded = a.startTimeMs % 10000 === 0; // Prefer multiples of 10s (usually :00)
       const bRounded = b.startTimeMs % 10000 === 0;
       if (aRounded !== bRounded) return aRounded ? -1 : 1;
       
       // 3. Prioritize Screenshots over Videos for the same time window
       if (a.isScreenshot !== b.isScreenshot) return a.isScreenshot ? -1 : 1;
       
       // 4. Sort by start time descending
       return b.startTimeMs - a.startTimeMs;
    });

    for (const candidate of sortedCandidateList) {
      const isDuplicate = finalPeriods.some(p => {
         // 1. Explicit filename check (Same download link)
         if (p.fileName && candidate.fileName && p.fileName === candidate.fileName) return true;

         // 2. Time-based deduplication (If within 10 seconds of each other)
         const timeDiff = Math.abs(p.startTimeMs - candidate.startTimeMs);
         if (timeDiff < 10000) {
            // If we have a VMS record and a local one (Snapshot or Video), merge them.
            // We prefer keeping the LOCAL record for snapshots to avoid VMS 404s.
            if (!p.isLocal && candidate.isLocal) {
               if (p.isScreenshot || candidate.isScreenshot) return false; // Keep searching/Don't skip candidate yet (it will become 'p' later because it's sorted)
               return true; // Skip local video if VMS video exists
            }
            if (p.isLocal && !candidate.isLocal) {
               if (p.isScreenshot || candidate.isScreenshot) return true; // Skip VMS screenshot if local exists
            }

            // If both are local, keep the first one (Screenshot) and skip the second (Video)
            if (p.isLocal && candidate.isLocal) {
               // If one is a screenshot and they are in the same minute, skip the video
               const sameMinute = Math.floor(p.startTimeMs / 60000) === Math.floor(candidate.startTimeMs / 60000);
               if (sameMinute && (p.isScreenshot || candidate.isScreenshot)) return true;
               return true; 
            }

            // If both are from VMS, skip the duplicate.
            if (!p.isLocal && !candidate.isLocal && timeDiff < 2000) return true;
         }
         return false;
      });

      if (!isDuplicate) {
        finalPeriods.push(candidate);
      }
    }

    // Final sort by start time descending (newest first)
    finalPeriods.sort((a, b) => b.startTimeMs - a.startTimeMs);
    allPeriods = finalPeriods;
  } catch (err) {
    logger.warn("[recordings] Failed to scan local storage folders:", err);
  }
    
    return NextResponse.json(allPeriods);
  } catch (error) {
    logger.error("[recordings] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
