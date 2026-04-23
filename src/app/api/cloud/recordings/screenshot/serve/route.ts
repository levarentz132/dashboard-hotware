import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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
      console.warn(`[screenshot/serve] File not found: ${filePath}`);
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(filePath);
    const contentType = fileName.toLowerCase().endsWith(".mp4") ? "video/mp4" : "image/png";
    // If it's a download, suggest a more descriptive filename: cameraName_YYYYMMDD_HHMMSS.ext
    let suggestedFileName = safeFileName;
    if (download === "true") {
      const extension = safeFileName.split(".").pop();
      const baseName = safeFileName.split(".")[0];
      const dateStr = safeDateFolder.replace(/-/g, ""); // YYYY-MM-DD -> YYYYMMDD
      
      // If the filename already contains the camera name, don't duplicate it
      const hasCameraName = safeCameraName && baseName.includes(safeCameraName);
      
      if (safeCameraName && !hasCameraName) {
        suggestedFileName = `${safeCameraName}_${dateStr}_${baseName}.${extension}`;
      } else if (!hasCameraName) {
        suggestedFileName = `${dateStr}_${baseName}.${extension}`;
      }
    }

    const disposition = download === "true"
      ? `attachment; filename="${suggestedFileName}"`
      : `inline; filename="${safeFileName}"`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[screenshot/serve] Exception:", error);
    return NextResponse.json(
      { error: "Failed to serve screenshot" },
      { status: 500 }
    );
  }
}
