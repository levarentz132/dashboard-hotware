import logger from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';
export const revalidate = 0;


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
        cache: 'no-store'
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
            cache: 'no-store'
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
    
    // Fetch device info early to help with deduplication and naming
    let searchCameraName = "";
    try {
      const deviceUrl = buildCloudUrl(systemId, `/rest/v3/devices/${deviceId}`, new URLSearchParams(), request, systemName || undefined);
      const devRes = await fetch(deviceUrl, { headers, buildCloudHeaders: true } as any);
      if (devRes.ok) {
        const devData = await devRes.json();
        searchCameraName = (devData.name || "").replace(/[<>:"/\\|?*]/g, "_").trim();
      }
    } catch (e) { }

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
          deviceId,
          cameraName: searchCameraName || "Unknown",
          isScreenshot: durationMs > 0 && durationMs <= 5000,
          serverId: item.guid || p.guid,
        });
      }
    }
    
    // 2. Fetch local files from data folders (date-based folder structure)
    try {
      const defaultDir = path.resolve(process.cwd(), "data", "recorded_screenshots");
      const baseDirs = new Set<string>([defaultDir]);
      const seenLocalFiles = new Set<string>();

      try {
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fs.existsSync(settingsFile)) {
          const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
          if (settings.storagePath) baseDirs.add(path.resolve(settings.storagePath));
          if (settings.videoStoragePath) baseDirs.add(path.resolve(settings.videoStoragePath));
        }
      } catch (e) { }

      const normalizedBaseDirs = Array.from(baseDirs).map(d => path.resolve(d));
      const uniqueBaseDirs = new Set(normalizedBaseDirs);

      for (const screenshotsBaseDir of uniqueBaseDirs) {

      if (fs.existsSync(screenshotsBaseDir)) {
        const startLimit = startTime ? parseInt(startTime, 10) : 0;
        const endLimit = endTime ? parseInt(endTime, 10) : Infinity;

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

             // Avoid adding the same file twice if it matches multiple patterns or directories
             if (seenLocalFiles.has(file)) continue;
 
             let isMatch = false;
             let timeStr = "";
             let foundCameraName = "";
 
              // Pattern A: Legacy format {CameraName}_{YYYY-MM-DD}_{HHmmss}_{ID}.png
              const legacyFormatMatch = file.match(/^(.+)_(\d{4}-\d{2}-\d{2})_(\d{6})(?:_([a-z0-9]+))?\.(?:png|mp4)$/);
              if (legacyFormatMatch) {
                foundCameraName = legacyFormatMatch[1];
                const fileDateStr = legacyFormatMatch[2];
                timeStr = legacyFormatMatch[3];
                const fileIdHash = legacyFormatMatch[4];

               const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim();
               const isNameMatch = foundCameraName.toLowerCase() === safeTarget.toLowerCase();
               
               // If we have an ID hash in the filename, use it for exact matching
               const idHash = deviceId.slice(-4).toLowerCase();
               const isIdMatch = fileIdHash && fileIdHash === idHash;

               if (isIdMatch || (isNameMatch && !fileIdHash)) {
                 isMatch = true;
               }
             }

              // Pattern B: New format {CameraName}_{HHmmss}_{idHash}.png
              if (!isMatch) {
                const simpleMatch = file.match(/^(.+)_(\d{6})(?:_([a-z0-9]+))?\.(?:png|mp4)$/);
                if (simpleMatch) {
                   foundCameraName = simpleMatch[1];
                   timeStr = simpleMatch[2];
                   const fileIdHash = simpleMatch[3];

                    const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim().toLowerCase().replace(/_/g, " ");
                    const foundLower = foundCameraName.toLowerCase().replace(/_/g, " ");
                    const isNameMatch = foundLower === safeTarget || 
                                        foundLower === deviceId.toLowerCase();
                    
                    const idHash = deviceId.slice(-4).toLowerCase();
                    const isIdMatch = fileIdHash && fileIdHash === idHash;
 
                    if (isIdMatch || (isNameMatch && !fileIdHash)) {
                      isMatch = true;
                    }
                }
              }
 
             // Pattern C: Legacy ID format {deviceId}__{cameraName}_{YYYYMMDD}_{HHMMSS}.png
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
               const stats = fs.statSync(filePath);
               const isVideo = file.endsWith(".mp4");
               const isShortVideo = isVideo && stats.size < 150000; 

               let durationMs = isVideo ? (isShortVideo ? 1000 : Math.max(1000, stats.mtimeMs - timestamp)) : 0;
               if (durationMs > 3600000) durationMs = 60000;

               allPeriods.push({
                 startTimeMs: timestamp,
                 durationMs: durationMs,
                 isScreenshot: file.endsWith(".png") || isShortVideo,
                 isVideo: isVideo && !isShortVideo,
                 isLocal: true,
                 deviceId: deviceId,
                 serverId: "local-storage",
                 fileName: file,
                 dateFolder: dateFolder,
                 cameraName: foundCameraName || searchCameraName || "Unknown",
                 url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(file)}`,
               });
               seenLocalFiles.add(file);
             }
           }
 
           // --- 2. Scan Nested Structure (For backward compatibility) ---
           const subFolders = fs.readdirSync(folderPath).filter(f => fs.statSync(path.join(folderPath, f)).isDirectory());
           
           for (const cameraFolderName of subFolders) {
             const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim();
             const isNameMatch = safeTarget && cameraFolderName === safeTarget;
             const isIdMatch = cameraFolderName.toLowerCase() === deviceId.toLowerCase();
             
             if (!isNameMatch && !isIdMatch) continue;
 
             const cameraPath = path.join(folderPath, cameraFolderName);
             const files = fs.readdirSync(cameraPath).filter(f => f.endsWith(".png") || f.endsWith(".mp4"));
 
             for (const file of files) {
               if (seenLocalFiles.has(file)) continue;

               const timeMatch = file.match(/^(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
               if (!timeMatch) continue;
 
               const timeStr = timeMatch[1];
               const [y, m, d] = dateFolder.includes("-") ? dateFolder.split("-").map(Number) : [parseInt(dateFolder.substring(0,4)), parseInt(dateFolder.substring(4,6)), parseInt(dateFolder.substring(6,8))];
               
               const hour = parseInt(timeStr.substring(0, 2), 10);
               const minute = parseInt(timeStr.substring(2, 4), 10);
               const second = parseInt(timeStr.substring(4, 6), 10);
               const isScheduledPng = file.endsWith(".png");
               const displaySecond = isScheduledPng ? 0 : second;
               const timestamp = new Date(y, m - 1, d, hour, minute, displaySecond).getTime();
               
               const isVideo = file.endsWith(".mp4");
               const stats = fs.statSync(path.join(cameraPath, file));
               const isShortVideo = isVideo && stats.size < 150000;

               if (timestamp >= startLimit && timestamp <= endLimit) {
                 allPeriods.push({
                   startTimeMs: timestamp,
                   durationMs: isVideo ? (isShortVideo ? 1000 : 60000) : 0,
                   isScreenshot: file.endsWith(".png") || isShortVideo,
                   isVideo: isVideo && !isShortVideo,
                   isLocal: true,
                   deviceId: deviceId,
                   serverId: "local-storage",
                   fileName: file,
                   dateFolder: dateFolder,
                   cameraName: cameraFolderName,
                   url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&camera=${encodeURIComponent(cameraFolderName)}&file=${encodeURIComponent(file)}`,
                 });
                 seenLocalFiles.add(file);
               }
             }
           }
         }
      }
    } // End of baseDirs loop

    // 3. Final Deduplication
    const finalPeriods: any[] = [];
    const sortedCandidateList = [...allPeriods].sort((a, b) => {
        // Prioritize VMS over Local for merging base (Timezone-agnostic)
        const diff = Math.abs(a.startTimeMs - b.startTimeMs);
        const subH = diff % 3600000;
        const isTimeMatch = (diff < 10000) || subH < 10000 || subH > 3590000;

        if (isTimeMatch) {
           if (a.isLocal !== b.isLocal) return a.isLocal ? 1 : -1;
        }

       // Prefer screenshots over videos for same time
       if (a.isScreenshot !== b.isScreenshot) return a.isScreenshot ? -1 : 1;
       
       // Sort by start time descending
       return b.startTimeMs - a.startTimeMs;
    });

     for (const candidate of sortedCandidateList) {
       const isDuplicate = finalPeriods.some(p => {
          if (p.fileName && candidate.fileName && p.fileName === candidate.fileName) return true;
 
          const getMinuteOffset = (ms: number) => {
             const d = new Date(ms);
             return (d.getMinutes() * 60000) + (d.getSeconds() * 1000);
          };

          const pNorm = getMinuteOffset(p.startTimeMs);
          const cNorm = getMinuteOffset(candidate.startTimeMs);
          let normDiff = Math.abs(pNorm - cNorm);
          if (normDiff > 1800000) normDiff = 3600000 - normDiff;

          if (normDiff < 300000) { // 5 minute window
             // Merge logic: ensure we keep the VMS metadata (duration) but Local file (url)
             const vmsRecord = !p.isLocal ? p : (!candidate.isLocal ? candidate : null);
             const localRecord = p.isLocal ? p : (candidate.isLocal ? candidate : null);

             if (vmsRecord) {
                p.startTimeMs = vmsRecord.startTimeMs;
                p.durationMs = vmsRecord.durationMs;
                p.isScreenshot = vmsRecord.isScreenshot;
             }
             if (localRecord) {
                p.isLocal = true;
                p.fileName = localRecord.fileName;
                p.dateFolder = localRecord.dateFolder;
                p.url = localRecord.url;
             }
             return true; 
          }
          return false;
       });
 
       if (!isDuplicate) {
         finalPeriods.push(candidate);
       }
     }

    finalPeriods.sort((a, b) => b.startTimeMs - a.startTimeMs);
    allPeriods = finalPeriods;
  } catch (err) {
    logger.warn("[recordings] Failed to scan local storage folders:", err);
  }
    
    return NextResponse.json(allPeriods, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    logger.error("[recordings] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
