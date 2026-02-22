import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const MONITOR_FILE = path.join(DATA_DIR, "device_monitor_history.json");

/**
 * Save device monitoring data to JSON file
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Ensure data directory exists
    try {
      await fs.access(DATA_DIR);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }

    // Write the data to file
    await fs.writeFile(MONITOR_FILE, JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({ 
      success: true, 
      message: "Device monitor data saved",
      timestamp: data.timestamp 
    });
  } catch (error) {
    console.error("[Device Monitor API] Error saving data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save device monitor data" },
      { status: 500 }
    );
  }
}

/**
 * Get latest device monitoring data
 */
export async function GET() {
  try {
    const fileContent = await fs.readFile(MONITOR_FILE, "utf-8");
    const data = JSON.parse(fileContent);
    
    return NextResponse.json(data);
  } catch (error) {
    // File doesn't exist or error reading
    return NextResponse.json(
      { success: false, error: "No monitoring data available" },
      { status: 404 }
    );
  }
}
