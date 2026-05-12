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

    // Check cache
    const cacheKey = `${systemId}:${deviceId}:${startTime}:${endTime}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
      // logger.debug(`[recordings] Returning cached data for ${cacheKey}`);
      return NextResponse.json(cachedData, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store, max-age=0' }
      });
    }

    // Build query params for recorded time periods
    const params = new URLSearchParams();
    if (!isAllCameras) {
      params.set("cameraId", deviceIdRaw);
    }
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
    
    // Fetch device info early to help with deduplication and naming (only if specific device)
    let searchCameraName = "";
    if (!isAllCameras) {
      try {
        const deviceUrl = buildCloudUrl(systemId, `/rest/v3/devices/${deviceId}`, new URLSearchParams(), request, systemName || undefined);
        const devRes = await fetch(deviceUrl, { headers, buildCloudHeaders: true } as any);
        if (devRes.ok) {
          const devData = await devRes.json();
          searchCameraName = (devData.name || "").replace(/[<>:"/\\|?*]/g, "_").trim();
        }
      } catch (e) { }
    }

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
          deviceId: p.deviceId || deviceId, // Use per-period deviceId if available (for 'all' query)
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

      const startLimit = startTime ? parseInt(startTime, 10) : 0;
      const endLimit = endTime ? parseInt(endTime, 10) : Infinity;
      
      // Determine relevant dates to scan
      const relevantDates = new Set<string>();
      if (startTime && endTime) {
        let current = new Date(startLimit);
        const end = new Date(endLimit);
        while (current <= end) {
          relevantDates.add(current.getFullYear().toString() + (current.getMonth() + 1).toString().padStart(2, '0') + current.getDate().toString().padStart(2, '0'));
          relevantDates.add(`${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}-${current.getDate().toString().padStart(2, '0')}`);
          current.setDate(current.getDate() + 1);
        }
      }

      for (const screenshotsBaseDir of Array.from(baseDirs)) {
        if (!fs.existsSync(screenshotsBaseDir)) continue;

        // Scan date-based folders - only those that match or if no range provided
        const allDateFolders = fs.readdirSync(screenshotsBaseDir).filter(f => {
          const isDateFolder = /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(f);
          if (!isDateFolder) return false;
          
          // Optimization: only scan if it's within our date range (if range exists)
          if (relevantDates.size > 0 && !relevantDates.has(f)) return false;
          
          const fullPath = path.join(screenshotsBaseDir, f);
          try {
            return fs.statSync(fullPath).isDirectory();
          } catch { return false; }
        });

        for (const dateFolder of allDateFolders) {
          const folderPath = path.join(screenshotsBaseDir, dateFolder);
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

            // Pattern C: Legacy ID formats...
            if (!isMatch) {
              const idSplit = file.split("__");
              if (idSplit.length > 1) {
                if (isAllCameras || idSplit[0].toLowerCase() === deviceId.toLowerCase()) {
                  isMatch = true;
                  fileDeviceId = idSplit[0];
                  const timeParts = file.match(/_(\d{6})(?:_\d+)?\.(?:png|mp4)$/);
                  if (timeParts) timeStr = timeParts[1];
                }
              }
            }

            if (!isMatch || !timeStr) continue;

            const [y, m, d] = dateFolder.includes("-") ? dateFolder.split("-").map(Number) : [parseInt(dateFolder.substring(0,4)), parseInt(dateFolder.substring(4,6)), parseInt(dateFolder.substring(6,8))];
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
                dateFolder: dateFolder,
                cameraName: foundCameraName || searchCameraName || "Unknown",
                url: `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(file)}`,
              });
              seenLocalFiles.add(file);
            }
          }

          // Scan Nested Structure...
          let subFolders: string[] = [];
          try {
            subFolders = fs.readdirSync(folderPath).filter(f => {
              try { return fs.statSync(path.join(folderPath, f)).isDirectory(); } catch { return false; }
            });
          } catch { continue; }

          for (const cameraFolderName of subFolders) {
            let isNameMatch = false;
            let isIdMatch = false;
            
            if (isAllCameras) {
              isNameMatch = true;
            } else {
              const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?|*]/g, "_").trim();
              isNameMatch = !!safeTarget && cameraFolderName === safeTarget;
              isIdMatch = cameraFolderName.toLowerCase() === deviceId.toLowerCase();
            }
            
            if (!isNameMatch && !isIdMatch) continue;

            const cameraPath = path.join(folderPath, cameraFolderName);
            let files: string[] = [];
            try {
              files = fs.readdirSync(cameraPath).filter(f => f.endsWith(".png") || f.endsWith(".mp4"));
            } catch { continue; }

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
              let stats;
              try {
                stats = fs.statSync(path.join(cameraPath, file));
              } catch { continue; }
              const isShortVideo = isVideo && stats.size < 150000;

              if (timestamp >= startLimit && timestamp <= endLimit) {
                allPeriods.push({
                  startTimeMs: timestamp,
                  durationMs: isVideo ? (isShortVideo ? 1000 : 60000) : 0,
                  isScreenshot: file.endsWith(".png") || isShortVideo,
                  isVideo: isVideo && !isShortVideo,
                  isLocal: true,
                  deviceId: cameraFolderName.match(/^[a-z0-9-]+$/i) ? cameraFolderName : deviceId,
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
    } catch (err) {
      logger.warn("[recordings] Failed to scan local storage folders:", err);
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
