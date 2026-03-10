import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get("systemId");
    const deviceId = searchParams.get("deviceId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!systemId || !deviceId) {
      return NextResponse.json(
        { error: "systemId and deviceId are required" },
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

    // Build query params for recorded time periods
    const params = new URLSearchParams();
    params.set("cameraId", deviceId);
    if (startTime) params.set("startTime", startTime);
    if (endTime) params.set("endTime", endTime);
    params.set("detail", "2"); // Get detailed periods

    const relayUrl = `https://${systemId}.relay.vmsproxy.com/ec2/recordedTimePeriods?${params.toString()}`;

    const response = await fetch(relayUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${basicAuth}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[recordings] Error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch recordings: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[recordings] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
