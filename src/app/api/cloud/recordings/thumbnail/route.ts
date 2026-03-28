import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId");
    const timeMs = searchParams.get("timeMs");

    if (!systemId || !deviceId || !timeMs) {
      return NextResponse.json(
        { error: "systemId, deviceId, and timeMs are required" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.set("pos", timeMs);
    params.set("duration", "1"); // Request minimal duration for a single frame

    // Using NX Media Engine mpjpeg API as .jpg is reported unavailable
    const endpoint = `/media/${deviceId}.mpjpeg`;
    const cloudUrl = buildCloudUrl(systemId, endpoint, params, request, systemName || undefined);
    console.log(`[thumbnail] Requesting MPJPEG: ${cloudUrl}`);

    const headers = buildCloudHeaders(request, systemId);
    const imageHeaders = { ...headers };
    imageHeaders["Accept"] = "multipart/x-mixed-replace, image/jpeg, image/*";
    delete imageHeaders["Content-Type"];

    let response = await fetch(cloudUrl, {
      method: "GET",
      headers: imageHeaders,
    });

    // Handle authentication retry (similar to download endpoint)
    if (response.status === 401 || response.status === 403) {
      const { getBasicAuthHeaderFromRequest } = await import("@/lib/cloud-api");
      const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
      if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...imageHeaders,
          Authorization: basicAuthHeader,
        };
        delete retryHeaders["x-runtime-guid"];

        console.warn("[thumbnail] Retrying with Basic auth");
        response = await fetch(cloudUrl, {
          method: "GET",
          headers: retryHeaders,
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      const log = `[thumbnail] Error ${response.status} from ${cloudUrl}: ${errorText}\nHeaders: ${JSON.stringify(imageHeaders)}`;
      console.error(log);
      // Write to a tmp file so I can read it
      try {
        const fs = await import("fs");
        fs.appendFileSync("/tmp/thumbnail_error.log", log + "\n");
      } catch (e) {}
      
      return NextResponse.json(
        { error: `Failed to fetch thumbnail: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    console.log(`[thumbnail] Success: Content-Type=${contentType}`);

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[thumbnail] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
