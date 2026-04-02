import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");

/**
 * GET /api/cloud/recordings/settings
 * Reads the snapshot storage configuration.
 */
export async function GET() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return NextResponse.json({ storagePath: "" });
    }
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return NextResponse.json(JSON.parse(data));
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
    const { storagePath } = body;

    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ storagePath }, null, 2));

    return NextResponse.json({ success: true, storagePath });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
