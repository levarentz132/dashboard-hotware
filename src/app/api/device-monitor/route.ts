import { NextRequest, NextResponse } from "next/server";
import {
  readDeviceMonitorSnapshot,
  writeDeviceMonitorSnapshot,
  type DeviceMonitorSnapshot,
} from "@/lib/device-monitor-store";
import {
  readServerCloudSession,
  saveServerCloudSession,
} from "@/lib/cloud-session-store";

async function syncSessionFromCookie(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("nx_cloud_session")?.value;
    if (sessionCookie) {
      const parsed = JSON.parse(decodeURIComponent(sessionCookie));
      if (parsed?.refreshToken) {
        const existing = await readServerCloudSession();
        if (!existing?.refreshToken) {
          await saveServerCloudSession({
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
            email: parsed.email,
            ownerSystemId: parsed.ownerSystemId,
          });
        }
      }
    }
  } catch (_) {}
}

export async function POST(request: NextRequest) {
  try {
    await syncSessionFromCookie(request);
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

export async function GET(request: NextRequest) {
  try {
    await syncSessionFromCookie(request);
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

