import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get("systemId");

    if (!systemId) {
      return NextResponse.json(
        { error: "systemId is required" },
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
    const relayUrl = `https://${systemId}.relay.vmsproxy.com/rest/v3/devices`;

    const response = await fetch(relayUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${basicAuth}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[recordings/devices] Error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch devices: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const devices = await response.json();
    // Filter to cameras only
    const cameras = Array.isArray(devices) 
      ? devices.filter((d: any) => d.typeId === "nx.camera" || d.typeId === "nx.ipcamera")
      : [];

    return NextResponse.json(cameras);
  } catch (error) {
    console.error("[recordings/devices] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 }
    );
  }
}
