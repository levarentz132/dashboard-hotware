import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const stream = searchParams.get("stream");
    const preview = searchParams.get("preview"); // If 'true', serve inline for browser playback

    if (!systemId || !deviceId || !startTime) {
      return NextResponse.json(
        { error: "systemId, deviceId, and startTime are required" },
        { status: 400 }
      );
    }

    console.log(`[recordings/download] Params: systemId=${systemId}, deviceId=${deviceId}, startTime=${startTime}, endTime=${endTime}, stream=${stream}`);

    const isImage = endTime ? parseInt(endTime) === parseInt(startTime as string) : false;

    // Build download URL params
    const params = new URLSearchParams();
    let endpoint = "";
    
    if (isImage) {
      params.set("pos", startTime as string);
      params.set("duration", "1"); // Request minimal duration for a single frame
      endpoint = `/media/${deviceId}.mpjpeg`;
    } else {
      params.set("pos", startTime as string);
      if (endTime) {
        const duration = parseInt(endTime) - parseInt(startTime as string);
        params.set("duration", String(duration));
        console.log(`[recordings/download] Duration: ${duration}ms`);
      }
      endpoint = `/media/${deviceId}.mp4`;
    }

    const username = searchParams.get("username");
    const password = searchParams.get("password");

    const downloadUrl = buildCloudUrl(systemId, endpoint, params, request, systemName || undefined);
    console.log(`[recordings/download] Generated URL: ${downloadUrl}`);
    
    // Explicitly define generic headers type
    const headers: Record<string, string> = buildCloudHeaders(request, systemId);
    if (isImage) {
      headers["Accept"] = "multipart/x-mixed-replace, image/jpeg, image/*";
      delete headers["Content-Type"];
    }

    // If stream=true OR preview=true, proxy the actual video content with auth
    if (stream === "true" || preview === "true") {
      const isPreview = preview === "true";
      console.log(`[recordings/download] ${isPreview ? "Previewing" : "Streaming"} media with auth headers`);

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

      const filename = isImage 
        ? `screenshot_${deviceId.substring(0, 8)}_${startTime}.jpg`
        : `recording_${deviceId.substring(0, 8)}_${startTime}.mp4`;
      
      // Preview: inline so browser plays/shows it. Download: attachment to save file.
      const disposition = isPreview
        ? `inline; filename="${filename}"`
        : `attachment; filename="${filename}"`;

      return new NextResponse(videoResponse.body, {
        status: 200,
        headers: {
          "Content-Type": isImage ? "image/jpeg" : (videoResponse.headers.get("Content-Type") || "video/mp4"),
          "Content-Disposition": disposition,
          "Content-Length": videoResponse.headers.get("Content-Length") || "",
          "Accept-Ranges": "bytes",
        },
      });
    }

    // Embed Basic-auth credentials in the URL so the browser authenticates on redirect
    let redirectUrl = downloadUrl;
    if (username && password) {
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
