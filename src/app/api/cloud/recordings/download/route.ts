import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";
import os from "os";
import { logRecordingEvent } from "@/lib/recording-logger";
import { promisify } from "util";
import { spawn } from "child_process";
import { Readable } from "stream";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// VMS uses self-signed certificates — disable strict TLS validation for server-side fetches
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function GET(request: NextRequest) {
  // Handle HEAD requests (browser pre-flight for video range support)
  const isHead = request.method === "HEAD";
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId")?.replace(/[{}]/g, "");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const stream = searchParams.get("stream");
    const preview = searchParams.get("preview"); // If 'true', serve inline for browser playback
    const autoSave = searchParams.get("autoSave") === "true"; // If 'true', save to disk only — no streaming

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

    // If it's a screenshot (point in time), force a 1s recording to ensure 
    // we get fresh camera data and an updated thumbnail capability.
    if (isImage) {
      params.set("pos", startTime as string);
      params.set("duration", "1");
      params.set("stream", "0"); // Force High Quality (Primary)
      endpoint = `/media/${deviceId}.mp4`;
      // We will now treat this as a short video (1s) instead of a static image
    } else {
      params.set("pos", startTime as string);
      params.set("stream", "0"); // Force High Quality (Primary)
      if (endTime) {
        const durationMs = Math.max(0, parseInt(endTime) - parseInt(startTime as string));
        // NX Witness /media/ endpoint expects duration in SECONDS for mp4/mkv exports
        const durationSec = Math.ceil(durationMs / 1000);
        params.set("duration", String(durationSec));
        params.set("end", endTime as string);
        console.log(`[recordings/download] Timeframe: ${startTime} to ${endTime} (duration: ${durationSec}s)`);
      }
      endpoint = `/media/${deviceId}.mp4`;
    }

    // Force isImage to false if we are now serving the 1s record as requested
    const effectiveIsImage = isImage && endpoint.includes("/image");


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

    // ── AUTO-SAVE ONLY (no streaming) ───────────────────────────────────────
    // Called automatically when a scheduled recording finishes. Encodes and saves
    // the clip to the storage folder, returns JSON. No body is streamed to the client.
    if (autoSave && !effectiveIsImage) {
      console.log(`[recordings/download] AUTO-SAVE triggered for ${deviceId} startTime=${startTime}`);

      let videoResponse: Response;
      try {
        const controller = new AbortController();
        const autoSaveTimeout = setTimeout(() => controller.abort(), 120000); // 2-min timeout for long clips
        videoResponse = await fetch(downloadUrl, { headers, signal: controller.signal });
        clearTimeout(autoSaveTimeout);

        if (!videoResponse.ok || !videoResponse.body) {
          const errText = await videoResponse.text().catch(() => "");
          console.error(`[recordings/download] AUTO-SAVE fetch failed (${videoResponse.status}):`, errText);
          return NextResponse.json({ error: "Auto-save fetch failed", status: videoResponse.status }, { status: 500 });
        }
      } catch (fetchErr: any) {
        console.error("[recordings/download] AUTO-SAVE fetch error:", fetchErr);
        return NextResponse.json({ error: "Auto-save fetch error", details: fetchErr.message }, { status: 500 });
      }

      // Build output path: storagePath/YYYYMMDD/cameraName_YYYYMMDD_HHMMSS.mp4
      let videosBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
      try {
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fs.existsSync(settingsFile)) {
          const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
          if (settings.videoStoragePath) {
            videosBaseDir = settings.videoStoragePath;
          } else if (settings.storagePath) {
            videosBaseDir = settings.storagePath;
          }
        }
      } catch (e) { /* ignore */ }

      const recDate = new Date(parseInt(startTime as string, 10));
      const YYYY = recDate.getFullYear().toString();
      const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
      const DD = recDate.getDate().toString().padStart(2, "0");
      const HH = recDate.getHours().toString().padStart(2, "0");
      const mmP = recDate.getMinutes().toString().padStart(2, "0");
      const SS = recDate.getSeconds().toString().padStart(2, "0");
      const dateFolder = `${YYYY}-${MM}-${DD}`;
      const safeCameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
        .replace(/[<>:"/\\|?*]/g, "_").trim();
      const baseFileName = `${safeCameraName}_${HH}${mmP}${SS}`;

      const saveDir = path.join(videosBaseDir, dateFolder);
      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

      let finalFileName = `${baseFileName}.mp4`;
      let savePath = path.join(saveDir, finalFileName);
      let counter = 1;
      while (fs.existsSync(savePath)) {
        finalFileName = `${baseFileName}_${counter}.mp4`;
        savePath = path.join(saveDir, finalFileName);
        counter++;
      }

      console.log(`[recordings/download] AUTO-SAVE encoding to: ${savePath}`);

      const ffmpegAutoSave = spawn("ffmpeg", [
        "-fflags", "+genpts",
        "-i", "pipe:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-f", "mp4",
        "-y",
        savePath,
      ], { windowsHide: true });

      ffmpegAutoSave.stdin.on("error", (e) => {
        console.error("[recordings/download] AUTO-SAVE FFmpeg stdin error:", e);
      });

      const autoSaveInput = Readable.fromWeb(videoResponse.body as any);
      autoSaveInput.pipe(ffmpegAutoSave.stdin);

      return await new Promise<NextResponse>((resolve) => {
        ffmpegAutoSave.on("close", (code) => {
          if (code !== 0) {
            console.error(`[recordings/download] AUTO-SAVE FFmpeg failed (code ${code})`);
            resolve(NextResponse.json({ error: "FFmpeg failed during auto-save", code }, { status: 500 }));
          } else {
            console.log(`[recordings/download] AUTO-SAVE complete: ${savePath}`);
            logRecordingEvent(`Recording finished successfully: ${safeCameraName}`);
            resolve(NextResponse.json({ success: true, path: savePath, file: finalFileName }));
          }
        });
        ffmpegAutoSave.on("error", (err) => {
          console.error("[recordings/download] AUTO-SAVE FFmpeg spawn error:", err);
          resolve(NextResponse.json({ error: "FFmpeg not found", details: err.message }, { status: 500 }));
        });
      });
    }

    // If stream=true OR preview=true, proxy the actual video content with auth
    if (stream === "true" || preview === "true") {

      const isPreview = preview === "true";
      console.log(`[recordings/download] ${isPreview ? "Previewing" : "Streaming"} media with auth headers`);

      // Forward Range header from browser — REQUIRED for inline video playback
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        headers["Range"] = rangeHeader;
        console.log(`[recordings/download] Forwarding Range header: ${rangeHeader}`);
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
        let errorText = "";
        try { errorText = await videoResponse.text(); } catch (e) { errorText = "Could not read error body"; }
        console.error(`[recordings/download] Video fetch failed: ${videoResponse.status}`, errorText);
        return NextResponse.json(
          { error: `Video fetch failed: ${videoResponse.status}`, details: errorText },
          { status: videoResponse.status }
        );
      }

      const recDate = new Date(parseInt(startTime as string, 10));
      const YYYY = recDate.getFullYear();
      const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
      const DD = recDate.getDate().toString().padStart(2, "0");
      const HH = recDate.getHours().toString().padStart(2, "0");
      const mm = recDate.getMinutes().toString().padStart(2, "0");
      const ss = recDate.getSeconds().toString().padStart(2, "0");
      const timestamp = `${YYYY}${MM}${DD}_${HH}${mm}${ss}`;
      const safeCameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
        .replace(/[<>:"/\\|?*]/g, "_").trim();

      const filename = effectiveIsImage
        ? `${safeCameraName}_${timestamp}.png`
        : `${safeCameraName}_${timestamp}.mp4`;

      // If it's a screenshot, save a local copy to the data folder using date-based structure
      if (effectiveIsImage) {
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
      const finalContentType = effectiveIsImage
        ? (responseContentType && responseContentType.includes("image") ? responseContentType : "image/jpeg")
        : (responseContentType || "video/mp4");

      // FFmpeg REMUXING: For video downloads, use FFmpeg to fix the container metadata.
      // We skip this for previews to ensure instant playback without server-side processing.
      if (!effectiveIsImage && !isPreview && videoResponse.body) {
        console.log(`[recordings/download] Remuxing video via FFmpeg to fix metadata (download)`);

        // Use a temporary file for the output to support -movflags +faststart, 
        // which requires a seekable output (not a pipe).
        const tempId = Math.random().toString(36).substring(7);
        const tempPath = path.join(os.tmpdir(), `fixed_recording_${tempId}.mp4`);

        const ffmpeg = spawn("ffmpeg", [
          "-fflags", "+genpts",
          "-i", "pipe:0",

          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "128k",

          "-movflags", "+faststart", // ✅ important
          "-f", "mp4",
          "-y",                       // overwrite if exists
          tempPath
        ], { windowsHide: true });

        // Avoid process crash on early stdin close
        ffmpeg.stdin.on("error", (e) => {
          console.error("[recordings/download] FFmpeg stdin error:", e);
        });

        const inputStream = Readable.fromWeb(videoResponse.body as any);
        inputStream.pipe(ffmpeg.stdin);

        // Wait for FFmpeg to finish processing the file
        return await new Promise<NextResponse>((resolve) => {
          ffmpeg.on('close', (code) => {
            console.log(`[recordings/download] FFmpeg finished with code ${code}`);

            if (code !== 0) {
              console.error(`[recordings/download] FFmpeg failed with code ${code}`);
              resolve(NextResponse.json({ error: "FFmpeg process failed during conversion", code }, { status: 500 }));
              return;
            }

            // ── AUTO-SAVE: Copy the finished MP4 to the configured storage folder ──
            try {
              // Read storage path from settings.json (same source screenshots use)
              let videosBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
              try {
                const settingsFile = path.join(process.cwd(), "data", "settings.json");
                if (fs.existsSync(settingsFile)) {
                  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
                  if (settings.storagePath) videosBaseDir = settings.storagePath;
                }
              } catch (e) { /* ignore settings read errors */ }

              // Build filename: cameraName_YYYYMMDD_HHMMSS.mp4  (use recording startTime, not wall clock)
              const recDate = startTime ? new Date(parseInt(startTime, 10)) : new Date();
              const YYYY = recDate.getFullYear().toString();
              const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
              const DD = recDate.getDate().toString().padStart(2, "0");
              const HH = recDate.getHours().toString().padStart(2, "0");
              const mm = recDate.getMinutes().toString().padStart(2, "0");
              const SS = recDate.getSeconds().toString().padStart(2, "0");
              const dateFolder = `${YYYY}-${MM}-${DD}`;

              const safeCameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
                .replace(/[<>:"/\\|?*]/g, "_").trim();
              const baseFileName = `${HH}${mm}${SS}`;

              const saveDir = path.join(videosBaseDir, dateFolder, safeCameraName);
              if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

              // Collision detection
              let finalFileName = `${baseFileName}.mp4`;
              let savePath = path.join(saveDir, finalFileName);
              let counter = 1;
              while (fs.existsSync(savePath)) {
                finalFileName = `${baseFileName}_${counter}.mp4`;
                savePath = path.join(saveDir, finalFileName);
                counter++;
              }

              // Fire-and-forget copy — don't block the browser response
              fs.copyFile(tempPath, savePath, (copyErr) => {
                if (copyErr) {
                  console.error("[recordings/download] Auto-save video copy failed:", copyErr);
                } else {
                  console.log(`[recordings/download] Auto-saved video to: ${savePath}`);
                  logRecordingEvent(`Recording finished successfully: ${safeCameraName}`);
                }
              });
            } catch (saveErr) {
              console.error("[recordings/download] Auto-save video error:", saveErr);
            }

            // Stream the fixed file back to the client
            const fileStream = fs.createReadStream(tempPath);

            // Clean up the temp file after it's been sent
            fileStream.on('close', () => {
              fs.unlink(tempPath, (err) => {
                if (err) console.error("[recordings/download] Temp file cleanup error:", err);
              });
            });

            resolve(new NextResponse(Readable.toWeb(fileStream) as any, {
              status: 200,
              headers: {
                "Content-Type": "video/mp4",
                "Content-Disposition": disposition,
                "Cache-Control": "no-cache",
              },
            }));
          });


          ffmpeg.on('error', (err) => {
            console.error("[recordings/download] FFmpeg spawn error:", err);
            // This usually means FFmpeg is not found in the path
            resolve(NextResponse.json({
              error: "FFmpeg process error - verify FFmpeg is installed and in system PATH",
              details: err.message
            }, { status: 500 }));
          });
        });
      }

      // FFmpeg PREVIEW: Stream a fragmented MP4 (fMP4) directly to pipe so Electron/Chromium
      // can start playing immediately from byte 0 without buffering the entire file.
      // Fragmented MP4 uses empty_moov+frag_keyframe which doesn't need +faststart (no seekable output needed).
      // We also re-encode to H.264/AAC to guarantee Electron codec compatibility.
      if (!effectiveIsImage && isPreview && videoResponse.body) {
        console.log(`[recordings/download] Transcoding preview to fragmented MP4 via FFmpeg (pipe)`);

        const ffmpegPreview = spawn("ffmpeg", [
          "-fflags", "+genpts",
          "-i", "pipe:0",

          "-start_at_zero",
          "-avoid_negative_ts", "make_zero",

          "-c:v", "libx264",
          "-preset", "ultrafast",     // Fastest encode – minimise time-to-first-frame
          "-crf", "23",
          "-profile:v", "main",
          "-level", "4.2",
          "-pix_fmt", "yuv420p",

          "-c:a", "aac",
          "-b:a", "128k",

          // Fragmented MP4: moov atom is sent at the very start so playback begins immediately
          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-f", "mp4",
          "pipe:1",                   // Output to stdout (pipe)
        ]);

        ffmpegPreview.stdin.on("error", (e) => {
          console.error("[recordings/download] FFmpeg preview stdin error:", e);
        });
        ffmpegPreview.stderr.on("data", (chunk) => {
          // Only log first stderr chunk to avoid log spam
          console.log("[recordings/download] FFmpeg preview:", chunk.toString().substring(0, 200));
        });

        const previewInput = Readable.fromWeb(videoResponse.body as any);
        previewInput.pipe(ffmpegPreview.stdin);

        return new NextResponse(Readable.toWeb(ffmpegPreview.stdout) as any, {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": disposition,
            "Accept-Ranges": "none",   // fMP4 pipe streams are not seekable
            "Cache-Control": "no-cache, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }


      // Build response headers — pass through Range-related headers from upstream
      const upstreamStatus = videoResponse.status; // May be 206 if upstream honoured range
      const contentRangeHeader = videoResponse.headers.get("Content-Range");
      const contentLengthHeader = videoResponse.headers.get("Content-Length");

      const responseHeaders: Record<string, string> = {
        "Content-Type": finalContentType,
        "Content-Disposition": disposition,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      };
      if (contentLengthHeader) responseHeaders["Content-Length"] = contentLengthHeader;
      if (contentRangeHeader) responseHeaders["Content-Range"] = contentRangeHeader;

      // Use 206 if upstream returned 206 or if client sent a Range header
      const responseStatus = (upstreamStatus === 206 || (rangeHeader && upstreamStatus === 200)) ? 206 : 200;

      return new NextResponse(videoResponse.body, {
        status: responseStatus,
        headers: responseHeaders,
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

// Next.js App Router requires an explicit HEAD export for browsers to negotiate
// Range support before attempting inline video playback.
export async function HEAD(request: NextRequest) {
  return GET(request);
}
