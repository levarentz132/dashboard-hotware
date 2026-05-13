import logger from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Simple in-memory cache to reduce redundant disk scans and API calls
// Keys: systemId:deviceId:startTime:endTime
const recordingsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 20000; // 20 seconds for active caching

function getCache(key: string) {
  const cached = recordingsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any) {
  recordingsCache.set(key, { data, timestamp: Date.now() });
  // Cleanup old entries
  if (recordingsCache.size > 200) {
    const oldestKey = recordingsCache.keys().next().value;
    if (oldestKey) recordingsCache.delete(oldestKey);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceIdRaw = searchParams.get("deviceId") || "";
    const isAllCameras = deviceIdRaw === "all";
    const deviceId = isAllCameras ? "all" : deviceIdRaw.replace(/[{}]/g, "");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!systemId || !deviceId) {
      return NextResponse.json(
        { error: "systemId and deviceId are required" },
        { status: 400 }
      );
    }
    const headers = buildCloudHeaders(request, systemId);

    // Check cache
    const cacheKey = `${systemId}:${deviceId}:${startTime}:${endTime}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
      // logger.debug(`[recordings] Returning cached data for ${cacheKey}`);
      return NextResponse.json(cachedData, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store, max-age=0' }
      });
    }

    // 1. Fetch Device List for GUID -> Name mapping
    const deviceNameMap = new Map<string, string>();
    try {
      const devicesUrl = buildCloudUrl(systemId, "/rest/v3/devices", new URLSearchParams(), request, systemName || undefined);
      const devicesRes = await fetch(devicesUrl, { headers, cache: 'no-store' });
      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        const devicesList = Array.isArray(devicesData) ? devicesData : (devicesData.reply || []);
        devicesList.forEach((d: any) => {
          if (d.id) {
            const name = (d.name || "").replace(/[<>:"/\\|?*]/g, "_").trim();
            deviceNameMap.set(d.id.replace(/[{}]/g, "").toLowerCase(), name);
            deviceNameMap.set(d.id.toLowerCase(), name);
          }
        });
      }
    } catch (e) {
      console.warn(`[recordings] Failed to fetch device list for mapping:`, e);
    }

    // Determine the search camera name for local scan logic
    let searchCameraName = "";
    if (!isAllCameras) {
      searchCameraName = deviceNameMap.get(deviceId.toLowerCase()) || deviceNameMap.get(deviceIdRaw.toLowerCase()) || "";
    }

    // 2. Build footage query
    const footageParams = new URLSearchParams();
    if (startTime) footageParams.set("startTimeMs", startTime);
    if (endTime) footageParams.set("endTimeMs", endTime);

    const footageEndpoint = isAllCameras ? "/rest/v3/devices/*/footage" : `/rest/v3/devices/${deviceId}/footage`;
    const cloudUrl = buildCloudUrl(systemId, footageEndpoint, footageParams, request, systemName || undefined);
    
    const isAdmin = searchParams.get("isAdmin") === "true";

    let allPeriods: any[] = [];
    try {
      let response = await fetch(cloudUrl, {
        method: "GET",
        headers,
        cache: 'no-store'
      });

      if (response.status === 401 || response.status === 403) {
        const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
        if (basicAuthHeader) {
          const retryHeaders: Record<string, string> = { ...headers, Authorization: basicAuthHeader };
          delete retryHeaders["x-runtime-guid"];
          response = await fetch(cloudUrl, { method: "GET", headers: retryHeaders, cache: 'no-store' });
        }
      }

      if (response.ok) {
        const footageData = await response.json();
        
        // The REST v3 footage API returns a map: { "deviceId": [ { startTimeMs, durationMs, serverId }, ... ] }
        // or a direct array if a specific device was requested.
        const footageMap = isAllCameras ? footageData : { [deviceId]: footageData };

        for (const [id, chunks] of Object.entries(footageMap)) {
          if (!Array.isArray(chunks)) continue;
          
          const cleanId = id.replace(/[{}]/g, "").toLowerCase();
          const cameraName = deviceNameMap.get(cleanId) || deviceNameMap.get(id.toLowerCase()) || "Unknown";

          for (const chunk of chunks as any[]) {
            const durationMs = chunk.durationMs || 0;
            
            // Pulse Filtering: Ignore chunks under 10 seconds as they are likely snapshot trigger pulses
            if (durationMs > 0 && durationMs < 10000) {
              // console.log(`[recordings] Skipping pulse chunk (${Math.round(durationMs/1000)}s) for ${cameraName}`);
              continue;
            }

            allPeriods.push({
              startTimeMs: chunk.startTimeMs,
              durationMs: durationMs,
              deviceId: id,
              cameraName: cameraName,
              serverId: chunk.serverId,
              isScreenshot: durationMs > 0 && durationMs <= 5000,
            });
          }
        }
        console.log(`[recordings] NX API Success: Found ${allPeriods.length} periods for system ${systemId}`);
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        console.warn(`[recordings] NX API Error (${response.status}) for system ${systemId}:`, errorText);
      }
    } catch (err: any) {
      console.error(`[recordings] NX API Exception for system ${systemId}:`, err.message);
    }

    // Footage Template Logic: For non-admin users, if VMS returns no footage, do not show local files either.
    // This ensures VMS remains the source of truth for visibility for non-privileged users.
    if (!isAdmin && allPeriods.length === 0) {
      console.log(`[recordings] Normal user search returned no NX footage. Skipping local scan for ${systemId}:${deviceId}.`);
      return NextResponse.json([]);
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

      const startLimit = startTime ? parseInt(startTime, 10) : 0;
      const endLimit = endTime ? parseInt(endTime, 10) : Infinity;
      
      for (const screenshotsBaseDir of Array.from(baseDirs)) {
        if (!fs.existsSync(screenshotsBaseDir)) {
          console.log(`[recordings] Local base directory does not exist: ${screenshotsBaseDir}`);
          continue;
        }

        console.log(`[recordings] Scanning local storage: ${screenshotsBaseDir}`);

        // Scan date-based folders
        const allDateFolders = fs.readdirSync(screenshotsBaseDir).filter(f => {
          const isDateFolder = /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(f);
          if (!isDateFolder) return false;
          const fullPath = path.join(screenshotsBaseDir, f);
          try { return fs.statSync(fullPath).isDirectory(); } catch { return false; }
        });

        // Add the base directory itself to the list of folders to scan (for non-structured saves)
        const foldersToScan = [...allDateFolders, ""]; 

        for (const dateFolder of foldersToScan) {
          const folderPath = dateFolder ? path.join(screenshotsBaseDir, dateFolder) : screenshotsBaseDir;
          let folderFiles: string[] = [];
          try {
            folderFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".png") || f.endsWith(".mp4"));
          } catch { continue; }

          for (const file of folderFiles) {
            const filePath = path.join(folderPath, file);
            let stats;
            try {
              stats = fs.statSync(filePath);
              if (stats.isDirectory()) continue;
            } catch { continue; }
            
            if (seenLocalFiles.has(file)) continue;

            let isMatch = false;
            let timeStr = "";
            let foundCameraName = "";
            let fileDeviceId = "";

            // Pattern A: Legacy format {CameraName}_{YYYY-MM-DD}_{HHmmss}_{ID}.png
            const legacyFormatMatch = file.match(/^(.+)_(\d{4}-\d{2}-\d{2})_(\d{6})(?:_([a-z0-9]+))?\.(?:png|mp4)$/);
            if (legacyFormatMatch) {
              foundCameraName = legacyFormatMatch[1];
              timeStr = legacyFormatMatch[3];
              const fileIdHash = legacyFormatMatch[4];
              
              if (isAllCameras) {
                isMatch = true;
              } else {
                const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim();
                const isNameMatch = foundCameraName.toLowerCase() === safeTarget.toLowerCase();
                const idHash = deviceId.slice(-4).toLowerCase();
                const isIdMatch = fileIdHash && fileIdHash === idHash;
                if (isIdMatch || (isNameMatch && !fileIdHash)) isMatch = true;
              }
            }

            // Pattern B: New format {CameraName}_{HHmmss}_{idHash}.png
            if (!isMatch) {
              const simpleMatch = file.match(/^(.+)_(\d{6})(?:_([a-z0-9]+))?\.(?:png|mp4)$/);
              if (simpleMatch) {
                foundCameraName = simpleMatch[1];
                timeStr = simpleMatch[2];
                const fileIdHash = simpleMatch[3];

                if (isAllCameras) {
                  isMatch = true;
                } else {
                  const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim().toLowerCase().replace(/_/g, " ");
                  const foundLower = foundCameraName.toLowerCase().replace(/_/g, " ");
                  const isNameMatch = foundLower === safeTarget || foundLower === deviceId.toLowerCase();
                  const idHash = deviceId.slice(-4).toLowerCase();
                  const isIdMatch = fileIdHash && fileIdHash === idHash;
                  if (isIdMatch || (isNameMatch && !fileIdHash)) isMatch = true;
                }
              }
            }

            if (!isMatch || !timeStr) continue;

            // Resolve date from folder or file
            let y, m, d;
            if (dateFolder && (dateFolder.includes("-") || dateFolder.length === 8)) {
              [y, m, d] = dateFolder.includes("-") ? dateFolder.split("-").map(Number) : [parseInt(dateFolder.substring(0,4)), parseInt(dateFolder.substring(4,6)), parseInt(dateFolder.substring(6,8))];
            } else if (legacyFormatMatch) {
              [y, m, d] = legacyFormatMatch[2].split("-").map(Number);
            } else {
              // Fallback to file creation date if no folder date
              const fDate = new Date(stats.birthtimeMs);
              [y, m, d] = [fDate.getFullYear(), fDate.getMonth() + 1, fDate.getDate()];
            }

            const hour = parseInt(timeStr.substring(0, 2), 10);
            const minute = parseInt(timeStr.substring(2, 4), 10);
            const second = parseInt(timeStr.substring(4, 6), 10);
            const isScheduledPng = file.endsWith(".png");
            const displaySecond = isScheduledPng ? 0 : second;
            const timestamp = new Date(y, m - 1, d, hour, minute, displaySecond).getTime();

            if (timestamp >= startLimit && timestamp <= endLimit) {
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
                deviceId: fileDeviceId || deviceId,
                serverId: "local-storage",
                fileName: file,
                dateFolder: dateFolder || `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
                cameraName: foundCameraName || searchCameraName || "Unknown",
                url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder || `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`}&file=${encodeURIComponent(file)}`,
              });
              seenLocalFiles.add(file);
            }
          }

          // Scan Nested Camera Folders inside Date Folders
          if (dateFolder) {
            let subFolders: string[] = [];
            try {
              subFolders = fs.readdirSync(folderPath).filter(f => {
                try { return fs.statSync(path.join(folderPath, f)).isDirectory(); } catch { return false; }
              });
            } catch { continue; }

            for (const cameraFolderName of subFolders) {
              const cameraPath = path.join(folderPath, cameraFolderName);
              const files = fs.readdirSync(cameraPath).filter(f => f.endsWith(".mp4") || f.endsWith(".png"));
              
              for (const file of files) {
                const filePath = path.join(cameraPath, file);
                const stats = fs.statSync(filePath);
                if (seenLocalFiles.has(file)) continue;

                // Simple format check for nested files
                const timeParts = file.match(/^(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
                if (!timeParts) continue;

                const [y, m, d] = dateFolder.includes("-") ? dateFolder.split("-").map(Number) : [parseInt(dateFolder.substring(0,4)), parseInt(dateFolder.substring(4,6)), parseInt(dateFolder.substring(6,8))];
                const h = parseInt(timeParts[1].substring(0, 2), 10);
                const mm = parseInt(timeParts[1].substring(2, 4), 10);
                const ss = parseInt(timeParts[1].substring(4, 6), 10);
                const timestamp = new Date(y, m - 1, d, h, mm, ss).getTime();

                if (timestamp >= startLimit && timestamp <= endLimit) {
                  const isVideo = file.endsWith(".mp4");
                  allPeriods.push({
                    startTimeMs: timestamp,
                    durationMs: isVideo ? Math.max(1000, stats.mtimeMs - timestamp) : 0,
                    isScreenshot: file.endsWith(".png"),
                    isVideo: isVideo,
                    isLocal: true,
                    deviceId: deviceId,
                    serverId: "local-storage",
                    fileName: file,
                    dateFolder: dateFolder,
                    cameraFolderName: cameraFolderName,
                    cameraName: cameraFolderName,
                    url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&camera=${encodeURIComponent(cameraFolderName)}&file=${encodeURIComponent(file)}`,
                  });
                  seenLocalFiles.add(file);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[recordings] Local scan error:", err);
    }


    // 3. Final Deduplication and Sorting
    const finalPeriods: any[] = [];
    const sortedCandidateList = [...allPeriods].sort((a, b) => b.startTimeMs - a.startTimeMs);

    for (const candidate of sortedCandidateList) {
      const isDuplicate = finalPeriods.some(p => {
        if (p.fileName && candidate.fileName && p.fileName === candidate.fileName) return true;
        
        // Match by time (30s window) and camera
        const timeDiff = Math.abs(p.startTimeMs - candidate.startTimeMs);
        
        // CRITICAL FIX: Don't treat 'all' as a matching device ID. 
        // Only match if they have specific IDs or specific names.
        const hasSpecificId = p.deviceId && candidate.deviceId && p.deviceId !== "all" && candidate.deviceId !== "all";
        const hasSpecificName = p.cameraName && candidate.cameraName && p.cameraName !== "Unknown" && candidate.cameraName !== "Unknown";
        
        const sameCamera = (hasSpecificId && p.deviceId === candidate.deviceId) || 
                           (hasSpecificName && p.cameraName === candidate.cameraName);
        
        if (timeDiff < 30000 && sameCamera) {
          // Merge metadata
          if (!p.isLocal && candidate.isLocal) {
            p.isLocal = true;
            p.fileName = candidate.fileName;
            p.dateFolder = candidate.dateFolder;
            p.url = candidate.url;
          }
          return true;
        }
        return false;
      });

      if (!isDuplicate) finalPeriods.push(candidate);
    }

    finalPeriods.sort((a, b) => b.startTimeMs - a.startTimeMs);
    
    // Save to cache
    setCache(cacheKey, finalPeriods);
    
    return NextResponse.json(finalPeriods, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store, max-age=0' },
    });

  } catch (error) {
    logger.error("[recordings] Exception:", error);
    return NextResponse.json({ error: "Failed to fetch recordings" }, { status: 500 });
  }
}
