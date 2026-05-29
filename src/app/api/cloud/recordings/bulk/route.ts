import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiver = require("archiver");
import { Readable, PassThrough } from "stream";

// VMS uses self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, systemId } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // Get settings for local storage paths
    let storagePath = path.join(process.cwd(), "data", "recorded_screenshots");
    let videoStoragePath = storagePath;
    try {
      const settingsFile = path.join(process.cwd(), "data", "settings.json");
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
        if (settings.storagePath) storagePath = settings.storagePath;
        if (settings.videoStoragePath) videoStoragePath = settings.videoStoragePath;
      }
    } catch (e) {}

    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
    const stream = new PassThrough();

    // Start zipping
    archive.pipe(stream);

    // Process items
    // We'll do this in the background but pipe to the response
    (async () => {
      try {
        for (const item of items) {
          const recDate = new Date(item.startTimeMs);
          const YYYY = recDate.getFullYear();
          const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
          const DD = recDate.getDate().toString().padStart(2, "0");
          const HH = recDate.getHours().toString().padStart(2, "0");
          const mm = recDate.getMinutes().toString().padStart(2, "0");
          const ss = "00"; // Rounded per user request
          
          const dateFolder = `${YYYY}-${MM}-${DD}`;
          const timestamp = `${HH}${mm}${ss}`;
          const safeCameraName = (item.cameraName || item.deviceId?.substring(0, 8) || "Camera")
            .replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();
          
          const extension = item.isScreenshot ? ".png" : ".mp4";
          const fileName = `${safeCameraName}_${timestamp}${extension}`;
          const folderType = item.isScreenshot ? "Snapshots" : "Recordings";
          const archivePath = `${folderType}/${dateFolder}/${fileName}`;

          if (item.isLocal) {
            // Local file
            const baseDir = item.isScreenshot ? storagePath : videoStoragePath;
            // The item should have dateFolder and fileName if it was found by local scan
            // But we'll fallback to our calculated ones if missing
            const itemDateFolder = item.dateFolder || dateFolder.replace(/-/g, ""); // VMS local folders use YYYYMMDD
            const localFilePath = path.join(baseDir, itemDateFolder, item.fileName || fileName);
            
            if (fs.existsSync(localFilePath)) {
              archive.file(localFilePath, { name: archivePath });
            } else {
              console.warn(`[bulk-download] Local file not found: ${localFilePath}`);
              // Try the other format (YYYY-MM-DD vs YYYYMMDD)
              const altDateFolder = dateFolder; 
              const altPath = path.join(baseDir, altDateFolder, item.fileName || fileName);
              if (fs.existsSync(altPath)) {
                archive.file(altPath, { name: archivePath });
              }
            }
          } else {
            // VMS file - need to fetch it
            try {
              const params = new URLSearchParams();
              let endpoint = "";
              if (item.isScreenshot) {
                params.set("pos", String(item.startTimeMs));
                params.set("time", String(item.startTimeMs));
                params.set("method", "fast");
                endpoint = `/rest/v3/devices/${item.deviceId}/image`;
              } else {
                params.set("positionMs", String(item.startTimeMs));
                if (item.durationMs) {
                  params.set("durationMs", String(item.durationMs));
                }
                endpoint = `/rest/v3/devices/${item.deviceId}/media`;
              }

              const downloadUrl = buildCloudUrl(systemId || item.systemId, endpoint, params, request);
              const headers = buildCloudHeaders(request, systemId || item.systemId);
              
              let response = await fetch(downloadUrl, { headers });
              if (!response.ok && (response.status === 401 || response.status === 403)) {
                const basicAuth = getBasicAuthHeaderFromRequest(request);
                if (basicAuth) {
                  headers["Authorization"] = basicAuth;
                  delete headers["x-runtime-guid"];
                  response = await fetch(downloadUrl, { headers });
                }
              }

              if (response.ok && response.body) {
                // Add the response body stream to the archive
                archive.append(Readable.fromWeb(response.body as any), { name: archivePath });
              } else {
                console.error(`[bulk-download] Failed to fetch VMS item ${item.id}: ${response.status}`);
              }
            } catch (err) {
              console.error(`[bulk-download] Error fetching VMS item ${item.id}:`, err);
            }
          }
        }
        await archive.finalize();
      } catch (err) {
        console.error("[bulk-download] Archiving error:", err);
        archive.abort();
      }
    })();

    const zipFileName = `recordings_bulk_${new Date().getTime()}.zip`;

    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[bulk-download] API Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
