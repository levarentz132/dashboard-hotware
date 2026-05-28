import logger from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import { cacheGetJson, cacheSetJson, recordingsCacheKey } from "@/lib/redis/cache";
import { loadDeviceMapsForSystem } from "@/lib/nx-devices-store";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getCache(key: string) {
  return cacheGetJson<unknown>(recordingsCacheKey(key));
}

async function setCache(key: string, data: unknown) {
  await cacheSetJson(recordingsCacheKey(key), data);
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
    const bypassCache = searchParams.get("refresh") === "true" || searchParams.get("bypassCache") === "true";

    if (!systemId || !deviceId) {
      return NextResponse.json(
        { error: "systemId and deviceId are required" },
        { status: 400 }
      );
    }
    const headers = buildCloudHeaders(request, systemId);

    // Check cache
    const cacheKey = `${systemId}:${deviceId}:${startTime}:${endTime}`;
    if (!bypassCache) {
      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        // logger.debug(`[recordings] Returning cached data for ${cacheKey}`);
        return NextResponse.json(cachedData, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store, max-age=0' }
        });
      }
    }

    // 1. Device id → name maps (Redis index first — avoids NX fetch for 1100+ cameras)
    const deviceNameMap = new Map<string, string>();
    const deviceHashToIdMap = new Map<string, string>();
    const cachedMaps = await loadDeviceMapsForSystem(systemId);
    if (cachedMaps) {
      cachedMaps.nameMap.forEach((v, k) => deviceNameMap.set(k, v));
      cachedMaps.hashMap.forEach((v, k) => deviceHashToIdMap.set(k, v));
    } else {
      try {
        const devicesUrl = buildCloudUrl(
          systemId,
          "/rest/v3/devices",
          new URLSearchParams(),
          request,
          systemName || undefined,
        );
        const devicesRes = await fetch(devicesUrl, { headers, cache: "no-store" });
        if (devicesRes.ok) {
          const devicesData = await devicesRes.json();
          const devicesList = Array.isArray(devicesData)
            ? devicesData
            : devicesData.reply || [];
          devicesList.forEach((d: any) => {
            if (d.id) {
              const cleanId = d.id.replace(/[{}]/g, "").toLowerCase();
              const name = (d.name || "").replace(/[<>:"/\\|?*]/g, "_").trim();
              deviceNameMap.set(cleanId, name);
              deviceNameMap.set(d.id.toLowerCase(), name);

              const hash = cleanId.slice(-4);
              deviceHashToIdMap.set(hash, d.id);
            }
          });
          const { syncDevicesFromListResponse } = await import("@/lib/nx-devices-store");
          await syncDevicesFromListResponse(systemId, devicesData);
        }
      } catch (e) {
        console.warn(`[recordings] Failed to fetch device list for mapping:`, e);
      }
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

    // Footage Template Logic: Historically, for non-admin users, if VMS returned no footage, we skipped local scans.
    // However, for scheduled auto-saved clips where VMS footage might be reverted, missing, or not indexed yet,
    // we bypass this restriction and always scan local files. The frontend's strict `hasCameraViewPermission`
    // remains the authoritative filter to ensure non-admin users cannot see unauthorized cameras.

    
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
              fileDeviceId = legacyFormatMatch[4] || "";
              
              if (isAllCameras) {
                isMatch = true;
              } else {
                const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim();
                const isNameMatch = foundCameraName.toLowerCase() === safeTarget.toLowerCase();
                const idHash = deviceId.slice(-4).toLowerCase();
                const isIdMatch = fileDeviceId && fileDeviceId === idHash;
                if (isIdMatch || (isNameMatch && !fileDeviceId)) isMatch = true;
              }
            }

            // Pattern B: New format {CameraName}_{HHmmss}_{idHash}.png
            if (!isMatch) {
              const simpleMatch = file.match(/^(.+)_(\d{6})(?:_([a-z0-9]+))?\.(?:png|mp4)$/);
              if (simpleMatch) {
                foundCameraName = simpleMatch[1];
                timeStr = simpleMatch[2];
                fileDeviceId = simpleMatch[3] || "";

                if (isAllCameras) {
                  isMatch = true;
                } else {
                  const safeTarget = (searchCameraName || "").replace(/[<>:"/\\|?*]/g, "_").trim().toLowerCase().replace(/_/g, " ");
                  const foundLower = foundCameraName.toLowerCase().replace(/_/g, " ");
                  const isNameMatch = foundLower === safeTarget || foundLower === deviceId.toLowerCase();
                  const idHash = deviceId.slice(-4).toLowerCase();
                  const isIdMatch = fileDeviceId && fileDeviceId === idHash;
                  if (isIdMatch || (isNameMatch && !fileDeviceId)) isMatch = true;
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

              let durationMs = isVideo ? Math.max(1000, stats.mtimeMs - timestamp) : 0;
              if (durationMs > 3600000) durationMs = 60000;

              const resolvedFullId = fileDeviceId ? deviceHashToIdMap.get(fileDeviceId.toLowerCase()) : undefined;

              allPeriods.push({
                startTimeMs: timestamp,
                durationMs: durationMs,
                isScreenshot: file.endsWith(".png"),
                isVideo: isVideo,
                isLocal: true,
                deviceId: resolvedFullId || fileDeviceId || deviceId,
                fileIdHash: fileDeviceId,
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
    // Sort chronologically first to make merging easier (preferring earlier start times)
    const sortedCandidateList = [...allPeriods].sort((a, b) => a.startTimeMs - b.startTimeMs);

    for (const candidate of sortedCandidateList) {
      const isDuplicate = finalPeriods.find(p => {
        if (p.fileName && candidate.fileName && p.fileName === candidate.fileName) return true;
        
        // Match by time (30s window) and camera
        const timeDiff = Math.abs(p.startTimeMs - candidate.startTimeMs);
        
        // Normalize names for comparison (remove underscores/spaces and lowercase)
        const normalize = (name: string) => (name || "").toLowerCase().replace(/[\s_]/g, "");
        const nameP = normalize(p.cameraName);
        const nameC = normalize(candidate.cameraName);

        const hasSpecificId = p.deviceId && candidate.deviceId && p.deviceId !== "all" && candidate.deviceId !== "all";
        const hasSpecificName = nameP && nameC && nameP !== "unknown" && nameC !== "unknown";
        
        // Handle GUID vs Hash matching
        let idMatch = hasSpecificId && p.deviceId === candidate.deviceId;
        if (!idMatch && p.deviceId && candidate.deviceId) {
          const pId = p.deviceId.toLowerCase().replace(/[{}]/g, "");
          const cId = candidate.deviceId.toLowerCase().replace(/[{}]/g, "");
          const pHash = p.fileIdHash || (pId.length === 4 ? pId : "");
          const cHash = candidate.fileIdHash || (cId.length === 4 ? cId : "");
          
          if (pHash && cId.endsWith(pHash)) idMatch = true;
          else if (cHash && pId.endsWith(cHash)) idMatch = true;
        }

        const sameCamera = idMatch || (hasSpecificName && nameP === nameC);
        
        if (timeDiff < 30000 && sameCamera) {
          // Merge metadata into existing entry
          // Prefer earlier start time if they are close (the "real" event start)
          if (candidate.startTimeMs < p.startTimeMs) {
            p.startTimeMs = candidate.startTimeMs;
          }
          
          if (!p.isLocal && candidate.isLocal) {
            p.isLocal = true;
            p.fileName = candidate.fileName;
            p.dateFolder = candidate.dateFolder;
            p.url = candidate.url;
            p.fileIdHash = candidate.fileIdHash;
          }
          if (p.durationMs < candidate.durationMs) {
            p.durationMs = candidate.durationMs;
          }
          return true;
        }
        return false;
      });

      if (!isDuplicate) finalPeriods.push(candidate);
    }

    finalPeriods.sort((a, b) => b.startTimeMs - a.startTimeMs);
    
    // Save to cache
    await setCache(cacheKey, finalPeriods);
    
    return NextResponse.json(finalPeriods, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store, max-age=0' },
    });

  } catch (error) {
    logger.error("[recordings] Exception:", error);
    return NextResponse.json({ error: "Failed to fetch recordings" }, { status: 500 });
  }
}
