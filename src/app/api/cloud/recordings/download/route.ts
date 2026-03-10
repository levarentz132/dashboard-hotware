import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get("systemId");
    const deviceId = searchParams.get("deviceId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!systemId || !deviceId || !startTime) {
      return NextResponse.json(
        { error: "systemId, deviceId, and startTime are required" },
        { status: 400 }
      );
    }

    // Get VMS credentials from headers or env
    const vmsUsername = request.headers.get("X-VMS-Username") || process.env.NX_USERNAME;
    const vmsPassword = request.headers.get("X-VMS-Password") || process.env.NX_PASSWORD;

    if (!vmsUsername || !vmsPassword) {
      return NextResponse.json(
        { error: "VMS credentials required" },
        { status: 401 }
      );
    }

    const basicAuth = Buffer.from(`${vmsUsername}:${vmsPassword}`).toString("base64");

    // Build download URL
    const params = new URLSearchParams();
    params.set("pos", startTime);
    if (endTime) params.set("duration", String(parseInt(endTime) - parseInt(startTime)));

    const downloadUrl = `https://${systemId}.relay.vmsproxy.com/media/${deviceId}.mp4?${params.toString()}`;

    // Return redirect URL for client to download directly
    return NextResponse.json({
      downloadUrl,
      authHeader: `Basic ${basicAuth}`,
    });
  } catch (error) {
    console.error("[recordings/download] Exception:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
