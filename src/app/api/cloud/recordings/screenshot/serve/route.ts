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
    const safeFileName = path.basename(fileName);

    const filePath = path.join(process.cwd(), "data", "recorded_screenshots", safeDateFolder, safeFileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Screenshot not found" },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(filePath);
    const disposition = download === "true"
      ? `attachment; filename="${safeFileName}"`
      : `inline; filename="${safeFileName}"`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
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
