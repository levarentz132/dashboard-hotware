import { NextRequest, NextResponse } from "next/server";
import {
  getDeviceWatchdogStatus,
  startDeviceWatchdog,
  stopDeviceWatchdog,
  runDeviceWatchdogCycle,
} from "@/lib/device-watchdog";
import {
  getValidServerCloudSession,
  saveServerCloudSession,
} from "@/lib/cloud-session-store";

export async function GET() {
  const status = getDeviceWatchdogStatus();
  const session = await getValidServerCloudSession();

  return NextResponse.json({
    ...status,
    hasCloudSession: !!session?.refreshToken,
    authenticatedUser: session?.email || null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "run-once";

    // Allow setting / updating cloud session token directly via API
    if (body.refreshToken) {
      await saveServerCloudSession({
        refreshToken: body.refreshToken,
        email: body.email,
      });
    }

    // Direct username/password login via POST
    if (body.username && body.password) {
      const { loginNxCloudWithPassword } = await import("@/lib/nx-cloud-service");
      const loginData = await loginNxCloudWithPassword(body.username, body.password);
      await saveServerCloudSession({
        accessToken: loginData.access_token,
        refreshToken: loginData.refresh_token,
        email: body.username,
      });
    }

    if (action === "start") {
      const intervalMs = typeof body.intervalMs === "number" ? body.intervalMs : 30000;
      startDeviceWatchdog(intervalMs);
      return NextResponse.json({
        success: true,
        message: `Watchdog started with ${intervalMs / 1000}s interval`,
        status: getDeviceWatchdogStatus(),
      });
    }

    if (action === "stop") {
      stopDeviceWatchdog();
      return NextResponse.json({
        success: true,
        message: "Watchdog stopped",
        status: getDeviceWatchdogStatus(),
      });
    }

    if (action === "run-once" || action === "check-now") {
      const snapshot = await runDeviceWatchdogCycle();
      return NextResponse.json({
        success: true,
        message: "Monitoring cycle executed",
        status: getDeviceWatchdogStatus(),
        snapshot,
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use 'start', 'stop', or 'run-once'." },
      { status: 400 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process watchdog request" },
      { status: 500 },
    );
  }
}
