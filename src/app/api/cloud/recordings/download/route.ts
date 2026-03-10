import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const stream = searchParams.get("stream"); // If 'true', proxy the actual video

    if (!systemId || !deviceId || !startTime) {
      return NextResponse.json(
        { error: "systemId, deviceId, and startTime are required" },
        { status: 400 }
      );
    }

    console.log(`[recordings/download] Params: systemId=${systemId}, deviceId=${deviceId}, startTime=${startTime}, endTime=${endTime}, stream=${stream}`);

    // Build download URL params
    const params = new URLSearchParams();
    params.set("pos", startTime);
    if (endTime) {
      const duration = parseInt(endTime) - parseInt(startTime);
      params.set("duration", String(duration));
      console.log(`[recordings/download] Duration: ${duration}ms`);
    }

    const downloadUrl = buildCloudUrl(systemId, `/media/${deviceId}.mp4`, params, request, systemName || undefined);
    console.log(`[recordings/download] Generated URL: ${downloadUrl}`);
    const headers = buildCloudHeaders(request, systemId);

    // If stream=true, proxy the actual video content with auth
    if (stream === "true") {
      console.log(`[recordings/download] Streaming video with auth headers`);
      
      const videoResponse = await fetch(downloadUrl, {
        headers: headers,
      });

      if (!videoResponse.ok) {
        console.error(`[recordings/download] Video fetch failed: ${videoResponse.status}`);
        return NextResponse.json(
          { error: `Video fetch failed: ${videoResponse.status}` },
          { status: videoResponse.status }
        );
      }

      // Generate filename from device ID and timestamp
      const filename = `recording_${deviceId.substring(0, 8)}_${startTime}.mp4`;

      // Stream the response back with proper headers for download
      return new NextResponse(videoResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": videoResponse.headers.get("Content-Length") || "",
        },
      });
    }

    // Return download URL with auth header for client (legacy mode)
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
