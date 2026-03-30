import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";

// Force ignore SSL errors globally for the local proxy (important for local VMS at 127.0.0.1)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function GET(request: NextRequest) {
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const stream = searchParams.get("stream"); // If 'true', proxy the actual video
    const isPreview = searchParams.get("preview") === "true"; // If 'true', show inline preview
    const token = searchParams.get("token") || searchParams.get("vms_token");

    if (!systemId || !deviceId || !startTime) {
      return NextResponse.json(
        { error: "systemId, deviceId, and startTime are required" },
        { status: 400 }
      );
    }

    console.log(`[recordings/download] Params: systemId=${systemId}, deviceId=${deviceId}, startTime=${startTime}, isPreview=${isPreview}, token=${token ? "provided" : "none"}`);

    // Build download URL params
    const params = new URLSearchParams();
    params.set("pos", startTime);
    if (endTime) {
      const duration = parseInt(endTime) - parseInt(startTime);
      params.set("duration", String(duration));
    }

    const username = searchParams.get("username");
    const password = searchParams.get("password");

    const downloadUrl = buildCloudUrl(systemId, `/media/${deviceId}.mp4`, params, request, systemName || undefined);
    console.log(`[recordings/download] Generated URL: ${downloadUrl}`);
    const headers = buildCloudHeaders(request, systemId);
    
    // Inject token if provided in query params
    if (token) {
        headers["x-runtime-guid"] = token;
        console.log(`[recordings/download] Using provided token from query params`);
    }

    // If stream=true OR isPreview=true, proxy the actual video content with auth
    if (stream === "true" || isPreview) {
      if (isPreview) {
        console.log(`[recordings/download] Previewing media with auth headers`);
      } else {
        console.log(`[recordings/download] Streaming video with auth headers`);
      }

      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 85000);
      
      let videoResponse = await fetch(downloadUrl, {
        headers: headers,
        signal: controller.signal,
      });

      if (videoResponse.status === 401 || videoResponse.status === 403) {
        const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
        if (basicAuthHeader) {
          const retryHeaders: Record<string, string> = {
            ...headers,
            Authorization: basicAuthHeader,
          };
          delete retryHeaders["x-runtime-guid"];

          console.warn("[recordings/download] Retrying media fetch with Basic auth");
          videoResponse = await fetch(downloadUrl, {
            headers: retryHeaders,
            signal: controller.signal,
          });
        }
      }

      if (requestTimeout) {
        clearTimeout(requestTimeout);
        requestTimeout = null;
      }

      if (!videoResponse.ok) {
        console.error(`[recordings/download] Video fetch failed: ${videoResponse.status}`);
        return NextResponse.json(
          { error: `Video fetch failed: ${videoResponse.status}` },
          { status: videoResponse.status }
        );
      }

      // Generate filename from device ID and timestamp
      const filename = `recording_${deviceId.substring(0, 8)}_${startTime}.mp4`;
      const disposition = isPreview ? 'inline' : 'attachment';

      // Stream the response back with proper headers
      return new NextResponse(videoResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `${disposition}; filename="${filename}"`,
          "Content-Length": videoResponse.headers.get("Content-Length") || "",
          "Cache-Control": "public, max-age=3600"
        },
      });
    }

    // Embed credentials in the URL for direct browser access (as a fallback)
    let redirectUrl = downloadUrl;
    if (token) {
        const urlObj = new URL(downloadUrl);
        urlObj.searchParams.set("auth", token);
        redirectUrl = urlObj.toString();
    } else if (username && password) {
      try {
        const urlObj = new URL(downloadUrl);
        urlObj.username = username;
        urlObj.password = password;
        redirectUrl = urlObj.toString();
      } catch {
        // fall back to bare URL
      }
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      console.error("[recordings/download] Upstream timeout");
      return NextResponse.json(
        { error: "Download request timed out", details: "Upstream server did not respond in time" },
        { status: 504 }
      );
    }

    console.error("[recordings/download] Exception:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  } finally {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
    }
  }
}
