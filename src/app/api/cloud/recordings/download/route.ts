import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!systemId || !deviceId || !startTime) {
      return NextResponse.json(
        { error: "systemId, deviceId, and startTime are required" },
        { status: 400 }
      );
    }

    // Build download URL params
    const params = new URLSearchParams();
    params.set("pos", startTime);
    if (endTime) params.set("duration", String(parseInt(endTime) - parseInt(startTime)));

    const downloadUrl = buildCloudUrl(systemId, `/media/${deviceId}.mp4`, params, request, systemName || undefined);
    const headers = buildCloudHeaders(request, systemId);

    // Return download URL with auth header for client
    return NextResponse.json({
      downloadUrl,
      authHeader: headers["Authorization"] || headers["x-runtime-guid"] || "",
    });
  } catch (error) {
    console.error("[recordings/download] Exception:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
