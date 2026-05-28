import { NextRequest, NextResponse } from "next/server";
import {
  readDeviceMonitorSnapshot,
  writeDeviceMonitorSnapshot,
  type DeviceMonitorSnapshot,
} from "@/lib/device-monitor-store";

export async function POST(request: NextRequest) {
  try {
    const data = (await request.json()) as DeviceMonitorSnapshot;
    await writeDeviceMonitorSnapshot(data);

    return NextResponse.json({
      success: true,
      message: "Device monitor data saved",
      timestamp: data.timestamp,
    });
  } catch (error) {
    console.error("[Device Monitor API] Error saving data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save device monitor data" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const data = await readDeviceMonitorSnapshot();
    if (!data) {
      return NextResponse.json(
        { success: false, error: "No monitoring data available" },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "No monitoring data available" },
      { status: 404 },
    );
  }
}
