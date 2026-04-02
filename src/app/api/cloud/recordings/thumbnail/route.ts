import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";

/**
 * GET /api/cloud/recordings/thumbnail?systemId=...&deviceId=...&timestampMs=...
 * 
 * Fetches a single frame (PNG) from the VMS at a specific timestamp.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get("systemId");
    const deviceId = searchParams.get("deviceId")?.replace(/[{}]/g, "");
    const timestampMs = searchParams.get("timestampMs");

    if (!systemId || !deviceId || !timestampMs) {
      return NextResponse.json(
        { error: "systemId, deviceId, and timestampMs are required" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.set("format", "png");
    params.set("timestampMs", timestampMs);
    const endpoint = `/rest/v3/devices/${deviceId}/image`;

    const downloadUrl = buildCloudUrl(systemId, endpoint, params, request);
    const headers = buildCloudHeaders(request, systemId);
    headers["Accept"] = "image/png, image/jpeg, image/*;q=0.9, */*;q=0.8";

    let response = await fetch(downloadUrl, { headers });

    // Retry with Basic auth if needed
    if (response.status === 401 || response.status === 403) {
      const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
      if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: basicAuthHeader,
        };
        delete retryHeaders["x-runtime-guid"];
        response = await fetch(downloadUrl, { headers: retryHeaders });
      }
    }

    if (!response.ok) {
        return NextResponse.json({ error: `Image fetch failed: ${response.status}` }, { status: response.status });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[thumbnail] Exception:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
