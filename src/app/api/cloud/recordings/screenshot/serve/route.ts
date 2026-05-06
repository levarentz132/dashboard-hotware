import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable } from "stream";

/**
 * GET /api/cloud/recordings/screenshot/serve?date=YYYY-MM-DD&file=filename.png
 * 
 * Serves a saved screenshot PNG file from the data/recorded_screenshots folder.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFolder = searchParams.get("date");
    const cameraName = searchParams.get("camera");
    const fileName = searchParams.get("file");
    const download = searchParams.get("download");

    if (!dateFolder || !fileName) {
      return NextResponse.json(
        { error: "date and file parameters are required" },
        { status: 400 }
      );
    }

    // Sanitize to prevent path traversal
    const safeDateFolder = dateFolder.replace(/[^0-9-]/g, "");
    const safeCameraName = cameraName ? cameraName.replace(/[<>:"/\\|?*]/g, "_") : null;
    const safeFileName = path.basename(fileName);

    // Respect custom storage path if defined
    let screenshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
    try {
      const settingsFile = path.join(process.cwd(), "data", "settings.json");
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
        // If it's a video, prioritize videoStoragePath. Otherwise use storagePath.
        if (fileName.toLowerCase().endsWith(".mp4") && settings.videoStoragePath) {
          screenshotsBaseDir = settings.videoStoragePath;
        } else if (settings.storagePath) {
          screenshotsBaseDir = settings.storagePath;
        }
      }
    } catch (e) { }

    let filePath;
    if (safeCameraName) {
      filePath = path.join(screenshotsBaseDir, safeDateFolder, safeCameraName, safeFileName);
      // Fallback: If not found in subfolder, try the root date folder
      if (!fs.existsSync(filePath)) {
        const fallbackPath = path.join(screenshotsBaseDir, safeDateFolder, safeFileName);
        if (fs.existsSync(fallbackPath)) {
          filePath = fallbackPath;
        }
      }
    } else {
      filePath = path.join(screenshotsBaseDir, safeDateFolder, safeFileName);
    }

    if (!fs.existsSync(filePath)) {
      // console.warn(`[screenshot/serve] File not found: ${filePath}`);
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(filePath);
    const isVideo = fileName.toLowerCase().endsWith(".mp4");
    
    // If it's a video but we want a snapshot (not a download, or explicitly requested), extract a frame
    if (isVideo && download !== "true") {
      // console.log(`[screenshot/serve] Extracting frame from video: ${filePath}`);
      
      return await new Promise<NextResponse>((resolve) => {
        const ffmpeg = spawn("ffmpeg", [
          "-i", filePath,
          "-vframes", "1",
          "-f", "image2",
          "-c:v", "png",
          "pipe:1"
        ], { windowsHide: true });

        const chunks: Buffer[] = [];
        ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
        
        ffmpeg.on("close", (code) => {
          if (code === 0) {
            const pngBuffer = Buffer.concat(chunks);
            resolve(new NextResponse(new Uint8Array(pngBuffer), {
              status: 200,
              headers: {
                "Content-Type": "image/png",
                "Content-Disposition": `inline; filename="${safeFileName.replace(".mp4", ".png")}"`,
                "Content-Length": String(pngBuffer.length),
                "Cache-Control": "public, max-age=86400",
              },
            }));
          } else {
            // console.error(`[screenshot/serve] FFmpeg extraction failed with code ${code}`);
            // Fallback to serving the video buffer if extraction fails
            const buffer = fs.readFileSync(filePath);
            resolve(new NextResponse(new Uint8Array(buffer), {
              status: 200,
              headers: {
                "Content-Type": "video/mp4",
                "Content-Disposition": `inline; filename="${safeFileName}"`,
                "Content-Length": String(buffer.length),
                "Cache-Control": "public, max-age=86400",
              },
            }));
          }
        });

        ffmpeg.on("error", (err) => {
          // console.error("[screenshot/serve] FFmpeg spawn error:", err);
          const buffer = fs.readFileSync(filePath);
          resolve(new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Disposition": `inline; filename="${safeFileName}"`,
              "Content-Length": String(buffer.length),
            },
          }));
        });
      });
    }

    const contentType = isVideo ? "video/mp4" : "image/png";
    
    // If it's a download, suggest a more descriptive filename: cameraName_YYYYMMDD_HHMMSS.ext
    let suggestedFileName = safeFileName;
    if (download === "true") {
      // If it's a video but we want an image download, we should ideally extract it.
      // But for simplicity, we use the correct extension for the actual file being served.
      const extension = isVideo ? "mp4" : "png";
      const baseName = safeFileName.split(".")[0];
      const dateStr = safeDateFolder.replace(/-/g, ""); // YYYY-MM-DD -> YYYYMMDD
      
      // If the filename already contains the camera name, don't duplicate it
      const hasCameraName = safeCameraName && baseName.includes(safeCameraName);
      
      if (safeCameraName && !hasCameraName) {
        suggestedFileName = `${dateStr}_${safeCameraName}_${baseName}.${extension}`;
      } else if (!hasCameraName) {
        suggestedFileName = `${dateStr}_${baseName}.${extension}`;
      } else if (hasCameraName) {
        // If it already has camera name, just prepend date
        suggestedFileName = `${dateStr}_${baseName}.${extension}`;
      }
    }

    const disposition = download === "true"
      ? `attachment; filename="${suggestedFileName}"`
      : `inline; filename="${safeFileName}"`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    // console.error("[screenshot/serve] Exception:", error);
    return NextResponse.json(
      { error: "Failed to serve screenshot" },
      { status: 500 }
    );
  }
}
