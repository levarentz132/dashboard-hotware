import { NextRequest, NextResponse } from "next/server";
import { readAppSettings, writeAppSettings } from "@/lib/server-settings";

/**
 * GET /api/cloud/recordings/settings
 * Reads the snapshot storage configuration.
 */
export async function GET() {
  try {
    return NextResponse.json(readAppSettings());
  } catch (error) {
    return NextResponse.json({ storagePath: "" });
  }
}

/**
 * POST /api/cloud/recordings/settings
 * Updates the snapshot storage configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storagePath, videoStoragePath } = body;

    const current = readAppSettings();
    writeAppSettings({ ...current, storagePath, videoStoragePath });

    return NextResponse.json({ success: true, storagePath, videoStoragePath });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
