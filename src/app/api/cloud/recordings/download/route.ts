import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

export async function GET(request: NextRequest) {
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId")?.replace(/[{}]/g, "");
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

    // Standardize screenshot detection: if endTime is missing OR equal to startTime OR duration is 0
    const isImage = !endTime || parseInt(endTime) === parseInt(startTime as string) || (parseInt(endTime) - parseInt(startTime as string)) === 0;

    // Build download URL params
    const params = new URLSearchParams();
    let endpoint = "";
    
    if (isImage) {
      // Use the new v3 image endpoint for precise PNG screenshots as requested
      const isoTime = new Date(parseInt(startTime as string)).toISOString();
      params.set("time", isoTime);
      params.set("format", "png");
      params.set("roundMethod", "precise");
      endpoint = `/rest/v3/devices/${deviceId}/image`;
    } else {
      params.set("pos", startTime as string);
      if (endTime) {
        const duration = Math.max(0, parseInt(endTime) - parseInt(startTime as string));
        params.set("duration", String(duration));
        params.set("end", endTime as string);
        console.log(`[recordings/download] Timeframe: ${startTime} to ${endTime} (duration: ${duration}ms)`);
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
      headers["Accept"] = "image/png, image/jpeg, image/*;q=0.9, */*;q=0.8";
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
        ? `screenshot_${deviceId.substring(0, 8)}_${startTime}.png`
        : `recording_${deviceId.substring(0, 8)}_${startTime}.mp4`;
      
      // If it's a screenshot, save a local copy to the data folder using date-based structure
      if (isImage) {
        try {
          const buffer = await videoResponse.clone().arrayBuffer();
          const now = new Date();
          const YYYY = now.getFullYear().toString();
          const MM = (now.getMonth() + 1).toString().padStart(2, "0");
          const DD = now.getDate().toString().padStart(2, "0");
          const HH = now.getHours().toString().padStart(2, "0");
          const mm = now.getMinutes().toString().padStart(2, "0");
          const SS = now.getSeconds().toString().padStart(2, "0");
          const dateFolder = `${YYYY}${MM}${DD}`;
          const cameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
            .replace(/[<>:"/\\|?*]/g, "_").trim();
          const baseFileName = `${cameraName}_${dateFolder}_${HH}${mm}${SS}`;

          const screenshotsDir = path.join(process.cwd(), "data", "recorded_screenshots", dateFolder);
          if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
          }

          // Collision detection
          let finalFileName = `${baseFileName}.png`;
          let localPath = path.join(screenshotsDir, finalFileName);
          let counter = 1;
          while (fs.existsSync(localPath)) {
            finalFileName = `${baseFileName}_${counter}.png`;
            localPath = path.join(screenshotsDir, finalFileName);
            counter++;
          }

          await writeFile(localPath, Buffer.from(buffer));
          console.log(`[recordings/download] Saved screenshot to: ${localPath}`);
        } catch (saveErr) {
          console.error("[recordings/download] Failed to save local screenshot copy:", saveErr);
        }
      }

      // Preview: inline so browser plays/shows it. Download: attachment to save file.
      const disposition = isPreview
        ? `inline; filename="${filename}"`
        : `attachment; filename="${filename}"`;

      const responseContentType = videoResponse.headers.get("Content-Type");
      const finalContentType = isImage 
        ? (responseContentType && responseContentType.includes("image") ? responseContentType : "image/jpeg")
        : (responseContentType || "video/mp4");

      return new NextResponse(videoResponse.body, {
        status: 200,
        headers: {
          "Content-Type": finalContentType,
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
